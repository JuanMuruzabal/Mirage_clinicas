package http

import (
	"errors"
	"log"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	dmmail "dental-mirage/api/internal/mail"
)

// dniRegex/telefonoRegex (TR-002 en docs/tradeoffs.md): DNI numérico de
// 7-8 dígitos; teléfono argentino de 10-13 dígitos, acepta un "+" líder
// (p. ej. +54 9 351 555-0142 sin espacios/guiones, que el frontend limpia
// antes de mandar).
var (
	dniRegex      = regexp.MustCompile(`^\d{7,8}$`)
	telefonoRegex = regexp.MustCompile(`^\+?\d{10,13}$`)
)

// errHorarioPublicoYaNoDisponible — Extra 2.3.5 (E5.2): el horario que el
// paciente eligió en el paso anterior del wizard dejó de estar disponible
// para cuando terminó de completar el resto del formulario (otro paciente
// lo tomó, o el profesional cargó un turno a mano encima). Sentinel propio
// para distinguirlo de cualquier otro error de la transacción y devolver
// un mensaje específico, no el genérico de "no se pudo registrar".
var errHorarioPublicoYaNoDisponible = errors.New("el horario elegido ya no está disponible")

// errPacienteVerificadoNoEncontrado — Fase 2.4.1: sentinel para el camino
// "ya he venido antes" (pacienteVerificadoId inválido/ajeno).
var errPacienteVerificadoNoEncontrado = errors.New("el paciente elegido no existe")
var errEmailBloqueadoTurnoPublico = errors.New("este mail no puede pedir turno por ahora")

// errIPBloqueadaTurnoPublico — corrección de seguridad (Fase 2.4.1):
// mensaje genérico a propósito ("esta conexión", no "esta IP") — no tiene
// sentido exponerle a un visitante que el sistema rastrea/bloquea por IP.
var errIPBloqueadaTurnoPublico = errors.New("no se puede pedir turno desde esta conexión por ahora")

// errTurnoPublicoDuplicado — Fase 2.4.1, guarda "ya tenés turno de este
// tipo de consulta" del documento del cliente, corrección de QA: el
// mensaje incluye la fecha del turno ya agendado ("ya tenés un turno
// agendado para el DD/MM HH:MM"), así que no alcanza con un sentinel fijo
// — se arma dinámicamente pero sigue siendo un error tipado (no un string
// suelto) para que errors.As lo distinga de cualquier otro error de la
// transacción.
type errTurnoPublicoDuplicado struct {
	turno db.Turno
}

func (e *errTurnoPublicoDuplicado) Error() string {
	fecha := "una fecha ya agendada"
	if e.turno.HoraInicio != nil {
		fecha = e.turno.HoraInicio.Format("02/01 15:04") + "hs"
	}
	return "ya tenés un turno agendado para el " + fecha + " para este tipo de consulta"
}

// errYaTieneUnTurnoActivo — corrección de QA sobre TR-107, pedido
// textual del cliente: "sea paciente verificado o no verificado solo
// puede tener un turno activo con el mismo dni, sea el tipo de consulta
// que sea... esto simplifica aún más la lógica de conflictos" — UNA sola
// regla, sin excepción por verificación ni por tipo de consulta: si el
// DNI ya tiene CUALQUIER turno vigente, no puede sacar otro, punto. Deja
// inalcanzables (pero sin borrar, por el mismo criterio de siempre — "no
// descartar nada de lo ya establecido") tanto las reglas de abajo
// (turnoActivoDelMismoTipo/turnoActivoDeOtroTipo, TR-107) como el
// chequeo de "ya tenés turno de este tipo" para fichas verificadas más
// abajo (turnoVigenteDeTipo/errTurnoPublicoDuplicado) — esta regla nueva
// es un superconjunto estricto de las dos: cualquier caso que las
// disparaba a ellas ya dispara esta primero.
type errYaTieneUnTurnoActivo struct {
	email string
}

func (e *errYaTieneUnTurnoActivo) Error() string {
	return "ya tenés un turno pendiente, con mail " + censurarMailParcial(e.email) +
		". No podés sacar otro turno — por cualquier consulta o modificación, contactate con la clínica."
}

// turnoActivoPorDNI — mismo criterio de "vigente" que el resto del
// archivo (estado='agendado' AND hora_fin >= ahora), sin filtrar por
// tipo de consulta ni por ficha: dos fichas separadas por un conflicto
// sin resolver comparten el mismo dni_contacto en sus turnos.
func turnoActivoPorDNI(tx *gorm.DB, profesionalID uuid.UUID, dni string) (*db.Turno, error) {
	var turno db.Turno
	err := tx.Where("profesional_id = ? AND dni_contacto = ? AND estado = 'agendado' AND hora_fin >= now()",
		profesionalID, dni).
		Order("hora_inicio").First(&turno).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &turno, nil
}

// errTurnoActivoConOtroMail/errYaTieneOtroTipoActivo — corrección de QA
// (TR-107), pedido textual del cliente: "es muy específico que un
// atacante sepa que tal DNI va a asistir a la clínica y reservarlo de
// antemano" — en vez de tolerar varios turnos sin verificar por el mismo
// DNI y tratar de detectar el patrón de abuso después (el tope de abajo,
// que queda inalcanzable), esto ataca la raíz: un DNI sin verificar nunca
// puede tener más de 1 turno VIGENTE a la vez, sea del mismo tipo de
// consulta o de otro. Se chequea ANTES de resolver/crear cualquier ficha
// (ver el call site) — mismo motivo que el detector de mail-abuso más
// abajo: no dejar una ficha huérfana sin turno.
type errTurnoActivoConOtroMail struct {
	email string
}

func (e *errTurnoActivoConOtroMail) Error() string {
	return "ya hay un turno activo con este DNI, con el mail " + censurarMailParcial(e.email)
}

// errYaTieneOtroTipoActivo — "presentate primero a tu turno existente
// para sacar otro tipo de consulta". Solo aplica si esa ficha existente
// NO está verificada — un paciente ya verificado sigue pudiendo tener
// varios tipos de consulta vigentes a la vez (TR-100), sin cambios ahí.
type errYaTieneOtroTipoActivo struct {
	turno db.Turno
}

func (e *errYaTieneOtroTipoActivo) Error() string {
	fecha := "una fecha ya agendada"
	if e.turno.HoraInicio != nil {
		fecha = e.turno.HoraInicio.Format("02/01 15:04") + "hs"
	}
	return "presentate primero a tu turno del " + fecha + " para poder sacar otro tipo de consulta"
}

// censurarMailParcial — TR-107: mismo criterio de censura que la tarjeta
// de "ya he venido antes" (dniCensurado/nombreConIniciales,
// paciente_verificado_publico.go) — nunca se expone el dato de contacto
// completo, alcanza con que la persona real reconozca que no es su mail.
func censurarMailParcial(email string) string {
	at := strings.Index(email, "@")
	if at <= 0 {
		return email
	}
	local, dominio := email[:at], email[at:]
	if len(local) <= 4 {
		return local + "..." + dominio
	}
	return local[:4] + "..." + dominio
}

