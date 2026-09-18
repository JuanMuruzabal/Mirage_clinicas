package http

// Catálogo de temas de la página pública (Fase 4.3, docs/Fases post
// MVP/Fase 4/fase4-personalizar-pagina.md) — espejo de los IDs definidos
// en apps/web/src/lib/temas-pagina-publica/ (paletas.ts/tipografias.ts/
// index.ts). Acá SOLO los identificadores válidos, para validar el PATCH
// de contenido (pagina_publica.go) — el hex/las fuentes de verdad viven
// únicamente en el frontend, el backend no necesita conocerlos. Si se
// agrega/saca un tema en el catálogo del frontend, este archivo tiene que
// actualizarse en el mismo cambio.

// temasValidos — tema -> variantes de color válidas dentro de ese tema.
var temasValidos = map[string][]string{
	"calido":  {"calido-1", "calido-2", "calido-3"},
	"clinico": {"clinico-1", "clinico-2", "clinico-3"},
	"moderno": {"moderno-1", "moderno-2", "moderno-3"},
	"natural": {"natural-1", "natural-2", "natural-3"},
	"clasico": {"clasico-1", "clasico-2", "clasico-3"},
}

// tipografiasValidas — catálogo compartido entre temas (tipografias.ts),
// no exclusivo de cada uno.
var tipografiasValidas = []string{
	"condensada-institucional",
	"serif-clasica",
	"geometrica-moderna",
	"redondeada-calida",
	"editorial-suave",
}

// temaEsValido — "" (sin elegir todavía, default de la Fase 4.1) siempre
// es válido. Con un tema elegido, la variante tiene que pertenecer a ESE
// tema específico — una variante de "clinico" no vale para "calido".
func temaEsValido(tema, variante string) bool {
	if tema == "" && variante == "" {
		return true
	}
	variantesDelTema, existe := temasValidos[tema]
	if !existe {
		return false
	}
	if variante == "" {
		return true
	}
	for _, v := range variantesDelTema {
		if v == variante {
			return true
		}
	}
	return false
}

func tipografiaEsValida(tipografia string) bool {
	if tipografia == "" {
		return true
	}
	for _, t := range tipografiasValidas {
		if t == tipografia {
			return true
		}
	}
	return false
}
