package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/security"
)

// crearEnlaceTurnoDePrueba genera un enlace real vía HTTP (autenticado,
// como haría "+ Agregar turno" → "Compartir link de turnero") y devuelve
// el token crudo extraído de la URL — los tests de abajo lo necesitan
// suelto para mandarlo en `enlaceToken`.
func crearEnlaceTurnoDePrueba(t *testing.T, router http.Handler, token string) string {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodPost, "/enlaces-turno", token, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("no se pudo generar el enlace de turno: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp crearEnlaceTurnoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	idx := strings.LastIndex(resp.URL, "?enlace=")
	if idx == -1 {
		t.Fatalf("la URL del enlace no tiene el query param esperado: %s", resp.URL)
	}
	return resp.URL[idx+len("?enlace="):]
}

func TestCrearEnlaceTurno_Exitoso(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "enlace1@example.com")

	rec := doJSONAuth(t, router, http.MethodPost, "/enlaces-turno", reg.Token, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var resp crearEnlaceTurnoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if !strings.Contains(resp.URL, "/"+reg.Profesional.Slug+"?enlace=") {
		t.Errorf("url = %s, esperaba que incluyera /%s?enlace=", resp.URL, reg.Profesional.Slug)
	}
	expira, err := time.Parse(time.RFC3339, resp.ExpiraEn)
	if err != nil {
		t.Fatalf("expiraEn no es una fecha válida: %v", err)
	}
	// Ventana amplia (55-65 min) para no ser quisquilloso con el tiempo
	// que tarda la propia request de test.
	restante := time.Until(expira)
	if restante < 55*time.Minute || restante > 65*time.Minute {
		t.Errorf("expiraEn = %v desde ahora, esperaba ~1h", restante)
	}
}

func TestCrearEnlaceTurno_SinSesionRechaza(t *testing.T) {
	router, _ := newTestRouter(t)
	rec := doJSON(t, router, http.MethodPost, "/enlaces-turno", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestValidarEnlaceTurnoPublico_Valido(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "enlace2@example.com")
	token := crearEnlaceTurnoDePrueba(t, router, reg.Token)

	rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/enlaces-turno/validar?token="+token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var resp enlaceTurnoValidoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if !resp.Valido {
		t.Error("valido = false, esperaba true para un enlace recién creado")
	}
}

func TestValidarEnlaceTurnoPublico_TokenInexistenteNoEsValido(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "enlace3@example.com")

	rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/enlaces-turno/validar?token="+security.HashToken("no-existe"), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d (siempre 200, valido:false)", rec.Code, http.StatusOK)
	}
	var resp enlaceTurnoValidoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if resp.Valido {
		t.Error("valido = true, esperaba false para un token que no existe")
	}
}

func TestSolicitarTurnoPublico_ConEnlace_ParaMiSinCaptchaNiCodigo(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "enlace4@example.com")
	enlaceToken := crearEnlaceTurnoDePrueba(t, router, reg.Token)

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "Bruno", ApellidoContacto: "Iglesias", DNIContacto: "30111222",
		TelefonoContacto: "+5493511234567", EmailContacto: "bruno@example.com",
		TipoConsultaID: tipoID, Fecha: fechaDePruebaDisponibilidad, Hora: "08:00",
		EnlaceToken: enlaceToken,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d (sin CAPTCHA ni código). body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
}

