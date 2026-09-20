"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { elegirVistaAction } from "@/app/actions/topbar-panel";

// LinkConVista — un link que, antes de navegar, se para en la agenda a
// la que ese dato pertenece (Fase 3.2.6, QA).
//
// El pedido, textual: *"si interactúo con un botón que me lleva a otro
// módulo... el flujo deberá ser coherente con la vista; si yo toco
// botones desde la vista de un profesional el botón me llevará al
// siguiente módulo pero con la vista de ese profesional"*.
//
// Desde la VISTA GENERAL eso significa algo más fuerte: cada fila es de
// un profesional distinto, así que tocarla tiene que llevar a SU
// calendario, no a la vista general del que venía. Si no, la pantalla de
// destino muestra algo que no es lo que la fila prometía.
//
// Desde la vista de un profesional `userId` viene vacío y esto es un
// `<Link>` común: no hay nada que cambiar, ya se está en la vista
// correcta.
export function LinkConVista({
  href,
  userId,
  className,
  children,
}: {
  href: string;
  /** A qué agenda pertenece este dato. Vacío = no cambiar de vista. */
  userId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  // Sin agenda que cambiar esto es un `<Link>` y nada más — ni siquiera
  // toca el router. El hook vive en el componente de abajo a propósito:
  // llamarlo acá obligaría a tener un router montado para renderizar un
  // link común, y lo hacía fallar en cualquier test que no lo simulara.
  if (!userId) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <LinkQueCambiaLaVista href={href} userId={userId} className={className}>
      {children}
    </LinkQueCambiaLaVista>
  );
}

function LinkQueCambiaLaVista({
  href,
  userId,
  className,
  children,
}: {
  href: string;
  userId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [navegando, iniciar] = useTransition();

  return (
    // Sigue siendo un `<a>` con `href` real: se puede abrir en otra
    // pestaña, copiar el link y leer con un lector de pantalla como
    // cualquier otro. El handler solo intercepta el click normal.
    <a
      href={href}
      aria-busy={navegando}
      className={className}
      onClick={(e) => {
        // Ctrl/⌘/click del medio abren en otra pestaña: ahí no hay que
        // tocar la vista de ESTA sesión, y el destino resolverá la suya.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        iniciar(async () => {
          await elegirVistaAction(userId);
          router.push(href);
        });
      }}
    >
      {children}
    </a>
  );
}
