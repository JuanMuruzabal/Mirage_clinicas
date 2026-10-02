package documentos

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"unicode/utf16"

	"dental-mirage/api/internal/db"
)

// Dos casos de documentos viejos (Fase 5.3, correcciones):
//   - un consentimiento para imprimir terminado antes de TR-188, sin folio;
//   - un documento terminado antes de que se congelara la composición de la
//     lámina (TR-187 decisión 14), que no tiene PDF (ErrSinComposicion).
// Y los errores tipados de GenerarPDF, que el handler traduce a 409 / 500.

// tituloEnInfo — el /Title del PDF como lo escribe internal/pdf (UTF-16BE
// en hexadecimal con BOM).
func tituloEnInfo(texto string) string {
	var b strings.Builder
	b.WriteString("/Title <FEFF")
	for _, u := range utf16.Encode([]rune(texto)) {
		fmt.Fprintf(&b, "%04X", u)
	}
	b.WriteString(">")
	return b.String()
}

func TestGenerarPDF_ParaImprimirSinFolio(t *testing.T) {
	p := conducto(t)
	f := paraImprimirDePrueba(t, p)
	f.Documento.Folio = nil

	datos := generarPDF(t, f)
	paginas := paginasDelPDF(t, datos)
	laminas := len(p.Lamina.Paginas)
	if len(paginas) != laminas {
		t.Fatalf("%d hojas, esperaba las %d de la lámina", len(paginas), laminas)
	}
	for i, pag := range paginas {
		textos := textosDe(pag)
		pie := fmt.Sprintf("Hoja %d de %d", i+1, laminas)
		if !strings.Contains(textos, pie) {
			t.Errorf("hoja %d sin el pie %q:\n%s", i+1, pie, textos)
		}
		if strings.Contains(textos, "Folio") {
			t.Errorf("hoja %d dice \"Folio\" en un documento sin folio:\n%s", i+1, textos)
		}
	}
	// El título: el nombre con su tipo, sin " · folio N" (ni "folio 0").
	nombre := NombreConTipo(p.Tipo, p.Nombre)
	if !bytes.Contains(datos, []byte(tituloEnInfo(nombre))) {
		t.Errorf("el /Title no es el nombre sin folio %q", nombre)
	}
	if bytes.Contains(datos, []byte(tituloEnInfo(nombre+" · folio 0"))) {
		t.Error("el /Title dice folio 0")
	}

	// Determinista.
	otra := paraImprimirDePrueba(t, p)
	otra.Documento.Folio = nil
	if !bytes.Equal(datos, generarPDF(t, otra)) {
		t.Fatal("dos generaciones del mismo consentimiento sin folio dieron bytes distintos")
	}
	// Y no es el mismo archivo que con folio.
	if bytes.Equal(datos, generarPDF(t, paraImprimirDePrueba(t, p))) {
		t.Fatal("con folio y sin folio dieron el mismo PDF")
	}
	// Con folio el título sí lo lleva.
	conFolio := generarPDF(t, paraImprimirDePrueba(t, p))
	if !bytes.Contains(conFolio, []byte(tituloEnInfo(nombre+" · folio 7"))) {
		t.Error("con folio, el /Title tiene que decir \"· folio 7\"")
	}
}

// Un sellado sin folio sigue siendo un error (chk_documento_sellado_completo
// lo garantiza): la excepción es solo para uno para imprimir.
func TestGenerarPDF_SelladoSinFolioSigueSiendoIncompleto(t *testing.T) {
	f := selladoDePrueba(t, conducto(t), pacienteDePrueba)
	f.Documento.Folio = nil
	_, err := GenerarPDF(f)
	var inc *DocumentoIncompletoError
	if !errors.As(err, &inc) {
		t.Fatalf("err = %v, esperaba DocumentoIncompletoError", err)
	}
	if !strings.Contains(inc.Falta, "folio") {
		t.Errorf("Falta = %q, tiene que decir que falta el folio", inc.Falta)
	}
}