func TestSolicitarTurnoPublico_ConEnlace_ParaMiLoAgotaDeInmediato(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "enlace5@example.com")
	enlaceToken := crearEnlaceTurnoDePrueba(t, router, reg.Token)

	primero := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "Bruno", ApellidoContacto: "Iglesias", DNIContacto: "30111222",
		TelefonoContacto: "+5493511234567", EmailContacto: "bruno@example.com",
		TipoConsultaID: tipoID, Fecha: fechaDePruebaDisponibilidad, Hora: "08:00",
		EnlaceToken: enlaceToken,
	})
	if primero.Code != http.StatusCreated {
		t.Fatalf("primer pedido: status = %d, esperaba %d. body=%s", primero.Code, http.StatusCreated, primero.Body.String())
	}

	// Mismo enlace, OTRO DNI (para no chocar con el tope de 1 turno activo
	// por DNI, que es una regla aparte) — el enlace en sí ya debería estar
	// muerto por haberse usado "para mí" una vez.
	segundo := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "Ana", ApellidoContacto: "Pérez", DNIContacto: "30999888",
		TelefonoContacto: "+5493511234567", EmailContacto: "ana@example.com",
		TipoConsultaID: tipoID, Fecha: fechaDePruebaDisponibilidad, Hora: "09:00",
		EnlaceToken: enlaceToken,
	})
	if segundo.Code != http.StatusForbidden {
		t.Fatalf("segundo pedido: status = %d, esperaba %d (link ya agotado). body=%s", segundo.Code, http.StatusForbidden, segundo.Body.String())
	}
}

func TestSolicitarTurnoPublico_ConEnlace_ParaOtroPermiteHastaCinco(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "enlace6@example.com")
	enlaceToken := crearEnlaceTurnoDePrueba(t, router, reg.Token)

	horas := []string{"08:00", "09:00", "10:00", "11:00", "12:00"}
	for i, hora := range horas {
		dni := "4011122" + string(rune('0'+i))
		rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
			NombreContacto: "Hijo", ApellidoContacto: "Gómez", DNIContacto: dni,
			TipoConsultaID: tipoID, Fecha: fechaDePruebaDisponibilidad, Hora: hora,
			EnlaceToken: enlaceToken, ParaOtro: true,
			TutorRelacion: "familiar", TutorNombre: "Lucía Gómez", TutorTelefono: "+5493511111111", TutorEmail: "lucia@example.com",
		})
		if rec.Code != http.StatusCreated {
			t.Fatalf("turno #%d: status = %d, esperaba %d. body=%s", i+1, rec.Code, http.StatusCreated, rec.Body.String())
		}
	}

	// El sexto, con otro DNI más, tiene que rechazarse — el enlace ya usó
	// sus 5 cupos de "para otro".
	sexto := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "Hijo", ApellidoContacto: "Gómez", DNIContacto: "40111230",
		TipoConsultaID: tipoID, Fecha: fechaDePruebaDisponibilidad, Hora: "13:00",
		EnlaceToken: enlaceToken, ParaOtro: true,
		TutorRelacion: "familiar", TutorNombre: "Lucía Gómez", TutorTelefono: "+5493511111111", TutorEmail: "lucia@example.com",
	})
	if sexto.Code != http.StatusForbidden {
		t.Fatalf("sexto pedido: status = %d, esperaba %d (tope de 5 alcanzado). body=%s", sexto.Code, http.StatusForbidden, sexto.Body.String())
	}
}

func TestSolicitarTurnoPublico_ConEnlace_VencidoPorTiempoRechaza(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "enlace7@example.com")
	enlaceToken := crearEnlaceTurnoDePrueba(t, router, reg.Token)

	// Lo vence a mano (más de 1h atrás) — mismo criterio que
	// crearTurnoAgendadoDePrueba para simular el paso del tiempo sin
	// esperarlo de verdad.
	if err := gdb.Model(&db.EnlaceTurno{}).
		Where("token_hash = ?", security.HashToken(enlaceToken)).
		Update("expira_en", time.Now().Add(-1*time.Minute)).Error; err != nil {
		t.Fatalf("no se pudo vencer el enlace de prueba: %v", err)
	}

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "Bruno", ApellidoContacto: "Iglesias", DNIContacto: "30111222",
		TelefonoContacto: "+5493511234567", EmailContacto: "bruno@example.com",
		TipoConsultaID: tipoID, Fecha: fechaDePruebaDisponibilidad, Hora: "08:00",
		EnlaceToken: enlaceToken,
	})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, esperaba %d (enlace vencido). body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
}

