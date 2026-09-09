package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
)

// Tests de la paginación de los listados del panel — Fase B de la
// auditoría. Ver paginacion.go para el diseño (opt-in, "Cargar más").

// httpRequestConQuery — helper para probar paginacionDeRequest sin montar
// un router entero.
func httpRequestConQuery(t *testing.T, url string) *http.Request {
	t.Helper()
	return httptest.NewRequest(http.MethodGet, url, nil)
}

// TestPaginacion_SinLimitDevuelveTodo — la garantía de compatibilidad: sin
// `limit`, el endpoint se comporta EXACTAMENTE como antes. Es lo que
// mantiene intacto al calendario, que pide un rango de fechas y necesita
// verlo completo — paginarlo en silencio le escondería turnos.
func TestPaginacion_SinLimitDevuelveTodo(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pag-sinlimit@example.com")
	for i := 0; i < 5; i++ {
		crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, time.Now().Add(time.Duration(24+i)*time.Hour))
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d", rec.Code, http.StatusOK)
	}
	var turnos []turnoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &turnos); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(turnos) != 5 {
		t.Errorf("devolvió %d turnos, esperaba los 5 (sin limit no se pagina)", len(turnos))
	}
	if rec.Header().Get(headerTotal) != "" {
		t.Errorf("%s presente sin paginar — solo debería aparecer cuando se pide una página", headerTotal)
	}
}

// TestPaginacion_ConLimitDevuelveLaPaginaYElTotal — el caso de uso de
// "Cargar más": la primera tanda, más el total para saber si queda algo.
func TestPaginacion_ConLimitDevuelveLaPaginaYElTotal(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pag-conlimit@example.com")
	for i := 0; i < 5; i++ {
		crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, time.Now().Add(time.Duration(24+i)*time.Hour))
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos?limit=2", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d", rec.Code, http.StatusOK)
	}
	var turnos []turnoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &turnos); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(turnos) != 2 {
		t.Errorf("devolvió %d turnos, esperaba 2", len(turnos))
	}
	// El total cuenta TODO lo que matchea los filtros, no la página.
	if got := rec.Header().Get(headerTotal); got != "5" {
		t.Errorf("%s = %q, esperaba 5", headerTotal, got)
	}
}

// TestPaginacion_OffsetTraeLaSiguienteTandaSinRepetir — que "Cargar más"
// no muestre dos veces lo mismo ni saltee filas.
func TestPaginacion_OffsetTraeLaSiguienteTandaSinRepetir(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pag-offset@example.com")
	for i := 0; i < 5; i++ {
		crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, time.Now().Add(time.Duration(24+i)*time.Hour))
	}

	leerPagina := func(qs string) []turnoResponse {
		t.Helper()
		rec := doJSONAuth(t, router, http.MethodGet, "/turnos?"+qs, reg.Token, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d para %q", rec.Code, qs)
		}
		var out []turnoResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatalf("JSON inválido para %q: %v", qs, err)
		}
		return out
	}

	primera := leerPagina("limit=2&offset=0")
	segunda := leerPagina("limit=2&offset=2")
	tercera := leerPagina("limit=2&offset=4")

	if len(primera) != 2 || len(segunda) != 2 || len(tercera) != 1 {
		t.Fatalf("tamaños = %d/%d/%d, esperaba 2/2/1", len(primera), len(segunda), len(tercera))
	}

	vistos := map[string]bool{}
	for _, pagina := range [][]turnoResponse{primera, segunda, tercera} {
		for _, tr := range pagina {
			if vistos[tr.ID] {
				t.Errorf("el turno %s apareció en más de una página", tr.ID)
			}
			vistos[tr.ID] = true
		}
	}
	if len(vistos) != 5 {
		t.Errorf("se vieron %d turnos distintos entre las 3 páginas, esperaba 5", len(vistos))
	}
}

