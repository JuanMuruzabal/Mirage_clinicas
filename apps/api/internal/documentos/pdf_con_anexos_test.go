package documentos

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// El PDF de una historia seguida de sus anexos (`?con=anexos`), sin base:
// GenerarPDFConAnexos une las partes en orden, con los mismos bytes en cada
// pedido.

// historiaConAnexos — una historia sellada (con el id de la que nombra el
// anexo de continuación de prueba), un anexo sellado de `anexo-de-prueba` y
// el anexo de continuación con dos anotaciones.
func historiaConAnexos(t *testing.T) (FuenteDelPDF, FuenteDelPDF, FuenteDeContinuacion) {
	t.Helper()
	continuacion := anexoDeContinuacionDePrueba(t)
	historia := selladoDePrueba(t, copiaSinOriginal(t), pacienteDePrueba)
	historia.Documento.ID = *continuacion.AnexoDe

	plantillaDelAnexo := *conducto(t)
	plantillaDelAnexo.ID = "anexo-de-prueba"
	plantillaDelAnexo.Tipo = TipoAnexo
	sellado := selladoDePrueba(t, &plantillaDelAnexo, pacienteDePrueba)
	sellado.Documento.ID = uuid.MustParse("12121212-0000-4000-8000-000000000007")
	sellado.Documento.AnexoDe = &historia.Documento.ID
	numero := 1
	sellado.Documento.AnexoNumero = &numero

	return historia, sellado, FuenteDeContinuacion{
		Documento: continuacion, Asientos: asientosEncadenados(t, continuacion, "Control a los 7 días", "Alta"),
	}
}

func generarConAnexos(t *testing.T, historia FuenteDelPDF, anexos ...FuenteDeAnexo) []byte {
	t.Helper()
	datos, err := GenerarPDFConAnexos(historia, anexos)
	if err != nil {
		t.Fatalf("GenerarPDFConAnexos: %v", err)
	}
	if !bytes.HasPrefix(datos, []byte("%PDF-")) || !bytes.HasSuffix(datos, []byte("%%EOF\n")) {
		t.Fatal("no es un PDF")
	}
	return datos
}

func TestGenerarPDFConAnexos_LasHojasSonLaSumaEnOrden(t *testing.T) {
	historia, sellado, continuacion := historiaConAnexos(t)
	soloHistoria := paginasDelPDF(t, generarPDF(t, historia))
	soloSellado := paginasDelPDF(t, generarPDF(t, sellado))
	soloContinuacion := paginasDelPDF(t, generarContinuacion(t, continuacion))

	// Un anexo de continuación junto a uno sellado: los dos tipos de parte.
	unidas := paginasDelPDF(t, generarConAnexos(t, historia, sellado, continuacion))
	esperadas := append(append(append([]string{}, soloHistoria...), soloSellado...), soloContinuacion...)
	if len(unidas) != len(esperadas) {
		t.Fatalf("hojas: %d, esperaba %d (%d + %d + %d)", len(unidas), len(esperadas), len(soloHistoria), len(soloSellado), len(soloContinuacion))
	}
	// Cada hoja es la de su parte, en el orden pedido.
	for i := range esperadas {
		if textosDe(unidas[i]) != textosDe(esperadas[i]) {
			t.Fatalf("la hoja %d no es la de su parte:\n%s\n---\n%s", i+1, textosDe(unidas[i]), textosDe(esperadas[i]))
		}
	}
	if !strings.Contains(textosDe(unidas[len(unidas)-1]), "Alta") {
		t.Error("la última hoja tendría que ser la del anexo de continuación, con su última anotación")
	}

	// Otro orden, otras hojas.
	alReves := paginasDelPDF(t, generarConAnexos(t, historia, continuacion, sellado))
	if textosDe(alReves[len(soloHistoria)]) != textosDe(soloContinuacion[0]) {
		t.Error("con la continuación primero, la hoja que sigue a la historia tendría que ser la suya")
	}
}

func TestGenerarPDFConAnexos_EsDeterminista(t *testing.T) {
	historia, sellado, continuacion := historiaConAnexos(t)
	a := generarConAnexos(t, historia, sellado, continuacion)
	b := generarConAnexos(t, historia, sellado, continuacion)
	if !bytes.Equal(a, b) {
		t.Fatal("dos pedidos iguales dieron bytes distintos")
	}
	// Y no es el PDF de la historia sola ni el de un solo anexo.
	if bytes.Equal(a, generarPDF(t, historia)) || bytes.Equal(a, generarConAnexos(t, historia, sellado)) {
		t.Error("con sus anexos tendría que ser otro PDF")
	}
	// Una anotación más cambia los bytes.
	otra := continuacion
	otra.Asientos = asientosEncadenados(t, continuacion.Documento, "Control a los 7 días", "Alta", "Otra")
	if bytes.Equal(a, generarConAnexos(t, historia, sellado, otra)) {
		t.Error("una anotación más tendría que cambiar el PDF")
	}
}

func TestGenerarPDFConAnexos_SinAnexosDespuesDeLosErroresDeLaHistoria(t *testing.T) {
	historia, _, _ := historiaConAnexos(t)
	if _, err := GenerarPDFConAnexos(historia, nil); !errors.Is(err, ErrSinAnexosConPDF) {
		t.Errorf("sin anexos = %v, esperaba ErrSinAnexosConPDF", err)
	}
	// Una historia que no tiene PDF falla por lo suyo, no por los anexos.
	rota := historia
	rota.Plantilla = nil
	if _, err := GenerarPDFConAnexos(rota, nil); err == nil || errors.Is(err, ErrSinAnexosConPDF) {
		t.Errorf("una historia sin plantilla = %v, esperaba su propio error", err)
	}
	sinComposicion := historia
	sinLamina := *historia.Plantilla
	sinLamina.Lamina = nil
	sinComposicion.Plantilla = &sinLamina
	if _, err := GenerarPDFConAnexos(sinComposicion, nil); !errors.Is(err, ErrPlantillaSinLamina) {
		t.Errorf("una historia sin lámina = %v, esperaba ErrPlantillaSinLamina", err)
	}
}

func TestGenerarPDFConAnexos_RechazaUnAnexoDeOtraHistoria(t *testing.T) {
	historia, sellado, continuacion := historiaConAnexos(t)
	otraHistoria := uuid.MustParse("34343434-0000-4000-8000-000000000008")

	ajeno := sellado
	ajeno.Documento.AnexoDe = &otraHistoria
	if _, err := GenerarPDFConAnexos(historia, []FuenteDeAnexo{continuacion, ajeno}); err == nil || !strings.Contains(err.Error(), "no es anexo de la historia") {
		t.Errorf("un anexo de otra historia = %v, esperaba un rechazo", err)
	}
	suelto := sellado
	suelto.Documento.AnexoDe = nil
	if _, err := GenerarPDFConAnexos(historia, []FuenteDeAnexo{suelto}); err == nil {
		t.Error("un documento que no es anexo tendría que rechazarse")
	}
	// Un anexo de la historia sin PDF: el error dice cuál.
	sinPDF := continuacion
	sinPDF.Documento.AnexoNumero = nil
	if _, err := GenerarPDFConAnexos(historia, []FuenteDeAnexo{sinPDF}); !errors.Is(err, ErrNoEsContinuacion) || !strings.Contains(err.Error(), sinPDF.Documento.ID.String()) {
		t.Errorf("un anexo sin PDF = %v, esperaba ErrNoEsContinuacion con su id", err)
	}
}
