package db_test

import (
	"strings"
	"testing"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// Guardián de migraciones destructivas — Fase C de la auditoría
// (`docs/Seguridad y optimizacion/`), ítem "cortar de raíz las migraciones
// destructivas sin backup". Ver `internal/db/migrate_destructiva.go`.
//
// Lo que estos tests tienen que probar es que el guardián DISCRIMINA: que
// frena cuando de verdad hay algo que perder, y que NO molesta cuando no lo
// hay. Un guardián que frena siempre se termina desactivando "para que el
// deploy pase", y ahí deja de proteger; uno que no frena nunca no protege
// desde el principio.

// TestDestructiva_FrenaCuandoHayDatosQuePerder — el test central. Arma una
// base con el esquema VIEJO (las 5 columnas tutor_* que hoy ya no existen)
// y confirma que una migración con política restrictiva se niega a
// dropearlas, nombrando qué iba a destruir.
func TestDestructiva_FrenaCuandoHayDatosQuePerder(t *testing.T) {
	gdb, ok := baseConEsquemaViejoDeTutor(t)
	if !ok {
		t.Skip("no se pudo crear una base descartable (permisos) — se saltea")
	}

	restrictiva := db.PoliticaDestructiva{Permitir: false, Entorno: "production"}
	err := db.RunMigrationsConPolitica(gdb, restrictiva)
	if err == nil {
		t.Fatal("las migraciones pasaron con política restrictiva — el guardián dejó dropear columnas con datos")
	}

	// El mensaje es lo único que va a leer la persona a la que se le acaba
	// de frenar un deploy: tiene que decirle qué se frenó, por qué, y cómo
	// seguir.
	msg := err.Error()
	for _, esperado := range []string{"drop_columnas_tutor_de_paciente", "production", "backup", "DB_ALLOW_DESTRUCTIVE"} {
		if !strings.Contains(msg, esperado) {
			t.Errorf("el mensaje de error no menciona %q — no le sirve a quien lo lea:\n%s", esperado, msg)
		}
	}

	// Y lo más importante: no destruyó nada antes de frenar.
	if !columnaExiste(t, gdb, "pacientes", "tutor_nombre") {
		t.Error("la columna se dropeó igual — el guardián frenó DESPUÉS de destruir")
	}
}

// TestDestructiva_ConAutorizacionExplicitaCorre — el otro lado: con el
// permiso puesto a conciencia, la misma migración se aplica.
func TestDestructiva_ConAutorizacionExplicitaCorre(t *testing.T) {
	gdb, ok := baseConEsquemaViejoDeTutor(t)
	if !ok {
		t.Skip("no se pudo crear una base descartable (permisos) — se saltea")
	}

	autorizada := db.PoliticaDestructiva{Permitir: true, Entorno: "production"}
	if err := db.RunMigrationsConPolitica(gdb, autorizada); err != nil {
		t.Fatalf("las migraciones fallaron con política permisiva: %v", err)
	}
	if columnaExiste(t, gdb, "pacientes", "tutor_nombre") {
		t.Error("la columna sobrevivió a una migración destructiva autorizada")
	}

	// Queda registrada, así que no vuelve a evaluarse en cada arranque.
	var registrada db.MigracionUnaVez
	if err := gdb.Where("nombre = ?", "drop_columnas_tutor_de_paciente").First(&registrada).Error; err != nil {
		t.Errorf("la migración no quedó registrada en migraciones_una_vez: %v", err)
	}
}

// TestDestructiva_NoMolestaCuandoNoHayNadaQueDestruir — el caso de todos
// los días, y el que evita que la protección se termine desactivando: una
// base sana (la de test, ya migrada) pasa con política RESTRICTIVA sin
// pedirle permiso a nadie, porque ninguna migración destructiva encuentra
// nada que destruir.
func TestDestructiva_NoMolestaCuandoNoHayNadaQueDestruir(t *testing.T) {
	gdb := testdb.Shared(t)

	restrictiva := db.PoliticaDestructiva{Permitir: false, Entorno: "production"}
	if err := db.RunMigrationsConPolitica(gdb, restrictiva); err != nil {
		t.Fatalf("una base sin nada que destruir no debería necesitar autorización: %v", err)
	}
}

// TestDestructiva_FrenaElBorradoDeTurnosPendientes — el segundo caso con
// datos de negocio de por medio: filas, no columnas. `pendiente` es un
// estado que el check constraint actual ya no admite, así que la fila se
// inserta con SQL crudo sobre una base a la que todavía no se le aplicó
// este esquema.
func TestDestructiva_FrenaElBorradoDeTurnosPendientes(t *testing.T) {
	gdb, ok := baseDescartableConMigracionesAplicadas(t)
	if !ok {
		t.Skip("no se pudo crear una base descartable (permisos) — se saltea")
	}

	// Se afloja el check constraint para poder plantar un turno viejo, se
	// borra el registro de la migración, y se vuelve a migrar: así el
	// guardián se encuentra con una fila `pendiente` de verdad.
	if err := gdb.Exec(`ALTER TABLE turnos DROP CONSTRAINT IF EXISTS chk_turnos_estado`).Error; err != nil {
		t.Fatalf("no se pudo aflojar el check: %v", err)
	}
	prof := profesionalDePruebaMinimo(t, gdb)
	if err := gdb.Exec(`INSERT INTO turnos (id, profesional_id, estado, origen, nombre_contacto, apellido_contacto,
		dni_contacto, telefono_contacto, email_contacto, motivo, created_at, updated_at)
		VALUES (?, ?, 'pendiente', 'pagina_publica', 'Ana', 'Vieja', '30111222', '3510000000', 'a@example.com', '', now(), now())`,
		uuid.New(), prof).Error; err != nil {
		t.Fatalf("no se pudo insertar el turno pendiente: %v", err)
	}
	if err := gdb.Exec(`DELETE FROM migraciones_una_vez WHERE nombre = 'borrar_turnos_pendientes'`).Error; err != nil {
		t.Fatalf("no se pudo desregistrar la migración: %v", err)
	}

	err := db.RunMigrationsConPolitica(gdb, db.PoliticaDestructiva{Permitir: false, Entorno: "staging"})
	if err == nil {
		t.Fatal("las migraciones pasaron con política restrictiva pese a tener un turno que borrar")
	}
	if !strings.Contains(err.Error(), "borrar_turnos_pendientes") {
		t.Errorf("el error no identifica la migración frenada: %v", err)
	}

	var cuantos int64
	if err := gdb.Raw(`SELECT count(*) FROM turnos WHERE estado = 'pendiente'`).Scan(&cuantos).Error; err != nil {
		t.Fatalf("no se pudo contar: %v", err)
	}
	if cuantos != 1 {
		t.Errorf("quedaron %d turnos pendientes, esperaba que el turno siguiera intacto", cuantos)
	}
}

// --- helpers ---

// baseConEsquemaViejoDeTutor arma una base descartable, le aplica el
// esquema actual, y después le vuelve a AGREGAR las columnas tutor_* y
// desregistra la migración — simulando una base que quedó en la versión
// anterior. Es la única forma de tener "algo que destruir" sin depender de
// una base real vieja.
func baseConEsquemaViejoDeTutor(t *testing.T) (*gorm.DB, bool) {
	t.Helper()
	gdb, ok := baseDescartableConMigracionesAplicadas(t)
	if !ok {
		return nil, false
	}
	if err := gdb.Exec(`ALTER TABLE pacientes
		ADD COLUMN IF NOT EXISTS tutor_relacion varchar(20),
		ADD COLUMN IF NOT EXISTS tutor_nombre varchar(120),
		ADD COLUMN IF NOT EXISTS tutor_dni varchar(20),
		ADD COLUMN IF NOT EXISTS tutor_telefono varchar(40),
		ADD COLUMN IF NOT EXISTS tutor_email varchar(160)`).Error; err != nil {
		t.Fatalf("no se pudieron re-agregar las columnas viejas: %v", err)
	}
	if err := gdb.Exec(`DELETE FROM migraciones_una_vez WHERE nombre = 'drop_columnas_tutor_de_paciente'`).Error; err != nil {
		t.Fatalf("no se pudo desregistrar la migración: %v", err)
	}
	return gdb, true
}

// baseDescartableConMigracionesAplicadas — misma idea que el helper de
// migrate_una_vez_test.go: una base propia, migrada, que se borra al final.
// Se necesita una base aparte (y no testdb) porque estos tests rompen el
// esquema a propósito.
func baseDescartableConMigracionesAplicadas(t *testing.T) (*gorm.DB, bool) {
	t.Helper()
	admin, nombreBase, dsnNueva, ok := baseDeDatosDescartable(t)
	if !ok {
		return nil, false
	}
	gdb, err := gorm.Open(postgres.Open(dsnNueva), &gorm.Config{})
	if err != nil {
		t.Fatalf("no se pudo conectar a la base descartable: %v", err)
	}
	// El cleanup CIERRA la conexión antes del DROP DATABASE: con una
	// conexión abierta Postgres lo rechaza y la base queda filtrada (pasó
	// de verdad al escribir el test de migrate_una_vez, dejó 5 huérfanas).
	t.Cleanup(func() {
		if sqlDB, err := gdb.DB(); err == nil {
			_ = sqlDB.Close()
		}
		if sqlAdmin, err := admin.DB(); err == nil {
			if _, err := sqlAdmin.Exec("DROP DATABASE IF EXISTS " + nombreBase); err != nil {
				t.Logf("no se pudo borrar la base descartable %s: %v", nombreBase, err)
			}
			_ = sqlAdmin.Close()
		}
	})
	if err := db.RunMigrations(gdb); err != nil {
		t.Fatalf("no se pudo migrar la base descartable: %v", err)
	}
	return gdb, true
}

func profesionalDePruebaMinimo(t *testing.T, gdb *gorm.DB) uuid.UUID {
	t.Helper()
	// La columna `profesional_id` guarda un clinics.id, no un
	// profesionales.id — ver migrate_fk.go. La tabla `profesionales` es
	// legacy de antes de TR-037 y está vacía.
	ownerprof := db.User{Email: uuid.NewString() + "@example.com", OnboardingStep: "completo"}
	if err := gdb.Create(&ownerprof).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario dueño: %v", err)
	}
	prof := db.Clinic{Nombre: "Clínica de prueba", Tipo: "individual", Slug: uuid.NewString(), OwnerID: ownerprof.ID}
	if err := gdb.Create(&prof).Error; err != nil {
		t.Fatalf("no se pudo crear el profesional: %v", err)
	}
	return prof.ID
}

