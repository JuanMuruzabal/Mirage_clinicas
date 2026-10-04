package documentos

import (
	"embed"
	"fmt"
)

// Las páginas originales del Colegio, como JPEG, para dibujar el PDF de un
// documento terminado (Fase 5.3), que se genera en cada descarga. Las genera
// scripts/originales-para-la-api.py desde las imágenes que ya usa la web:
// la versión vigente de cada plantilla con lámina, más las versiones viejas
// con documentos terminados (el consentimiento de conducto v1, que se selló
// antes de TR-188, y la historia clínica general v1). Cada página va en escala de grises si el original es en
// blanco y negro, y en color si no, a 200 dpi del tamaño de la página: el PDF
// la dibuja a página completa, en puntos, sea cual sea su resolución.
//
// Van por versión de plantilla, como en la web: un documento sellado se
// dibuja sobre la página que se firmó. <n> es el número de página de la
// LÁMINA (1, 2, …), no el del PDF del Colegio.
//
//go:embed originales
var originales embed.FS

// versionDePlantilla — una plantilla en una versión puntual.
type versionDePlantilla struct {
	id      string
	version int
}

// mismasPaginas — las versiones que se dibujan sobre las páginas de otra, y
// por eso no se embeben: serían los mismos bytes dos veces en el binario.
//
//   - El consentimiento de conducto v2 sale del mismo PDF del Colegio y de la
//     misma página que el v1: la v2 solo cambió los campos de la plantilla
//     (TR-189), no el papel.
//   - La historia clínica general v2 dibuja sobre las páginas de la v1: solo
//     movió el bloque de la firma del profesional (Fase 5.6a).
//
// Es la misma tabla que MISMAS_PAGINAS en scripts/originales-para-la-api.py,
// que no copia estas versiones y comprueba en el manifiesto de la web que de
// verdad compartan archivo y páginas. Si una versión nueva cambia el papel,
// sale de las dos tablas y el script le copia sus páginas.
var mismasPaginas = map[versionDePlantilla]versionDePlantilla{
	{"consentimiento-tratamiento-conducto", 2}: {"consentimiento-tratamiento-conducto", 1},
	{"historia-clinica-general", 2}:            {"historia-clinica-general", 1},
}

// PaginaOriginal — el JPEG de la página n (desde 1) de la lámina de esa
// plantilla y versión, o false si no está embebida (por ejemplo, una
// plantilla de prueba de los tests): entonces el PDF dibuja la página en
// blanco con la composición encima. Una versión de mismasPaginas devuelve
// la página de la versión cuyo papel comparte.
func PaginaOriginal(plantillaID string, version, n int) ([]byte, bool) {
	if otra, ok := mismasPaginas[versionDePlantilla{plantillaID, version}]; ok {
		plantillaID, version = otra.id, otra.version
	}
	datos, err := originales.ReadFile(fmt.Sprintf("originales/%s/v%d/pagina-%d.jpg", plantillaID, version, n))
	if err != nil {
		return nil, false
	}
	return datos, true
}
