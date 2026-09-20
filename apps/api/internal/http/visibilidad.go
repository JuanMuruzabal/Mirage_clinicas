package http

import (
	"errors"
	"net/http"

	"dental-mirage/api/internal/db"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Fase 3.2.2 — el aislamiento entre colegas de una misma clínica.
//
// El brief lo pide en mayúsculas: "CADA COMPONENTE DEL PANEL DE CADA
// PROFESIONAL, ES AISLADO DEL RESTO DE PROFESIONALES". Un odontólogo ve su
// agenda y sus pacientes; no los del colega del sillón de al lado.
//
// QUIÉN VE TODO: SOLO RECEPCIÓN. El brief no deja lugar a otra cosa —
// "Recepcionista: tiene acceso a todas las vistas de los N profesionales
// dentro de la aplicación"— y el resto de los roles se definen por lo
// contrario: el profesional está "aislado de las demás vistas de
// profesionales", y el administrador de página tiene "acceso a la página
// web y sus herramientas", nada más.
//
// CORRECCIÓN DEL 2026-09-14. Hasta acá esta función también incluía
// `owner` y `admin`, y eso era una interpretación mía, no una regla del
// cliente: la saqué de una línea de las Aclaraciones del brief ("un
// administrador tendrá la capacidad de acceder a cada una de las vistas
// de cada profesional y reasignación de turnos ENTRE profesionales").
// Esa línea aclara "(ver más adelante en roles)", y más adelante el
// administrador es **de la página**. Estiré la palabra hasta un rol que
// significa otra cosa.
//
// Lo que se rompía con eso: el titular de la clínica es
// `owner`+`admin`+`profesional`, así que veía TODOS los turnos de la
// clínica — justo lo que el requisito en mayúsculas del brief prohíbe
// ("CADA COMPONENTE DEL PANEL DE CADA PROFESIONAL, ES AISLADO DEL RESTO
// DE PROFESIONALES"). El titular atiende pacientes como cualquier otro:
// ve los suyos.
//
// POR QUÉ ESTO VIVE EN UN SCOPE Y NO EN CADA HANDLER. Son 17 queries de
// turnos y 8 de pacientes filtrando por clínica. Repetir la condición en
// cada una garantiza que alguna quede sin ella, y una fuga de aislamiento
// no se nota mirando la pantalla: los datos aparecen, simplemente son de
// más gente de la que corresponde. Concentrarlo acá deja un solo lugar que
// auditar y un solo lugar que cambiar cuando la Fase 3.2.6 sume la vista
// del recepcionista por profesional.
//
// LOS PACIENTES SON DE LA CLÍNICA, no del profesional (ver TR-137), así
// que "los pacientes de Lucía" no es una columna: son los que tienen algún
// turno con ella. Eso mantiene una sola ficha por persona —de lo que
// depende la detección de conflictos de identidad de la Fase 2.4— y a la
// vez permite la vista aislada.

// FASE 3.2.6 — EL PROFESIONAL EN FOCO.
//
// Recepción es el único rol que ve la clínica entera, y el brief pide
// además que pueda "navegar en todas las vistas de los profesionales" e
// INTERACTUAR con ellas. Esas dos cosas se resuelven con un solo
// concepto: el profesional en foco (`sessions.viendo_user_id`).
//
//   - Sin foco  → recepción ve la clínica entera. Es la VISTA GENERAL:
//                 todos los turnos de todos los profesionales, las
//                 métricas de la clínica.
//   - Con foco  → la sesión se comporta EXACTAMENTE como ese
//                 profesional, en las cuatro pantallas del panel.
//
// Lo que hace barato el cambio es que las seis consultas de abajo ya se
// bifurcaban acá y ya resolvían un usuario con `usuarioDeLaSesion`.
// Cambiando qué responden esas dos preguntas, las 25 consultas del panel
// funcionan para recepción sin tocar una sola de ellas. El comentario de
// arriba de este archivo lo anticipaba desde la 3.2.2.
//
// Para cualquier otro rol nada de esto existe: `profesionalEnFoco`
// devuelve al usuario de la sesión y `veTodaLaClinica` sigue siendo
// falso.

// veTodaLaClinica — ¿este request ve la clínica entera, o una sola
// agenda? Recepción SIN foco es el único caso que ve todo.
func veTodaLaClinica(r *http.Request) bool {
	if !tieneAlgunRol(r, db.RoleRecepcion) {
		return false
	}
	return focoDeLaSesion(r) == nil
}

// focoDeLaSesion — el profesional que recepción está mirando, o nil.
//
// Solo tiene efecto para `recepcion`: la columna existe en la sesión de
// cualquiera, pero para el resto de los roles mirar la agenda de otro no
// es una operación que exista, y devolverla acá abriría el aislamiento
// que la 3.2.2 vino a cerrar.
//
// El middleware ya validó que ese usuario sea miembro ACTIVO de la
// clínica (ver membresiaDeLaSesion); acá solo se lee.
func focoDeLaSesion(r *http.Request) *uuid.UUID {
	if !tieneAlgunRol(r, db.RoleRecepcion) {
		return nil
	}
	session, ok := sessionFromContext(r)
	if !ok {
		return nil
	}
	return session.ViendoUserID
}

// profesionalEnFoco — de quién es la agenda que este request está
// mirando. Para un profesional, la suya; para recepción con foco, la del
// profesional elegido.
//
// Devuelve `false` cuando no hay a quién acotar, y los scopes traducen
// eso a "no muestres nada" en vez de a "mostrá todo": ante la duda, la
// respuesta segura es la que no filtra datos de más.
func profesionalEnFoco(r *http.Request) (uuid.UUID, bool) {
	if foco := focoDeLaSesion(r); foco != nil {
		return *foco, true
	}
	return usuarioDeLaSesion(r)
}

// usuarioDeLaSesion — el user autenticado. Solo existe después de
// requireSession.
func usuarioDeLaSesion(r *http.Request) (uuid.UUID, bool) {
	session, ok := sessionFromContext(r)
	if !ok {
		return uuid.Nil, false
	}
	return session.UserID, true
}

// `usuarioDeLaSesionOpcional` vivía acá hasta la Fase 3.2.6. Todas sus
// llamadas guardaban DE QUIÉN ES una fila (de qué agenda es este
// bloqueo, en la lista de quién entra esta ficha), no quién apretó el
// botón — así que pasaron a `profesionalEnFocoOpcional`, que sigue el
// profesional en foco. Se borra en vez de dejarla sin usar: una función
// que ya no se llama después se lee como si hubiera un caso que la
// necesita.

// profesionalEnFocoOpcional — el mismo dato, en la forma que esperan las
// columnas nullable del modelo (`creado_por_user_id`, `user_id`).
//
// Lo que se guarda es DE QUIÉN ES la fila —de qué agenda es este bloqueo,
// en la lista de quién entra esta ficha—, no quién apretó el botón. Por
// eso sigue el foco: recepción parada en la vista de un profesional está
// trabajando SOBRE esa agenda, y una fila que quedara a su nombre no
// aparecería en ninguna vista útil.
func profesionalEnFocoOpcional(r *http.Request) *uuid.UUID {
	userID, ok := profesionalEnFoco(r)
	if !ok {
		return nil
	}
	return &userID
}

// errFaltaElegirProfesional — recepción SIN foco intentando escribir algo
// que pertenece a la agenda de alguien.
//
// La vista general es para mirar la clínica entera; para actuar hay que
// pararse en la vista de un profesional, que es exactamente el gesto que
// el cliente describió ("bastaría que el recepcionista se mueva a la
// vista de ese profesional"). Adivinar acá —caer al owner, como hacía el
// provisorio de la 3.2.1— es cómo un turno terminaba en la agenda
// equivocada sin que nadie lo pidiera.
var errFaltaElegirProfesional = errors.New(
	"elegí primero de qué profesional es esta vista para poder hacer este cambio",
)

// profesionalParaEscribir — el dueño de la fila que se está por crear, o
// un 409 pidiendo que se elija.
func profesionalParaEscribir(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	if veTodaLaClinica(r) {
		writeError(w, http.StatusConflict, errFaltaElegirProfesional.Error())
		return uuid.Nil, false
	}
	userID, ok := profesionalEnFoco(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "sesión inválida")
		return uuid.Nil, false
	}
	return userID, true
}

