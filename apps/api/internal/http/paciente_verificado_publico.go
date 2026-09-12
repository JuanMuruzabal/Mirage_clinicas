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
// "resuelto" en el resto del código (TR-074 en docs/Arquitectura y base/tradeoffs.md).
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

// pacienteReconocibleEnElWizard — a quién le mostramos su tarjeta en el
// camino "ya he venido antes".
//
// Hasta la Fase 3.1 era exactamente "paciente verificado": al
// menos un turno resuelto y asistido, o ficha cargada a mano por el
// profesional. El cliente pidió ampliarlo: "si soy un paciente no
// verificado, pero tengo un turno activo, si pongo mis datos, me debería
// saltar mi tarjeta".
//
// Tiene sentido más allá del pedido: alguien que sacó un turno la semana
// pasada y vuelve a sacar otro YA demostró acceso al mail de esa ficha —
// el código de 6 dígitos se lo pidió entonces y se lo vuelve a pedir
// ahora. Obligarlo a retipear todo porque todavía no asistió era fricción
// sin contrapartida.
//
// Lo que NO cambia: sigue haciendo falta responder al mail de la ficha
// (`pacienteRespondeAlMail`), así que el DNI solo no alcanza para que
// aparezca la tarjeta de nadie.
func pacienteReconocibleEnElWizard(tx *gorm.DB, paciente db.Paciente) (bool, error) {
	verificado, err := pacienteEstaVerificado(tx, paciente)
	if err != nil {
		return false, err
	}
	if verificado {
		return true, nil
	}
	return pacienteTieneTurnoActivo(tx, paciente)
}

// pacienteTieneTurnoActivo — mismo criterio de "vigente" que el resto del
// wizard (estado 'agendado' y hora_fin todavía por delante).
func pacienteTieneTurnoActivo(tx *gorm.DB, paciente db.Paciente) (bool, error) {
	var n int64
	err := tx.Model(&db.Turno{}).
		Where("paciente_id = ? AND estado = 'agendado' AND hora_fin >= now()", paciente.ID).
		Count(&n).Error
	if err != nil {
		return false, err
	}
	return n > 0, nil
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

	if err := borrarFichaPacienteConSusHijas(tx, pacienteID); err != nil {
		return false, err
	}
	return true, nil
}

