package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// Un conflicto de identidad, con dos profesionales (2026-09-15).
//
// La regla que pidió el cliente, textual: *"si bien los conflictos se
// resuelven globalmente la notificación de conflicto solo tiene que
// llegar al profesional afectado"* — el que tiene la ficha duplicada
// esperando resolución en SUS pacientes. El otro no ve ni el duplicado ni
// el conflicto. Y *"basta con que un profesional resuelva el conflicto
// para solucionar ambos"*.

// turnoDeLaFichaDePrueba — un turno de esa ficha, atendido por ese
// profesional. Directo en la base: lo que se prueba acá es quién VE el
// conflicto, no cómo nace el turno.
func turnoDeLaFichaDePrueba(
	t *testing.T, gdb *gorm.DB, clinicID, tipoID, pacienteID, atiende uuid.UUID, inicio time.Time,
) db.Turno {
	t.Helper()
	inicio = inicio.Truncate(time.Second)
	fin := inicio.Add(30 * time.Minute)
	turno := db.Turno{
		ClinicID: clinicID, AtendidoPorUserID: &atiende, PacienteID: &pacienteID,
		Estado: "agendado", TipoConsultaID: &tipoID, HoraInicio: &inicio, HoraFin: &fin,
		NombreContacto: "Bruno", ApellidoContacto: "Iglesias", DNIContacto: "30111222",
		TelefonoContacto: "+5493511234567", Origen: "pagina_publica",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno de prueba: %v", err)
	}
	return turno
}

// fichaDePrueba — una ficha de paciente, verificada o en conflicto.
func fichaDePrueba(t *testing.T, gdb *gorm.DB, clinicID uuid.UUID, dni, email string, enConflicto bool) db.Paciente {
	t.Helper()
	tel := "+5493511234567"
	origen := "manual"
	if enConflicto {
		origen = "pagina_publica"
	}
	p := db.Paciente{
		ClinicID: clinicID, Nombre: "Bruno", Apellido: "Iglesias", DNI: dni,
		Telefono: &tel, Email: &email, Origen: origen, EnConflicto: enConflicto,
	}
	if err := gdb.Create(&p).Error; err != nil {
		t.Fatalf("no se pudo crear la ficha de prueba: %v", err)
	}
	return p
}

func leerConflictos(t *testing.T, router http.Handler, token string) []conflictoPacienteResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes/conflictos", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /pacientes/conflictos: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var got []conflictoPacienteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return got
}

