package http

import (
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// pacienteEstaVerificado — Fase 2.4.1 (`docs/FASE 2.4 - detallada y bien
// especificada.docx`): "un paciente es verificado si y sólo si tiene AL
// MENOS 1 TURNO RESUELTO y ASISTIDO" — O si la ficha la creó el propio
// profesional a mano (corrección de QA: `Paciente.Origen == "manual"`,
// "+ Agregar paciente"/"Agregar turno" con paciente nuevo — el
// profesional ya vio a esa persona, no hace falta esperar un turno
// resuelto para confiar en el DNI). El primer criterio se calcula al
// vuelo con una query, nunca una columna aparte — mismo criterio que
// "resuelto" en el resto del código (TR-074 en docs/tradeoffs.md).
// Recibe el `db.Paciente` completo (no solo el ID) porque necesita su
// Origen — todos los callers ya lo tienen cargado.
func pacienteEstaVerificado(tx *gorm.DB, paciente db.Paciente) (bool, error) {
	if paciente.Origen == "manual" {
		return true, nil
	}
	var count int64
	err := tx.Model(&db.Turno{}).
		Where("paciente_id = ? AND estado = 'agendado' AND hora_fin < now() AND asistencia = 'asistio'", paciente.ID).
		Limit(1).
		Count(&count).Error
	return count > 0, err
}

// pacientesVerificadosIDs — mismo criterio que pacienteEstaVerificado,
// pero para TODOS los pacientes de un profesional en dos queries (nunca
// una por fila) — la tabla de Pacientes (listPacientesHandler,
// pacientes.go) necesita el estado de cada fila.
func pacientesVerificadosIDs(tx *gorm.DB, profesionalID uuid.UUID) (map[uuid.UUID]bool, error) {
	var ids []uuid.UUID
	err := tx.Model(&db.Turno{}).
		Where(
			"profesional_id = ? AND estado = 'agendado' AND hora_fin < now() AND asistencia = 'asistio' AND paciente_id IS NOT NULL",
			profesionalID,
		).
		Distinct("paciente_id").
		Pluck("paciente_id", &ids).Error
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]bool, len(ids))
	for _, id := range ids {
		out[id] = true
	}

	var manualIDs []uuid.UUID
	if err := tx.Model(&db.Paciente{}).
		Where("profesional_id = ? AND origen = 'manual'", profesionalID).
		Pluck("id", &manualIDs).Error; err != nil {
		return nil, err
	}
	for _, id := range manualIDs {
		out[id] = true
	}
	return out, nil
}

// pacientesVerificadosQuery — mismo criterio que pacienteEstaVerificado/
// pacientesVerificadosIDs de arriba, pero como subquery SQL en vez de un
// mapa en memoria — corrección de seguridad (Fase 2.4.1, visibilidad para
// el profesional): el filtro `?verificacion=` de listTurnosHandler
// (turnos.go) necesita componerlo dentro de un `WHERE paciente_id IN
// (...)`/`NOT IN (...)`, sin caer en el caso límite de GORM con un slice
// Go vacío (un `NOT IN` armado a partir de `[]uuid.UUID{}` se traduce a
// `NOT IN (NULL)`, que en SQL da UNKNOWN y descarta TODAS las filas,
// incluidas las que sí son "sin verificar") — acá se evalúa contra una
// subquery real, que si no encuentra ningún paciente verificado
// simplemente da 0 filas, el comportamiento correcto.
func pacientesVerificadosQuery(gdb *gorm.DB, profesionalID uuid.UUID) *gorm.DB {
	turnosAsistidos := gdb.Model(&db.Turno{}).Select("paciente_id").
		Where("paciente_id IS NOT NULL AND estado = 'agendado' AND hora_fin < now() AND asistencia = 'asistio'")
	return gdb.Model(&db.Paciente{}).Select("id").
		Where("profesional_id = ? AND (origen = 'manual' OR id IN (?))", profesionalID, turnosAsistidos)
}