func TestGenerarPDF_ErroresTipados(t *testing.T) {
	p := conducto(t)

	// No terminado: ErrDocumentoNoTerminado, con el estado en el texto.
	for _, estado := range []string{db.DocumentoBorrador, db.DocumentoAFirmar, db.DocumentoAnulado} {
		f := selladoDePrueba(t, p, pacienteDePrueba)
		f.Documento.Estado = estado
		_, err := GenerarPDF(f)
		if !errors.Is(err, ErrDocumentoNoTerminado) {
			t.Errorf("%s: err = %v, esperaba ErrDocumentoNoTerminado", estado, err)
			continue
		}
		if !strings.Contains(err.Error(), estado) {
			t.Errorf("%s: el error no dice el estado: %v", estado, err)
		}
	}

	// Lo que el estado garantiza y falta: DocumentoIncompletoError, con un
	// Falta que dice qué (y no el engañoso "solo un documento terminado").
	casos := []struct {
		nombre, falta string
		fuente        func() FuenteDelPDF
	}{
		{"sellado sin contenido", "contenido congelado", func() FuenteDelPDF {
			f := selladoDePrueba(t, p, pacienteDePrueba)
			f.Documento.ContenidoCanonico = nil
			return f
		}},
		{"sellado sin huella del contenido", "huella de su contenido", func() FuenteDelPDF {
			f := selladoDePrueba(t, p, pacienteDePrueba)
			f.Documento.HashContenido = nil
			return f
		}},
		{"sellado sin sello", "huella de su sello", func() FuenteDelPDF {
			f := selladoDePrueba(t, p, pacienteDePrueba)
			f.Documento.HashSello = nil
			return f
		}},
		{"sellado sin fecha del sello", "fecha del sello", func() FuenteDelPDF {
			f := selladoDePrueba(t, p, pacienteDePrueba)
			f.Documento.SelladoEn = nil
			return f
		}},
		{"sellado sin cadena", "eslabón", func() FuenteDelPDF {
			f := selladoDePrueba(t, p, pacienteDePrueba)
			f.Documento.CadenaN = nil
			return f
		}},
		{"sello que no es SHA-256", "SHA-256", func() FuenteDelPDF {
			f := selladoDePrueba(t, p, pacienteDePrueba)
			s := "no-es-una-huella"
			f.Documento.HashSello = &s
			return f
		}},
		{"para imprimir sin fecha de terminado", "fecha en que se terminó", func() FuenteDelPDF {
			f := paraImprimirDePrueba(t, p)
			f.Documento.TerminadoEn = nil
			return f
		}},
		{"para imprimir con huella no hex", "no es hexadecimal", func() FuenteDelPDF {
			f := paraImprimirDePrueba(t, p)
			s := "zz-no-es-hex"
			f.Documento.HashContenido = &s
			return f
		}},
	}
	for _, c := range casos {
		_, err := GenerarPDF(c.fuente())
		var inc *DocumentoIncompletoError
		if !errors.As(err, &inc) {
			t.Errorf("%s: err = %v, esperaba DocumentoIncompletoError", c.nombre, err)
			continue
		}
		if !strings.Contains(inc.Falta, c.falta) {
			t.Errorf("%s: Falta = %q, esperaba que dijera %q", c.nombre, inc.Falta, c.falta)
		}
		if strings.Contains(err.Error(), "solo un documento terminado") {
			t.Errorf("%s: el error dice que no está terminado: %v", c.nombre, err)
		}
		if !strings.HasPrefix(err.Error(), "no se puede generar el PDF: ") {
			t.Errorf("%s: Error() = %q", c.nombre, err.Error())
		}
	}

	// El contenido ilegible lleva la causa (Unwrap).
	f := selladoDePrueba(t, p, pacienteDePrueba)
	roto := "{no es json"
	f.Documento.ContenidoCanonico = &roto
	_, err := GenerarPDF(f)
	var inc *DocumentoIncompletoError
	if !errors.As(err, &inc) || inc.Causa == nil {
		t.Fatalf("contenido roto: err = %v, esperaba DocumentoIncompletoError con causa", err)
	}
	var sintaxis *json.SyntaxError
	if !errors.As(err, &sintaxis) {
		t.Errorf("la causa no se desenvuelve hasta el error de JSON: %v", err)
	}
	if !strings.Contains(err.Error(), inc.Falta+": ") {
		t.Errorf("Error() no lleva la causa después de lo que falta: %q", err.Error())
	}

	// Sin plantilla: un error que no es ninguno de los tipados.
	f = selladoDePrueba(t, p, pacienteDePrueba)
	f.Plantilla = nil
	_, err = GenerarPDF(f)
	if err == nil || errors.Is(err, ErrPlantillaSinLamina) || errors.Is(err, ErrSinComposicion) || errors.As(err, &inc) {
		t.Errorf("sin plantilla: err = %v", err)
	}
}

