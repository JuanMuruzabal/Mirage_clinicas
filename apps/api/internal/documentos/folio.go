package documentos

import (
	"fmt"
	"strconv"

	"dental-mirage/api/internal/db"
)

// Folio — cómo se nombra el folio de un documento (Fase 5.6d). Un documento
// lleva el folio correlativo del paciente (Ley 26.529, art. 12); un anexo no
// consume folio: es el "x.y" de su historia —x, el folio de la historia; y, su
// número dentro de ella— y, mientras la historia no tiene folio, "Anexo Nº y".
// Sale del folio ACTUAL de la historia: el anexo pasa de "Anexo Nº 1" a "3.1"
// cuando su historia se sella.
type Folio struct {
	// Rotulo — "Folio" o, en un anexo cuya historia no tiene folio, "Anexo".
	Rotulo string
	// Valor — "3", "3.1" o "Nº 1"; vacío sin folio.
	Valor string
}

// FolioDe — el folio de d. folioDeLaHistoria solo cuenta en un anexo con su
// número; un anexo de antes de la numeración conserva el folio propio.
func FolioDe(d db.DocumentoClinico, folioDeLaHistoria *int) Folio {
	switch {
	case d.AnexoDe != nil && d.AnexoNumero != nil && folioDeLaHistoria != nil:
		return Folio{Rotulo: "Folio", Valor: fmt.Sprintf("%d.%d", *folioDeLaHistoria, *d.AnexoNumero)}
	case d.AnexoDe != nil && d.AnexoNumero != nil:
		return Folio{Rotulo: "Anexo", Valor: fmt.Sprintf("Nº %d", *d.AnexoNumero)}
	case d.Folio != nil:
		return Folio{Rotulo: "Folio", Valor: strconv.Itoa(*d.Folio)}
	}
	return Folio{Rotulo: "Folio"}
}

// String — con su rótulo, para un pie o un título: "Folio 3", "Folio 3.1",
// "Anexo Nº 1" o "".
func (f Folio) String() string {
	if f.Valor == "" {
		return ""
	}
	return f.Rotulo + " " + f.Valor
}

// Mostrado — lo que va en la columna Folio: "3", "3.1", "Anexo Nº 1" o "".
func (f Folio) Mostrado() string {
	if f.AnexoSinFolio() {
		return f.String()
	}
	return f.Valor
}

// AnexoSinFolio — un anexo cuya historia todavía no tiene folio: tiene su
// número, no un folio.
func (f Folio) AnexoSinFolio() bool { return f.Rotulo == "Anexo" }
