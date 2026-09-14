package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// matriculaDePrueba deriva una matrícula única del mail, que ya es único
// por definición en cada test. Existe porque la matrícula pasó a ser única
// en todo el sistema (TR-141) y los helpers de test arman más de una
// persona por transacción.
func matriculaDePrueba(email string) string {
	local, _, _ := strings.Cut(email, "@")
	return "MP-" + strings.ToUpper(local)
}

// altaDePerfil registra una cuenta, le verifica el mail y le carga un
// perfil profesional con la matrícula pedida. Devuelve el status de la
// carga del perfil, que es lo que estos tests miran.
func altaDePerfil(t *testing.T, router http.Handler, gdb *gorm.DB, email, tipo, numero string) int {
	t.Helper()

	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: email, Password: "password123456", AceptaTerminos: true,
	})
	if regRec.Code != http.StatusCreated {
		t.Fatalf("registro de %s falló: status=%d body=%s", email, regRec.Code, regRec.Body.String())
	}
	marcarMailVerificadoDePrueba(t, gdb, email)
	var reg registerResponse
	if err := json.Unmarshal(regRec.Body.Bytes(), &reg); err != nil {
		t.Fatalf("respuesta de registro no es JSON válido: %v", err)
	}

	var especialidad db.Especialidad
	if err := gdb.Where("nombre = ?", "Odontología general").First(&especialidad).Error; err != nil {
		t.Fatalf("no se encontró la especialidad de prueba: %v", err)
	}

	req := onboardingPerfilRequest{
		Nombre: "Test", Apellido: "Apellido", Telefono: "+5493511234567",
		MatriculaTipo: tipo, MatriculaNumero: numero,
		EspecialidadIDs: []string{especialidad.ID.String()},
	}
	// Sin matrícula, el perfil es de tipo "actividades" — recepción o
	// administración de la página (Fase 3.2.3), que no lleva matrícula ni
	// especialidades.
	if numero == "" {
		req.TipoPerfil = db.PerfilTipoActividades
		req.MatriculaTipo = ""
		req.EspecialidadIDs = nil
	}
	return doJSONAuth(t, router, http.MethodPatch, "/onboarding/perfil", *reg.Token, req).Code
}

// TestMatricula_NoSePuedeRepetirEnOtraCuenta — el caso que motivó la
// regla: revisando la base de DEV el 2026-09-14 apareció la misma
// matrícula nacional en cuatro cuentas distintas.
func TestMatricula_NoSePuedeRepetirEnOtraCuenta(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)

	if code := altaDePerfil(t, router, gdb, "primera@example.com", db.MatriculaTipoNacional, "MN-777"); code != http.StatusOK {
		t.Fatalf("precondición: la primera alta debería funcionar, status=%d", code)
	}

	code := altaDePerfil(t, router, gdb, "segunda@example.com", db.MatriculaTipoNacional, "MN-777")
	if code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d (matrícula repetida)", code, http.StatusConflict)
	}
}

// TestMatricula_MismoNumeroDistintoTipoSePermite — la dirección inversa de
// la misma regla, que es la que hace que el índice lleve el TIPO en la
// clave: `nacional 1234` y `provincial 1234` los emiten organismos
// distintos y no son la misma persona. Sin este test, un índice solo sobre
// el número pasaría el test de arriba y bloquearía altas legítimas.
func TestMatricula_MismoNumeroDistintoTipoSePermite(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)

	if code := altaDePerfil(t, router, gdb, "nacional@example.com", db.MatriculaTipoNacional, "1234"); code != http.StatusOK {
		t.Fatalf("precondición: la matrícula nacional debería aceptarse, status=%d", code)
	}

	code := altaDePerfil(t, router, gdb, "provincial@example.com", db.MatriculaTipoProvincial, "1234")
	if code != http.StatusOK {
		t.Errorf("status = %d, esperaba %d — nacional y provincial son registros distintos", code, http.StatusOK)
	}
}

