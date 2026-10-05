package db_test

import (
	"strings"
	"testing"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
)

// fk_documento_anexo_de (5.6b, ronda A): un anexo no puede apuntar a un
// documento que no existe, y el rechazo viene de esa FK.
func TestFK_UnAnexoNoApuntaAUnDocumentoInexistente(t *testing.T) {
	e := nuevoEscenarioDocumento(t)
	inexistente := uuid.New()
	sp := "sp_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	e.gdb.SavePoint(sp)
	err := e.gdb.Create(&db.DocumentoClinico{
		ClinicID: e.clinica.ID, PacienteID: e.paciente.ID, AutorUserID: e.autor.ID,
		PlantillaID: "anexo-de-prueba", PlantillaVersion: 1, AnexoDe: &inexistente,
	}).Error
	e.gdb.RollbackTo(sp)
	if err == nil {
		t.Fatal("se creó un anexo de una historia que no existe")
	}
	if !strings.Contains(err.Error(), "fk_documento_anexo_de") {
		t.Fatalf("el rechazo no vino de fk_documento_anexo_de: %v", err)
	}

	var regla string
	if err := e.gdb.Raw(`SELECT confdeltype FROM pg_constraint WHERE conname = 'fk_documento_anexo_de'`).Scan(&regla).Error; err != nil {
		t.Fatal(err)
	}
	// 'a' = NO ACTION, lo que el repo llama RESTRICT (migrate_fk.go): borrar
	// una historia con anexos se rechaza en la base, nunca en cascada.
	if regla != "a" && regla != "r" {
		t.Fatalf("fk_documento_anexo_de tiene que rechazar el borrado, es %q", regla)
	}
	var indice bool
	if err := e.gdb.Raw(`SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_documento_anexo_de' AND indexdef LIKE '%WHERE (anexo_de IS NOT NULL)%')`).Scan(&indice).Error; err != nil {
		t.Fatal(err)
	}
	if !indice {
		t.Fatal("falta el índice parcial idx_documento_anexo_de")
	}
}