func TestSolicitarTurnoPublico_ConEnlace_TokenInexistenteRechaza(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "enlace8@example.com")

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "Bruno", ApellidoContacto: "Iglesias", DNIContacto: "30111222",
		TelefonoContacto: "+5493511234567", EmailContacto: "bruno@example.com",
		TipoConsultaID: tipoID, Fecha: fechaDePruebaDisponibilidad, Hora: "08:00",
		EnlaceToken: "token-inventado",
	})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, esperaba %d", rec.Code, http.StatusForbidden)
	}
}

// TestSolicitarTurnoPublico_ConEnlace_ConflictoDeIdentidadSigueIgual —
// corrección textual del cliente: los checks que SÍ se mantienen con
// enlace son la detección de conflictos y el tope de 1 turno activo por
// DNI. Reusa exactamente el mismo escenario que
// TestSolicitarTurnoPublico_MismoDNIMailDistintoCreaConflictoVisibleSiOriginalYaVerificada,
// pero disparado vía enlace en vez del flujo con código.
func TestSolicitarTurnoPublico_ConEnlace_ConflictoDeIdentidadSigueIgual(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "enlace9@example.com")
	verificado := crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "original@example.com")
	enlaceToken := crearEnlaceTurnoDePrueba(t, router, reg.Token)

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "Bruno", ApellidoContacto: "Impostor", DNIContacto: "30111222",
		TelefonoContacto: "+5493511234567", EmailContacto: "otro-mail@example.com",
		TipoConsultaID: tipoID, Fecha: fechaDePruebaDisponibilidad, Hora: "08:00",
		EnlaceToken: enlaceToken,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d (se deja pasar, con conflicto). body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var cantidad int64
	if err := gdb.Model(&db.ConflictoPaciente{}).Where("paciente_verificado_id = ?", verificado.ID).Count(&cantidad).Error; err != nil {
		t.Fatalf("no se pudo contar los conflictos: %v", err)
	}
	if cantidad != 1 {
		t.Errorf("conflictos = %d, esperaba 1 (la detección de conflictos sigue igual con enlace)", cantidad)
	}
}

// TestSolicitarTurnoPublico_ConEnlace_TopeUniversalPorDNISigueIgual —
// mismo criterio que el test de arriba, para la otra regla que el
// cliente confirmó que se mantiene.
func TestSolicitarTurnoPublico_ConEnlace_TopeUniversalPorDNISigueIgual(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "enlace10@example.com")
	enlaceToken := crearEnlaceTurnoDePrueba(t, router, reg.Token)

	primero := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "Bruno", ApellidoContacto: "Iglesias", DNIContacto: "30111222",
		TelefonoContacto: "+5493511234567", EmailContacto: "bruno@example.com",
		TipoConsultaID: tipoID, Fecha: fechaDePruebaDisponibilidad, Hora: "08:00",
		EnlaceToken: enlaceToken, ParaOtro: true,
		TutorRelacion: "familiar", TutorNombre: "Lucía Gómez", TutorTelefono: "+5493511111111", TutorEmail: "lucia@example.com",
	})
	if primero.Code != http.StatusCreated {
		t.Fatalf("primer pedido: status = %d, esperaba %d. body=%s", primero.Code, http.StatusCreated, primero.Body.String())
	}

	// Mismo DNI, otro horario — el tope universal de 1 turno activo por
	// DNI tiene que rechazarlo aunque el enlace todavía tenga cupos de
	// "para otro" sin usar.
	segundo := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "Bruno", ApellidoContacto: "Iglesias", DNIContacto: "30111222",
		TelefonoContacto: "+5493511234567", EmailContacto: "bruno@example.com",
		TipoConsultaID: tipoID, Fecha: fechaDePruebaDisponibilidad, Hora: "09:00",
		EnlaceToken: enlaceToken, ParaOtro: true,
		TutorRelacion: "familiar", TutorNombre: "Lucía Gómez", TutorTelefono: "+5493511111111", TutorEmail: "lucia@example.com",
	})
	if segundo.Code != http.StatusConflict {
		t.Fatalf("segundo pedido: status = %d, esperaba %d (tope universal por DNI)", segundo.Code, http.StatusConflict)
	}
}
