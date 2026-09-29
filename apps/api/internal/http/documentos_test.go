package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/documentos"
)

// Documentos clínicos (Fase 5.1): el circuito entero contra la base real —
// crear, completar, terminar, firmar en el dispositivo y sellar— y quién
// puede ver qué (TR-186).

const plantillaConducto = "consentimiento-tratamiento-conducto"

// plantillaHistoriaDePrueba — el circuito de firma electrónica y sellado
// lo prueba una historia clínica de prueba: el consentimiento de conducto
// con otro tipo. Los consentimientos se firman en papel (TR-188) y todavía
// no hay una historia clínica real cargada (llegan en la 5.6).
const plantillaHistoriaDePrueba = "historia-de-prueba"

func init() {
	conducto, ok := documentos.Ultima(plantillaConducto)
	if !ok {
		panic("falta la plantilla de conducto")
	}
	historia := *conducto
	historia.ID = plantillaHistoriaDePrueba
	historia.Nombre = "Historia de prueba"
	historia.Tipo = "historia_clinica"
	if err := documentos.RegistrarPlantillaDePrueba(historia); err != nil {
		panic(err)
	}
}

type escenarioDocs struct {
	router    http.Handler
	gdb       *gorm.DB
	clinicID  uuid.UUID
	token     string
	titularID uuid.UUID
	paciente  db.Paciente
}

func escenarioDeDocumentos(t *testing.T, sufijo string) escenarioDocs {
	t.Helper()
	router, gdb := newTestRouter(t)
	email := "doc-titular-" + sufijo + "@example.com"
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: email, Password: "unaClaveLarga123", Nombre: "Lucía Gómez", NombreClinica: "Clínica " + sufijo,
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	titularID := userIDDelMail(t, gdb, email)
	nacimiento := time.Date(1984, 3, 7, 0, 0, 0, 0, time.UTC)
	paciente := db.Paciente{
		ClinicID: clinicID, Nombre: "Ana", Apellido: "Paz", DNI: "30111222", Origen: "manual",
		CreadoPorUserID: &titularID, Domicilio: ptr("Av. Colón 1240"), FechaNacimiento: &nacimiento,
		Email: ptr("ana-" + sufijo + "@example.com"), Telefono: ptr("+5493511234567"),
	}
	if err := gdb.Create(&paciente).Error; err != nil {
		t.Fatalf("paciente: %v", err)
	}
	return escenarioDocs{router: router, gdb: gdb, clinicID: clinicID, token: titular.Token, titularID: titularID, paciente: paciente}
}

func decodificar[T any](t *testing.T, body []byte) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(body, &v); err != nil {
		t.Fatalf("respuesta inválida: %v — %s", err, body)
	}
	return v
}

// crear — un borrador de la historia clínica de prueba (la que se firma en
// el sistema). Para el consentimiento, que se firma en papel, crearDe.
func (e escenarioDocs) crear(t *testing.T, token string, pacienteID uuid.UUID) documentoDetalleResponse {
	t.Helper()
	return e.crearDe(t, token, plantillaHistoriaDePrueba, pacienteID)
}

func (e escenarioDocs) crearDe(t *testing.T, token, plantillaID string, pacienteID uuid.UUID) documentoDetalleResponse {
	t.Helper()
	rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", token, map[string]any{
		"plantillaId": plantillaID, "pacienteId": pacienteID.String(),
	})
	// 201 si es nuevo; 200 si retoma mi borrador del mismo documento.
	if rec.Code != http.StatusCreated && rec.Code != http.StatusOK {
		t.Fatalf("crear documento: status=%d body=%s", rec.Code, rec.Body.String())
	}
	return decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
}

func (e escenarioDocs) guardar(t *testing.T, token, id string, valores map[string]any) documentoDetalleResponse {
	t.Helper()
	rec := doJSONAuth(t, e.router, http.MethodPatch, "/documentos/"+id, token, map[string]any{"valores": valores})
	if rec.Code != http.StatusOK {
		t.Fatalf("guardar borrador: status=%d body=%s", rec.Code, rec.Body.String())
	}
	return decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
}

func (e escenarioDocs) terminar(t *testing.T, token, id string) documentoDetalleResponse {
	t.Helper()
	rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos/"+id+"/terminar", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("terminar: status=%d body=%s", rec.Code, rec.Body.String())
	}
	return decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
}

func trazoDePrueba() db.TrazoDeFirma {
	var puntos [][3]float64
	for i := 0; i < 15; i++ {
		puntos = append(puntos, [3]float64{float64(20 + i*10), 60 + float64(i%3), float64(i * 12)})
	}
	return db.TrazoDeFirma{Ancho: 320, Alto: 160, Trazos: [][][3]float64{puntos}}
}

func (e escenarioDocs) firmar(t *testing.T, token, id string, cuerpo map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	if _, tiene := cuerpo["trazo"]; !tiene {
		cuerpo["trazo"] = trazoDePrueba()
	}
	return doJSONAuth(t, e.router, http.MethodPost, "/documentos/"+id+"/firmas", token, cuerpo)
}

// completarYSellar — un documento de punta a punta, para los tests que
// necesitan uno sellado y no prueban el camino.
func (e escenarioDocs) completarYSellar(t *testing.T, token string, pacienteID uuid.UUID) documentoDetalleResponse {
	t.Helper()
	d := e.crear(t, token, pacienteID)
	valores := d.Valores
	valores["elementos"] = []string{"36"}
	if _, tiene := valores["suscribe_fecha_nacimiento"]; !tiene {
		valores["suscribe_fecha_nacimiento"] = "1990-01-01"
	}
	if _, tiene := valores["suscribe_domicilio"]; !tiene {
		valores["suscribe_domicilio"] = "Calle 1"
	}
	e.guardar(t, token, d.ID, valores)
	e.terminar(t, token, d.ID)
	if rec := e.firmar(t, token, d.ID, map[string]any{"rol": "paciente", "nombre": "Ana Paz", "dni": "30111222"}); rec.Code != http.StatusOK {
		t.Fatalf("firma del paciente: %d %s", rec.Code, rec.Body.String())
	}
	rec := e.firmar(t, token, d.ID, map[string]any{"rol": "profesional"})
	if rec.Code != http.StatusOK {
		t.Fatalf("firma del profesional: %d %s", rec.Code, rec.Body.String())
	}
	return decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
}

