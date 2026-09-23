package http

import (
	"encoding/json"
	"net/http"
	"reflect"
	"testing"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// Contactos principales y alternativos en la ficha (2026-09-23).
//
// PATCH /pacientes/{id} recibe el estado COMPLETO de los contactos: el
// principal y la lista de alternativos del paciente, y por cada tutor su
// mail, su teléfono principal y sus teléfonos alternativos. La pantalla
// edita, quita y promueve en memoria, y guarda de una vez.

type fichaDeContactos struct {
	router   http.Handler
	gdb      *gorm.DB
	token    string
	paciente db.Paciente
}

// fichaConAlternativos — un paciente con mail y teléfono principales y dos
// alternativos de cada uno.
func fichaConAlternativos(t *testing.T, email string) fichaDeContactos {
	t.Helper()
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: email, Password: "unaClaveLarga123", Nombre: "Con", NombreClinica: "Clínica " + email,
	})
	clinicID := clinicaDePrueba(t, reg.Profesional.ID)
	duenio := userIDDelMail(t, gdb, email)

	tel, mailP := "+5493511000001", "principal@example.com"
	p := db.Paciente{
		ClinicID: clinicID, Nombre: "Ana", Apellido: "Pérez", DNI: "33000111",
		Telefono: &tel, Email: &mailP, Origen: "manual", CreadoPorUserID: &duenio,
	}
	if err := gdb.Create(&p).Error; err != nil {
		t.Fatalf("no se pudo crear el paciente: %v", err)
	}
	for _, e := range []string{"viejo1@example.com", "viejo2@example.com"} {
		if err := gdb.Create(&db.PacienteEmailAlternativo{PacienteID: p.ID, Email: e}).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, tt := range []string{"+5493511000002", "+5493511000003"} {
		if err := gdb.Create(&db.PacienteTelefonoAlternativo{PacienteID: p.ID, Telefono: tt}).Error; err != nil {
			t.Fatal(err)
		}
	}
	return fichaDeContactos{router, gdb, reg.Token, p}
}

func (f fichaDeContactos) editar(t *testing.T, body map[string]any) (int, pacienteResponse, string) {
	t.Helper()
	rec := doJSONAuth(t, f.router, http.MethodPatch, "/pacientes/"+f.paciente.ID.String(), f.token, body)
	var out pacienteResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out, rec.Body.String()
}

func TestContactosPaciente_PromoverUnAlternativoAPrincipal(t *testing.T) {
	f := fichaConAlternativos(t, "contactos-promover@example.com")

	// "viejo1" pasa a principal; el principal de antes baja a la lista.
	code, got, body := f.editar(t, map[string]any{
		"dni": "33000111", "telefono": "+5493511000001",
		"email":              "viejo1@example.com",
		"emailsAlternativos": []string{"principal@example.com", "viejo2@example.com"},
	})
	if code != http.StatusOK {
		t.Fatalf("status=%d body=%s", code, body)
	}
	if got.Email == nil || *got.Email != "viejo1@example.com" {
		t.Errorf("principal = %v, esperaba viejo1@example.com", got.Email)
	}
	if !reflect.DeepEqual(got.EmailsAlternativos, []string{"principal@example.com", "viejo2@example.com"}) {
		t.Errorf("alternativos = %v", got.EmailsAlternativos)
	}
	// Los teléfonos no vinieron: no se tocan. Es lo que mantiene
	// compatible a quien manda solo DNI, teléfono y mail.
	if !reflect.DeepEqual(got.TelefonosAlternativos, []string{"+5493511000002", "+5493511000003"}) {
		t.Errorf("los teléfonos alternativos se tocaron sin venir en el pedido: %v", got.TelefonosAlternativos)
	}
}

func TestContactosPaciente_EditarYQuitarAlternativos(t *testing.T) {
	f := fichaConAlternativos(t, "contactos-editar@example.com")

	code, got, body := f.editar(t, map[string]any{
		"dni": "33000111", "telefono": "+5493511000001", "email": "principal@example.com",
		// uno editado, el otro quitado
		"telefonosAlternativos": []string{"+5493511999999"},
	})
	if code != http.StatusOK {
		t.Fatalf("status=%d body=%s", code, body)
	}
	if !reflect.DeepEqual(got.TelefonosAlternativos, []string{"+5493511999999"}) {
		t.Errorf("alternativos = %v, esperaba solo el editado", got.TelefonosAlternativos)
	}

	// Y la lista vacía los borra todos.
	code, got, body = f.editar(t, map[string]any{
		"dni": "33000111", "telefono": "+5493511000001", "email": "principal@example.com",
		"telefonosAlternativos": []string{},
	})
	if code != http.StatusOK {
		t.Fatalf("status=%d body=%s", code, body)
	}
	if len(got.TelefonosAlternativos) != 0 {
		t.Errorf("la lista vacía tenía que borrarlos todos: %v", got.TelefonosAlternativos)
	}
}

