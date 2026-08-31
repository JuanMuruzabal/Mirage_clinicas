package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

func crearClinicaDePruebaBloqueos(t *testing.T, email string) (http.Handler, clinicaDePruebaResult) {
	t.Helper()
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: email, Password: "password123456", NombreClinica: "Clínica",
	})
	return router, reg
}

func TestCrearBloqueo_EspecificoValido(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "bloqueo1@example.com")

	rec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "12:00",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var got bloqueoHorarioResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if !got.Especifico || got.Fecha == nil || *got.Fecha != "2026-12-25" {
		t.Errorf("got = %+v, esperaba especifico=true con fecha=2026-12-25", got)
	}
	if got.Alcance != nil || got.DiaSemana != nil {
		t.Errorf("got = %+v, una regla específica no debería tener alcance ni día de la semana", got)
	}
	if got.TipoRegla != db.TipoReglaBloquearHorario {
		t.Errorf("tipoRegla = %q, esperaba %q", got.TipoRegla, db.TipoReglaBloquearHorario)
	}
}

func TestCrearBloqueo_GeneralAlcanceTodos_SinFechaDeFin(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "bloqueo2@example.com")
	dia := 2

	rec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: false, Alcance: db.BloqueoAlcanceTodos, DiaSemana: &dia, HoraDesde: "07:00", HoraHasta: "08:00",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var got bloqueoHorarioResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.FechaDesde != nil || got.FechaHasta != nil {
		t.Errorf("got = %+v, alcance 'todos' no debería resolver fechaDesde/fechaHasta", got)
	}
	if got.DiaSemana == nil || *got.DiaSemana != dia {
		t.Errorf("diaSemana = %v, esperaba %d", got.DiaSemana, dia)
	}
}

func TestCrearBloqueo_GeneralAlcanceSemana_ResuelveLunesADomingo(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "bloqueo3@example.com")
	dia := 1

	rec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: false, Alcance: db.BloqueoAlcanceSemana, DiaSemana: &dia, HoraDesde: "07:00", HoraHasta: "08:00",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var got bloqueoHorarioResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.FechaDesde == nil || got.FechaHasta == nil {
		t.Fatalf("got = %+v, esperaba fechaDesde/fechaHasta resueltos para alcance 'semana'", got)
	}
	desde := startOfWeek(clock.Today())
	hasta := desde.AddDate(0, 0, 6)
	if *got.FechaDesde != desde.Format("2006-01-02") || *got.FechaHasta != hasta.Format("2006-01-02") {
		t.Errorf("rango = [%s, %s], esperaba [%s, %s]", *got.FechaDesde, *got.FechaHasta,
			desde.Format("2006-01-02"), hasta.Format("2006-01-02"))
	}
}

func TestCrearBloqueo_GeneralAlcanceMes_ResuelvePrimerYUltimoDia(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "bloqueo4@example.com")
	dia := 3

	rec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: false, Alcance: db.BloqueoAlcanceMes, DiaSemana: &dia, HoraDesde: "07:00", HoraHasta: "08:00",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var got bloqueoHorarioResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	desde := startOfMonth(clock.Today())
	hasta := endOfMonth(clock.Today())
	if got.FechaDesde == nil || *got.FechaDesde != desde.Format("2006-01-02") {
		t.Errorf("fechaDesde = %v, esperaba %s", got.FechaDesde, desde.Format("2006-01-02"))
	}
	if got.FechaHasta == nil || *got.FechaHasta != hasta.Format("2006-01-02") {
		t.Errorf("fechaHasta = %v, esperaba %s", got.FechaHasta, hasta.Format("2006-01-02"))
	}
}

