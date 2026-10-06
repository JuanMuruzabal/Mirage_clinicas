package documentos

import (
	"testing"

	"dental-mirage/api/internal/db"

	"github.com/google/uuid"
)

// FolioDe (5.6d): un documento con su folio, un anexo con el "x.y" de su
// historia o, sin el folio de la historia, "Anexo Nº y"; un anexo sin número
// (de antes de la numeración) conserva el folio propio.
func TestFolioDe(t *testing.T) {
	entero := func(n int) *int { return &n }
	historia := uuid.New()
	casos := []struct {
		caso            string
		doc             db.DocumentoClinico
		folioHistoria   *int
		rotulo, valor   string
		texto, mostrado string
		anexoSinFolio   bool
	}{
		{"historia con folio", db.DocumentoClinico{Folio: entero(3)}, nil, "Folio", "3", "Folio 3", "3", false},
		{"historia con folio: el de la historia no cuenta", db.DocumentoClinico{Folio: entero(3)}, entero(9), "Folio", "3", "Folio 3", "3", false},
		{"sin folio", db.DocumentoClinico{}, nil, "Folio", "", "", "", false},
		{"anexo con el folio de su historia", db.DocumentoClinico{AnexoDe: &historia, AnexoNumero: entero(2)}, entero(3), "Folio", "3.2", "Folio 3.2", "3.2", false},
		{"anexo con la historia sin folio", db.DocumentoClinico{AnexoDe: &historia, AnexoNumero: entero(1)}, nil, "Anexo", "Nº 1", "Anexo Nº 1", "Anexo Nº 1", true},
		{"anexo de antes de la numeración", db.DocumentoClinico{AnexoDe: &historia, Folio: entero(27)}, entero(3), "Folio", "27", "Folio 27", "27", false},
		{"número sin historia: no es anexo", db.DocumentoClinico{AnexoNumero: entero(4)}, entero(3), "Folio", "", "", "", false},
	}
	for _, c := range casos {
		t.Run(c.caso, func(t *testing.T) {
			f := FolioDe(c.doc, c.folioHistoria)
			if f.Rotulo != c.rotulo || f.Valor != c.valor {
				t.Errorf("FolioDe = %+v, se esperaba %q %q", f, c.rotulo, c.valor)
			}
			if f.String() != c.texto {
				t.Errorf("String() = %q, se esperaba %q", f.String(), c.texto)
			}
			if f.Mostrado() != c.mostrado {
				t.Errorf("Mostrado() = %q, se esperaba %q", f.Mostrado(), c.mostrado)
			}
			if f.AnexoSinFolio() != c.anexoSinFolio {
				t.Errorf("AnexoSinFolio() = %v", f.AnexoSinFolio())
			}
		})
	}
}
