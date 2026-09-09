package db_test

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// Foreign keys del esquema — Fase C de la auditoría, ver
// `internal/db/migrate_fk.go`.
//
// Estos tests prueban que las constraints MUERDEN, no que existan. Un test
// que consulta `pg_constraint` y confirma que la fila está pasa igual si la
// constraint se creó sobre la columna equivocada, o si apunta a la tabla
// equivocada — que es justamente el error que casi cometemos acá
// (`profesional_id` parece apuntar a `profesionales` y en realidad guarda un
// `clinics.id`). La única prueba que vale es intentar la operación
// prohibida y ver que la base la rechaza.

// TestFK_RechazaTurnoDeUnaClinicaInexistente — el caso central, y el que
// cierra el agujero que teníamos: hasta la Fase C se podía insertar un
// turno con cualquier UUID en `profesional_id`. Así llegaron las 38 filas
// huérfanas que aparecieron en la base de desarrollo.
func TestFK_RechazaTurnoDeUnaClinicaInexistente(t *testing.T) {
	gdb := testdb.New(t)

	inicio := hoyMasUnDia()
	fin := inicio.Add(30 * time.Minute)
	turno := db.Turno{
		ProfesionalID:    uuid.New(), // no existe ninguna clínica con este id
		Estado:           "agendado",
		Origen:           "manual",
		NombreContacto:   "Ana",
		ApellidoContacto: "Prueba",
		DNIContacto:      "30111222",
		TelefonoContacto: "3510000000",
		EmailContacto:    "ana@example.com",
		HoraInicio:       &inicio,
		HoraFin:          &fin,
	}
	err := gdb.Create(&turno).Error
	if err == nil {
		t.Fatal("se creó un turno apuntando a una clínica inexistente — la foreign key no está mordiendo")
	}
	if !strings.Contains(err.Error(), "fk_turnos_clinica") {
		t.Errorf("el rechazo no vino de fk_turnos_clinica: %v", err)
	}
}

// TestFK_RechazaPacienteDeUnaClinicaInexistente — misma garantía para la
// otra tabla raíz del dominio.
func TestFK_RechazaPacienteDeUnaClinicaInexistente(t *testing.T) {
	gdb := testdb.New(t)

	telefono := "+5493510000000"
	p := db.Paciente{
		ProfesionalID: uuid.New(),
		Nombre:        "Ana",
		Apellido:      "Prueba",
		DNI:           "30111333",
		Telefono:      &telefono,
	}
	err := gdb.Create(&p).Error
	if err == nil {
		t.Fatal("se creó una ficha apuntando a una clínica inexistente — la foreign key no está mordiendo")
	}
	if !strings.Contains(err.Error(), "fk_pacientes_clinica") {
		t.Errorf("el rechazo no vino de fk_pacientes_clinica: %v", err)
	}
}

// TestFK_TurnoAceptaUnaClinicaReal — el contrapeso obligatorio de los dos
// de arriba: una constraint que rechaza TODO también los haría pasar. Este
// confirma que el camino legítimo sigue funcionando, que es la parte que de
// verdad no se puede romper.
func TestFK_TurnoAceptaUnaClinicaReal(t *testing.T) {
	gdb := testdb.New(t)
	clinicaID := crearProfesionalDePrueba(t, gdb)

	inicio := hoyMasUnDia()
	fin := inicio.Add(30 * time.Minute)
	turno := db.Turno{
		ProfesionalID:    clinicaID,
		Estado:           "agendado",
		Origen:           "manual",
		NombreContacto:   "Ana",
		ApellidoContacto: "Prueba",
		DNIContacto:      "30111444",
		TelefonoContacto: "3510000000",
		EmailContacto:    "ana@example.com",
		HoraInicio:       &inicio,
		HoraFin:          &fin,
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("un turno de una clínica REAL tiene que poder crearse: %v", err)
	}
}

