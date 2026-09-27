package http

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/push"
	"dental-mirage/api/internal/ratelimit"
	"dental-mirage/api/internal/security"
	"dental-mirage/api/internal/testdb"
)

// Notificaciones por cuenta (TR-179).

// enviadorPushDePrueba — un servicio de push de mentira: guarda lo que le
// mandan, y responde lo que se le diga por endpoint.
type enviadorPushDePrueba struct {
	mu       sync.Mutex
	enviados []push.Mensaje
	destinos []string
	vencidas map[string]bool
	listo    chan struct{}
}

func (e *enviadorPushDePrueba) ClavePublica() string { return "clave-publica-de-prueba" }

func (e *enviadorPushDePrueba) Enviar(_ context.Context, s push.Suscripcion, m push.Mensaje) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.enviados = append(e.enviados, m)
	e.destinos = append(e.destinos, s.Endpoint)
	if e.listo != nil {
		e.listo <- struct{}{}
	}
	if e.vencidas[s.Endpoint] {
		return push.ErrSuscripcionVencida
	}
	return nil
}

type entornoNotificaciones struct {
	router http.Handler
	gdb    *gorm.DB
	mail   *capturingMailSender
	push   *enviadorPushDePrueba
}

func nuevoEntornoNotificaciones(t *testing.T) entornoNotificaciones {
	t.Helper()
	gdb := testdb.New(t)
	mail := newCapturingMailSender()
	enviador := &enviadorPushDePrueba{listo: make(chan struct{}, 16)}
	router := NewRouterWithDeps(gdb, AuthDeps{
		Mail:           mail,
		Push:           enviador,
		AccountLimiter: &ratelimit.AccountLimiter{DB: gdb},
		AppBaseURL:     "http://localhost:3000",
		StateSecret:    "un-secret-de-test",
	}, []string{"http://localhost:3000"})
	return entornoNotificaciones{router: router, gdb: gdb, mail: mail, push: enviador}
}

func bandejaDe(t *testing.T, router http.Handler, token, estado string) listaNotificacionesResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/me/notificaciones?estado="+estado, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /me/notificaciones: %d %s", rec.Code, rec.Body.String())
	}
	var out listaNotificacionesResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func turnosNuevosDe(t *testing.T, router http.Handler, token string) []notificacionResponse {
	t.Helper()
	var out []notificacionResponse
	for _, n := range bandejaDe(t, router, token, "nuevas").Notificaciones {
		if n.Tipo == db.NotificacionTurnoNuevo {
			out = append(out, n)
		}
	}
	return out
}

// sumarRecepcionista — una cuenta de recepción que acepta la invitación
// de la clínica del titular.
func sumarRecepcionista(t *testing.T, e entornoNotificaciones, tokenTitular, email string) string {
	t.Helper()
	token := invitadoDePrueba(t, e.router, e.gdb, email, db.PerfilTipoActividades)
	aceptarInvitacionDePrueba(t, e.router, tokenTitular, token, email, db.RoleRecepcion)
	return token
}

func aceptarInvitacionDePrueba(t *testing.T, router http.Handler, tokenTitular, tokenInvitado, email, rol string) {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", tokenTitular, invitarColaboradorRequest{Rol: rol, Email: email})
	if rec.Code != http.StatusCreated {
		t.Fatalf("invitar: %d %s", rec.Code, rec.Body.String())
	}
	pendientes := invitacionesDe(t, router, tokenInvitado)
	if len(pendientes) == 0 {
		t.Fatal("la invitación no llegó")
	}
	rec = doJSONAuth(t, router, http.MethodPost, "/me/invitaciones/"+pendientes[len(pendientes)-1].ID+"/aceptar", tokenInvitado, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("aceptar: %d %s", rec.Code, rec.Body.String())
	}
}

func sacarTurnoPublico(t *testing.T, e entornoNotificaciones, slug, hora string) solicitarTurnoPublicoResponse {
	t.Helper()
	token := verificarEmailDePrueba(t, e.router, e.mail, slug, "bruno@example.com")
	rec := doJSON(t, e.router, http.MethodPost, "/clinicas/"+slug+"/turnos",
		solicitudDePrueba(nombreTipoSembrado, fechaDePruebaDisponibilidad, hora, token))
	if rec.Code != http.StatusCreated {
		t.Fatalf("turno público: %d %s", rec.Code, rec.Body.String())
	}
	var out solicitarTurnoPublicoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return out
}

