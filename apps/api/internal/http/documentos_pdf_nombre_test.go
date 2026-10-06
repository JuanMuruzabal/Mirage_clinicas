package http

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/documentos"
)

// TestNombreDeArchivoDelPDF_Paridad — el nombre del PDF lo pone la API en
// el Content-Disposition, y la web lo calcula ANTES de pedirlo (el "Guardar
// como" de la app instalada se abre dentro del clic, sin respuesta todavía:
// `nombreDeArchivoDelPDF` de apps/web/src/lib/pdf-de-documentos.ts). Los dos
// tienen que dar lo mismo, así que leen la MISMA tabla:
// testdata/nombres-de-archivo-del-pdf.json, que también lee
// apps/web/src/lib/pdf-de-documentos.test.ts.
func TestNombreDeArchivoDelPDF_Paridad(t *testing.T) {
	crudo, err := os.ReadFile("testdata/nombres-de-archivo-del-pdf.json")
	if err != nil {
		t.Fatalf("leer la tabla: %v", err)
	}
	var tabla struct {
		Casos []struct {
			Caso            string `json:"caso"`
			Tipo            string `json:"tipo"`
			PlantillaNombre string `json:"plantillaNombre"`
			Folio           *int   `json:"folio"`
			AnexoNumero     *int   `json:"anexoNumero"`
			FolioHistoria   *int   `json:"folioHistoria"`
			Esperado        string `json:"esperado"`
		} `json:"casos"`
	}
	if err := json.Unmarshal(crudo, &tabla); err != nil {
		t.Fatalf("parsear la tabla: %v", err)
	}
	if len(tabla.Casos) == 0 {
		t.Fatal("la tabla no tiene casos")
	}
	for _, c := range tabla.Casos {
		t.Run(c.Caso, func(t *testing.T) {
			p := &documentos.Plantilla{Tipo: c.Tipo, Nombre: c.PlantillaNombre}
			doc := db.DocumentoClinico{PlantillaID: "no-se-usa", Folio: c.Folio, AnexoNumero: c.AnexoNumero}
			if c.AnexoNumero != nil {
				historia := uuid.New()
				doc.AnexoDe = &historia
			}
			got := nombreDeArchivoDelPDF(doc, p, documentos.FolioDe(doc, c.FolioHistoria))
			if got != c.Esperado {
				t.Fatalf("nombre = %q, esperado %q", got, c.Esperado)
			}
		})
	}
}