// Corrección de QA (2026-08-30): "en reserva de horas generales agregar
// alcance, próxima semana y próximo mes" — mismo criterio "de una sola
// vez" que "semana" (TR-084), pero ancladas a la semana/mes SIGUIENTE.
func TestCrearBloqueo_GeneralAlcanceProximaSemana_ResuelveLaSemanaSiguiente(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "bloqueo-prox-sem@example.com")
	dia := 1

	rec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: false, Alcance: db.BloqueoAlcanceProximaSemana, DiaSemana: &dia, HoraDesde: "07:00", HoraHasta: "08:00",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var got bloqueoHorarioResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	desde := startOfWeek(clock.Today()).AddDate(0, 0, 7)
	hasta := desde.AddDate(0, 0, 6)
	if got.FechaDesde == nil || *got.FechaDesde != desde.Format("2006-01-02") || got.FechaHasta == nil || *got.FechaHasta != hasta.Format("2006-01-02") {
		t.Errorf("rango = [%v, %v], esperaba [%s, %s]", got.FechaDesde, got.FechaHasta,
			desde.Format("2006-01-02"), hasta.Format("2006-01-02"))
	}
	// La semana siguiente nunca puede empezar el mismo día que "esta semana".
	estaSemana := startOfWeek(clock.Today())
	if desde.Format("2006-01-02") == estaSemana.Format("2006-01-02") {
		t.Errorf("el rango de 'próxima semana' no debería coincidir con el de 'esta semana'")
	}
}

func TestCrearBloqueo_GeneralAlcanceProximoMes_ResuelveElMesSiguiente(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "bloqueo-prox-mes@example.com")
	dia := 3

	rec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: false, Alcance: db.BloqueoAlcanceProximoMes, DiaSemana: &dia, HoraDesde: "07:00", HoraHasta: "08:00",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var got bloqueoHorarioResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	desde := startOfMonth(clock.Today()).AddDate(0, 1, 0)
	hasta := endOfMonth(desde)
	if got.FechaDesde == nil || *got.FechaDesde != desde.Format("2006-01-02") {
		t.Errorf("fechaDesde = %v, esperaba %s", got.FechaDesde, desde.Format("2006-01-02"))
	}
	if got.FechaHasta == nil || *got.FechaHasta != hasta.Format("2006-01-02") {
		t.Errorf("fechaHasta = %v, esperaba %s", got.FechaHasta, hasta.Format("2006-01-02"))
	}
	esteMes := startOfMonth(clock.Today())
	if desde.Format("2006-01-02") == esteMes.Format("2006-01-02") {
		t.Errorf("el rango de 'próximo mes' no debería coincidir con el de 'este mes'")
	}
}

func TestCrearBloqueo_Validaciones(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "bloqueo5@example.com")
	dia := 1

	casos := map[string]crearBloqueoHorarioRequest{
		"horaHasta antes que horaDesde": {
			Especifico: false, Alcance: db.BloqueoAlcanceTodos, DiaSemana: &dia, HoraDesde: "10:00", HoraHasta: "09:00",
		},
		"específica con alcance seteado": {
			Especifico: true, Fecha: "2026-12-25", Alcance: db.BloqueoAlcanceTodos, HoraDesde: "08:00", HoraHasta: "09:00",
		},
		"específica con diaSemana seteado": {
			Especifico: true, Fecha: "2026-12-25", DiaSemana: &dia, HoraDesde: "08:00", HoraHasta: "09:00",
		},
		"específica con fecha inválida": {
			Especifico: true, Fecha: "25-12-2026", HoraDesde: "08:00", HoraHasta: "09:00",
		},
		// Pedido explícito del cliente (2026-09-04): "no puedo reservar un
		// horario atrás en el tiempo, cosa que se puede ahora".
		"específica con fecha pasada": {
			Especifico: true, Fecha: clock.Today().AddDate(0, 0, -1).Format("2006-01-02"), HoraDesde: "08:00", HoraHasta: "09:00",
		},
		"general con fecha seteada": {
			Especifico: false, Alcance: db.BloqueoAlcanceTodos, DiaSemana: &dia, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "09:00",
		},
		"general sin diaSemana": {
			Especifico: false, Alcance: db.BloqueoAlcanceTodos, HoraDesde: "08:00", HoraHasta: "09:00",
		},
		"general con alcance inválido": {
			Especifico: false, Alcance: "año", DiaSemana: &dia, HoraDesde: "08:00", HoraHasta: "09:00",
		},
		"tipo de regla no soportado": {
			Especifico: false, Alcance: db.BloqueoAlcanceTodos, DiaSemana: &dia, HoraDesde: "08:00", HoraHasta: "09:00",
			TipoRegla: "otra_cosa",
		},
	}

	for nombre, body := range casos {
		t.Run(nombre, func(t *testing.T) {
			rec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, body)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
			}
		})
	}
}

