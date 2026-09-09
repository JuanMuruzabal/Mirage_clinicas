// Tamaños de tanda de los listados del panel — Fase B de la auditoría
// (docs/Seguridad y optimizacion/radiografia-tecnica_1.md). Viven acá, y
// no en cada componente, porque la primera tanda la pide el Server
// Component (page.tsx) y las siguientes el Client Component de la tabla:
// si los dos no usan el mismo número, "Cargar más" saltea o repite filas.
//
// 50 es deliberado: llena de sobra la pantalla más alta sin que la
// primera carga traiga la tabla entera, que es justamente lo que se está
// corrigiendo (una clínica con años de historia tenía todos sus turnos
// serializados en cada visita a /panel/turnos).
export const TURNOS_POR_PAGINA = 50;
export const PACIENTES_POR_PAGINA = 50;

// PAGINACION_LIMITE_MAX — espejo de paginacionLimiteMax en
// internal/http/paginacion.go. El backend recorta EN SILENCIO cualquier
// `limit` mayor: el cliente lo conoce para no pedir de más y quedarse
// creyendo que recibió todo lo que pidió (ver recargar() en
// turnos-table.tsx, el único lugar donde el número pedido crece con el
// uso).
export const PAGINACION_LIMITE_MAX = 200;