// turnoActivoDelMismoTipo/turnoActivoDeOtroTipo — TR-107: las dos
// consultas que sostienen las reglas de arriba. "Activo" = vigente
// (estado='agendado' AND hora_fin >= ahora), sin importar a qué ficha
// esté vinculado el turno — dos fichas separadas por un conflicto sin
// resolver comparten el mismo dni_contacto en sus turnos (mismo criterio
// que contarTurnosVigentesPorDNIYTipo, más abajo).
func turnoActivoDelMismoTipo(tx *gorm.DB, profesionalID uuid.UUID, dni string, tipoConsultaID uuid.UUID) (*db.Turno, error) {
	var turno db.Turno
	err := tx.Where("profesional_id = ? AND dni_contacto = ? AND tipo_consulta_id = ? AND estado = 'agendado' AND hora_fin >= now()",
		profesionalID, dni, tipoConsultaID).
		Order("hora_inicio").First(&turno).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &turno, nil
}

func turnoActivoDeOtroTipo(tx *gorm.DB, profesionalID uuid.UUID, dni string, tipoConsultaID uuid.UUID) (*db.Turno, error) {
	var turno db.Turno
	err := tx.Where("profesional_id = ? AND dni_contacto = ? AND tipo_consulta_id <> ? AND estado = 'agendado' AND hora_fin >= now()",
		profesionalID, dni, tipoConsultaID).
		Order("hora_inicio").First(&turno).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &turno, nil
}

// limiteTurnosSinVerificarPorDNIYTipo/errDemasiadosTurnosSinVerificarDelMismoTipo
// — corrección de seguridad (Fase 2.4.1), pedido textual del cliente: "no
// sabemos con certeza quién es el impostor acá" sigue valiendo (nunca se
// bloquea al SEGUNDO DNI+mail sin verificar — cubre el caso genuino de dos
// personas distintas disputando el mismo DNI), pero sin ningún tope un
// script puede generar decenas de turnos con el mismo DNI+tipo variando
// solo el mail. 3 concurrentes alcanza para el caso real (original +
// impostor, con margen) y corta la escalada automatizada bastante antes.
//
// TR-107: este tope queda INALCANZABLE en la práctica desde que existen
// turnoActivoDelMismoTipo/turnoActivoDeOtroTipo de arriba — esas dos
// reglas topean en 1 turno activo por DNI, antes de llegar siquiera al
// 2do. Se deja el código sin tocar, por pedido explícito del cliente
// ("no descartar nada de lo ya establecido... por si en algún caso
// llegase a servir") — no es código muerto por descuido, es a propósito.
const limiteTurnosSinVerificarPorDNIYTipo = 3

var errDemasiadosTurnosSinVerificarDelMismoTipo = errors.New(
	"ya hay varios turnos sin confirmar con este DNI para este tipo de consulta — contactate directamente con el consultorio para coordinar",
)

// contarTurnosVigentesPorDNIYTipo — cuenta turnos a futuro (mismo criterio
// "vigente" que turnoVigenteDeTipo) que comparten DNI de contacto y tipo de
// consulta para este profesional, sin importar a qué ficha de paciente
// esté vinculado cada uno — el cap de arriba es sobre el DNI reclamado, no
// sobre una ficha puntual (dos fichas separadas por un conflicto sin
// resolver comparten el mismo DNIContacto en sus turnos).
func contarTurnosVigentesPorDNIYTipo(tx *gorm.DB, profesionalID uuid.UUID, dni string, tipoConsultaID uuid.UUID) (int64, error) {
	var count int64
	err := tx.Model(&db.Turno{}).
		Where("profesional_id = ? AND dni_contacto = ? AND tipo_consulta_id = ? AND estado = 'agendado' AND hora_fin >= now()",
			profesionalID, dni, tipoConsultaID).
		Count(&count).Error
	return count, err
}

// limiteDNIsDistintosPorMail/bloqueoMailPorAbusoDeDNIsDuracion —
// corrección de seguridad (Fase 2.4.1), pedido textual del cliente: "si un
// usuario malicioso genera turnos con un mismo mail y diferentes DNIs, si
// pasa cierto límite bloquear ese mail y borrar los turnos que subió".
// Corrección de QA sobre el valor inicial (5, "muy permisivo" — pedido
// textual del cliente tras probarlo): 2 — permite hasta 2 DNIs distintos
// con el mismo mail (dos integrantes de una casa compartiendo casilla),
// pero un TERCER DNI distinto ya no tiene explicación legítima razonable.
// El chequeo corre ANTES de crear el turno de ESTE pedido (ver el call
// site) — el que dispara el límite ni llega a crearse, solo se borran los
// que ya existían. Alcance explícito del cliente: SOLO el camino "para
// mí" (sin pacienteVerificadoId) — el futuro "para otro" (2.4.2, tutor +
// varios hijos con DNIs distintos y el MISMO mail del tutor) es un patrón
// legítimo que este chequeo no debe tocar cuando exista.
const limiteDNIsDistintosPorMail = 2
const bloqueoMailPorAbusoDeDNIsDuracion = 3 * 24 * time.Hour

// dnisVigentesPorMail — DNIs distintos que YA tienen un turno VIGENTE con
// este mail (antes de este pedido) — corrección de QA sobre la primera
// versión: solo cuenta turnos VIGENTES (mismo criterio que
// contarTurnosVigentesPorDNIYTipo) — pedido textual del cliente: cancelar
// un turno hoy exige contactarse con el consultorio (no hay
// auto-servicio), así que un turno cancelado ya pasó por una intervención
// humana real y no tiene sentido seguir contándolo como parte del abuso.
// Un turno RESUELTO (ya pasó su hora) tampoco cuenta — no ocupa nada, no
// es evidencia de que se sigan fabricando identidades activamente.
func dnisVigentesPorMail(tx *gorm.DB, profesionalID uuid.UUID, email string) ([]string, error) {
	var dnis []string
	err := tx.Model(&db.Turno{}).
		Where("profesional_id = ? AND email_contacto = ? AND estado = 'agendado' AND hora_fin >= now()", profesionalID, email).
		Distinct("dni_contacto").
		Pluck("dni_contacto", &dnis).Error
	return dnis, err
}

// bloqueoIPDuracion — corrección de seguridad (Fase 2.4.1): más corta que
// la de mail (bloqueoMailPorAbusoDeDNIsDuracion, 3 días) a propósito — una
// IP es una señal mucho más débil (compartida por CGNAT/wifi, se rota
// gratis con VPN, ver el comentario grande sobre clientIP en auth.go), así
// que si el bloqueo le pega a alguien que no era, que dure poco.
const bloqueoIPDuracion = 24 * time.Hour