// borrarFichaPacienteConSusHijas — el ÚNICO lugar donde se borra una ficha
// de paciente. Los cuatro caminos que lo hacen (cancelar un turno y marcar
// asistencia vía borrarPacienteNoVerificadoSiSinHistorialReal, las dos
// resoluciones de conflicto del panel, y el barrido de fichas sin turno de
// turno_publico.go) pasan por acá.
//
// Bug real que lo motivó (QA 2026-09-12): cancelar el único turno de una
// ficha sacada por un TUTOR devolvía 500. Cada call site limpiaba un
// subconjunto DISTINTO de las filas hijas antes del DELETE —uno desvinculaba
// turnos, otro borraba tutores, ninguno tocaba los alternativos— y eso
// alcanzaba mientras el esquema no tuvo foreign keys. Con las de TR-131
// (`fk_paciente_tutores_paciente`, `fk_paciente_emails_alt_paciente`,
// `fk_paciente_telefonos_alt_paciente`, todas NO ACTION) cualquier fila hija
// viva rebota el DELETE con 23503 y tumba la transacción entera.
//
// El orden importa: primero se sueltan/borran las hijas, la ficha al final.
// Los TURNOS nunca se borran —son registro histórico real— solo se
// desvinculan; el resto de las hijas no tiene vida propia sin su ficha.
//
// Es idempotente sobre lo ya limpiado: un call site que además migró los
// tutores a otra ficha antes de llamar acá no rompe nada, simplemente no
// queda nada que borrar.
func borrarFichaPacienteConSusHijas(tx *gorm.DB, pacienteID uuid.UUID) error {
	if err := tx.Exec("UPDATE turnos SET paciente_id = NULL WHERE paciente_id = ?", pacienteID).Error; err != nil {
		return err
	}
	for _, hija := range []any{
		&db.PacienteTutor{},
		&db.PacienteEmailAlternativo{},
		&db.PacienteTelefonoAlternativo{},
	} {
		if err := tx.Where("paciente_id = ?", pacienteID).Delete(hija).Error; err != nil {
			return err
		}
	}
	return tx.Delete(&db.Paciente{}, "id = ?", pacienteID).Error
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

// pacienteTieneTutorConMail — Fase 2.4.2 (camino "sacar turno para otro",
// `docs/Fases post MVP/Fase 2/turnero_pagina/ArquitecturaPeticionesTurno.md` 3.4), reemplaza a la vieja
// pacienteRespondeAlMailDeTutor en la ronda de correcciones del
// 2026-09-06: misma pregunta ("¿esta ficha responde a este mail?"), pero
// contra CUALQUIERA de los tutores YA CONOCIDOS del paciente (ver
// PacienteTutor en models.go — ahora puede tener más de uno), no un único
// campo `TutorEmail`. No mira `PacienteEmailAlternativo` — esa tabla nace
// de fusionar dos fichas de PACIENTE (mail/teléfono propios,
// migrarAlternativosDeContacto), nunca de un tutor.
func pacienteTieneTutorConMail(tx *gorm.DB, pacienteID uuid.UUID, email string) (bool, error) {
	var count int64
	err := tx.Model(&db.PacienteTutor{}).
		Where("paciente_id = ? AND LOWER(email) = LOWER(?)", pacienteID, email).
		Limit(1).
		Count(&count).Error
	return count > 0, err
}

// buscarTutorConMail — misma pregunta que pacienteTieneTutorConMail, pero
// devuelve la fila (no solo si existe) — usada por
// sincronizarTutorDesdeFichaVerificada (turno_publico.go) para copiar sus
// datos completos al turno. nil sin error si no matchea ninguno.
func buscarTutorConMail(tx *gorm.DB, pacienteID uuid.UUID, email string) (*db.PacienteTutor, error) {
	var tutor db.PacienteTutor
	err := tx.Where("paciente_id = ? AND LOWER(email) = LOWER(?)", pacienteID, email).First(&tutor).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &tutor, nil
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

// validarIdentidadPublicaOEnlace — Fase 2, ítem 5 ("compartir
// calendario"): las dos pantallas de "ya he venido antes" (por DNI y por
// mail de tutor) aceptan CUALQUIERA de dos pruebas de identidad —
// `verificacionToken` (el código de 6 dígitos de siempre) o
// `enlaceToken` (el profesional ya garantizó la identidad al mandar el
// link, sin código de por medio) — mutuamente excluyentes, nunca los dos
// vacíos (ya validado por el caller antes de llegar acá). Ninguna de las
// dos consume nada: el token de verificación se gasta recién al mandar
// el pedido final (consumirVerificacionTurnoPublico) y el enlace igual
// (consumirEnlaceTurno) — acá solo se comprueba que siga vigente.
func validarIdentidadPublicaOEnlace(gdb *gorm.DB, clinicID uuid.UUID, email, verificacionToken, enlaceToken string) error {
	if enlaceToken != "" {
		enlace, err := buscarEnlaceTurnoVigente(gdb, clinicID, enlaceToken)
		if err != nil {
			return err
		}
		if !enlace.Vigente(time.Now()) {
			return errEnlaceTurnoInvalido
		}
		return nil
	}
	_, err := validarVerificacionTurnoPublico(gdb, clinicID.String(), email, verificacionToken)
	return err
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

		// Fase 2.4.2 (`docs/Fases post MVP/Fase 2/turnero_pagina/ArquitecturaPeticionesTurno.md` 3.5) — segundo
		// modo del mismo endpoint, sin `dni`: busca por MAIL DEL TUTOR en
		// vez de por DNI del paciente, y puede devolver más de una
		// tarjeta (un tutor puede tener más de un hijo verificado a su
		// cargo). El modo de abajo (`dni`+`email`, una sola tarjeta) sigue
		// exactamente igual.
		// enlaceToken (Fase 2, ítem 5 — "compartir calendario"): alternativa
		// a verificacionToken cuando la identidad ya la garantizó el
		// profesional al mandar el link, no un código de mail — ver el
		// comentario grande de validarIdentidadPublicaOToken más abajo.
		enlaceToken := strings.TrimSpace(r.URL.Query().Get("enlaceToken"))

		if tutorEmail := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("tutorEmail"))); tutorEmail != "" {
			token := strings.TrimSpace(r.URL.Query().Get("verificacionToken"))
			listarPacientesVerificadosDeTutorHandler(w, gdb, clinic, tutorEmail, token, enlaceToken)
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
		if token == "" && enlaceToken == "" {
			writeError(w, http.StatusBadRequest, "verificá tu mail antes de continuar")
			return
		}

		if err := validarIdentidadPublicaOEnlace(gdb, clinic.ID, email, token, enlaceToken); err != nil {
			if errors.Is(err, errTurnoVerifPruebaInvalida) {
				writeError(w, http.StatusForbidden, "verificá tu mail antes de continuar")
				return
			}
			if errors.Is(err, errEnlaceTurnoInvalido) {
				writeError(w, http.StatusForbidden, errEnlaceTurnoInvalido.Error())
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
		reconocible, err := pacienteReconocibleEnElWizard(gdb, paciente)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo buscar el paciente")
			return
		}
		if !responde || !reconocible {
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

// listarPacientesVerificadosDeTutorHandler — Fase 2.4.2, segundo modo de
// pacienteVerificadoPublicoHandler (ver el comentario grande de arriba y
// docs/Fases post MVP/Fase 2/turnero_pagina/ArquitecturaPeticionesTurno.md 3.5): a diferencia del modo por DNI
// (una sola tarjeta), acá el match es por `Paciente.TutorEmail` y puede
// devolver 0, 1 o más tarjetas — un tutor puede tener más de un hijo
// verificado a su cargo. Mismo criterio de censura y de exigir el token
// de "Confirmanos que sos vos" ya validado (sin consumir, ver
// validarVerificacionTurnoPublico) que el modo por DNI.
func listarPacientesVerificadosDeTutorHandler(w http.ResponseWriter, gdb *gorm.DB, clinic db.Clinic, tutorEmail, token, enlaceToken string) {
	if _, err := mail.ParseAddress(tutorEmail); err != nil {
		writeError(w, http.StatusBadRequest, "el email no tiene un formato válido")
		return
	}
	if token == "" && enlaceToken == "" {
		writeError(w, http.StatusBadRequest, "verificá tu mail antes de continuar")
		return
	}
	if err := validarIdentidadPublicaOEnlace(gdb, clinic.ID, tutorEmail, token, enlaceToken); err != nil {
		if errors.Is(err, errTurnoVerifPruebaInvalida) {
			writeError(w, http.StatusForbidden, "verificá tu mail antes de continuar")
			return
		}
		if errors.Is(err, errEnlaceTurnoInvalido) {
			writeError(w, http.StatusForbidden, errEnlaceTurnoInvalido.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "no se pudo verificar el mail")
		return
	}

	// `en_conflicto = false` — mismo criterio que el modo por DNI: una
	// ficha temporaria de un conflicto sin resolver nunca es "la" ficha
	// verificada de nadie todavía. Join contra `paciente_tutores` (Fase
	// 2.4.2, ronda de correcciones 2026-09-06) — un paciente puede tener
	// más de un tutor conocido, ya no un único campo `tutor_email` en
	// `pacientes`; `LOWER(...)` porque el mail se guarda tal cual llega
	// del wizard (ver solicitarTurnoPublicoHandler) — la comparación en
	// sí es case-insensitive, igual que pacienteRespondeAlMail/
	// pacienteTieneTutorConMail. `Distinct` — un paciente con MÁS de un
	// tutor que compartan (raro, pero posible) el mismo mail no debe
	// duplicar la tarjeta.
	var candidatos []db.Paciente
	if err := gdb.Joins("JOIN paciente_tutores ON paciente_tutores.paciente_id = pacientes.id").
		Where("pacientes.profesional_id = ? AND pacientes.en_conflicto = false AND LOWER(paciente_tutores.email) = LOWER(?)", clinic.ID, tutorEmail).
		Distinct().
		Order("pacientes.created_at").Find(&candidatos).Error; err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo buscar pacientes")
		return
	}

	out := make([]pacienteVerificadoResponse, 0, len(candidatos))
	for _, p := range candidatos {
		// Mismo criterio ampliado que el modo por DNI (Fase 3.1):
		// un hijo con turno activo pero todavía sin asistir también le
		// aparece a su tutor, que ya demostró acceso al mail.
		reconocible, err := pacienteReconocibleEnElWizard(gdb, p)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo buscar pacientes")
			return
		}
		if !reconocible {
			continue
		}
		out = append(out, pacienteVerificadoResponse{
			ID:     p.ID.String(),
			Nombre: nombreConIniciales(p.Nombre, p.Apellido),
			DNI:    dniCensurado(p.DNI),
		})
	}
	if len(out) == 0 {
		writeError(w, http.StatusNotFound, "no encontramos un paciente verificado con esos datos")
		return
	}
	writeJSON(w, http.StatusOK, out)
}