// Toda cuenta nace con su bienvenida.
func TestBandeja_BienvenidaAlCrearLaCuenta(t *testing.T) {
	e := nuevoEntornoNotificaciones(t)
	reg, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "bienvenida@example.com")

	bandeja := bandejaDe(t, e.router, reg.Token, "nuevas")
	if bandeja.Nuevas != 1 || len(bandeja.Notificaciones) != 1 || bandeja.Notificaciones[0].Tipo != db.NotificacionBienvenida {
		t.Fatalf("bandeja = %+v, esperaba solo la bienvenida", bandeja)
	}
}

func TestBandeja_BienvenidaConGoogle(t *testing.T) {
	router, gdb := newTestRouterWithGoogle(t, fakeGoogleExchanger{sub: "google-bienvenida", email: "google.bienvenida@example.com", emailVerified: true})
	stateRec := doJSON(t, router, http.MethodGet, "/auth/google/state", nil)
	var stateResp googleStateResponse
	_ = json.Unmarshal(stateRec.Body.Bytes(), &stateResp)
	if rec := doJSON(t, router, http.MethodPost, "/auth/google", googleRequest{Code: "c", State: stateResp.State}); rec.Code != http.StatusOK {
		t.Fatalf("google: %d %s", rec.Code, rec.Body.String())
	}
	var user db.User
	gdb.First(&user, "email = ?", "google.bienvenida@example.com")
	var n int64
	gdb.Model(&db.Notificacion{}).Where("user_id = ? AND tipo = ?", user.ID, db.NotificacionBienvenida).Count(&n)
	if n != 1 {
		t.Errorf("bienvenidas = %d, esperaba 1", n)
	}
}

// Un turno que entra por la página: al profesional que lo atiende y a
// recepción, cada uno en su bandeja, con los datos del turno.
func TestBandeja_TurnoPublicoAvisaAlProfesionalYARecepcion(t *testing.T) {
	e := nuevoEntornoNotificaciones(t)
	reg, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-titular@example.com")
	recepcion := sumarRecepcionista(t, e, reg.Token, "notif-recepcion@example.com")

	turno := sacarTurnoPublico(t, e, reg.Profesional.Slug, "10:00")

	delProfesional := turnosNuevosDe(t, e.router, reg.Token)
	if len(delProfesional) != 1 {
		t.Fatalf("notificaciones del profesional = %d, esperaba 1", len(delProfesional))
	}
	n := delProfesional[0]
	if n.TurnoID == nil || *n.TurnoID != turno.ID || n.ClinicaID == nil || *n.ClinicaID != reg.Profesional.ID {
		t.Errorf("la notificación no apunta al turno y la clínica: %+v", n)
	}
	d := n.Datos
	if d.PacienteNombre != "Bruno Iglesias" || d.TipoConsulta != nombreTipoSembrado || d.ClinicaNombre == "" || d.ParaRecepcion {
		t.Errorf("datos = %+v", d)
	}
	if !strings.HasPrefix(d.HoraInicio, fechaDePruebaDisponibilidad+"T10:00:00-03:00") {
		t.Errorf("horaInicio = %q, esperaba el turno en hora de Córdoba", d.HoraInicio)
	}

	deRecepcion := turnosNuevosDe(t, e.router, recepcion)
	if len(deRecepcion) != 1 || !deRecepcion[0].Datos.ParaRecepcion || deRecepcion[0].Datos.ProfesionalNombre == "" {
		t.Fatalf("recepción: %+v, esperaba su copia con el nombre del profesional", deRecepcion)
	}
	if deRecepcion[0].ID == n.ID {
		t.Error("recepción y el profesional comparten la misma fila: 'leída' tiene que ser de cada uno")
	}
}