// TestMatricula_VariosPerfilesSinMatriculaConviven — por qué el índice es
// PARCIAL. Los perfiles de tipo "actividades" guardan la matrícula como
// cadena vacía, no NULL: en un índice único común todas esas cadenas
// chocarían entre sí y solo podría existir UNA recepcionista en todo el
// sistema.
func TestMatricula_VariosPerfilesSinMatriculaConviven(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)

	if code := altaDePerfil(t, router, gdb, "recepcion1@example.com", "", ""); code != http.StatusOK {
		t.Fatalf("precondición: el primer perfil sin matrícula debería aceptarse, status=%d", code)
	}

	code := altaDePerfil(t, router, gdb, "recepcion2@example.com", "", "")
	if code != http.StatusOK {
		t.Errorf("status = %d, esperaba %d — dos perfiles sin matrícula tienen que poder convivir", code, http.StatusOK)
	}
}

// TestMatricula_GuardarElPropioPerfilSinCambiarlaNoChoca — el perfil no
// puede chocar consigo mismo. El alta es un upsert por user_id, así que
// reenviar los mismos datos tiene que seguir funcionando: es lo que hace
// el wizard cuando alguien vuelve atrás y edita (spec §4).
func TestMatricula_GuardarElPropioPerfilSinCambiarlaNoChoca(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)

	if code := altaDePerfil(t, router, gdb, "repite@example.com", db.MatriculaTipoNacional, "MN-555"); code != http.StatusOK {
		t.Fatalf("precondición: el alta debería funcionar, status=%d", code)
	}

	// Segunda vez, mismo usuario, misma matrícula.
	regRec := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{
		Email: "repite@example.com", Password: "password123456",
	})
	var login loginResponse
	if err := json.Unmarshal(regRec.Body.Bytes(), &login); err != nil {
		t.Fatalf("login no devolvió JSON válido: %v", err)
	}

	var especialidad db.Especialidad
	if err := gdb.Where("nombre = ?", "Odontología general").First(&especialidad).Error; err != nil {
		t.Fatalf("no se encontró la especialidad de prueba: %v", err)
	}
	rec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/perfil", *login.Token, onboardingPerfilRequest{
		Nombre: "Test", Apellido: "Editado", Telefono: "+5493511234567",
		MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: "MN-555",
		EspecialidadIDs: []string{especialidad.ID.String()},
	})
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, esperaba %d — el perfil no puede chocar consigo mismo. body=%s",
			rec.Code, http.StatusOK, rec.Body.String())
	}
}

// TestMatricula_EditarElPerfilTomandoLaDeOtroDa409 — el otro camino de
// escritura. El índice protege los dos, pero el 409 amable hay que
// traducirlo en cada handler por separado: sin esto, editar el perfil
// desde /perfil devolvía un 500 genérico.
func TestMatricula_EditarElPerfilTomandoLaDeOtroDa409(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)

	if code := altaDePerfil(t, router, gdb, "duenio@example.com", db.MatriculaTipoNacional, "MN-111"); code != http.StatusOK {
		t.Fatalf("precondición: el alta del primero falló, status=%d", code)
	}
	token := completarPerfilDePrueba(t, router, gdb, "envidioso@example.com")

	var especialidad db.Especialidad
	if err := gdb.Where("nombre = ?", "Odontología general").First(&especialidad).Error; err != nil {
		t.Fatalf("no se encontró la especialidad de prueba: %v", err)
	}
	rec := doJSONAuth(t, router, http.MethodPatch, "/me", token, updateMeRequest{
		Nombre: "Test", Apellido: "Apellido", Telefono: "+5493511234567",
		MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: "MN-111",
		EspecialidadIDs: []string{especialidad.ID.String()},
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "matrícula") {
		t.Errorf("el mensaje no menciona la matrícula: %s", rec.Body.String())
	}
}
