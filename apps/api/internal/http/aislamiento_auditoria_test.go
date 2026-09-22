package http

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// archivosDelPanel — los archivos que sirven al PANEL. El wizard público
// y las pantallas de clínica/equipo no entran: ahí no hay "profesional
// actual". Compartida por las dos auditorías de aislamiento (la de las
// consultas por clínica y la de los ids que llegan por la URL): si un
// archivo nuevo del panel entra acá, entra a las dos.
var archivosDelPanel = []string{
	"turnos.go", "turnos_pendientes_asistencia.go", "pacientes.go",
	"pacientes_conflicto_panel.go", "panel_notificaciones.go",
	"tipos_consulta.go", "tipos_consulta_colegas.go", "bloqueos_horario.go",
	"horario_atencion.go", "disponibilidad.go", "enlace_turno.go",
	"seguridad_turno_publico.go", "pagina_publica.go", "especialidades.go",
	"pacientes_de_la_clinica.go",
	// Los contadores de las pestañas (ronda de optimización post-Fase
	// 3). Hoy no tienen ni una consulta propia por clínica —todo pasa
	// por `filtrosComunesDeTurnos`/`filtrosComunesDePacientes`, que
	// viven en archivos ya auditados—, así que entrar a la lista no
	// cuesta nada. Es para mañana: el día que alguien les agregue una
	// consulta directa, esta auditoría la tiene que ver.
	"turnos_contadores.go", "pacientes_contadores.go",
}