// soloMisTurnos — scope que acota los turnos a los del profesional de la
// sesión, cuando corresponde. Para quien ve toda la clínica es un no-op.
func soloMisTurnos(r *http.Request) func(*gorm.DB) *gorm.DB {
	return func(tx *gorm.DB) *gorm.DB {
		if veTodaLaClinica(r) {
			return tx
		}
		userID, ok := profesionalEnFoco(r)
		if !ok {
			// Sin sesión no debería llegarse acá (requireSession corre
			// antes), pero ante la duda se acota a nada en vez de abrir.
			return tx.Where("1 = 0")
		}
		return tx.Where("atendido_por_user_id = ?", userID)
	}
}

// soloMisPacientes — mismo criterio, derivado de los turnos: un paciente
// es "de" un profesional si tiene algún turno con él… o si fue esta misma
// persona quien cargó la ficha a mano.
//
// Esa segunda mitad se agregó en la Fase 3.2.3, cuando un test mostró que
// un profesional invitado podía usar "+ Agregar paciente" y la ficha
// desaparecía de su listado en el acto: todavía no tenía ningún turno, así
// que el EXISTS no la encontraba. Quien acaba de cargar a una persona
// tiene que poder verla, aunque el turno venga después.
func soloMisPacientes(r *http.Request) func(*gorm.DB) *gorm.DB {
	return func(tx *gorm.DB) *gorm.DB {
		if veTodaLaClinica(r) {
			return tx
		}
		userID, ok := profesionalEnFoco(r)
		if !ok {
			return tx.Where("1 = 0")
		}
		// Tres criterios, y el tercero es el único explícito: los dos
		// primeros son hechos derivados ("lo atiendo", "lo cargué yo"),
		// el tercero es un acto — sumar a mi lista una ficha que ya
		// existía en la clínica, sin inventarle un turno (2026-09-19).
		return tx.Where(`(
			EXISTS (
				SELECT 1 FROM turnos t
				WHERE t.paciente_id = pacientes.id AND t.atendido_por_user_id = ?
			)
			OR pacientes.creado_por_user_id = ?
			OR EXISTS (
				SELECT 1 FROM pacientes_en_mi_lista l
				WHERE l.paciente_id = pacientes.id AND l.user_id = ?
			)
		)`, userID, userID, userID)
	}
}