// contenidoCon — el contenido congelado de f con la clave `lamina`
// cambiada: quitar (crudo vacío) o reemplazar por ese JSON.
func contenidoCon(t *testing.T, f FuenteDelPDF, crudo string) string {
	t.Helper()
	var m map[string]json.RawMessage
	if err := json.Unmarshal([]byte(*f.Documento.ContenidoCanonico), &m); err != nil {
		t.Fatal(err)
	}
	if _, ok := m["lamina"]; !ok {
		t.Fatal("el contenido de prueba no trae la lámina")
	}
	if crudo == "" {
		delete(m, "lamina")
	} else {
		m["lamina"] = json.RawMessage(crudo)
	}
	b, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestGenerarPDF_SinComposicion(t *testing.T) {
	p := conducto(t)
	for _, base := range []struct {
		nombre string
		fuente func() FuenteDelPDF
	}{
		{"sellado", func() FuenteDelPDF { return selladoDePrueba(t, p, pacienteDePrueba) }},
		{"para imprimir", func() FuenteDelPDF { return paraImprimirDePrueba(t, p) }},
	} {
		for _, lamina := range []struct{ nombre, crudo string }{
			{"sin la clave", ""},
			{"null", "null"},
			{"vacía", "[]"},
		} {
			f := base.fuente()
			c := contenidoCon(t, f, lamina.crudo)
			f.Documento.ContenidoCanonico = &c
			datos, err := GenerarPDF(f)
			if !errors.Is(err, ErrSinComposicion) {
				t.Errorf("%s, lámina %s: err = %v, esperaba ErrSinComposicion", base.nombre, lamina.nombre, err)
			}
			if datos != nil {
				t.Errorf("%s, lámina %s: devolvió bytes", base.nombre, lamina.nombre)
			}
			if TienePDF(f.Documento, p) {
				t.Errorf("%s, lámina %s: TienePDF = true y GenerarPDF no lo da", base.nombre, lamina.nombre)
			}
		}
	}
	if !strings.Contains(ErrSinComposicion.Error(), "se ve en pantalla") {
		t.Errorf("mensaje de ErrSinComposicion: %q", ErrSinComposicion.Error())
	}
}

// Una plantilla con lámina pero SIN zonas no pide composición: su PDF sale
// aunque el contenido no traiga `lamina`.
func TestGenerarPDF_PlantillaSinZonasNoPideComposicion(t *testing.T) {
	p := conducto(t)
	sinZonas := *p
	lam := *p.Lamina
	lam.Zonas = nil
	sinZonas.Lamina = &lam

	f := paraImprimirDePrueba(t, p)
	c := contenidoCon(t, f, "")
	f.Documento.ContenidoCanonico = &c
	f.Plantilla = &sinZonas
	if !TienePDF(f.Documento, &sinZonas) {
		t.Error("TienePDF = false con una plantilla sin zonas")
	}
	datos := generarPDF(t, f)
	if n := len(paginasDelPDF(t, datos)); n != len(lam.Paginas) {
		t.Errorf("%d hojas, esperaba %d", n, len(lam.Paginas))
	}
}

func TestTienePDF(t *testing.T) {
	p := conducto(t)
	sellado := selladoDePrueba(t, p, pacienteDePrueba).Documento
	papel := paraImprimirDePrueba(t, p).Documento

	if !TienePDF(sellado, p) {
		t.Error("un sellado con composición tiene PDF")
	}
	if !TienePDF(papel, p) {
		t.Error("uno para imprimir con composición tiene PDF")
	}
	sinFolio := papel
	sinFolio.Folio = nil
	if !TienePDF(sinFolio, p) {
		t.Error("uno para imprimir sin folio (anterior a TR-188) tiene PDF")
	}

	// Estados no terminados: nunca, aunque el contenido traiga la lámina.
	for _, estado := range []string{db.DocumentoBorrador, db.DocumentoAFirmar, db.DocumentoAnulado} {
		d := sellado
		d.Estado = estado
		if TienePDF(d, p) {
			t.Errorf("%s: TienePDF = true", estado)
		}
	}

	// La plantilla: nula, sin lámina, lámina sin páginas.
	if TienePDF(sellado, nil) {
		t.Error("sin plantilla: TienePDF = true")
	}
	sinLamina := *p
	sinLamina.Lamina = nil
	if TienePDF(sellado, &sinLamina) {
		t.Error("plantilla sin lámina: TienePDF = true")
	}
	sinPaginas := *p
	sinPaginas.Lamina = &Lamina{Zonas: p.Lamina.Zonas}
	if TienePDF(sellado, &sinPaginas) {
		t.Error("lámina sin páginas: TienePDF = true")
	}

	// El contenido: nulo, ilegible, sin clave, null, vacía, con espacios.
	sinContenido := sellado
	sinContenido.ContenidoCanonico = nil
	if TienePDF(sinContenido, p) {
		t.Error("sin contenido: TienePDF = true")
	}
	roto := sellado
	s := "{no es json"
	roto.ContenidoCanonico = &s
	if TienePDF(roto, p) {
		t.Error("contenido ilegible: TienePDF = true")
	}
	f := selladoDePrueba(t, p, pacienteDePrueba)
	for _, crudo := range []string{"", "null", "[]", " null ", "[ ]"} {
		d := f.Documento
		c := contenidoCon(t, f, crudo)
		d.ContenidoCanonico = &c
		// json.Marshal compacta el RawMessage: " null " y "[ ]" llegan
		// como "null" y "[]", igual que los escribiría la API.
		got := TienePDF(d, p)
		if got {
			t.Errorf("lámina %q: TienePDF = true", crudo)
		}
	}
}
