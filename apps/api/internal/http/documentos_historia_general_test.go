package http

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/documentos"
)

// La Historia Clínica General (Fase 5.5, TR-192): la primera historia real,
// con su odontograma, de punta a punta contra la base — crear con lo
// precargado, rechazar un odontograma mal formado, terminar congelando las
// figuras, firmar en el dispositivo, sellar y descargar el PDF.

const plantillaHistoriaGeneral = "historia-clinica-general"

// campoDeTipo — el id del primer campo de ese tipo (la prueba no depende de
// cómo los nombró la plantilla).
func campoDeTipo(t *testing.T, p *documentos.Plantilla, tipo string) string {
	t.Helper()
	for _, c := range p.Campos() {
		if c.Tipo == tipo {
			return c.ID
		}
	}
	t.Fatalf("la plantilla %s no tiene un campo %s", p.ID, tipo)
	return ""
}

// campoConTipo — el id del primer campo de ese tipo, o "" si no hay.
func campoConTipo(p *documentos.Plantilla, tipo string) string {
	for _, c := range p.Campos() {
		if c.Tipo == tipo {
			return c.ID
		}
	}
	return ""
}

func campoConPrecarga(p *documentos.Plantilla, precarga string) string {
	for _, c := range p.Campos() {
		if c.Precarga == precarga {
			return c.ID
		}
	}
	return ""
}

// valoresDeEjemploDeLaHistoria — los del fixture que genera el paquete de
// TypeScript: válidos para terminar y que entran en la lámina.
func valoresDeEjemploDeLaHistoria(t *testing.T, plantilla string) map[string]any {
	t.Helper()
	datos, err := os.ReadFile("../documentos/fixtures/" + plantilla + ".v1.json")
	if err != nil {
		t.Fatalf("el fixture de %s: %v", plantilla, err)
	}
	var fx struct {
		Valores map[string]any `json:"valores"`
	}
	if err := json.Unmarshal(datos, &fx); err != nil {
		t.Fatal(err)
	}
	return fx.Valores
}

const odontogramaDeEjemplo = `{"piezas":{"16":{"caras":{"O":"rojo","M":"rojo"},"marcas":{"corona":"rojo"}},"26":{"marcas":{"x":"azul"}},"36":{"caras":{"D":"azul"}}},
 "protesis":[{"tipo":"fija","desde":"23","hasta":"13","color":"rojo"}],"existentes":28}`

const textoDelOdontogramaDeEjemplo = "Rojo, prestaciones existentes: 16 (caras mesial y oclusal; corona). Azul, prestaciones requeridas: 26 (ausente o a extraer), 36 (cara distal). Prótesis: fija en rojo, de 13 a 23. Dientes existentes: 28."

// Las historias clínicas con odontograma: la General (5.5), la de PcD
// (5.6a) y el Anexo de odontopediatría (5.6b) recorren el mismo circuito; lo
// que cambia es la plantilla, su fixture, cuántas páginas de lámina lleva el
// PDF, quién firma por el paciente y, en la pediátrica, el odontograma.
var historiasConOdontograma = []struct {
	plantilla string
	prefijo   string
	paginas   int // de lámina; el PDF suma la constancia
	// firmaDelPaciente — el rol de quien firma por el paciente ("" = paciente).
	firmaDelPaciente string
	// odontograma — uno válido para su leyenda y dentición ("" = el de
	// ejemplo, el de la leyenda general).
	odontograma string
}{
	{plantillaHistoriaGeneral, "hcg", 0, "", ""}, // 0: las que declare la plantilla
	{plantillaHistoriaPcD, "hpcd", 2, "", ""},
	{plantillaAnexoOdontopediatria, "aodp", 2, db.FirmaRepresentante, odontogramaPediatricoDeEjemplo},
}

const plantillaAnexoOdontopediatria = "anexo-odontopediatria"

