package http

import (
	"net/http"
	"strings"
	"unicode"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// Tipos de consulta compartidos entre colegas (Fase 3.2.5).
//
// LA REGLA CENTRAL, que ya estaba escrita en el modelo desde la 3.2.1:
// incluir el tipo de un colega **COPIA la fila, no la comparte**. Un tipo
// de consulta no es solo un nombre — lleva duración, color, tiempo
// post-consulta y preferencia horaria, que son configuración de agenda
// que cada profesional ajusta a su manera. Con una fila común, que un
// colega acortara "Conducto" de 60 a 45 minutos le movería los huecos del
// día a todos los demás.
//
// Lo que se comparte, entonces, es la SUGERENCIA: "tu colega ya tiene uno
// que se llama así, ¿lo querés con tus tiempos?".
//
// Por eso acá hay UN endpoint y no dos. Hubo un "incluir" que copiaba la
// fila de un saque; se sacó el 2026-09-14 cuando el cliente pidió que los
// tipos ya creados vivieran adentro del formulario de alta: elegir uno
// solo rellena nombre y color, y el tipo se crea por el alta de siempre,
// con los tiempos que la persona configura antes de guardar. La copia
// dejó de necesitar un camino propio en la API.
type tipoDeColegaResponse struct {
	tipoConsultaResponse
	// De quién es. El nombre y no solo el id porque la pantalla dice
	// "Conducto — de Lucía Ferrer": sin eso, dos tipos iguales de dos
	// colegas distintos son indistinguibles.
	DeUserID string `json:"deUserId"`
	DeNombre string `json:"deNombre"`
	// YaTenesUnoParecido — si alguno de los tuyos se le parece por
	// nombre. No lo bloquea: avisa. Tener "Conducto" y "Conductos" es
	// redundante pero no ilegal, y quien decide es la persona.
	YaTenesUnoParecido bool `json:"yaTenesUnoParecido"`
}

// normalizarNombreTipo deja el nombre en su forma comparable: sin
// acentos, sin mayúsculas, sin puntuación y sin espacios de más.
//
// Es lo que hace que "Conducto", "conducto" y "CONDUCTO " sean lo mismo
// antes de medir ninguna distancia — la mayoría de los "parecidos" reales
// se resuelven acá, no en el algoritmo.
func normalizarNombreTipo(s string) string {
	sinAcentos, _, err := transform.String(
		transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC),
		s,
	)
	if err != nil {
		sinAcentos = s
	}
	var b strings.Builder
	anteriorFueEspacio := true
	for _, r := range strings.ToLower(sinAcentos) {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
			anteriorFueEspacio = false
		case !anteriorFueEspacio:
			b.WriteRune(' ')
			anteriorFueEspacio = true
		}
	}
	return strings.TrimSpace(b.String())
}

// distancia — Levenshtein clásico, sobre runas y no bytes (un nombre con
// "ñ" mediría de más en bytes).
//
// Dos filas y no una matriz completa: los nombres de tipo de consulta
// tienen 80 caracteres como tope, así que el ahorro no es de rendimiento,
// es de código que no hay que leer.
func distancia(a, b []rune) int {
	if len(a) == 0 {
		return len(b)
	}
	if len(b) == 0 {
		return len(a)
	}
	previa := make([]int, len(b)+1)
	actual := make([]int, len(b)+1)
	for j := range previa {
		previa[j] = j
	}
	for i := 1; i <= len(a); i++ {
		actual[0] = i
		for j := 1; j <= len(b); j++ {
			costo := 1
			if a[i-1] == b[j-1] {
				costo = 0
			}
			actual[j] = min(min(actual[j-1]+1, previa[j]+1), previa[j-1]+costo)
		}
		previa, actual = actual, previa
	}
	return previa[len(b)]
}

// umbralParecido — qué tan distintos pueden ser dos nombres y seguir
// siendo "el mismo tipo escrito de otra forma".
//
// 0.8 sobre el largo del más largo: deja pasar plural/singular y un error
// de tipeo ("conducto"/"conductos", "endodoncia"/"endodoncia "), y corta
// antes de juntar cosas que de verdad son distintas ("control" y
// "consulta" quedan en 0.5, afuera).
const umbralParecido = 0.8

// seParecen — ¿son el mismo tipo escrito distinto?
func seParecen(a, b string) bool {
	na, nb := normalizarNombreTipo(a), normalizarNombreTipo(b)
	if na == "" || nb == "" {
		return false
	}
	if na == nb {
		return true
	}
	ra, rb := []rune(na), []rune(nb)
	masLargo := max(len(ra), len(rb))
	return 1-float64(distancia(ra, rb))/float64(masLargo) >= umbralParecido
}

func registerTiposConsultaDeColegasRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/tipos-consulta/de-colegas", listarTiposDeColegasHandler(gdb))
}

// listarTiposDeColegasHandler — los tipos de los demás profesionales de
// esta clínica, para elegir cuáles incluir.
func listarTiposDeColegasHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		session, hay := sessionFromContext(r)
		if !hay {
			writeError(w, http.StatusUnauthorized, "sesión inválida")
			return
		}

		var ajenos []db.TipoConsulta
		if err := gdb.Where("clinic_id = ? AND user_id IS NOT NULL AND user_id <> ?", clinicID, session.UserID).
			Order("created_at").Find(&ajenos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los tipos de tus colegas")
			return
		}

		var mios []db.TipoConsulta
		_ = gdb.Where("clinic_id = ? AND user_id = ?", clinicID, session.UserID).Find(&mios).Error

		// Los nombres de cada colega, en una sola pasada: una consulta por
		// tipo sería N+1 sobre una lista que se pinta entera.
		nombres := nombresDeLosMiembros(gdb, ajenos)

		out := make([]tipoDeColegaResponse, 0, len(ajenos))
		for _, t := range ajenos {
			parecido := false
			for _, mio := range mios {
				if seParecen(mio.Nombre, t.Nombre) {
					parecido = true
					break
				}
			}
			fila := tipoDeColegaResponse{
				tipoConsultaResponse: toTipoConsultaResponse(t),
				YaTenesUnoParecido:   parecido,
			}
			if t.UserID != nil {
				fila.DeUserID = t.UserID.String()
				fila.DeNombre = nombres[*t.UserID]
			}
			out = append(out, fila)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// nombresDeLosMiembros resuelve "de quién es" para un lote de tipos, en
// dos consultas y no en dos por fila.
func nombresDeLosMiembros(gdb *gorm.DB, tipos []db.TipoConsulta) map[uuid.UUID]string {
	ids := make([]uuid.UUID, 0, len(tipos))
	vistos := make(map[uuid.UUID]bool, len(tipos))
	for _, t := range tipos {
		if t.UserID != nil && !vistos[*t.UserID] {
			vistos[*t.UserID] = true
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
		nombres[p.UserID] = strings.TrimSpace(p.Nombre + " " + p.Apellido)
	}
	// Quien todavía no cargó perfil se muestra por su mail, igual que en
	// la pantalla de colaboradores — nunca un id crudo.
	var users []db.User
	_ = gdb.Where("id IN ?", ids).Find(&users).Error
	for _, u := range users {
		if nombres[u.ID] == "" {
			nombres[u.ID] = u.Email
		}
	}
	return nombres
}
