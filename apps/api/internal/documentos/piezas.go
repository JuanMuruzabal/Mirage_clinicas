package documentos

import "fmt"

// Piezas dentarias en notación FDI de dos dígitos (Ley 26.812, "sistema
// dígito dos") — espejo de piezas.ts, en el orden del odontograma de los
// modelos del Colegio: de derecha a izquierda del paciente, arriba y
// después abajo.

func tramo(cuadrante, desde, hasta int) []string {
	var piezas []string
	paso := 1
	if desde > hasta {
		paso = -1
	}
	for n := desde; ; n += paso {
		piezas = append(piezas, fmt.Sprintf("%d%d", cuadrante, n))
		if n == hasta {
			break
		}
	}
	return piezas
}

func concatenar(tramos ...[]string) []string {
	var todas []string
	for _, t := range tramos {
		todas = append(todas, t...)
	}
	return todas
}

var (
	piezasPermanentes = concatenar(tramo(1, 8, 1), tramo(2, 1, 8), tramo(4, 8, 1), tramo(3, 1, 8))
	piezasTemporarias = concatenar(tramo(5, 5, 1), tramo(6, 1, 5), tramo(8, 5, 1), tramo(7, 1, 5))
)

// PiezasDe — las piezas de una dentición: "permanente", "temporaria" o
// "ambas".
func PiezasDe(denticion string) []string {
	switch denticion {
	case "permanente":
		return piezasPermanentes
	case "temporaria":
		return piezasTemporarias
	}
	return concatenar(piezasPermanentes, piezasTemporarias)
}

// EsPiezaValida — ¿es una pieza de esa dentición?
func EsPiezaValida(pieza, denticion string) bool {
	for _, p := range PiezasDe(denticion) {
		if p == pieza {
			return true
		}
	}
	return false
}