// TestPaginacion_LimitAbusivoSeRecorta — el techo defensivo: el punto de
// paginar es que NINGUNA consulta pueda pedir la tabla entera, así que un
// limit gigante se recorta en silencio en vez de obedecerse.
func TestPaginacion_LimitAbusivoSeRecorta(t *testing.T) {
	r := httpRequestConQuery(t, "/turnos?limit=999999")
	limit, _, aplicar := paginacionDeRequest(r)
	if !aplicar {
		t.Fatal("esperaba que se aplicara la paginación")
	}
	if limit != paginacionLimiteMax {
		t.Errorf("limit = %d, esperaba que se recortara a %d", limit, paginacionLimiteMax)
	}
}

// TestPaginacion_ValoresInvalidosNoPaginanNiRompen — un `limit` no
// numérico o negativo es un cliente mal escrito, no algo que deba tumbar
// una pantalla del panel: se ignora y se devuelve todo, como sin paginar.
func TestPaginacion_ValoresInvalidosNoPaginanNiRompen(t *testing.T) {
	for _, qs := range []string{"limit=abc", "limit=-5", "limit=0"} {
		r := httpRequestConQuery(t, "/turnos?"+qs)
		if _, _, aplicar := paginacionDeRequest(r); aplicar {
			t.Errorf("%q activó la paginación, esperaba que se ignorara", qs)
		}
	}
}

// TestPaginacion_OffsetInvalidoSeTrataComoCero
func TestPaginacion_OffsetInvalidoSeTrataComoCero(t *testing.T) {
	for _, qs := range []string{"limit=10&offset=abc", "limit=10&offset=-3"} {
		r := httpRequestConQuery(t, "/turnos?"+qs)
		_, offset, aplicar := paginacionDeRequest(r)
		if !aplicar {
			t.Fatalf("%q: esperaba que se aplicara la paginación", qs)
		}
		if offset != 0 {
			t.Errorf("%q: offset = %d, esperaba 0", qs, offset)
		}
	}
}

// TestPaginacion_PacientesTambienPagina — el otro listado que crece sin
// techo.
func TestPaginacion_PacientesTambienPagina(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "pag-pacientes@example.com")

	// Fichas creadas directo, sin turno: para probar el LISTADO no hace
	// falta que estén verificadas, y crearPacienteVerificadoDePrueba les
	// arma un turno resuelto con hora casi idéntica — cuatro seguidos
	// chocan contra el exclusion constraint de no-solapamiento.
	profID := uuid.MustParse(reg.Profesional.ID)
	for i := 0; i < 4; i++ {
		telefono := "+549351123456" + strconv.Itoa(i)
		p := db.Paciente{
			ProfesionalID: profID,
			Nombre:        "Paciente" + strconv.Itoa(i),
			Apellido:      "Paginado",
			DNI:           "4055" + strconv.Itoa(1000+i),
			Telefono:      &telefono,
		}
		if err := gdb.Create(&p).Error; err != nil {
			t.Fatalf("no se pudo crear el paciente %d: %v", i, err)
		}
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes?limit=2", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var pacientes []pacienteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &pacientes); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(pacientes) != 2 {
		t.Errorf("devolvió %d pacientes, esperaba 2", len(pacientes))
	}
	if got := rec.Header().Get(headerTotal); got != "4" {
		t.Errorf("%s = %q, esperaba 4", headerTotal, got)
	}
}

// TestPaginacion_ElTotalRespetaLosFiltros — el total tiene que ser el de
// la consulta filtrada, no el de la tabla entera: si no, "Cargar más"
// seguiría ofreciendo filas que no existen para ese filtro.
func TestPaginacion_ElTotalRespetaLosFiltros(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pag-filtros@example.com")
	for i := 0; i < 3; i++ {
		crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, time.Now().Add(time.Duration(24+i)*time.Hour))
	}
	cancelado := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, time.Now().Add(100*time.Hour))
	if err := gdb.Model(&cancelado).Update("estado", "cancelada").Error; err != nil {
		t.Fatalf("no se pudo cancelar: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos?estado=agendado&limit=1", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d", rec.Code, http.StatusOK)
	}
	if got := rec.Header().Get(headerTotal); got != "3" {
		t.Errorf("%s = %q, esperaba 3 (los agendados, sin contar el cancelado)", headerTotal, got)
	}
}

