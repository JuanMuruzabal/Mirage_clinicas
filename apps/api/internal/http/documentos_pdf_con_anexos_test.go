package http

import (
	"bytes"
	"compress/zlib"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"dental-mirage/api/internal/db"
)

// `GET /documentos/{id}/pdf?con=anexos`: una historia clínica terminada
// seguida de los anexos con PDF que ve quien pide, por número, con un evento
// "exportado" por documento incluido.

func descargarConAnexos(e escenarioDocs, t *testing.T, token, id, query string) (int, http.Header, []byte) {
	t.Helper()
	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+id+"/pdf"+query, token, nil)
	return rec.Code, rec.Header(), rec.Body.Bytes()
}

// textoDelPDF — lo que escriben todas las páginas, descomprimido y en orden
// (las cadenas de un Tj van en WinAnsi: los marcadores del test son ASCII).
func textoDelPDF(t *testing.T, datos []byte) string {
	t.Helper()
	re := regexp.MustCompile(`<< /Filter /FlateDecode /Length (\d+) >>\nstream\n`)
	var b strings.Builder
	for _, idx := range re.FindAllSubmatchIndex(datos, -1) {
		largo, _ := strconv.Atoi(string(datos[idx[2]:idx[3]]))
		z, err := zlib.NewReader(bytes.NewReader(datos[idx[1] : idx[1]+largo]))
		if err != nil {
			t.Fatal(err)
		}
		plano, err := io.ReadAll(z)
		if err != nil {
			t.Fatal(err)
		}
		b.Write(plano)
		b.WriteString("\n")
	}
	return b.String()
}

func todosLosExportados(t *testing.T, e escenarioDocs, id string) int64 {
	t.Helper()
	var n int64
	if err := e.gdb.Model(&db.DocumentoEvento{}).Where("documento_id = ? AND tipo = ?", id, db.EventoDocumentoExportado).Count(&n).Error; err != nil {
		t.Fatal(err)
	}
	return n
}

// historiaConSusAnexos — una historia sellada con un anexo sellado (Nº 1), un
// anexo de continuación con una anotación (Nº 2) y el borrador de un anexo de
// un colega (Nº 3), que no veo y no tiene PDF.
type historiaConSusAnexos struct {
	historia, sellado, continuacion, borradorDelColega documentoDetalleResponse
}

func armarHistoriaConSusAnexos(t *testing.T, e escenarioDocs, colega string) historiaConSusAnexos {
	t.Helper()
	var h historiaConSusAnexos
	h.historia = e.completarYSellarDe(t, e.token, plantillaHistoriaContinuable, e.paciente.ID)
	codigo, suelto, cuerpo := e.pedirAnexo(t, e.token, e.paciente.ID, h.historia.ID)
	if codigo != http.StatusCreated {
		t.Fatalf("el anexo suelto: %d %s", codigo, cuerpo)
	}
	h.sellado = e.sellarBorrador(t, e.token, suelto)
	codigo, h.continuacion = e.continuar(t, e.token, h.historia.ID, "plan")
	if codigo != http.StatusCreated {
		t.Fatalf("la continuación: %d", codigo)
	}
	if rec := e.asentar(t, e.token, h.continuacion.ID, "Control a los siete dias"); rec.Code != http.StatusCreated {
		t.Fatalf("la anotación: %d %s", rec.Code, rec.Body.String())
	}
	codigo, h.borradorDelColega, cuerpo = e.pedirAnexo(t, colega, e.paciente.ID, h.historia.ID)
	if codigo != http.StatusCreated {
		t.Fatalf("el borrador del colega: %d %s", codigo, cuerpo)
	}
	for i, d := range []documentoDetalleResponse{h.sellado, h.continuacion, h.borradorDelColega} {
		if d.AnexoNumero == nil || *d.AnexoNumero != i+1 {
			t.Fatalf("el anexo %d tiene el número %v", i+1, d.AnexoNumero)
		}
	}
	return h
}

