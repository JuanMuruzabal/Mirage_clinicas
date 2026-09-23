package http

import (
	"errors"
	"net/http"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// El wizard público con N profesionales (Fase 3.2.7).
//
// Hasta acá el formulario público asumía una clínica de un solo
// odontólogo: listaba TODOS los tipos de consulta de la clínica y
// asignaba el turno al owner. Con dos profesionales eso daba dos cosas
// mal a la vez — "Consulta general" aparecía repetida (una fila por
// profesional, TR-145) y el turno caía siempre en la agenda del titular,
// atendiera él o no.
//
// El orden que pidió el cliente es: **primero el tipo de consulta,
// después quién lo atiende**. Es el orden real de la decisión de un
// paciente ("necesito una limpieza" viene antes que "con quién"), y
// además es el único que se puede resolver: el tipo determina la
// duración, y la duración es lo que define los huecos.
//
// De ahí la regla que también pidió: **un tipo que no ofrece ningún
// profesional no se muestra.** Ofrecerlo llevaría a una pantalla sin
// nadie a quien elegir, que es un callejón sin salida.

// errTipoNoAtendido / errProfesionalInvalido — los dos rechazos del paso
// "¿con quién?". Separados porque dicen cosas distintas: uno es un dato
// mal formado, el otro una combinación que no existe (el profesional no
// atiende ese tipo, o ya no está en la clínica).
var (
	errTipoNoAtendido      = errors.New("ese profesional no atiende ese tipo de consulta")
	errProfesionalInvalido = errors.New("el profesional elegido no es válido")
)

// profesionalesQueAtienden — los miembros ACTIVOS con rol `profesional`.
//
// No alcanza con "tiene tipos de consulta cargados": alguien a quien
// sacaron del equipo conserva sus filas (la membresía se marca
// `removed`, nunca se borra — la FK de turnos lo exige), y sus tipos
// seguirían apareciendo en la página pública de una clínica donde ya no
// atiende.
func profesionalesQueAtienden(gdb *gorm.DB, clinicID uuid.UUID) (map[uuid.UUID]bool, error) {
	var miembros []db.ClinicMember
	if err := gdb.Scopes(db.ConRol(db.RoleProfesional)).
		Where("clinic_id = ? AND status = ?", clinicID, db.ClinicMemberStatusActive).
		Find(&miembros).Error; err != nil {
		return nil, err
	}
	activos := make(map[uuid.UUID]bool, len(miembros))
	for _, m := range miembros {
		activos[m.UserID] = true
	}
	return activos, nil
}

// tiposOfrecidosEnLaClinica — los tipos de consulta que la clínica
// realmente ofrece al público, agrupados por NOMBRE.
//
// Agrupados y no listados tal cual porque un tipo ES su nombre (TR-145):
// si Ana y Beto tienen cada uno su "Consulta general", el paciente tiene
// que ver UNA opción, no dos idénticas que además no sabría distinguir
// —difieren en color y duración, que son configuración interna de cada
// agenda—.
//
// Quedan afuera los tipos sin dueño (las filas anteriores a la 3.2.1,
// que nadie atiende) y los de quien ya no es profesional activo de la
// clínica.
func tiposOfrecidosEnLaClinica(gdb *gorm.DB, clinicID uuid.UUID) (map[string][]db.TipoConsulta, error) {
	activos, err := profesionalesQueAtienden(gdb, clinicID)
	if err != nil {
		return nil, err
	}

	var tipos []db.TipoConsulta
	if err := gdb.Where("clinic_id = ?", clinicID).Order("nombre").Find(&tipos).Error; err != nil {
		return nil, err
	}

	porNombre := make(map[string][]db.TipoConsulta, len(tipos))
	for _, t := range tipos {
		if t.UserID == nil || !activos[*t.UserID] {
			continue
		}
		porNombre[normalizarNombreTipo(t.Nombre)] = append(porNombre[normalizarNombreTipo(t.Nombre)], t)
	}
	return porNombre, nil
}

// tipoConsultaPublicoResponse — lo que el wizard necesita para el primer
// paso: una lista de nombres.
//
// Ya no lleva `id` ni `duracionMinutos`, y el cambio no es cosmético: con
// N profesionales, **no existe** un id ni una duración del tipo — existe
// el de cada uno. La duración aparece recién en la tarjeta del
// profesional, que es donde pasa a ser cierta.
type tipoConsultaPublicoResponse struct {
	Nombre string `json:"nombre"`
	// Profesionales — cuántos lo ofrecen. La pantalla lo usa para saber si
	// hay algo que elegir: con uno solo no tiene sentido pedir que elija.
	Profesionales int `json:"profesionales"`
}

// listTiposConsultaPublicoHandler — GET /clinicas/{slug}/tipos-consulta.
func listTiposConsultaPublicoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinic, ok := clinicaPorSlug(gdb, w, r)
		if !ok {
			return
		}

		porNombre, err := tiposOfrecidosEnLaClinica(gdb, clinic.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los tipos de consulta")
			return
		}

		// CON ENLACE, solo los tipos de quien lo generó.
		//
		// El enlace ya decide con quién es el turno, así que ofrecer un
		// tipo que esa persona no atiende sería mandar al paciente contra
		// una pared: elegiría "Ortodoncia" y recién al confirmar se
		// enteraría de que ahí no la atiende nadie.
		// Solo con un enlace PROPIO: si se generó para todos, los tipos
		// son los de la clínica entera, igual que en la página pública.
		if token := strings.TrimSpace(r.URL.Query().Get("enlaceToken")); token != "" {
			if enlace, err := buscarEnlaceTurnoVigente(gdb, clinic.ID, token); err == nil &&
				enlace.UserID != nil && !enlace.ParaTodosLosProfesionales {
				soloSuyos := make(map[string][]db.TipoConsulta, len(porNombre))
				for clave, filas := range porNombre {
					for _, t := range filas {
						if t.UserID != nil && *t.UserID == *enlace.UserID {
							soloSuyos[clave] = []db.TipoConsulta{t}
						}
					}
				}
				porNombre = soloSuyos
			}
		}

		out := make([]tipoConsultaPublicoResponse, 0, len(porNombre))
		for _, filas := range porNombre {
			// El nombre que se muestra es el de la primera fila por orden
			// alfabético (la query ya viene ordenada): si dos profesionales
			// lo escribieron distinto —"Consulta General" y "consulta
			// general"— hay que elegir uno, y elegirlo por una regla fija
			// es lo que hace que la lista no cambie de una carga a otra.
			out = append(out, tipoConsultaPublicoResponse{
				Nombre:        filas[0].Nombre,
				Profesionales: len(filas),
			})
		}
		sort.Slice(out, func(i, j int) bool { return out[i].Nombre < out[j].Nombre })
		writeJSON(w, http.StatusOK, out)
	}
}