// soloMisTiposDeConsulta — el tipo de consulta es de un profesional desde
// la Fase 3.2.1, y el listado ya lo respetaba; esto cierra la escritura
// por id, que seguía abierta.
func soloMisTiposDeConsulta(r *http.Request) func(*gorm.DB) *gorm.DB {
	return func(tx *gorm.DB) *gorm.DB {
		if veTodaLaClinica(r) {
			return tx
		}
		userID, ok := profesionalEnFoco(r)
		if !ok {
			return tx.Where("1 = 0")
		}
		return tx.Where("user_id = ? OR user_id IS NULL", userID)
	}
}

// soloMisConflictos — un conflicto de identidad lo resuelve el profesional
// que lo tiene (Fase 3.2.5, 2026-09-14).
//
// `conflictos_paciente` no tiene `user_id` y no se lo agrego: el conflicto
// SIEMPRE nace de un turno, y ese turno ya sabe quién atiende. Derivarlo
// del turno tiene dos ventajas sobre una columna nueva — no hace falta
// migrar las filas que ya existen, y no puede desincronizarse del turno
// que le dio origen.
//
// El brief pide que lo resuelva quien lo tiene: es su paciente el que
// aparece dos veces, y es él quien sabe si son la misma persona.
func soloMisConflictos(r *http.Request) func(*gorm.DB) *gorm.DB {
	return func(tx *gorm.DB) *gorm.DB {
		if veTodaLaClinica(r) {
			return tx
		}
		userID, ok := profesionalEnFoco(r)
		if !ok {
			return tx.Where("1 = 0")
		}
		// Por la FICHA DUPLICADA, no por el turno que originó el ticket
		// (corrección del 2026-09-15, pedido del cliente).
		//
		// Un conflicto es trabajo de quien tiene la ficha duplicada en su
		// lista de pacientes esperando resolución — y eso es exactamente
		// "tengo un turno con esa ficha". Por el turno que lo originó, un
		// segundo profesional que también le dio turno a esa misma ficha
		// duplicada no lo veía, aunque el duplicado le apareciera en sus
		// pacientes: le quedaba un paciente en conflicto y ningún lugar
		// donde resolverlo.
		//
		// El caso que lo hace evidente, textual del cliente: dos
		// profesionales atendieron al mismo paciente, el paciente saca
		// turno con el 1 usando otro mail — el conflicto le llega SOLO al
		// 1, porque es a quien se le cargó la ficha duplicada. El 2 no ve
		// ni el duplicado ni el conflicto.
		// La UNIÓN de las dos, y no solo la primera: si la ficha duplicada
		// se queda sin turnos vinculados —resolver un conflicto los
		// desvincula (paciente_id = NULL)— un ticket que siguiera
		// pendiente se volvería invisible para todos, imposible de
		// resolver y bloqueando asistencias para siempre. Quien originó el
		// ticket lo ve siempre; quien tiene la ficha duplicada entre sus
		// pacientes, también.
		return tx.Where(`(
			EXISTS (
				SELECT 1 FROM turnos t
				WHERE t.paciente_id = conflictos_paciente.paciente_en_conflicto_id
				  AND t.atendido_por_user_id = ?
			)
			OR EXISTS (
				SELECT 1 FROM turnos t
				WHERE t.id = conflictos_paciente.turno_en_conflicto_id
				  AND t.atendido_por_user_id = ?
			)
		)`, userID, userID)
	}
}

