package http

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
)

// Un anexo pertenece a una historia clínica del mismo paciente (5.6b, ronda
// A): se elige al crearlo y no se mueve.

func TestDocumentos_UnAnexoSinHistoriaNoSeCrea(t *testing.T) {
	e := escenarioDeDocumentos(t, "anexo-sin-historia")
	rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", e.token, map[string]any{
		"plantillaId": plantillaAnexoDePrueba, "pacienteId": e.paciente.ID.String(),
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("un anexo sin historia: se esperaba 400, llegó %d — %s", rec.Code, rec.Body.String())
	}

	historia := e.crear(t, e.token, e.paciente.ID)
	rec = doJSONAuth(t, e.router, http.MethodPost, "/documentos", e.token, map[string]any{
		"plantillaId": plantillaConducto, "pacienteId": e.paciente.ID.String(), "historiaId": historia.ID,
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("un documento que no es un anexo, con historia: se esperaba 400, llegó %d", rec.Code)
	}
}

func TestDocumentos_UnAnexoConLaHistoriaDeOtroPacienteNoSeCrea(t *testing.T) {
	e := escenarioDeDocumentos(t, "anexo-otro-paciente")
	otro := db.Paciente{ClinicID: e.clinicID, Nombre: "Bruno", Apellido: "Sosa", DNI: "40999888", Origen: "manual", CreadoPorUserID: &e.titularID}
	if err := e.gdb.Create(&otro).Error; err != nil {
		t.Fatal(err)
	}
	historiaDelOtro := e.crear(t, e.token, otro.ID)
	for nombre, historiaID := range map[string]string{
		"la historia de otro paciente": historiaDelOtro.ID,
		"una historia que no existe":   uuid.NewString(),
	} {
		rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", e.token, map[string]any{
			"plantillaId": plantillaAnexoDePrueba, "pacienteId": e.paciente.ID.String(), "historiaId": historiaID,
		})
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s: se esperaba 404, llegó %d", nombre, rec.Code)
		}
	}
}

func TestDocumentos_UnaHistoriaConAnexosNoSeDescarta(t *testing.T) {
	e := escenarioDeDocumentos(t, "anexo-descartar")
	historia := e.crear(t, e.token, e.paciente.ID)
	rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", e.token, map[string]any{
		"plantillaId": plantillaAnexoDePrueba, "pacienteId": e.paciente.ID.String(), "historiaId": historia.ID,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("crear el anexo: %d — %s", rec.Code, rec.Body.String())
	}
	anexo := decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if anexo.AnexoDe == nil || anexo.AnexoDe.ID != historia.ID {
		t.Fatalf("el anexo dice de qué historia es: %+v", anexo.AnexoDe)
	}

	if rec := doJSONAuth(t, e.router, http.MethodDelete, "/documentos/"+historia.ID, e.token, nil); rec.Code != http.StatusConflict {
		t.Fatalf("descartar una historia con anexos: se esperaba 409, llegó %d", rec.Code)
	}
	// Sin el anexo, ya se puede.
	if rec := doJSONAuth(t, e.router, http.MethodDelete, "/documentos/"+anexo.ID, e.token, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("descartar el anexo: %d", rec.Code)
	}
	if rec := doJSONAuth(t, e.router, http.MethodDelete, "/documentos/"+historia.ID, e.token, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("descartar la historia sin anexos: %d", rec.Code)
	}
}

// Un anexo sellado cuya historia sigue en borrador de su autor: un colega ve
// el anexo, sabe que tiene historia y no ve nada de ella (ni el id).
func TestDocumentos_UnColegaVeQueElAnexoTieneHistoriaSinVerla(t *testing.T) {
	e := escenarioDeDocumentos(t, "anexo-historia-oculta")
	historia := e.crear(t, e.token, e.paciente.ID)
	historiaID := uuid.MustParse(historia.ID)
	contenido, huella, ahora := "{}", strings.Repeat("a", 64), time.Now()
	numero, cadena := 1, int64(1)
	anexo := db.DocumentoClinico{
		ClinicID: e.clinicID, PacienteID: e.paciente.ID, AutorUserID: e.titularID,
		PlantillaID: plantillaAnexoDePrueba, PlantillaVersion: 1, AnexoDe: &historiaID, AnexoNumero: &numero,
		Estado: db.DocumentoSellado, ContenidoCanonico: &contenido, HashContenido: &huella, TerminadoEn: &ahora,
		CadenaN: &cadena, HashSello: &huella, SelladoEn: &ahora,
	}
	if err := e.gdb.Create(&anexo).Error; err != nil {
		t.Fatal(err)
	}
	colega := sumarColaboradorDePrueba(t, e.gdb, e.router, e.clinicID, "doc-anexo-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, e.gdb, "doc-anexo-colega@example.com")
	if err := e.gdb.Create(&db.PacienteEnMiLista{PacienteID: e.paciente.ID, UserID: colegaID, ClinicID: e.clinicID}).Error; err != nil {
		t.Fatal(err)
	}

	for _, ruta := range []string{"/documentos/" + anexo.ID.String(), "/pacientes/" + e.paciente.ID.String() + "/documentos"} {
		rec := doJSONAuth(t, e.router, http.MethodGet, ruta, colega, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: %d", ruta, rec.Code)
		}
		if strings.Contains(rec.Body.String(), historia.ID) {
			t.Errorf("%s: la respuesta deja ver la historia que el colega no ve: %s", ruta, rec.Body.String())
		}
	}
	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+anexo.ID.String(), colega, nil)
	visto := decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if visto.AnexoDe != nil || !visto.HistoriaNoVisible {
		t.Fatalf("el anexo dice que tiene historia, sin ella: anexoDe=%+v historiaNoVisible=%v", visto.AnexoDe, visto.HistoriaNoVisible)
	}
	// Su autor sí la ve.
	rec = doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+anexo.ID.String(), e.token, nil)
	propio := decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if propio.AnexoDe == nil || propio.AnexoDe.ID != historia.ID || propio.HistoriaNoVisible {
		t.Fatalf("su autor ve la historia: anexoDe=%+v historiaNoVisible=%v", propio.AnexoDe, propio.HistoriaNoVisible)
	}
}