func TestDocumentos_CircuitoCompleto(t *testing.T) {
	e := escenarioDeDocumentos(t, "circuito")

	d := e.crear(t, e.token, e.paciente.ID)
	if d.Estado != db.DocumentoBorrador || d.Hoy == "" || !d.EsMio {
		t.Fatalf("un documento nuevo es un borrador mío: %+v", d.documentoResumenResponse)
	}
	// Lo que ya se sabe viene precargado: la ficha, el perfil, la clínica.
	for campo, esperado := range map[string]string{
		"lugar": "Córdoba", "suscribe_nombre": "Ana Paz", "suscribe_dni": "30111222",
		"suscribe_domicilio": "Av. Colón 1240", "suscribe_fecha_nacimiento": "1984-03-07",
		"profesional_nombre": "Lucía Gómez",
	} {
		if d.Valores[campo] != esperado {
			t.Errorf("precarga de %s: se esperaba %q, llegó %v", campo, esperado, d.Valores[campo])
		}
	}

	// Guardar: el nombre del profesional está bloqueado y no se puede
	// cambiar desde la pantalla.
	valores := d.Valores
	valores["elementos"] = []string{"37", "36"}
	valores["indicaciones"] = "Reposo."
	valores["profesional_nombre"] = "Otra persona"
	d = e.guardar(t, e.token, d.ID, valores)
	if d.Valores["profesional_nombre"] != "Lucía Gómez" {
		t.Fatalf("el campo bloqueado cambió: %v", d.Valores["profesional_nombre"])
	}

	d = e.terminar(t, e.token, d.ID)
	if d.Estado != db.DocumentoAFirmar || d.HashContenido == nil || len(d.Contenido) == 0 || d.Valores != nil {
		t.Fatalf("terminado: %+v", d)
	}
	contenido := decodificar[documentos.ContenidoCongelado](t, d.Contenido)
	textoCompleto, _ := json.Marshal(contenido.Cuerpo)
	if !strings.Contains(string(textoCompleto), "en el elemento N° 36, 37 propuesto por el/la Dr. Lucía Gómez") {
		t.Fatalf("el texto congelado no dice lo cargado: %s", textoCompleto)
	}
	if !strings.Contains(string(textoCompleto), `"texto":"No consigna"`) {
		t.Fatalf("un campo vacío dice «No consigna» en el documento terminado: %s", textoCompleto)
	}
	if contenido.Paciente.DNI != "30111222" || contenido.Profesional.Nombre != "Lucía" || contenido.Plantilla.Version != 1 {
		t.Fatalf("la foto del paciente y del profesional: %+v %+v", contenido.Paciente, contenido.Profesional)
	}
	if strings.Join(d.FirmasPendientes, ",") != "paciente,profesional" {
		t.Fatalf("firmas pendientes: %v", d.FirmasPendientes)
	}

	// No se edita más.
	rec := doJSONAuth(t, e.router, http.MethodPatch, "/documentos/"+d.ID, e.token, map[string]any{"valores": map[string]any{}})
	if rec.Code != http.StatusConflict {
		t.Fatalf("editar uno terminado: %d", rec.Code)
	}

	rec = e.firmar(t, e.token, d.ID, map[string]any{
		"rol": "paciente", "nombre": "  Marta   Paz ", "dni": "20333444", "enRepresentacion": true, "vinculo": "Madre",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("firma del paciente: %d %s", rec.Code, rec.Body.String())
	}
	d = decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if d.Estado != db.DocumentoAFirmar || strings.Join(d.FirmasPendientes, ",") != "profesional" {
		t.Fatalf("falta el profesional: %+v", d.FirmasPendientes)
	}
	if d.Firmas[0].Nombre != "Marta Paz" || !d.Firmas[0].EnRepresentacion || *d.Firmas[0].Vinculo != "Madre" || d.Firmas[0].Metodo != db.MetodoPresencial {
		t.Fatalf("la firma registrada: %+v", d.Firmas[0])
	}

	if rec := e.firmar(t, e.token, d.ID, map[string]any{"rol": "paciente", "nombre": "Ana Paz", "dni": "30111222"}); rec.Code != http.StatusConflict {
		t.Fatalf("firmar dos veces el mismo rol: %d", rec.Code)
	}

	// El profesional firma como sí mismo: lo que mande la pantalla no cuenta.
	rec = e.firmar(t, e.token, d.ID, map[string]any{"rol": "profesional", "nombre": "Otro", "dni": "11111111"})
	if rec.Code != http.StatusOK {
		t.Fatalf("firma del profesional: %d %s", rec.Code, rec.Body.String())
	}
	d = decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if d.Estado != db.DocumentoSellado || d.Folio == nil || *d.Folio != 1 || d.CadenaN == nil || *d.CadenaN != 1 || d.HashSello == nil || d.HashAnterior != nil {
		t.Fatalf("sellado: %+v", d)
	}
	if d.Firmas[1].Nombre != "Lucía Gómez" {
		t.Fatalf("el profesional firma con su nombre: %+v", d.Firmas[1])
	}

	// Lo que está guardado verifica: contenido, firmas y sello.
	var guardado db.DocumentoClinico
	e.gdb.First(&guardado, "id = ?", d.ID)
	var firmas []db.DocumentoFirma
	e.gdb.Where("documento_id = ?", d.ID).Find(&firmas)
	if err := documentos.Verificar(guardado, firmas, ""); err != nil {
		t.Fatalf("el documento sellado no verifica: %v", err)
	}

	// Sellado: nada más se puede hacer con él.
	for _, intento := range []struct{ metodo, ruta string }{
		{http.MethodPatch, "/documentos/" + d.ID},
		{http.MethodDelete, "/documentos/" + d.ID},
		{http.MethodPost, "/documentos/" + d.ID + "/terminar"},
	} {
		if rec := doJSONAuth(t, e.router, intento.metodo, intento.ruta, e.token, map[string]any{"valores": map[string]any{}}); rec.Code != http.StatusConflict {
			t.Errorf("%s %s sobre un sellado: %d", intento.metodo, intento.ruta, rec.Code)
		}
	}
	if rec := e.firmar(t, e.token, d.ID, map[string]any{"rol": "profesional"}); rec.Code != http.StatusConflict {
		t.Errorf("firmar un sellado: %d", rec.Code)
	}

	// El registro del paciente, la tabla del módulo y la ficha.
	rec = doJSONAuth(t, e.router, http.MethodGet, "/pacientes/"+e.paciente.ID.String()+"/documentos", e.token, nil)
	registro := decodificar[[]documentoResumenResponse](t, rec.Body.Bytes())
	if rec.Code != http.StatusOK || len(registro) != 1 || registro[0].PlantillaNombre != "Historia de prueba" || registro[0].AutorNombre != "Lucía Gómez" {
		t.Fatalf("registro del paciente: %d %+v", rec.Code, registro)
	}
	// La huella viaja en el resumen: la tabla del registro la muestra.
	if registro[0].HashContenido == nil || len(*registro[0].HashContenido) != 64 {
		t.Fatalf("el registro trae la huella del contenido: %+v", registro[0].HashContenido)
	}
	rec = doJSONAuth(t, e.router, http.MethodGet, "/documentos/pacientes", e.token, nil)
	tabla := decodificar[[]pacienteConDocumentosResponse](t, rec.Body.Bytes())
	if len(tabla) != 1 || tabla[0].DNI != "30111222" || tabla[0].Cantidad != 1 {
		t.Fatalf("pacientes con documentos: %+v", tabla)
	}
	rec = doJSONAuth(t, e.router, http.MethodGet, "/pacientes/"+e.paciente.ID.String(), e.token, nil)
	ficha := decodificar[pacienteDetalleResponse](t, rec.Body.Bytes())
	if ficha.DocumentosClinicos != 1 || ficha.Domicilio == nil || *ficha.FechaNacimiento != "1984-03-07" {
		t.Fatalf("la ficha: %+v", ficha)
	}

	// Abrirlo deja constancia; y la auditoría cuenta todo el camino.
	doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+d.ID, e.token, nil)
	var tipos []string
	e.gdb.Model(&db.DocumentoEvento{}).Where("documento_id = ?", d.ID).Order("created_at, tipo").Pluck("tipo", &tipos)
	unidos := strings.Join(tipos, ",")
	for _, esperado := range []string{"terminado", "firmado", "sellado", "visto"} {
		if !strings.Contains(unidos, esperado) {
			t.Errorf("falta el evento %q en la auditoría: %s", esperado, unidos)
		}
	}
}