// soloConflictosVivos — un ticket abierto Y con su ficha duplicada todavía
// en pie (2026-09-16, bug reportado por el cliente: "cuando resuelvo todos
// los conflictos (tengo 0) en las otras pestañas ahora me aparece 'tenés 1
// conflicto'").
//
// `resuelto = false` no alcanza. Resolver un conflicto BORRA la ficha
// duplicada, y desde que una resolución arrastra a sus hermanos por mail
// puede dejar atrás un ticket que quedó apuntando a una ficha que ya no
// existe. La pantalla de Pacientes no lo mostraba —no tiene ficha que
// pintar— pero el contador de la notificación sí lo contaba: un aviso de
// algo que no se puede ni ver ni resolver.
//
// Un conflicto sin ficha duplicada no tiene nada que decidir. Se filtra
// donde se cuenta, donde se lista y donde se resuelve, para que las tres
// respondan lo mismo — que era justamente lo que no pasaba.
func soloConflictosVivos(tx *gorm.DB) *gorm.DB {
	return tx.Where(`EXISTS (
		SELECT 1 FROM pacientes p
		WHERE p.id = conflictos_paciente.paciente_en_conflicto_id
	)`)
}

// soloMiAgenda — el horario de atención y los horarios reservados son de
// UN profesional, igual que sus turnos (Fase 3.2.5, corrección del
// 2026-09-14).
//
// Las columnas `user_id` de `horarios_atencion` y `bloqueos_horario`
// existen desde la 3.2.1 y los handlers nunca las escribieron ni las
// leyeron: filtraban solo por clínica. Con dos profesionales eso significa
// que los horarios reservados de uno aparecían en el calendario del otro,
// y —peor— que el horario de atención era UNO SOLO para la clínica: el PUT
// buscaba la fila `general` de ese `clinic_id` y la pisaba, así que
// guardar el propio le cambiaba el horario al colega.
//
// No es un caso de borde: es la agenda sobre la que se apoyan los turnos.
// Arreglar quién atiende cada turno sin arreglar esto deja el aislamiento
// a medias — los turnos dejan de cruzarse, pero los huecos donde entran
// siguen saliendo de datos mezclados.
//
// `user_id IS NULL` entra igual, por la misma razón que en
// `/tipos-consulta`: son las filas anteriores a la 3.2.1, que la migración
// le asigna al owner. Dejarlas afuera le vaciaría la agenda a una clínica
// vieja de un solo profesional.
func soloMiAgenda(r *http.Request) func(*gorm.DB) *gorm.DB {
	return func(tx *gorm.DB) *gorm.DB {
		if veTodaLaClinica(r) {
			return tx
		}
		userID, ok := profesionalEnFoco(r)
		if !ok {
			return tx.Where("1 = 0")
		}
		return tx.Where("user_id = ? OR user_id IS NULL", userID)
	}
}

// profesionalQueAtiende — a quién se le asigna un turno cargado desde el
// panel (Fase 3.2.5, corrección del 2026-09-14).
//
// Si quien lo carga atiende pacientes en esta clínica, el turno es SUYO:
// es su agenda la que se está llenando, y `soloMisTurnos`/`soloMisPacientes`
// derivan de esta columna. Asignárselo a otro lo saca de su propia vista y
// lo mete en la ajena — las dos mitades del mismo error.
//
// Si no atiende (recepción cargando para el equipo), cae al owner. Es la
// conducta anterior, y sigue siendo provisoria: el caso que de verdad
// necesita elegir profesional es este, y lo resuelve la 3.2.6 con el
// selector en el modal. La diferencia es que ahora el provisorio cubre
// solo al que no tiene respuesta mejor, en vez de a todos.
func profesionalQueAtiende(gdb *gorm.DB, r *http.Request, clinicID uuid.UUID) (uuid.UUID, error) {
	if tieneAlgunRol(r, db.RoleProfesional) {
		if session, ok := sessionFromContext(r); ok {
			return session.UserID, nil
		}
	}
	// RECEPCIÓN: el profesional en foco (Fase 3.2.6). Acá termina el
	// provisorio de la 3.2.1 que caía al titular — era la razón por la
	// que un turno cargado por recepción aparecía en la agenda del
	// dueño de la clínica en vez de la de quien iba a atenderlo.
	//
	// Sin foco no se adivina: `errFaltaElegirProfesional` le pide a
	// recepción que se pare en una vista. Caer al owner "por defecto" es
	// exactamente el error que esto corrige.
	if tieneAlgunRol(r, db.RoleRecepcion) {
		if foco := focoDeLaSesion(r); foco != nil {
			return *foco, nil
		}
		return uuid.Nil, errFaltaElegirProfesional
	}
	return db.OwnerDeLaClinica(gdb, clinicID)
}