func columnaExiste(t *testing.T, gdb *gorm.DB, tabla, columna string) bool {
	t.Helper()
	var n int64
	if err := gdb.Raw(`SELECT count(*) FROM information_schema.columns WHERE table_name = ? AND column_name = ?`,
		tabla, columna).Scan(&n).Error; err != nil {
		t.Fatalf("no se pudo consultar information_schema: %v", err)
	}
	return n > 0
}

// TestDestructiva_LimpiezaLegacyTambienArreglaLosTurnosRotos — test de
// regresión de un deploy que falló DE VERDAD en Render el 2026-09-09:
//
//	WARN aplicando migración destructiva autorizada afectados=10
//	error aplicando migraciones: no se pueden crear las foreign keys:
//	  turnos.profesional_id -> clinics: 4 fila(s) ...
//	  turnos.paciente_id -> pacientes: 4 fila(s) ...
//	  turnos.tipo_consulta_id -> tipos_consulta: 4 fila(s) ...
//	==> Exited with status 1
//
// La limpieza de filas legacy contemplaba pacientes, tipos de consulta,
// páginas públicas y tutores — pero NO los turnos. En la base de desarrollo
// donde se verificó no había ni un turno roto, así que el caso nunca se
// ejercitó: la verificación se hizo contra una base que no tenía el
// problema.
//
// El resultado era un loop del que no se sale: la limpieza borra, el
// CREATE de las foreign keys falla, la transacción entera hace rollback
// (los datos se salvan, pero nada avanza) y el arranque siguiente repite
// exactamente lo mismo. Mismo patrón que el bug de orden de la
// deduplicación (TR-123).
//
// El test arma las tres formas en que un turno puede quedar roto y
// confirma que la migración completa termina bien, que los turnos
// inalcanzables se borran y que los de una clínica REAL sobreviven con la
// referencia rota en NULL — nunca borrados: son historia clínica.
func TestDestructiva_LimpiezaLegacyTambienArreglaLosTurnosRotos(t *testing.T) {
	gdb, ok := baseDescartableConMigracionesAplicadas(t)
	if !ok {
		t.Skip("no se pudo crear una base descartable (permisos) — se saltea")
	}

	// Una clínica REAL, con su turno sano y sus referencias válidas.
	ownerReal := db.User{Email: uuid.NewString() + "@example.com", OnboardingStep: "completo"}
	if err := gdb.Create(&ownerReal).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario: %v", err)
	}
	clinicaReal := db.Clinic{Nombre: "Real", Tipo: "individual", Slug: uuid.NewString(), OwnerID: ownerReal.ID}
	if err := gdb.Create(&clinicaReal).Error; err != nil {
		t.Fatalf("no se pudo crear la clínica: %v", err)
	}
	tel := "+5493511111111"
	pacienteReal := db.Paciente{ProfesionalID: clinicaReal.ID, Nombre: "Sana", Apellido: "Real", DNI: "31000001", Telefono: &tel}
	if err := gdb.Create(&pacienteReal).Error; err != nil {
		t.Fatalf("no se pudo crear el paciente: %v", err)
	}
	tipoReal := db.TipoConsulta{ProfesionalID: clinicaReal.ID, Nombre: "General", Color: "#6E8F72"}
	if err := gdb.Create(&tipoReal).Error; err != nil {
		t.Fatalf("no se pudo crear el tipo: %v", err)
	}

	// Se desregistra la migración y se sacan las foreign keys, para poder
	// plantar las filas rotas: con las constraints puestas la base no las
	// aceptaría, que es justamente lo que este arreglo viene a garantizar.
	for _, fk := range []string{"fk_turnos_clinica", "fk_turnos_paciente", "fk_turnos_tipo_consulta", "fk_pacientes_clinica"} {
		if err := gdb.Exec("ALTER TABLE " + tablaDe(fk) + " DROP CONSTRAINT IF EXISTS " + fk).Error; err != nil {
			t.Fatalf("no se pudo sacar %s: %v", fk, err)
		}
	}
	if err := gdb.Exec(`DELETE FROM migraciones_una_vez WHERE nombre = 'limpiar_filas_legacy_sin_clinica'`).Error; err != nil {
		t.Fatalf("no se pudo desregistrar la migración: %v", err)
	}

	// Cada turno en su propia franja: son de la misma clínica y el
	// exclusion constraint de no-solapamiento los rechazaría si coincidieran.
	horas := 0
	crearTurnoCrudo := func(clinicaID uuid.UUID, pacienteID, tipoID *uuid.UUID, dni string) uuid.UUID {
		t.Helper()
		horas++
		id := uuid.New()
		if err := gdb.Exec(`INSERT INTO turnos (id, profesional_id, paciente_id, tipo_consulta_id, estado, origen,
			nombre_contacto, apellido_contacto, dni_contacto, telefono_contacto, email_contacto, motivo,
			hora_inicio, hora_fin, created_at, updated_at)
			VALUES (?, ?, ?, ?, 'agendado', 'manual', 'Ana', 'Test', ?, '3510000000', 'a@example.com', '',
			        now() + make_interval(hours => ?), now() + make_interval(hours => ?) + interval '30 minutes',
			        now(), now())`,
			id, clinicaID, pacienteID, tipoID, dni, horas, horas).Error; err != nil {
			t.Fatalf("no se pudo insertar el turno: %v", err)
		}
		return id
	}

	inexistente := uuid.New()
	// (a) turno de una clínica que no existe — inalcanzable, se borra.
	turnoSinClinica := crearTurnoCrudo(inexistente, nil, nil, "31000002")
	// (b) y (c) turnos de una clínica REAL con referencias rotas — sobreviven.
	turnoSinPaciente := crearTurnoCrudo(clinicaReal.ID, &inexistente, &tipoReal.ID, "31000003")
	turnoSinTipo := crearTurnoCrudo(clinicaReal.ID, &pacienteReal.ID, &inexistente, "31000004")
	turnoSano := crearTurnoCrudo(clinicaReal.ID, &pacienteReal.ID, &tipoReal.ID, "31000005")

	// La migración completa tiene que terminar bien: es lo que en Render
	// fallaba en loop.
	if err := db.RunMigrations(gdb); err != nil {
		t.Fatalf("las migraciones fallaron — el loop de Render sigue vivo: %v", err)
	}

	existe := func(id uuid.UUID) bool {
		var n int64
		gdb.Raw(`SELECT count(*) FROM turnos WHERE id = ?`, id).Scan(&n)
		return n > 0
	}
	if existe(turnoSinClinica) {
		t.Error("el turno de una clínica inexistente sobrevivió — es inalcanzable, tenía que borrarse")
	}
	for nombre, id := range map[string]uuid.UUID{
		"con paciente roto": turnoSinPaciente, "con tipo roto": turnoSinTipo, "sano": turnoSano,
	} {
		if !existe(id) {
			t.Errorf("el turno %s se BORRÓ: un turno de una clínica real es historia clínica, "+
				"solo hay que soltarle la referencia rota", nombre)
		}
	}

	// Se pregunta `IS NULL` en SQL y no se escanea la columna a un
	// *uuid.UUID: un NULL escaneado a un puntero da el UUID cero, no nil, y
	// la aserción diría cualquier cosa.
	esNull := func(columna string, turnoID uuid.UUID) bool {
		t.Helper()
		var v bool
		if err := gdb.Raw(`SELECT `+columna+` IS NULL FROM turnos WHERE id = ?`, turnoID).Scan(&v).Error; err != nil {
			t.Fatalf("no se pudo consultar %s: %v", columna, err)
		}
		return v
	}
	if !esNull("paciente_id", turnoSinPaciente) {
		t.Error("paciente_id sigue apuntando a una ficha inexistente — el barrido no lo soltó")
	}
	if !esNull("tipo_consulta_id", turnoSinTipo) {
		t.Error("tipo_consulta_id sigue apuntando a un tipo inexistente — el barrido no lo soltó")
	}

	// Y el turno sano no se tocó: el barrido tiene que ser quirúrgico.
	var sanoOK bool
	if err := gdb.Raw(`SELECT paciente_id = ? AND tipo_consulta_id = ? FROM turnos WHERE id = ?`,
		pacienteReal.ID, tipoReal.ID, turnoSano).Scan(&sanoOK).Error; err != nil {
		t.Fatalf("no se pudo consultar el turno sano: %v", err)
	}
	if !sanoOK {
		t.Error("el barrido tocó un turno que estaba sano")
	}
}

// tablaDe — a qué tabla pertenece cada constraint, para poder sacarlas en
// el test de arriba.
func tablaDe(constraint string) string {
	if constraint == "fk_pacientes_clinica" {
		return "pacientes"
	}
	return "turnos"
}
