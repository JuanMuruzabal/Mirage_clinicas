package db_test

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// El candado de los documentos clínicos (TR-182) vive en la base, así que
// se prueba en la base: con SQL crudo, que es justo lo que un handler nunca
// haría y lo que el trigger tiene que frenar igual.

type escenarioDocumento struct {
	gdb      *gorm.DB
	clinica  db.Clinic
	autor    db.User
	paciente db.Paciente
}

func nuevoEscenarioDocumento(t *testing.T) escenarioDocumento {
	t.Helper()
	gdb := testdb.New(t)
	autor := db.User{Email: uuid.NewString() + "@example.com", OnboardingStep: "completo"}
	if err := gdb.Create(&autor).Error; err != nil {
		t.Fatalf("usuario: %v", err)
	}
	clinica := db.Clinic{Nombre: "Clínica", Tipo: "individual", Slug: uuid.NewString(), OwnerID: autor.ID}
	if err := gdb.Create(&clinica).Error; err != nil {
		t.Fatalf("clínica: %v", err)
	}
	if err := gdb.Create(&db.ClinicMember{ClinicID: clinica.ID, UserID: autor.ID, Status: db.ClinicMemberStatusActive}).Error; err != nil {
		t.Fatalf("membresía: %v", err)
	}
	paciente := db.Paciente{ClinicID: clinica.ID, Nombre: "Ana", Apellido: "Paz", DNI: "30111222", Origen: "manual"}
	if err := gdb.Create(&paciente).Error; err != nil {
		t.Fatalf("paciente: %v", err)
	}
	return escenarioDocumento{gdb: gdb, clinica: clinica, autor: autor, paciente: paciente}
}

// debeFallar corre la sentencia dentro de un savepoint: un trigger que
// rechaza aborta la transacción entera, y el test necesita seguir usándola.
func debeFallar(t *testing.T, gdb *gorm.DB, motivo string, fn func(tx *gorm.DB) error) {
	t.Helper()
	nombre := "sp_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	gdb.SavePoint(nombre)
	err := fn(gdb)
	gdb.RollbackTo(nombre)
	if err == nil {
		t.Fatalf("%s: se esperaba que la base lo rechazara, y lo aceptó", motivo)
	}
}

func debeAndar(t *testing.T, motivo string, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("%s: %v", motivo, err)
	}
}

const huella = "a3f1c0de9b8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a392817060000"

func (e escenarioDocumento) documento(t *testing.T) db.DocumentoClinico {
	t.Helper()
	d := db.DocumentoClinico{
		ClinicID: e.clinica.ID, PacienteID: e.paciente.ID, AutorUserID: e.autor.ID,
		PlantillaID: "consentimiento-tratamiento-conducto", PlantillaVersion: 1,
		Valores: map[string]any{"lugar": "Córdoba"},
	}
	debeAndar(t, "crear borrador", e.gdb.Create(&d).Error)
	return d
}

func (e escenarioDocumento) terminar(t *testing.T, d db.DocumentoClinico) {
	t.Helper()
	debeAndar(t, "terminar", e.gdb.Exec(`UPDATE documentos_clinicos
		SET estado = 'a_firmar', contenido_canonico = '{}', hash_contenido = ?, terminado_en = now()
		WHERE id = ?`, huella, d.ID).Error)
}

func (e escenarioDocumento) firma(d db.DocumentoClinico, rol, hash string) *db.DocumentoFirma {
	return &db.DocumentoFirma{
		DocumentoID: d.ID, Rol: rol, Nombre: "Ana Paz", Metodo: db.MetodoPresencial,
		Trazo:         db.TrazoDeFirma{Ancho: 300, Alto: 150, Trazos: [][][3]float64{{{1, 1, 0}, {2, 2, 10}}}},
		HashContenido: hash, HashFirma: huella, FirmadoEn: time.Now(),
	}
}

