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
	// Origen — de dónde sale esta sugerencia: `colega` si la tiene
	// alguien de la clínica, `catalogo` si es del repertorio odontológico
	// (tipos_consulta_catalogo.go). La pantalla los agrupa distinto: uno
	// dice "esto ya se usa acá", el otro "esto se suele usar".
	Origen string `json:"origen"`
}

const (
	origenTipoColega   = "colega"
	origenTipoCatalogo = "catalogo"
)

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
		// DE QUIÉN SON "LOS MÍOS" — la agenda, no el usuario de la sesión
		// (QA de la 3.2.6, 2026-09-20). Este archivo tenía el mismo bug que
		// su hermano `tipos_consulta.go`: comparaba contra quien apretaba
		// el botón. Para recepción eso es alguien que no atiende y no tiene
		// ningún tipo, así que "lo que ya tenés" quedaba vacío y el modal
		// le seguía sugiriendo tipos que el profesional YA tenía
		// configurados — el síntoma reportado. Y por el mismo motivo los
		// propios del profesional en foco aparecían listados como si
		// fueran "de un colega".
		duenio, ok := agendaAConfigurar(w, r, gdb, clinicID, r.URL.Query().Get("profesionalUserId"))
		if !ok {
			return
		}
		if duenio == uuid.Nil {
			// Sin profesional elegido no hay "colegas" respecto de quién.
			writeJSON(w, http.StatusOK, []tipoDeColegaResponse{})
			return
		}

		var ajenos []db.TipoConsulta
		if err := gdb.Where("clinic_id = ? AND user_id IS NOT NULL AND user_id <> ?", clinicID, duenio).
			Order("created_at").Find(&ajenos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los tipos de tus colegas")
			return
		}

		var mios []db.TipoConsulta
		_ = gdb.Where("clinic_id = ? AND user_id = ?", clinicID, duenio).Find(&mios).Error

		// Los nombres de cada colega, en una sola pasada: una consulta por
		// tipo sería N+1 sobre una lista que se pinta entera.
		nombres := nombresDeLosMiembros(gdb, ajenos)

		// LO QUE YA TENÉS NO SE OFRECE (corrección del 2026-09-15,
		// reportada por el cliente). Antes se listaba igual con un cartel
		// "ya tenés uno parecido", y eso estaba mal de dos maneras:
		//
		//   - Es ruido: ofrecer como punto de partida algo que ya existe
		//     en tu lista no te ahorra nada.
		//   - Y era engañoso. Dos profesionales con "Consulta general" en
		//     colores distintos tienen EL MISMO tipo, no uno parecido: el
		//     color es preferencia de cada agenda, no identidad. El cartel
		//     sugería que había una diferencia real.
		//
		// La comparación es por nombre normalizado (`seParecen`), que es
		// lo que define un tipo de consulta — la duración y el color son
		// configuración de quien lo usa.
		yaLoTengo := func(nombre string) bool {
			for _, mio := range mios {
				if seParecen(mio.Nombre, nombre) {
					return true
				}
			}
			return false
		}

		out := make([]tipoDeColegaResponse, 0, len(ajenos)+len(catalogoTiposConsulta))
		yaOfrecido := make(map[string]bool, len(ajenos))

		// Primero los de la clínica: "esto ya se usa acá" pesa más que
		// "esto se suele usar".
		for _, t := range ajenos {
			if yaLoTengo(t.Nombre) || yaOfrecido[normalizarNombreTipo(t.Nombre)] {
				continue
			}
			yaOfrecido[normalizarNombreTipo(t.Nombre)] = true
			fila := tipoDeColegaResponse{
				tipoConsultaResponse: toTipoConsultaResponse(t),
				Origen:               origenTipoColega,
			}
			if t.UserID != nil {
				fila.DeUserID = t.UserID.String()
				fila.DeNombre = nombres[*t.UserID]
			}
			out = append(out, fila)
		}

		// Y después el repertorio, sin repetir lo que ya ofreció un
		// colega: el mismo nombre dos veces en la misma fila no se
		// distingue.
		for _, s := range catalogoTiposConsulta {
			if yaLoTengo(s.Nombre) || yaOfrecido[normalizarNombreTipo(s.Nombre)] {
				continue
			}
			yaOfrecido[normalizarNombreTipo(s.Nombre)] = true
			out = append(out, tipoDeColegaResponse{
				tipoConsultaResponse: tipoConsultaResponse{
					Nombre: s.Nombre, Color: s.Color, DuracionMinutos: s.DuracionMinutos,
				},
				Origen: origenTipoCatalogo,
			})
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
