"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import type { Paciente } from "@dental-mirage/shared-types";
import { textoEsLargo } from "@/lib/texto-largo";
import { VerTextoBoton } from "../ver-texto-boton";
import { AvatarIniciales } from "./avatar-iniciales";
import { ClickableTableRow } from "./clickable-table-row";

interface PacientesTableProps {
  pacientes: Paciente[];
}

// PacientesTable — extraída de pacientes/page.tsx (pedido explícito del
// cliente, 2026-08-27: "el DNI se sigue viendo pequeño en los datos, debe
// estar como dato desplegable no debajo del nombre"). Antes el DNI vivía
// como subtítulo fijo bajo el nombre en mobile (`text-xs`, chico a
// propósito para no competir con el nombre) — ahora se saca de ahí del
// todo y pasa a un panel desplegable (mismo patrón que TurnosTable),
// visible en `text-base` al tocar la fila. La página sigue clickeando
// entera hacia la ficha (TR-023, `ClickableTableRow`, sin cambios) —
// desde `md` el chevron de acá queda oculto porque DNI/Email ya se ven
// como columnas propias, no hace falta desplegar nada.
export function PacientesTable({ pacientes }: PacientesTableProps) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  function alternarExpandido(id: string) {
    setExpandidoId((actual) => (actual === id ? null : id));
  }

  return (
    <div className="panel-table-scroll max-h-[600px] overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft max-md:max-h-[21rem] max-md:overflow-x-hidden md:overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          {/* border-b (1px) en mobile — pedido explícito del cliente,
              2026-08-27: separadores más claros, el 0.5px de escritorio
              se pierde en algunos anchos de píxel de mobile. Sticky por
              `th` (`.panel-th-sticky`, ver globals.css), no en
              thead/tr — bug de Safari de iOS con rebote elástico
              (2026-08-28). */}
          <tr className="border-b border-arena text-xs font-semibold uppercase tracking-wide text-grafito/60 md:border-b-[0.5px]">
            <th className="panel-th-sticky px-4 py-3">Nombre</th>
            <th className="panel-th-sticky max-md:hidden px-4 py-3">DNI</th>
            <th className="panel-th-sticky px-4 py-3">Teléfono</th>
            <th className="panel-th-sticky max-md:hidden px-4 py-3">Email</th>
            <th className="panel-th-sticky px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {pacientes.map((p) => {
            const expandido = expandidoId === p.id;
            return (
              <Fragment key={p.id}>
                <ClickableTableRow
                  href={`/panel/pacientes/${p.id}`}
                  className={`border-b border-arena last:border-b-0 hover:bg-arena md:border-b-[0.5px] ${expandido ? "bg-hueso" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <AvatarIniciales nombre={p.nombre} apellido={p.apellido} />
                      <p className="font-medium text-grafito">
                        {p.nombre} {p.apellido}
                      </p>
                    </div>
                  </td>
                  <td className="max-md:hidden px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{p.dni}</td>
                  <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{p.telefono}</td>
                  <td className="max-md:hidden px-4 py-3 text-grafito/60">
                    {/* Extra 2.3.4 (E4.1): un email largo no se muestra
                        más inline — rompía el ancho de la fila. Reusa
                        VerTextoBoton (Extra 2.3.1/E1.7), el mismo
                        componente de "Ver motivo" en Turnos. */}
                    {textoEsLargo(p.email) ? <VerTextoBoton titulo="Email" texto={p.email} /> : p.email || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {/* Chevron — solo mobile: desde `md` el DNI/Email ya
                          se ven como columnas propias, no hace falta
                          desplegar nada. `stopPropagation` para no
                          disparar también la navegación de la fila (ver
                          ClickableTableRow, que igualmente ya ignora
                          clicks sobre botones/links propios). */}
                      <button
                        type="button"
                        aria-expanded={expandido}
                        aria-label={expandido ? "Ocultar datos" : "Mostrar datos"}
                        onClick={(e) => {
                          e.stopPropagation();
                          alternarExpandido(p.id);
                        }}
                        className={`text-grafito/50 transition-transform duration-200 hover:text-grafito md:hidden ${expandido ? "rotate-180" : ""}`}
                      >
                        ▾
                      </button>
                      <Link href={`/panel/pacientes/${p.id}`} className="text-sm font-medium text-salvia-oscuro hover:text-grafito">
                        Ver ficha →
                      </Link>
                    </div>
                  </td>
                </ClickableTableRow>
                {expandido && (
                  <tr className="border-b border-arena bg-hueso last:border-b-0 md:hidden">
                    <td colSpan={5} className="px-4 py-3">
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-base">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">DNI</dt>
                        <dd className="font-[family-name:var(--font-mono)] text-grafito">{p.dni}</dd>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Email</dt>
                        <dd className="text-grafito">
                          {textoEsLargo(p.email) ? <VerTextoBoton titulo="Email" texto={p.email} /> : p.email || "—"}
                        </dd>
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
