package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// Los contadores de /panel/pacientes salen de UNA consulta (ronda de
// optimización post-Fase 3). Igual que en turnos, lo que se protege es
// que el número de la pestaña siga siendo el de la tabla de abajo.
//
// "Verificado" acá no es una columna: es pertenecer al conjunto que
// devuelve `pacientesVerificadosQuery` (turno resuelto y asistido, o
// ficha cargada a mano). El fixture arma las dos clases a propósito.
func TestContadoresDePacientes_CoincidenConElListado(t *testing.T) {
	router, gdb := newTestRouter(t)
	prof := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "conta-pac@example.com", Password: "unaClaveLarga123",
		Nombre: "Conta Dora", NombreClinica: "Clínica Conta Pacientes",
	})
	clinicID := clinicaDePrueba(t, prof.Profesional.ID)
	userID := userIDDelMail(t, gdb, "conta-pac@example.com")
	tipo := tipoDe(t, gdb, clinicID, userID, "Consulta contada", 30)

	// Dos fichas manuales (verificadas por origen) y una que llegó del
	// formulario público sin turno asistido (sin verificar).
	nuevo := func(dni, origen string) db.Paciente {
		t.Helper()
		tel, mail := "+5493511234567", dni+"@example.com"
		p := db.Paciente{
			ClinicID: clinicID, Nombre: "Pac", Apellido: "Iente " + dni,
			DNI: dni, Telefono: &tel, Email: &mail,
			Origen: origen, CreadoPorUserID: &userID,
		}
		if err := gdb.Create(&p).Error; err != nil {
			t.Fatalf("no se pudo crear el paciente: %v", err)
		}
		return p
	}
	nuevo("60000001", "manual")
	nuevo("60000002", "manual")
	publico := nuevo("60000003", "pagina_publica")

	// Un turno para que la ficha pública entre en "mis pacientes" — sin
	// eso el aislamiento la deja afuera de las tres pestañas por igual.
	inicio := clock.Now().Add(48 * time.Hour)
	fin := inicio.Add(30 * time.Minute)
	if err := gdb.Create(&db.Turno{
		ClinicID: clinicID, AtendidoPorUserID: &userID, PacienteID: &publico.ID,
		TipoConsultaID: &tipo.ID, Estado: "agendado", HoraInicio: &inicio, HoraFin: &fin,
		NombreContacto: "Pac", ApellidoContacto: "Iente", DNIContacto: "60000003",
		TelefonoContacto: "+5493511234567", EmailContacto: "60000003@example.com",
		Origen: "pagina_publica",
	}).Error; err != nil {
		t.Fatalf("no se pudo crear el turno: %v", err)
	}

	contadores := contadoresDePacientesDePrueba(t, router, prof.Token, "")
	if contadores["todos"] != 3 {
		t.Errorf("todos: %d, esperaba 3", contadores["todos"])
	}
	if contadores["verificados"] != 2 {
		t.Errorf("verificados: %d, esperaba 2 (las dos fichas manuales)", contadores["verificados"])
	}
	if contadores["sinVerificar"] != 1 {
		t.Errorf("sinVerificar: %d, esperaba 1", contadores["sinVerificar"])
	}

	// Y que cada número sea el de su lista.
	porPestaña := map[string]string{
		"todos":        "",
		"verificados":  "?verificacion=verificado",
		"sinVerificar": "?verificacion=sin_verificar",
	}
	for pestaña, query := range porPestaña {
		rec := doJSONAuth(t, router, http.MethodGet, "/pacientes"+query, prof.Token, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("listar %q: status=%d", pestaña, rec.Code)
		}
		var lista []map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &lista); err != nil {
			t.Fatalf("listar %q: %v", pestaña, err)
		}
		if len(lista) != contadores[pestaña] {
			t.Errorf("pestaña %q: el contador dice %d y la lista trae %d fichas",
				pestaña, contadores[pestaña], len(lista))
		}
	}
}

