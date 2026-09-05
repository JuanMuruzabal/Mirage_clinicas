package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// crearConflictoPacienteDePrueba — Fase 2.4.1: arma directo en la base el
// escenario que en producción nace de
// crearPacientePublicoConDeteccionDeConflicto (turno_publico.go): una
// ficha VERIFICADA (con un turno resuelto/asistido) y una segunda ficha
// `EnConflicto=true` con el mismo DNI pero otro mail, más el turno que
// disparó el conflicto y la fila de ConflictoPaciente sin resolver.
func crearConflictoPacienteDePrueba(t *testing.T, gdb *gorm.DB, profesionalID, tipoConsultaID, dni, mailVerificado, mailEnConflicto string) (db.Paciente, db.Paciente, db.Turno, db.ConflictoPaciente) {
	t.Helper()
	pid, err := uuid.Parse(profesionalID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	tid, err := uuid.Parse(tipoConsultaID)
	if err != nil {
		t.Fatalf("tipoConsultaID inválido: %v", err)
	}

	verificado := crearPacienteVerificadoDePrueba(t, gdb, profesionalID, tipoConsultaID, dni, mailVerificado)

	enConflicto := db.Paciente{
		ProfesionalID: pid,
		Nombre:        verificado.Nombre,
		Apellido:      verificado.Apellido,
		DNI:           dni,
		Telefono:      "+5493511230000",
		Email:         &mailEnConflicto,
		EnConflicto:   true,
	}
	if err := gdb.Create(&enConflicto).Error; err != nil {
		t.Fatalf("no se pudo crear la ficha en conflicto de prueba: %v", err)
	}

	inicio := time.Now().Add(72 * time.Hour).Truncate(time.Second)
	fin := inicio.Add(30 * time.Minute)
	turno := db.Turno{
		ProfesionalID:    pid,
		PacienteID:       &enConflicto.ID,
		Estado:           "agendado",
		TipoConsultaID:   &tid,
		HoraInicio:       &inicio,
		HoraFin:          &fin,
		NombreContacto:   enConflicto.Nombre,
		ApellidoContacto: enConflicto.Apellido,
		DNIContacto:      enConflicto.DNI,
		TelefonoContacto: enConflicto.Telefono,
		EmailContacto:    mailEnConflicto,
		Origen:           "pagina_publica",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno en conflicto de prueba: %v", err)
	}

	conflicto := db.ConflictoPaciente{
		ProfesionalID:         pid,
		PacienteVerificadoID:  verificado.ID,
		PacienteEnConflictoID: enConflicto.ID,
		TurnoEnConflictoID:    turno.ID,
		Motivo:                "se registró con otro mail",
	}
	if err := gdb.Create(&conflicto).Error; err != nil {
		t.Fatalf("no se pudo crear el conflicto de prueba: %v", err)
	}

	return verificado, enConflicto, turno, conflicto
}

func TestListConflictosPaciente_Exitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "conf1@example.com")
	verificado, enConflicto, turno, _ := crearConflictoPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com", "otro@example.com")

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes/conflictos", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got []conflictoPacienteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got = %+v, esperaba 1 conflicto", got)
	}
	if got[0].PacienteVerificado.ID != verificado.ID.String() {
		t.Errorf("PacienteVerificado.ID = %q, esperaba %q", got[0].PacienteVerificado.ID, verificado.ID.String())
	}
	if got[0].PacienteEnConflicto.ID != enConflicto.ID.String() {
		t.Errorf("PacienteEnConflicto.ID = %q, esperaba %q", got[0].PacienteEnConflicto.ID, enConflicto.ID.String())
	}
	if got[0].Turno.ID != turno.ID.String() {
		t.Errorf("Turno.ID = %q, esperaba %q", got[0].Turno.ID, turno.ID.String())
	}
	if got[0].TurnoVigenteDelMismoTipo != nil {
		t.Errorf("TurnoVigenteDelMismoTipo = %+v, esperaba nil (el verificado no tiene otro turno de este tipo)", got[0].TurnoVigenteDelMismoTipo)
	}
}

