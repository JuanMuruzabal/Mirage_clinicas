import type { ServicioConEscena } from "./panel/escenas";
import type { VarianteDeDibujo } from "./panel/dibujos-discretos";
import {
  CLASE_ANTETITULO_DE_TARJETA,
  CLASE_BOTON_DE_TARJETA_ENLAZADA,
  CLASE_DESCRIPCION_DE_TARJETA,
  CLASE_TITULO_DE_TARJETA,
  TarjetaConDibujo,
} from "./tarjeta-con-dibujo";

interface NavCardProps {
  href: string;
  eyebrow?: string;
  titulo: string;
  descripcion: string;
  cta?: string;
  /** La escena de fondo: una por servicio. */
  dibujo?: ServicioConEscena;
  /** El objeto de hoy o una variante discreta (`?dibujo=`, a prueba). */
  variante?: VarianteDeDibujo;
}

// Tarjeta de navegación de /seleccionar-servicio.
//
// Rediseño del 2026-10-19 (pedido de la persona): las tres tarjetas son
// IGUALES —misma composición, mismo tamaño, una debajo de la otra—, sin la
// variante "principal" ni el `PrismaMark`. El armado (el vidrio, la carátula,
// la escena y el botón) es `TarjetaConDibujo`, el mismo de las tarjetas de
// /clinicas: las dos pantallas no pueden divergir.
//
// Toda la tarjeta es el enlace, no solo el "Entrar": el objetivo de click
// más grande es el que la persona ya está mirando.
export function NavCard({ href, eyebrow, titulo, descripcion, cta = "Entrar", dibujo, variante }: NavCardProps) {
  return (
    <TarjetaConDibujo href={href} dibujo={dibujo} variante={variante}>
      {eyebrow && <p className={CLASE_ANTETITULO_DE_TARJETA}>{eyebrow}</p>}
      <h2 className={CLASE_TITULO_DE_TARJETA}>{titulo}</h2>
      <p className={`mb-3 ${CLASE_DESCRIPCION_DE_TARJETA}`}>{descripcion}</p>
      {/* El botón secundario delineado de la app, a 44 px e igual en las
          tres: tres rellenos competirían entre sí, y no hay una acción
          principal. Es un <span> porque la tarjeta entera ya es el link. */}
      <span className={`mt-auto self-start ${CLASE_BOTON_DE_TARJETA_ENLAZADA}`}>{cta}</span>
    </TarjetaConDibujo>
  );
}
