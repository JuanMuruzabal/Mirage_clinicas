package http

import (
	"reflect"
	"testing"
	"time"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// Los bucles de 30 días (el "próximo disponible" del wizard y el
// calendario del mes) ya no consultan día por día: traen las reglas y los
// turnos del rango de una y agrupan en memoria (ronda de optimización
// post-Fase 3, 2026-09-23).
//
// Una optimización de este tipo solo vale si NO cambia el resultado. Este
// test lo afirma de la única forma que no depende de que yo haya pensado
// bien cada caso: calcula cada día por los DOS caminos —el de siempre,
// con sus consultas por día, y el nuevo con el rango precargado— y exige
// que den exactamente los mismos huecos.
//
// El fixture está armado para los bordes que un agrupado mal hecho
// rompería:
//
//   - un turno a las 22:00 de Córdoba, que en UTC ya es el día siguiente
//     (el agrupado tiene que ser por día de Córdoba, igual que el filtro
//     por día de siempre);
//   - un turno a las 00:00 exactas, el borde inclusivo del día;
//   - días sin turnos, días con varios, y un horario reservado encima.
func TestDisponibilidad_RangoPrecargadoDaLoMismoQueDiaPorDia(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "rango-equivalente@example.com")
	clinicID := clinicaDePrueba(t, reg.Profesional.ID)
	userID := userIDDelMail(t, gdb, "rango-equivalente@example.com")

	var tipo db.TipoConsulta
	if err := gdb.First(&tipo, "id = ?", tipoConsultaID).Error; err != nil {
		t.Fatalf("no se encontró el tipo: %v", err)
	}

	hoy := clock.Today()
	base := hoy.AddDate(0, 0, 3)

	// Horario de atención amplio, para que los turnos de la noche y de la
	// medianoche caigan DENTRO del horario y afecten los huecos.
	desde, hasta := "00:00", "23:59"
	if err := gdb.Create(&db.HorarioAtencion{
		ClinicID: clinicID, UserID: &userID, Alcance: db.HorarioAtencionAlcanceGeneral,
		HoraDesde: &desde, HoraHasta: &hasta,
	}).Error; err != nil {
		t.Fatalf("no se pudo crear el horario de atención: %v", err)
	}

	turno := func(inicio time.Time, dni string) {
		t.Helper()
		fin := inicio.Add(30 * time.Minute)
		if err := gdb.Create(&db.Turno{
			ClinicID: clinicID, AtendidoPorUserID: &userID, TipoConsultaID: &tipo.ID,
			Estado: "agendado", HoraInicio: &inicio, HoraFin: &fin,
			NombreContacto: "Pac", ApellidoContacto: "Iente", DNIContacto: dni,
			TelefonoContacto: "+5493511234567", EmailContacto: dni + "@example.com", Origen: "manual",
		}).Error; err != nil {
			t.Fatalf("no se pudo crear el turno de prueba: %v", err)
		}
	}
	turno(base.Add(10*time.Hour), "80000001")                 // día base, mañana
	turno(base.Add(14*time.Hour), "80000002")                 // día base, tarde
	turno(base.Add(22*time.Hour), "80000003")                 // 22:00 Córdoba = 01:00 UTC del día siguiente
	turno(base.AddDate(0, 0, 1), "80000004")                  // 00:00 exactas del día siguiente
	turno(base.AddDate(0, 0, 5).Add(9*time.Hour), "80000005") // un día más adelante
	crearBloqueoEspecificoDePrueba(t, gdb, clinicID, base.AddDate(0, 0, 2), "08:00", "12:00")

	const dias = 10
	reglas, err := cargarReglasDeRango(gdb, clinicID, userID, hoy, hoy.AddDate(0, 0, dias))
	if err != nil {
		t.Fatalf("cargarReglasDeRango: %v", err)
	}

	for d := 0; d < dias; d++ {
		fecha := hoy.AddDate(0, 0, d)
		viejo, err := calcularDisponibilidad(gdb, clinicID, userID, tipo, fecha, nil)
		if err != nil {
			t.Fatalf("día %s, camino de siempre: %v", fecha.Format("2006-01-02"), err)
		}
		nuevo, err := calcularDisponibilidadConReglas(gdb, reglas, clinicID, userID, tipo, fecha, nil)
		if err != nil {
			t.Fatalf("día %s, camino precargado: %v", fecha.Format("2006-01-02"), err)
		}
		if !reflect.DeepEqual(viejo, nuevo) {
			t.Errorf("día %s: los dos caminos no coinciden.\n  día por día: %v\n  precargado:  %v",
				fecha.Format("2006-01-02"), viejo, nuevo)
		}
	}
}

// El turno que se está reprogramando no se cuenta como ocupado: en el
// camino precargado ese filtro pasó del WHERE a la memoria, y es la
// clase de detalle que se pierde al mudar código.
func TestDisponibilidad_RangoPrecargadoExcluyeElTurnoQueSeReprograma(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "rango-excluir@example.com")
	clinicID := clinicaDePrueba(t, reg.Profesional.ID)
	userID := userIDDelMail(t, gdb, "rango-excluir@example.com")

	var tipo db.TipoConsulta
	if err := gdb.First(&tipo, "id = ?", tipoConsultaID).Error; err != nil {
		t.Fatalf("no se encontró el tipo: %v", err)
	}

	fecha := clock.Today().AddDate(0, 0, 4)
	inicio := fecha.Add(10 * time.Hour)
	fin := inicio.Add(30 * time.Minute)
	propio := db.Turno{
		ClinicID: clinicID, AtendidoPorUserID: &userID, TipoConsultaID: &tipo.ID,
		Estado: "agendado", HoraInicio: &inicio, HoraFin: &fin,
		NombreContacto: "Pac", ApellidoContacto: "Iente", DNIContacto: "81000001",
		TelefonoContacto: "+5493511234567", EmailContacto: "x@example.com", Origen: "manual",
	}
	if err := gdb.Create(&propio).Error; err != nil {
		t.Fatalf("no se pudo crear el turno: %v", err)
	}

	reglas, err := cargarReglasDeRango(gdb, clinicID, userID, fecha, fecha.AddDate(0, 0, 1))
	if err != nil {
		t.Fatalf("cargarReglasDeRango: %v", err)
	}
	viejo, err := calcularDisponibilidad(gdb, clinicID, userID, tipo, fecha, &propio.ID)
	if err != nil {
		t.Fatal(err)
	}
	nuevo, err := calcularDisponibilidadConReglas(gdb, reglas, clinicID, userID, tipo, fecha, &propio.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(viejo, nuevo) {
		t.Errorf("excluyendo el turno propio, los caminos no coinciden.\n  día por día: %v\n  precargado:  %v", viejo, nuevo)
	}
	// Y el control: el horario del turno propio tiene que estar libre.
	libre := false
	for _, s := range nuevo {
		if s == "10:00" {
			libre = true
		}
	}
	if !libre {
		t.Errorf("las 10:00 deberían ofrecerse al reprogramar el propio turno de las 10:00; slots=%v", nuevo)
	}
}