// odontogramaPediatricoDeEjemplo — con piezas de las dos denticiones: dos
// caras rojas, un sellador y una pieza a extraer (el anexo no cuenta los
// dientes existentes).
const odontogramaPediatricoDeEjemplo = `{"piezas":{"55":{"caras":{"O":"rojo","M":"rojo"}},"16":{"marcas":{"sellador":"azul"}},"75":{"marcas":{"x":"azul"}}}}`

const plantillaHistoriaPcD = "historia-clinica-pcd"

func TestDocumentos_HistoriaClinicaDePuntaAPunta(t *testing.T) {
	for _, h := range historiasConOdontograma {
		t.Run(h.plantilla, func(t *testing.T) {
			historiaDePuntaAPunta(t, h.plantilla, h.prefijo, h.paginas, h.firmaDelPaciente, h.odontograma)
		})
	}
}

func historiaDePuntaAPunta(t *testing.T, plantilla, prefijo string, paginas int, firmaDelPaciente, odontograma string) {
	if firmaDelPaciente == "" {
		firmaDelPaciente = db.FirmaPaciente
	}
	if odontograma == "" {
		odontograma = odontogramaDeEjemplo
	}
	p, ok := documentos.Ultima(plantilla)
	if !ok {
		t.Fatalf("falta la plantilla %s", plantilla)
	}
	odonto := campoDeTipo(t, p, "odontograma")
	e := escenarioDeDocumentos(t, prefijo)

	// Una matrícula corta, que entra en sus casillas, y un número de afiliado.
	if err := e.gdb.Model(&db.ProfessionalProfile{}).Where("user_id = ?", e.titularID).
		Updates(map[string]any{"matricula_tipo": "provincial", "matricula_numero": "4321"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := e.gdb.Model(&db.Paciente{}).Where("id = ?", e.paciente.ID).Update("obra_social_afiliado", "998877").Error; err != nil {
		t.Fatal(err)
	}
	// Una fecha de nacimiento, para la edad de odontopediatría.
	nacimiento := clock.Today().AddDate(-7, -3, -2).Format("2006-01-02")
	if err := e.gdb.Model(&db.Paciente{}).Where("id = ?", e.paciente.ID).Update("fecha_nacimiento", nacimiento).Error; err != nil {
		t.Fatal(err)
	}

	// Crear: lo precargado, con la matrícula SIN el tipo (va en casillas).
	d := e.crearDe(t, e.token, plantilla, e.paciente.ID)
	if d.Estado != db.DocumentoBorrador {
		t.Fatalf("un documento nuevo es un borrador: %+v", d.documentoResumenResponse)
	}
	// El anexo no tiene matrícula (en su papel no hay dónde).
	matricula := campoConPrecarga(p, "profesional.matriculaNumero")
	if matricula == "" && plantilla != plantillaAnexoOdontopediatria {
		t.Fatalf("%s no precarga profesional.matriculaNumero", plantilla)
	}
	if matricula != "" && d.Valores[matricula] != "4321" {
		t.Errorf("la matrícula precargada es solo el número: %v", d.Valores[matricula])
	}
	// La edad, en años y meses cumplidos, como números.
	if anios, meses := campoConPrecarga(p, "paciente.edadAnios"), campoConPrecarga(p, "paciente.edadMeses"); anios != "" || meses != "" {
		quieroA, quieroM := documentos.EdadAl(nacimiento, clock.Today())
		if fmt.Sprint(d.Valores[anios]) != quieroA || fmt.Sprint(d.Valores[meses]) != quieroM || quieroA != "7" {
			t.Errorf("la edad precargada: %v años %v meses, se esperaba %s y %s", d.Valores[anios], d.Valores[meses], quieroA, quieroM)
		}
	}
	if afiliado := campoConPrecarga(p, "paciente.obraSocialAfiliado"); afiliado == "" || d.Valores[afiliado] != "998877" {
		t.Errorf("el afiliado precargado (%s): %v", afiliado, d.Valores[afiliado])
	}
	if nombre := campoConPrecarga(p, "paciente.nombreCompleto"); nombre == "" || d.Valores[nombre] != "Ana Paz" {
		t.Errorf("el paciente precargado (%s): %v", nombre, d.Valores[nombre])
	}

	// Un odontograma mal formado no se guarda: 422 con el mensaje del campo.
	valores := d.Valores
	valores[odonto] = map[string]any{"piezas": map[string]any{"99": map[string]any{"marcas": map[string]any{"x": "rojo"}}}}
	rec := doJSONAuth(t, e.router, http.MethodPatch, "/documentos/"+d.ID, e.token, map[string]any{"valores": valores})
	cuerpo := decodificar[struct {
		Errores []documentos.ErrorDeCampo `json:"errores"`
	}](t, rec.Body.Bytes())
	if rec.Code != http.StatusUnprocessableEntity || len(cuerpo.Errores) != 1 ||
		cuerpo.Errores[0].Campo != odonto || cuerpo.Errores[0].Mensaje != "99 no es una pieza de este odontograma." {
		t.Fatalf("odontograma inválido: %d %s", rec.Code, rec.Body.String())
	}
	// Ni una prótesis que une las dos arcadas (la pediátrica no lleva
	// prótesis: la rechaza antes).
	valores[odonto] = map[string]any{"protesis": []any{map[string]any{"tipo": "fija", "desde": "13", "hasta": "43", "color": "rojo"}}}
	rec = doJSONAuth(t, e.router, http.MethodPatch, "/documentos/"+d.ID, e.token, map[string]any{"valores": valores})
	mensajeDeProtesis := "Una prótesis une piezas de la misma arcada."
	if p.Campo(odonto).Leyenda == "pediatrica" {
		mensajeDeProtesis = "Este odontograma no lleva prótesis."
	}
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), mensajeDeProtesis) {
		t.Fatalf("prótesis entre arcadas: %d %s", rec.Code, rec.Body.String())
	}

	// Completo con los valores de ejemplo y el odontograma del contrato.
	for clave, valor := range valoresDeEjemploDeLaHistoria(t, plantilla) {
		if clave == matricula {
			continue // la precargada
		}
		valores[clave] = valor
	}
	var ejemplo map[string]any
	_ = json.Unmarshal([]byte(odontograma), &ejemplo)
	valores[odonto] = ejemplo
	d = e.guardar(t, e.token, d.ID, valores)
	if !reflect.DeepEqual(d.Valores[odonto], ejemplo) {
		t.Fatalf("el odontograma guardado: %v", d.Valores[odonto])
	}

	// Terminar: a firmar, con las figuras en el contenido congelado.
	d = e.terminar(t, e.token, d.ID)
	if d.Estado != db.DocumentoAFirmar || strings.Join(d.FirmasPendientes, ",") != firmaDelPaciente+",profesional" {
		t.Fatalf("una historia clínica terminada espera sus firmas: %s %v", d.Estado, d.FirmasPendientes)
	}
	contenido := decodificar[documentos.ContenidoCongelado](t, d.Contenido)
	if len(contenido.Figuras) == 0 {
		t.Fatalf("el contenido congelado no lleva las figuras: %s", d.Contenido)
	}
	// Las congeladas son las que arma ArmarFiguras en modo sellado: la
	// pantalla y el PDF las dibujan sin recomponer.
	esperadas, _ := json.Marshal(documentos.ArmarFiguras(p, contenido.Valores, documentos.TextoSellado))
	congeladas, _ := json.Marshal(contenido.Figuras)
	if !bytes.Equal(esperadas, congeladas) {
		t.Fatalf("las figuras congeladas no son las del odontograma.\ncongeladas: %s\n  armadas: %s", congeladas, esperadas)
	}
	if odontograma == odontogramaDeEjemplo {
		if primera := contenido.Figuras[0]; primera.Tipo != "poligono" || primera.Relleno != "rojo" {
			t.Errorf("la primera figura es la cara M roja de la 16: %+v", primera)
		}
	} else {
		// En el anexo la 16 (un sellador azul) va antes que las caras rojas de la 55.
		caras := 0
		for _, f := range contenido.Figuras {
			if f.Tipo == "poligono" && f.Relleno == "rojo" {
				caras++
			}
		}
		if caras != 2 {
			t.Errorf("las dos caras rojas de la 55: %d polígonos rojos", caras)
		}
	}
	// Y el texto del cuerpo lo dice.
	textoCompleto, _ := json.Marshal(contenido.Cuerpo)
	textoEsperado := textoDelOdontogramaDeEjemplo
	if odontograma != odontogramaDeEjemplo {
		textoEsperado = documentos.ValorComoTexto(p.Campo(odonto), ejemplo)
	}
	if !strings.Contains(string(textoCompleto), textoEsperado) {
		t.Errorf("el cuerpo congelado no lee el odontograma (%q): %s", textoEsperado, textoCompleto)
	}
	// Un dibujo (el genograma del anexo) va congelado como trazos, después
	// de las figuras del odontograma, y el cuerpo dice que está en la hoja.
	if dibujo := campoConTipo(p, "dibujo"); dibujo != "" {
		trazos := 0
		for i, f := range contenido.Figuras {
			if f.Tipo == "trazo" {
				trazos++
			} else if trazos > 0 {
				t.Fatalf("la figura %d (%s) va después de un trazo: los dibujos van al final", i, f.Tipo)
			}
		}
		if quiero := len(contenido.Valores[dibujo].(map[string]any)["trazos"].([]any)); trazos != quiero || quiero == 0 {
			t.Errorf("el genograma congeló %d trazos, tiene %d", trazos, quiero)
		}
		if !strings.Contains(string(textoCompleto), documentos.DibujoConsignado) {
			t.Errorf("el cuerpo congelado no dice que el dibujo está en la hoja: %s", textoCompleto)
		}
	}

	// Firmar en el dispositivo: el paciente (o su tutor) y el profesional.
	if rec := e.firmar(t, e.token, d.ID, map[string]any{"rol": firmaDelPaciente, "nombre": "Ana Paz", "dni": "30111222"}); rec.Code != http.StatusOK {
		t.Fatalf("firma de %s: %d %s", firmaDelPaciente, rec.Code, rec.Body.String())
	}
	rec = e.firmar(t, e.token, d.ID, map[string]any{"rol": "profesional"})
	if rec.Code != http.StatusOK {
		t.Fatalf("firma del profesional: %d %s", rec.Code, rec.Body.String())
	}
	d = decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if d.Estado != db.DocumentoSellado || d.Folio == nil || d.HashSello == nil {
		t.Fatalf("sellado: %+v", d.documentoResumenResponse)
	}
	var guardado db.DocumentoClinico
	e.gdb.First(&guardado, "id = ?", d.ID)
	var firmas []db.DocumentoFirma
	e.gdb.Where("documento_id = ?", d.ID).Find(&firmas)
	if err := documentos.Verificar(guardado, firmas, ""); err != nil {
		t.Fatalf("la historia sellada no verifica: %v", err)
	}

	// El PDF: sale, y dos descargas dan los mismos bytes.
	code, _, pdf := descargarPDF(e, t, e.token, d.ID)
	if code != http.StatusOK || !bytes.HasPrefix(pdf, []byte("%PDF-")) {
		t.Fatalf("el PDF de %s: %d %.200s", plantilla, code, pdf)
	}
	// Una página por cada una de la lámina, más la constancia.
	if paginas == 0 {
		paginas = len(p.Lamina.Paginas)
	} else if len(p.Lamina.Paginas) != paginas {
		t.Errorf("%s declara %d páginas de lámina, se esperaban %d", plantilla, len(p.Lamina.Paginas), paginas)
	}
	if got := bytes.Count(pdf, []byte("/Type /Page /Parent")); got != paginas+1 {
		t.Errorf("el PDF de %s tiene %d páginas, se esperaban %d de lámina más la constancia", plantilla, got, paginas)
	}
	if _, _, otra := descargarPDF(e, t, e.token, d.ID); !bytes.Equal(pdf, otra) {
		t.Fatal("dos descargas del mismo documento dieron bytes distintos")
	}
}