// bloquearMailPorAbusoDeDNIsYBorrarTurnos — a diferencia de TODO el resto
// del sistema ("nunca se borra un turno, queda como registro histórico"),
// acá el cliente pidió explícitamente lo contrario: estos turnos se
// consideran generados por un ataque, no historial real de un paciente,
// así que se eliminan de la base en vez de cancelarse — "ocuparían
// espacio innecesario". Bloquea el mail (mismo mecanismo que ya usa la
// resolución de conflicto de pacientes, `EmailBloqueadoTurnoPublico`, acá
// con una duración propia más corta — 3 días, no 7) y borra TODOS los
// turnos que ese mail generó para este profesional. Una ficha de paciente
// que se queda sin ningún turno como resultado (y que nunca llegó a
// verificarse — no debería poder, dado que este chequeo solo corre en el
// camino sin pacienteVerificadoId, pero la condición queda explícita por
// las dudas) se borra también, y cualquier ConflictoPaciente sin resolver
// que la involucrara se marca resuelto para no dejar una referencia
// colgada en el panel.
//
// Corrección de QA, pedido textual del cliente: "este tipo de infractor
// bloquea la IP para que no vulnere con el otro tipo de caminos (rotación
// de mails y DNI)" — la IP del pedido que gatilló el límite se bloquea
// también (duración más corta, ver bloqueoIPDuracion), y todo queda
// registrado en la auditoría (db.AuditoriaBloqueoTurnoPublico) para que
// el profesional pueda revisar un posible falso positivo — los turnos en
// sí no se pueden recuperar, pero al menos queda un rastro de qué pasó.
// simular (parámetro común a bloquearMailPorAbusoDeDNIsYBorrarTurnos,
// bloquearIPPorRotacionYBorrarTurnos y borrarTurnosYPacientesOrfanados)
// — corrección de seguridad (Fase 2.4.1), pedido textual del cliente:
// "estoy probando en localhost, no bloquearme realmente, sino decirme
// que debería estar bloqueado, así voy probando que funcionan
// realmente". Corrección de QA sobre el diseño inicial: acá el borrado
// de turnos SÍ pasa de verdad con `simularBloqueo=true` ("se deben
// borrar los turnos si hay infracción... para ver que si funciona") —
// lo único que se saltea es el bloqueo persistente de mail/IP, para
// poder seguir iterando sin quedar bloqueado 3 días/24hs mientras se
// prueba. El registro de auditoría queda con Simulado=true para dejar
// claro que el bloqueo en sí no se aplicó de verdad.
func bloquearMailPorAbusoDeDNIsYBorrarTurnos(tx *gorm.DB, profesionalID uuid.UUID, email, ip string, simularBloqueo bool) error {
	if !simularBloqueo {
		hasta := time.Now().Add(bloqueoMailPorAbusoDeDNIsDuracion)
		var bloqueo db.EmailBloqueadoTurnoPublico
		err := tx.Where("profesional_id = ? AND email = ?", profesionalID, email).First(&bloqueo).Error
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			if err := tx.Create(&db.EmailBloqueadoTurnoPublico{ProfesionalID: profesionalID, Email: email, BloqueadoHasta: hasta}).Error; err != nil {
				return err
			}
		case err != nil:
			return err
		default:
			if err := tx.Model(&bloqueo).Update("bloqueado_hasta", hasta).Error; err != nil {
				return err
			}
		}
		if err := bloquearIP(tx, profesionalID, ip, bloqueoIPDuracion); err != nil {
			return err
		}
	}

	var turnos []db.Turno
	if err := tx.Where("profesional_id = ? AND email_contacto = ?", profesionalID, email).Find(&turnos).Error; err != nil {
		return err
	}
	dnisBorrados, cantidad, err := borrarTurnosYPacientesOrfanados(tx, turnos)
	if err != nil {
		return err
	}

	emailCopia, ipCopia := email, ip
	return registrarAuditoriaBloqueo(tx, profesionalID, "mail_muchos_dnis", &emailCopia, &ipCopia, dnisBorrados, cantidad, simularBloqueo)
}

// borrarTurnosYPacientesOrfanados — DELETE real (nunca cancelar, ver el
// comentario grande de bloquearMailPorAbusoDeDNIsYBorrarTurnos) de una
// tanda de turnos ya resueltos como abuso, compartido entre los dos
// detectores que borran (mail con muchos DNIs, e IP por rotación desde
// la corrección de QA de más abajo). Una ficha de paciente que se queda
// sin ningún turno como resultado, y que nunca llegó a verificarse, se
// borra también, y cualquier ConflictoPaciente sin resolver que la
// involucrara se marca resuelto para no dejar una referencia colgada en
// el panel. Siempre borra de verdad — el modo simulado (Fase 2.4.1) solo
// se salta el BLOQUEO persistente de mail/IP, nunca el borrado (ver
// bloquearMailPorAbusoDeDNIsYBorrarTurnos). Devuelve los DNIs distintos
// borrados (para la auditoría) y cuántos turnos en total.
func borrarTurnosYPacientesOrfanados(tx *gorm.DB, turnos []db.Turno) ([]string, int, error) {
	if len(turnos) == 0 {
		return nil, 0, nil
	}
	pacientesAfectados := map[uuid.UUID]bool{}
	turnoIDs := make([]uuid.UUID, len(turnos))
	dnisBorrados := make([]string, 0, len(turnos))
	dnisVistos := map[string]bool{}
	for i, t := range turnos {
		turnoIDs[i] = t.ID
		if t.PacienteID != nil {
			pacientesAfectados[*t.PacienteID] = true
		}
		if !dnisVistos[t.DNIContacto] {
			dnisVistos[t.DNIContacto] = true
			dnisBorrados = append(dnisBorrados, t.DNIContacto)
		}
	}
	if err := tx.Where("id IN ?", turnoIDs).Delete(&db.Turno{}).Error; err != nil {
		return nil, 0, err
	}

	for pacienteID := range pacientesAfectados {
		var turnosRestantes int64
		if err := tx.Model(&db.Turno{}).Where("paciente_id = ?", pacienteID).Count(&turnosRestantes).Error; err != nil {
			return nil, 0, err
		}
		if turnosRestantes > 0 {
			// Le queda otro turno (de otro mail/IP, o de un pedido
			// legítimo aparte) — la ficha sigue teniendo motivo para existir.
			continue
		}
		var paciente db.Paciente
		if err := tx.First(&paciente, "id = ?", pacienteID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				continue
			}
			return nil, 0, err
		}
		verificado, err := pacienteEstaVerificado(tx, paciente)
		if err != nil {
			return nil, 0, err
		}
		if verificado {
			continue
		}
		if err := tx.Delete(&db.Paciente{}, "id = ?", pacienteID).Error; err != nil {
			return nil, 0, err
		}
		if err := tx.Model(&db.ConflictoPaciente{}).
			Where("resuelto = false AND (paciente_verificado_id = ? OR paciente_en_conflicto_id = ?)", pacienteID, pacienteID).
			Update("resuelto", true).Error; err != nil {
			return nil, 0, err
		}
	}

	return dnisBorrados, len(turnoIDs), nil
}