// TestFK_BorrarUsuarioSeLlevaSusFilasPeroNoLaAuditoria — las dos
// semánticas de borrado que sí destruyen, probadas juntas porque su gracia
// es la diferencia entre ellas: las filas que pertenecen al usuario se van
// con él (CASCADE), y el registro de auditoría se queda soltando la
// referencia (SET NULL), que es cuando más vale.
func TestFK_BorrarUsuarioSeLlevaSusFilasPeroNoLaAuditoria(t *testing.T) {
	gdb := testdb.New(t)

	user := db.User{Email: uuid.NewString() + "@example.com", OnboardingStep: "cuenta"}
	if err := gdb.Create(&user).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario: %v", err)
	}
	if err := gdb.Exec(
		`INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at, created_at)
		 VALUES (?, ?, ?, now() + interval '1 day', now(), now())`,
		uuid.New(), user.ID, uuid.NewString()).Error; err != nil {
		t.Fatalf("no se pudo crear la sesión: %v", err)
	}
	// Se usa el modelo y no SQL crudo: si mañana cambian las columnas de
	// audit_events, este test tiene que dejar de COMPILAR, no saltearse en
	// silencio dando la impresión de que cubre algo.
	evento := db.AuditEvent{UserID: &user.ID, EventType: "login", IP: "127.0.0.1"}
	if err := gdb.Create(&evento).Error; err != nil {
		t.Fatalf("no se pudo crear el evento de auditoría: %v", err)
	}

	// Unscoped: User tiene soft-delete, y un borrado lógico no dispara las
	// foreign keys. Lo que se prueba acá es el borrado REAL, el que hace
	// PurgeAuthGarbage.
	if err := gdb.Unscoped().Delete(&user).Error; err != nil {
		t.Fatalf("no se pudo borrar el usuario: %v", err)
	}

	var sesiones int64
	if err := gdb.Raw(`SELECT count(*) FROM sessions WHERE user_id = ?`, user.ID).Scan(&sesiones).Error; err != nil {
		t.Fatalf("no se pudo contar sesiones: %v", err)
	}
	if sesiones != 0 {
		t.Errorf("quedaron %d sesiones del usuario borrado — el CASCADE no actuó", sesiones)
	}

	// El evento se busca por su PROPIO id: sobrevivió, pero ya no apunta a
	// nadie.
	var sobreviviente db.AuditEvent
	if err := gdb.First(&sobreviviente, "id = ?", evento.ID).Error; err != nil {
		t.Fatalf("el evento de auditoría se BORRÓ con el usuario — tenía que sobrevivir soltando la referencia: %v", err)
	}
	if sobreviviente.UserID != nil {
		t.Errorf("el evento sigue apuntando al usuario borrado (%v) — el SET NULL no actuó", *sobreviviente.UserID)
	}
}

// TestFK_NoSePuedeBorrarUnUsuarioConClinica — el freno de mano. Es la única
// foreign key hacia `users` que NO es CASCADE, y su razón de ser es que un
// borrado de cuenta jamás se lleve puestos los datos clínicos por el camino.
func TestFK_NoSePuedeBorrarUnUsuarioConClinica(t *testing.T) {
	gdb := testdb.New(t)

	owner := db.User{Email: uuid.NewString() + "@example.com", OnboardingStep: "completo"}
	if err := gdb.Create(&owner).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario: %v", err)
	}
	clinica := db.Clinic{Nombre: "Clínica", Tipo: "individual", Slug: uuid.NewString(), OwnerID: owner.ID}
	if err := gdb.Create(&clinica).Error; err != nil {
		t.Fatalf("no se pudo crear la clínica: %v", err)
	}

	err := gdb.Unscoped().Delete(&owner).Error
	if err == nil {
		t.Fatal("se borró un usuario dueño de una clínica — el freno de fk_clinics_owner no actuó")
	}
	if !strings.Contains(err.Error(), "fk_clinics_owner") {
		t.Errorf("el rechazo no vino de fk_clinics_owner: %v", err)
	}
}

// TestFK_ConflictosPacienteSigueSinForeignKey — la excepción deliberada,
// con test propio para que no se "arregle" por descuido más adelante.
//
// `conflictos_paciente` es historial: al resolver un conflicto se BORRA la
// ficha perdedora y la fila del conflicto se conserva con `resuelto = true`,
// quedando con una referencia colgada A PROPÓSITO. Una foreign key ahí
// rompería la resolución de conflictos (RESTRICT) o borraría el historial
// junto con la ficha (CASCADE).
func TestFK_ConflictosPacienteSigueSinForeignKey(t *testing.T) {
	gdb := testdb.New(t)

	for _, columna := range []string{"paciente_en_conflicto_id", "paciente_verificado_id", "turno_en_conflicto_id"} {
		var tiene bool
		err := gdb.Raw(`SELECT EXISTS (
			SELECT 1 FROM information_schema.key_column_usage k
			JOIN information_schema.table_constraints c ON c.constraint_name = k.constraint_name
			WHERE c.constraint_type = 'FOREIGN KEY'
			  AND k.table_name = 'conflictos_paciente' AND k.column_name = ?)`, columna).Scan(&tiene).Error
		if err != nil {
			t.Fatalf("no se pudo consultar las constraints de %s: %v", columna, err)
		}
		if tiene {
			t.Errorf("conflictos_paciente.%s tiene una foreign key: la tabla es HISTORIAL y sus referencias "+
				"quedan colgadas a propósito cuando se resuelve un conflicto (ver migrate_fk.go)", columna)
		}
	}
}

// hoyMasUnDia — un horario cualquiera en el futuro, para no chocar con el
// exclusion constraint de no-solapamiento de otros tests.
func hoyMasUnDia() time.Time {
	return time.Now().Add(24 * time.Hour).Truncate(time.Second)
}
