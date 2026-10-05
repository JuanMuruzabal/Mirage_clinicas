package documentos

import (
	"fmt"
	"math"
)

// El DIBUJO (Fase 5.6b) — espejo de dibujo.ts de packages/documentos-clinicos.
// Un campo que se dibuja a mano alzada sobre un recuadro del papel (el
// genograma de odontopediatría): el tamaño del lienzo en píxeles y los
// puntos de cada trazo, sin tiempos. Se valida con los mismos mensajes que
// la pantalla y se compone como FIGURAS que se congelan con la lámina; los
// casos de composicion/figuras.json verifican que las coordenadas coincidan.

// DibujoDeLamina — el recuadro de un campo dibujo sobre su página: la
// esquina superior izquierda, el ancho y el alto, en puntos del PDF.
type DibujoDeLamina struct {
	Campo  string  `json:"campo"`
	Pagina int     `json:"pagina"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Ancho  float64 `json:"ancho"`
	Alto   float64 `json:"alto"`
}

const (
	lienzoMinimo   = 50
	lienzoMaximo   = 4000
	maximoDeTrazos = 300
	maximoDePuntos = 20000
	grosorDeTrazo  = 0.8

	// DibujoConsignado — lo que dice el texto del documento de un dibujo con
	// trazos: el dibujo está en la hoja.
	DibujoConsignado = "Dibujo consignado en la hoja"

	formaDelDibujo = "El dibujo no tiene la forma esperada."
)

func numeroFinito(v any) (float64, bool) {
	n, ok := v.(float64)
	return n, ok && !math.IsNaN(n) && !math.IsInf(n, 0)
}

// puntoDelLienzo — un punto [x, y]: dos números.
func puntoDelLienzo(v any) ([2]float64, bool) {
	p, ok := v.([]any)
	if !ok || len(p) != 2 {
		return [2]float64{}, false
	}
	x, okX := numeroFinito(p[0])
	y, okY := numeroFinito(p[1])
	return [2]float64{x, y}, okX && okY
}

func errorDeTrazo(trazo any, ancho, alto float64) string {
	puntos, ok := trazo.([]any)
	if !ok {
		return formaDelDibujo
	}
	for _, v := range puntos {
		p, ok := puntoDelLienzo(v)
		if !ok {
			return formaDelDibujo
		}
		if p[0] < 0 || p[0] > ancho || p[1] < 0 || p[1] > alto {
			return "Hay un punto fuera del lienzo."
		}
	}
	return ""
}

// errorDeDibujo — el primer error del valor, en el orden de `errorDeDibujo`
// de dibujo.ts: la forma, el lienzo, la cantidad de trazos y, trazo por
// trazo, que tenga puntos, el total de puntos y cada punto. "" = válido.
func errorDeDibujo(valor any) string {
	m, ok := valor.(map[string]any)
	if !ok || len(m) != 3 || !soloClaves(m, "alto", "ancho", "trazos") {
		return formaDelDibujo
	}
	ancho, okAncho := numeroFinito(m["ancho"])
	alto, okAlto := numeroFinito(m["alto"])
	trazos, okTrazos := m["trazos"].([]any)
	if !okAncho || !okAlto || !okTrazos {
		return formaDelDibujo
	}
	for _, lado := range []float64{ancho, alto} {
		if lado < lienzoMinimo || lado > lienzoMaximo {
			return fmt.Sprintf("El lienzo tiene que medir entre %d y %d de cada lado.", lienzoMinimo, lienzoMaximo)
		}
	}
	if len(trazos) > maximoDeTrazos {
		return fmt.Sprintf("El dibujo puede tener hasta %d trazos.", maximoDeTrazos)
	}
	total := 0
	for _, trazo := range trazos {
		puntos, esLista := trazo.([]any)
		if esLista && len(puntos) == 0 {
			return "Hay un trazo sin puntos."
		}
		total += len(puntos)
		if total > maximoDePuntos {
			return "El dibujo puede tener hasta 20.000 puntos."
		}
		if msg := errorDeTrazo(trazo, ancho, alto); msg != "" {
			return msg
		}
	}
	return ""
}

// dibujoVacio — vacío es SOLO un dibujo bien formado sin trazos: cualquier
// otra cosa la rechaza la validación en vez de guardarse sin validar.
func dibujoVacio(valor any) bool {
	m, ok := valor.(map[string]any)
	if !ok {
		return false
	}
	trazos, ok := m["trazos"].([]any)
	return ok && len(trazos) == 0 && errorDeDibujo(valor) == ""
}

// figurasDeDibujo — los trazos, del lienzo al recuadro del papel con una sola
// escala para los dos ejes, centrados. Vacío y terminado, "No consigna" en
// el medio (Decreto 1089/2012, art. 15); en un borrador, nada. Mismo cálculo
// y mismo orden de operaciones que `figurasDeDibujo` de dibujo.ts.
func figurasDeDibujo(c *Campo, d DibujoDeLamina, valor any, modo ModoTexto) []Figura {
	if EstaVacio(c, valor) {
		if modo != TextoSellado {
			return nil
		}
		return []Figura{textoCentrado(d.Pagina, NoConsigna, tamanoDeLaCaja, d.X, d.Ancho, d.Y+d.Alto/2+3.5, "tinta")}
	}
	if errorDeDibujo(valor) != "" {
		return nil
	}
	m := valor.(map[string]any)
	ancho, alto := m["ancho"].(float64), m["alto"].(float64)
	escala := math.Min(d.Ancho/ancho, d.Alto/alto)
	x0 := d.X + (d.Ancho-ancho*escala)/2
	y0 := d.Y + (d.Alto-alto*escala)/2
	trazos := m["trazos"].([]any)
	figuras := make([]Figura, 0, len(trazos))
	for _, trazo := range trazos {
		crudos := trazo.([]any)
		puntos := make([][2]float64, len(crudos))
		for i, v := range crudos {
			p, _ := puntoDelLienzo(v)
			puntos[i] = punto(x0+p[0]*escala, y0+p[1]*escala)
		}
		figuras = append(figuras, Figura{Tipo: "trazo", Pagina: d.Pagina, Puntos: puntos, Color: "tinta", Grosor: grosorDeTrazo})
	}
	return figuras
}
