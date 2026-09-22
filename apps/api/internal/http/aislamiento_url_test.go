package http

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// TestAislamiento_LosIDsDeLaURLSeAcotan — la auditoría que le faltaba a
// la de `TestAislamiento_NingunaConsultaDelPanelSinAcotar` (revisión de
// aislamiento, 2026-09-23).
//
// Aquella mira las consultas que filtran por `clinic_id` y exige que
// también filtren por profesional. Pero una consulta por `id = ?` SIN
// `clinic_id` no la ve nunca — y esa es la forma clásica de un IDOR:
// cambiar el id en la URL y tocar algo que no es tuyo. En la revisión de
// esa fecha se miraron a mano, handler por handler, y dieron limpias;
// este test es lo que las mantiene así.
//
// Dos niveles, porque son dos aislamientos distintos:
//
//   - en TODO el paquete, un id que llega por la URL se busca junto con
//     `clinic_id` — que el id de una clínica no sirva en otra;
//   - en los archivos del PANEL, además con el filtro del profesional —
//     que el id de un colega no sirva en tu agenda.
//
// Cómo decide: para cada `uuid.Parse(chi.URLParam(r, "..."))`, busca la
// primera consulta que usa esa variable y mira tres líneas para cada
// lado (una cadena de GORM se parte en varias). Si el id no se usa en una
// consulta directa —se lo pasa a un helper—, el test falla: la regla no
// puede verificarlo sola y alguien tiene que mirarlo y declararlo.
//
// Las excepciones van atadas al FRAGMENTO EXACTO de la consulta, igual
// que `clinicaWide` en la otra auditoría: si alguien cambia esa consulta,
// la excepción deja de aplicar y el test obliga a revisarla de nuevo.
func TestAislamiento_LosIDsDeLaURLSeAcotan(t *testing.T) {
	scopesDelProfesional := []string{
		"soloMisTurnos", "soloMisPacientes", "soloMiAgenda",
		"soloMisConflictos", "soloMisTiposDeConsulta", "soloDeLaAgendaDe",
	}
	parametroDeLaURL := regexp.MustCompile(`(\w+),\s*err\s*:?=\s*uuid\.Parse\(chi\.URLParam\(r,\s*"(\w+)"\)\)`)
	esConsulta := regexp.MustCompile(`\.(Where|First|Delete|Find|Take|Update|Updates|Model|Raw|Exec)\(`)
	delProfesionalEnLinea := regexp.MustCompile(`\b(atendido_por_)?user_id\s*=\s*\?`)

	// Buscan el id SIN `clinic_id`, y está bien.
	sinClinica := map[string][]string{
		// La invitación todavía no es de ninguna clínica para quien la
		// recibe: es suya porque va dirigida a SU mail — el de la fila del
		// usuario de la sesión, no uno que venga en el request.
		"invitaciones_recibidas.go": {`"id = ? AND email = ? AND accepted_at IS NULL AND expires_at > ?"`},
	}
	// En el panel, buscan el id por clínica pero NO por profesional, y
	// está bien.
	sinProfesional := map[string][]string{
		// Sumar a MI lista una ficha que ya existe en la clínica (TR-144,
		// TR-157): la identidad del paciente es de la clínica, y la ficha
		// que se suma todavía no es de quien la suma — ese es el punto.
		"pacientes_de_la_clinica.go": {`"id = ? AND clinic_id = ? AND en_conflicto = false"`},
		// Los bloqueos de mail e IP del formulario público protegen a la
		// clínica entera, no a una agenda (lo dice CLAUDE.md: "Lo que
		// queda clínica-wide a propósito").
		"seguridad_turno_publico.go": {"db.EmailBloqueadoTurnoPublico", "db.IPBloqueadaTurnoPublico"},
	}

	delPanel := map[string]bool{}
	for _, f := range archivosDelPanel {
		delPanel[f] = true
	}
	permitida := func(excepciones map[string][]string, archivo, ventana string) bool {
		for _, frag := range excepciones[archivo] {
			if strings.Contains(ventana, frag) {
				return true
			}
		}
		return false
	}

	archivos, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("no se pudieron listar los archivos: %v", err)
	}

	var problemas []string
	revisados := 0
	for _, archivo := range archivos {
		if strings.HasSuffix(archivo, "_test.go") {
			continue
		}
		datos, err := os.ReadFile(filepath.Clean(archivo))
		if err != nil {
			t.Fatalf("no se pudo leer %s: %v", archivo, err)
		}
		lineas := strings.Split(strings.ReplaceAll(string(datos), "\r\n", "\n"), "\n")

		for i, linea := range lineas {
			m := parametroDeLaURL.FindStringSubmatch(linea)
			if m == nil {
				continue
			}
			revisados++
			variable, parametro := m[1], m[2]
			donde := archivo + ":" + strconv.Itoa(i+1) + " {" + parametro + "}"

			usaLaVariable := regexp.MustCompile(`\b` + regexp.QuoteMeta(variable) + `\b`)
			uso := -1
			for j := i + 1; j < len(lineas) && j < i+45; j++ {
				if usaLaVariable.MatchString(lineas[j]) && esConsulta.MatchString(lineas[j]) {
					uso = j
					break
				}
			}
			if uso < 0 {
				problemas = append(problemas, donde+": el id no se usa en una consulta directa "+
					"(¿lo recibe un helper?) — revisá a mano cómo se acota y declaralo acá")
				continue
			}

			desde, hasta := max(uso-3, 0), min(uso+4, len(lineas))
			ventana := strings.Join(lineas[desde:hasta], "\n")

			if !strings.Contains(ventana, "clinic_id") && !permitida(sinClinica, archivo, ventana) {
				problemas = append(problemas, donde+": se busca sin `clinic_id` — el id de otra clínica serviría acá")
			}
			if delPanel[archivo] {
				acotada := delProfesionalEnLinea.MatchString(ventana)
				for _, s := range scopesDelProfesional {
					if strings.Contains(ventana, s) {
						acotada = true
						break
					}
				}
				if !acotada && !permitida(sinProfesional, archivo, ventana) {
					problemas = append(problemas, donde+": se busca sin el filtro del profesional — "+
						"el id de un colega serviría acá")
				}
			}
		}
	}

	// Un piso, para que el test no pase en silencio si el patrón deja de
	// encontrar los handlers (un renombre de `chi.URLParam`, por ejemplo).
	// Contados el 2026-09-23: 20.
	if revisados < 15 {
		t.Errorf("solo se encontraron %d ids de URL para revisar; se esperaban unos 20 — "+
			"¿cambió la forma de leerlos y esta auditoría dejó de verlos?", revisados)
	}
	if len(problemas) > 0 {
		t.Errorf("hay %d id(s) de la URL que no quedan acotados:\n\n  %s",
			len(problemas), strings.Join(problemas, "\n  "))
	}
}