// TestConflicto_LoVeSoloElProfesionalConLaFichaDuplicada — el escenario
// textual del cliente: los dos ya atendieron al mismo paciente, el
// paciente saca turno con el profesional 1 usando otro mail. El conflicto
// le llega SOLO al 1, porque es a quien se le cargó la ficha duplicada.
func TestConflicto_LoVeSoloElProfesionalConLaFichaDuplicada(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular, clinicID, colegaID, tokenColega := clinicaConDosProfesionales(t, gdb, router, "conflicto-visib@example.com")
	tipoID := uuid.MustParse(leerMisTipos(t, router, titular.Token)[0].ID)
	titularID := ownerDePrueba(t, gdb, clinicID)

	// El paciente de siempre, atendido por los dos.
	verificado := fichaDePrueba(t, gdb, clinicID, "30111222", "bruno@example.com", false)
	turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, verificado.ID, titularID, time.Now().Add(-48*time.Hour))
	turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, verificado.ID, colegaID, time.Now().Add(-24*time.Hour))

	// Ahora vuelve con OTRO mail y saca turno con el COLEGA: la ficha
	// duplicada y su conflicto quedan del lado del colega.
	duplicada := fichaDePrueba(t, gdb, clinicID, "30111222", "otro@example.com", true)
	turnoDelColega := turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, duplicada.ID, colegaID, time.Now().Add(72*time.Hour))
	conflicto := db.ConflictoPaciente{
		ClinicID: clinicID, PacienteVerificadoID: verificado.ID, PacienteEnConflictoID: duplicada.ID,
		TurnoEnConflictoID: turnoDelColega.ID, Motivo: "se registró con un mail distinto",
	}
	if err := gdb.Create(&conflicto).Error; err != nil {
		t.Fatalf("no se pudo crear el conflicto: %v", err)
	}

	if vistos := leerConflictos(t, router, tokenColega); len(vistos) != 1 || vistos[0].ID != conflicto.ID.String() {
		t.Errorf("el colega ve %d conflictos, esperaba el suyo", len(vistos))
	}
	// El titular atiende al mismo paciente, pero la ficha duplicada no es
	// suya: no le aparece nada que resolver.
	if vistos := leerConflictos(t, router, titular.Token); len(vistos) != 0 {
		t.Errorf("al titular le llegó un conflicto de una ficha que no tiene: %+v", vistos)
	}

	// Y la otra mitad de la regla: si el paciente saca turno con el
	// TITULAR usando ese mismo mail nuevo, la ficha duplicada pasa a estar
	// también en sus pacientes — y entonces sí ve el conflicto, aunque el
	// ticket lo haya originado un turno del colega.
	//
	// Es lo que la visibilidad vieja no podía expresar: salía del turno
	// que originó el ticket, así que al titular le quedaba un paciente en
	// conflicto y ningún lugar donde resolverlo.
	turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, duplicada.ID, titularID, time.Now().Add(96*time.Hour))
	if vistos := leerConflictos(t, router, titular.Token); len(vistos) != 1 {
		t.Errorf("el titular tiene la ficha duplicada entre sus pacientes y ve %d conflictos, esperaba 1", len(vistos))
	}
}