func TestDocumentoPDFConAnexos_LaHistoriaYLosAnexosQueVeoEnOrden(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-con-anexos")
	colega, _ := e.colegaConPerfil(t, "pdf-con-anexos-colega@example.com")
	h := armarHistoriaConSusAnexos(t, e, colega)

	codigo, cabeceras, datos := descargarConAnexos(e, t, e.token, h.historia.ID, "?con=anexos")
	if codigo != http.StatusOK || !bytes.HasPrefix(datos, []byte("%PDF-")) {
		t.Fatalf("la descarga: %d %s", codigo, datos)
	}
	esperado := fmt.Sprintf(`attachment; filename="historia-clinica-historia-continuable-de-prueba-folio-%d-con-anexos.pdf"`, *h.historia.Folio)
	if cabeceras.Get("Content-Disposition") != esperado {
		t.Errorf("Content-Disposition = %q, esperaba %q", cabeceras.Get("Content-Disposition"), esperado)
	}
	if cabeceras.Get("Content-Type") != "application/pdf" || cabeceras.Get("Cache-Control") != "no-store" {
		t.Errorf("cabeceras: %v", cabeceras)
	}

	// La historia, después el anexo Nº 1 (sellado) y después el Nº 2 (la
	// continuación, con su anotación).
	texto := textoDelPDF(t, datos)
	historia := strings.Index(texto, "Historia continuable de prueba")
	anexo := strings.Index(texto, "Anexo de prueba")
	anotacion := strings.Index(texto, "Control a los siete dias")
	if historia < 0 || anexo < 0 || anotacion < 0 || historia >= anexo || anexo >= anotacion {
		t.Fatalf("el orden de las partes: historia %d, anexo %d, anotación %d", historia, anexo, anotacion)
	}
	// Mismos bytes en cada pedido, y para el colega, que ve lo mismo (su
	// borrador no tiene PDF).
	if _, _, otra := descargarConAnexos(e, t, e.token, h.historia.ID, "?con=anexos"); !bytes.Equal(datos, otra) {
		t.Fatal("dos descargas iguales dieron bytes distintos")
	}
	if codigo, _, delColega := descargarConAnexos(e, t, colega, h.historia.ID, "?con=anexos"); codigo != http.StatusOK || !bytes.Equal(datos, delColega) {
		t.Fatalf("el colega: %d, mismos bytes %v", codigo, bytes.Equal(datos, delColega))
	}

	// Un evento por documento incluido y por descarga, con su detalle; el
	// borrador, ninguno.
	for _, id := range []string{h.historia.ID, h.sellado.ID, h.continuacion.ID} {
		if n := eventosExportado(t, e, id, "pdf con anexos"); n != 3 {
			t.Errorf("exportados de %s: %d, esperaba 3", id, n)
		}
	}
	if n := todosLosExportados(t, e, h.borradorDelColega.ID); n != 0 {
		t.Errorf("el borrador del colega no se exportó: %d eventos", n)
	}
}

func TestDocumentoPDFConAnexos_ParaImprimirEsInline(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-con-anexos-imprimir")
	colega, _ := e.colegaConPerfil(t, "pdf-con-anexos-imprimir-colega@example.com")
	h := armarHistoriaConSusAnexos(t, e, colega)

	codigo, cabeceras, _ := descargarConAnexos(e, t, e.token, h.historia.ID, "?para=imprimir&con=anexos")
	if codigo != http.StatusOK {
		t.Fatalf("la impresión: %d", codigo)
	}
	esperado := fmt.Sprintf(`inline; filename="historia-clinica-historia-continuable-de-prueba-folio-%d-con-anexos.pdf"`, *h.historia.Folio)
	if cabeceras.Get("Content-Disposition") != esperado {
		t.Errorf("Content-Disposition = %q, esperaba %q", cabeceras.Get("Content-Disposition"), esperado)
	}
	for _, id := range []string{h.historia.ID, h.sellado.ID, h.continuacion.ID} {
		if n := eventosExportado(t, e, id, "impresión con anexos"); n != 1 {
			t.Errorf("impresiones de %s: %d, esperaba 1", id, n)
		}
		if n := todosLosExportados(t, e, id); n != 1 {
			t.Errorf("exportados de %s: %d, esperaba solo la impresión", id, n)
		}
	}
}

