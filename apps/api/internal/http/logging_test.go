package http

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// routerConLoggerDePrueba arma un router mínimo con el middleware de
// logging escribiendo a un buffer, para poder inspeccionar lo que emite.
func routerConLoggerDePrueba(t *testing.T, ruta string, h http.HandlerFunc) (*chi.Mux, *bytes.Buffer) {
	t.Helper()
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(loggerMiddleware(logger))
	r.Get(ruta, h)
	return r, &buf
}

// TestLogger_EmiteLosCamposEstructurados — la línea de log tiene que
// llevar lo que hace falta para diagnosticar: request_id correlacionable,
// método, ruta, status y latencia.
func TestLogger_EmiteLosCamposEstructurados(t *testing.T) {
	r, buf := routerConLoggerDePrueba(t, "/algo/{id}", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"ok": "si"})
	})

	req := httptest.NewRequest(http.MethodGet, "/algo/123", nil)
	r.ServeHTTP(httptest.NewRecorder(), req)

	var linea map[string]any
	if err := json.Unmarshal(buf.Bytes(), &linea); err != nil {
		t.Fatalf("la línea de log no es JSON válido: %v\nbuffer=%s", err, buf.String())
	}

	if linea["msg"] != "http" {
		t.Errorf("msg = %v, esperaba \"http\"", linea["msg"])
	}
	if linea["metodo"] != http.MethodGet {
		t.Errorf("metodo = %v, esperaba GET", linea["metodo"])
	}
	// Patrón de ruta, no el path concreto — mantiene la cardinalidad baja
	// y evita volcar identificadores al log.
	if linea["ruta"] != "/algo/{id}" {
		t.Errorf("ruta = %v, esperaba el PATRÓN \"/algo/{id}\", no el path concreto", linea["ruta"])
	}
	if linea["status"] != float64(http.StatusOK) {
		t.Errorf("status = %v, esperaba 200", linea["status"])
	}
	if _, ok := linea["duracion_ms"]; !ok {
		t.Error("falta duracion_ms")
	}
	if linea["request_id"] == "" || linea["request_id"] == nil {
		t.Error("falta request_id — sin eso no se pueden correlacionar las líneas de una misma request")
	}
}

// TestLogger_NuncaLogueaLaQueryString — LA regla no negociable de
// logging.go. `/clinicas/{slug}/mis-turnos?dni=...&email=...` lleva DNI y
// mail EN LA URL: loguear la query string volcaría datos personales de
// pacientes a los logs en cada consulta. Este test existe para que
// cualquiera que "mejore" el logging agregando la URL completa se entere
// de por qué no.
func TestLogger_NuncaLogueaLaQueryString(t *testing.T) {
	r, buf := routerConLoggerDePrueba(t, "/clinicas/{slug}/mis-turnos", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"ok": "si"})
	})

	req := httptest.NewRequest(http.MethodGet, "/clinicas/clinica-x/mis-turnos?dni=30111222&email=paciente@example.com", nil)
	r.ServeHTTP(httptest.NewRecorder(), req)

	salida := buf.String()
	for _, datoPersonal := range []string{"30111222", "paciente@example.com", "dni=", "email="} {
		if strings.Contains(salida, datoPersonal) {
			t.Errorf("el log filtró un dato personal (%q) — nunca se debe loguear la query string.\nlog=%s", datoPersonal, salida)
		}
	}
}

// TestLogger_NivelSegunElStatus — 5xx como Error, 4xx como Warn, el resto
// Info: permite alertar sobre errores del servidor sin ahogarse en 401/429
// que son comportamiento esperado.
func TestLogger_NivelSegunElStatus(t *testing.T) {
	casos := []struct {
		status int
		nivel  string
	}{
		{http.StatusOK, "INFO"},
		{http.StatusNotFound, "WARN"},
		{http.StatusTooManyRequests, "WARN"},
		{http.StatusInternalServerError, "ERROR"},
	}
	for _, c := range casos {
		r, buf := routerConLoggerDePrueba(t, "/x", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(c.status)
		})
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/x", nil))

		var linea map[string]any
		if err := json.Unmarshal(buf.Bytes(), &linea); err != nil {
			t.Fatalf("status %d: log no es JSON válido: %v", c.status, err)
		}
		if linea["level"] != c.nivel {
			t.Errorf("status %d -> level = %v, esperaba %s", c.status, linea["level"], c.nivel)
		}
	}
}

