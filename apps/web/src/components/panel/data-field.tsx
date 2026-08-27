interface DataFieldProps {
  label: string;
  value?: string | number | null;
  className?: string;
}

// DataField — par label/valor para las cards mobile de ResponsiveTable
// (TR-064 en docs/tradeoffs.md, pedido explícito del cliente: "motivo y
// fecha y hora como pares label/valor ocultando la fila si el valor está
// vacío"). `null`/`undefined`/`""` no renderizan nada — ni la fila ni un
// "—" de relleno, a diferencia de las celdas de la tabla de escritorio
// (que sí muestran "—", con más espacio disponible para columnas fijas;
// en una card angosta cada fila vacía es lugar desperdiciado).
export function DataField({ label, value, className = "" }: DataFieldProps) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${className}`}>
      <span className="flex-shrink-0 text-xs font-medium uppercase tracking-wide text-grafito/50">{label}</span>
      <span className="text-right text-grafito">{value}</span>
    </div>
  );
}
