package db_test

import (
	"testing"
	"time"

	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// Los anexos de continuación (Fase 5.6d): un anexo abierto no cambia, uno
// por sección de cada historia, y sus asientos van en orden, encadenados y
// solo con INSERT.

const otraHuella = "b3f1c0de9b8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a392817060000"

func (e escenarioDocumento) anexoAbierto(t *testing.T, historia db.DocumentoClinico, seccion string, numero int) (db.DocumentoClinico, error) {
	t.Helper()
	contenido, h, ahora := "{}", huella, time.Now()
	anexo := db.DocumentoClinico{
		ClinicID: e.clinica.ID, PacienteID: e.paciente.ID, AutorUserID: e.autor.ID,
		PlantillaID: "anexo-de-continuacion", PlantillaVersion: 1, AnexoDe: &historia.ID,
		AnexoSeccion: &seccion, AnexoNumero: &numero, Estado: db.DocumentoAbierto,
		ContenidoCanonico: &contenido, HashContenido: &h, TerminadoEn: &ahora,
	}
	return anexo, e.gdb.Create(&anexo).Error
}

func (e escenarioDocumento) asiento(d db.DocumentoClinico, numero int, anterior, propio string) *db.DocumentoAsiento {
	return &db.DocumentoAsiento{
		DocumentoID: d.ID, Numero: numero, Texto: "Control sin novedades.", AutorUserID: e.autor.ID, AutorNombre: "Lucía Gómez",
		CreadoEn: time.Now(), HashAnterior: anterior, Hash: propio,
	}
}

func TestDocumentos_UnAnexoDeContinuacionYSusAsientosNoCambian(t *testing.T) {
	e := nuevoEscenarioDocumento(t)
	historia := e.documento(t)
	anexo, err := e.anexoAbierto(t, historia, "plan", 1)
	debeAndar(t, "crear el anexo abierto", err)

	// El primero se encadena al contenido congelado del anexo; el siguiente,
	// al primero.
	debeFallar(t, e.gdb, "un primer asiento encadenado a otra huella", func(tx *gorm.DB) error {
		return tx.Create(e.asiento(anexo, 1, otraHuella, otraHuella)).Error
	})
	debeAndar(t, "el primer asiento", e.gdb.Create(e.asiento(anexo, 1, huella, otraHuella)).Error)
	debeFallar(t, e.gdb, "un asiento que salta un número", func(tx *gorm.DB) error {
		return tx.Create(e.asiento(anexo, 3, otraHuella, huella)).Error
	})
	debeFallar(t, e.gdb, "un asiento que no sigue la cadena", func(tx *gorm.DB) error {
		return tx.Create(e.asiento(anexo, 2, huella, huella)).Error
	})
	debeAndar(t, "el segundo asiento", e.gdb.Create(e.asiento(anexo, 2, otraHuella, huella)).Error)

	for _, c := range []struct{ motivo, sql string }{
		{"cambiar un asiento", `UPDATE documento_asientos SET texto = 'Otro texto' WHERE documento_id = ?`},
		{"borrar un asiento", `DELETE FROM documento_asientos WHERE documento_id = ?`},
		{"cambiar el número del anexo", `UPDATE documentos_clinicos SET anexo_numero = 2 WHERE id = ?`},
		{"cambiar la sección del anexo", `UPDATE documentos_clinicos SET anexo_seccion = 'diagnostico' WHERE id = ?`},
		{"tocar cualquier otra cosa del anexo abierto", `UPDATE documentos_clinicos SET updated_at = now() WHERE id = ?`},
		{"borrar el anexo abierto", `DELETE FROM documentos_clinicos WHERE id = ?`},
	} {
		debeFallar(t, e.gdb, c.motivo, func(tx *gorm.DB) error { return tx.Exec(c.sql, anexo.ID).Error })
	}
	debeFallar(t, e.gdb, "vaciar los asientos", func(tx *gorm.DB) error { return tx.Exec(`TRUNCATE documento_asientos`).Error })

	// Uno por sección, numerados por historia, y "abierto" es solo de un
	// anexo de continuación.
	debeFallar(t, e.gdb, "un segundo anexo de la misma sección", func(*gorm.DB) error {
		_, err := e.anexoAbierto(t, historia, "plan", 2)
		return err
	})
	debeFallar(t, e.gdb, "un segundo anexo con el mismo número", func(*gorm.DB) error {
		_, err := e.anexoAbierto(t, historia, "diagnostico", 1)
		return err
	})
	debeFallar(t, e.gdb, "un abierto que no es un anexo de continuación", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET estado = 'abierto' WHERE id = ?`, historia.ID).Error
	})
	debeFallar(t, e.gdb, "un asiento en un documento que no es un anexo abierto", func(tx *gorm.DB) error {
		return tx.Create(e.asiento(historia, 1, huella, otraHuella)).Error
	})

	var cuantos int64
	if err := e.gdb.Model(&db.DocumentoAsiento{}).Where("documento_id = ?", anexo.ID).Count(&cuantos).Error; err != nil || cuantos != 2 {
		t.Fatalf("los dos asientos siguen ahí: %d (%v)", cuantos, err)
	}
}

// chk_documento_continuacion y chk_documento_anexo: la sección va con su
// número, solo en un anexo abierto colgado de una historia, y "abierto" exige
// la sección; todo anexo con historia (de continuación o suelto) tiene su
// número desde 1 y no consume folio, y un número sin historia no existe.
func TestDocumentos_ElCheckDeLaContinuacion(t *testing.T) {
	e := nuevoEscenarioDocumento(t)
	historia := e.documento(t)
	crear := func(cambiar func(*db.DocumentoClinico)) func(*gorm.DB) error {
		return func(tx *gorm.DB) error {
			seccion, numero := "plan", 1
			contenido, h, ahora := "{}", huella, time.Now()
			d := db.DocumentoClinico{
				ClinicID: e.clinica.ID, PacienteID: e.paciente.ID, AutorUserID: e.autor.ID,
				PlantillaID: "anexo-de-continuacion", PlantillaVersion: 1, AnexoDe: &historia.ID,
				AnexoSeccion: &seccion, AnexoNumero: &numero, Estado: db.DocumentoAbierto,
				ContenidoCanonico: &contenido, HashContenido: &h, TerminadoEn: &ahora,
			}
			cambiar(&d)
			return tx.Create(&d).Error
		}
	}
	casos := []struct {
		motivo  string
		cambiar func(*db.DocumentoClinico)
	}{
		{"una sección sin número", func(d *db.DocumentoClinico) { d.AnexoNumero = nil }},
		{"un abierto con número y sin sección", func(d *db.DocumentoClinico) { d.AnexoSeccion = nil }},
		{"un abierto sin sección ni número", func(d *db.DocumentoClinico) { d.AnexoSeccion, d.AnexoNumero = nil, nil }},
		{"un anexo de continuación sin historia", func(d *db.DocumentoClinico) { d.AnexoDe = nil }},
		{"un anexo con folio propio", func(d *db.DocumentoClinico) { f := 7; d.Folio = &f }},
		{"el número cero", func(d *db.DocumentoClinico) { n := 0; d.AnexoNumero = &n }},
		{"una sección que no existe", func(d *db.DocumentoClinico) { s := "anamnesis"; d.AnexoSeccion = &s }},
		{"una sección en un borrador", func(d *db.DocumentoClinico) {
			d.Estado, d.ContenidoCanonico, d.HashContenido, d.TerminadoEn = db.DocumentoBorrador, nil, nil, nil
		}},
		{"un anexo suelto sin número", func(d *db.DocumentoClinico) {
			d.Estado, d.AnexoSeccion, d.AnexoNumero, d.ContenidoCanonico, d.HashContenido, d.TerminadoEn = db.DocumentoBorrador, nil, nil, nil, nil, nil
		}},
		{"un número sin historia", func(d *db.DocumentoClinico) {
			d.Estado, d.AnexoDe, d.AnexoSeccion, d.ContenidoCanonico, d.HashContenido, d.TerminadoEn = db.DocumentoBorrador, nil, nil, nil, nil, nil
		}},
	}
	for _, c := range casos {
		debeFallar(t, e.gdb, c.motivo, crear(c.cambiar))
	}
	debeAndar(t, "el anexo bien armado", crear(func(*db.DocumentoClinico) {})(e.gdb))
	debeAndar(t, "un anexo suelto con el número que sigue, sin folio", crear(func(d *db.DocumentoClinico) {
		n := 2
		d.Estado, d.AnexoSeccion, d.AnexoNumero, d.ContenidoCanonico, d.HashContenido, d.TerminadoEn = db.DocumentoBorrador, nil, &n, nil, nil, nil
	})(e.gdb))
}