// Un odontograma vacío en una historia terminada: "No consigna" en el
// texto y en el dibujo (Decreto 1089/2012, art. 15).
func TestDocumentos_HistoriaConElOdontogramaVacio(t *testing.T) {
	for _, h := range historiasConOdontograma {
		t.Run(h.plantilla, func(t *testing.T) {
			historiaConElOdontogramaVacio(t, h.plantilla, h.prefijo+"-vacio")
		})
	}
}

func historiaConElOdontogramaVacio(t *testing.T, plantilla, prefijo string) {
	p, ok := documentos.Ultima(plantilla)
	if !ok {
		t.Fatalf("falta la plantilla %s", plantilla)
	}
	odonto := campoDeTipo(t, p, "odontograma")
	if c := p.Campo(odonto); c.Requerido {
		t.Skipf("el odontograma de %s es obligatorio: no se termina vacío", plantilla)
	}
	e := escenarioDeDocumentos(t, prefijo)
	if err := e.gdb.Model(&db.ProfessionalProfile{}).Where("user_id = ?", e.titularID).
		Updates(map[string]any{"matricula_tipo": "provincial", "matricula_numero": "4321"}).Error; err != nil {
		t.Fatal(err)
	}
	d := e.crearDe(t, e.token, plantilla, e.paciente.ID)
	valores := d.Valores
	matricula := campoConPrecarga(p, "profesional.matriculaNumero")
	for clave, valor := range valoresDeEjemploDeLaHistoria(t, plantilla) {
		if clave != matricula {
			valores[clave] = valor
		}
	}
	delete(valores, odonto)
	e.guardar(t, e.token, d.ID, valores)
	d = e.terminar(t, e.token, d.ID)
	contenido := decodificar[documentos.ContenidoCongelado](t, d.Contenido)
	var textos []string
	for _, f := range contenido.Figuras {
		if f.Tipo == "texto" {
			textos = append(textos, f.Texto)
		}
	}
	if !strings.Contains(strings.Join(textos, "|"), "No consigna") {
		t.Fatalf("un odontograma vacío y terminado dice No consigna: %+v", contenido.Figuras)
	}
}

