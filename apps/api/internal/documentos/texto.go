package documentos

import "regexp"

// Cómo se lee un documento — espejo de texto.ts. En Go solo hace falta la
// versión "sellada": es la que se congela al terminar. En un documento
// terminado un campo vacío dice "No consigna", nunca queda un hueco donde
// alguien podría escribir después (Decreto 1089/2012, art. 15).

const (
	// NoConsigna — lo que dice un campo vacío en un documento terminado.
	NoConsigna = "No consigna"
	// Hueco — lo que dice en un borrador.
	Hueco = "____"
)

// ModoTexto — "borrador" o "sellado".
type ModoTexto string

const (
	TextoBorrador ModoTexto = "borrador"
	TextoSellado  ModoTexto = "sellado"
)

var marca = regexp.MustCompile(`\{\{([a-z][a-z0-9_.]*)\}\}`)

// Contexto — lo que no es un campo: el día del documento (AAAA-MM-DD, hora
// de Córdoba).
type Contexto struct {
	Fecha string `json:"fecha"`
}

// BloqueArmado — un bloque ya leído, en texto plano. Mismo JSON que
// `BloqueArmado` de texto.ts: los campos vacíos se omiten.
type BloqueArmado struct {
	T        string   `json:"t"`
	Texto    string   `json:"texto,omitempty"`
	Items    []string `json:"items,omitempty"`
	Campo    string   `json:"campo,omitempty"`
	Etiqueta string   `json:"etiqueta,omitempty"`
}

func vacioSegun(modo ModoTexto) string {
	if modo == TextoSellado {
		return NoConsigna
	}
	return Hueco
}

func resolver(texto string, p *Plantilla, valores map[string]any, ctx Contexto, modo ModoTexto) string {
	return marca.ReplaceAllStringFunc(texto, func(m string) string {
		nombre := marca.FindStringSubmatch(m)[1]
		valor := ""
		if nombre == "sistema.fecha" {
			valor = FechaComoTexto(ctx.Fecha)
		} else if c := p.Campo(nombre); c != nil {
			valor = ValorComoTexto(c, valores[nombre])
		}
		if valor == "" {
			return vacioSegun(modo)
		}
		return valor
	})
}

// ArmarCuerpo — el documento en texto plano, bloque por bloque.
func ArmarCuerpo(p *Plantilla, valores map[string]any, ctx Contexto, modo ModoTexto) []BloqueArmado {
	cuerpo := make([]BloqueArmado, 0, len(p.Cuerpo))
	for _, b := range p.Cuerpo {
		switch b.T {
		case "titulo", "subtitulo", "parrafo":
			cuerpo = append(cuerpo, BloqueArmado{T: b.T, Texto: resolver(b.Texto, p, valores, ctx, modo)})
		case "lista":
			items := make([]string, len(b.Items))
			for i, item := range b.Items {
				items[i] = resolver(item, p, valores, ctx, modo)
			}
			cuerpo = append(cuerpo, BloqueArmado{T: "lista", Items: items})
		case "campo":
			etiqueta := b.Campo
			valor := ""
			if c := p.Campo(b.Campo); c != nil {
				etiqueta = c.Etiqueta
				valor = ValorComoTexto(c, valores[b.Campo])
			}
			if valor == "" {
				valor = vacioSegun(modo)
			}
			cuerpo = append(cuerpo, BloqueArmado{T: "campo", Campo: b.Campo, Etiqueta: etiqueta, Texto: valor})
		case "firmas":
			cuerpo = append(cuerpo, BloqueArmado{T: "firmas"})
		}
	}
	return cuerpo
}