func TestListBloqueos_FiltraPorEspecifico(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "bloqueo6@example.com")
	dia := 1
	doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: false, Alcance: db.BloqueoAlcanceTodos, DiaSemana: &dia, HoraDesde: "07:00", HoraHasta: "08:00",
	})
	doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "12:00",
	})

	generales := doJSONAuth(t, router, http.MethodGet, "/bloqueos?especifico=false", reg.Token, nil)
	var listaGenerales []bloqueoHorarioResponse
	_ = json.Unmarshal(generales.Body.Bytes(), &listaGenerales)
	if len(listaGenerales) != 1 || listaGenerales[0].Especifico {
		t.Errorf("listaGenerales = %+v, esperaba 1 regla general", listaGenerales)
	}

	especificas := doJSONAuth(t, router, http.MethodGet, "/bloqueos?especifico=true", reg.Token, nil)
	var listaEspecificas []bloqueoHorarioResponse
	_ = json.Unmarshal(especificas.Body.Bytes(), &listaEspecificas)
	if len(listaEspecificas) != 1 || !listaEspecificas[0].Especifico {
		t.Errorf("listaEspecificas = %+v, esperaba 1 regla específica", listaEspecificas)
	}

	todas := doJSONAuth(t, router, http.MethodGet, "/bloqueos", reg.Token, nil)
	var listaTodas []bloqueoHorarioResponse
	_ = json.Unmarshal(todas.Body.Bytes(), &listaTodas)
	if len(listaTodas) != 2 {
		t.Errorf("len(listaTodas) = %d, esperaba 2 sin filtro", len(listaTodas))
	}
}

// Corrección de QA (F2.3): "poder ponerle motivo y que aparezca visible
// en el calendario" — opcional, se guarda y se puede editar como
// cualquier otro campo de la regla.
func TestCrearBloqueo_ConMotivo(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "bloqueo-motivo1@example.com")
	dia := 1

	rec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: false, Alcance: db.BloqueoAlcanceTodos, DiaSemana: &dia, HoraDesde: "07:00", HoraHasta: "08:00",
		Motivo: "Limpieza semanal",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var got bloqueoHorarioResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Motivo == nil || *got.Motivo != "Limpieza semanal" {
		t.Errorf("motivo = %v, esperaba \"Limpieza semanal\"", got.Motivo)
	}
}

func TestCrearBloqueo_SinMotivoQuedaSinCargar(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "bloqueo-motivo2@example.com")
	rec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "09:00",
	})
	var got bloqueoHorarioResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Motivo != nil {
		t.Errorf("motivo = %v, esperaba nil sin mandar el campo", got.Motivo)
	}
}

func TestEditarBloqueo_ActualizaElMotivo(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "bloqueo-motivo3@example.com")
	crearRec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "09:00", Motivo: "Reposición de inventario",
	})
	var creado bloqueoHorarioResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	editRec := doJSONAuth(t, router, http.MethodPatch, "/bloqueos/"+creado.ID, reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "09:00", Motivo: "Inventario y limpieza",
	})
	var got bloqueoHorarioResponse
	_ = json.Unmarshal(editRec.Body.Bytes(), &got)
	if got.Motivo == nil || *got.Motivo != "Inventario y limpieza" {
		t.Errorf("motivo tras editar = %v, esperaba \"Inventario y limpieza\"", got.Motivo)
	}
}

