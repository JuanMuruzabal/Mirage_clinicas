package documentos

import (
	"fmt"
	"time"

	"dental-mirage/api/internal/db"
)

// Los asientos de un anexo de continuación (Fase 5.6d): cada uno guarda la
// huella del anterior —el primero, la del contenido congelado del anexo—,
// así que forman una cadena como la de los sellos de la clínica. El trigger
// de documento_asientos impide tocar uno; esto delata si alguien lo hizo
// con los triggers apagados.

// entradaDeAsiento — lo que entra en la huella de un asiento.
type entradaDeAsiento struct {
	DocumentoID  string `json:"documentoId"`
	Numero       int    `json:"numero"`
	Texto        string `json:"texto"`
	AutorUserID  string `json:"autorUserId"`
	AutorNombre  string `json:"autorNombre"`
	CreadoEn     string `json:"creadoEn"`
	HashAnterior string `json:"hashAnterior"`
}

// HuellaDelAsiento — SHA-256 del JSON canónico de un asiento, guardado o por
// guardar. El instante va con la precisión que guarda Postgres
// (MomentoDeFirma): la huella se recalcula desde lo guardado.
func HuellaDelAsiento(a db.DocumentoAsiento) (string, error) {
	return HuellaDe(entradaDeAsiento{
		DocumentoID: a.DocumentoID.String(), Numero: a.Numero, Texto: a.Texto,
		AutorUserID: a.AutorUserID.String(), AutorNombre: a.AutorNombre,
		CreadoEn:     MomentoDeFirma(a.CreadoEn).Format(time.RFC3339Nano),
		HashAnterior: a.HashAnterior,
	})
}

// VerificarAsientos — recalcula la cadena de un anexo desde lo guardado:
// los números seguidos desde 1, cada uno encadenado al anterior (el primero,
// al contenido congelado del anexo) y cada huella igual a la recalculada.
// Los asientos van en orden de número.
func VerificarAsientos(d db.DocumentoClinico, asientos []db.DocumentoAsiento) error {
	if d.HashContenido == nil {
		return fmt.Errorf("el anexo no tiene contenido congelado")
	}
	anterior := *d.HashContenido
	for i, a := range asientos {
		if a.DocumentoID != d.ID {
			return fmt.Errorf("el asiento %d es de otro documento", a.Numero)
		}
		if a.Numero != i+1 {
			return fmt.Errorf("falta el asiento %d", i+1)
		}
		if a.HashAnterior != anterior {
			return fmt.Errorf("la cadena está cortada en el asiento %d", a.Numero)
		}
		recalculada, err := HuellaDelAsiento(a)
		if err != nil {
			return err
		}
		if recalculada != a.Hash {
			return fmt.Errorf("el asiento %d no coincide con su huella", a.Numero)
		}
		anterior = a.Hash
	}
	return nil
}
