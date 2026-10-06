package db_test

import (
	"testing"

	"dental-mirage/api/internal/db"

	"gorm.io/gorm"
)

// chk_documento_sellado_completo y chk_documento_para_imprimir_con_folio
// (5.6d): una historia sellada o para imprimir sin folio se rechaza; un
// anexo no consume folio (es el "x.y" de su historia), así que se sella o
// queda para imprimir sin él.
func TestDocumentos_ElFolioDeUnAnexoEsElDeSuHistoria(t *testing.T) {
	e := nuevoEscenarioDocumento(t)

	historia := e.documento(t)
	e.terminar(t, historia)
	debeAndar(t, "firma del paciente", e.gdb.Create(e.firma(historia, db.FirmaPaciente, huella)).Error)
	debeAndar(t, "firma del profesional", e.gdb.Create(e.firma(historia, db.FirmaProfesional, huella)).Error)
	debeFallar(t, e.gdb, "sellar una historia sin folio", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos
			SET estado = 'sellado', cadena_n = 1, hash_sello = ?, sellado_en = now() WHERE id = ?`, huella, historia.ID).Error
	})

	anexo := func() db.DocumentoClinico {
		t.Helper()
		numero := 1
		var n int64
		e.gdb.Model(&db.DocumentoClinico{}).Where("anexo_de = ?", historia.ID).Count(&n)
		numero += int(n)
		d := db.DocumentoClinico{
			ClinicID: e.clinica.ID, PacienteID: e.paciente.ID, AutorUserID: e.autor.ID,
			PlantillaID: "consentimiento-tratamiento-conducto", PlantillaVersion: 1,
			AnexoDe: &historia.ID, AnexoNumero: &numero, Valores: map[string]any{"lugar": "Córdoba"},
		}
		debeAndar(t, "crear el anexo", e.gdb.Create(&d).Error)
		return d
	}

	sellado := anexo()
	e.terminar(t, sellado)
	debeAndar(t, "firma del paciente en el anexo", e.gdb.Create(e.firma(sellado, db.FirmaPaciente, huella)).Error)
	debeAndar(t, "firma del profesional en el anexo", e.gdb.Create(e.firma(sellado, db.FirmaProfesional, huella)).Error)
	debeFallar(t, e.gdb, "ponerle folio propio a un anexo al sellarlo", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos
			SET estado = 'sellado', folio = 5, cadena_n = 1, hash_sello = ?, sellado_en = now() WHERE id = ?`, huella, sellado.ID).Error
	})
	debeAndar(t, "sellar un anexo sin folio", e.gdb.Exec(`UPDATE documentos_clinicos
		SET estado = 'sellado', cadena_n = 1, hash_sello = ?, sellado_en = now() WHERE id = ?`, huella, sellado.ID).Error)

	paraImprimir := anexo()
	debeAndar(t, "un anexo para imprimir sin folio", e.gdb.Exec(`UPDATE documentos_clinicos
		SET estado = 'para_imprimir', contenido_canonico = '{}', hash_contenido = ?, terminado_en = now() WHERE id = ?`, huella, paraImprimir.ID).Error)

	otra := e.documento(t)
	debeFallar(t, e.gdb, "una historia para imprimir sin folio", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos
			SET estado = 'para_imprimir', contenido_canonico = '{}', hash_contenido = ?, terminado_en = now() WHERE id = ?`, huella, otra.ID).Error
	})
	debeFallar(t, e.gdb, "un anexo sin número", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET anexo_numero = NULL WHERE id = ?`, paraImprimir.ID).Error
	})
}