func TestDocumentos_LaCadenaUneLosDocumentosDeLaClinica(t *testing.T) {
	e := escenarioDeDocumentos(t, "cadena")
	primero := e.completarYSellar(t, e.token, e.paciente.ID)

	otro := db.Paciente{ClinicID: e.clinicID, Nombre: "Juan", Apellido: "Sosa", DNI: "35111222", Origen: "manual", CreadoPorUserID: &e.titularID}
	e.gdb.Create(&otro)
	segundo := e.completarYSellar(t, e.token, otro.ID)
	tercero := e.completarYSellar(t, e.token, e.paciente.ID)

	if *segundo.CadenaN != 2 || *segundo.HashAnterior != *primero.HashSello || *segundo.Folio != 1 {
		t.Fatalf("el segundo sigue al primero, y es el primero de su paciente: %+v", segundo)
	}
	if *tercero.CadenaN != 3 || *tercero.HashAnterior != *segundo.HashSello || *tercero.Folio != 2 {
		t.Fatalf("el tercero es el folio 2 de Ana: %+v", tercero)
	}

	var docs []db.DocumentoClinico
	e.gdb.Where("clinic_id = ? AND cadena_n IS NOT NULL", e.clinicID).Order("cadena_n").Find(&docs)
	anterior := ""
	for _, d := range docs {
		var firmas []db.DocumentoFirma
		e.gdb.Where("documento_id = ?", d.ID).Find(&firmas)
		if err := documentos.Verificar(d, firmas, anterior); err != nil {
			t.Fatalf("eslabón %d: %v", *d.CadenaN, err)
		}
		anterior = *d.HashSello
	}
}

// Alterar un documento viejo por fuera de la app —con los triggers
// apagados, como podría hacerlo alguien con acceso de administrador a la
// base— rompe su sello y se detecta.
func TestDocumentos_UnaAlteracionPorFueraSeDetecta(t *testing.T) {
	e := escenarioDeDocumentos(t, "alteracion")
	d := e.completarYSellar(t, e.token, e.paciente.ID)

	if err := e.gdb.Exec("ALTER TABLE documentos_clinicos DISABLE TRIGGER trg_documentos_clinicos_candado").Error; err != nil {
		t.Skipf("no se pudo apagar el trigger (permisos): %v", err)
	}
	if err := e.gdb.Exec(`UPDATE documentos_clinicos SET contenido_canonico = replace(contenido_canonico, '36', '46') WHERE id = ?`, d.ID).Error; err != nil {
		t.Fatal(err)
	}
	if err := e.gdb.Exec("ALTER TABLE documentos_clinicos ENABLE TRIGGER trg_documentos_clinicos_candado").Error; err != nil {
		t.Fatal(err)
	}
	var alterado db.DocumentoClinico
	e.gdb.First(&alterado, "id = ?", d.ID)
	var firmas []db.DocumentoFirma
	e.gdb.Where("documento_id = ?", d.ID).Find(&firmas)
	if err := documentos.Verificar(alterado, firmas, ""); err == nil {
		t.Fatal("un documento alterado por fuera pasó la verificación")
	}
}