// El filtro de búsqueda lo aplica la misma función en los dos lados.
func TestContadoresDePacientes_RespetanLaBusqueda(t *testing.T) {
	router, gdb := newTestRouter(t)
	prof := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "conta-pac-q@example.com", Password: "unaClaveLarga123",
		Nombre: "Conta Dora", NombreClinica: "Clínica Conta Q",
	})
	clinicID := clinicaDePrueba(t, prof.Profesional.ID)
	userID := userIDDelMail(t, gdb, "conta-pac-q@example.com")

	for i, ap := range []string{"Buscable", "Buscable", "Invisible"} {
		tel := "+5493511234567"
		mail := fmt.Sprintf("%s-%d@example.com", ap, i)
		if err := gdb.Create(&db.Paciente{
			ClinicID: clinicID, Nombre: "Pac", Apellido: ap,
			DNI: fmt.Sprintf("7000000%d", i), Telefono: &tel,
			Email: &mail, Origen: "manual", CreadoPorUserID: &userID,
		}).Error; err != nil {
			t.Fatalf("no se pudo crear el paciente: %v", err)
		}
	}

	contadores := contadoresDePacientesDePrueba(t, router, prof.Token, "?q=Buscable")
	if contadores["todos"] != 2 {
		t.Errorf("con q=Buscable el contador dice %d, esperaba 2 — el filtro no se aplica",
			contadores["todos"])
	}
}

func contadoresDePacientesDePrueba(t *testing.T, router http.Handler, token, query string) map[string]int {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes/contadores"+query, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("contadores: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out map[string]int
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("contadores: no se pudo leer la respuesta: %v", err)
	}
	return out
}

// La subconsulta de "verificado" va acotada a la clínica (revisión del
// 2026-09-23). Recorría los turnos asistidos de TODO el sistema: medido,
// 40 veces más lenta con 20.000 turnos asistidos en otra clínica. Lo que
// un test puede afirmar es la regla que la acotación implica: un turno
// asistido de OTRA clínica no verifica una ficha de esta.
//
// El fixture fuerza una referencia cruzada que el flujo normal no crea
// —justamente para que el test dependa del filtro y no de que los datos
// vengan prolijos.
func TestPacientesVerificadosQuery_UnTurnoDeOtraClinicaNoVerifica(t *testing.T) {
	router, gdb := newTestRouter(t)
	a := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "verif-a@example.com", Password: "unaClaveLarga123",
		Nombre: "Clínica", NombreClinica: "Clínica A",
	})
	b := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "verif-b@example.com", Password: "unaClaveLarga123",
		Nombre: "Clínica", NombreClinica: "Clínica B",
	})
	clinicA := clinicaDePrueba(t, a.Profesional.ID)
	clinicB := clinicaDePrueba(t, b.Profesional.ID)
	userB := userIDDelMail(t, gdb, "verif-b@example.com")

	// Una ficha de A que llegó por la página pública: sin verificar.
	ficha := db.Paciente{ClinicID: clinicA, Nombre: "Pac", Apellido: "Iente", DNI: "90000001", Origen: "pagina_publica"}
	if err := gdb.Create(&ficha).Error; err != nil {
		t.Fatalf("no se pudo crear la ficha: %v", err)
	}

	// Un turno ASISTIDO en B que apunta a esa ficha de A.
	inicio := time.Now().Add(-48 * time.Hour)
	fin := inicio.Add(30 * time.Minute)
	asistio := "asistio"
	if err := gdb.Create(&db.Turno{
		ClinicID: clinicB, AtendidoPorUserID: &userB, PacienteID: &ficha.ID,
		Estado: "agendado", HoraInicio: &inicio, HoraFin: &fin, Asistencia: &asistio,
		NombreContacto: "Pac", ApellidoContacto: "Iente", DNIContacto: "90000001",
		TelefonoContacto: "+5493511234567", EmailContacto: "x@example.com", Origen: "manual",
	}).Error; err != nil {
		t.Fatalf("no se pudo crear el turno cruzado: %v", err)
	}

	var ids []uuid.UUID
	if err := pacientesVerificadosQuery(gdb, clinicA).Pluck("id", &ids).Error; err != nil {
		t.Fatalf("pacientesVerificadosQuery: %v", err)
	}
	for _, id := range ids {
		if id == ficha.ID {
			t.Fatal("un turno asistido de OTRA clínica verificó una ficha de esta")
		}
	}
}
