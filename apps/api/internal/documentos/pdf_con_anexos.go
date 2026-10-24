package documentos

import (
	"crypto/sha256"
	"errors"
	"fmt"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/pdf"
)

// El PDF de una historia clínica con sus anexos, todo junto (correcciones
// generales, 2026-10-18): las hojas de la historia y después las de cada
// anexo, cada parte dibujada igual que suelta —sus hojas, su pie ("Folio 3 ·
// Hoja i de n", "3.1 · Hoja i de n") y su escala—. Cada documento es legal con
// su folio y se lee entero aunque se separe del resto, así que las hojas no se
// renumeran en una sola secuencia. Como los sueltos (TR-191), no se guarda y
// es determinista.

// ErrSinAnexosConPDF — la historia no tiene ningún anexo que entre en su PDF.
var ErrSinAnexosConPDF = errors.New("esta historia no tiene anexos con PDF")

// parteDelPDF — un documento listo para dibujarse: los metadatos que lleva su
// PDF suelto y cómo agrega sus hojas a un PDF. Suelto es el PDF entero
// (bytes); en el de una historia con sus anexos, una parte más.
type parteDelPDF struct {
	info    pdf.Info
	dibujar func(*pdf.Documento)
}

func (p parteDelPDF) bytes() ([]byte, error) {
	doc := pdf.Nuevo(p.info)
	p.dibujar(doc)
	return doc.Bytes()
}

// FuenteDeAnexo — un anexo en el PDF de su historia: uno de continuación
// (FuenteDeContinuacion) o uno terminado de otra plantilla de tipo anexo
// (FuenteDelPDF). Solo las implementan esas dos.
type FuenteDeAnexo interface {
	preparar() (parteDelPDF, error)
	documento() db.DocumentoClinico
}

func (f FuenteDelPDF) documento() db.DocumentoClinico         { return f.Documento }
func (f FuenteDeContinuacion) documento() db.DocumentoClinico { return f.Documento }

// GenerarPDFConAnexos — el PDF de una historia terminada seguida de sus
// anexos, en el orden en que llegan (el de su número). Los errores de la
// historia son los de su PDF suelto, y van antes que ErrSinAnexosConPDF; el de
// un anexo dice cuál es. Un documento que no es anexo de esta historia no
// entra: el PDF no puede llevar hojas de otra.
func GenerarPDFConAnexos(historia FuenteDelPDF, anexos []FuenteDeAnexo) ([]byte, error) {
	primera, err := historia.preparar()
	if err != nil {
		return nil, err
	}
	if len(anexos) == 0 {
		return nil, ErrSinAnexosConPDF
	}
	partes := append(make([]parteDelPDF, 0, len(anexos)+1), primera)
	for _, a := range anexos {
		d := a.documento()
		if d.AnexoDe == nil || *d.AnexoDe != historia.Documento.ID {
			return nil, fmt.Errorf("el documento %s no es anexo de la historia %s", d.ID, historia.Documento.ID)
		}
		parte, err := a.preparar()
		if err != nil {
			return nil, fmt.Errorf("el anexo %s: %w", d.ID, err)
		}
		partes = append(partes, parte)
	}
	return unirPartes(partes).bytes()
}

// unirPartes — las partes una detrás de otra, en un solo PDF. El título es el
// de la primera (la historia) " · con sus anexos"; la fecha, la más reciente
// de las partes; y la semilla del /ID, el SHA-256 de las semillas de las
// partes en orden. Así el mismo estado da los mismos bytes, y una anotación
// nueva en un anexo los cambia, igual que en el PDF del anexo solo.
func unirPartes(partes []parteDelPDF) parteDelPDF {
	info := pdf.Info{Titulo: partes[0].info.Titulo + " · con sus anexos", Creado: partes[0].info.Creado}
	semillas := sha256.New()
	for _, p := range partes {
		if p.info.Creado.After(info.Creado) {
			info.Creado = p.info.Creado
		}
		semillas.Write(p.info.Semilla)
	}
	info.Semilla = semillas.Sum(nil)
	return parteDelPDF{info: info, dibujar: func(doc *pdf.Documento) {
		for _, p := range partes {
			p.dibujar(doc)
		}
	}}
}