func TestDocumentos_ValidacionesDelBorradorYDeTerminar(t *testing.T) {
	e := escenarioDeDocumentos(t, "validacion")
	d := e.crear(t, e.token, e.paciente.ID)

	for nombre, valores := range map[string]map[string]any{
		"una pieza que no existe": {"elementos": []string{"99"}},
		"un campo que no existe":  {"inventado": "x"},
		"una fecha imposible":     {"proxima_consulta_fecha": "2026-02-30"},
	} {
		rec := doJSONAuth(t, e.router, http.MethodPatch, "/documentos/"+d.ID, e.token, map[string]any{"valores": valores})
		cuerpo := decodificar[struct {
			Errores []documentos.ErrorDeCampo `json:"errores"`
		}](t, rec.Body.Bytes())
		if rec.Code != http.StatusUnprocessableEntity || len(cuerpo.Errores) == 0 {
			t.Errorf("%s: %d %s", nombre, rec.Code, rec.Body.String())
		}
	}
	if rec := doJSONAuth(t, e.router, http.MethodPatch, "/documentos/"+d.ID, e.token, map[string]any{}); rec.Code != http.StatusBadRequest {
		t.Errorf("sin valores: %d", rec.Code)
	}

	// Sin las piezas no se puede terminar: el error dice cuál campo falta.
	rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos/"+d.ID+"/terminar", e.token, nil)
	cuerpo := decodificar[struct {
		Errores []documentos.ErrorDeCampo `json:"errores"`
	}](t, rec.Body.Bytes())
	if rec.Code != http.StatusUnprocessableEntity || len(cuerpo.Errores) != 1 || cuerpo.Errores[0].Campo != "elementos" {
		t.Fatalf("terminar sin piezas: %d %+v", rec.Code, cuerpo)
	}

	// Lo que no entra en su renglón del original no se sella (TR-187): el
	// borrador lo acepta —se está escribiendo—, terminar no.
	valores := d.Valores
	valores["elementos"] = []string{"36"}
	valores["suscribe_fecha_nacimiento"] = "1990-01-01"
	valores["suscribe_domicilio"] = "Calle 1"
	valores["indicaciones"] = strings.Repeat("Indicación muy larga que no entra en seis renglones. ", 60)
	e.guardar(t, e.token, d.ID, valores)
	rec = doJSONAuth(t, e.router, http.MethodPost, "/documentos/"+d.ID+"/terminar", e.token, nil)
	cuerpo = decodificar[struct {
		Errores []documentos.ErrorDeCampo `json:"errores"`
	}](t, rec.Body.Bytes())
	if rec.Code != http.StatusUnprocessableEntity || len(cuerpo.Errores) != 1 || cuerpo.Errores[0].Campo != "indicaciones" {
		t.Fatalf("terminar con indicaciones que no entran: %d %+v", rec.Code, cuerpo)
	}

	// Acortado, se termina, y el contenido congelado lleva la lámina
	// compuesta: es lo que dibujan la vista sellada y el PDF.
	valores["indicaciones"] = "Enjuagues con clorhexidina."
	e.guardar(t, e.token, d.ID, valores)
	terminado := e.terminar(t, e.token, d.ID)
	contenido := decodificar[struct {
		Lamina []documentos.ZonaCompuesta `json:"lamina"`
	}](t, terminado.Contenido)
	var indicaciones *documentos.ZonaCompuesta
	for i := range contenido.Lamina {
		if contenido.Lamina[i].Zona == "indicaciones" {
			indicaciones = &contenido.Lamina[i]
		}
	}
	if indicaciones == nil || len(indicaciones.Lineas) != 1 || indicaciones.Lineas[0].Texto != "Enjuagues con clorhexidina." {
		t.Fatalf("la lámina congelada: %+v", contenido.Lamina)
	}
}

func TestDocumentos_ValidacionesDeLaFirma(t *testing.T) {
	e := escenarioDeDocumentos(t, "firma")
	d := e.crear(t, e.token, e.paciente.ID)
	valores := d.Valores
	valores["elementos"] = []string{"11"}
	e.guardar(t, e.token, d.ID, valores)

	// Un borrador no se firma.
	if rec := e.firmar(t, e.token, d.ID, map[string]any{"rol": "paciente", "nombre": "Ana Paz", "dni": "30111222"}); rec.Code != http.StatusConflict {
		t.Fatalf("firmar un borrador: %d", rec.Code)
	}
	e.terminar(t, e.token, d.ID)

	corto := trazoDePrueba()
	corto.Trazos[0] = corto.Trazos[0][:2]
	for _, c := range []struct {
		nombre string
		cuerpo map[string]any
	}{
		{"un rol que el documento no lleva", map[string]any{"rol": "testigo_1", "nombre": "Ana Paz", "dni": "30111222"}},
		{"sin nombre", map[string]any{"rol": "paciente", "nombre": " ", "dni": "30111222"}},
		{"un DNI mal escrito", map[string]any{"rol": "paciente", "nombre": "Ana Paz", "dni": "30.111.222"}},
		{"un representante sin vínculo", map[string]any{"rol": "paciente", "nombre": "Ana Paz", "dni": "30111222", "enRepresentacion": true}},
		{"una firma de dos puntos", map[string]any{"rol": "paciente", "nombre": "Ana Paz", "dni": "30111222", "trazo": corto}},
	} {
		if rec := e.firmar(t, e.token, d.ID, c.cuerpo); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: se esperaba 400, llegó %d %s", c.nombre, rec.Code, rec.Body.String())
		}
	}

	// El profesional firma como sí mismo: un "representante" o un nombre
	// que mande la pantalla se ignoran.
	rec := e.firmar(t, e.token, d.ID, map[string]any{"rol": "profesional", "nombre": "Otro", "enRepresentacion": true, "vinculo": "x"})
	d = decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if rec.Code != http.StatusOK || d.Firmas[0].Nombre != "Lucía Gómez" || d.Firmas[0].EnRepresentacion {
		t.Fatalf("la firma del profesional: %d %+v", rec.Code, d.Firmas)
	}
}