// F2.3.6 (corrección de QA: "agregar la edición para reglas globales y
// específicas") — PATCH /bloqueos/{id}.

func TestEditarBloqueo_General(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "editar-bloqueo1@example.com")
	dia := 1
	crearRec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: false, Alcance: db.BloqueoAlcanceTodos, DiaSemana: &dia, HoraDesde: "07:00", HoraHasta: "08:00",
	})
	var creado bloqueoHorarioResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	otroDia := 3
	editRec := doJSONAuth(t, router, http.MethodPatch, "/bloqueos/"+creado.ID, reg.Token, crearBloqueoHorarioRequest{
		Especifico: false, Alcance: db.BloqueoAlcanceMes, DiaSemana: &otroDia, HoraDesde: "09:00", HoraHasta: "10:00",
	})
	if editRec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", editRec.Code, http.StatusOK, editRec.Body.String())
	}
	var got bloqueoHorarioResponse
	_ = json.Unmarshal(editRec.Body.Bytes(), &got)
	if got.DiaSemana == nil || *got.DiaSemana != otroDia || got.Alcance == nil || *got.Alcance != db.BloqueoAlcanceMes {
		t.Errorf("got = %+v, no refleja la edición", got)
	}
	if got.HoraDesde != "09:00" || got.HoraHasta != "10:00" {
		t.Errorf("horario = %s-%s, esperaba 09:00-10:00", got.HoraDesde, got.HoraHasta)
	}
	desde := startOfMonth(clock.Today())
	hasta := endOfMonth(clock.Today())
	if got.FechaDesde == nil || *got.FechaDesde != desde.Format("2006-01-02") || got.FechaHasta == nil || *got.FechaHasta != hasta.Format("2006-01-02") {
		t.Errorf("fechaDesde/fechaHasta = %v/%v, esperaba el mes actual resuelto de nuevo", got.FechaDesde, got.FechaHasta)
	}
}

func TestEditarBloqueo_Especifica(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "editar-bloqueo2@example.com")
	crearRec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "12:00",
	})
	var creado bloqueoHorarioResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	editRec := doJSONAuth(t, router, http.MethodPatch, "/bloqueos/"+creado.ID, reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-31", HoraDesde: "10:00", HoraHasta: "11:00",
	})
	if editRec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", editRec.Code, http.StatusOK, editRec.Body.String())
	}
	var got bloqueoHorarioResponse
	_ = json.Unmarshal(editRec.Body.Bytes(), &got)
	if got.Fecha == nil || *got.Fecha != "2026-12-31" || got.HoraDesde != "10:00" || got.HoraHasta != "11:00" {
		t.Errorf("got = %+v, no refleja la edición", got)
	}
}

func TestEditarBloqueo_ValidacionInvalida(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "editar-bloqueo3@example.com")
	crearRec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "12:00",
	})
	var creado bloqueoHorarioResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	editRec := doJSONAuth(t, router, http.MethodPatch, "/bloqueos/"+creado.ID, reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "12:00", HoraHasta: "08:00",
	})
	if editRec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", editRec.Code, http.StatusBadRequest)
	}
}

// TestEditarBloqueo_EspecificoAFechaPasadaFalla — mismo criterio que
// TestCrearBloqueo_Validaciones/"específica con fecha pasada": la
// validación vive en parsearBloqueoRequest, compartida entre alta y
// edición, así que también rechaza mover una regla ya existente al
// pasado.
func TestEditarBloqueo_EspecificoAFechaPasadaFalla(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "editar-bloqueo-pasado@example.com")
	crearRec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "09:00",
	})
	var creado bloqueoHorarioResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	ayer := clock.Today().AddDate(0, 0, -1)
	editRec := doJSONAuth(t, router, http.MethodPatch, "/bloqueos/"+creado.ID, reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: ayer.Format("2006-01-02"), HoraDesde: "08:00", HoraHasta: "09:00",
	})
	if editRec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", editRec.Code, http.StatusBadRequest)
	}
}