// Sin vacíos, sin repetidos y sin el principal: un alternativo igual al
// principal no es "otro" mail.
func TestContactosPaciente_LosAlternativosSeNormalizan(t *testing.T) {
	f := fichaConAlternativos(t, "contactos-normalizar@example.com")

	code, got, body := f.editar(t, map[string]any{
		"dni": "33000111", "telefono": "+5493511000001", "email": "principal@example.com",
		"emailsAlternativos": []string{"  OTRO@example.com ", "", "otro@example.com", "PRINCIPAL@example.com"},
	})
	if code != http.StatusOK {
		t.Fatalf("status=%d body=%s", code, body)
	}
	if !reflect.DeepEqual(got.EmailsAlternativos, []string{"otro@example.com"}) {
		t.Errorf("alternativos = %v, esperaba solo otro@example.com", got.EmailsAlternativos)
	}
}

func TestContactosPaciente_Validaciones(t *testing.T) {
	f := fichaConAlternativos(t, "contactos-validar@example.com")

	casos := []struct {
		nombre string
		body   map[string]any
	}{
		{"alternativo con formato inválido", map[string]any{
			"dni": "33000111", "telefono": "+5493511000001", "email": "principal@example.com",
			"emailsAlternativos": []string{"no-es-un-mail"},
		}},
		{"sin tutor, el mail es obligatorio", map[string]any{
			"dni": "33000111", "telefono": "+5493511000001", "email": "",
		}},
		{"sin tutor, el teléfono es obligatorio", map[string]any{
			"dni": "33000111", "telefono": "", "email": "principal@example.com",
		}},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			if code, _, body := f.editar(t, c.body); code != http.StatusBadRequest {
				t.Errorf("status=%d, esperaba 400. body=%s", code, body)
			}
		})
	}
}

// fichaConTutor — un paciente SIN mail ni teléfono propios (con tutor son
// opcionales) y un tutor con un teléfono alternativo.
func fichaConTutor(t *testing.T, email string) (fichaDeContactos, db.PacienteTutor) {
	t.Helper()
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: email, Password: "unaClaveLarga123", Nombre: "Con", NombreClinica: "Clínica " + email,
	})
	clinicID := clinicaDePrueba(t, reg.Profesional.ID)
	duenio := userIDDelMail(t, gdb, email)

	p := db.Paciente{
		ClinicID: clinicID, Nombre: "Juanito", Apellido: "Pérez", DNI: "44000111",
		Origen: "manual", CreadoPorUserID: &duenio,
	}
	if err := gdb.Create(&p).Error; err != nil {
		t.Fatal(err)
	}
	tutor := db.PacienteTutor{PacienteID: p.ID, Relacion: "familiar", Nombre: "María", Telefono: "+5493512000001", Email: "mama@example.com"}
	if err := gdb.Create(&tutor).Error; err != nil {
		t.Fatal(err)
	}
	if err := gdb.Create(&db.PacienteTutorTelefonoAlternativo{PacienteTutorID: tutor.ID, Telefono: "+5493512000002"}).Error; err != nil {
		t.Fatal(err)
	}
	return fichaDeContactos{router, gdb, reg.Token, p}, tutor
}

// Con tutor, el paciente puede no tener mail ni teléfono propios — la
// misma regla que el alta. Hasta el 2026-09-23 este PATCH exigía el
// teléfono siempre, y editar a este paciente fallaba.
func TestContactosPaciente_ConTutorMailYTelefonoPropiosSonOpcionales(t *testing.T) {
	f, _ := fichaConTutor(t, "contactos-contutor@example.com")

	code, _, body := f.editar(t, map[string]any{"dni": "44000111", "telefono": "", "email": ""})
	if code != http.StatusOK {
		t.Fatalf("status=%d, esperaba 200. body=%s", code, body)
	}
}