func (e escenarioDocumento) sellar(t *testing.T, d db.DocumentoClinico) {
	t.Helper()
	debeAndar(t, "sellar", e.gdb.Exec(`UPDATE documentos_clinicos
		SET estado = 'sellado', folio = 1, cadena_n = 1, hash_sello = ?, sellado_en = now()
		WHERE id = ?`, huella, d.ID).Error)
}

func TestDocumentos_UnBorradorSeEditaYSeDescarta(t *testing.T) {
	e := nuevoEscenarioDocumento(t)
	d := e.documento(t)
	debeAndar(t, "editar un borrador", e.gdb.Exec(`UPDATE documentos_clinicos SET valores = '{"lugar":"Villa María"}' WHERE id = ?`, d.ID).Error)
	debeFallar(t, e.gdb, "sellar un borrador sin pasar por a_firmar", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET estado = 'sellado' WHERE id = ?`, d.ID).Error
	})
	debeFallar(t, e.gdb, "ponerle folio a un borrador", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET folio = 1 WHERE id = ?`, d.ID).Error
	})
	debeFallar(t, e.gdb, "pasar a a_firmar sin contenido congelado", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET estado = 'a_firmar' WHERE id = ?`, d.ID).Error
	})
	debeFallar(t, e.gdb, "cambiarle el paciente", func(tx *gorm.DB) error {
		otro := db.Paciente{ClinicID: e.clinica.ID, Nombre: "Otro", Apellido: "X", DNI: "40111222", Origen: "manual"}
		if err := tx.Create(&otro).Error; err != nil {
			return nil // si no se pudo armar el caso, que falle el test
		}
		return tx.Exec(`UPDATE documentos_clinicos SET paciente_id = ? WHERE id = ?`, otro.ID, d.ID).Error
	})
	debeAndar(t, "descartar un borrador", e.gdb.Exec(`DELETE FROM documentos_clinicos WHERE id = ?`, d.ID).Error)
}

// Un consentimiento terminado queda "para imprimir" (TR-188): se firma a
// mano, así que en la base no se firma ni se sella; su contenido no cambia,
// y lo único que puede hacer es volver a borrador tal cual.
func TestDocumentos_ParaImprimirSoloVuelveABorrador(t *testing.T) {
	e := nuevoEscenarioDocumento(t)
	d := e.documento(t)
	debeFallar(t, e.gdb, "pasar a para_imprimir sin contenido congelado", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET estado = 'para_imprimir' WHERE id = ?`, d.ID).Error
	})
	debeAndar(t, "terminar para imprimir", e.gdb.Exec(`UPDATE documentos_clinicos
		SET estado = 'para_imprimir', contenido_canonico = '{}', hash_contenido = ?, terminado_en = now()
		WHERE id = ?`, huella, d.ID).Error)

	debeFallar(t, e.gdb, "firmarlo en el sistema", func(tx *gorm.DB) error {
		return tx.Create(e.firma(d, db.FirmaPaciente, huella)).Error
	})
	debeFallar(t, e.gdb, "pasarlo a a_firmar", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET estado = 'a_firmar' WHERE id = ?`, d.ID).Error
	})
	debeFallar(t, e.gdb, "sellarlo", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos
			SET estado = 'sellado', folio = 1, cadena_n = 1, hash_sello = ?, sellado_en = now() WHERE id = ?`, huella, d.ID).Error
	})
	debeFallar(t, e.gdb, "cambiarle el contenido", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET contenido_canonico = '{"x":1}' WHERE id = ?`, d.ID).Error
	})
	debeFallar(t, e.gdb, "ponerle folio", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET folio = 1 WHERE id = ?`, d.ID).Error
	})
	debeFallar(t, e.gdb, "borrarlo", func(tx *gorm.DB) error {
		return tx.Exec(`DELETE FROM documentos_clinicos WHERE id = ?`, d.ID).Error
	})
	debeFallar(t, e.gdb, "volver a borrador cambiando los datos", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos
			SET estado = 'borrador', valores = '{"lugar":"Otro"}', contenido_canonico = NULL, hash_contenido = NULL, terminado_en = NULL
			WHERE id = ?`, d.ID).Error
	})
	debeAndar(t, "volver a borrador tal cual", e.gdb.Exec(`UPDATE documentos_clinicos
		SET estado = 'borrador', contenido_canonico = NULL, hash_contenido = NULL, terminado_en = NULL
		WHERE id = ?`, d.ID).Error)
}

func TestDocumentos_AFirmarNoCambiaSuContenido(t *testing.T) {
	e := nuevoEscenarioDocumento(t)
	d := e.documento(t)
	e.terminar(t, d)

	debeFallar(t, e.gdb, "cambiar los datos de un documento a firmar", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET valores = '{"lugar":"Otra"}' WHERE id = ?`, d.ID).Error
	})
	debeFallar(t, e.gdb, "cambiar el contenido congelado", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET contenido_canonico = '{"x":1}' WHERE id = ?`, d.ID).Error
	})
	debeFallar(t, e.gdb, "borrar un documento a firmar", func(tx *gorm.DB) error {
		return tx.Exec(`DELETE FROM documentos_clinicos WHERE id = ?`, d.ID).Error
	})
	debeFallar(t, e.gdb, "firmar otra huella", func(tx *gorm.DB) error {
		return tx.Create(e.firma(d, db.FirmaPaciente, strings.Repeat("0", 64))).Error
	})

	// Sin firmas, vuelve a borrador tal cual.
	debeAndar(t, "volver a borrador", e.gdb.Exec(`UPDATE documentos_clinicos
		SET estado = 'borrador', contenido_canonico = NULL, hash_contenido = NULL, terminado_en = NULL WHERE id = ?`, d.ID).Error)
	debeFallar(t, e.gdb, "firmar un borrador", func(tx *gorm.DB) error {
		return tx.Create(e.firma(d, db.FirmaPaciente, huella)).Error
	})

	// Con una firma, ya no vuelve.
	e.terminar(t, d)
	debeAndar(t, "firmar", e.gdb.Create(e.firma(d, db.FirmaPaciente, huella)).Error)
	debeFallar(t, e.gdb, "volver a borrador con una firma", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos
			SET estado = 'borrador', contenido_canonico = NULL, hash_contenido = NULL, terminado_en = NULL WHERE id = ?`, d.ID).Error
	})
	debeFallar(t, e.gdb, "firmar dos veces el mismo rol", func(tx *gorm.DB) error {
		return tx.Create(e.firma(d, db.FirmaPaciente, huella)).Error
	})
	debeFallar(t, e.gdb, "sellar sin folio ni sello", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET estado = 'sellado' WHERE id = ?`, d.ID).Error
	})
}

func TestDocumentos_UnSelladoNoSeTocaPorNingunMetodo(t *testing.T) {
	e := nuevoEscenarioDocumento(t)
	d := e.documento(t)
	e.terminar(t, d)
	debeAndar(t, "firma del paciente", e.gdb.Create(e.firma(d, db.FirmaPaciente, huella)).Error)
	debeAndar(t, "firma del profesional", e.gdb.Create(e.firma(d, db.FirmaProfesional, huella)).Error)
	e.sellar(t, d)
	debeAndar(t, "evento", e.gdb.Create(&db.DocumentoEvento{DocumentoID: d.ID, ClinicID: e.clinica.ID, Tipo: db.EventoDocumentoSellado}).Error)

	for _, intento := range []struct {
		motivo string
		sql    string
	}{
		{"cambiar sus datos", `UPDATE documentos_clinicos SET valores = '{}' WHERE id = ?`},
		{"cambiar su texto", `UPDATE documentos_clinicos SET contenido_canonico = '{"alterado":true}' WHERE id = ?`},
		{"cambiar su sello", `UPDATE documentos_clinicos SET hash_sello = NULL WHERE id = ?`},
		{"tocarle solo la fecha de actualización", `UPDATE documentos_clinicos SET updated_at = now() WHERE id = ?`},
		{"anularlo", `UPDATE documentos_clinicos SET estado = 'anulado', motivo_anulacion = 'x', anulado_en = now() WHERE id = ?`},
		{"borrarlo", `DELETE FROM documentos_clinicos WHERE id = ?`},
		{"cambiar una firma", `UPDATE documento_firmas SET nombre = 'Otra persona' WHERE documento_id = ?`},
		{"borrar una firma", `DELETE FROM documento_firmas WHERE documento_id = ?`},
		{"cambiar la auditoría", `UPDATE documento_eventos SET tipo = 'visto' WHERE documento_id = ?`},
		{"borrar la auditoría", `DELETE FROM documento_eventos WHERE documento_id = ?`},
	} {
		debeFallar(t, e.gdb, intento.motivo, func(tx *gorm.DB) error { return tx.Exec(intento.sql, d.ID).Error })
	}

	for _, tabla := range []string{"documentos_clinicos", "documento_firmas", "documento_eventos"} {
		debeFallar(t, e.gdb, "vaciar "+tabla, func(tx *gorm.DB) error { return tx.Exec("TRUNCATE " + tabla + " CASCADE").Error })
	}

	// La ficha del paciente tampoco se puede borrar: la historia clínica se
	// conserva diez años (Ley 26.529, art. 18).
	debeFallar(t, e.gdb, "borrar la ficha del paciente", func(tx *gorm.DB) error {
		return tx.Exec(`DELETE FROM pacientes WHERE id = ?`, e.paciente.ID).Error
	})

	var leido db.DocumentoClinico
	debeAndar(t, "releer", e.gdb.First(&leido, "id = ?", d.ID).Error)
	if leido.Estado != db.DocumentoSellado || leido.HashSello == nil || *leido.HashSello != huella {
		t.Fatalf("el documento sellado cambió: %+v", leido)
	}
}

func TestDocumentos_AnularDejaElMotivoYCongelaTodo(t *testing.T) {
	e := nuevoEscenarioDocumento(t)
	d := e.documento(t)
	e.terminar(t, d)
	debeAndar(t, "firma del paciente", e.gdb.Create(e.firma(d, db.FirmaPaciente, huella)).Error)
	debeFallar(t, e.gdb, "anular sin motivo", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET estado = 'anulado', anulado_en = now() WHERE id = ?`, d.ID).Error
	})
	debeAndar(t, "anular", e.gdb.Exec(`UPDATE documentos_clinicos
		SET estado = 'anulado', motivo_anulacion = 'El paciente decidió no hacerlo', anulado_en = now() WHERE id = ?`, d.ID).Error)
	debeFallar(t, e.gdb, "reactivar un anulado", func(tx *gorm.DB) error {
		return tx.Exec(`UPDATE documentos_clinicos SET estado = 'a_firmar' WHERE id = ?`, d.ID).Error
	})
}

func TestDocumentos_ElAutorTieneQueSerMiembroDeLaClinica(t *testing.T) {
	e := nuevoEscenarioDocumento(t)
	ajeno := db.User{Email: uuid.NewString() + "@example.com", OnboardingStep: "completo"}
	debeAndar(t, "usuario ajeno", e.gdb.Create(&ajeno).Error)
	debeFallar(t, e.gdb, "un documento de alguien que no es de la clínica", func(tx *gorm.DB) error {
		return tx.Create(&db.DocumentoClinico{
			ClinicID: e.clinica.ID, PacienteID: e.paciente.ID, AutorUserID: ajeno.ID,
			PlantillaID: "consentimiento-tratamiento-conducto", PlantillaVersion: 1, Valores: map[string]any{},
		}).Error
	})
}
