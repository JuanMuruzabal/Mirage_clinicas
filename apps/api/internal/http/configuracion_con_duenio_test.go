package http

import (
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// La configuración de agenda tiene dueño, y lo garantiza la BASE
// (revisión de aislamiento, 2026-09-23).
//
// Los scopes de agenda incluyen `OR user_id IS NULL` por las filas
// anteriores a la 3.2.1, que valían para todos. Así, una fila sin dueño
// que se colara por un camino nuevo aparecería en la agenda de TODOS los
// profesionales, y cualquiera podría editarla o borrarla. Hasta hoy eso
// lo impedía cada handler por su cuenta (409 sin agenda); desde
// `chk_*_con_duenio` lo impide la base, aunque el camino nuevo se olvide.
//
// Este test no prueba un handler: prueba que la base rechaza la fila, que
// es la garantía que no depende de que todos los handlers se acuerden.
func TestConfiguracionDeAgenda_LaBaseRechazaFilasSinDuenio(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "con-duenio@example.com", Password: "unaClaveLarga123",
		Nombre: "Con", NombreClinica: "Clínica Con Dueño",
	})
	clinicID := clinicaDePrueba(t, reg.Profesional.ID)
	fecha := clock.Today().AddDate(0, 0, 3)
	desde, hasta := time.Now(), time.Now().AddDate(0, 0, 7)

	casos := []struct {
		restriccion string
		fila        any
	}{
		{"chk_tipo_consulta_con_duenio",
			&db.TipoConsulta{ClinicID: clinicID, Nombre: "Sin dueño", Color: "#E7D9BE", DuracionMinutos: 30}},
		{"chk_bloqueo_horario_con_duenio",
			&db.BloqueoHorario{ClinicID: clinicID, Especifico: true, Fecha: &fecha,
				HoraDesde: "08:00", HoraHasta: "09:00", TipoRegla: "bloquear_horario"}},
		{"chk_horario_atencion_con_duenio",
			&db.HorarioAtencion{ClinicID: clinicID, Alcance: "rango", FechaDesde: &desde, FechaHasta: &hasta}},
	}

	for _, c := range casos {
		t.Run(c.restriccion, func(t *testing.T) {
			// Un savepoint por caso: el error de uno deja la transacción
			// del test abortada, y el siguiente caso no podría correr.
			tx := gdb.SavePoint("caso")
			err := tx.Create(c.fila).Error
			gdb.RollbackTo("caso")

			var pgErr *pgconn.PgError
			if !errors.As(err, &pgErr) || pgErr.ConstraintName != c.restriccion {
				t.Fatalf("la base aceptó una fila sin dueño (o la rechazó por otra cosa): %v", err)
			}
		})
	}
}