// Solo los que entran por la página o el link: lo que se carga desde el
// panel ya lo sabe quien lo cargó.
func TestBandeja_TurnoDelPanelNoAvisa(t *testing.T) {
	e := nuevoEntornoNotificaciones(t)
	reg, tipoID := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-panel@example.com")
	rec := doJSONAuth(t, e.router, http.MethodPost, "/turnos", reg.Token, map[string]any{
		"nombreContacto": "Ana", "apellidoContacto": "Díaz", "dniContacto": "33111222",
		"telefonoContacto": "+5493511234567", "emailContacto": "ana@example.com",
		"tipoConsultaId": tipoID, "horaInicio": fechaDePruebaDisponibilidad + "T11:00:00-03:00",
		"horaFin": fechaDePruebaDisponibilidad + "T11:30:00-03:00",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("turno del panel: %d %s", rec.Code, rec.Body.String())
	}
	if n := turnosNuevosDe(t, e.router, reg.Token); len(n) != 0 {
		t.Errorf("un turno cargado desde el panel generó %d notificaciones", len(n))
	}
}

func TestBandeja_TurnoPorEnlaceLoDice(t *testing.T) {
	e := nuevoEntornoNotificaciones(t)
	reg, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-enlace@example.com")
	enlace := crearEnlaceTurnoDePrueba(t, e.router, reg.Token)
	req := solicitudDePrueba(nombreTipoSembrado, fechaDePruebaDisponibilidad, "09:00", "")
	req.EnlaceToken = enlace
	if rec := doJSON(t, e.router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req); rec.Code != http.StatusCreated {
		t.Fatalf("turno por enlace: %d %s", rec.Code, rec.Body.String())
	}
	n := turnosNuevosDe(t, e.router, reg.Token)
	if len(n) != 1 || !n[0].Datos.PorEnlace {
		t.Errorf("notificaciones = %+v, esperaba una marcada PorEnlace", n)
	}
}

// La bandeja es de cada cuenta: la de otro no se ve, no se lee ni se abre.
func TestBandeja_CadaCuentaVeSoloLaSuya(t *testing.T) {
	e := nuevoEntornoNotificaciones(t)
	uno, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-uno@example.com")
	otro, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-otro@example.com")
	sacarTurnoPublico(t, e, uno.Profesional.Slug, "10:00")

	ajena := turnosNuevosDe(t, e.router, uno.Token)[0]
	if n := turnosNuevosDe(t, e.router, otro.Token); len(n) != 0 {
		t.Fatalf("la otra cuenta ve %d notificaciones ajenas", len(n))
	}
	for _, accion := range []string{"leer", "abrir"} {
		rec := doJSONAuth(t, e.router, http.MethodPost, "/me/notificaciones/"+ajena.ID+"/"+accion, otro.Token, nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s una notificación ajena: status %d, esperaba 404", accion, rec.Code)
		}
	}
	var sigue db.Notificacion
	e.gdb.First(&sigue, "id = ?", ajena.ID)
	if sigue.LeidaEn != nil {
		t.Error("otra cuenta marcó como leída una notificación ajena")
	}
}

// Leer: pasa de Nuevas a Leídas, el contador baja, y leerla otra vez no
// cambia la fecha.
func TestBandeja_LeerPasaALeidas(t *testing.T) {
	e := nuevoEntornoNotificaciones(t)
	reg, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-leer@example.com")
	bienvenida := bandejaDe(t, e.router, reg.Token, "nuevas").Notificaciones[0]

	contador := func() int64 {
		rec := doJSONAuth(t, e.router, http.MethodGet, "/me/notificaciones/contador", reg.Token, nil)
		var out map[string]int64
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return out["nuevas"]
	}
	if contador() != 1 {
		t.Fatalf("contador = %d, esperaba 1", contador())
	}

	rec := doJSONAuth(t, e.router, http.MethodPost, "/me/notificaciones/"+bienvenida.ID+"/leer", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("leer: %d %s", rec.Code, rec.Body.String())
	}
	var primera notificacionResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &primera)

	if contador() != 0 {
		t.Errorf("después de leer, contador = %d", contador())
	}
	leidas := bandejaDe(t, e.router, reg.Token, "leidas")
	if leidas.Leidas != 1 || len(leidas.Notificaciones) != 1 || leidas.Notificaciones[0].ID != bienvenida.ID {
		t.Errorf("leídas = %+v", leidas)
	}

	time.Sleep(10 * time.Millisecond)
	rec = doJSONAuth(t, e.router, http.MethodPost, "/me/notificaciones/"+bienvenida.ID+"/leer", reg.Token, nil)
	var segunda notificacionResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &segunda)
	if segunda.LeidaEn == nil || primera.LeidaEn == nil || *segunda.LeidaEn != *primera.LeidaEn {
		t.Errorf("volver a leer cambió la fecha: %v → %v", primera.LeidaEn, segunda.LeidaEn)
	}
}