// borrarPacienteNoVerificadoSiSinHistorialReal — Fase 2.4.1, regla pedida
// textualmente por el cliente, ampliada en la corrección de QA: una ficha
// que llegó por el formulario público (nunca una creada a mano — esas
// están VERIFICADAS de entrada, ver pacienteEstaVerificado) deja de tener
// motivo para existir apenas ningún turno suyo puede "salvarla" — ni uno
// agendado a futuro, ni uno resuelto y asistido. En ese punto TODOS sus
// turnos son, o bien `cancelada`, o bien resueltos con asistencia
// "ausente": ni un cliente real que canceló y no reprogramó, ni un
// impostor que nunca demostró ser quien dice ser, tienen una ficha que
// valga la pena conservar.
//
// Se llama DESPUÉS de dos eventos — marcar "ausente" en un turno ya
// resuelto (marcarAsistenciaHandler) y cancelar un turno
// (cancelarTurnoHandler) — porque los dos pueden ser el último turno que
// todavía "salvaba" a la ficha. Ningún turno se borra nunca (quedan como
// registro histórico real, sin ninguna FK que obligue otra cosa) — solo
// se desvinculan (`paciente_id = NULL`) antes de borrar la ficha. Devuelve
// si de verdad borró algo, para que el caller pueda reflejarlo en la
// respuesta.
func borrarPacienteNoVerificadoSiSinHistorialReal(tx *gorm.DB, pacienteID uuid.UUID) (bool, error) {
	var paciente db.Paciente
	if err := tx.First(&paciente, "id = ?", pacienteID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Ya no existe (otro camino la borró en la misma transacción,
			// o entre el UPDATE de asistencia y este chequeo) — nada que
			// hacer.
			return false, nil
		}
		return false, err
	}
	verificado, err := pacienteEstaVerificado(tx, paciente)
	if err != nil {
		return false, err
	}
	if verificado {
		return false, nil
	}

	var turnos []db.Turno
	if err := tx.Where("paciente_id = ?", pacienteID).Find(&turnos).Error; err != nil {
		return false, err
	}
	for _, t := range turnos {
		activo := t.Estado == "agendado" && (t.HoraFin == nil || t.HoraFin.After(time.Now()))
		resueltoAsistido := t.Estado == "agendado" && t.Asistencia != nil && *t.Asistencia == "asistio"
		if activo || resueltoAsistido {
			// Todavía hay un turno pendiente, o uno que ya la verificaría
			// (no debería pasar sin que pacienteEstaVerificado ya haya
			// dado true, pero la condición queda explícita por las dudas)
			// — no se borra.
			return false, nil
		}
	}

	if err := tx.Exec("UPDATE turnos SET paciente_id = NULL WHERE paciente_id = ?", pacienteID).Error; err != nil {
		return false, err
	}
	if err := tx.Delete(&db.Paciente{}, "id = ?", pacienteID).Error; err != nil {
		return false, err
	}
	return true, nil
}

// pacienteRespondeAlMail — Fase 2.4.1: ¿esta ficha de paciente puede
// verificarse con este mail? Chequea el mail principal (Paciente.Email)
// Y cualquier mail migrado por una resolución de conflicto anterior
// ("el mail es de la persona verificada", ver pacientes_conflictos.go) —
// desde ese momento el paciente puede volver a pedir turno con
// cualquiera de los dos, pedido textual del cliente.
func pacienteRespondeAlMail(tx *gorm.DB, paciente db.Paciente, email string) (bool, error) {
	if paciente.Email != nil && strings.EqualFold(*paciente.Email, email) {
		return true, nil
	}
	var count int64
	err := tx.Model(&db.PacienteEmailAlternativo{}).
		Where("paciente_id = ? AND email = ?", paciente.ID, email).
		Limit(1).
		Count(&count).Error
	return count > 0, err
}

// dniCensurado/nombreConIniciales — Fase 2.4.1: "datos medianamente
// censurados para cumplir normas pero distinguibles para que el paciente
// sepa que hace referencia a él" (la "tarjeta clickeable" del camino "ya
// he venido antes"). Se arman ACÁ, en el backend, antes de mandarlos —
// nunca se manda el dato crudo al cliente para censurarlo del lado del
// navegador.
func dniCensurado(dni string) string {
	if len(dni) < 5 {
		return dni
	}
	return dni[:2] + "***" + dni[len(dni)-3:]
}

