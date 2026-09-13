package http

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/ratelimit"
	"dental-mirage/api/internal/testdb"
)

// handlerQueReportaLaIP — expone lo que clientIP() ve DESPUÉS del
// middleware. Es la pregunta que importa: no si las cabeceras llegaron,
// sino qué IP termina usando el sistema (rate limiters, detectores,
// auditoría y logs pasan todos por esa función).
func handlerQueReportaLaIP() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Que las cabeceras del BFF no sobrevivan al middleware es parte
		// del contrato: ningún handler debería poder leerlas sin pasar por
		// la validación del secreto.
		if r.Header.Get(headerIPDelVisitante) != "" || r.Header.Get(headerAuthDelBFF) != "" {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte("las cabeceras del BFF llegaron al handler"))
			return
		}
		_, _ = w.Write([]byte(clientIP(r)))
	})
}

func pedirConCabeceras(t *testing.T, secretoDelServidor string, cabeceras map[string]string, remoteAddr string) string {
	t.Helper()
	h := confiarEnIPDelBFF(secretoDelServidor)(handlerQueReportaLaIP())
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = remoteAddr
	for k, v := range cabeceras {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	return rec.Body.String()
}

// TestConfiarEnIPDelBFF_ConElSecretoCorrectoUsaLaIPDelVisitante — el caso
// que motiva toda la Fase 3.1.1: sin esto, acá se vería "10.0.0.9", la IP
// del proceso web, para todos los visitantes.
func TestConfiarEnIPDelBFF_ConElSecretoCorrectoUsaLaIPDelVisitante(t *testing.T) {
	got := pedirConCabeceras(t, "secreto-compartido", map[string]string{
		headerAuthDelBFF:     "secreto-compartido",
		headerIPDelVisitante: "201.235.14.7",
		// Lo que habría puesto el proxy: la IP del proceso web. Es
		// justamente la que hay que descartar.
		"X-Forwarded-For": "10.0.0.9",
	}, "10.0.0.9:1234")
	if got != "201.235.14.7" {
		t.Errorf("clientIP = %q, esperaba la IP del visitante", got)
	}
}

// TestConfiarEnIPDelBFF_SinElSecretoNoSeLeCree — el que le da sentido al
// secreto. Esta API es pública: si alcanzara con mandar la cabecera,
// cualquiera elegiría su propia IP y quedaría fuera del alcance del
// rate-limiting y de los detectores de abuso del wizard.
func TestConfiarEnIPDelBFF_SinElSecretoNoSeLeCree(t *testing.T) {
	casos := []struct {
		nombre             string
		secretoDelServidor string
		cabeceras          map[string]string
	}{
		{
			nombre:             "secreto equivocado",
			secretoDelServidor: "secreto-compartido",
			cabeceras:          map[string]string{headerAuthDelBFF: "me-lo-invente", headerIPDelVisitante: "1.2.3.4", "X-Forwarded-For": "10.0.0.9"},
		},
		{
			nombre:             "sin secreto en la request",
			secretoDelServidor: "secreto-compartido",
			cabeceras:          map[string]string{headerIPDelVisitante: "1.2.3.4", "X-Forwarded-For": "10.0.0.9"},
		},
		{
			nombre:             "la API no tiene secreto configurado",
			secretoDelServidor: "",
			cabeceras:          map[string]string{headerAuthDelBFF: "cualquier-cosa", headerIPDelVisitante: "1.2.3.4", "X-Forwarded-For": "10.0.0.9"},
		},
		{
			nombre:             "IP que no es una IP",
			secretoDelServidor: "secreto-compartido",
			cabeceras:          map[string]string{headerAuthDelBFF: "secreto-compartido", headerIPDelVisitante: "no-soy-una-ip", "X-Forwarded-For": "10.0.0.9"},
		},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			got := pedirConCabeceras(t, c.secretoDelServidor, c.cabeceras, "10.0.0.9:1234")
			if got != "10.0.0.9" {
				t.Errorf("clientIP = %q, esperaba la IP de siempre (10.0.0.9) — la cabecera no debió creerse", got)
			}
		})
	}
}