// Abrir desde otra clínica: la sesión queda en la clínica del turno, y
// recepción, en la agenda del profesional que lo atiende.
func TestBandeja_AbrirDejaLaSesionDondeSeVeElTurno(t *testing.T) {
	e := nuevoEntornoNotificaciones(t)
	titularA, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-clinica-a@example.com")
	// Titular de OTRA clínica, que además hace recepción en la A.
	titularB, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-clinica-b@example.com")
	aceptarInvitacionDePrueba(t, e.router, titularA.Token, titularB.Token, "notif-clinica-b@example.com", db.RoleRecepcion)

	turno := sacarTurnoPublico(t, e, titularA.Profesional.Slug, "10:00")
	n := turnosNuevosDe(t, e.router, titularB.Token)
	if len(n) != 1 {
		t.Fatalf("recepción de la clínica A: %d notificaciones", len(n))
	}

	// Su sesión está parada en la clínica B (la propia).
	sesion := sesionDelToken(t, e.gdb, titularB.Token)
	idB := uuid.MustParse(titularB.Profesional.ID)
	if err := e.gdb.Model(&db.Session{}).Where("id = ?", sesion.ID).Update("clinic_id", idB).Error; err != nil {
		t.Fatal(err)
	}

	rec := doJSONAuth(t, e.router, http.MethodPost, "/me/notificaciones/"+n[0].ID+"/abrir", titularB.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("abrir: %d %s", rec.Code, rec.Body.String())
	}
	var out abrirNotificacionResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if !out.CambioDeClinica || out.TurnoID != turno.ID || out.EstadoTurno != "agendado" || out.Fecha != fechaDePruebaDisponibilidad || out.SinAcceso {
		t.Fatalf("abrir = %+v", out)
	}

	sesion = sesionDelToken(t, e.gdb, titularB.Token)
	if sesion.ClinicID == nil || sesion.ClinicID.String() != titularA.Profesional.ID {
		t.Errorf("la sesión quedó en la clínica %v, esperaba la del turno", sesion.ClinicID)
	}
	var titularAUser db.User
	e.gdb.First(&titularAUser, "email = ?", "notif-clinica-a@example.com")
	if sesion.ViendoUserID == nil || *sesion.ViendoUserID != titularAUser.ID {
		t.Errorf("recepción quedó mirando %v, esperaba la agenda del profesional del turno", sesion.ViendoUserID)
	}
	if bandejaDe(t, e.router, titularB.Token, "leidas").Leidas < 1 {
		t.Error("abrir no marcó la notificación como leída")
	}
}

// El turno se reprogramó: abrir lleva al día NUEVO, no al de la foto.
func TestBandeja_AbrirUsaElTurnoDeHoy(t *testing.T) {
	e := nuevoEntornoNotificaciones(t)
	reg, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-reprog@example.com")
	turno := sacarTurnoPublico(t, e, reg.Profesional.Slug, "10:00")
	nueva := time.Date(2030, 7, 1, 10, 0, 0, 0, time.FixedZone("ART", -3*3600))
	fin := nueva.Add(30 * time.Minute)
	e.gdb.Model(&db.Turno{}).Where("id = ?", turno.ID).Updates(map[string]any{"hora_inicio": nueva, "hora_fin": fin})

	n := turnosNuevosDe(t, e.router, reg.Token)[0]
	rec := doJSONAuth(t, e.router, http.MethodPost, "/me/notificaciones/"+n.ID+"/abrir", reg.Token, nil)
	var out abrirNotificacionResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out.Fecha != "2030-07-01" {
		t.Errorf("fecha = %q, esperaba el día del turno reprogramado", out.Fecha)
	}
}