// Terminado, un documento no se edita más (TR-188, pedido del cliente):
// no hay camino de vuelta a borrador. Si hay que corregir, se hace otro.
func TestDocumentos_UnDocumentoTerminadoNoSeEditaMas(t *testing.T) {
	e := escenarioDeDocumentos(t, "volver")
	d := e.crear(t, e.token, e.paciente.ID)
	valores := d.Valores
	valores["elementos"] = []string{"21"}
	e.guardar(t, e.token, d.ID, valores)
	e.terminar(t, e.token, d.ID)

	if rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos/"+d.ID+"/volver-a-editar", e.token, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("ya no hay forma de volver a editar: %d", rec.Code)
	}
	rec := doJSONAuth(t, e.router, http.MethodPatch, "/documentos/"+d.ID, e.token, map[string]any{"valores": valores})
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "no se puede editar") {
		t.Fatalf("guardar sobre uno terminado: %d %s", rec.Code, rec.Body.String())
	}
	// Otro del mismo documento para el mismo paciente sí se puede: es otra instancia.
	if otro := e.crear(t, e.token, e.paciente.ID); otro.ID == d.ID || otro.Retomado || otro.Estado != db.DocumentoBorrador {
		t.Fatalf("una instancia nueva: %+v", otro)
	}

	// En curso: lo mío que espera firmas y el borrador nuevo.
	rec = doJSONAuth(t, e.router, http.MethodGet, "/documentos/en-curso", e.token, nil)
	enCurso := decodificar[[]documentoResumenResponse](t, rec.Body.Bytes())
	if len(enCurso) != 2 || enCurso[1].Estado != db.DocumentoAFirmar || enCurso[1].Paciente.DNI != "30111222" {
		t.Fatalf("en curso: %+v", enCurso)
	}
}

// Un solo borrador de cada documento por paciente (pedido del cliente,
// 2026-09-29): si ya tengo uno, "Completar" me devuelve ese.
func TestDocumentos_UnSoloBorradorDelMismoDocumentoPorPaciente(t *testing.T) {
	e := escenarioDeDocumentos(t, "unico")
	primero := e.crearDe(t, e.token, plantillaConducto, e.paciente.ID)
	if primero.Retomado {
		t.Fatal("el primero es nuevo")
	}
	rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", e.token, map[string]any{
		"plantillaId": plantillaConducto, "pacienteId": e.paciente.ID.String(),
	})
	segundo := decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if rec.Code != http.StatusOK || segundo.ID != primero.ID || !segundo.Retomado || segundo.Valores == nil {
		t.Fatalf("el segundo retoma el borrador: %d %+v", rec.Code, segundo)
	}
	var borradores int64
	e.gdb.Model(&db.DocumentoClinico{}).Where("paciente_id = ? AND estado = ?", e.paciente.ID, db.DocumentoBorrador).Count(&borradores)
	if borradores != 1 {
		t.Fatalf("un solo borrador: %d", borradores)
	}
	// Otro documento distinto sí abre su propio borrador.
	if otro := e.crear(t, e.token, e.paciente.ID); otro.ID == primero.ID || otro.Retomado {
		t.Fatalf("otro documento: %+v", otro)
	}
	// El borrador de un colega no cuenta: ese no lo veo.
	colega := sumarColaboradorDePrueba(t, e.gdb, e.router, e.clinicID, "doc-unico-colega@example.com", db.RoleProfesional)
	if err := e.gdb.Create(&db.ProfessionalProfile{
		UserID: userIDDelMail(t, e.gdb, "doc-unico-colega@example.com"), Nombre: "Pedro", Apellido: "Díaz",
		Telefono: "+5493517654321", MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: matriculaDePrueba("doc-unico-colega@example.com"),
	}).Error; err != nil {
		t.Fatal(err)
	}
	if suyo := e.crearDe(t, colega, plantillaConducto, e.paciente.ID); suyo.ID == primero.ID || suyo.Retomado {
		t.Fatalf("el del colega es suyo: %+v", suyo)
	}
}