// profesionalPublicoResponse — una tarjeta de "¿con quién te atendés?".
//
// Lleva el `tipoConsultaId` DE ESE PROFESIONAL: es el que después van a
// usar la disponibilidad y el alta del turno. Sin él, el frontend tendría
// que mandar el nombre del tipo y el backend resolver la fila en cada
// llamada — y esa resolución por nombre es justo el lugar donde dos
// profesionales que lo escribieron distinto se vuelven un problema.
type profesionalPublicoResponse struct {
	UserID          string `json:"userId"`
	Nombre          string `json:"nombre"`
	TipoConsultaID  string `json:"tipoConsultaId"`
	DuracionMinutos int    `json:"duracionMinutos"`
	// ProximoDisponible — el primer día con un hueco libre (YYYY-MM-DD), o
	// vacío si no hay ninguno dentro de la ventana que se mira.
	//
	// Es el "indicador de proximidad" del brief, y es lo que vuelve real
	// la elección: entre dos nombres que el paciente no conoce, con qué
	// rapidez lo atienden es casi siempre el criterio que usa.
	ProximoDisponible string `json:"proximoDisponible,omitempty"`
}

// diasQueSeMiranParaLaProximidad — cuántos días hacia adelante se escanea
// buscando el primer hueco de cada profesional.
//
// 30 y no "hasta encontrar": este endpoint es PÚBLICO y sin sesión, y
// cada día mirado es una consulta por profesional. Con el tope, el peor
// caso de una clínica de cinco es del mismo orden que
// /disponibilidad-mes, que ya escanea hasta 31 días sin autenticar. Sin
// tope, una agenda vacía haría trabajar al servidor indefinidamente por
// request.
//
// Que un profesional no tenga hueco en 30 días es información útil por sí
// misma: la tarjeta lo dice en vez de mentir con una fecha lejana.
const diasQueSeMiranParaLaProximidad = 30