// TestCombinarFechaYHora — el chequeo de "en el pasado" compara la fecha
// JUNTO CON la hora de fin (no solo la fecha calendario), para que HOY
// con un horario que ya terminó también se rechace, no solo un día
// anterior. Se prueba la función pura en vez de armar un caso HTTP atado
// a la hora real de ejecución del test (cualquier margen relativo a
// clock.Now() puede cruzar la medianoche y volverse flaky).
func TestCombinarFechaYHora(t *testing.T) {
	fecha := time.Date(2026, 6, 15, 0, 0, 0, 0, clock.Today().Location())
	got := combinarFechaYHora(fecha, "14:30")
	want := time.Date(2026, 6, 15, 14, 30, 0, 0, clock.Today().Location())
	if !got.Equal(want) {
		t.Errorf("combinarFechaYHora(2026-06-15, 14:30) = %v, esperaba %v", got, want)
	}
}

func TestEditarBloqueo_Inexistente(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "editar-bloqueo4@example.com")

	editRec := doJSONAuth(t, router, http.MethodPatch, "/bloqueos/00000000-0000-0000-0000-000000000000", reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "09:00",
	})
	if editRec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", editRec.Code, http.StatusNotFound)
	}
}

func TestEditarBloqueo_DeOtraClinicaDevuelve404(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg1 := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Uno", Email: "editar-bloqueo-otro1@example.com", Password: "password123456", NombreClinica: "Clínica Uno",
	})
	reg2 := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Dos", Email: "editar-bloqueo-otro2@example.com", Password: "password123456", NombreClinica: "Clínica Dos",
	})
	crearRec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg1.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "12:00",
	})
	var creado bloqueoHorarioResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	editRec := doJSONAuth(t, router, http.MethodPatch, "/bloqueos/"+creado.ID, reg2.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "12:00",
	})
	if editRec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", editRec.Code, http.StatusNotFound)
	}
}

func TestEliminarBloqueo(t *testing.T) {
	router, reg := crearClinicaDePruebaBloqueos(t, "bloqueo7@example.com")
	crearRec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "12:00",
	})
	var creado bloqueoHorarioResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	delRec := doJSONAuth(t, router, http.MethodDelete, "/bloqueos/"+creado.ID, reg.Token, nil)
	if delRec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, esperaba %d. body=%s", delRec.Code, http.StatusNoContent, delRec.Body.String())
	}

	listaRec := doJSONAuth(t, router, http.MethodGet, "/bloqueos", reg.Token, nil)
	var lista []bloqueoHorarioResponse
	_ = json.Unmarshal(listaRec.Body.Bytes(), &lista)
	if len(lista) != 0 {
		t.Errorf("len(lista) = %d, esperaba 0 tras eliminar", len(lista))
	}
}

func TestEliminarBloqueo_DeOtraClinicaDevuelve404(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg1 := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Uno", Email: "bloqueo-otro1@example.com", Password: "password123456", NombreClinica: "Clínica Uno",
	})
	reg2 := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Dos", Email: "bloqueo-otro2@example.com", Password: "password123456", NombreClinica: "Clínica Dos",
	})

	crearRec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg1.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: "2026-12-25", HoraDesde: "08:00", HoraHasta: "12:00",
	})
	var creado bloqueoHorarioResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	delRec := doJSONAuth(t, router, http.MethodDelete, "/bloqueos/"+creado.ID, reg2.Token, nil)
	if delRec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", delRec.Code, http.StatusNotFound)
	}
}

func TestBloqueos_RequiereAutenticacion(t *testing.T) {
	router, _ := newTestRouter(t)

	rec := doJSON(t, router, http.MethodGet, "/bloqueos", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}