// crearTurnoVigenteDePruebaParaPaciente — corrección de QA: arma un turno
// agendado a futuro para un paciente ya existente — usado para simular
// "el paciente verificado YA tiene un turno vigente de este tipo de
// consulta" en los tests de colisión de conflictos.
func crearTurnoVigenteDePruebaParaPaciente(t *testing.T, gdb *gorm.DB, paciente db.Paciente, tipoConsultaID string, inicio time.Time) db.Turno {
	t.Helper()
	tid, err := uuid.Parse(tipoConsultaID)
	if err != nil {
		t.Fatalf("tipoConsultaID inválido: %v", err)
	}
	inicio = inicio.Truncate(time.Second)
	fin := inicio.Add(30 * time.Minute)
	email := ""
	if paciente.Email != nil {
		email = *paciente.Email
	}
	turno := db.Turno{
		ProfesionalID:    paciente.ProfesionalID,
		PacienteID:       &paciente.ID,
		Estado:           "agendado",
		TipoConsultaID:   &tid,
		HoraInicio:       &inicio,
		HoraFin:          &fin,
		NombreContacto:   paciente.Nombre,
		ApellidoContacto: paciente.Apellido,
		DNIContacto:      paciente.DNI,
		TelefonoContacto: paciente.Telefono,
		EmailContacto:    email,
		Origen:           "manual",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno vigente de prueba: %v", err)
	}
	return turno
}

// TestListConflictosPaciente_InformaTurnoVigenteDelMismoTipo —
// corrección de QA, pedido textual del cliente: "si el paciente
// verificado tiene ya un turno con ese tipo de consulta informar también
// en el conflicto".
func TestListConflictosPaciente_InformaTurnoVigenteDelMismoTipo(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "conf-colision1@example.com")
	verificado, _, turnoConflicto, _ := crearConflictoPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com", "otro@example.com")
	turnoExistente := crearTurnoVigenteDePruebaParaPaciente(t, gdb, verificado, tipoID, time.Now().Add(48*time.Hour))

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes/conflictos", reg.Token, nil)
	var got []conflictoPacienteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got = %+v, esperaba 1 conflicto", got)
	}
	if got[0].Turno.ID != turnoConflicto.ID.String() {
		t.Errorf("Turno.ID = %q, esperaba %q", got[0].Turno.ID, turnoConflicto.ID.String())
	}
	if got[0].TurnoVigenteDelMismoTipo == nil {
		t.Fatal("TurnoVigenteDelMismoTipo = nil, esperaba el turno que el verificado ya tenía de este tipo")
	}
	if got[0].TurnoVigenteDelMismoTipo.ID != turnoExistente.ID.String() {
		t.Errorf("TurnoVigenteDelMismoTipo.ID = %q, esperaba %q", got[0].TurnoVigenteDelMismoTipo.ID, turnoExistente.ID.String())
	}
}

// TestResolverConflictoPaciente_EsVerificadoConTipoYaActivoNoMigraCancela
// — corrección de QA, pedido textual del cliente: "si se verifica este
// turno se eliminará y prevalecerá el que ya antes tenías, y no se
// migrará, esto solo ocurrirá si es un tipo de consulta que no tiene
// activo actualmente" — leído al revés: SÍ ocurre (no se migra, se
// cancela) cuando el tipo de consulta YA está activo.
func TestResolverConflictoPaciente_EsVerificadoConTipoYaActivoNoMigraCancela(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "conf-colision2@example.com")
	verificado, enConflicto, turnoConflicto, conflicto := crearConflictoPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com", "otro@example.com")
	turnoExistente := crearTurnoVigenteDePruebaParaPaciente(t, gdb, verificado, tipoID, time.Now().Add(48*time.Hour))

	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+conflicto.ID.String()+"/resolver", reg.Token, resolverConflictoPacienteRequest{EsVerificado: true})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var turnoConflictoActualizado db.Turno
	if err := gdb.First(&turnoConflictoActualizado, "id = ?", turnoConflicto.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno en conflicto: %v", err)
	}
	if turnoConflictoActualizado.Estado != "cancelada" {
		t.Errorf("Estado = %q, esperaba cancelada (no se migra, prevalece el turno que ya tenía)", turnoConflictoActualizado.Estado)
	}
	if turnoConflictoActualizado.PacienteID != nil {
		t.Errorf("PacienteID = %v, esperaba nil", turnoConflictoActualizado.PacienteID)
	}

	var turnoExistenteActualizado db.Turno
	if err := gdb.First(&turnoExistenteActualizado, "id = ?", turnoExistente.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno existente: %v", err)
	}
	if turnoExistenteActualizado.Estado != "agendado" || turnoExistenteActualizado.PacienteID == nil || *turnoExistenteActualizado.PacienteID != verificado.ID {
		t.Errorf("el turno que ya tenía debería seguir agendado y en la ficha verificada, got %+v", turnoExistenteActualizado)
	}

	// El mail sí se migra igual — la persona SÍ es la misma, lo único
	// que no se migra es el turno duplicado.
	var alt db.PacienteEmailAlternativo
	if err := gdb.Where("paciente_id = ? AND email = ?", verificado.ID, "otro@example.com").First(&alt).Error; err != nil {
		t.Errorf("esperaba un PacienteEmailAlternativo aunque el turno no se haya migrado: %v", err)
	}

	var count int64
	gdb.Model(&db.Paciente{}).Where("id = ?", enConflicto.ID).Count(&count)
	if count != 0 {
		t.Errorf("la ficha en conflicto debería haberse borrado igual, count=%d", count)
	}
}