// TestConflicto_ResolverUnoCierraLosDeLaMismaFicha — "basta con que un
// profesional resuelva el conflicto para solucionar ambos".
//
// No es una comodidad: las dos resoluciones BORRAN la ficha duplicada, así
// que un ticket hermano pendiente quedaría apuntando a una ficha que ya no
// existe — visible, imposible de resolver, y bloqueando asistencias.
func TestConflicto_ResolverUnoCierraLosDeLaMismaFicha(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular, clinicID, colegaID, tokenColega := clinicaConDosProfesionales(t, gdb, router, "conflicto-cierre@example.com")
	tipoID := uuid.MustParse(leerMisTipos(t, router, titular.Token)[0].ID)
	titularID := ownerDePrueba(t, gdb, clinicID)

	verificado := fichaDePrueba(t, gdb, clinicID, "30111222", "bruno@example.com", false)
	turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, verificado.ID, titularID, time.Now().Add(-48*time.Hour))

	// La MISMA ficha duplicada con turno con los dos: dos tickets, uno
	// por profesional.
	duplicada := fichaDePrueba(t, gdb, clinicID, "30111222", "otro@example.com", true)
	turnoTitular := turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, duplicada.ID, titularID, time.Now().Add(72*time.Hour))
	turnoColega := turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, duplicada.ID, colegaID, time.Now().Add(96*time.Hour))
	del := func(turnoID uuid.UUID) db.ConflictoPaciente {
		c := db.ConflictoPaciente{
			ClinicID: clinicID, PacienteVerificadoID: verificado.ID, PacienteEnConflictoID: duplicada.ID,
			TurnoEnConflictoID: turnoID, Motivo: "se registró con un mail distinto",
		}
		if err := gdb.Create(&c).Error; err != nil {
			t.Fatalf("no se pudo crear el conflicto: %v", err)
		}
		return c
	}
	delTitular := del(turnoTitular.ID)
	delColega := del(turnoColega.ID)

	// Los dos lo ven: los dos tienen la ficha duplicada entre sus
	// pacientes.
	if vistos := leerConflictos(t, router, titular.Token); len(vistos) == 0 {
		t.Fatal("el titular no ve el conflicto de una ficha duplicada que sí tiene")
	}
	if vistos := leerConflictos(t, router, tokenColega); len(vistos) == 0 {
		t.Fatal("el colega no ve el conflicto de una ficha duplicada que sí tiene")
	}

	// El colega resuelve el suyo: "es la misma persona".
	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+delColega.ID.String()+"/resolver",
		tokenColega, resolverConflictoPacienteRequest{EsVerificado: true})
	if rec.Code != http.StatusOK {
		t.Fatalf("resolver: status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Y el del titular queda cerrado también: la identidad se decidió
	// para toda la clínica.
	var recargado db.ConflictoPaciente
	if err := gdb.First(&recargado, "id = ?", delTitular.ID).Error; err != nil {
		t.Fatalf("no se encontró el conflicto del titular: %v", err)
	}
	if !recargado.Resuelto {
		t.Error("el conflicto del titular quedó pendiente sobre una ficha que ya se borró")
	}
	if vistos := leerConflictos(t, router, titular.Token); len(vistos) != 0 {
		t.Errorf("al titular le sigue apareciendo un conflicto ya resuelto: %+v", vistos)
	}

	// Y el mail que traía la ficha duplicada quedó en la que prevalece —
	// como PRINCIPAL desde 2026-09-23 — que es lo que corta el ciclo: el
	// próximo pedido con ese mail la reconoce en vez de abrir otro
	// conflicto.
	if email, _ := principalesDeLaFicha(t, gdb, verificado.ID); email != "otro@example.com" {
		t.Errorf("el mail de la ficha duplicada no quedó como principal de la ficha real (principal=%q)", email)
	}
}

// TestConflicto_ResolverUnoCierraLosDelMismoMail — el bug que el cliente
// reportó probándolo: "al resolver el conflicto con un profesional... el
// mail ya fue cargado al paciente, cuando me voy a la vista del otro
// profesional me sigue saliendo el conflicto".
//
// Cerrar los tickets de la MISMA ficha duplicada no alcanzaba: cada pedido
// público crea su PROPIA ficha duplicada (crearOBuscarPacientePorDNI
// saltea las que están `en_conflicto`), así que el mismo paciente con el
// mismo mail nuevo deja DOS fichas distintas y DOS tickets. El criterio
// que los une es el MAIL — textual del cliente: "SOLO SI el conflicto es
// del mismo mail".
func TestConflicto_ResolverUnoCierraLosDelMismoMail(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular, clinicID, colegaID, tokenColega := clinicaConDosProfesionales(t, gdb, router, "conflicto-mail@example.com")
	tipoID := uuid.MustParse(leerMisTipos(t, router, titular.Token)[0].ID)
	titularID := ownerDePrueba(t, gdb, clinicID)

	verificado := fichaDePrueba(t, gdb, clinicID, "30111222", "bruno@example.com", false)
	turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, verificado.ID, titularID, time.Now().Add(-48*time.Hour))

	// DOS fichas duplicadas distintas, con EL MISMO mail nuevo: una por
	// cada profesional con el que pidió turno. Es lo que pasa de verdad.
	const mailNuevo = "bruno.nuevo@example.com"
	dupTitular := fichaDePrueba(t, gdb, clinicID, "30111222", mailNuevo, true)
	dupColega := fichaDePrueba(t, gdb, clinicID, "30111222", mailNuevo, true)
	turnoDelTitular := turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, dupTitular.ID, titularID, time.Now().Add(72*time.Hour))
	turnoDelColega := turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, dupColega.ID, colegaID, time.Now().Add(96*time.Hour))
	crear := func(dupID, turnoID uuid.UUID) db.ConflictoPaciente {
		c := db.ConflictoPaciente{
			ClinicID: clinicID, PacienteVerificadoID: verificado.ID, PacienteEnConflictoID: dupID,
			TurnoEnConflictoID: turnoID, Motivo: "se registró con un mail distinto",
		}
		if err := gdb.Create(&c).Error; err != nil {
			t.Fatalf("no se pudo crear el conflicto: %v", err)
		}
		return c
	}
	delTitular := crear(dupTitular.ID, turnoDelTitular.ID)
	delColega := crear(dupColega.ID, turnoDelColega.ID)

	// Una ficha duplicada de la MISMA persona pero con OTRO mail: esa es
	// otra pregunta y NO se tiene que cerrar de rebote.
	dupOtroMail := fichaDePrueba(t, gdb, clinicID, "30111222", "impostor@example.com", true)
	turnoOtroMail := turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, dupOtroMail.ID, colegaID, time.Now().Add(120*time.Hour))
	delOtroMail := crear(dupOtroMail.ID, turnoOtroMail.ID)

	// El colega resuelve el suyo: "es la misma persona".
	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/conflictos/"+delColega.ID.String()+"/resolver",
		tokenColega, resolverConflictoPacienteRequest{EsVerificado: true})
	if rec.Code != http.StatusOK {
		t.Fatalf("resolver: status=%d body=%s", rec.Code, rec.Body.String())
	}

	resuelto := func(id uuid.UUID) bool {
		var c db.ConflictoPaciente
		if err := gdb.First(&c, "id = ?", id).Error; err != nil {
			t.Fatalf("no se encontró el conflicto %s: %v", id, err)
		}
		return c.Resuelto
	}
	if !resuelto(delTitular.ID) {
		t.Error("el conflicto del titular quedó pendiente: mismo paciente, mismo mail, ya se decidió")
	}
	if resuelto(delOtroMail.ID) {
		t.Error("se cerró un conflicto de OTRO mail: esa es una pregunta distinta y la tiene que contestar quien la recibió")
	}
	// Y al titular no le queda nada de ese mail para resolver.
	for _, c := range leerConflictos(t, router, titular.Token) {
		if c.ID == delTitular.ID.String() {
			t.Error("al titular le sigue apareciendo el conflicto que el colega ya resolvió")
		}
	}

	// La ficha duplicada del titular se fue con la fusión, no quedó
	// colgada en sus pacientes.
	var quedan int64
	gdb.Model(&db.Paciente{}).Where("id = ?", dupTitular.ID).Count(&quedan)
	if quedan != 0 {
		t.Error("la ficha duplicada del titular sigue viva después de resolverse su conflicto")
	}
}

