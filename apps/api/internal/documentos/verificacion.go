package documentos

import (
	"encoding/hex"
	"strings"
)

// alfabetoCrockford — base32 de Crockford: sin I, L, O ni U, para que el
// código se pueda dictar y copiar a mano sin confundir letras con números.
const alfabetoCrockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// CodigoDeVerificacion — el código corto que se imprime en el PDF de un
// documento sellado (Fase 5.3): los primeros 40 bits del sello en base32
// de Crockford, como "XXXX-XXXX". Se DERIVA del sello y no se guarda: el
// mismo sello da siempre el mismo código, y no hay una columna más que
// alguien pueda desalinear. Un sello que no es hex da "".
func CodigoDeVerificacion(hashSello string) string {
	datos, err := hex.DecodeString(strings.TrimSpace(hashSello))
	if err != nil || len(datos) < 5 {
		return ""
	}
	var bits uint64
	for _, b := range datos[:5] {
		bits = bits<<8 | uint64(b)
	}
	var codigo [8]byte
	for i := 7; i >= 0; i-- {
		codigo[i] = alfabetoCrockford[bits&31]
		bits >>= 5
	}
	return string(codigo[:4]) + "-" + string(codigo[4:])
}