// TestResolverConflictoPaciente_EsVerificadoConMailYTelefonoYaAlternativosNoFalla
// — variante del bug real de QA (ver el test siguiente para la causa de
// fondo): resolver dos veces con el mismo dato de contacto para LA MISMA
// ficha verificada (ej. un reintento, o dos conflictos reales con el
// mismo secundario) tampoco debe romper — el INSERT choca con el índice
// único, y capturar esa violación y seguir usando la MISMA transacción no
// alcanza en Postgres: una vez que un statement falla, la transacción
// entera queda abortada y
// cualquier query posterior sobre ella también falla (25P02). Tiene que
// resolverse igual (200), sin duplicar la fila alternativa.
func TestResolverConflictoPaciente_EsVerificadoConMailYTelefonoYaAlternativosNoFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "conf-yaalt@example.com")
	verificado, enConflicto, turnoConflicto, conflicto := crearConflictoPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com", "otro@example.com")

	// El mail Y el teléfono de la ficha en conflicto ya están registrados
	// como alternativos del verificado, de una resolución anterior.
	if err := gdb.Create(&db.PacienteEmailAlternativo{PacienteID: verificado.ID, Email: *enConflicto.Email}).Error; err != nil {
		t.Fatalf("no se pudo crear el email alternativo previo de prueba: %v", err)
	}
	if err := gdb.Create(&db.PacienteTelefonoAlternativo{PacienteID: verificado.ID, Telefono: enConflicto.Telefono}).Error; err != nil {
		t.Fatalf("no se pudo crear el teléfono alternativo previo de prueba: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+conflicto.ID.String()+"/resolver", reg.Token, resolverConflictoPacienteRequest{EsVerificado: true})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var turnoActualizado db.Turno
	if err := gdb.First(&turnoActualizado, "id = ?", turnoConflicto.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno: %v", err)
	}
	if turnoActualizado.PacienteID == nil || *turnoActualizado.PacienteID != verificado.ID {
		t.Errorf("turno.PacienteID = %v, esperaba %q (el verificado)", turnoActualizado.PacienteID, verificado.ID)
	}

	var cantidadEmails, cantidadTelefonos int64
	gdb.Model(&db.PacienteEmailAlternativo{}).Where("paciente_id = ? AND email = ?", verificado.ID, *enConflicto.Email).Count(&cantidadEmails)
	if cantidadEmails != 1 {
		t.Errorf("cantidad de PacienteEmailAlternativo = %d, esperaba 1 (sin duplicar)", cantidadEmails)
	}
	gdb.Model(&db.PacienteTelefonoAlternativo{}).Where("paciente_id = ? AND telefono = ?", verificado.ID, enConflicto.Telefono).Count(&cantidadTelefonos)
	if cantidadTelefonos != 1 {
		t.Errorf("cantidad de PacienteTelefonoAlternativo = %d, esperaba 1 (sin duplicar)", cantidadTelefonos)
	}
}

// TestResolverConflictoPaciente_MismoDatoDeContactoParaDosPacientesDistintosNoChoca
// — causa de fondo del bug real reportado en QA: idx_paciente_email_alt/
// idx_paciente_telefono_alt nacieron como índice único sobre SOLO el
// mail/teléfono (corregido acá a compuesto con paciente_id, ver
// migrate.go) — con el índice viejo, un mismo dato de contacto (dato de
// prueba repetido entre dos pacientes distintos, o una coincidencia real)
// que ya fuera alternativo de OTRO paciente hacía fallar con 500 la
// resolución de un conflicto que no tenía nada que ver con ese paciente
// — sin haber resuelto nada repetido del lado de quien probaba.
func TestResolverConflictoPaciente_MismoDatoDeContactoParaDosPacientesDistintosNoChoca(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg1, tipo1 := profesionalConTipoConsulta(t, gdb, router, "conf-doscoinciden-a@example.com")
	reg2, tipo2 := profesionalConTipoConsulta(t, gdb, router, "conf-doscoinciden-b@example.com")

	mailRepetido := "repetido@example.com"
	verificado1, _, _, conflicto1 := crearConflictoPacienteDePrueba(t, gdb, reg1.Profesional.ID, tipo1, "30111222", "bruno1@example.com", mailRepetido)
	verificado2, _, _, conflicto2 := crearConflictoPacienteDePrueba(t, gdb, reg2.Profesional.ID, tipo2, "30333444", "bruno2@example.com", mailRepetido)

	rec1 := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+conflicto1.ID.String()+"/resolver", reg1.Token, resolverConflictoPacienteRequest{EsVerificado: true})
	if rec1.Code != http.StatusOK {
		t.Fatalf("resolver conflicto 1: status = %d, esperaba %d. body=%s", rec1.Code, http.StatusOK, rec1.Body.String())
	}
	rec2 := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+conflicto2.ID.String()+"/resolver", reg2.Token, resolverConflictoPacienteRequest{EsVerificado: true})
	if rec2.Code != http.StatusOK {
		t.Fatalf("resolver conflicto 2 (mismo mail/teléfono que el 1, paciente DISTINTO): status = %d, esperaba %d. body=%s", rec2.Code, http.StatusOK, rec2.Body.String())
	}

	var cantidadMail1, cantidadMail2 int64
	gdb.Model(&db.PacienteEmailAlternativo{}).Where("paciente_id = ? AND email = ?", verificado1.ID, mailRepetido).Count(&cantidadMail1)
	gdb.Model(&db.PacienteEmailAlternativo{}).Where("paciente_id = ? AND email = ?", verificado2.ID, mailRepetido).Count(&cantidadMail2)
	if cantidadMail1 != 1 || cantidadMail2 != 1 {
		t.Errorf("cada paciente debería tener su propio PacienteEmailAlternativo con el mismo mail, got %d y %d", cantidadMail1, cantidadMail2)
	}

	var cantidadTel1, cantidadTel2 int64
	gdb.Model(&db.PacienteTelefonoAlternativo{}).Where("paciente_id = ?", verificado1.ID).Count(&cantidadTel1)
	gdb.Model(&db.PacienteTelefonoAlternativo{}).Where("paciente_id = ?", verificado2.ID).Count(&cantidadTel2)
	if cantidadTel1 != 1 || cantidadTel2 != 1 {
		t.Errorf("cada paciente debería tener su propio PacienteTelefonoAlternativo (mismo teléfono, distinto dueño), got %d y %d", cantidadTel1, cantidadTel2)
	}
}