// TestConflicto_ElContadorDiceLoMismoQueLaPantalla — bug reportado por el
// cliente: "cuando resuelvo todos los conflictos (tengo 0) en las otras
// pestañas ahora me aparece 'tenés 1 conflicto'".
//
// `resuelto = false` no alcanzaba para saber si un ticket sigue abierto.
// Resolver un conflicto BORRA la ficha duplicada, y desde que una
// resolución arrastra a sus hermanos por mail puede quedar un ticket
// apuntando a una ficha que ya no existe: la pantalla de Pacientes no lo
// mostraba —no tiene ficha que pintar— pero el contador lo contaba.
func TestConflicto_ElContadorDiceLoMismoQueLaPantalla(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular, clinicID, _, _ := clinicaConDosProfesionales(t, gdb, router, "conflicto-contador@example.com")
	tipoID := uuid.MustParse(leerMisTipos(t, router, titular.Token)[0].ID)
	titularID := ownerDePrueba(t, gdb, clinicID)

	verificado := fichaDePrueba(t, gdb, clinicID, "30111222", "bruno@example.com", false)
	turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, verificado.ID, titularID, time.Now().Add(-48*time.Hour))
	duplicada := fichaDePrueba(t, gdb, clinicID, "30111222", "otro@example.com", true)
	turnoDup := turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, duplicada.ID, titularID, time.Now().Add(72*time.Hour))
	conflicto := db.ConflictoPaciente{
		ClinicID: clinicID, PacienteVerificadoID: verificado.ID, PacienteEnConflictoID: duplicada.ID,
		TurnoEnConflictoID: turnoDup.ID, Motivo: "se registró con un mail distinto",
	}
	if err := gdb.Create(&conflicto).Error; err != nil {
		t.Fatalf("no se pudo crear el conflicto: %v", err)
	}

	contar := func() int64 {
		rec := doJSONAuth(t, router, http.MethodGet, "/panel/notificaciones", titular.Token, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET /panel/notificaciones: status=%d body=%s", rec.Code, rec.Body.String())
		}
		var got panelNotificacionesResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("respuesta inválida: %v", err)
		}
		return got.ConflictosPacientes
	}

	if n := contar(); n != 1 {
		t.Fatalf("el contador dice %d, esperaba 1 con un conflicto abierto", n)
	}

	// La ficha duplicada desaparece sin que se cierre el ticket: es lo que
	// deja atrás una resolución que alcanzó a un hermano.
	if err := gdb.Model(&db.Turno{}).Where("paciente_id = ?", duplicada.ID).Update("paciente_id", nil).Error; err != nil {
		t.Fatalf("no se pudo desvincular el turno: %v", err)
	}
	if err := gdb.Delete(&db.Paciente{}, "id = ?", duplicada.ID).Error; err != nil {
		t.Fatalf("no se pudo borrar la ficha duplicada: %v", err)
	}

	if n := contar(); n != 0 {
		t.Errorf("el contador dice %d sobre un ticket sin ficha: avisa de algo que no se puede ni ver ni resolver", n)
	}
	if vistos := leerConflictos(t, router, titular.Token); len(vistos) != 0 {
		t.Errorf("la pantalla lista %d conflictos sin ficha: %+v", len(vistos), vistos)
	}
}

