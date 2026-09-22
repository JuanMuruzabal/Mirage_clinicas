package http

import "dental-mirage/api/internal/prismaengine"

// Catálogo de temas de la página pública (Fase 4.3, docs/Fases post
// MVP/Fase 4/fase4-personalizar-pagina.md) — hasta PE-1 esto duplicaba a
// mano los IDs de apps/web/src/lib/temas-pagina-publica/ (paletas.ts/
// tipografias.ts/index.ts). Ahora los dos lados leen el mismo catálogo
// (packages/prisma-engine/catalogo/temas.json, copiado acá por `pnpm
// engine:generar` — internal/prismaengine lo embebe): el hex/las fuentes de
// verdad siguen viviendo únicamente en el frontend (next/font exige
// llamadas estáticamente analizables, no se puede generar desde JSON), pero
// los IDs válidos ya no se escriben dos veces. Si se agrega/saca un tema,
// actualizar packages/prisma-engine/catalogo/temas.json Y el catálogo del
// frontend en el mismo cambio, y correr `pnpm engine:generar`.

// temaEsValido — "" (sin elegir todavía, default de la Fase 4.1) siempre
// es válido. Con un tema elegido, la variante tiene que pertenecer a ESE
// tema específico — una variante de "clinico" no vale para "calido".
func temaEsValido(tema, variante string) bool {
	return prismaengine.TemaEsValido(tema, variante)
}

func tipografiaEsValida(tipografia string) bool {
	return prismaengine.TipografiaEsValida(tipografia)
}