func TestListConflictosPaciente_NoDevuelveResueltos(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "conf2@example.com")
	_, _, _, conflicto := crearConflictoPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com", "otro@example.com")
	if err := gdb.Model(&conflicto).Update("resuelto", true).Error; err != nil {
		t.Fatalf("no se pudo marcar el conflicto como resuelto: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes/conflictos", reg.Token, nil)
	var got []conflictoPacienteResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 0 {
		t.Errorf("got = %+v, esperaba 0 (el conflicto ya está resuelto)", got)
	}
}

func TestListConflictosPaciente_SoloDelProfesionalAutenticado(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg1, tipo1 := profesionalConTipoConsulta(t, gdb, router, "conf3a@example.com")
	reg2, _ := profesionalConTipoConsulta(t, gdb, router, "conf3b@example.com")
	crearConflictoPacienteDePrueba(t, gdb, reg1.Profesional.ID, tipo1, "30111222", "bruno@example.com", "otro@example.com")

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes/conflictos", reg2.Token, nil)
	var got []conflictoPacienteResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 0 {
		t.Errorf("got = %+v, esperaba 0 (el conflicto es de otro profesional)", got)
	}
}

func TestListConflictosPaciente_RequiereAutenticacion(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})

	rec := doJSON(t, router, http.MethodGet, "/pacientes/conflictos", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

// TestResolverConflictoPaciente_EsVerificado — "el mail es de la persona
// verificada": el turno se reasigna a la ficha verificada, su mail queda
// disponible como alternativo, y la ficha en conflicto desaparece.
func TestResolverConflictoPaciente_EsVerificado(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "conf4@example.com")
	verificado, enConflicto, turno, conflicto := crearConflictoPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com", "otro@example.com")

	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+conflicto.ID.String()+"/resolver", reg.Token, resolverConflictoPacienteRequest{EsVerificado: true})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var turnoActualizado db.Turno
	if err := gdb.First(&turnoActualizado, "id = ?", turno.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno: %v", err)
	}
	if turnoActualizado.PacienteID == nil || *turnoActualizado.PacienteID != verificado.ID {
		t.Errorf("turno.PacienteID = %v, esperaba %q (el verificado)", turnoActualizado.PacienteID, verificado.ID)
	}

	var count int64
	gdb.Model(&db.Paciente{}).Where("id = ?", enConflicto.ID).Count(&count)
	if count != 0 {
		t.Errorf("la ficha en conflicto debería haberse borrado, count=%d", count)
	}

	var alternativo db.PacienteEmailAlternativo
	if err := gdb.Where("paciente_id = ? AND email = ?", verificado.ID, "otro@example.com").First(&alternativo).Error; err != nil {
		t.Errorf("esperaba un PacienteEmailAlternativo con el mail de la ficha en conflicto: %v", err)
	}

	var conflictoActualizado db.ConflictoPaciente
	gdb.First(&conflictoActualizado, "id = ?", conflicto.ID)
	if !conflictoActualizado.Resuelto {
		t.Errorf("Resuelto = false, esperaba true")
	}
}