// limiteDistintosPorIPParaRotacion/ventanaRotacionPorIP — corrección de
// seguridad (Fase 2.4.1), pedido textual del cliente: "para el caso mail
// y DNI juntos, nunca repitiendo ninguno... bloqueo por IP si desde esa
// IP se registra este tipo de patrón, porque si fuera una persona bien
// intencionada no estaría haciendo este tipo de comportamiento en un
// período corto de tiempo". Ni el tope por DNI+tipo ni el de mail+DNIs
// alcanzan a ver este caso — cada pedido usa una identidad "nueva" en
// las dos puntas. La única señal que queda es la IP: más de 4 mails
// DISTINTOS *y* más de 4 DNIs DISTINTOS desde la misma IP en 30 minutos
// no tiene explicación legítima razonable. OJO con contar mal esto: NO
// alcanza con contar pares (mail, DNI) distintos entre sí — el detector
// de arriba (mail con muchos DNIs) YA genera pares "distintos" cada vez
// que cambia solo el DNI, así que ese conteo se solaparía y dispararía
// este detector antes de tiempo con el MISMO mail reusado. Acá interesa
// específicamente que las DOS puntas roten juntas, nunca una repetida —
// por eso se piden los dos conteos por separado y se exige que AMBOS
// superen el límite.
const limiteDistintosPorIPParaRotacion = 4
const ventanaRotacionPorIP = 30 * time.Minute

// contarDistintosPorIP — mails y DNIs distintos (cada uno por su cuenta,
// no combinados) que llegaron desde esta IP en la ventana de arriba. Ver
// el comentario grande de limiteDistintosPorIPParaRotacion sobre por qué
// no alcanza con un conteo combinado.
func contarDistintosPorIP(tx *gorm.DB, profesionalID uuid.UUID, ip string) (mails int, dnis int, err error) {
	base := tx.Model(&db.Turno{}).
		Where("profesional_id = ? AND ip_contacto = ? AND created_at >= ?", profesionalID, ip, time.Now().Add(-ventanaRotacionPorIP))

	var emails []string
	if err = base.Session(&gorm.Session{}).Distinct("email_contacto").Pluck("email_contacto", &emails).Error; err != nil {
		return 0, 0, err
	}
	var dnisList []string
	if err = base.Session(&gorm.Session{}).Distinct("dni_contacto").Pluck("dni_contacto", &dnisList).Error; err != nil {
		return 0, 0, err
	}
	return len(emails), len(dnisList), nil
}

// bloquearIPPorRotacionYBorrarTurnos — ver el comentario grande de
// limiteDistintosPorIPParaRotacion. Corrección de QA, pedido textual del
// cliente: además de bloquear la IP, borra TODOS los turnos que esa IP
// generó para este profesional (mismo criterio "se eliminan, no se
// cancelan" que bloquearMailPorAbusoDeDNIsYBorrarTurnos) — el pedido
// puntual que gatilló el límite ni llega a crear turno (se chequea ANTES,
// ver el call site), pero los anteriores de la misma IP, aunque cada uno
// aislado pareciera legítimo, en conjunto ya formaban parte del mismo
// patrón de rotación — no tiene sentido dejarlos ocupando horarios.
// Corrección de QA sobre el modo simulado (Fase 2.4.1): acá también el
// borrado de los turnos anteriores pasa de verdad con
// `simularBloqueo=true` — solo se saltea el bloqueo persistente de la IP,
// para poder seguir probando el patrón sin quedar bloqueado 24hs.
func bloquearIPPorRotacionYBorrarTurnos(tx *gorm.DB, profesionalID uuid.UUID, ip string, simularBloqueo bool) error {
	if !simularBloqueo {
		if err := bloquearIP(tx, profesionalID, ip, bloqueoIPDuracion); err != nil {
			return err
		}
	}

	var turnos []db.Turno
	if err := tx.Where("profesional_id = ? AND ip_contacto = ?", profesionalID, ip).Find(&turnos).Error; err != nil {
		return err
	}
	dnisBorrados, cantidad, err := borrarTurnosYPacientesOrfanados(tx, turnos)
	if err != nil {
		return err
	}

	// Email queda vacío a propósito: a diferencia del detector por mail,
	// acá no hay UN mail del que tener certeza (son varios, distintos —
	// es justo el patrón) — la IP y los DNIs borrados ya identifican el
	// caso en la auditoría.
	ipCopia := ip
	return registrarAuditoriaBloqueo(tx, profesionalID, "ip_rotacion", nil, &ipCopia, dnisBorrados, cantidad, simularBloqueo)
}

// registerTurnoPublicoRoutes monta las rutas del formulario público de
// pedido de turno (spec §4.4, Extra 2.3.5/E5.2-E5.3): sin autenticación,
// las completa un paciente entrando a la página pública de la clínica, no
// un profesional logueado. `deps` (E5.6) trae Mail/AccountLimiter/
// IPLimiter para "Confirmanos que sos vos" — mismas dependencias que
// registerAuthRoutes, ninguna nueva.
func registerTurnoPublicoRoutes(r chi.Router, gdb *gorm.DB, deps AuthDeps) {
	r.Get("/clinicas/{slug}/tipos-consulta", listTiposConsultaPublicoHandler(gdb))
	r.Get("/clinicas/{slug}/disponibilidad", listDisponibilidadPublicaHandler(gdb))
	r.Post("/clinicas/{slug}/verificacion-email", enviarVerificacionTurnoPublicoHandler(gdb, deps))
	r.Post("/clinicas/{slug}/verificacion-email/confirmar", confirmarVerificacionTurnoPublicoHandler(gdb, deps))
	// Fase 2.4.1: camino "ya he venido antes" del wizard público.
	r.Get("/clinicas/{slug}/pacientes/verificado", pacienteVerificadoPublicoHandler(gdb))
	r.Post("/clinicas/{slug}/turnos", solicitarTurnoPublicoHandler(gdb, deps))
	// Pedido textual del cliente: botón "Mis turnos" de la página
	// pública — ver mis_turnos_publico.go.
	r.Get("/clinicas/{slug}/mis-turnos", misTurnosPublicoHandler(gdb, deps))
}

// tipoConsultaPublicoResponse — versión reducida de tipoConsultaResponse
// (tipos_consulta.go) para el wizard público: nada de tiempo post-consulta,
// cantidad de sesiones ni preferencia de atención — son detalles internos
// del cálculo de disponibilidad, no algo que el paciente necesite ver o
// pueda elegir.
type tipoConsultaPublicoResponse struct {
	ID              string `json:"id"`
	Nombre          string `json:"nombre"`
	Color           string `json:"color"`
	DuracionMinutos int    `json:"duracionMinutos"`
}

