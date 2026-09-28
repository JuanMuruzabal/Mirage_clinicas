package documentos

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// Canonico — el JSON canónico de un valor: claves ordenadas, sin espacios,
// sin escapar <, > ni &, y los números tal como vinieron. Dos valores
// iguales dan SIEMPRE los mismos bytes, así que dan la misma huella.
//
// Se arma en dos pasadas: la primera convierte cualquier struct en mapas
// (encoding/json ordena las claves de un mapa al escribirlo; las de un
// struct salen en el orden del código), y la segunda escribe esos mapas.
// Es la idea del RFC 8785; para verificar una huella alcanza con que la
// produzca siempre este mismo código.
func Canonico(v any) ([]byte, error) {
	crudo, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	dec := json.NewDecoder(bytes.NewReader(crudo))
	dec.UseNumber()
	var generico any
	if err := dec.Decode(&generico); err != nil {
		return nil, err
	}
	var salida bytes.Buffer
	enc := json.NewEncoder(&salida)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(generico); err != nil {
		return nil, err
	}
	return bytes.TrimRight(salida.Bytes(), "\n"), nil
}

// Huella — SHA-256 en hexadecimal.
func Huella(datos []byte) string {
	suma := sha256.Sum256(datos)
	return hex.EncodeToString(suma[:])
}

// HuellaDe — la huella del JSON canónico de un valor.
func HuellaDe(v any) (string, error) {
	datos, err := Canonico(v)
	if err != nil {
		return "", err
	}
	return Huella(datos), nil
}