// TestResolverConflictoPaciente_EsVerificadoUsaNombreCanonico — corrección
// de bug real, pedido textual del cliente (2026-09-05): "Bruno Iglesias"
// (verificado) saca otro turno como "Bruno IGNACIO Iglesias" (mismo DNI,
// otro mail) — al resolver el conflicto a favor del verificado, la
// tarjeta del turno migrado NO debe seguir mostrando "Bruno IGNACIO
// Iglesias": NombreContacto/ApellidoContacto (snapshot propio de Turno,
// nunca un join en vivo contra Paciente) se pisan con el nombre CANÓNICO
// de la ficha que prevalece.
func TestResolverConflictoPaciente_EsVerificadoUsaNombreCanonico(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "conf-nombre1@example.com")
	pid, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	tid, err := uuid.Parse(tipoID)
	if err != nil {
		t.Fatalf("tipoConsultaID inválido: %v", err)
	}

	verificado := crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com")

	mailEnConflicto := "otro@example.com"
	enConflicto := db.Paciente{
		ProfesionalID: pid,
		Nombre:        "Bruno IGNACIO",
		Apellido:      "Iglesias",
		DNI:           "30111222",
		Telefono:      "+5493511230000",
		Email:         &mailEnConflicto,
		EnConflicto:   true,
	}
	if err := gdb.Create(&enConflicto).Error; err != nil {
		t.Fatalf("no se pudo crear la ficha en conflicto: %v", err)
	}

	inicio := time.Now().Add(72 * time.Hour).Truncate(time.Second)
	fin := inicio.Add(30 * time.Minute)
	turno := db.Turno{
		ProfesionalID:    pid,
		PacienteID:       &enConflicto.ID,
		Estado:           "agendado",
		TipoConsultaID:   &tid,
		HoraInicio:       &inicio,
		HoraFin:          &fin,
		NombreContacto:   enConflicto.Nombre,
		ApellidoContacto: enConflicto.Apellido,
		DNIContacto:      enConflicto.DNI,
		TelefonoContacto: enConflicto.Telefono,
		EmailContacto:    mailEnConflicto,
		Origen:           "pagina_publica",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno en conflicto: %v", err)
	}

	conflicto := db.ConflictoPaciente{
		ProfesionalID:         pid,
		PacienteVerificadoID:  verificado.ID,
		PacienteEnConflictoID: enConflicto.ID,
		TurnoEnConflictoID:    turno.ID,
		Motivo:                "se registró con otro mail",
	}
	if err := gdb.Create(&conflicto).Error; err != nil {
		t.Fatalf("no se pudo crear el conflicto: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+conflicto.ID.String()+"/resolver", reg.Token, resolverConflictoPacienteRequest{EsVerificado: true})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var turnoActualizado db.Turno
	if err := gdb.First(&turnoActualizado, "id = ?", turno.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno: %v", err)
	}
	if turnoActualizado.NombreContacto != verificado.Nombre || turnoActualizado.ApellidoContacto != verificado.Apellido {
		t.Errorf("turno.Nombre/ApellidoContacto = %q %q, esperaba el nombre canónico %q %q (no el tipeado en el pedido conflictivo)",
			turnoActualizado.NombreContacto, turnoActualizado.ApellidoContacto, verificado.Nombre, verificado.Apellido)
	}
}

// TestResolverConflictoPaciente_NoEsVerificado — "el mail no es del
// paciente verificado": se borra la ficha, el turno se cancela (nunca se
// borra un turno) y el mail queda bloqueado 7 días.
func TestResolverConflictoPaciente_NoEsVerificado(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "conf5@example.com")
	_, enConflicto, turno, conflicto := crearConflictoPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com", "otro@example.com")

	antes := time.Now()
	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+conflicto.ID.String()+"/resolver", reg.Token, resolverConflictoPacienteRequest{EsVerificado: false})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var turnoActualizado db.Turno
	if err := gdb.First(&turnoActualizado, "id = ?", turno.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno: %v", err)
	}
	if turnoActualizado.Estado != "cancelada" {
		t.Errorf("turno.Estado = %q, esperaba %q (nunca se borra un turno)", turnoActualizado.Estado, "cancelada")
	}
	if turnoActualizado.PacienteID != nil {
		t.Errorf("turno.PacienteID = %v, esperaba nil (la ficha se borró)", turnoActualizado.PacienteID)
	}

	var count int64
	gdb.Model(&db.Paciente{}).Where("id = ?", enConflicto.ID).Count(&count)
	if count != 0 {
		t.Errorf("la ficha en conflicto debería haberse borrado, count=%d", count)
	}

	var bloqueo db.EmailBloqueadoTurnoPublico
	if err := gdb.Where("profesional_id = ? AND email = ?", reg.Profesional.ID, "otro@example.com").First(&bloqueo).Error; err != nil {
		t.Fatalf("esperaba un EmailBloqueadoTurnoPublico: %v", err)
	}
	minimo := antes.Add(6*24*time.Hour + 23*time.Hour) // ~7 días, con margen
	if bloqueo.BloqueadoHasta.Before(minimo) {
		t.Errorf("BloqueadoHasta = %v, esperaba ~7 días desde ahora (mínimo %v)", bloqueo.BloqueadoHasta, minimo)
	}
}