// Si ya no trabaja en esa clínica, abrir lo dice y no toca la sesión.
func TestBandeja_AbrirSinAccesoALaClinica(t *testing.T) {
	e := nuevoEntornoNotificaciones(t)
	reg, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-baja@example.com")
	recepcion := sumarRecepcionista(t, e, reg.Token, "notif-baja-recepcion@example.com")
	sacarTurnoPublico(t, e, reg.Profesional.Slug, "10:00")
	n := turnosNuevosDe(t, e.router, recepcion)[0]

	var user db.User
	e.gdb.First(&user, "email = ?", "notif-baja-recepcion@example.com")
	e.gdb.Model(&db.ClinicMember{}).Where("user_id = ?", user.ID).Update("status", db.ClinicMemberStatusRemoved)

	rec := doJSONAuth(t, e.router, http.MethodPost, "/me/notificaciones/"+n.ID+"/abrir", recepcion, nil)
	var out abrirNotificacionResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if rec.Code != http.StatusOK || !out.SinAcceso || out.CambioDeClinica {
		t.Errorf("abrir sin acceso = %d %+v", rec.Code, out)
	}
}

// Avisos al celular: se activan por dispositivo, y un turno nuevo le
// avisa a cada navegador de las cuentas notificadas.
func TestBandeja_AvisoPushAlSacarTurno(t *testing.T) {
	e := nuevoEntornoNotificaciones(t)
	reg, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-push@example.com")

	rec := doJSONAuth(t, e.router, http.MethodGet, "/me/push", reg.Token, nil)
	var config configuracionPushResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &config)
	if config.ClavePublica != "clave-publica-de-prueba" {
		t.Fatalf("clave pública = %q", config.ClavePublica)
	}

	sub := map[string]any{"endpoint": "https://push.example.com/abc", "keys": map[string]string{"p256dh": "BPk", "auth": "au"}}
	if rec := doJSONAuth(t, e.router, http.MethodPost, "/me/push/suscripciones", reg.Token, sub); rec.Code != http.StatusCreated {
		t.Fatalf("suscribir: %d %s", rec.Code, rec.Body.String())
	}

	sacarTurnoPublico(t, e, reg.Profesional.Slug, "10:00")
	select {
	case <-e.push.listo:
	case <-time.After(5 * time.Second):
		t.Fatal("no salió ningún aviso")
	}
	e.push.mu.Lock()
	defer e.push.mu.Unlock()
	m := e.push.enviados[0]
	if !strings.HasPrefix(m.Titulo, "Turno nuevo") || !strings.Contains(m.Titulo, "10:00") ||
		!strings.Contains(m.Cuerpo, "Bruno Iglesias") || !strings.HasPrefix(m.URL, "/notificaciones/") {
		t.Errorf("aviso = %+v", m)
	}
}