// Un consentimiento sigue igual: su contenido congelado no lleva la clave
// `figuras` (omitempty), así que su huella no cambió con la 5.5.
func TestDocumentos_UnConsentimientoNoLlevaFiguras(t *testing.T) {
	e := escenarioDeDocumentos(t, "sin-figuras")
	d := e.crearDe(t, e.token, plantillaConducto, e.paciente.ID)
	valores := d.Valores
	valores["elementos"] = []string{"36"}
	e.guardar(t, e.token, d.ID, valores)
	d = e.terminar(t, e.token, d.ID)
	var crudo map[string]json.RawMessage
	if err := json.Unmarshal(d.Contenido, &crudo); err != nil {
		t.Fatal(err)
	}
	if _, tiene := crudo["figuras"]; tiene {
		t.Fatalf("el contenido de un consentimiento lleva figuras: %s", crudo["figuras"])
	}
	if _, tiene := crudo["lamina"]; !tiene {
		t.Fatal("el consentimiento perdió su lámina congelada")
	}
}

// Un odontograma con basura no es "vacío": en un borrador también se valida
// y se rechaza con 422, en vez de guardarse sin mirar.
func TestDocumentos_HistoriaGeneralRechazaUnOdontogramaConBasura(t *testing.T) {
	p, ok := documentos.Ultima(plantillaHistoriaGeneral)
	if !ok {
		t.Fatal("falta la plantilla historia-clinica-general")
	}
	odonto := campoDeTipo(t, p, "odontograma")
	e := escenarioDeDocumentos(t, "hcg-basura")
	d := e.crearDe(t, e.token, plantillaHistoriaGeneral, e.paciente.ID)
	casos := []struct {
		nombre  string
		valor   any
		mensaje string
	}{
		{"un texto", "hola", "El odontograma no tiene la forma esperada."},
		{"caras como texto", map[string]any{"piezas": map[string]any{"16": map[string]any{"caras": "V"}}}, "El odontograma no tiene la forma esperada."},
		{"una pieza que no existe, sin nada", map[string]any{"piezas": map[string]any{"99": map[string]any{}}}, "99 no es una pieza de este odontograma."},
		{"prótesis como objeto", map[string]any{"protesis": map[string]any{}}, "El odontograma no tiene la forma esperada."},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			valores := map[string]any{}
			for k, v := range d.Valores {
				valores[k] = v
			}
			valores[odonto] = c.valor
			rec := doJSONAuth(t, e.router, http.MethodPatch, "/documentos/"+d.ID, e.token, map[string]any{"valores": valores})
			cuerpo := decodificar[struct {
				Errores []documentos.ErrorDeCampo `json:"errores"`
			}](t, rec.Body.Bytes())
			if rec.Code != http.StatusUnprocessableEntity || len(cuerpo.Errores) != 1 ||
				cuerpo.Errores[0].Campo != odonto || cuerpo.Errores[0].Mensaje != c.mensaje {
				t.Fatalf("%d %s", rec.Code, rec.Body.String())
			}
		})
	}
	// Y nada de eso quedó guardado.
	var guardado db.DocumentoClinico
	e.gdb.First(&guardado, "id = ?", d.ID)
	if v, esta := guardado.Valores[odonto]; esta && v != nil {
		if crudo, _ := json.Marshal(v); strings.Contains(string(crudo), "hola") || strings.Contains(string(crudo), `"99"`) {
			t.Fatalf("un valor rechazado quedó guardado: %s", crudo)
		}
	}
}