// primerDiaConHueco — el primer día, desde hoy, en que este profesional
// tiene al menos un horario libre para ese tipo de consulta.
func primerDiaConHueco(gdb *gorm.DB, clinicID, profesionalID uuid.UUID, tipo db.TipoConsulta) string {
	hoy := clock.Today()
	// Las reglas de la agenda y los turnos de TODA la ventana, de una
	// (ronda de optimización post-Fase 3, 2026-09-23). Antes cada día de
	// los 30 pedía de nuevo el horario de atención, los horarios
	// reservados, el catálogo de tipos y sus turnos: 150 consultas por
	// profesional en el peor caso —una agenda llena, que es justo cuando
	// hay que recorrer la ventana entera—, y este endpoint corre una vez
	// por cada profesional que atiende el tipo. Es público y sin sesión.
	reglas, err := cargarReglasDeRango(gdb, clinicID, profesionalID,
		hoy, hoy.AddDate(0, 0, diasQueSeMiranParaLaProximidad))
	if err != nil {
		return ""
	}
	for d := 0; d < diasQueSeMiranParaLaProximidad; d++ {
		fecha := hoy.AddDate(0, 0, d)
		slots, err := calcularDisponibilidadConReglas(gdb, reglas, clinicID, profesionalID, tipo, fecha, nil)
		if err != nil {
			return ""
		}
		if len(slots) > 0 {
			return fecha.Format("2006-01-02")
		}
	}
	return ""
}

// listProfesionalesPublicoHandler — GET
// /clinicas/{slug}/profesionales?tipo=<nombre>: quiénes atienden ese tipo
// de consulta.
//
// El filtro es obligatorio a propósito. "Los profesionales de la clínica"
// sin más no es una pregunta que el wizard haga nunca, y contestarla
// convertiría este endpoint en un directorio público del equipo —
// información que hoy solo se ve desde adentro.
func listProfesionalesPublicoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinic, ok := clinicaPorSlug(gdb, w, r)
		if !ok {
			return
		}

		nombreTipo := strings.TrimSpace(r.URL.Query().Get("tipo"))
		if nombreTipo == "" {
			writeError(w, http.StatusBadRequest, "el tipo de consulta es obligatorio")
			return
		}

		porNombre, err := tiposOfrecidosEnLaClinica(gdb, clinic.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los profesionales")
			return
		}
		filas := porNombre[normalizarNombreTipo(nombreTipo)]
		if len(filas) == 0 {
			// 404 y no una lista vacía: un tipo que nadie ofrece no existe
			// para el público, y la diferencia importa — con 200 y lista
			// vacía la pantalla no sabe si el tipo desapareció o si todos
			// están de licencia.
			writeError(w, http.StatusNotFound, "ese tipo de consulta no lo atiende nadie en esta clínica")
			return
		}

		nombres := nombresPublicosDeProfesionales(gdb, filas)
		out := make([]profesionalPublicoResponse, 0, len(filas))
		for _, t := range filas {
			out = append(out, profesionalPublicoResponse{
				UserID:            t.UserID.String(),
				Nombre:            nombres[*t.UserID],
				TipoConsultaID:    t.ID.String(),
				DuracionMinutos:   t.DuracionMinutos,
				ProximoDisponible: primerDiaConHueco(gdb, clinic.ID, *t.UserID, t),
			})
		}
		// Primero quien antes puede atender — es el criterio con el que el
		// paciente va a elegir de todos modos, y dejarlo cuarto en la lista
		// solo lo obliga a comparar a mano. Los que no tienen hueco en la
		// ventana van al final; entre iguales, alfabético, para que la
		// lista no baile entre dos cargas.
		sort.SliceStable(out, func(i, j int) bool {
			a, b := out[i].ProximoDisponible, out[j].ProximoDisponible
			if (a == "") != (b == "") {
				return a != ""
			}
			if a != b {
				return a < b
			}
			return out[i].Nombre < out[j].Nombre
		})
		writeJSON(w, http.StatusOK, out)
	}
}