func nombreConIniciales(nombre, apellido string) string {
	nombre = strings.TrimSpace(nombre)
	apellido = strings.TrimSpace(apellido)
	if apellido == "" {
		return nombre
	}
	inicial := strings.ToUpper(string([]rune(apellido)[0]))
	return strings.TrimSpace(nombre + " " + inicial + ".")
}

type pacienteVerificadoResponse struct {
	ID     string `json:"id"`
	Nombre string `json:"nombre"`
	DNI    string `json:"dni"`
}

// pacienteVerificadoPublicoHandler — GET
// /clinicas/{slug}/pacientes/verificado?dni=&email=&verificacionToken=
// (Fase 2.4.1, camino "ya he venido antes" del wizard público): exige un
// token de "Confirmanos que sos vos" (TR-103) válido y SIN USAR para el
// mail dado — se valida, no se consume acá (ver validarVerificacionTurnoPublico),
// porque el paciente todavía va a necesitar esa verificación al mandar el
// pedido final. Busca la ficha por (profesional_id, dni), chequea que
// responda a ese mail y que esté VERIFICADA (pacienteEstaVerificado) —
// si todo da bien, devuelve los datos ya censurados para la "tarjeta
// clickeable"; si no, 404 con un mensaje que empuja de vuelta al camino
// "primera vez" (el documento contempla justamente este caso: alguien
// dice "ya vine" pero todavía no tiene una ficha verificada).
func pacienteVerificadoPublicoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		var clinic db.Clinic
		if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		dni := strings.TrimSpace(r.URL.Query().Get("dni"))
		email := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("email")))
		token := strings.TrimSpace(r.URL.Query().Get("verificacionToken"))
		if !dniRegex.MatchString(dni) {
			writeError(w, http.StatusBadRequest, "el DNI debe tener 7 u 8 dígitos, sin puntos")
			return
		}
		if _, err := mail.ParseAddress(email); err != nil {
			writeError(w, http.StatusBadRequest, "el email no tiene un formato válido")
			return
		}
		if token == "" {
			writeError(w, http.StatusBadRequest, "verificá tu mail antes de continuar")
			return
		}

		if _, err := validarVerificacionTurnoPublico(gdb, clinic.ID.String(), email, token); err != nil {
			if errors.Is(err, errTurnoVerifPruebaInvalida) {
				writeError(w, http.StatusForbidden, "verificá tu mail antes de continuar")
				return
			}
			writeError(w, http.StatusInternalServerError, "no se pudo verificar el mail")
			return
		}

		var paciente db.Paciente
		// `en_conflicto = false` — una ficha temporaria de un conflicto sin
		// resolver (db.Paciente.EnConflicto) nunca es "la" ficha verificada
		// de este DNI, aunque casualmente tenga turnos resueltos/asistidos
		// (no debería, es recién creada, pero la condición queda explícita
		// por las dudas).
		err := gdb.Where("profesional_id = ? AND dni = ? AND en_conflicto = false", clinic.ID, dni).First(&paciente).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			writeError(w, http.StatusNotFound, "no encontramos un paciente verificado con esos datos")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo buscar el paciente")
			return
		}

		responde, err := pacienteRespondeAlMail(gdb, paciente, email)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo buscar el paciente")
			return
		}
		verificado, err := pacienteEstaVerificado(gdb, paciente)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo buscar el paciente")
			return
		}
		if !responde || !verificado {
			writeError(w, http.StatusNotFound, "no encontramos un paciente verificado con esos datos")
			return
		}

		writeJSON(w, http.StatusOK, pacienteVerificadoResponse{
			ID:     paciente.ID.String(),
			Nombre: nombreConIniciales(paciente.Nombre, paciente.Apellido),
			DNI:    dniCensurado(paciente.DNI),
		})
	}
}