// listTiposConsultaPublicoHandler — GET /clinicas/{slug}/tipos-consulta
// (E5.2): primer paso de datos que necesita el wizard público después de
// los datos de contacto, para poder pedir la disponibilidad del tipo
// elegido.
func listTiposConsultaPublicoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		var clinic db.Clinic
		if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		var tipos []db.TipoConsulta
		if err := gdb.Where("profesional_id = ?", clinic.ID).Order("nombre").Find(&tipos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los tipos de consulta")
			return
		}

		out := make([]tipoConsultaPublicoResponse, len(tipos))
		for i, t := range tipos {
			out[i] = tipoConsultaPublicoResponse{ID: t.ID.String(), Nombre: t.Nombre, Color: t.Color, DuracionMinutos: t.DuracionMinutos}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// listDisponibilidadPublicaHandler — GET /clinicas/{slug}/disponibilidad
// (E5.2): mismo cálculo que GET /disponibilidad (disponibilidad.go,
// autenticado, lo usa el profesional desde el panel), reusado tal cual —
// la única diferencia es cómo se resuelve la clínica (por slug público en
// vez de por sesión). Nunca excluirTurnoId: acá siempre se está pidiendo
// un turno nuevo, nunca reprogramando uno existente.
func listDisponibilidadPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		var clinic db.Clinic
		if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		tipoConsultaIDStr := strings.TrimSpace(r.URL.Query().Get("tipoConsultaId"))
		fechaStr := strings.TrimSpace(r.URL.Query().Get("fecha"))
		if tipoConsultaIDStr == "" || fechaStr == "" {
			writeError(w, http.StatusBadRequest, "tipoConsultaId y fecha son obligatorios")
			return
		}
		tipoConsultaID, err := uuid.Parse(tipoConsultaIDStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "tipoConsultaId inválido")
			return
		}
		fecha, err := clock.ParseDate(fechaStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "la fecha debe tener el formato YYYY-MM-DD")
			return
		}

		var tipo db.TipoConsulta
		if err := gdb.Where("id = ? AND profesional_id = ?", tipoConsultaID, clinic.ID).First(&tipo).Error; err != nil {
			writeError(w, http.StatusNotFound, "tipo de consulta no encontrado")
			return
		}

		slots, err := calcularDisponibilidad(gdb, clinic.ID, tipo, fecha, nil)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular la disponibilidad")
			return
		}

		writeJSON(w, http.StatusOK, disponibilidadResponse{Slots: slots})
	}
}

type solicitarTurnoPublicoRequest struct {
	NombreContacto   string `json:"nombreContacto"`
	ApellidoContacto string `json:"apellidoContacto"`
	DNIContacto      string `json:"dniContacto"`
	TelefonoContacto string `json:"telefonoContacto"`
	EmailContacto    string `json:"emailContacto"`
	Motivo           string `json:"motivo"`
	// TipoConsultaID/Fecha/Hora — Extra 2.3.5 (E5.2): antes de esto, el
	// formulario público solo mandaba datos de contacto y el turno quedaba
	// `pendiente`, sin horario, a la espera de que el profesional lo
	// agendara a mano (TR-006). Ahora el paciente elige tipo de consulta,
	// fecha y horario disponible en el propio formulario (E5.3) y el turno
	// nace `agendado`, con horario real, de punta a punta.
	TipoConsultaID string `json:"tipoConsultaId"`
	Fecha          string `json:"fecha"`
	Hora           string `json:"hora"`
	// VerificacionToken (E5.6, "Confirmanos que sos vos") — token opaco
	// emitido por POST /clinicas/{slug}/verificacion-email/confirmar tras
	// validar el código de 6 dígitos mandado a EmailContacto. Sin un token
	// válido, sin usar y para el mismo mail, el turno no se crea — ver
	// consumirVerificacionTurnoPublico en verificacion_turno_publico.go.
	VerificacionToken string `json:"verificacionToken"`
	// PacienteVerificadoID (Fase 2.4.1, camino "ya he venido antes"):
	// viene de la "tarjeta clickeable" que devolvió GET
	// /clinicas/{slug}/pacientes/verificado — si viene, el turno se
	// vincula DIRECTO a esa ficha (ya se demostró control del mail/DNI),
	// sin pasar por crearPacientePublicoConDeteccionDeConflicto ni exigir
	// Nombre/Apellido/DNI/TelefonoContacto (se completan solos desde la
	// ficha encontrada) — EmailContacto sigue siendo obligatorio: es el
	// mail que se verificó, hace falta para consumir el token.
	PacienteVerificadoID string `json:"pacienteVerificadoId"`
}

type solicitarTurnoPublicoResponse struct {
	ID         string `json:"id"`
	HoraInicio string `json:"horaInicio"`
	HoraFin    string `json:"horaFin"`
}