// Un consentimiento informado se completa para imprimir y se firma a mano
// (TR-188): terminado, queda "para imprimir", con su folio, sin firmas en
// el sistema ni sello, y ya no se edita.
func TestDocumentos_UnConsentimientoSeFirmaEnPapel(t *testing.T) {
	e := escenarioDeDocumentos(t, "papel")
	d := e.crearDe(t, e.token, plantillaConducto, e.paciente.ID)
	valores := d.Valores
	valores["elementos"] = []string{"36"}
	e.guardar(t, e.token, d.ID, valores)

	d = e.terminar(t, e.token, d.ID)
	if d.Estado != db.DocumentoParaImprimir || d.HashContenido == nil || len(d.Contenido) == 0 || len(d.FirmasPendientes) != 0 || d.Folio == nil || *d.Folio != 1 {
		t.Fatalf("terminado, queda para imprimir, con folio 1 y sin firmas pendientes: %+v", d)
	}

	// No se firma en el sistema.
	rec := e.firmar(t, e.token, d.ID, map[string]any{"rol": "profesional"})
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "papel") {
		t.Fatalf("firmar un consentimiento: %d %s", rec.Code, rec.Body.String())
	}
	// Ni se guarda encima.
	if rec := doJSONAuth(t, e.router, http.MethodPatch, "/documentos/"+d.ID, e.token, map[string]any{"valores": valores}); rec.Code != http.StatusConflict {
		t.Fatalf("guardar sobre uno para imprimir: %d", rec.Code)
	}

	// Imprimirlo queda en la auditoría.
	if rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos/"+d.ID+"/impresion", e.token, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("registrar la impresión: %d %s", rec.Code, rec.Body.String())
	}
	var impresiones int64
	e.gdb.Model(&db.DocumentoEvento{}).Where("documento_id = ? AND tipo = ?", d.ID, db.EventoDocumentoExportado).Count(&impresiones)
	if impresiones != 1 {
		t.Fatalf("la impresión en la auditoría: %d", impresiones)
	}

	// Ya no está en curso; está en el registro del paciente, en la tabla del
	// módulo y en la cuenta de la ficha.
	rec = doJSONAuth(t, e.router, http.MethodGet, "/documentos/en-curso", e.token, nil)
	if enCurso := decodificar[[]documentoResumenResponse](t, rec.Body.Bytes()); len(enCurso) != 0 {
		t.Fatalf("uno para imprimir no está en curso: %+v", enCurso)
	}
	rec = doJSONAuth(t, e.router, http.MethodGet, "/documentos/pacientes", e.token, nil)
	if pacientes := decodificar[[]pacienteConDocumentosResponse](t, rec.Body.Bytes()); len(pacientes) != 1 || pacientes[0].Cantidad != 1 {
		t.Fatalf("pacientes con documentos: %+v", pacientes)
	}
	rec = doJSONAuth(t, e.router, http.MethodGet, "/pacientes/"+e.paciente.ID.String()+"/documentos", e.token, nil)
	if registro := decodificar[[]documentoResumenResponse](t, rec.Body.Bytes()); len(registro) != 1 || registro[0].Estado != db.DocumentoParaImprimir || registro[0].HashContenido == nil {
		t.Fatalf("el registro del paciente: %+v", registro)
	}
	rec = doJSONAuth(t, e.router, http.MethodGet, "/pacientes/"+e.paciente.ID.String(), e.token, nil)
	if ficha := decodificar[pacienteDetalleResponse](t, rec.Body.Bytes()); ficha.DocumentosClinicos != 1 {
		t.Fatalf("la ficha cuenta el consentimiento: %d", ficha.DocumentosClinicos)
	}

	// Si hay que corregir algo, se hace otro: una instancia nueva, que al
	// terminarse recibe el folio siguiente. Un borrador no se imprime.
	otro := e.crearDe(t, e.token, plantillaConducto, e.paciente.ID)
	if otro.ID == d.ID || otro.Retomado {
		t.Fatalf("otra instancia: %+v", otro)
	}
	if rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos/"+otro.ID+"/impresion", e.token, nil); rec.Code != http.StatusConflict {
		t.Fatalf("un borrador no se imprime: %d", rec.Code)
	}
	valores = otro.Valores
	valores["elementos"] = []string{"37"}
	e.guardar(t, e.token, otro.ID, valores)
	if otro = e.terminar(t, e.token, otro.ID); otro.Folio == nil || *otro.Folio != 2 {
		t.Fatalf("el folio siguiente: %+v", otro)
	}
}

func TestDocumentos_UnColegaVeElConsentimientoParaImprimirDeSusPacientes(t *testing.T) {
	e := escenarioDeDocumentos(t, "papel-colega")
	d := e.crearDe(t, e.token, plantillaConducto, e.paciente.ID)
	valores := d.Valores
	valores["elementos"] = []string{"36"}
	e.guardar(t, e.token, d.ID, valores)
	e.terminar(t, e.token, d.ID)

	colega := sumarColaboradorDePrueba(t, e.gdb, e.router, e.clinicID, "doc-papel-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, e.gdb, "doc-papel-colega@example.com")
	if rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+d.ID, colega, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("de un paciente que no atiende: %d", rec.Code)
	}
	// Ana entra en su lista: ve el consentimiento, en solo lectura, y lo puede imprimir.
	if err := e.gdb.Create(&db.PacienteEnMiLista{PacienteID: e.paciente.ID, UserID: colegaID, ClinicID: e.clinicID}).Error; err != nil {
		t.Fatal(err)
	}
	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+d.ID, colega, nil)
	if ajeno := decodificar[documentoDetalleResponse](t, rec.Body.Bytes()); rec.Code != http.StatusOK || ajeno.EsMio || ajeno.Estado != db.DocumentoParaImprimir {
		t.Fatalf("el consentimiento de la colega: %d %+v", rec.Code, ajeno.documentoResumenResponse)
	}
	if rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos/"+d.ID+"/impresion", colega, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("imprimir el de la colega: %d", rec.Code)
	}
}

func TestDocumentos_DescartarUnBorrador(t *testing.T) {
	e := escenarioDeDocumentos(t, "descartar")
	d := e.crear(t, e.token, e.paciente.ID)
	if rec := doJSONAuth(t, e.router, http.MethodDelete, "/documentos/"+d.ID, e.token, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("descartar: %d", rec.Code)
	}
	if rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+d.ID, e.token, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("un borrador descartado ya no existe: %d", rec.Code)
	}
}

