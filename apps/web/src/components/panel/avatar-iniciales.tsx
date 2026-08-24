interface AvatarInicialesProps {
  nombre: string;
  apellido: string;
  className?: string;
}

// AvatarIniciales (TR-013 en docs/tradeoffs.md, "avatares circulares con
// iniciales en terracota en vez de negro") — decorativo, el nombre
// completo ya está siempre al lado en texto real, así que va aria-hidden.
// Usa terracota-oscuro (no el terracota medio) como fondo: con las dos
// iniciales en text-sm/semibold, marfil sobre terracota medio da ~3.1:1
// (no llega a los 4.5:1 de AA para texto de ese tamaño) — terracota-oscuro
// sí, sin dejar de leerse como la misma familia de color.
export function AvatarIniciales({ nombre, apellido, className = "" }: AvatarInicialesProps) {
  const iniciales = `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-terracota-oscuro text-sm font-semibold text-marfil ${className}`}
    >
      {iniciales}
    </span>
  );
}
