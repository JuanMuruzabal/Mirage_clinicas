// textoEsLargo (F2.3 extra ítem 1, docs/implementation-plan.md §11.5) —
// separada de ver-texto-boton.tsx a propósito: ese archivo tiene "use
// client" (VerTextoBoton usa useState), lo que convierte CUALQUIER export
// suyo en una referencia de cliente — llamar a textoEsLargo directo desde
// un Server Component (apps/web/src/app/panel/page.tsx) tiraba "Attempted
// to call textoEsLargo() from the server but textoEsLargo is on the
// client" (bug real encontrado en QA, 2026-09-06: /panel devolvía 500).
// Una función pura sin estado/efectos no necesita el boundary de cliente
// — vive acá para poder invocarse tanto desde Server como Client
// Components sin restricción.
export function textoEsLargo(texto: string | null | undefined): texto is string {
  return Boolean(texto && texto.length > 30);
}

// tipoConsultaNombreEsLargo — corrección de QA, pedido textual del
// cliente: "si el tipo de consulta es muy largo... poner un botón que
// sea 'Ver tipo', si es más largo que 'Consulta general' tomando en
// cuenta el espacio en blanco como carácter... aplicar esto" — umbral
// PROPIO para el nombre del tipo de consulta, distinto del genérico de
// 30 caracteres de `textoEsLargo` (motivo/mail): más largo que "Consulta
// general" (el tipo sembrado por default al registrarse, TR-001),
// contando el espacio como un carácter más — "Consulta general" tiene
// 16 caracteres exactos, calculado acá con `.length` (nunca hardcodeado
// a mano) para que quede autodescriptivo y no se desincronice si el
// nombre sembrado cambia algún día.
const LARGO_TIPO_CONSULTA_REFERENCIA = "Consulta general".length;

export function tipoConsultaNombreEsLargo(nombre: string | null | undefined): nombre is string {
  return Boolean(nombre && nombre.length > LARGO_TIPO_CONSULTA_REFERENCIA);
}