func TestDocumentos_CrearValidaPlantillaYPaciente(t *testing.T) {
	e := escenarioDeDocumentos(t, "crear")
	casos := map[string]struct {
		cuerpo map[string]any
		status int
	}{
		"una plantilla que no existe": {map[string]any{"plantillaId": "no-existe", "pacienteId": e.paciente.ID.String()}, http.StatusBadRequest},
		"sin paciente":                {map[string]any{"plantillaId": plantillaConducto}, http.StatusBadRequest},
		"un paciente que no existe":   {map[string]any{"plantillaId": plantillaConducto, "pacienteId": uuid.NewString()}, http.StatusNotFound},
	}
	for nombre, c := range casos {
		if rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", e.token, c.cuerpo); rec.Code != c.status {
			t.Errorf("%s: se esperaba %d, llegó %d", nombre, c.status, rec.Code)
		}
	}

	// Una ficha en conflicto de identidad: primero se resuelve.
	duplicada := db.Paciente{ClinicID: e.clinicID, Nombre: "Ana", Apellido: "Paz", DNI: "30111222", Origen: "pagina_publica", EnConflicto: true}
	if err := e.gdb.Create(&duplicada).Error; err != nil {
		t.Fatal(err)
	}
	rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", e.token, map[string]any{"plantillaId": plantillaConducto, "pacienteId": duplicada.ID.String()})
	if rec.Code != http.StatusConflict {
		t.Fatalf("una ficha en conflicto: %d", rec.Code)
	}
}

func TestDocumentos_SoloParaProfesionales(t *testing.T) {
	e := escenarioDeDocumentos(t, "roles")
	d := e.completarYSellar(t, e.token, e.paciente.ID)
	recep := sumarColaboradorDePrueba(t, e.gdb, e.router, e.clinicID, "doc-recep@example.com", db.RoleRecepcion)
	admin := sumarColaboradorDePrueba(t, e.gdb, e.router, e.clinicID, "doc-admin@example.com", db.RoleAdmin)

	for _, token := range []string{recep, admin} {
		for _, ruta := range []string{"/documentos/pacientes", "/documentos/en-curso", "/documentos/" + d.ID, "/pacientes/" + e.paciente.ID.String() + "/documentos"} {
			if rec := doJSONAuth(t, e.router, http.MethodGet, ruta, token, nil); rec.Code != http.StatusForbidden {
				t.Errorf("%s: se esperaba 403, llegó %d", ruta, rec.Code)
			}
		}
		if rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", token, map[string]any{"plantillaId": plantillaConducto, "pacienteId": e.paciente.ID.String()}); rec.Code != http.StatusForbidden {
			t.Errorf("crear: se esperaba 403, llegó %d", rec.Code)
		}
	}

	// Recepción sabe QUE hay historia clínica, no qué dice.
	rec := doJSONAuth(t, e.router, http.MethodGet, "/pacientes/"+e.paciente.ID.String(), recep, nil)
	if ficha := decodificar[pacienteDetalleResponse](t, rec.Body.Bytes()); rec.Code != http.StatusOK || ficha.DocumentosClinicos != 1 {
		t.Fatalf("recepción ve la cantidad: %d %+v", rec.Code, ficha.DocumentosClinicos)
	}
}

func TestDocumentos_UnColegaVeLoSelladoDeSusPacientesYNadaMas(t *testing.T) {
	e := escenarioDeDocumentos(t, "colega")
	sellado := e.completarYSellar(t, e.token, e.paciente.ID)
	borrador := e.crear(t, e.token, e.paciente.ID)
	colega := sumarColaboradorDePrueba(t, e.gdb, e.router, e.clinicID, "doc-colega@example.com", db.RoleProfesional)
	// En la app nadie entra sin perfil (el onboarding lo exige); el helper
	// arma la membresía directo en la base y no lo carga.
	if err := e.gdb.Create(&db.ProfessionalProfile{
		UserID: userIDDelMail(t, e.gdb, "doc-colega@example.com"), Nombre: "Pedro", Apellido: "Díaz",
		Telefono: "+5493517654321", MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: matriculaDePrueba("doc-colega@example.com"),
	}).Error; err != nil {
		t.Fatal(err)
	}

	// Ana no está en su lista: para el colega, nada de esto existe.
	if rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+sellado.ID, colega, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("un sellado de un paciente que no atiende: %d", rec.Code)
	}
	if rec := doJSONAuth(t, e.router, http.MethodGet, "/pacientes/"+e.paciente.ID.String()+"/documentos", colega, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("el registro de un paciente que no atiende: %d", rec.Code)
	}

	// Hacerle un documento la suma a su lista…
	suyo := e.crear(t, colega, e.paciente.ID)

	// …y desde ahí ve la historia de Ana entera, con su autor, en solo lectura.
	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+sellado.ID, colega, nil)
	ajeno := decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if rec.Code != http.StatusOK || ajeno.EsMio || ajeno.AutorNombre != "Lucía Gómez" {
		t.Fatalf("el sellado de la colega: %d %+v", rec.Code, ajeno.documentoResumenResponse)
	}
	rec = doJSONAuth(t, e.router, http.MethodGet, "/pacientes/"+e.paciente.ID.String()+"/documentos", colega, nil)
	registro := decodificar[[]documentoResumenResponse](t, rec.Body.Bytes())
	if len(registro) != 2 {
		t.Fatalf("ve el sellado de la colega y su propio borrador, no el borrador ajeno: %+v", registro)
	}
	for _, r := range registro {
		if r.ID == borrador.ID {
			t.Fatal("el borrador de la colega apareció en su registro")
		}
	}
	if rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+borrador.ID, colega, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("el borrador de otro: %d", rec.Code)
	}
	// No toca nada ajeno.
	if rec := doJSONAuth(t, e.router, http.MethodPatch, "/documentos/"+borrador.ID, colega, map[string]any{"valores": map[string]any{}}); rec.Code != http.StatusNotFound {
		t.Fatalf("editar el borrador de otro: %d", rec.Code)
	}
	if rec := e.firmar(t, colega, sellado.ID, map[string]any{"rol": "profesional"}); rec.Code != http.StatusNotFound {
		t.Fatalf("firmar el documento de otro: %d", rec.Code)
	}
	// Y la titular no ve el borrador del colega.
	if rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+suyo.ID, e.token, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("el borrador del colega: %d", rec.Code)
	}
}

