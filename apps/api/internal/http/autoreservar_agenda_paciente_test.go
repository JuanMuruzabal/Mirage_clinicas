package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// Autoreservar mira también la agenda del PACIENTE (2026-09-19, pedido
// del cliente: "ahora debe tener en cuenta también si ese mismo paciente
// posee turno con algún otro miembro de la clínica, así no se asigna un
// horario donde tenga turno con otro colega").
//
// `calcularDisponibilidad` mira la agenda del profesional, que es lo que
// necesita para ofrecer huecos. Pero autoreservar mueve el turno de una
// PERSONA, y esa persona puede estar ocupada con un colega a esa misma
// hora. Era el último camino por el que se podía dejar a alguien con dos
// turnos encimados: el alta manual y el reprogramar ya lo rechazan
// (`turnoSuperpuestoDeOtroProfesional`), autoreservar no lo miraba.

// turnoDeColegaParaElMismoPaciente deja al paciente ocupado con OTRO
// profesional de la misma clínica en la franja pedida.
func turnoDeColegaParaElMismoPaciente(
	t *testing.T, gdb *gorm.DB, clinicID, pacienteID, colegaID uuid.UUID, inicio, fin time.Time,
) {
	t.Helper()
	turno := db.Turno{
		ClinicID: clinicID, PacienteID: &pacienteID, AtendidoPorUserID: &colegaID,
		Estado: "agendado", Origen: "manual",
		HoraInicio: &inicio, HoraFin: &fin,
		NombreContacto: "Paciente", ApellidoContacto: "De Prueba",
		DNIContacto: "44040992", TelefonoContacto: "1", EmailContacto: "paciente@example.com",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno del colega: %v", err)
	}
}

// TestAutoreservar_EsquivaElHorarioEnQueElPacienteEstaConUnColega — el
// caso completo. El profesional tiene DOS huecos libres (08:00 y 08:30);
// el paciente está con un colega en el primero. Sin esta regla,
// autoreservar tomaba el primer hueco de la lista y creaba justo el
// encimado que el resto del sistema rechaza.
func TestAutoreservar_EsquivaElHorarioEnQueElPacienteEstaConUnColega(t *testing.T) {
	router, gdb, reg := crearClinicaDePruebaDisponibilidad(t, "auto-colega@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token,
		putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "10:00"})
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)
	clinicID := uuid.MustParse(reg.Profesional.ID)
	tipoID := uuid.MustParse(tipo.ID)
	fecha, err := clock.ParseDate(fechaDePruebaDisponibilidad)
	if err != nil {
		t.Fatalf("ParseDate: %v", err)
	}

	pacienteID := crearPacienteDePruebaPaginaPublica(t, gdb, clinicID, "44040992")
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-auto@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "colega-auto@example.com")

	// Mi turno, el que se va a mover. Va al final de la ventana para que
	// al liberarlo queden delante los dos huecos que interesan.
	inicio := combinarFechaYHora(fecha, "09:30")
	fin := combinarFechaYHora(fecha, "10:00")
	mio := crearTurnoDePrueba(t, gdb, clinicID, tipoID, inicio, fin, "agendado")
	if err := gdb.Model(&db.Turno{}).Where("id = ?", mio.ID).Update("paciente_id", pacienteID).Error; err != nil {
		t.Fatalf("no se pudo vincular el paciente al turno: %v", err)
	}

	// Me bloqueo de 09:00 a 10:00, así mis únicos huecos son 08:00 y
	// 08:30. Y el paciente está con el colega justo en 08:00.
	motivo := "Reunión"
	bloqueo := db.BloqueoHorario{
		ClinicID: clinicID, UserID: ptrUUID(ownerDePrueba(t, gdb, clinicID)),
		Especifico: true, Fecha: &fecha,
		HoraDesde: "09:00", HoraHasta: "10:00", TipoRegla: "bloquear_horario", Motivo: &motivo,
	}
	if err := gdb.Create(&bloqueo).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo de prueba: %v", err)
	}
	turnoDeColegaParaElMismoPaciente(t, gdb, clinicID, pacienteID, colegaID,
		combinarFechaYHora(fecha, "08:00"), combinarFechaYHora(fecha, "08:30"))

	rec := doJSONAuth(t, router, http.MethodPost, "/turnos/autoreservar", reg.Token,
		autoreservarTurnosRequest{TurnoIds: []string{mio.ID.String()}})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got autoreservarTurnosResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got.Resultados) != 1 || !got.Resultados[0].Reprogramado {
		t.Fatalf("Resultados = %+v, esperaba uno reprogramado", got.Resultados)
	}

	esperado := combinarFechaYHora(fecha, "08:30").Format(time.RFC3339)
	if *got.Resultados[0].HoraInicioNueva != esperado {
		t.Errorf(
			"HoraInicioNueva = %q, esperaba %q — 08:00 estaba libre PARA EL PROFESIONAL, pero el paciente lo tenía ocupado con un colega",
			*got.Resultados[0].HoraInicioNueva, esperado,
		)
	}
}

