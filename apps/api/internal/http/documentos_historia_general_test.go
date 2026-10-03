package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"reflect"
	"strings"
	"testing"

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
func valoresDeEjemploDeLaHistoria(t *testing.T) map[string]any {
	t.Helper()
	datos, err := os.ReadFile("../documentos/fixtures/historia-clinica-general.v1.json")
	if err != nil {
		t.Fatalf("el fixture de la historia general: %v", err)
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

func TestDocumentos_HistoriaClinicaGeneralDePuntaAPunta(t *testing.T) {
	p, ok := documentos.Ultima(plantillaHistoriaGeneral)
	if !ok {
		t.Fatal("falta la plantilla historia-clinica-general")
	}
	odonto := campoDeTipo(t, p, "odontograma")
	e := escenarioDeDocumentos(t, "hcg")

	// Una matrícula corta, que entra en sus casillas, y un número de afiliado.
	if err := e.gdb.Model(&db.ProfessionalProfile{}).Where("user_id = ?", e.titularID).
		Updates(map[string]any{"matricula_tipo": "provincial", "matricula_numero": "4321"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := e.gdb.Model(&db.Paciente{}).Where("id = ?", e.paciente.ID).Update("obra_social_afiliado", "998877").Error; err != nil {
		t.Fatal(err)
	}

	// Crear: lo precargado, con la matrícula SIN el tipo (va en casillas).
	d := e.crearDe(t, e.token, plantillaHistoriaGeneral, e.paciente.ID)
	if d.Estado != db.DocumentoBorrador {
		t.Fatalf("un documento nuevo es un borrador: %+v", d.documentoResumenResponse)
	}
	matricula := campoConPrecarga(p, "profesional.matriculaNumero")
	if matricula == "" {
		t.Fatal("la historia general no precarga profesional.matriculaNumero")
	}
	if d.Valores[matricula] != "4321" {
		t.Errorf("la matrícula precargada es solo el número: %v", d.Valores[matricula])
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
	// Ni una prótesis que une las dos arcadas.
	valores[odonto] = map[string]any{"protesis": []any{map[string]any{"tipo": "fija", "desde": "13", "hasta": "43", "color": "rojo"}}}
	rec = doJSONAuth(t, e.router, http.MethodPatch, "/documentos/"+d.ID, e.token, map[string]any{"valores": valores})
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "Una prótesis une piezas de la misma arcada.") {
		t.Fatalf("prótesis entre arcadas: %d %s", rec.Code, rec.Body.String())
	}

	// Completo con los valores de ejemplo y el odontograma del contrato.
	for clave, valor := range valoresDeEjemploDeLaHistoria(t) {
		if clave == matricula {
			continue // la precargada
		}
		valores[clave] = valor
	}
	var ejemplo map[string]any
	_ = json.Unmarshal([]byte(odontogramaDeEjemplo), &ejemplo)
	valores[odonto] = ejemplo
	d = e.guardar(t, e.token, d.ID, valores)
	if !reflect.DeepEqual(d.Valores[odonto], ejemplo) {
		t.Fatalf("el odontograma guardado: %v", d.Valores[odonto])
	}

	// Terminar: a firmar, con las figuras en el contenido congelado.
	d = e.terminar(t, e.token, d.ID)
	if d.Estado != db.DocumentoAFirmar || strings.Join(d.FirmasPendientes, ",") != "paciente,profesional" {
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
	if primera := contenido.Figuras[0]; primera.Tipo != "poligono" || primera.Relleno != "rojo" {
		t.Errorf("la primera figura es la cara M roja de la 16: %+v", primera)
	}
	// Y el texto del cuerpo lo dice.
	textoCompleto, _ := json.Marshal(contenido.Cuerpo)
	if !strings.Contains(string(textoCompleto), textoDelOdontogramaDeEjemplo) {
		t.Errorf("el cuerpo congelado no lee el odontograma: %s", textoCompleto)
	}

	// Firmar en el dispositivo: el paciente (o su tutor) y el profesional.
	if rec := e.firmar(t, e.token, d.ID, map[string]any{"rol": "paciente", "nombre": "Ana Paz", "dni": "30111222"}); rec.Code != http.StatusOK {
		t.Fatalf("firma del paciente: %d %s", rec.Code, rec.Body.String())
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
		t.Fatalf("el PDF de la historia general: %d %.200s", code, pdf)
	}
	if _, _, otra := descargarPDF(e, t, e.token, d.ID); !bytes.Equal(pdf, otra) {
		t.Fatal("dos descargas del mismo documento dieron bytes distintos")
	}
}

// Un odontograma vacío en una historia terminada: "No consigna" en el
// texto y en el dibujo (Decreto 1089/2012, art. 15).
func TestDocumentos_HistoriaGeneralConElOdontogramaVacio(t *testing.T) {
	p, ok := documentos.Ultima(plantillaHistoriaGeneral)
	if !ok {
		t.Fatal("falta la plantilla historia-clinica-general")
	}
	odonto := campoDeTipo(t, p, "odontograma")
	if c := p.Campo(odonto); c.Requerido {
		t.Skip("el odontograma de la historia general es obligatorio: no se termina vacío")
	}
	e := escenarioDeDocumentos(t, "hcg-vacio")
	if err := e.gdb.Model(&db.ProfessionalProfile{}).Where("user_id = ?", e.titularID).
		Updates(map[string]any{"matricula_tipo": "provincial", "matricula_numero": "4321"}).Error; err != nil {
		t.Fatal(err)
	}
	d := e.crearDe(t, e.token, plantillaHistoriaGeneral, e.paciente.ID)
	valores := d.Valores
	matricula := campoConPrecarga(p, "profesional.matriculaNumero")
	for clave, valor := range valoresDeEjemploDeLaHistoria(t) {
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