// TestResolverConflictoPaciente_EsVerificadoEliminaTurnoResuelto —
// corrección de bug real (QA 2026-09-04), pedido textual del cliente: "el
// turno no se tiene que migrar sino eliminar directamente, porque ya fue
// resuelto y por temas lógicos nunca asistió a este" — un turno YA
// RESUELTO de la ficha en conflicto se borra de verdad al confirmar "es la
// misma persona" (antes quedaba huérfano: la ficha se borra dos líneas
// más abajo y nadie tocaba ese turno). El turno vigente de siempre sigue
// migrándose igual.
func TestResolverConflictoPaciente_EsVerificadoEliminaTurnoResuelto(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "conf-resuelto1@example.com")
	verificado, enConflicto, turnoVigente, conflicto := crearConflictoPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com", "otro@example.com")
	turnoResuelto := crearTurnoVigenteDePruebaParaPaciente(t, gdb, enConflicto, tipoID, time.Now().Add(-3*time.Hour))

	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+conflicto.ID.String()+"/resolver", reg.Token, resolverConflictoPacienteRequest{EsVerificado: true})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	if err := gdb.First(&db.Turno{}, "id = ?", turnoResuelto.ID).Error; !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("esperaba que el turno resuelto se borrara de verdad, err = %v", err)
	}

	var turnoVigenteActualizado db.Turno
	if err := gdb.First(&turnoVigenteActualizado, "id = ?", turnoVigente.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno vigente: %v", err)
	}
	if turnoVigenteActualizado.PacienteID == nil || *turnoVigenteActualizado.PacienteID != verificado.ID {
		t.Errorf("PacienteID = %v, esperaba %q (el turno vigente sigue migrándose igual)", turnoVigenteActualizado.PacienteID, verificado.ID)
	}
}