// TestCamposLogDe_SinMiddlewareDevuelveNil — los callers
// (requireSession/requireClinic) siempre chequean nil antes de escribir:
// un handler armado sin este middleware (tests de unidad) no puede romper
// por eso.
func TestCamposLogDe_SinMiddlewareDevuelveNil(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if campos := camposLogDe(req.Context()); campos != nil {
		t.Errorf("camposLogDe = %v, esperaba nil sin el middleware montado", campos)
	}
}

// TestLogger_CompletaClinicIDYUserIDEnRequestAutenticado — la razón de ser
// del holder mutable de logging.go: el middleware de logging corre por
// FUERA de requireSession/requireClinic, así que no puede resolver esos
// datos por su cuenta. Sin esto, filtrar los logs por "qué le pasa a esta
// clínica" (con N clínicas en la misma instancia) sería imposible.
//
// Se prueba contra el router REAL y una clínica REAL, no un handler
// armado a mano: lo que importa es que el cableado entre los tres
// middlewares funcione de punta a punta.
func TestLogger_CompletaClinicIDYUserIDEnRequestAutenticado(t *testing.T) {
	gdb := testdb.Shared(t)

	var buf bytes.Buffer
	anterior := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})))
	t.Cleanup(func() { slog.SetDefault(anterior) })

	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Log Test", Email: uuid.NewString() + "@example.com",
		Password: "password123456", NombreClinica: "Clínica Log " + uuid.NewString()[:8],
	})

	// Limpieza explícita: este test corre sobre testdb.Shared (hace falta
	// una clínica REAL para probar el cableado de clinic_id), así que sus
	// escrituras COMMITEAN — no se revierten como en testdb.New. Sin esto,
	// cada corrida dejaba un User + VerificationToken huérfanos, y esos
	// residuos rompen TestPurgeAuthGarbage_* en internal/db, que cuenta
	// tokens purgables GLOBALMENTE (PurgeAuthGarbage no tiene scope).
	// Detectado midiendo la tabla antes y después de correr este test.
	t.Cleanup(func() {
		var user db.User
		if err := gdb.Where("id = (SELECT user_id FROM clinic_members WHERE clinic_id = ?)", reg.Profesional.ID).First(&user).Error; err == nil {
			gdb.Unscoped().Where("user_id = ?", user.ID).Delete(&db.VerificationToken{})
			gdb.Unscoped().Where("user_id = ?", user.ID).Delete(&db.Session{})
			gdb.Unscoped().Where("user_id = ?", user.ID).Delete(&db.ProfessionalProfile{})
		}
		gdb.Unscoped().Where("profesional_id = ?", reg.Profesional.ID).Delete(&db.TipoConsulta{})
		gdb.Unscoped().Where("clinic_id = ?", reg.Profesional.ID).Delete(&db.ClinicMember{})
		gdb.Unscoped().Where("id = ?", reg.Profesional.ID).Delete(&db.Clinic{})
		if user.ID != uuid.Nil {
			gdb.Unscoped().Where("id = ?", user.ID).Delete(&db.User{})
		}
	})

	buf.Reset() // descarta el ruido del alta, interesa solo la request de abajo
	rec := doJSONAuth(t, router, http.MethodGet, "/turnos", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d", rec.Code, http.StatusOK)
	}

	var encontrada map[string]any
	for _, linea := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		var l map[string]any
		if json.Unmarshal([]byte(linea), &l) != nil {
			continue
		}
		if l["ruta"] == "/turnos" {
			encontrada = l
			break
		}
	}
	if encontrada == nil {
		t.Fatalf("no se encontró la línea de log de GET /turnos.\nlog=%s", buf.String())
	}

	if encontrada["clinic_id"] == nil || encontrada["clinic_id"] == "" {
		t.Error("falta clinic_id en un request autenticado — requireClinic no completó el holder de logging")
	}
	if encontrada["user_id"] == nil || encontrada["user_id"] == "" {
		t.Error("falta user_id en un request autenticado — requireSession no completó el holder de logging")
	}
	if encontrada["clinic_id"] != reg.Profesional.ID {
		t.Errorf("clinic_id = %v, esperaba %s", encontrada["clinic_id"], reg.Profesional.ID)
	}
}
