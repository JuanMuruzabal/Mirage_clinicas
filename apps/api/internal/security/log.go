package security

import "strings"

// SinSaltosDeLinea saca los saltos de línea (\r y \n) de un valor que viene de
// afuera antes de loguearlo, para que nadie pueda inyectar renglones falsos en
// el log (go/log-injection). Los handlers de slog ya escapan, pero CodeQL no
// lo modela y sí reconoce este ReplaceAll como saneador; además el log queda
// a salvo aunque cambie el handler. Usala en todo valor de afuera que vaya a
// un log y que CodeQL marque. TR-199.
func SinSaltosDeLinea(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "\r", ""), "\n", "")
}
