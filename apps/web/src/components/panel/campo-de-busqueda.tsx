import { IconSearch } from "@/components/icons";

interface CampoDeBusquedaProps {
  valor: string;
  onCambio: (valor: string) => void;
  /** Qué se puede buscar, sin "Buscar por" y con puntos suspensivos. */
  placeholder: string;
  /** Nombre accesible; el placeholder si no viene. */
  etiqueta?: string;
}

/**
 * El buscador de las listas del panel: Turnos, Pacientes y los documentos de
 * la ficha (correcciones generales, ítem 6, pedido de la persona: "la barra
 * de búsqueda debe ser coherente... no deben ser de diferentes tamaños").
 * Los tres tenían el mismo dibujo pero anchos distintos (988, 448 y 984 px
 * en la computadora, porque dos se estiraban a lo que quedara de su fila) y
 * 38 px de alto junto a botones de 44.
 *
 * - 44 px de alto: el de "Filtros" y los botones de su fila.
 * - 28rem (448 px) desde `md`, el ancho que ya tenía Pacientes: alcanza para
 *   un nombre y apellido largos y deja lugar en la fila a la acción de al
 *   lado ("+ Agregar paciente", "+ Agregar turno", "Filtros"). En el
 *   celular, todo el ancho.
 * - El foco suma un anillo verde de marca: el borde de medio píxel solo,
 *   cambiando de tono, casi no se veía.
 */
export function CampoDeBusqueda({ valor, onCambio, placeholder, etiqueta }: CampoDeBusquedaProps) {
  return (
    <div className="relative w-full min-w-0 md:w-[28rem] md:flex-none">
      <IconSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-grafito/40" />
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        aria-label={etiqueta ?? placeholder}
        className="h-11 w-full rounded-control border-[0.5px] border-arena bg-marfil pr-3 pl-9 text-sm text-grafito outline-none focus:border-marca focus-visible:ring-1 focus-visible:ring-marca"
      />
    </div>
  );
}