func TestDocumentos_OtraClinicaNoVeNada(t *testing.T) {
	e := escenarioDeDocumentos(t, "tenant")
	d := e.completarYSellar(t, e.token, e.paciente.ID)
	otra := registrarProfesionalDePrueba(t, e.gdb, e.router, altaDePruebaInput{
		Email: "doc-otra@example.com", Password: "unaClaveLarga123", Nombre: "Pedro Ruiz", NombreClinica: "Otra",
	})
	if rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+d.ID, otra.Token, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("un documento de otra clínica: %d", rec.Code)
	}
	if rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", otra.Token, map[string]any{"plantillaId": plantillaConducto, "pacienteId": e.paciente.ID.String()}); rec.Code != http.StatusNotFound {
		t.Fatalf("un documento para un paciente de otra clínica: %d", rec.Code)
	}
	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/pacientes", otra.Token, nil)
	if lista := decodificar[[]pacienteConDocumentosResponse](t, rec.Body.Bytes()); len(lista) != 0 {
		t.Fatalf("la tabla de otra clínica: %+v", lista)
	}
}

// Una ficha con documentos no se borra por ningún camino automático; y con
// uno sellado, el paciente cuenta como verificado.
func TestDocumentos_LaFichaConDocumentosNoSeBorra(t *testing.T) {
	e := escenarioDeDocumentos(t, "ficha")
	publica := db.Paciente{ClinicID: e.clinicID, Nombre: "Sin", Apellido: "Verificar", DNI: "41222333", Origen: "pagina_publica"}
	if err := e.gdb.Create(&publica).Error; err != nil {
		t.Fatal(err)
	}
	verificado, _ := pacienteEstaVerificado(e.gdb, publica)
	if verificado {
		t.Fatal("recién llegada del wizard, no está verificada")
	}

	e.crear(t, e.token, publica.ID)
	if err := borrarFichaPacienteConSusHijas(e.gdb, publica.ID); !errors.Is(err, errFichaConDocumentos) {
		t.Fatalf("con un borrador, la ficha no se borra: %v", err)
	}
	if borro, err := borrarPacienteNoVerificadoSiSinHistorialReal(e.gdb, publica.ID); err != nil || borro {
		t.Fatalf("el borrado automático la respeta: %v %v", borro, err)
	}
	var sigue int64
	e.gdb.Model(&db.Paciente{}).Where("id = ?", publica.ID).Count(&sigue)
	if sigue != 1 {
		t.Fatal("la ficha se borró")
	}

	e.completarYSellar(t, e.token, publica.ID)
	if verificado, _ := pacienteEstaVerificado(e.gdb, publica); !verificado {
		t.Fatal("con un documento sellado, está verificada")
	}
	ids, _ := pacientesVerificadosIDs(e.gdb, e.clinicID)
	if !ids[publica.ID] {
		t.Fatal("la tabla de pacientes también la cuenta verificada")
	}
}

func TestPacientes_DatosDeLosDocumentosEnLaFicha(t *testing.T) {
	e := escenarioDeDocumentos(t, "datos")
	editar := func(extra map[string]any) *httptest.ResponseRecorder {
		cuerpo := map[string]any{"dni": "30111222", "telefono": "+5493511234567", "email": "ana-datos@example.com"}
		for k, v := range extra {
			cuerpo[k] = v
		}
		return doJSONAuth(t, e.router, http.MethodPatch, "/pacientes/"+e.paciente.ID.String(), e.token, cuerpo)
	}

	for nombre, extra := range map[string]map[string]any{
		"una fecha imposible":     {"fechaNacimiento": "1990-02-30"},
		"una fecha futura":        {"fechaNacimiento": time.Now().AddDate(1, 0, 0).Format("2006-01-02")},
		"un domicilio enorme":     {"domicilio": strings.Repeat("x", 301)},
		"un afiliado kilométrico": {"obraSocialAfiliado": strings.Repeat("9", 61)},
	} {
		if rec := editar(extra); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: %d", nombre, rec.Code)
		}
	}

	rec := editar(map[string]any{
		"fechaNacimiento": "1990-05-10", "domicilio": "  San Martín   120 ", "obraSocial": "OSDE", "obraSocialPlan": "210", "obraSocialAfiliado": "123456",
	})
	p := decodificar[pacienteResponse](t, rec.Body.Bytes())
	if rec.Code != http.StatusOK || *p.FechaNacimiento != "1990-05-10" || *p.Domicilio != "San Martín 120" || *p.ObraSocial != "OSDE" {
		t.Fatalf("guardar los datos: %d %+v", rec.Code, p)
	}

	// Ausente no toca; "" borra.
	rec = editar(map[string]any{"obraSocial": ""})
	p = decodificar[pacienteResponse](t, rec.Body.Bytes())
	if p.ObraSocial != nil || p.Domicilio == nil || *p.FechaNacimiento != "1990-05-10" {
		t.Fatalf("borrar uno solo: %+v", p)
	}
	rec = editar(map[string]any{"fechaNacimiento": ""})
	if p := decodificar[pacienteResponse](t, rec.Body.Bytes()); p.FechaNacimiento != nil {
		t.Fatalf("borrar la fecha: %+v", p)
	}
}
