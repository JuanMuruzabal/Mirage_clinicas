package http

import (
	"errors"
	"net/http"
	"net/mail"
	"strings"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/ratelimit"
)

// misTurnoPublicoResponse — pedido textual del cliente: "agregar un botón
// debajo de sacar turno de la página que sea MIS TURNOS, que pida dni y
// mail, si coincide con un turno activo mostrarlo en forma de tarjeta".
// A diferencia de "ya he venido antes" (pacienteVerificadoPublicoHandler),
// que exige un código de "Confirmanos que sos vos" antes de revelar nada,
// acá el cliente pidió DNI+mail directo, sin ese paso — la mitigación
// para no volverlo un lector de datos ajenos gratis es el rate limit por
// IP (ver el handler) más que un desafío de verificación. La respuesta va
// acotada a lo que hace falta para la tarjeta — ni el mail ni el DNI
// completo vuelven (quien preguntó ya los tiene).
type misTurnoPublicoResponse struct {
	Fecha              string `json:"fecha"`
	HoraInicio         string `json:"horaInicio"`
	HoraFin            string `json:"horaFin"`
	TipoConsultaNombre string `json:"tipoConsultaNombre"`
	NombreContacto     string `json:"nombreContacto"`
	ApellidoContacto   string `json:"apellidoContacto"`
}

// misTurnosPublicoHandler — GET /clinicas/{slug}/mis-turnos?dni=&email=.
// Gracias a la regla universal de "1 turno activo por DNI" (corrección
// de QA sobre TR-107), a lo sumo hay UN turno vigente por DNI — no hace
// falta devolver una lista.
func misTurnosPublicoHandler(gdb *gorm.DB, deps AuthDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		var clinic db.Clinic
		if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		// Rate limit por IP+clínica (mismo patrón que verificacion_turno_publico.go)
		// — sin código de verificación de por medio, probar combinaciones
		// de DNI al voleo tiene que costar algo.
		ip := clientIP(r)
		ipPorClinica := clinic.ID.String() + ":" + ip
		if deps.IPLimiter != nil && !deps.IPLimiter.Allow(db.RateLimitScopeMisTurnosConsulta, ipPorClinica, ratelimit.LimitMisTurnosConsultaPerIP) {
			writeError(w, http.StatusTooManyRequests, "demasiados intentos — esperá un rato antes de volver a probar")
			return
		}

		dni := strings.TrimSpace(r.URL.Query().Get("dni"))
		email := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("email")))
		if !dniRegex.MatchString(dni) {
			writeError(w, http.StatusBadRequest, "el DNI debe tener 7 u 8 dígitos, sin puntos")
			return
		}
		if _, err := mail.ParseAddress(email); err != nil {
			writeError(w, http.StatusBadRequest, "el email no tiene un formato válido")
			return
		}

		var turno db.Turno
		err := gdb.Where("profesional_id = ? AND dni_contacto = ? AND estado = 'agendado' AND hora_fin >= now()", clinic.ID, dni).
			Order("hora_inicio").First(&turno).Error
		if err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				writeError(w, http.StatusInternalServerError, "no se pudo buscar el turno")
				return
			}
			writeError(w, http.StatusNotFound, "no encontramos ningún turno activo con esos datos")
			return
		}
		// El mail tiene que coincidir con el que se usó para ESTE turno —
		// nunca se revela que el DNI tiene un turno a quien no conoce el
		// mail correcto (mismo motivo por el que dniCensurado/etc. existen
		// en el resto del código: un dato ajeno no sale gratis).
		if !strings.EqualFold(turno.EmailContacto, email) {
			writeError(w, http.StatusNotFound, "no encontramos ningún turno activo con esos datos")
			return
		}

		var tipoNombre string
		if turno.TipoConsultaID != nil {
			var tipo db.TipoConsulta
			if err := gdb.First(&tipo, "id = ?", *turno.TipoConsultaID).Error; err == nil {
				tipoNombre = tipo.Nombre
			}
		}

		var fecha, horaInicio, horaFin string
		if turno.HoraInicio != nil {
			local := clock.In(*turno.HoraInicio)
			fecha = local.Format("2006-01-02")
			horaInicio = local.Format("15:04")
		}
		if turno.HoraFin != nil {
			horaFin = clock.In(*turno.HoraFin).Format("15:04")
		}

		writeJSON(w, http.StatusOK, misTurnoPublicoResponse{
			Fecha:              fecha,
			HoraInicio:         horaInicio,
			HoraFin:            horaFin,
			TipoConsultaNombre: tipoNombre,
			NombreContacto:     turno.NombreContacto,
			ApellidoContacto:   turno.ApellidoContacto,
		})
	}
}
