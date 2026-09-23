package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

func diasCerradosPE6() []diaHorarioClinicaResponse {
	dias := make([]diaHorarioClinicaResponse, 7)
	for i := range dias {
		dias[i] = diaHorarioClinicaResponse{
			DiaSemana: i,
			Cerrado:   true,
			Franjas:   []franjaHorarioClinicaResponse{},
		}
	}
	return dias
}

func TestValidarHorarioClinicaPE6(t *testing.T) {
	tests := []struct {
		nombre string
		dias   []diaHorarioClinicaResponse
		valido bool
	}{
		{nombre: "siete días cerrados", dias: diasCerradosPE6(), valido: true},
		{nombre: "faltan días", dias: diasCerradosPE6()[:6]},
		{nombre: "día repetido", dias: func() []diaHorarioClinicaResponse {
			dias := diasCerradosPE6()
			dias[6].DiaSemana = 5
			return dias
		}()},
		{nombre: "día fuera de rango", dias: func() []diaHorarioClinicaResponse {
			dias := diasCerradosPE6()
			dias[6].DiaSemana = 7
			return dias
		}()},
		{nombre: "cerrado con franjas", dias: func() []diaHorarioClinicaResponse {
			dias := diasCerradosPE6()
			dias[1].Franjas = []franjaHorarioClinicaResponse{{Desde: "09:00", Hasta: "10:00"}}
			return dias
		}()},
		{nombre: "abierto sin franjas", dias: func() []diaHorarioClinicaResponse {
			dias := diasCerradosPE6()
			dias[1].Cerrado = false
			return dias
		}()},
		{nombre: "más de dos franjas", dias: func() []diaHorarioClinicaResponse {
			dias := diasCerradosPE6()
			dias[1].Cerrado = false
			dias[1].Franjas = []franjaHorarioClinicaResponse{
				{Desde: "08:00", Hasta: "09:00"},
				{Desde: "10:00", Hasta: "11:00"},
				{Desde: "12:00", Hasta: "13:00"},
			}
			return dias
		}()},
		{nombre: "hora inválida", dias: func() []diaHorarioClinicaResponse {
			dias := diasCerradosPE6()
			dias[1].Cerrado = false
			dias[1].Franjas = []franjaHorarioClinicaResponse{{Desde: "24:00", Hasta: "25:00"}}
			return dias
		}()},
		{nombre: "fin antes del inicio", dias: func() []diaHorarioClinicaResponse {
			dias := diasCerradosPE6()
			dias[1].Cerrado = false
			dias[1].Franjas = []franjaHorarioClinicaResponse{{Desde: "10:00", Hasta: "09:00"}}
			return dias
		}()},
		{nombre: "franjas superpuestas", dias: func() []diaHorarioClinicaResponse {
			dias := diasCerradosPE6()
			dias[1].Cerrado = false
			dias[1].Franjas = []franjaHorarioClinicaResponse{
				{Desde: "09:00", Hasta: "12:00"},
				{Desde: "11:00", Hasta: "13:00"},
			}
			return dias
		}()},
		{nombre: "franjas válidas fuera de orden", dias: func() []diaHorarioClinicaResponse {
			dias := diasCerradosPE6()
			dias[1].Cerrado = false
			dias[1].Franjas = []franjaHorarioClinicaResponse{
				{Desde: "13:00", Hasta: "17:00"},
				{Desde: "08:00", Hasta: "12:00"},
			}
			return dias
		}(), valido: true},
	}

	for _, tt := range tests {
		t.Run(tt.nombre, func(t *testing.T) {
			filas, mensaje := validarHorarioClinica(tt.dias)
			if tt.valido && mensaje != "" {
				t.Fatalf("horario válido rechazado: %s", mensaje)
			}
			if !tt.valido && mensaje == "" {
				t.Fatal("esperaba que el horario inválido fuera rechazado")
			}
			if !tt.valido {
				return
			}
			if len(filas) != 7 || filas[0].DiaSemana != 0 || filas[6].DiaSemana != 6 {
				t.Fatalf("filas no ordenadas por día: %+v", filas)
			}
			if !filas[1].Cerrado && (len(filas[1].Franjas) != 2 || filas[1].Franjas[0].Desde != "08:00") {
				t.Errorf("franjas no normalizadas en orden horario: %+v", filas[1])
			}
		})
	}
}