func TestContactosPaciente_EditarAlTutor(t *testing.T) {
	f, tutor := fichaConTutor(t, "contactos-tutor@example.com")

	// Corrige el mail, y promueve el teléfono alternativo a principal.
	code, got, body := f.editar(t, map[string]any{
		"dni": "44000111", "telefono": "", "email": "",
		"tutores": []map[string]any{{
			"id": tutor.ID.String(), "email": "mama-nuevo@example.com",
			"telefono": "+5493512000002", "telefonosAlternativos": []string{"+5493512000001"},
		}},
	})
	if code != http.StatusOK {
		t.Fatalf("status=%d body=%s", code, body)
	}
	if len(got.Tutores) != 1 {
		t.Fatalf("tutores = %+v", got.Tutores)
	}
	tt := got.Tutores[0]
	if tt.ID != tutor.ID.String() || tt.Email != "mama-nuevo@example.com" || tt.Telefono != "+5493512000002" {
		t.Errorf("tutor = %+v", tt)
	}
	if !reflect.DeepEqual(tt.TelefonosAlternativos, []string{"+5493512000001"}) {
		t.Errorf("teléfonos alternativos del tutor = %v", tt.TelefonosAlternativos)
	}
}

// Un id de tutor de OTRA ficha no existe para este pedido: se busca junto
// con el paciente que ya pasó por soloMisPacientes.
func TestContactosPaciente_UnTutorDeOtraFichaNoSeEdita(t *testing.T) {
	f, _ := fichaConTutor(t, "contactos-tutor-ajeno@example.com")

	// Otra ficha de la misma clínica, con su propio tutor.
	otra := db.Paciente{ClinicID: f.paciente.ClinicID, Nombre: "Otro", Apellido: "X", DNI: "44000222", Origen: "manual"}
	if err := f.gdb.Create(&otra).Error; err != nil {
		t.Fatal(err)
	}
	ajeno := db.PacienteTutor{PacienteID: otra.ID, Relacion: "familiar", Nombre: "Ajeno", Telefono: "+5493513000001", Email: "ajeno@example.com"}
	if err := f.gdb.Create(&ajeno).Error; err != nil {
		t.Fatal(err)
	}

	code, _, body := f.editar(t, map[string]any{
		"dni": "44000111", "telefono": "", "email": "",
		"tutores": []map[string]any{{"id": ajeno.ID.String(), "email": "robado@example.com", "telefono": "+5493513000009"}},
	})
	if code != http.StatusNotFound {
		t.Fatalf("status=%d, esperaba 404. body=%s", code, body)
	}
	var sigue db.PacienteTutor
	f.gdb.First(&sigue, "id = ?", ajeno.ID)
	if sigue.Email != "ajeno@example.com" {
		t.Errorf("el tutor de la otra ficha cambió: %+v", sigue)
	}
}

// El mail es la identidad del tutor: dos tutores del mismo paciente no
// pueden compartirlo. Tiene que ser un 409 legible, no un 500.
func TestContactosPaciente_DosTutoresConElMismoMailEs409(t *testing.T) {
	f, tutor := fichaConTutor(t, "contactos-tutor-dup@example.com")
	papa := db.PacienteTutor{PacienteID: f.paciente.ID, Relacion: "familiar", Nombre: "Pedro", Telefono: "+5493512000009", Email: "papa@example.com"}
	if err := f.gdb.Create(&papa).Error; err != nil {
		t.Fatal(err)
	}

	code, _, body := f.editar(t, map[string]any{
		"dni": "44000111", "telefono": "", "email": "",
		"tutores": []map[string]any{{"id": papa.ID.String(), "email": tutor.Email, "telefono": "+5493512000009"}},
	})
	if code != http.StatusConflict {
		t.Fatalf("status=%d, esperaba 409. body=%s", code, body)
	}
}

// Todo o nada: si falla la parte de los tutores, no queda guardada la del
// paciente.
func TestContactosPaciente_SiFallaUnaParteNoSeGuardaNada(t *testing.T) {
	f, _ := fichaConTutor(t, "contactos-atomico@example.com")

	code, _, _ := f.editar(t, map[string]any{
		"dni": "44000999", "telefono": "", "email": "",
		"tutores": []map[string]any{{"id": uuid.NewString(), "email": "x@example.com", "telefono": "+5493512000009"}},
	})
	if code != http.StatusNotFound {
		t.Fatalf("status=%d, esperaba 404", code)
	}
	var p db.Paciente
	f.gdb.First(&p, "id = ?", f.paciente.ID)
	if p.DNI != "44000111" {
		t.Errorf("el DNI se guardó aunque el pedido falló: %s", p.DNI)
	}
}