func TestDocumentoPDFConAnexos_TienePDFEnLosAnexosDelResumen(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-con-anexos-resumen")
	colega, _ := e.colegaConPerfil(t, "pdf-con-anexos-resumen-colega@example.com")
	h := armarHistoriaConSusAnexos(t, e, colega)

	anexos := e.leer(t, e.token, h.historia.ID).Anexos
	tienen := map[string]bool{}
	for _, a := range anexos {
		tienen[a.ID] = a.TienePDF
	}
	if len(anexos) != 2 || !tienen[h.sellado.ID] || !tienen[h.continuacion.ID] {
		t.Fatalf("los anexos que veo, con su PDF: %+v", anexos)
	}
	// En la lista del paciente, la historia trae sus anexos con "tienePDF".
	rec := doJSONAuth(t, e.router, http.MethodGet, "/pacientes/"+e.paciente.ID.String()+"/documentos", e.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("la lista del paciente: %d %s", rec.Code, rec.Body.String())
	}
	encontrada := false
	for _, d := range decodificar[[]documentoResumenResponse](t, rec.Body.Bytes()) {
		if d.ID != h.historia.ID {
			continue
		}
		encontrada = true
		if len(d.Anexos) != 2 || !d.Anexos[0].TienePDF || !d.Anexos[1].TienePDF {
			t.Fatalf("los anexos de la historia en la lista: %+v", d.Anexos)
		}
	}
	if !encontrada || !strings.Contains(rec.Body.String(), `"tienePDF":true`) {
		t.Fatalf("la historia en la lista: %s", rec.Body.String())
	}
	// El colega ve su borrador entre los anexos, sin PDF.
	for _, a := range e.leer(t, colega, h.historia.ID).Anexos {
		if a.ID == h.borradorDelColega.ID && a.TienePDF {
			t.Fatal("un borrador no tiene PDF")
		}
	}
}

func TestDocumentoPDFConAnexos_Rechazos(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-con-anexos-rechazos")
	colega, _ := e.colegaConPerfil(t, "pdf-con-anexos-rechazos-colega@example.com")
	h := armarHistoriaConSusAnexos(t, e, colega)
	papel := e.consentimientoParaImprimir(t)
	// Una historia cuyo único anexo es un borrador: no tiene anexos con PDF.
	// Lo pide el titular: el colega ya tiene su borrador único en la otra
	// historia, y uno nuevo daría 409.
	sinAnexos := e.completarYSellarDe(t, e.token, plantillaHistoriaContinuable, e.paciente.ID)
	if codigo, _, cuerpo := e.pedirAnexo(t, e.token, e.paciente.ID, sinAnexos.ID); codigo != http.StatusCreated {
		t.Fatalf("el borrador: %d %s", codigo, cuerpo)
	}

	const soloHistoria = "solo una historia clínica se descarga con sus anexos"
	const sinAnexosConPDF = "esta historia no tiene anexos con PDF"
	for _, c := range []struct {
		nombre, id, query string
		codigo            int
		mensaje           string
	}{
		{"otro valor de con", h.historia.ID, "?con=todo", http.StatusBadRequest, `"con" solo admite "anexos"`},
		{"con en mayúsculas", h.historia.ID, "?con=ANEXOS", http.StatusBadRequest, `"con" solo admite "anexos"`},
		{"un anexo sellado", h.sellado.ID, "?con=anexos", http.StatusConflict, soloHistoria},
		{"un anexo de continuación", h.continuacion.ID, "?con=anexos", http.StatusConflict, soloHistoria},
		{"un consentimiento", papel.ID, "?con=anexos", http.StatusConflict, soloHistoria},
		{"una historia sin anexos con PDF", sinAnexos.ID, "?con=anexos", http.StatusConflict, sinAnexosConPDF},
		{"sin anexos con PDF, para imprimir", sinAnexos.ID, "?para=imprimir&con=anexos", http.StatusConflict, sinAnexosConPDF},
	} {
		t.Run(c.nombre, func(t *testing.T) {
			codigo, _, cuerpo := descargarConAnexos(e, t, e.token, c.id, c.query)
			if codigo != c.codigo || mensajeDeError(t, cuerpo) != c.mensaje {
				t.Fatalf("%d %s, esperaba %d con %q", codigo, cuerpo, c.codigo, c.mensaje)
			}
		})
	}
	// Ningún error dejó un evento.
	for _, id := range []string{h.historia.ID, h.sellado.ID, h.continuacion.ID, papel.ID, sinAnexos.ID} {
		if n := todosLosExportados(t, e, id); n != 0 {
			t.Errorf("exportados de %s después de un error: %d", id, n)
		}
	}
}