// TestResolverConflictoPaciente_NoEsVerificadoCancelaTurnoResuelto —
// corrección de bug real (QA 2026-09-04): un turno YA RESUELTO de la
// ficha rechazada se cancela y desvincula igual que uno vigente (antes
// solo se tocaban los vigentes, uno resuelto quedaba huérfano). A
// diferencia del caso "es la misma persona", acá NO se elimina — es un
// mail ajeno/ilegítimo, no un error propio, tiene sentido conservar el
// registro cancelado como rastro.
func TestResolverConflictoPaciente_NoEsVerificadoCancelaTurnoResuelto(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "conf-resuelto2@example.com")
	_, enConflicto, _, conflicto := crearConflictoPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com", "otro@example.com")
	turnoResuelto := crearTurnoVigenteDePruebaParaPaciente(t, gdb, enConflicto, tipoID, time.Now().Add(-3*time.Hour))

	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+conflicto.ID.String()+"/resolver", reg.Token, resolverConflictoPacienteRequest{EsVerificado: false})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var turnoResueltoActualizado db.Turno
	if err := gdb.First(&turnoResueltoActualizado, "id = ?", turnoResuelto.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno resuelto (no debería haberse borrado): %v", err)
	}
	if turnoResueltoActualizado.Estado != "cancelada" {
		t.Errorf("Estado = %q, esperaba cancelada (nunca se borra un turno)", turnoResueltoActualizado.Estado)
	}
	if turnoResueltoActualizado.PacienteID != nil {
		t.Errorf("PacienteID = %v, esperaba nil (desvinculado)", turnoResueltoActualizado.PacienteID)
	}
}

func TestResolverConflictoPaciente_YaResueltoFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "conf6@example.com")
	_, _, _, conflicto := crearConflictoPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com", "otro@example.com")
	if err := gdb.Model(&conflicto).Update("resuelto", true).Error; err != nil {
		t.Fatalf("no se pudo marcar el conflicto como resuelto: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+conflicto.ID.String()+"/resolver", reg.Token, resolverConflictoPacienteRequest{EsVerificado: true})
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}
}

func TestResolverConflictoPaciente_DeOtroProfesionalFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg1, tipo1 := profesionalConTipoConsulta(t, gdb, router, "conf7a@example.com")
	reg2, _ := profesionalConTipoConsulta(t, gdb, router, "conf7b@example.com")
	_, _, _, conflicto := crearConflictoPacienteDePrueba(t, gdb, reg1.Profesional.ID, tipo1, "30111222", "bruno@example.com", "otro@example.com")

	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+conflicto.ID.String()+"/resolver", reg2.Token, resolverConflictoPacienteRequest{EsVerificado: true})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

func TestResolverConflictoPaciente_IdInexistenteFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "conf8@example.com")

	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+uuid.NewString()+"/resolver", reg.Token, resolverConflictoPacienteRequest{EsVerificado: true})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}
