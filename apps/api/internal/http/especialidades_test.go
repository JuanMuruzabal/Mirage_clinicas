package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

func TestListEspecialidades_SoloDevuelveLasActivas(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})

	req := httptest.NewRequest(http.MethodGet, "/especialidades", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var got []especialidadResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	// TR-011: hoy solo "Odontología general" está visible, el resto del
	// catálogo cerrado (TR-004) sigue sembrado pero oculto.
	if len(got) != 1 {
		t.Fatalf("len(got) = %d, esperaba 1 (TR-011)", len(got))
	}
	if got[0].Nombre != "Odontología general" {
		t.Errorf("Nombre = %q, esperaba %q", got[0].Nombre, "Odontología general")
	}
}

func TestListEspecialidades_ElRestoDelCatalogoSigueSembradoPeroOculto(t *testing.T) {
	gdb := testdb.New(t)
	_ = db.RunMigrations(gdb) // ya corrió en testdb.New, pero deja explícito el seed acá

	var total int64
	if err := gdb.Model(&db.Especialidad{}).Count(&total).Error; err != nil {
		t.Fatalf("no se pudo contar especialidades: %v", err)
	}
	if total != int64(len(db.CatalogoEspecialidades)) {
		t.Errorf("total sembrado = %d, esperaba %d (TR-004, catálogo cerrado completo)", total, len(db.CatalogoEspecialidades))
	}

	var activas int64
	if err := gdb.Model(&db.Especialidad{}).Where("activa = ?", true).Count(&activas).Error; err != nil {
		t.Fatalf("no se pudo contar especialidades activas: %v", err)
	}
	if activas != int64(len(db.EspecialidadesVisibles)) {
		t.Errorf("activas = %d, esperaba %d (TR-011)", activas, len(db.EspecialidadesVisibles))
	}
}

func TestListEspecialidades_NoRequiereAutenticacion(t *testing.T) {
	router := NewRouter(nil, "un-secret", []string{"http://localhost:3000"})

	req := httptest.NewRequest(http.MethodGet, "/especialidades", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	// Sin DB (nil) el handler igual intenta la query y falla con 500, no
	// 401 — lo relevante es que nunca pide token.
	if rec.Code == http.StatusUnauthorized {
		t.Error("GET /especialidades no debería exigir autenticación")
	}
}
