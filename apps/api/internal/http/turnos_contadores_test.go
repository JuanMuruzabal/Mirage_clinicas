package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// Los contadores de las pestañas de /panel/turnos salen de UNA consulta
// (ronda de optimización post-Fase 3), no de cuatro requests.
//
// Lo que estos tests protegen no es la velocidad —eso no se puede
// afirmar desde un test— sino la única propiedad que el cambio podía
// romper: que el número de la pestaña siga siendo el mismo que la
// cantidad de filas que la lista muestra abajo. Un contador que cuenta
// distinto que el listado es peor que un contador lento.
func TestContadoresDeTurnos_CoincidenConElListado(t *testing.T) {
	router, gdb := newTestRouter(t)
	prof := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "contadores@example.com", Password: "unaClaveLarga123",
		Nombre: "Conta Dora", NombreClinica: "Clínica Contadores",
	})
	clinicID := clinicaDePrueba(t, prof.Profesional.ID)
	userID := userIDDelMail(t, gdb, "contadores@example.com")
	tipo := tipoDe(t, gdb, clinicID, userID, "Consulta contada", 30)

	// Tres pendientes (futuro), dos resueltos (pasado), uno cancelado.
	crear := func(desplazamiento time.Duration, estado string, dni string) {
		t.Helper()
		inicio := clock.Now().Add(desplazamiento)
		turno := db.Turno{
			ClinicID:          clinicID,
			AtendidoPorUserID: &userID,
			TipoConsultaID:    &tipo.ID,
			Estado:            estado,
			HoraInicio:        &inicio,
			NombreContacto:    "Pac", ApellidoContacto: "Iente",
			DNIContacto: dni, TelefonoContacto: "+5493511234567",
			EmailContacto: dni + "@example.com", Origen: "manual",
		}
		fin := inicio.Add(30 * time.Minute)
		turno.HoraFin = &fin
		if err := gdb.Create(&turno).Error; err != nil {
			t.Fatalf("no se pudo crear el turno de prueba: %v", err)
		}
	}
	for i := range 3 {
		crear(time.Duration(24+i*2)*time.Hour, "agendado", fmt.Sprintf("4000000%d", i))
	}
	for i := range 2 {
		crear(-time.Duration(24+i*2)*time.Hour, "agendado", fmt.Sprintf("4100000%d", i))
	}
	crear(72*time.Hour, "cancelada", "42000000")

	contadores := contadoresDePrueba(t, router, prof.Token, "")
	esperado := map[string]int{"agendado": 3, "resuelto": 2, "cancelada": 1, "todas": 6}
	for pestaña, n := range esperado {
		if contadores[pestaña] != n {
			t.Errorf("pestaña %q: contador dice %d, esperaba %d", pestaña, contadores[pestaña], n)
		}
	}

	// LA PROPIEDAD QUE IMPORTA: cada contador coincide con lo que la
	// lista devuelve para esa misma pestaña. Sin esto, el test de arriba
	// solo diría que el SQL nuevo hace lo que yo creo que hace.
	porPestaña := map[string]string{
		"agendado":  "?estado=agendado&resuelto=false",
		"resuelto":  "?estado=agendado&resuelto=true",
		"cancelada": "?estado=cancelada",
		"todas":     "",
	}
	for pestaña, query := range porPestaña {
		rec := doJSONAuth(t, router, http.MethodGet, "/turnos"+query, prof.Token, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("listar %q: status=%d", pestaña, rec.Code)
		}
		var lista []map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &lista); err != nil {
			t.Fatalf("listar %q: %v", pestaña, err)
		}
		if len(lista) != contadores[pestaña] {
			t.Errorf("pestaña %q: el contador dice %d y la lista trae %d filas",
				pestaña, contadores[pestaña], len(lista))
		}
	}
}

// Los filtros de pantalla (búsqueda, fechas, tipo) los aplica la MISMA
// función en el listado y en los contadores. Este test es el que se
// pondría en rojo si alguien los duplicara y tocara solo uno.
func TestContadoresDeTurnos_RespetanElFiltroDeBusqueda(t *testing.T) {
	router, gdb := newTestRouter(t)
	prof := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "contadores-q@example.com", Password: "unaClaveLarga123",
		Nombre: "Conta Dora", NombreClinica: "Clínica Contadores Q",
	})
	clinicID := clinicaDePrueba(t, prof.Profesional.ID)
	userID := userIDDelMail(t, gdb, "contadores-q@example.com")
	tipo := tipoDe(t, gdb, clinicID, userID, "Consulta filtrada", 30)

	crear := func(apellido, dni string, h time.Duration) {
		t.Helper()
		inicio := clock.Now().Add(h)
		fin := inicio.Add(30 * time.Minute)
		if err := gdb.Create(&db.Turno{
			ClinicID: clinicID, AtendidoPorUserID: &userID, TipoConsultaID: &tipo.ID,
			Estado: "agendado", HoraInicio: &inicio, HoraFin: &fin,
			NombreContacto: "Pac", ApellidoContacto: apellido,
			DNIContacto: dni, TelefonoContacto: "+5493511234567",
			EmailContacto: dni + "@example.com", Origen: "manual",
		}).Error; err != nil {
			t.Fatalf("no se pudo crear el turno: %v", err)
		}
	}
	crear("Buscable", "50000001", 24*time.Hour)
	crear("Buscable", "50000002", 48*time.Hour)
	crear("Invisible", "50000003", 72*time.Hour)

	contadores := contadoresDePrueba(t, router, prof.Token, "?q=Buscable")
	if contadores["todas"] != 2 {
		t.Errorf("con q=Buscable el contador dice %d, esperaba 2 — el filtro no se está aplicando",
			contadores["todas"])
	}
	if contadores["agendado"] != 2 {
		t.Errorf("con q=Buscable la pestaña de pendientes dice %d, esperaba 2", contadores["agendado"])
	}
}

func contadoresDePrueba(t *testing.T, router http.Handler, token, query string) map[string]int {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/turnos/contadores"+query, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("contadores: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out map[string]int
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("contadores: no se pudo leer la respuesta: %v", err)
	}
	return out
}