// solicitarTurnoPublicoHandler — POST /clinicas/{slug}/turnos, reescrito
// para Extra 2.3.5 (E5.2, docs/implementation-plan.md §11.5): crea el
// turno directamente `agendado`, con `HoraInicio`/`HoraFin` reales — nunca
// más `pendiente`. Reusa calcularDisponibilidad (disponibilidad.go, misma
// función que usa el profesional desde el panel, TR-086) para revalidar
// el horario elegido, y crearOBuscarPacientePorDNI (turnos.go, E5.1) para
// no duplicar la ficha de un paciente que ya pidió turno antes con el
// mismo DNI.
//
// Corrección de seguridad (Fase 2.4.1): tres capas contra el formulario
// público sin identidad real detrás — CAPTCHA (enviarVerificacionTurnoPublicoHandler),
// tope de turnos sin verificar por DNI+tipo (contarTurnosVigentesPorDNIYTipo),
// bloqueo de mail con muchos DNIs distintos (contarDNIsDistintosPorMail) y
// bloqueo de IP por rotación de mail+DNI (contarDistintosPorIP) — ver
// el comentario grande de cada una. Corrección de QA: el tope global de
// turnos por clínica que hubo acá antes (sin importar IP ni mail) se
// sacó del todo — bloqueaba pacientes genuinos de primera vez tanto como
// a un atacante, y un atacante lo esquiva igual generando pedidos más
// espaciados en el tiempo; las capas de arriba, basadas en identidad
// repetida, son más precisas.
func solicitarTurnoPublicoHandler(gdb *gorm.DB, deps AuthDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		slug := chi.URLParam(r, "slug")
		var clinic db.Clinic
		if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		var req solicitarTurnoPublicoRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.NombreContacto = strings.TrimSpace(req.NombreContacto)
		req.ApellidoContacto = strings.TrimSpace(req.ApellidoContacto)
		req.DNIContacto = strings.TrimSpace(req.DNIContacto)
		req.TelefonoContacto = strings.TrimSpace(req.TelefonoContacto)
		req.EmailContacto = strings.TrimSpace(strings.ToLower(req.EmailContacto))
		req.Motivo = strings.TrimSpace(req.Motivo)
		req.TipoConsultaID = strings.TrimSpace(req.TipoConsultaID)
		req.Fecha = strings.TrimSpace(req.Fecha)
		req.Hora = strings.TrimSpace(req.Hora)
		req.VerificacionToken = strings.TrimSpace(req.VerificacionToken)
		req.PacienteVerificadoID = strings.TrimSpace(req.PacienteVerificadoID)

		if req.VerificacionToken == "" {
			writeError(w, http.StatusBadRequest, "verificá tu mail antes de pedir el turno")
			return
		}
		if _, err := mail.ParseAddress(req.EmailContacto); err != nil {
			writeError(w, http.StatusBadRequest, "el email no tiene un formato válido")
			return
		}

		// Fase 2.4.1: camino "ya he venido antes" — el paciente ya se
		// identificó con la tarjeta clickeable (GET .../pacientes/verificado),
		// así que nombre/apellido/DNI/teléfono no vienen en la request:
		// se completan solos desde la ficha encontrada, ver la
		// transacción de abajo. Sin pacienteVerificadoId, sigue el camino
		// de siempre ("primera vez"), con los mismos datos obligatorios.
		var pacienteVerificadoID uuid.UUID
		usaPacienteVerificado := req.PacienteVerificadoID != ""
		if usaPacienteVerificado {
			var err error
			pacienteVerificadoID, err = uuid.Parse(req.PacienteVerificadoID)
			if err != nil {
				writeError(w, http.StatusBadRequest, "el paciente elegido no es válido")
				return
			}
		} else {
			if req.NombreContacto == "" || req.ApellidoContacto == "" {
				writeError(w, http.StatusBadRequest, "nombre y apellido son obligatorios")
				return
			}
			if !dniRegex.MatchString(req.DNIContacto) {
				writeError(w, http.StatusBadRequest, "el DNI debe tener 7 u 8 dígitos, sin puntos")
				return
			}
			if !telefonoRegex.MatchString(req.TelefonoContacto) {
				writeError(w, http.StatusBadRequest, "el teléfono no tiene un formato válido")
				return
			}
		}
		tipoConsultaID, err := uuid.Parse(req.TipoConsultaID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "el tipo de consulta no es válido")
			return
		}
		fecha, err := clock.ParseDate(req.Fecha)
		if err != nil {
			writeError(w, http.StatusBadRequest, "la fecha debe tener el formato YYYY-MM-DD")
			return
		}
		if !horaRegex.MatchString(req.Hora) {
			writeError(w, http.StatusBadRequest, "el horario elegido no es válido")
			return
		}

		var tipo db.TipoConsulta
		if err := gdb.Where("id = ? AND profesional_id = ?", tipoConsultaID, clinic.ID).First(&tipo).Error; err != nil {
			writeError(w, http.StatusNotFound, "tipo de consulta no encontrado")
			return
		}

		horaInicio := combinarFechaYHora(fecha, req.Hora)
		if horaInicio.Before(clock.Now()) {
			writeError(w, http.StatusBadRequest, "no se puede pedir un turno en una fecha pasada")
			return
		}
		horaFin := horaInicio.Add(time.Duration(tipo.DuracionMinutos) * time.Minute)

		turno := db.Turno{
			ProfesionalID:    clinic.ID,
			Estado:           "agendado",
			TipoConsultaID:   &tipo.ID,
			HoraInicio:       &horaInicio,
			HoraFin:          &horaFin,
			NombreContacto:   req.NombreContacto,
			ApellidoContacto: req.ApellidoContacto,
			DNIContacto:      req.DNIContacto,
			TelefonoContacto: req.TelefonoContacto,
			EmailContacto:    req.EmailContacto,
			Motivo:           req.Motivo,
			Origen:           "pagina_publica",
			IPContacto:       &ip,
		}

		// mensajeBloqueoAbuso — ver el comentario grande dentro de la
		// transacción, junto a bloquearMailPorAbusoDeDNIsYBorrarTurnos —
		// vacío mientras no se dispare ningún detector; si se llena, la
		// transacción de todos modos comitea normal (el bloqueo/borrado
		// tiene que persistir) pero la respuesta HTTP final es un rechazo.
		var mensajeBloqueoAbuso string
		err = gdb.Transaction(func(tx *gorm.DB) error {
			// Corrección de seguridad (Fase 2.4.1): misma lógica que el
			// bloqueo de mail de acá abajo — por las dudas, un token emitido
			// antes del bloqueo de IP podría seguir vigente hasta 30 min más.
			if bloqueada, err := ipEstaBloqueada(tx, clinic.ID, ip); err != nil {
				return err
			} else if bloqueada {
				return errIPBloqueadaTurnoPublico
			}

			// Fase 2.4.1: un mail bloqueado (ver email_bloqueado_turno_publico.go)
			// no puede pedir turno — por las dudas, además del chequeo que ya
			// hace enviarVerificacionTurnoPublicoHandler: un token emitido
			// ANTES del bloqueo podría seguir vigente hasta 30 min más.
			if bloqueado, err := emailEstaBloqueado(tx, clinic.ID, req.EmailContacto); err != nil {
				return err
			} else if bloqueado {
				return errEmailBloqueadoTurnoPublico
			}

			// Consume el token de "Confirmanos que sos vos" (E5.6) ANTES de
			// cualquier otra cosa — un pedido sin prueba de verificación
			// válida para ESTE mail no debe siquiera llegar a chequear
			// disponibilidad. Si el resto de la transacción falla más
			// adelante (horario ya no disponible), todo se revierte
			// junto, token incluido — el paciente puede reintentar con
			// otro horario sin verificar de nuevo.
			if err := consumirVerificacionTurnoPublico(tx, clinic.ID.String(), req.EmailContacto, req.VerificacionToken); err != nil {
				return err
			}

			// Revalida el horario DENTRO de la transacción — el paciente
			// pudo tardar en completar el resto del formulario y otra
			// persona (o el propio profesional, a mano) ya haber tomado
			// ese horario mientras tanto. El exclusion constraint (T2.5)
			// es la garantía final a nivel de base; este chequeo es lo que
			// convierte esa carrera en un mensaje legible ("elegí otro
			// horario") en vez del genérico de más abajo.
			slots, err := calcularDisponibilidad(tx, clinic.ID, tipo, fecha, nil)
			if err != nil {
				return err
			}
			disponible := false
			for _, s := range slots {
				if s == req.Hora {
					disponible = true
					break
				}
			}
			if !disponible {
				return errHorarioPublicoYaNoDisponible
			}

			// Corrección de QA, pedido textual del cliente: "sea paciente
			// verificado o no verificado solo puede tener un turno activo
			// con el mismo dni, sea el tipo de consulta que sea" — chequeo
			// ANTES de resolver/crear cualquier ficha (mismo motivo que el
			// detector de mail-abuso de abajo: no dejar una ficha huérfana
			// sin turno si este pedido se rechaza).
			if !usaPacienteVerificado {
				turnoActivo, err := turnoActivoPorDNI(tx, clinic.ID, turno.DNIContacto)
				if err != nil {
					return err
				}
				if turnoActivo != nil {
					return &errYaTieneUnTurnoActivo{email: turnoActivo.EmailContacto}
				}
			}

			// TR-107 (Rule A/B) — inalcanzable en la práctica desde la
			// regla de arriba (topea en 1 turno activo por DNI sin
			// importar el tipo, la de acá solo llega a topear en el mismo
			// caso o más tarde). Se deja el código sin tocar, por pedido
			// explícito del cliente de sesiones anteriores ("no descartar
			// nada de lo ya establecido").
			if !usaPacienteVerificado {
				turnoMismoTipo, err := turnoActivoDelMismoTipo(tx, clinic.ID, turno.DNIContacto, tipo.ID)
				if err != nil {
					return err
				}
				if turnoMismoTipo != nil {
					return &errTurnoActivoConOtroMail{email: turnoMismoTipo.EmailContacto}
				}

				turnoOtroTipo, err := turnoActivoDeOtroTipo(tx, clinic.ID, turno.DNIContacto, tipo.ID)
				if err != nil {
					return err
				}
				if turnoOtroTipo != nil {
					otroTipoVerificado := false
					if turnoOtroTipo.PacienteID != nil {
						var pacienteOtroTipo db.Paciente
						err := tx.First(&pacienteOtroTipo, "id = ?", *turnoOtroTipo.PacienteID).Error
						if err == nil {
							otroTipoVerificado, err = pacienteEstaVerificado(tx, pacienteOtroTipo)
							if err != nil {
								return err
							}
						} else if !errors.Is(err, gorm.ErrRecordNotFound) {
							return err
						}
					}
					if !otroTipoVerificado {
						return &errYaTieneOtroTipoActivo{turno: *turnoOtroTipo}
					}
				}
			}

			// Corrección de seguridad (Fase 2.4.1), pedido textual del
			// cliente: "si un usuario malicioso genera turnos con un mismo
			// mail y diferentes DNIs... bloquear ese mail y borrar los
			// turnos que subió" — solo para el camino "para mí" (sin
			// pacienteVerificadoId: la única que fabrica identidades
			// nuevas). Corrección de QA sobre el diseño inicial: "al
			// ingresar el tercer turno debería saltar la alerta, que no
			// ingrese el tercer turno y borrar los anteriores" — el
			// chequeo corre ANTES de resolver/crear la ficha de paciente de
			// ESTE pedido (no solo antes del turno): si se chequeara
			// después, un DNI nuevo abusivo ya habría creado su propia
			// ficha (crearPacientePublicoConDeteccionDeConflicto, más
			// abajo) aunque el turno se rechace, dejando una ficha
			// huérfana sin ningún turno que la sostenga. Si el DNI de este
			// pedido es NUEVO para este mail y ya hay
			// limiteDNIsDistintosPorMail DNIs distintos en archivo, el
			// pedido que dispara el límite ni llega a crear nada — solo se
			// borran los que ya existían.
			if !usaPacienteVerificado {
				dnisExistentes, err := dnisVigentesPorMail(tx, clinic.ID, turno.EmailContacto)
				if err != nil {
					return err
				}
				dniYaRegistrado := false
				for _, d := range dnisExistentes {
					if d == turno.DNIContacto {
						dniYaRegistrado = true
						break
					}
				}
				if !dniYaRegistrado && len(dnisExistentes) >= limiteDNIsDistintosPorMail {
					if err := bloquearMailPorAbusoDeDNIsYBorrarTurnos(tx, clinic.ID, turno.EmailContacto, ip, deps.SimularBloqueosSeguridad); err != nil {
						return err
					}
					// Corrección de QA sobre el modo simulado: el borrado de
					// los turnos que ya existían de este mail pasa de verdad
					// ("para ver que sí funciona") — lo único que cambia en
					// modo simulado es que el mail/IP no quedan bloqueados
					// de verdad.
					if deps.SimularBloqueosSeguridad {
						log.Printf("[simulado] mail con muchos DNIs detectado: email=%s dnis_existentes=%d (turnos anteriores borrados de verdad; mail/IP NO quedaron bloqueados)", turno.EmailContacto, len(dnisExistentes))
					}
					mensajeBloqueoAbuso = "este mail no puede pedir turno por ahora"
					return nil
				}
			}

			// Fase 2.4.1: dos caminos para resolver a qué ficha se vincula
			// el turno. "Ya he venido antes" (pacienteVerificadoId) usa la
			// ficha tal cual, sin pasar por detección de conflicto — ya se
			// demostró control del mail/DNI en el paso de la tarjeta.
			// "Primera vez" sigue el camino nuevo con detección de
			// conflicto (F4.1.3) — nunca crearOBuscarPacientePorDNI, esa
			// sigue siendo solo para el panel (TR-100/101).
			var paciente db.Paciente
			var conflictoConVerificado *db.Paciente
			var conflictoMotivo string
			if usaPacienteVerificado {
				if err := tx.Where("id = ? AND profesional_id = ?", pacienteVerificadoID, clinic.ID).First(&paciente).Error; err != nil {
					if errors.Is(err, gorm.ErrRecordNotFound) {
						return errPacienteVerificadoNoEncontrado
					}
					return err
				}
				// sincronizarContactoConPaciente (turnos.go) no toca el DNI —
				// asume que el turno YA tiene el DNI correcto, porque
				// siempre se llama después de haber encontrado la ficha
				// justamente POR ese DNI (TR-101). Acá no: el camino
				// "pacienteVerificadoId" ni siquiera manda DNI en la
				// request (la ficha ya se identificó del todo con la
				// tarjeta), así que hay que copiarlo a mano.
				turno.DNIContacto = paciente.DNI
				sincronizarContactoConPaciente(&turno, paciente)
			} else {
				resultado, err := crearPacientePublicoConDeteccionDeConflicto(tx, clinic.ID, &turno)
				if err != nil {
					return err
				}
				paciente = resultado.Paciente
				conflictoConVerificado = resultado.ConflictoConVerificado
				conflictoMotivo = resultado.Motivo
			}

			// Mismo chequeo universal de arriba ("un turno activo por DNI,
			// sea cual sea el tipo, esté o no verificado"), acá para el
			// camino "ya he venido antes" — recién ahora se conoce el DNI
			// (viene de la ficha elegida, `usaPacienteVerificado` no manda
			// DNI en la request). No aplica al camino "primera vez": ese
			// ya se chequeó ANTES de crear la ficha, más arriba.
			if usaPacienteVerificado {
				turnoActivo, err := turnoActivoPorDNI(tx, clinic.ID, turno.DNIContacto)
				if err != nil {
					return err
				}
				if turnoActivo != nil {
					return &errYaTieneUnTurnoActivo{email: turnoActivo.EmailContacto}
				}
			}

			// Guarda "ya tenés un turno de este tipo de consulta" (F4.1.3,
			// pedido textual del cliente) — se chequea acá, ya con la
			// ficha resuelta, para cubrir los dos caminos de arriba por
			// igual. Rama `verificado`: inalcanzable en la práctica desde
			// la regla nueva de arriba (turnoActivoPorDNI ya topea en 1
			// turno activo por DNI, sin importar el tipo, antes de llegar
			// acá) — se deja sin tocar por el mismo criterio de siempre.
			// Corrección de QA: SOLO si la ficha está VERIFICADA —
			// "si X no es verificado dejar pasar el turno, ya que no
			// sabemos con certeza quién es el impostor acá" (un DNI
			// compartido por dos mails distintos sin ninguno verificado no
			// prueba que sea la misma persona pidiendo dos veces).
			verificado, err := pacienteEstaVerificado(tx, paciente)
			if err != nil {
				return err
			}
			if verificado {
				existente, err := turnoVigenteDeTipo(tx, paciente.ID, tipo.ID)
				if err != nil {
					return err
				}
				if existente != nil {
					return &errTurnoPublicoDuplicado{turno: *existente}
				}
			} else {
				// Corrección de seguridad (Fase 2.4.1): sin verificar, no se
				// bloquea (ver el comentario de arriba) pero SÍ se topea —
				// más de limiteTurnosSinVerificarPorDNIYTipo turnos vigentes
				// con el mismo DNI+tipo ya no es "dos personas disputando un
				// DNI", es un patrón de abuso.
				cantidad, err := contarTurnosVigentesPorDNIYTipo(tx, clinic.ID, turno.DNIContacto, tipo.ID)
				if err != nil {
					return err
				}
				if cantidad >= limiteTurnosSinVerificarPorDNIYTipo {
					if deps.SimularBloqueosSeguridad {
						log.Printf("[simulado] tope DNI+tipo alcanzado: dni=%s tipo=%s (se habría rechazado con 409)", turno.DNIContacto, tipo.ID)
						ipCopia := ip
						if err := registrarAuditoriaBloqueo(tx, clinic.ID, "dni_tipo_tope", nil, &ipCopia, []string{turno.DNIContacto}, 0, true); err != nil {
							return err
						}
					} else {
						return errDemasiadosTurnosSinVerificarDelMismoTipo
					}
				}

				// Corrección de seguridad (Fase 2.4.1): "para el caso mail y
				// DNI juntos, nunca repitiendo ninguno" — ver el comentario
				// grande de limiteDistintosPorIPParaRotacion. Chequea ANTES
				// de crear el turno de ESTE pedido (con la IP ya mostrando el
				// patrón, no hace falta dejar pasar ni uno más) — pero
				// bloquearIPPorRotacionYBorrarTurnos sí borra los turnos
				// ANTERIORES de esa misma IP (corrección de QA, pedido
				// textual del cliente): cada uno aislado parecía legítimo,
				// pero en conjunto ya formaban el patrón. Apenas se bloquea,
				// ipEstaBloqueada (arriba de esta misma transacción) corta
				// cualquier pedido siguiente sin volver a evaluar nada.
				mailsDistintos, dnisDistintos, err := contarDistintosPorIP(tx, clinic.ID, ip)
				if err != nil {
					return err
				}
				if mailsDistintos >= limiteDistintosPorIPParaRotacion && dnisDistintos >= limiteDistintosPorIPParaRotacion {
					if err := bloquearIPPorRotacionYBorrarTurnos(tx, clinic.ID, ip, deps.SimularBloqueosSeguridad); err != nil {
						return err
					}
					// Corrección de QA sobre el modo simulado: acá el borrado de
					// los turnos anteriores de esa IP pasa de verdad ("para ver
					// que sí funciona") — lo único que cambia en modo simulado
					// es que la IP no queda bloqueada de verdad. El pedido que
					// gatilló el patrón de todos modos se rechaza (los turnos
					// que ya existían de esa IP acaban de borrarse).
					if deps.SimularBloqueosSeguridad {
						log.Printf("[simulado] rotación por IP detectada: ip=%s mails=%d dnis=%d (turnos anteriores borrados de verdad; la IP NO quedó bloqueada)", ip, mailsDistintos, dnisDistintos)
					}
					mensajeBloqueoAbuso = "no se puede pedir turno desde esta conexión por ahora"
					return nil
				}
			}

			turno.PacienteID = &paciente.ID
			if err := tx.Create(&turno).Error; err != nil {
				return err
			}

			if conflictoConVerificado != nil {
				conflicto := db.ConflictoPaciente{
					ProfesionalID:         clinic.ID,
					PacienteVerificadoID:  conflictoConVerificado.ID,
					PacienteEnConflictoID: paciente.ID,
					TurnoEnConflictoID:    turno.ID,
					Motivo:                conflictoMotivo,
				}
				if err := tx.Create(&conflicto).Error; err != nil {
					return err
				}
			}

			return nil
		})

		if err != nil {
			if errors.Is(err, errTurnoVerifPruebaInvalida) {
				writeError(w, http.StatusForbidden, "verificá tu mail antes de pedir el turno")
				return
			}
			if errors.Is(err, errEmailBloqueadoTurnoPublico) {
				writeError(w, http.StatusForbidden, "este mail no puede pedir turno por ahora")
				return
			}
			if errors.Is(err, errIPBloqueadaTurnoPublico) {
				writeError(w, http.StatusForbidden, err.Error())
				return
			}
			if errors.Is(err, errPacienteVerificadoNoEncontrado) {
				writeError(w, http.StatusBadRequest, "el paciente elegido no existe")
				return
			}
			var errTurnoActivo *errYaTieneUnTurnoActivo
			if errors.As(err, &errTurnoActivo) {
				writeError(w, http.StatusConflict, errTurnoActivo.Error())
				return
			}
			var errDuplicado *errTurnoPublicoDuplicado
			if errors.As(err, &errDuplicado) {
				writeError(w, http.StatusConflict, errDuplicado.Error())
				return
			}
			var errActivoOtroMail *errTurnoActivoConOtroMail
			if errors.As(err, &errActivoOtroMail) {
				writeError(w, http.StatusConflict, errActivoOtroMail.Error())
				return
			}
			var errOtroTipoActivo *errYaTieneOtroTipoActivo
			if errors.As(err, &errOtroTipoActivo) {
				writeError(w, http.StatusConflict, errOtroTipoActivo.Error())
				return
			}
			if errors.Is(err, errDemasiadosTurnosSinVerificarDelMismoTipo) {
				writeError(w, http.StatusConflict, err.Error())
				return
			}
			if errors.Is(err, errHorarioPublicoYaNoDisponible) || isExclusionViolation(err) {
				writeError(w, http.StatusConflict, "ese horario ya no está disponible, elegí otro")
				return
			}
			writeError(w, http.StatusInternalServerError, "no se pudo registrar el turno")
			return
		}
		if mensajeBloqueoAbuso != "" {
			writeError(w, http.StatusForbidden, mensajeBloqueoAbuso)
			return
		}

		// Pedido textual del cliente: "cada vez que se saque un turno,
		// enviar una notificación por mail, al mail con el que se hizo el
		// turno" — DESPUÉS de que la transacción ya comiteó (el turno
		// existe de verdad), un mail que falla nunca tumba el request que
		// lo dispara (mismo criterio que el resto de internal/mail).
		_ = deps.Mail.SendTurnoConfirmadoEmail(r.Context(), turno.EmailContacto, dmmail.TurnoConfirmadoInfo{
			NombreClinica:  clinic.Nombre,
			NombrePaciente: strings.TrimSpace(turno.NombreContacto + " " + turno.ApellidoContacto),
			Fecha:          formatFechaLargaEs(*turno.HoraInicio),
			HoraInicio:     clock.In(*turno.HoraInicio).Format("15:04"),
			HoraFin:        clock.In(*turno.HoraFin).Format("15:04"),
			TipoConsulta:   tipo.Nombre,
		})

		writeJSON(w, http.StatusCreated, solicitarTurnoPublicoResponse{
			ID:         turno.ID.String(),
			HoraInicio: turno.HoraInicio.Format(time.RFC3339),
			HoraFin:    turno.HoraFin.Format(time.RFC3339),
		})
	}
}
