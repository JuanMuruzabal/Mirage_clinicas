package http

import (
	"testing"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/documentos"

	"github.com/google/uuid"
)

// plantillaAnexoVersionado — un anexo con dos versiones (copias de las dos
// del conducto), para probar que un borrador de la vieja pasa a la vigente
// con su vínculo y su número (5.6d).
const plantillaAnexoVersionado = "anexo-versionado-de-prueba"

func init() {
	for _, version := range []int{1, 2} {
		p, ok := documentos.PorID(plantillaConducto, version)
		if !ok {
			panic("falta la plantilla de conducto")
		}
		anexo := *p
		anexo.ID = plantillaAnexoVersionado
		anexo.Nombre = "Anexo versionado"
		anexo.Tipo = documentos.TipoAnexo
		if err := documentos.RegistrarPlantillaDePrueba(anexo); err != nil {
			panic(err)
		}
	}
}

func TestDocumentos_UnAnexoQuePasaDeVersionConservaSuNumero(t *testing.T) {
	e := escenarioDeDocumentos(t, "anexo-pasa-version")
	historia := e.crearDe(t, e.token, plantillaHistoriaDePrueba, e.paciente.ID)
	historiaID := uuid.MustParse(historia.ID)
	numero := 3
	vieja := db.DocumentoClinico{
		ClinicID: e.clinicID, PacienteID: e.paciente.ID, AutorUserID: e.titularID,
		PlantillaID: plantillaAnexoVersionado, PlantillaVersion: 1,
		AnexoDe: &historiaID, AnexoNumero: &numero, Valores: map[string]any{"lugar": "Villa Allende"},
	}
	if err := e.gdb.Create(&vieja).Error; err != nil {
		t.Fatal(err)
	}
	nuevo, cambio, err := borradorEnLaVersionVigente(e.gdb, vieja)
	if err != nil || !cambio || nuevo.ID == vieja.ID || nuevo.PlantillaVersion != 2 {
		t.Fatalf("el anexo tenía que pasar a la v2: cambio=%v err=%v %+v", cambio, err, nuevo)
	}
	var guardado db.DocumentoClinico
	if err := e.gdb.First(&guardado, "id = ?", nuevo.ID).Error; err != nil {
		t.Fatal(err)
	}
	if guardado.AnexoDe == nil || *guardado.AnexoDe != historiaID || guardado.AnexoNumero == nil || *guardado.AnexoNumero != 3 || guardado.Folio != nil {
		t.Fatalf("el anexo nuevo conserva vínculo y número, sin folio: de %v nº %v folio %v", guardado.AnexoDe, guardado.AnexoNumero, guardado.Folio)
	}
	if guardado.Valores["lugar"] != "Villa Allende" {
		t.Errorf("los valores pasan: %v", guardado.Valores)
	}
	var viejas int64
	e.gdb.Model(&db.DocumentoClinico{}).Where("id = ?", vieja.ID).Count(&viejas)
	if viejas != 0 {
		t.Error("el borrador viejo se descarta")
	}
	// Y el próximo anexo de la historia sigue la secuencia desde ahí.
	rec := doJSONAuth(t, e.router, "POST", "/documentos", e.token, map[string]any{
		"plantillaId": plantillaAnexoDePrueba, "pacienteId": e.paciente.ID.String(), "historiaId": historia.ID,
	})
	d := decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if rec.Code != 201 || d.AnexoNumero == nil || *d.AnexoNumero != 4 || d.FolioMostrado != "Anexo Nº 4" {
		t.Fatalf("el siguiente anexo: %d %s", rec.Code, rec.Body.String())
	}
}