func TestHorarioClinicaPE6_RutasPersistenciaYEstadoCordoba(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana Horarios", Email: "pe6-horarios@example.com", Password: "password123456", NombreClinica: "Clínica Horarios PE6",
	})

	anonimo := doJSON(t, router, http.MethodGet, "/horario-clinica", nil)
	if anonimo.Code != http.StatusUnauthorized {
		t.Fatalf("GET anónimo status=%d, esperaba 401", anonimo.Code)
	}

	colegaToken := sumarColaboradorDePrueba(t, gdb, router, uuid.MustParse(reg.Profesional.ID), "pe6-horarios-colega@example.com", db.RoleProfesional)
	noAdmin := doJSONAuth(t, router, http.MethodGet, "/horario-clinica", colegaToken, nil)
	if noAdmin.Code != http.StatusForbidden {
		t.Fatalf("GET de profesional sin admin status=%d body=%s, esperaba 403", noAdmin.Code, noAdmin.Body.String())
	}

	primera := doJSONAuth(t, router, http.MethodGet, "/horario-clinica", reg.Token, nil)
	if primera.Code != http.StatusOK {
		t.Fatalf("GET horario inicial status=%d body=%s", primera.Code, primera.Body.String())
	}
	var inicial horariosClinicaResponse
	if err := json.Unmarshal(primera.Body.Bytes(), &inicial); err != nil {
		t.Fatal(err)
	}
	if len(inicial.Dias) != 7 || inicial.Nota != "" {
		t.Fatalf("horario inicial inesperado: %+v", inicial)
	}
	for _, dia := range inicial.Dias {
		if !dia.Cerrado || len(dia.Franjas) != 0 {
			t.Fatalf("día inicial debía estar cerrado: %+v", dia)
		}
	}

	ahora := clock.Now()
	dias := diasCerradosPE6()
	diaActual := int(ahora.Weekday())
	dias[diaActual].Cerrado = false
	dias[diaActual].Franjas = []franjaHorarioClinicaResponse{{Desde: "00:00", Hasta: "23:59"}}
	nota := "Feriados cerrado"
	guardado := doJSONAuth(t, router, http.MethodPut, "/horario-clinica", reg.Token, putHorariosClinicaRequest{Dias: dias, Nota: nota})
	if guardado.Code != http.StatusOK {
		t.Fatalf("PUT horario status=%d body=%s", guardado.Code, guardado.Body.String())
	}
	var guardadoJSON horariosClinicaResponse
	if err := json.Unmarshal(guardado.Body.Bytes(), &guardadoJSON); err != nil {
		t.Fatal(err)
	}
	if guardadoJSON.Nota != nota || len(guardadoJSON.Dias) != 7 || guardadoJSON.AbiertoAhora != nil {
		t.Fatalf("respuesta del editor inesperada: %+v", guardadoJSON)
	}

	// Un request inválido no debe borrar ni reemplazar el horario vigente.
	invalidos := diasCerradosPE6()
	invalidos[0].Cerrado = false
	invalidos[0].Franjas = []franjaHorarioClinicaResponse{
		{Desde: "08:00", Hasta: "12:00"},
		{Desde: "11:00", Hasta: "13:00"},
	}
	rechazado := doJSONAuth(t, router, http.MethodPut, "/horario-clinica", reg.Token, putHorariosClinicaRequest{Dias: invalidos})
	if rechazado.Code != http.StatusBadRequest {
		t.Fatalf("PUT inválido status=%d body=%s", rechazado.Code, rechazado.Body.String())
	}
	lectura := doJSONAuth(t, router, http.MethodGet, "/horario-clinica", reg.Token, nil)
	var persistido horariosClinicaResponse
	if err := json.Unmarshal(lectura.Body.Bytes(), &persistido); err != nil {
		t.Fatal(err)
	}
	if persistido.Nota != nota || len(persistido.Dias[diaActual].Franjas) != 1 || persistido.Dias[diaActual].Franjas[0].Desde != "00:00" {
		t.Fatalf("un request inválido alteró el horario persistido: %+v", persistido)
	}

	publico := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug, nil)
	if publico.Code != http.StatusOK {
		t.Fatalf("GET público status=%d body=%s", publico.Code, publico.Body.String())
	}
	var pagina clinicaPublicaResponse
	if err := json.Unmarshal(publico.Body.Bytes(), &pagina); err != nil {
		t.Fatal(err)
	}
	if pagina.HorariosClinica.AbiertoAhora == nil {
		t.Fatal("horariosClinica.abiertoAhora no llegó en el DTO público")
	}
	instantePublico := clock.Now()
	esperadoAbierto := int(instantePublico.Weekday()) == diaActual && instantePublico.Hour()*60+instantePublico.Minute() < 23*60+59
	if *pagina.HorariosClinica.AbiertoAhora != esperadoAbierto {
		t.Errorf("abiertoAhora=%v, esperado=%v para el reloj de Córdoba %s", *pagina.HorariosClinica.AbiertoAhora, esperadoAbierto, instantePublico.Format("Mon 15:04"))
	}
}