// TestAutoreservar_SiguePorElDiaSiguienteCuandoElPacienteOcupaTodoElDia
// — el otro borde. Si el paciente está ocupado en el ÚNICO hueco del
// día, autoreservar no se conforma con ese horario: sigue buscando día
// por día, igual que cuando el profesional no tiene ningún hueco libre.
//
// Lo que este test descarta es el atajo tentador de "si no hay ninguno
// libre para el paciente, dejalo en el primero igual": eso sería
// exactamente el encimado que esta regla vino a evitar.
func TestAutoreservar_SiguePorElDiaSiguienteCuandoElPacienteOcupaTodoElDia(t *testing.T) {
	router, gdb, reg := crearClinicaDePruebaDisponibilidad(t, "auto-colega2@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token,
		putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "09:00"})
	tipo := crearTipoDePrueba(t, router, reg.Token, 60, 0)
	clinicID := uuid.MustParse(reg.Profesional.ID)
	tipoID := uuid.MustParse(tipo.ID)
	fecha, err := clock.ParseDate(fechaDePruebaDisponibilidad)
	if err != nil {
		t.Fatalf("ParseDate: %v", err)
	}

	pacienteID := crearPacienteDePruebaPaginaPublica(t, gdb, clinicID, "44040993")
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-auto2@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "colega-auto2@example.com")

	inicio := combinarFechaYHora(fecha, "08:00")
	fin := combinarFechaYHora(fecha, "09:00")
	mio := crearTurnoDePrueba(t, gdb, clinicID, tipoID, inicio, fin, "agendado")
	if err := gdb.Model(&db.Turno{}).Where("id = ?", mio.ID).Update("paciente_id", pacienteID).Error; err != nil {
		t.Fatalf("no se pudo vincular el paciente al turno: %v", err)
	}

	// El colega ocupa al paciente en la única franja de ESE día. El
	// horario de atención es general (todos los días), así que el
	// siguiente candidato real es el mismo horario del día siguiente.
	turnoDeColegaParaElMismoPaciente(t, gdb, clinicID, pacienteID, colegaID,
		combinarFechaYHora(fecha, "08:00"), combinarFechaYHora(fecha, "09:00"))

	rec := doJSONAuth(t, router, http.MethodPost, "/turnos/autoreservar", reg.Token,
		autoreservarTurnosRequest{TurnoIds: []string{mio.ID.String()}})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got autoreservarTurnosResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got.Resultados) != 1 || !got.Resultados[0].Reprogramado {
		t.Fatalf("Resultados = %+v, esperaba uno reprogramado", got.Resultados)
	}

	esperado := combinarFechaYHora(fecha.AddDate(0, 0, 1), "08:00").Format(time.RFC3339)
	if *got.Resultados[0].HoraInicioNueva != esperado {
		t.Errorf(
			"HoraInicioNueva = %q, esperaba %q — el único hueco del día lo tenía ocupado el colega, había que seguir buscando",
			*got.Resultados[0].HoraInicioNueva, esperado,
		)
	}
}