func TestBandeja_SuscripcionPushValidaYPorDispositivo(t *testing.T) {
	e := nuevoEntornoNotificaciones(t)
	uno, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-disp-uno@example.com")
	otro, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-disp-otro@example.com")

	invalida := map[string]any{"endpoint": "http://10.0.0.1/interno", "keys": map[string]string{"p256dh": "a", "auth": "b"}}
	if rec := doJSONAuth(t, e.router, http.MethodPost, "/me/push/suscripciones", uno.Token, invalida); rec.Code != http.StatusBadRequest {
		t.Errorf("un endpoint http: %d, esperaba 400", rec.Code)
	}

	sub := map[string]any{"endpoint": "https://push.example.com/compartido", "keys": map[string]string{"p256dh": "a", "auth": "b"}}
	doJSONAuth(t, e.router, http.MethodPost, "/me/push/suscripciones", uno.Token, sub)
	// El mismo navegador, con otra cuenta: pasa a ser de la otra.
	doJSONAuth(t, e.router, http.MethodPost, "/me/push/suscripciones", otro.Token, sub)
	var filas []db.PushSuscripcion
	e.gdb.Where("endpoint = ?", "https://push.example.com/compartido").Find(&filas)
	if len(filas) != 1 {
		t.Fatalf("filas del mismo endpoint = %d, esperaba 1", len(filas))
	}
	var otroUser db.User
	e.gdb.First(&otroUser, "email = ?", "notif-disp-otro@example.com")
	if filas[0].UserID != otroUser.ID {
		t.Error("el navegador compartido sigue avisándole a la cuenta anterior")
	}

	// Desactivar solo borra la propia.
	borrar := map[string]string{"endpoint": "https://push.example.com/compartido"}
	doJSONAuth(t, e.router, http.MethodDelete, "/me/push/suscripciones", uno.Token, borrar)
	var quedan int64
	e.gdb.Model(&db.PushSuscripcion{}).Where("endpoint = ?", "https://push.example.com/compartido").Count(&quedan)
	if quedan != 1 {
		t.Error("una cuenta borró la suscripción de otra")
	}
	if rec := doJSONAuth(t, e.router, http.MethodDelete, "/me/push/suscripciones", otro.Token, borrar); rec.Code != http.StatusNoContent {
		t.Errorf("desactivar: %d", rec.Code)
	}
	e.gdb.Model(&db.PushSuscripcion{}).Where("endpoint = ?", "https://push.example.com/compartido").Count(&quedan)
	if quedan != 0 {
		t.Error("desactivar no borró la suscripción")
	}
}

// Un navegador que el servicio de push da por muerto se borra.
func TestBandeja_SuscripcionVencidaSeBorra(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "notif-vencida@example.com")
	var user db.User
	gdb.First(&user, "email = ?", "notif-vencida@example.com")
	gdb.Create(&db.PushSuscripcion{UserID: user.ID, Endpoint: "https://push.example.com/muerta", P256dh: "a", Auth: "b"})
	gdb.Create(&db.PushSuscripcion{UserID: user.ID, Endpoint: "https://push.example.com/viva", P256dh: "a", Auth: "b"})
	_ = reg

	enviador := &enviadorPushDePrueba{vencidas: map[string]bool{"https://push.example.com/muerta": true}}
	enviarAvisos(context.Background(), gdb, enviador, []avisoPush{
		{suscripcion: push.Suscripcion{Endpoint: "https://push.example.com/muerta"}},
		{suscripcion: push.Suscripcion{Endpoint: "https://push.example.com/viva"}},
	})
	var quedan []db.PushSuscripcion
	gdb.Where("user_id = ?", user.ID).Find(&quedan)
	if len(quedan) != 1 || quedan[0].Endpoint != "https://push.example.com/viva" {
		t.Errorf("quedan %+v, esperaba solo la viva", quedan)
	}
}

// El detector de abuso borra turnos: sus notificaciones se van con ellos.
func TestBandeja_TurnoBorradoPorAbusoSeLlevaSuNotificacion(t *testing.T) {
	e := nuevoEntornoNotificaciones(t)
	reg, _ := profesionalConTipoConsulta(t, e.gdb, e.router, "notif-abuso@example.com")
	turno := sacarTurnoPublico(t, e, reg.Profesional.Slug, "10:00")

	var fila db.Turno
	e.gdb.First(&fila, "id = ?", turno.ID)
	if _, _, err := borrarTurnosYPacientesOrfanados(e.gdb, []db.Turno{fila}); err != nil {
		t.Fatal(err)
	}
	var quedan int64
	e.gdb.Model(&db.Notificacion{}).Where("turno_id = ?", turno.ID).Count(&quedan)
	if quedan != 0 {
		t.Errorf("quedaron %d notificaciones de un turno borrado por abuso", quedan)
	}
}

// sesionDelToken — la fila de sessions de un token de prueba.
func sesionDelToken(t *testing.T, gdb *gorm.DB, token string) db.Session {
	t.Helper()
	var s db.Session
	if err := gdb.Where("token_hash = ?", security.HashToken(token)).First(&s).Error; err != nil {
		t.Fatalf("sesión: %v", err)
	}
	return s
}