// Las cinco reglas de conflicto del odontograma (QA de la 5.5): guardar un
// borrador de la Historia General que las rompe responde 422 con el mensaje
// exacto, y un valor coherente que se les parece se guarda.
func TestDocumentos_HistoriaGeneralRechazaLosConflictosDelOdontograma(t *testing.T) {
	p, ok := documentos.Ultima(plantillaHistoriaGeneral)
	if !ok {
		t.Fatal("falta la plantilla historia-clinica-general")
	}
	odonto := campoDeTipo(t, p, "odontograma")
	e := escenarioDeDocumentos(t, "hcg-conflictos")
	d := e.crearDe(t, e.token, plantillaHistoriaGeneral, e.paciente.ID)

	pieza := func(numero string, caras, marcas map[string]any) map[string]any {
		contenido := map[string]any{}
		if caras != nil {
			contenido["caras"] = caras
		}
		if marcas != nil {
			contenido["marcas"] = marcas
		}
		return map[string]any{"piezas": map[string]any{numero: contenido}}
	}
	tramo := func(tipo, desde, hasta, color string) map[string]any {
		return map[string]any{"tipo": tipo, "desde": desde, "hasta": hasta, "color": color}
	}
	guardar := func(t *testing.T, valor any) *httptest.ResponseRecorder {
		t.Helper()
		valores := map[string]any{}
		for k, v := range d.Valores {
			valores[k] = v
		}
		valores[odonto] = valor
		return doJSONAuth(t, e.router, http.MethodPatch, "/documentos/"+d.ID, e.token, map[string]any{"valores": valores})
	}

	casos := []struct {
		nombre  string
		valor   any
		mensaje string
	}{
		{"ausente con una cara", pieza("16", map[string]any{"O": "rojo"}, map[string]any{"x": "rojo"}),
			"La pieza 16 está ausente: no lleva prestaciones."},
		{"ausente con una corona roja", pieza("16", nil, map[string]any{"x": "rojo", "corona": "rojo"}),
			"La pieza 16 está ausente: no lleva prestaciones."},
		{"a extraer con una cara azul", pieza("26", map[string]any{"M": "azul"}, map[string]any{"x": "azul"}),
			"La pieza 26 se va a extraer: no lleva prestaciones requeridas."},
		{"a extraer con una corona azul", pieza("26", nil, map[string]any{"x": "azul", "corona": "azul"}),
			"La pieza 26 se va a extraer: no lleva prestaciones requeridas."},
		{"pilar ausente", map[string]any{
			"piezas":   map[string]any{"13": map[string]any{"marcas": map[string]any{"x": "rojo"}}},
			"protesis": []any{tramo("fija", "13", "11", "rojo")},
		}, "La pieza 13 está ausente: no puede ser pilar."},
		{"pilar a extraer en una prótesis requerida", map[string]any{
			"piezas":   map[string]any{"11": map[string]any{"marcas": map[string]any{"x": "azul"}}},
			"protesis": []any{tramo("removible", "13", "11", "azul")},
		}, "La pieza 11 se va a extraer: no puede ser pilar."},
		{"dos prótesis que se superponen", map[string]any{
			"protesis": []any{tramo("fija", "13", "11", "rojo"), tramo("fija", "12", "22", "azul")},
		}, "Esa prótesis se superpone con otra."},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			rec := guardar(t, c.valor)
			cuerpo := decodificar[struct {
				Errores []documentos.ErrorDeCampo `json:"errores"`
			}](t, rec.Body.Bytes())
			if rec.Code != http.StatusUnprocessableEntity || len(cuerpo.Errores) != 1 ||
				cuerpo.Errores[0].Campo != odonto || cuerpo.Errores[0].Mensaje != c.mensaje {
				t.Fatalf("esperaba 422 %q: %d %s", c.mensaje, rec.Code, rec.Body.String())
			}
		})
	}

	// Lo que se les parece pero es coherente se guarda.
	validos := []struct {
		nombre string
		valor  any
	}{
		{"a extraer con lo existente en rojo", pieza("26", map[string]any{"O": "rojo"}, map[string]any{"x": "azul", "corona": "rojo"})},
		{"pilar a extraer en una prótesis existente", map[string]any{
			"piezas":   map[string]any{"11": map[string]any{"marcas": map[string]any{"x": "azul"}}},
			"protesis": []any{tramo("fija", "13", "11", "rojo")},
		}},
		{"una pieza intermedia ausente", map[string]any{
			"piezas":   map[string]any{"12": map[string]any{"marcas": map[string]any{"x": "rojo"}}},
			"protesis": []any{tramo("fija", "13", "11", "rojo")},
		}},
		{"prótesis vecinas y en filas distintas", map[string]any{
			"protesis": []any{tramo("fija", "13", "11", "rojo"), tramo("removible", "21", "23", "azul"), tramo("fija", "43", "41", "azul")},
		}},
	}
	for _, c := range validos {
		t.Run(c.nombre, func(t *testing.T) {
			if rec := guardar(t, c.valor); rec.Code != http.StatusOK {
				t.Fatalf("esperaba 200: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

// Fase 5.6a: la General v2 solo mueve el bloque del profesional. Un
// borrador de la v1 se retoma en la v2 con lo que ya tenía, igual que el
// conducto (TR-189, addendum); lo terminado sigue en su versión.
func TestDocumentos_UnBorradorDeLaGeneralV1PasaALaV2(t *testing.T) {
	e := escenarioDeDocumentos(t, "general-v2")
	if p, ok := documentos.Ultima(plantillaHistoriaGeneral); !ok || p.Version != 2 {
		t.Fatalf("la vigente de la General tiene que ser la 2: %+v", p)
	}
	viejo := db.DocumentoClinico{
		ClinicID: e.clinicID, PacienteID: e.paciente.ID, AutorUserID: e.titularID,
		PlantillaID: plantillaHistoriaGeneral, PlantillaVersion: 1,
		Valores: map[string]any{"lugar": "Villa Allende"},
	}
	if err := e.gdb.Create(&viejo).Error; err != nil {
		t.Fatalf("borrador v1: %v", err)
	}
	rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", e.token, map[string]any{
		"plantillaId": plantillaHistoriaGeneral, "pacienteId": e.paciente.ID.String(),
	})
	d := decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if rec.Code != http.StatusOK || !d.Retomado {
		t.Fatalf("retoma el borrador: %d %s", rec.Code, rec.Body.String())
	}
	if d.ID == viejo.ID.String() || d.PlantillaVersion != 2 || !d.VersionActualizada || d.Estado != db.DocumentoBorrador {
		t.Fatalf("pasa a un borrador nuevo de la v2: %+v", d.documentoResumenResponse)
	}
	if d.Valores["lugar"] != "Villa Allende" {
		t.Fatalf("lo cargado en la v1 se conserva: %v", d.Valores)
	}
	var borradores, viejos int64
	e.gdb.Model(&db.DocumentoClinico{}).Where("paciente_id = ? AND estado = ?", e.paciente.ID, db.DocumentoBorrador).Count(&borradores)
	e.gdb.Model(&db.DocumentoClinico{}).Where("id = ?", viejo.ID).Count(&viejos)
	if borradores != 1 || viejos != 0 {
		t.Fatalf("queda un solo borrador y el viejo se descarta: %d borradores, %d viejos", borradores, viejos)
	}

	// Abierto de nuevo, ya está en la vigente: no cambia.
	rec = doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+d.ID, e.token, nil)
	if otra := decodificar[documentoDetalleResponse](t, rec.Body.Bytes()); rec.Code != http.StatusOK || otra.ID != d.ID || otra.VersionActualizada || otra.PlantillaVersion != 2 {
		t.Fatalf("el borrador de la v2 no cambia: %d %+v", rec.Code, otra.documentoResumenResponse)
	}

	// Una General v1 terminada sigue en la v1.
	terminado := db.DocumentoClinico{PlantillaID: plantillaHistoriaGeneral, PlantillaVersion: 1, Estado: db.DocumentoSellado}
	if t2, cambio, err := borradorEnLaVersionVigente(e.gdb, terminado); err != nil || cambio || t2.PlantillaVersion != 1 {
		t.Fatalf("un documento terminado sigue en su versión: %v %v", cambio, err)
	}
}

// El genograma del anexo: un dibujo roto no se guarda (422 con el mensaje
// del campo, el mismo que la pantalla); uno sin trazos sí, y cuenta como
// vacío.
func TestDocumentos_AnexoRechazaUnGenogramaRoto(t *testing.T) {
	e := escenarioDeDocumentos(t, "aodp-genograma")
	d := e.crearDe(t, e.token, plantillaAnexoOdontopediatria, e.paciente.ID)
	casos := []struct {
		valor   any
		mensaje string
	}{
		{map[string]any{"ancho": 400, "alto": 200, "trazos": []any{[]any{[]any{401, 10}}}}, "Hay un punto fuera del lienzo."},
		{map[string]any{"ancho": 10, "alto": 200, "trazos": []any{}}, "El lienzo tiene que medir entre 50 y 4000 de cada lado."},
		{map[string]any{"ancho": 400, "alto": 200, "trazos": []any{[]any{}}}, "Hay un trazo sin puntos."},
		{"un genograma", "El dibujo no tiene la forma esperada."},
	}
	for _, c := range casos {
		valores := d.Valores
		valores["genograma"] = c.valor
		rec := doJSONAuth(t, e.router, http.MethodPatch, "/documentos/"+d.ID, e.token, map[string]any{"valores": valores})
		cuerpo := decodificar[struct {
			Errores []documentos.ErrorDeCampo `json:"errores"`
		}](t, rec.Body.Bytes())
		if rec.Code != http.StatusUnprocessableEntity || len(cuerpo.Errores) != 1 ||
			cuerpo.Errores[0].Campo != "genograma" || cuerpo.Errores[0].Mensaje != c.mensaje {
			t.Fatalf("genograma %v: %d %s", c.valor, rec.Code, rec.Body.String())
		}
	}
	valores := d.Valores
	valores["genograma"] = map[string]any{"ancho": 400, "alto": 200, "trazos": []any{}}
	guardado := e.guardar(t, e.token, d.ID, valores)
	if _, ok := guardado.Valores["genograma"]; !ok {
		t.Fatalf("un genograma sin trazos es un valor válido: %v", guardado.Valores)
	}
}
