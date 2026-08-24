// Estilo compartido del texto de navegación del header (mayúsculas +
// negrita + tracking, "más llamativo y coherente") — en su propio módulo
// para que site-header.tsx y logout-button.tsx (que se importan entre sí)
// no terminen en un import circular por compartir esta constante.
//
// text-current (no text-ink fijo): el color base lo decide el <header>
// (header-frame.tsx) según esté transparente sobre la foto del Home
// (texto claro) o sólido en el resto (texto oscuro) — todo el texto de
// nav hereda ese color en vez de fijar el suyo propio.
export const navLinkClass = "text-xs font-bold uppercase tracking-wider text-current transition-colors hover:text-steel";
