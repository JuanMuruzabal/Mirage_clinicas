package http

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// Presencia de colaboradores (Fase 3.2.5) — quién está trabajando ahora
// en esta clínica.
//
// EL PLAN LA PONÍA EN LA 3.2.8 y la describía como "una decisión de
// transporte" (WebSocket / SSE / polling) que además chocaba con que hoy
// corre una sola instancia del backend. Resultó no hacer falta nada de
// eso: `sessions` YA guarda `last_seen_at` y, desde la 3.2.3, también
// `clinic_id` — la clínica elegida en esa sesión. Con esas dos columnas,
// "quién está en esta clínica ahora" es una query, no una topología.
//
// Lo que se gana por escribirlo así:
//
//   - **Cero tablas nuevas y cero infraestructura.** No hay servidor de
//     sockets, ni canal, ni proceso aparte que mantener vivo.
//   - **Funciona con N instancias del backend**, que es justamente lo que
//     bloqueaba la decisión: el estado compartido ya vive en Postgres, no
//     en la memoria de un proceso. Es el mismo motivo por el que la
//     sesión y el rate-limiting viven ahí (CLAUDE.md, "BFF con Server
//     Actions").
//   - **Se degrada solo.** Si el navegador deja de pedir, la presencia
//     envejece y la persona pasa a "hace un rato". No hay que detectar
//     una desconexión: no hay conexión que detectar.
//
// Lo que se pierde respecto de un socket, dicho explícitamente: la
// presencia no es instantánea. Alguien que cierra la pestaña sigue
// apareciendo en línea hasta que vence el umbral. Para "¿quién está
// atendiendo hoy?" —que es la pregunta del brief— eso alcanza; para un
// indicador de "está escribiendo" no alcanzaría, y ese caso no existe.
const (
	// PresenciaEnLinea — cuánto vale un latido antes de que la persona
	// pase a "hace un rato".
	//
	// Son 5 minutos y no menos por una razón del modelo, no por gusto:
	// `last_seen_at` se reescribe con un throttle de 5 minutos
	// (auth.lastSeenThrottle), así que la actividad NORMAL de alguien que
	// está usando la app puede tener hasta esa antigüedad. Un umbral más
	// corto marcaría como ausente a quien está trabajando, solo que en
	// una pantalla que no late.
	PresenciaEnLinea = 5 * time.Minute

	// PresenciaLatido — cada cuánto vuelve a preguntar el panel abierto.
	// Lo decide el backend y no el frontend para que el intervalo y el
	// umbral no puedan quedar desalineados en dos archivos distintos.
	PresenciaLatido = 60 * time.Second
)

type presenciaMiembroResponse struct {
	UserID string `json:"userId"`
	// UltimaActividad es nil para quien no tiene ninguna sesión viva en
	// esta clínica. Se manda el instante y no un booleano "en línea" a
	// propósito: el frontend muestra "hace 20 min", y un booleano lo
	// obligaría a pedir de nuevo para saber cuánto.
	UltimaActividad *time.Time `json:"ultimaActividad"`
	EnLinea         bool       `json:"enLinea"`
}

type presenciaResponse struct {
	Miembros []presenciaMiembroResponse `json:"miembros"`
	// Los dos números que gobiernan la pantalla, servidos por quien los
	// decide. En segundos porque el JSON no tiene tipo de duración.
	EnLineaSegundos int `json:"enLineaSegundos"`
	LatidoSegundos  int `json:"latidoSegundos"`
}

// presenciaDeLaClinica devuelve, por usuario, la última actividad de sus
// sesiones VIVAS en esta clínica.
//
// Vivas y de ESTA clínica: una sesión revocada (cerró sesión), vencida, o
// que eligió otra clínica no dice nada sobre quién está acá. Es la misma
// condición que usa membresiaDeLaSesion para decidir dónde está parada
// una sesión, y por eso alguien con dos clínicas abiertas en dos pestañas
// aparece en línea en las dos, que es lo correcto.
func presenciaDeLaClinica(gdb *gorm.DB, clinicID uuid.UUID) map[uuid.UUID]time.Time {
	type fila struct {
		UserID uuid.UUID
		Ultimo time.Time
	}
	var filas []fila
	_ = gdb.Model(&db.Session{}).
		Select("user_id, MAX(last_seen_at) AS ultimo").
		Where("clinic_id = ? AND revoked_at IS NULL AND expires_at > ?", clinicID, time.Now()).
		Group("user_id").
		Scan(&filas).Error

	porUsuario := make(map[uuid.UUID]time.Time, len(filas))
	for _, f := range filas {
		porUsuario[f.UserID] = f.Ultimo
	}
	return porUsuario
}

// presenciaHandler — GET /equipo/presencia. Es el latido Y la lectura en
// la misma llamada: el panel abierto pregunta "¿quién está?" y, por el
// hecho de preguntar, avisa que él también.
func presenciaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		// El latido propio, ANTES de leer, para que la respuesta incluya
		// a quien pregunta — si no, el panel se vería a sí mismo ausente
		// hasta el siguiente ciclo.
		//
		// Saltea a propósito el throttle de 5 minutos de
		// auth.TouchSession: ese existe para que no haya un UPDATE por
		// cada request de la app, y acá el ritmo lo fija este endpoint —
		// una escritura por minuto y por panel abierto, acotada y
		// deliberada, no una por click.
		if session, hay := sessionFromContext(r); hay {
			_ = gdb.Model(&db.Session{}).
				Where("id = ?", session.ID).
				Update("last_seen_at", time.Now()).Error
		}

		var miembros []db.ClinicMember
		if err := gdb.Where("clinic_id = ? AND status = ?", clinicID, db.ClinicMemberStatusActive).
			Order("created_at").Find(&miembros).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo leer el equipo")
			return
		}

		ultimaPorUsuario := presenciaDeLaClinica(gdb, clinicID)
		corte := time.Now().Add(-PresenciaEnLinea)

		resp := presenciaResponse{
			Miembros:        []presenciaMiembroResponse{},
			EnLineaSegundos: int(PresenciaEnLinea.Seconds()),
			LatidoSegundos:  int(PresenciaLatido.Seconds()),
		}
		for _, miembro := range miembros {
			fila := presenciaMiembroResponse{UserID: miembro.UserID.String()}
			if ultima, hay := ultimaPorUsuario[miembro.UserID]; hay {
				copia := ultima
				fila.UltimaActividad = &copia
				fila.EnLinea = ultima.After(corte)
			}
			resp.Miembros = append(resp.Miembros, fila)
		}

		writeJSON(w, http.StatusOK, resp)
	}
}