func TestAvalPaginaPublicaPE6_ConsentimientoPropioYClinicasEnMe(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana Aval", Email: "pe6-aval@example.com", Password: "password123456", NombreClinica: "Clínica Aval PE6",
	})
	clinicID := reg.Profesional.ID

	meInicial := doJSONAuth(t, router, http.MethodGet, "/me", reg.Token, nil)
	var inicial meResponse
	if err := json.Unmarshal(meInicial.Body.Bytes(), &inicial); err != nil {
		t.Fatal(err)
	}
	if len(inicial.ClinicasPaginaPublica) != 1 || inicial.ClinicasPaginaPublica[0].AvalPaginaPublica {
		t.Fatalf("aval inicial inesperado en /me: %+v", inicial.ClinicasPaginaPublica)
	}

	anonimo := doJSON(t, router, http.MethodPut, "/me/aval-pagina", actualizarAvalPaginaPublicaRequest{ClinicID: clinicID, AvalPaginaPublica: true})
	if anonimo.Code != http.StatusUnauthorized {
		t.Fatalf("PUT anónimo status=%d, esperaba 401", anonimo.Code)
	}
	malformado := doJSONAuth(t, router, http.MethodPut, "/me/aval-pagina", reg.Token, actualizarAvalPaginaPublicaRequest{ClinicID: "no-uuid", AvalPaginaPublica: true})
	if malformado.Code != http.StatusBadRequest {
		t.Fatalf("clinicId inválido status=%d, esperaba 400", malformado.Code)
	}

	optIn := doJSONAuth(t, router, http.MethodPut, "/me/aval-pagina", reg.Token, actualizarAvalPaginaPublicaRequest{ClinicID: clinicID, AvalPaginaPublica: true})
	if optIn.Code != http.StatusOK {
		t.Fatalf("opt-in status=%d body=%s", optIn.Code, optIn.Body.String())
	}
	var activado actualizarAvalPaginaPublicaResponse
	if err := json.Unmarshal(optIn.Body.Bytes(), &activado); err != nil {
		t.Fatal(err)
	}
	if !activado.AvalPaginaPublica || activado.AvalPaginaEn == nil {
		t.Fatalf("opt-in no persistió fecha de aval: %+v", activado)
	}
	optInRepetido := doJSONAuth(t, router, http.MethodPut, "/me/aval-pagina", reg.Token, actualizarAvalPaginaPublicaRequest{ClinicID: clinicID, AvalPaginaPublica: true})
	var repetido actualizarAvalPaginaPublicaResponse
	if err := json.Unmarshal(optInRepetido.Body.Bytes(), &repetido); err != nil {
		t.Fatal(err)
	}
	if repetido.AvalPaginaEn == nil || !repetido.AvalPaginaEn.Equal(activado.AvalPaginaEn.Truncate(time.Microsecond)) {
		t.Errorf("repetir opt-in debería conservar su fecha: primero=%v después=%v", activado.AvalPaginaEn, repetido.AvalPaginaEn)
	}

	meActivado := doJSONAuth(t, router, http.MethodGet, "/me", reg.Token, nil)
	var respuestaMe meResponse
	if err := json.Unmarshal(meActivado.Body.Bytes(), &respuestaMe); err != nil {
		t.Fatal(err)
	}
	if len(respuestaMe.ClinicasPaginaPublica) != 1 || !respuestaMe.ClinicasPaginaPublica[0].AvalPaginaPublica {
		t.Fatalf("/me no reflejó el aval: %+v", respuestaMe.ClinicasPaginaPublica)
	}

	regAjeno := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Bruno Ajeno", Email: "pe6-aval-ajeno@example.com", Password: "password123456", NombreClinica: "Clínica Ajena Aval PE6",
	})
	cruceTenant := doJSONAuth(t, router, http.MethodPut, "/me/aval-pagina", regAjeno.Token, actualizarAvalPaginaPublicaRequest{ClinicID: clinicID, AvalPaginaPublica: false})
	if cruceTenant.Code != http.StatusNotFound {
		t.Fatalf("un usuario ajeno cambió aval: status=%d body=%s", cruceTenant.Code, cruceTenant.Body.String())
	}

	optOut := doJSONAuth(t, router, http.MethodPut, "/me/aval-pagina", reg.Token, actualizarAvalPaginaPublicaRequest{ClinicID: clinicID, AvalPaginaPublica: false})
	if optOut.Code != http.StatusOK {
		t.Fatalf("opt-out status=%d body=%s", optOut.Code, optOut.Body.String())
	}
	var desactivado actualizarAvalPaginaPublicaResponse
	if err := json.Unmarshal(optOut.Body.Bytes(), &desactivado); err != nil {
		t.Fatal(err)
	}
	if desactivado.AvalPaginaPublica || desactivado.AvalPaginaEn != nil {
		t.Errorf("opt-out no limpió el aval y la fecha: %+v", desactivado)
	}
	meDesactivado := doJSONAuth(t, router, http.MethodGet, "/me", reg.Token, nil)
	if err := json.Unmarshal(meDesactivado.Body.Bytes(), &respuestaMe); err != nil {
		t.Fatal(err)
	}
	if len(respuestaMe.ClinicasPaginaPublica) != 1 || respuestaMe.ClinicasPaginaPublica[0].AvalPaginaPublica {
		t.Fatalf("/me no reflejó el opt-out: %+v", respuestaMe.ClinicasPaginaPublica)
	}
}