// TestAislamiento_NingunaConsultaDelPanelSinAcotar — la regla de
// aislamiento, verificada sobre el CÓDIGO y no sobre la memoria de quien
// escribe (Fase 3.2.5, 2026-09-14).
//
// POR QUÉ ESTE TEST EXISTE. El aislamiento entre colegas se rompió cuatro
// veces seguidas, siempre igual: una consulta nueva —o una vieja que
// nadie revisó— filtraba por `clinic_id` y no por profesional. Turnos,
// horario de atención, horarios reservados, tipos de consulta,
// disponibilidad, las siete tarjetas de "General", autoreservar, la
// cancelación masiva. Ninguna se nota mirando la pantalla propia: los
// datos aparecen, solo que son de otro.
//
// Lo que fallaba no era la regla, que estaba escrita en CLAUDE.md desde
// la 3.2.2 — era que aplicarla dependía de acordarse. Y el propio
// documento decía que cubría "17 queries de turnos y 8 de pacientes"
// cuando las reales eran 1 y 3: un número escrito de memoria, nunca
// medido, que hacía creer que el trabajo estaba hecho.
//
// Este test es el equivalente, en código de aplicación, de lo que el
// proyecto ya hace en la base: una regla que no se puede violar no se
// valida, se declara (spec §4.3, el EXCLUDE de no-solapamiento). Acá no
// se puede declarar en el motor, así que se declara en un test que lee
// el código y falla si aparece una consulta nueva sin acotar.
//
// CÓMO AGREGAR UNA CONSULTA NUEVA: o la acotás con uno de los scopes de
// visibilidad.go, o la agregás a `clinicaWide` de abajo con el motivo por
// el que es de la clínica y no de una persona. Las dos cosas son
// decisiones legítimas; lo que no lo es es no elegir.
func TestAislamiento_NingunaConsultaDelPanelSinAcotar(t *testing.T) {
	archivos := archivosDelPanel

	// Los scopes de visibilidad.go.
	scopes := []string{
		"soloMisTurnos", "soloMisPacientes", "soloMiAgenda",
		"soloMisConflictos", "soloMisTiposDeConsulta",
		// soloDeLaAgendaDe (QA de la 3.2.6): el mismo criterio que
		// `soloMiAgenda`, pero sobre un profesional YA resuelto en vez de
		// sobre la sesión. Lo usan los endpoints de configuración, donde
		// "toda la clínica" no es una respuesta posible y la agenda puede
		// venir pedida en el propio request.
		"soloDeLaAgendaDe",
	}
	// El filtro escrito a mano en el propio WHERE cuenta igual: lo que
	// importa es que la consulta esté acotada, no por qué vía.
	inline := regexp.MustCompile(`user_id\s*=\s*\?|atendido_por_user_id\s*=\s*\?`)
	mencionaClinica := regexp.MustCompile(`clinic_id\s*=\s*\?|pacientes\.clinic_id`)

	// Consultas que son de la CLÍNICA a propósito. La clave es el archivo
	// y un fragmento único de la línea — no el número, que se mueve con
	// cualquier edición y convertiría este test en ruido.
	clinicaWide := map[string][]string{
		"turnos.go": {
			// El paciente es de la clínica: es la regla de la 3.2.2, y lo
			// que hace que su ficha, sus mails y su historial sobrevivan a
			// quién lo atienda.
			`clinic_id = ? AND dni = ? AND en_conflicto = false`,
			`clinic_id = ? AND dni = ?`,
			`"id = ? AND clinic_id = ?", *pacienteExistenteID`,
			// El tipo del turno que se autoreserva; los turnos que llegan
			// acá ya vienen acotados.
			`"id = ? AND clinic_id = ?", *t.TipoConsultaID`,
		},
		"pacientes.go": {
			// La columna "Profesionales" de la vista general (Fase 3.2.6):
			// la pregunta es justamente "¿de QUIÉNES es esta ficha?", así
			// que acotarla a uno la volvería inútil. Se llama solo cuando
			// `veTodaLaClinica(r)`, y usa los mismos tres criterios que
			// `soloMisPacientes` leídos al revés — si divergen, la columna
			// diría que un paciente es de alguien que no lo ve en su
			// propia lista.
			`WHERE t.clinic_id = ? AND t.paciente_id IS NOT NULL`,
			`WHERE p.clinic_id = ? AND p.creado_por_user_id IS NOT NULL`,
			`WHERE p2.clinic_id = ?`,
			// Unicidad de DNI por clínica (TR-100): una persona, una ficha.
			`clinic_id = ? AND dni = ?`,
			// Mapas auxiliares: se consultan solo para pacientes que ya
			// pasaron por soloMisPacientes.
			`pacientes.clinic_id = ?`,
		},
		"tipos_consulta_colegas.go": {
			// Los de los colegas, a propósito: es la función.
			`clinic_id = ? AND user_id IS NOT NULL`,
			`clinic_id = ? AND user_id = ?`,
		},
		// CLÍNICA-WIDE A PROPÓSITO, y solo para recepción: el aviso de
		// conflictos tiene que alcanzar a toda la clínica desde cualquier
		// vista — *"el recepcionista tiene que estar al tanto de cualquier
		// conflicto, sea la vista que sea"* (QA de la 3.2.6, 2026-09-21).
		//
		// Para cualquier otro rol la función SÍ aplica `soloMisTurnos` /
		// `soloMiAgenda`, elegidos unas líneas más arriba de cada consulta
		// (por eso el patrón de este test no los ve acá). Y el cruce entre
		// agendas se corta igual: cada turno se compara solo contra la
		// suya, ver `turnoChocaConSuAgenda`.
		"panel_notificaciones.go": {
			`clinic_id = ? AND estado = 'agendado' AND hora_fin >= ?`,
			`(especifico = true AND fecha >= ?)`,
			`clinic_id = ? AND alcance <> ? AND fecha_hasta >= ?`,
		},
		"disponibilidad.go": {
			// Mapa de duraciones por id; se consulta solo para turnos ya
			// acotados.
			`Where("clinic_id = ?", clinicID).Find(&todosTipos)`,
		},
		"enlace_turno.go": {
			// El TOKEN es la autorización: lo usa el paciente, sin sesión.
			`clinic_id = ? AND token_hash = ?`,
			// La ficha que un profesional elige al generar un enlace: la
			// identidad del paciente es de la CLÍNICA (TR-144), igual que
			// en /pacientes/de-la-clinica. Acotarla al profesional
			// impediría mandarle el link a alguien que atiende un colega,
			// que es medio mostrador y medio el caso de uso.
			`id = ? AND clinic_id = ?`,
		},
		// Protegen el formulario público, que es uno por clínica.
		"seguridad_turno_publico.go": {`clinic_id`},
		// Una página pública por clínica; además exige rol admin.
		"pagina_publica.go": {`clinic_id = ?`},
		// Catálogo global.
		"especialidades.go": {`clinic_id`},
		// La identidad del paciente es de la CLÍNICA, por decisión del
		// cliente (2026-09-15): cualquiera que vaya a cargarle un turno
		// tiene que poder encontrar su ficha, o se duplican personas. Lo
		// que sigue siendo de cada profesional es su lista de trabajo
		// (/pacientes), que es otra pregunta. Ver el comentario de cabecera
		// de ese archivo.
		//
		// Las tres consultas del archivo miran la clínica entera a
		// propósito, y son la misma idea: quién es esta persona
		// (/pacientes/de-la-clinica), si ya está ocupada a esa hora con
		// otro profesional, y si ya tiene un turno activo de ese mismo
		// tipo. Acotarlas por profesional las volvería inútiles — el caso
		// que cada una detecta es, justamente, el turno del colega.
		"pacientes_de_la_clinica.go": {`clinic_id`},
	}

	permitida := func(archivo, linea string) bool {
		for _, frag := range clinicaWide[archivo] {
			if strings.Contains(linea, frag) {
				return true
			}
		}
		return false
	}

	var sinAcotar []string
	for _, nombre := range archivos {
		datos, err := os.ReadFile(filepath.Clean(nombre))
		if err != nil {
			// Un archivo que se renombró no debe romper el test, pero sí
			// avisar: la lista de arriba quedó desactualizada.
			t.Logf("no se pudo leer %s (¿se renombró?): %v", nombre, err)
			continue
		}
		lineas := strings.Split(strings.ReplaceAll(string(datos), "\r\n", "\n"), "\n")
		for i, linea := range lineas {
			if !mencionaClinica.MatchString(linea) {
				continue
			}
			// Una cadena de GORM se parte en varias líneas y el
			// `.Scopes(...)` puede caer de cualquier lado.
			desde, hasta := i-3, i+4
			if desde < 0 {
				desde = 0
			}
			if hasta > len(lineas) {
				hasta = len(lineas)
			}
			ventana := strings.Join(lineas[desde:hasta], "\n")

			acotada := inline.MatchString(ventana)
			for _, s := range scopes {
				if strings.Contains(ventana, s) {
					acotada = true
					break
				}
			}
			if acotada || permitida(nombre, linea) {
				continue
			}
			sinAcotar = append(sinAcotar, nombre+":"+strconv.Itoa(i+1)+"  "+strings.TrimSpace(linea))
		}
	}

	if len(sinAcotar) > 0 {
		t.Errorf("hay %d consulta(s) del panel que filtran por clínica y no por profesional.\n"+
			"Acotala con un scope de visibilidad.go, o sumala a `clinicaWide` en este test\n"+
			"con el motivo por el que es de la clínica:\n\n  %s",
			len(sinAcotar), strings.Join(sinAcotar, "\n  "))
	}
}