// TestConfiarEnIPDelBFF_SinCabecerasNoTocaNada — el tráfico que no viene
// del BFF (o un BFF viejo, a mitad de un deploy) sigue resolviéndose con
// la regla general de clientIP(): la última IP pública de la cadena, que
// desde la Fase 3.1.2 saltea los saltos de infraestructura del final.
func TestConfiarEnIPDelBFF_SinCabecerasNoTocaNada(t *testing.T) {
	got := pedirConCabeceras(t, "secreto-compartido", map[string]string{
		"X-Forwarded-For": "190.190.1.1, 10.0.0.9",
	}, "10.0.0.9:1234")
	if got != "190.190.1.1" {
		t.Errorf("clientIP = %q, esperaba la última IP pública de la cadena", got)
	}
}

// TestConfiarEnIPDelBFF_LeGanaAlCFConnectingIP — el pedido del BFF a esta
// API también viaja por la URL pública, así que Cloudflare le pone su
// CF-Connecting-IP con la IP del PROCESO WEB: exactamente la que la Fase
// 3.1.1 vino a corregir. Si esa cabecera sobreviviera, le ganaría a la IP
// real (clientIP la prefiere) y el arreglo no serviría de nada.
func TestConfiarEnIPDelBFF_LeGanaAlCFConnectingIP(t *testing.T) {
	got := pedirConCabeceras(t, "secreto-compartido", map[string]string{
		headerAuthDelBFF:     "secreto-compartido",
		headerIPDelVisitante: "201.235.14.7",
		"CF-Connecting-IP":   "34.10.20.30", // la IP de salida del servicio web
		"X-Forwarded-For":    "34.10.20.30, 10.29.215.4",
	}, "10.29.215.4:1234")
	if got != "201.235.14.7" {
		t.Errorf("clientIP = %q, esperaba la IP del visitante que mandó el BFF", got)
	}
}

// TestSolicitarTurnoPublico_GuardaLaIPRealDelVisitante — el test que
// prueba que el middleware está EFECTIVAMENTE conectado al router, no
// solo que la función anda: un turno pedido a través del BFF tiene que
// quedar registrado con la IP del paciente.
//
// `turnos.ip_contacto` es lo que alimenta al detector de rotación por IP,
// así que es exactamente el dato que estaba mal.
func TestSolicitarTurnoPublico_GuardaLaIPRealDelVisitante(t *testing.T) {
	gdb := testdb.New(t)
	sender := newCapturingMailSender()
	router := NewRouterWithDeps(gdb, AuthDeps{
		Mail:            sender,
		AccountLimiter:  &ratelimit.AccountLimiter{DB: gdb},
		IPLimiter:       ratelimit.NewIPLimiter(),
		AppBaseURL:      "http://localhost:3000",
		StateSecret:     "un-secret-de-test",
		BFFSharedSecret: "secreto-compartido",
	}, []string{"http://localhost:3000"})

	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "ip-real@example.com")
	email := "paciente@example.com"
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)

	req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token)
	req.EmailContacto = email
	rec := doJSONConCabeceras(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req, map[string]string{
		headerAuthDelBFF:     "secreto-compartido",
		headerIPDelVisitante: "201.235.14.7",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var turno db.Turno
	if err := gdb.Order("created_at DESC").First(&turno).Error; err != nil {
		t.Fatalf("no se pudo leer el turno: %v", err)
	}
	if turno.IPContacto == nil || *turno.IPContacto != "201.235.14.7" {
		t.Errorf("IPContacto = %v, esperaba la IP del visitante — el middleware no está conectado al router", turno.IPContacto)
	}
}

// TestSolicitarTurnoPublico_SinSecretoGuardaLaIPDeSiempre — la otra mitad:
// sin el secreto configurado en la API, el comportamiento es el de antes
// de esta fase (la IP de quien conectó), no un campo vacío ni un error.
func TestSolicitarTurnoPublico_SinSecretoGuardaLaIPDeSiempre(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "ip-sin-secreto@example.com")
	email := "paciente2@example.com"
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)

	req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token)
	req.EmailContacto = email
	rec := doJSONConCabeceras(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req, map[string]string{
		headerAuthDelBFF:     "cualquier-cosa",
		headerIPDelVisitante: "201.235.14.7",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var turno db.Turno
	if err := gdb.Order("created_at DESC").First(&turno).Error; err != nil {
		t.Fatalf("no se pudo leer el turno: %v", err)
	}
	if turno.IPContacto != nil && *turno.IPContacto == "201.235.14.7" {
		t.Error("se creyó la cabecera sin secreto configurado")
	}
}