func TestPaginaPublicaPE6_EquipoYServiciosVivosSinDatosPrivados(t *testing.T) {
	router, gdb := newTestRouter(t)
	owner := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana Pública", Email: "pe6-publico-owner@example.com", Password: "password123456", NombreClinica: "Clínica Pública PE6",
	})
	colega := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Bruno Público", Email: "pe6-publico-colega@example.com", Password: "password123456", NombreClinica: "Clínica Colega PE6",
	})
	clinicID := uuid.MustParse(owner.Profesional.ID)

	var userOwner, userColega db.User
	if err := gdb.Where("email = ?", "pe6-publico-owner@example.com").First(&userOwner).Error; err != nil {
		t.Fatal(err)
	}
	if err := gdb.Where("email = ?", "pe6-publico-colega@example.com").First(&userColega).Error; err != nil {
		t.Fatal(err)
	}
	memberColega := db.ClinicMember{ClinicID: clinicID, UserID: userColega.ID, Status: db.ClinicMemberStatusActive}
	if err := gdb.Create(&memberColega).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.AsignarRol(gdb, memberColega.ID, db.RoleProfesional); err != nil {
		t.Fatal(err)
	}

	// Ambos profesionales ofrecen el mismo servicio con duraciones distintas.
	for _, tipo := range []db.TipoConsulta{
		{ClinicID: clinicID, UserID: &userOwner.ID, Nombre: "Limpieza dental", Color: "#2f7771", DuracionMinutos: 30},
		{ClinicID: clinicID, UserID: &userColega.ID, Nombre: "Limpieza dental", Color: "#2f7771", DuracionMinutos: 60},
	} {
		if err := gdb.Create(&tipo).Error; err != nil {
			t.Fatal(err)
		}
	}

	for _, caso := range []struct {
		token  string
		userID uuid.UUID
	}{
		{token: owner.Token, userID: userOwner.ID},
		{token: colega.Token, userID: userColega.ID},
	} {
		rec := doJSONAuth(t, router, http.MethodPut, "/me/aval-pagina", caso.token,
			actualizarAvalPaginaPublicaRequest{ClinicID: clinicID.String(), AvalPaginaPublica: true})
		if rec.Code != http.StatusOK {
			t.Fatalf("opt-in en la clínica compartida status=%d body=%s user=%s", rec.Code, rec.Body.String(), caso.userID)
		}
	}

	editorRec := doJSONAuth(t, router, http.MethodGet, "/panel/pagina", owner.Token, nil)
	if editorRec.Code != http.StatusOK {
		t.Fatalf("GET editor status=%d body=%s", editorRec.Code, editorRec.Body.String())
	}
	var editor paginaPublicaResponse
	if err := json.Unmarshal(editorRec.Body.Bytes(), &editor); err != nil {
		t.Fatal(err)
	}
	if len(editor.EquipoElegible) < 2 {
		t.Fatalf("el editor no devolvió los dos profesionales: %+v", editor.EquipoElegible)
	}
	for _, profesional := range editor.EquipoElegible {
		if profesional.UserID == userOwner.ID.String() || profesional.UserID == userColega.ID.String() {
			if !profesional.Aval {
				t.Errorf("aval no reflejado para %s: %+v", profesional.UserID, profesional)
			}
		}
	}

	servicioEncontrado := false
	for _, servicio := range editor.ServiciosDisponibles {
		if normalizarNombreTipo(servicio.Nombre) == normalizarNombreTipo("Limpieza dental") {
			servicioEncontrado = true
			if servicio.DuracionMinima != 30 || servicio.DuracionMaxima != 60 {
				t.Errorf("duraciones agrupadas incorrectas: %+v", servicio)
			}
		}
	}
	if !servicioEncontrado {
		t.Fatalf("falta Limpieza dental en servicios del editor: %+v", editor.ServiciosDisponibles)
	}

	duplicadosServicio := []moduloRequest{{Tipo: "servicios", Config: map[string]any{
		"nombres": []any{"Limpieza dental", "Limpieza-dental"},
	}}}
	if err := validarServiciosSeleccionados(duplicadosServicio); err == nil {
		t.Fatal("validarServiciosSeleccionados aceptó nombres equivalentes")
	}
	duplicadoPorHTTP := []moduloRequest{{Tipo: "servicios", Orden: 0, Visible: true, Config: map[string]any{
		"nombres": []string{"Limpieza dental", "Limpieza-dental"},
	}}}
	duplicadoPorHTTPPtr := &duplicadoPorHTTP
	respuestaDuplicada := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina", owner.Token, actualizarPaginaPublicaRequest{
		Modulos: duplicadoPorHTTPPtr, Revision: intPtr(editor.Revision),
	})
	if respuestaDuplicada.Code != http.StatusBadRequest {
		t.Fatalf("PATCH aceptó nombres de servicio equivalentes: status=%d body=%s", respuestaDuplicada.Code, respuestaDuplicada.Body.String())
	}

	modulos := []moduloRequest{
		{Tipo: "equipo", Orden: 0, Visible: true, Config: map[string]any{
			"modo": "seleccion", "userIds": []string{userOwner.ID.String(), userColega.ID.String()},
		}},
		{Tipo: "servicios", Orden: 1, Visible: true, Config: map[string]any{"nombres": []string{"Limpieza dental"}}},
	}
	modulosPtr := &modulos
	actualizacion := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina", owner.Token, actualizarPaginaPublicaRequest{
		Modulos: modulosPtr, Revision: intPtr(editor.Revision),
	})
	if actualizacion.Code != http.StatusOK {
		t.Fatalf("PATCH módulos PE-6 status=%d body=%s", actualizacion.Code, actualizacion.Body.String())
	}
	publicar := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/publicar", owner.Token, nil)
	if publicar.Code != http.StatusOK {
		t.Fatalf("publicar PE-6 status=%d body=%s", publicar.Code, publicar.Body.String())
	}

	publica := doJSON(t, router, http.MethodGet, "/clinicas/"+owner.Profesional.Slug, nil)
	if publica.Code != http.StatusOK {
		t.Fatalf("GET público status=%d body=%s", publica.Code, publica.Body.String())
	}
	var contenido clinicaPublicaResponse
	if err := json.Unmarshal(publica.Body.Bytes(), &contenido); err != nil {
		t.Fatal(err)
	}
	if len(contenido.Servicios) == 0 {
		t.Fatal("la respuesta pública no incluye servicios vivos")
	}
	var equipoAntes []any
	for _, modulo := range contenido.Modulos {
		if modulo.Tipo == "equipo" {
			if _, exponeIDs := modulo.Config["userIds"]; exponeIDs {
				t.Fatalf("la config pública de equipo expuso userIds: %+v", modulo.Config)
			}
			var ok bool
			equipoAntes, ok = modulo.DatosVista["equipo"].([]any)
			if !ok || len(equipoAntes) != 2 {
				t.Fatalf("datosVista.equipo no contiene ambos consentimientos: %+v", modulo.DatosVista)
			}
		}
	}
	if len(equipoAntes) != 2 {
		t.Fatalf("no se encontró el módulo público de equipo: %+v", contenido.Modulos)
	}

	// El snapshot conserva la selección, pero el servidor debe volver a filtrar
	// por el consentimiento vigente cada vez que sirve la página pública.
	revocado := doJSONAuth(t, router, http.MethodPut, "/me/aval-pagina", colega.Token,
		actualizarAvalPaginaPublicaRequest{ClinicID: clinicID.String(), AvalPaginaPublica: false})
	if revocado.Code != http.StatusOK {
		t.Fatalf("opt-out del colega status=%d body=%s", revocado.Code, revocado.Body.String())
	}
	publicaTrasOptOut := doJSON(t, router, http.MethodGet, "/clinicas/"+owner.Profesional.Slug, nil)
	var contenidoFiltrado clinicaPublicaResponse
	if err := json.Unmarshal(publicaTrasOptOut.Body.Bytes(), &contenidoFiltrado); err != nil {
		t.Fatal(err)
	}
	var equipoActual []map[string]any
	for _, modulo := range contenidoFiltrado.Modulos {
		if modulo.Tipo == "equipo" {
			if _, exponeIDs := modulo.Config["userIds"]; exponeIDs {
				t.Fatalf("la config pública de equipo expuso userIds: %+v", modulo.Config)
			}
			valores, ok := modulo.DatosVista["equipo"].([]any)
			if !ok {
				t.Fatalf("datosVista.equipo tiene formato inesperado: %+v", modulo.DatosVista)
			}
			for _, valor := range valores {
				fila, ok := valor.(map[string]any)
				if !ok {
					t.Fatalf("integrante público con formato inesperado: %#v", valor)
				}
				equipoActual = append(equipoActual, fila)
			}
		}
	}
	if len(equipoActual) != 1 || equipoActual[0]["nombre"] != "Ana Pública" {
		t.Fatalf("equipo público no respetó el consentimiento actualizado: %+v", equipoActual)
	}
	modoTodos, err := equipoPublicoDeModulo(gdb, clinicID, map[string]any{"modo": "todos"})
	if err != nil || len(modoTodos) != 1 || modoTodos[0].Nombre != "Ana Pública" {
		t.Fatalf("modo todos no devolvió solo integrantes con aval vigente: equipo=%+v err=%v", modoTodos, err)
	}
	modoInvalido, err := equipoPublicoDeModulo(gdb, clinicID, map[string]any{"modo": "no-existe"})
	if err != nil || len(modoInvalido) != 0 {
		t.Fatalf("modo desconocido no debería devolver equipo: equipo=%+v err=%v", modoInvalido, err)
	}
	for _, miembro := range equipoActual {
		for _, campoPrivado := range []string{"userId", "id", "matricula", "matriculaNumero"} {
			if _, existe := miembro[campoPrivado]; existe {
				t.Errorf("el DTO público incluye campo privado %q: %+v", campoPrivado, miembro)
			}
		}
	}
	var perfilOwner db.ProfessionalProfile
	if err := gdb.First(&perfilOwner, "user_id = ?", userOwner.ID).Error; err != nil {
		t.Fatal(err)
	}
	bodyPublico := publicaTrasOptOut.Body.String()
	for _, secreto := range []string{userOwner.ID.String(), userColega.ID.String(), perfilOwner.MatriculaNumero} {
		if secreto != "" && strings.Contains(bodyPublico, secreto) {
			t.Errorf("la respuesta pública contiene un valor interno: %q", secreto)
		}
	}

	// Un ID repetido se rechaza antes de consultar membresías; un integrante
	// sin aval vigente tampoco puede ser guardado en modo selección.
	duplicados := []moduloRequest{{Tipo: "equipo", Config: map[string]any{
		"modo": "seleccion", "userIds": []any{userOwner.ID.String(), userOwner.ID.String()},
	}}}
	if err := validarSeleccionDeEquipo(gdb, clinicID, duplicados); err == nil {
		t.Fatal("validarSeleccionDeEquipo aceptó IDs duplicados")
	}
	noConsentido := []moduloRequest{{Tipo: "equipo", Config: map[string]any{
		"modo": "seleccion", "userIds": []any{userColega.ID.String()},
	}}}
	if err := validarSeleccionDeEquipo(gdb, clinicID, noConsentido); err == nil {
		t.Fatal("validarSeleccionDeEquipo aceptó un profesional sin aval vigente")
	}
	if err := validarSeleccionDeEquipo(gdb, clinicID, []moduloRequest{{Tipo: "equipo", Config: map[string]any{"modo": "todos"}}}); err != nil {
		t.Errorf("modo todos no debería depender de IDs guardados: %v", err)
	}
	if err := validarSeleccionDeEquipo(gdb, clinicID, []moduloRequest{{Tipo: "equipo", Config: map[string]any{"modo": "seleccion"}}}); err != nil {
		t.Errorf("selección sin IDs debería ser una selección vacía: %v", err)
	}
	for _, config := range []map[string]any{
		{"modo": "seleccion", "userIds": 12},
		{"modo": "seleccion", "userIds": []any{12}},
		{"modo": "seleccion", "userIds": []any{"no-es-uuid"}},
	} {
		if err := validarSeleccionDeEquipo(gdb, clinicID, []moduloRequest{{Tipo: "equipo", Config: config}}); err == nil {
			t.Errorf("validarSeleccionDeEquipo aceptó config inválida: %#v", config)
		}
	}

	// También se serializa el DTO directamente para que el contrato del test
	// deje claro que nunca debe incluirse matrícula aunque exista en el perfil.
	jsonPublico, err := json.Marshal(contenidoFiltrado)
	if err != nil {
		t.Fatal(err)
	}
	if perfilOwner.MatriculaNumero != "" && strings.Contains(string(jsonPublico), perfilOwner.MatriculaNumero) {
		t.Error("la matrícula del perfil apareció al serializar el DTO público")
	}
}