// nombresPublicosDeProfesionales — cómo se nombra a un profesional EN LA
// PÁGINA PÚBLICA.
//
// Deliberadamente distinto de nombresDeLosMiembros, que cae al mail
// cuando no hay perfil cargado: eso está bien dentro del panel, entre
// colegas de la misma clínica, y sería publicar la dirección de correo de
// una persona en una página abierta a internet.
//
// En la práctica el caso no se da —sumarse como `profesional` exige
// matrícula, y eso pasa por el perfil— pero el fallback tiene que ser
// seguro igual, porque de lo contrario el día que aparezca una fila rara
// el error es irreversible: ya se publicó.
func nombresPublicosDeProfesionales(gdb *gorm.DB, tipos []db.TipoConsulta) map[uuid.UUID]string {
	ids := make([]uuid.UUID, 0, len(tipos))
	for _, t := range tipos {
		if t.UserID != nil {
			ids = append(ids, *t.UserID)
		}
	}
	nombres := make(map[uuid.UUID]string, len(ids))
	if len(ids) == 0 {
		return nombres
	}
	var perfiles []db.ProfessionalProfile
	_ = gdb.Where("user_id IN ?", ids).Find(&perfiles).Error
	for _, p := range perfiles {
		if n := strings.TrimSpace(p.Nombre + " " + p.Apellido); n != "" {
			nombres[p.UserID] = n
		}
	}
	for _, id := range ids {
		if nombres[id] == "" {
			nombres[id] = "Profesional de la clínica"
		}
	}
	return nombres
}

// nombrePublicoDelProfesional — lo mismo que nombresPublicosDeProfesionales
// para una sola persona: el nombre del perfil, y si no hay, un rótulo
// genérico. NUNCA el mail. Es el que usan los mensajes de error del
// wizard, que también se leen en una página abierta a internet — hasta
// la revisión del 2026-09-23 usaban `nombreDelProfesional`, pensado para
// el panel, que sí cae al mail.
func nombrePublicoDelProfesional(tx *gorm.DB, userID *uuid.UUID) string {
	if userID == nil {
		return "Profesional de la clínica"
	}
	var perfil db.ProfessionalProfile
	if err := tx.First(&perfil, "user_id = ?", *userID).Error; err == nil {
		if n := strings.TrimSpace(perfil.Nombre + " " + perfil.Apellido); n != "" {
			return n
		}
	}
	return "Profesional de la clínica"
}

// profesionalPublicoElegido — valida el profesional que el wizard mandó y
// devuelve su fila del tipo de consulta.
//
// Las dos cosas juntas y no por separado porque la pregunta real es una
// sola: "¿este profesional atiende este tipo de consulta acá?". Aceptar
// un profesional que no lo atiende dejaría entrar un turno con la
// duración de otro, y aceptar un tipo de otro profesional lo dejaría
// entrar en la agenda equivocada.
func profesionalPublicoElegido(
	gdb *gorm.DB, clinicID uuid.UUID, profesionalID uuid.UUID, nombreTipo string,
) (db.TipoConsulta, bool) {
	porNombre, err := tiposOfrecidosEnLaClinica(gdb, clinicID)
	if err != nil {
		return db.TipoConsulta{}, false
	}
	for _, t := range porNombre[normalizarNombreTipo(nombreTipo)] {
		if t.UserID != nil && *t.UserID == profesionalID {
			return t, true
		}
	}
	return db.TipoConsulta{}, false
}

