// EstadoVerificadoBadge — Fase 2.4.1, pedido explícito del cliente:
// columna "Estado" en la tabla de Pacientes que distingue a simple vista
// quién ya tiene al menos un turno resuelto y asistido ("verificado", ver
// pacienteEstaVerificado en el backend) de quien todavía no. Verde/salvia
// para verificado, naranja/terracota para no verificado — mismos tokens
// de color que el resto del panel usa para éxito/aviso (ej. "Publicada" en
// pagina-editor.tsx, "Ausente" en TurnosTable).
//
// Extraído a su propio archivo (corrección de QA, 2026-09-05, pedido
// textual del cliente: "al lado del nombre poner no verificado" en la
// ficha de paciente) — antes vivía como función privada de
// pacientes-table.tsx; ahora lo reusan ese componente Y el encabezado de
// PacienteDetallePage, sin duplicar el marcado/colores.
export function EstadoVerificadoBadge({ verificado }: { verificado?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full border-[0.5px] px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
        verificado ? "border-salvia bg-salvia-claro text-salvia-oscuro" : "border-terracota bg-terracota-claro text-terracota-oscuro"
      }`}
    >
      {verificado ? "VERIFICADO" : "NO VERIFICADO"}
    </span>
  );
}
