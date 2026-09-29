"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const sinSuscripcion = () => () => {};

// ImpresionDelDocumento — lo que sale por la impresora (TR-188): un
// consentimiento se completa en la pantalla, se imprime y se firma a mano.
//
// Lo que recibe (las páginas de la lámina a su tamaño de papel, o el calco
// de una plantilla que todavía no tiene lámina) va en un portal a `<body>`:
// en pantalla no se ve, y al imprimir se ve SOLO eso (la regla
// `.impresion-documento` de globals.css esconde todo lo demás). Va afuera
// del panel a propósito: el panel tiene alto fijo y su propio scroll, y un
// documento de varias páginas saldría cortado en la primera.
//
// No dibuja nada hasta hidratar (en el servidor no hay `document`): mismo
// criterio que `Dialogo`.
export function ImpresionDelDocumento({
  hoja,
  children,
}: {
  /** El tamaño del papel del modelo, en puntos: la hoja sale sin márgenes
   *  (y sin el encabezado ni el pie que agrega el navegador). Sin esto, el
   *  papel de la impresora con márgenes comunes. */
  hoja?: { ancho: number; alto: number };
  children: ReactNode;
}) {
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  if (!montado) return null;
  const pagina = hoja ? `@page { size: ${hoja.ancho}pt ${hoja.alto}pt; margin: 0; }` : "@page { margin: 15mm; }";
  return createPortal(
    <div className="impresion-documento">
      <style>{pagina}</style>
      {children}
    </div>,
    document.body,
  );
}