// clinicaPorSlug — resuelve la clínica pública y escribe el 404 si no
// existe. Repetido en cada handler público antes de esto.
func clinicaPorSlug(gdb *gorm.DB, w http.ResponseWriter, r *http.Request) (db.Clinic, bool) {
	slug := chi.URLParam(r, "slug")
	var clinic db.Clinic
	if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
		writeError(w, http.StatusNotFound, "clínica no encontrada")
		return db.Clinic{}, false
	}
	return clinic, true
}

// tipoPublicoDelPedido — la fila de tipo de consulta con la que hay que
// trabajar en un pedido público, y el profesional que la atiende.
//
// Resuelve los tres caminos que puede tomar un turno público, en este
// orden:
//
//  1. Con ENLACE **propio**, el profesional que lo generó. Su
//     "+ Agregar turno > Compartir link" existe para llenar SU agenda;
//     que el paciente eligiera a otro desde ahí sería ignorar para qué se
//     compartió. Si el enlace se generó "para todos los profesionales"
//     (Fase 3.2.7b) no manda nadie: decide el paciente, como entrando por
//     la página pública.
//  2. Con profesional elegido, ese — validado contra el tipo.
//  3. Sin ninguno de los dos, el owner. Es el caso de una clínica de una
//     sola persona, donde el wizard no pregunta nada.
//
// El caso 1 arregla de paso un error que estaba desde la 3.2.5: los
// horarios que se ofrecían eran los del OWNER aunque el enlace fuera de
// un colega, y el turno después entraba en la agenda del colega. Se
// mostraban los huecos de uno y se agendaba con otro.
func tipoPublicoDelPedido(
	gdb *gorm.DB, clinicID uuid.UUID, enlaceToken, profesionalIDStr, nombreTipo string,
) (db.TipoConsulta, uuid.UUID, error) {
	if enlaceToken != "" {
		if enlace, err := buscarEnlaceTurnoVigente(gdb, clinicID, enlaceToken); err == nil &&
			enlace.UserID != nil && !enlace.ParaTodosLosProfesionales {
			tipo, ok := profesionalPublicoElegido(gdb, clinicID, *enlace.UserID, nombreTipo)
			if !ok {
				return db.TipoConsulta{}, uuid.Nil, errTipoNoAtendido
			}
			return tipo, *enlace.UserID, nil
		}
	}

	if profesionalIDStr != "" {
		profesionalID, err := uuid.Parse(profesionalIDStr)
		if err != nil {
			return db.TipoConsulta{}, uuid.Nil, errProfesionalInvalido
		}
		tipo, ok := profesionalPublicoElegido(gdb, clinicID, profesionalID, nombreTipo)
		if !ok {
			return db.TipoConsulta{}, uuid.Nil, errTipoNoAtendido
		}
		return tipo, profesionalID, nil
	}

	owner, err := db.OwnerDeLaClinica(gdb, clinicID)
	if err != nil {
		return db.TipoConsulta{}, uuid.Nil, err
	}
	tipo, ok := profesionalPublicoElegido(gdb, clinicID, owner, nombreTipo)
	if !ok {
		return db.TipoConsulta{}, uuid.Nil, errTipoNoAtendido
	}
	return tipo, owner, nil
}

// writeDisponibilidadPublicaError — los rechazos de tipoPublicoDelPedido,
// traducidos.
//
// 404 y no 400 para una combinación que no existe: desde afuera, un tipo
// que nadie atiende y un profesional que ya no está en la clínica son la
// misma cosa —no hay a quién pedirle ese turno— y distinguirlos en la
// respuesta contaría algo del equipo a quien solo está probando ids.
func writeDisponibilidadPublicaError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errProfesionalInvalido):
		writeError(w, http.StatusBadRequest, "el profesional elegido no es válido")
	case errors.Is(err, errTipoNoAtendido):
		writeError(w, http.StatusNotFound, "ese tipo de consulta no está disponible en esta clínica")
	default:
		writeError(w, http.StatusInternalServerError, "no se pudo resolver el profesional de la clínica")
	}
}
