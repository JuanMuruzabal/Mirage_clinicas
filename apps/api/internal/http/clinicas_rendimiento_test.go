package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"

	"gorm.io/gorm"

	"dental-mirage/api/internal/mail"
	"dental-mirage/api/internal/ratelimit"
	"dental-mirage/api/internal/testdb"
)

// Radiografía técnica 2, pasada de optimización (2026-09-26): el buscador
// hacía 8 consultas POR CLÍNICA publicada (201 con 25 clínicas) y la página
// pública calculaba dos veces la misma lista de profesionales. Ahora las dos
// resuelven titular y profesionales con perfilesPublicosDe, en consultas
// fijas.

// contarConsultasDe cuenta las consultas a la base que hace `hacer`. Los
// callbacks se registran UNA vez por registro de callbacks de gorm y quedan
// apagados fuera de la medición: quitarlos llena el log de avisos.
var (
	consultasContadas   *int64
	contadoresMu        sync.Mutex
	contadoresPorConfig = map[any]bool{}
)

func contarConsultasDe(t *testing.T, gdb *gorm.DB, hacer func()) int64 {
	t.Helper()
	contadoresMu.Lock()
	if !contadoresPorConfig[gdb.Callback()] {
		inc := func(*gorm.DB) {
			if c := consultasContadas; c != nil {
				atomic.AddInt64(c, 1)
			}
		}
		cb := gdb.Callback()
		_ = cb.Query().After("gorm:query").Register("rendimiento:q", inc)
		_ = cb.Row().After("gorm:row").Register("rendimiento:r", inc)
		_ = cb.Raw().After("gorm:raw").Register("rendimiento:raw", inc)
		contadoresPorConfig[gdb.Callback()] = true
	}
	contadoresMu.Unlock()

	var n int64
	consultasContadas = &n
	defer func() { consultasContadas = nil }()
	hacer()
	return atomic.LoadInt64(&n)
}

// routerSinLimitePorIP — el registro de muchas clínicas de prueba desde la
// misma IP choca con el límite de registros (bien hecho, pero acá estorba).
func routerSinLimitePorIP(gdb *gorm.DB) http.Handler {
	return NewRouterWithDeps(gdb, AuthDeps{
		Mail: mail.LogSender{}, AccountLimiter: &ratelimit.AccountLimiter{DB: gdb},
		AppBaseURL: "http://localhost:3000", StateSecret: "un-secret-de-test",
	}, []string{"http://localhost:3000"})
}

func TestBuscarClinicas_LasConsultasNoCrecenConLasClinicas(t *testing.T) {
	gdb := testdb.New(t)
	router := routerSinLimitePorIP(gdb)
	publicar := func(desde, hasta int) {
		for i := desde; i < hasta; i++ {
			reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
				Email: fmt.Sprintf("rendimiento-%d@example.com", i), Password: "unaClaveLarga123",
				Nombre: fmt.Sprintf("Profe%d", i), NombreClinica: fmt.Sprintf("Clínica Rendimiento %d", i),
			})
			deployarPaginaDePrueba(t, router, reg.Token)
		}
	}
	buscar := func() int {
		rec := doJSON(t, router, http.MethodGet, "/clinicas", nil)
		var got []clinicaResultado
		_ = json.Unmarshal(rec.Body.Bytes(), &got)
		return len(got)
	}

	publicar(0, 3)
	var conTres int
	consultasConTres := contarConsultasDe(t, gdb, func() { conTres = buscar() })
	publicar(3, 9)
	var conNueve int
	consultasConNueve := contarConsultasDe(t, gdb, func() { conNueve = buscar() })

	if conTres != 3 || conNueve != 9 {
		t.Fatalf("resultados = %d y %d, esperaba 3 y 9", conTres, conNueve)
	}
	if consultasConNueve != consultasConTres {
		t.Errorf("con 3 clínicas %d consultas, con 9 %d: el buscador volvió a consultar por clínica", consultasConTres, consultasConNueve)
	}
}

func TestBuscarClinicas_NoListaPaginasEnMantenimiento(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Mantenimiento", Email: "buscar-oculta@example.com", Password: "password123456", NombreClinica: "Clínica En Mantenimiento",
	})
	deployarPaginaDePrueba(t, router, reg.Token)
	rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina/ocultar", reg.Token, ocultarPaginaPublicaRequest{Oculta: true})
	if rec.Code != http.StatusOK {
		t.Fatalf("no se pudo ocultar la página: %d %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, router, http.MethodGet, "/clinicas?q=Mantenimiento", nil)
	var got []clinicaResultado
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 0 {
		t.Errorf("el buscador lista una página en mantenimiento: %+v", got)
	}
}

func TestBuscarClinicas_LosComodinesSeBuscanLiteral(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Comodín", Email: "buscar-comodin@example.com", Password: "password123456", NombreClinica: "Clínica Normal",
	})
	deployarPaginaDePrueba(t, router, reg.Token)

	for _, q := range []string{"%25", "_"} {
		rec := doJSON(t, router, http.MethodGet, "/clinicas?q="+q, nil)
		var got []clinicaResultado
		_ = json.Unmarshal(rec.Body.Bytes(), &got)
		if len(got) != 0 {
			t.Errorf("q=%s devolvió %d clínicas: se tomó como comodín", q, len(got))
		}
	}
}

// La página pública: el titular y los profesionales salen de una sola
// resolución, y siguen siendo los mismos datos.
func TestGetClinicaPublica_ConsultasConVariosProfesionales(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Titular", Email: "publica-rend@example.com", Password: "password123456", NombreClinica: "Clínica Varios",
	})
	deployarPaginaDePrueba(t, router, reg.Token)

	medir := func() int64 {
		return contarConsultasDe(t, gdb, func() {
			rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug, nil)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d", rec.Code)
			}
		})
	}
	conUno := medir()

	for i := 0; i < 3; i++ {
		email := fmt.Sprintf("colega-rend-%d@example.com", i)
		invitado := invitadoDePrueba(t, router, gdb, email, "profesional")
		rec := doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", reg.Token, invitarColaboradorRequest{Rol: "profesional", Email: email})
		if rec.Code != http.StatusCreated {
			t.Fatalf("invitar: %d %s", rec.Code, rec.Body.String())
		}
		pendientes := invitacionesDe(t, router, invitado)
		rec = doJSONAuth(t, router, http.MethodPost, "/me/invitaciones/"+pendientes[0].ID+"/aceptar", invitado, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("aceptar: %d %s", rec.Code, rec.Body.String())
		}
	}
	conCuatro := medir()

	if conCuatro != conUno {
		t.Errorf("con 1 profesional %d consultas, con 4 %d: la página volvió a consultar por profesional", conUno, conCuatro)
	}
}