// TestPaginacion_PacientesFiltroVerificacion — el filtro que bajó del
// navegador al backend junto con la paginación: las pestañas
// Todos/Verificados/Sin verificar de /panel/pacientes se resolvían
// filtrando en JS la lista COMPLETA de fichas. Con tandas parciales eso
// mostraría cualquier cosa, así que ahora filtra el endpoint — mismo
// parámetro y misma subquery que ya usaba /turnos.
//
// El caso importante es el de "sin_verificar" con CERO verificados: es el
// que rompía con un `NOT IN` armado sobre un slice Go vacío (ver el
// comentario de pacientesVerificadosQuery), devolviendo 0 filas en vez de
// todas.
func TestPaginacion_PacientesFiltroVerificacion(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "pag-verif@example.com")
	profID := uuid.MustParse(reg.Profesional.ID)

	// origen=manual ya alcanza para que una ficha cuente como verificada
	// (pacienteEstaVerificado) — no hace falta armarle un turno asistido.
	crear := func(dni, origen string) {
		t.Helper()
		telefono := "+54935112399" + dni[len(dni)-2:]
		p := db.Paciente{ProfesionalID: profID, Nombre: "Ver" + dni, Apellido: "Ificado", DNI: dni, Telefono: &telefono, Origen: origen}
		if err := gdb.Create(&p).Error; err != nil {
			t.Fatalf("no se pudo crear el paciente %s: %v", dni, err)
		}
	}
	crear("40990001", "manual")
	crear("40990002", "pagina_publica")
	crear("40990003", "pagina_publica")

	totalDe := func(qs string) string {
		t.Helper()
		rec := doJSONAuth(t, router, http.MethodGet, "/pacientes?limit=1&"+qs, reg.Token, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d para %q. body=%s", rec.Code, qs, rec.Body.String())
		}
		return rec.Header().Get(headerTotal)
	}

	if got := totalDe("verificacion=verificado"); got != "1" {
		t.Errorf("verificados = %q, esperaba 1", got)
	}
	if got := totalDe("verificacion=sin_verificar"); got != "2" {
		t.Errorf("sin verificar = %q, esperaba 2", got)
	}
	if got := totalDe(""); got != "3" {
		t.Errorf("sin filtro = %q, esperaba 3", got)
	}

	// Un valor inventado no puede pasar en silencio como "sin filtro" —
	// devolvería la lista entera haciéndole creer a la UI que filtró.
	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes?verificacion=cualquiera", reg.Token, nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d para verificacion inválida, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

// TestPaginacion_PacientesSinVerificadosDevuelveTodos — el caso límite
// del `NOT IN (NULL)`, aislado: una clínica recién arrancada, sin una
// sola ficha verificada, tiene que ver TODAS sus fichas bajo "Sin
// verificar".
func TestPaginacion_PacientesSinVerificadosDevuelveTodos(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "pag-noverif@example.com")
	profID := uuid.MustParse(reg.Profesional.ID)
	for i := 0; i < 2; i++ {
		telefono := "+549351129900" + strconv.Itoa(i)
		p := db.Paciente{ProfesionalID: profID, Nombre: "Nadie" + strconv.Itoa(i), Apellido: "Verificado", DNI: "4098000" + strconv.Itoa(i), Telefono: &telefono, Origen: "pagina_publica"}
		if err := gdb.Create(&p).Error; err != nil {
			t.Fatalf("no se pudo crear el paciente %d: %v", i, err)
		}
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes?verificacion=sin_verificar&limit=10", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var pacientes []pacienteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &pacientes); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(pacientes) != 2 {
		t.Errorf("devolvió %d pacientes, esperaba las 2 fichas sin verificar", len(pacientes))
	}
}