// TestPaciente_NoQuedaEnDosSillonesAunqueTengaFichasDuplicadas — el caso
// que el cliente encontró probando: el mismo paciente terminó con dos
// turnos a la misma hora con dos profesionales.
//
// Cada pedido con un mail nuevo le crea su PROPIA ficha duplicada, y la
// regla miraba los turnos de UNA ficha: la del turno que se estaba
// creando. Los de las otras fichas de la misma persona no contaban, así
// que no veía nada con qué chocar. Recién se notó al resolver los
// conflictos, que junta todos los turnos en la ficha real.
func TestPaciente_NoQuedaEnDosSillonesAunqueTengaFichasDuplicadas(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular, clinicID, colegaID, _ := clinicaConDosProfesionales(t, gdb, router, "dos-fichas@example.com")
	tipoID := uuid.MustParse(leerMisTipos(t, router, titular.Token)[0].ID)
	titularID := ownerDePrueba(t, gdb, clinicID)

	// Una ficha con un turno del COLEGA, y otra ficha del MISMO DNI —la
	// duplicada que dejó un conflicto sin resolver—.
	unaFicha := fichaDePrueba(t, gdb, clinicID, "30111222", "bruno@example.com", false)
	otraFicha := fichaDePrueba(t, gdb, clinicID, "30111222", "otro@example.com", true)
	ocupado := time.Now().Add(72 * time.Hour).Truncate(time.Hour)
	turnoDeLaFichaDePrueba(t, gdb, clinicID, tipoID, unaFicha.ID, colegaID, ocupado)

	// Y ahora el titular le carga un turno encimado, vinculado a la OTRA
	// ficha. Es la misma persona: el mismo DNI.
	choca, quien := turnoSuperpuestoDeOtroProfesional(
		gdb, clinicID, otraFicha.ID, titularID,
		ocupado.Add(10*time.Minute), ocupado.Add(40*time.Minute), nil,
	)
	if choca == nil {
		t.Fatal("no detectó el solapamiento: las dos fichas son la misma persona (mismo DNI)")
	}
	if quien == "" {
		t.Error("el aviso no dice con qué profesional choca")
	}

	// Y la otra dirección: sin encimarse, no choca.
	if sin, _ := turnoSuperpuestoDeOtroProfesional(
		gdb, clinicID, otraFicha.ID, titularID,
		ocupado.Add(2*time.Hour), ocupado.Add(3*time.Hour), nil,
	); sin != nil {
		t.Error("rechazó un horario que no se encima con nada")
	}
}
