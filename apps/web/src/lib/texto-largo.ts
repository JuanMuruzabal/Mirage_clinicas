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
