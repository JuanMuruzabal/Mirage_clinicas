"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import type { Paciente } from "@dental-mirage/shared-types";
import { textoEsLargo } from "@/lib/texto-largo";
import { VerTextoBoton } from "../ver-texto-boton";
import { AvatarIniciales } from "./avatar-iniciales";
import { ClickableTableRow } from "./clickable-table-row";
import { EstadoVerificadoBadge } from "./estado-verificado-badge";

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
            <th className="panel-th-sticky px-4 py-3">Estado</th>
            <th className="panel-th-sticky max-md:hidden px-4 py-3">DNI</th>
            {/* Teléfono pasa a max-md:hidden (corrección de QA,
                2026-09-06): en mobile competía con Nombre/Estado por el
                mismo ancho y terminaba recortado — ahora entra al panel
                desplegable junto a DNI/Email, mismo criterio que
                TurnosTable con Contacto/Motivo/Origen. */}
            <th className="panel-th-sticky max-md:hidden px-4 py-3">Teléfono</th>
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
                  mobileOnClick={() => alternarExpandido(p.id)}
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
                  <td className="px-4 py-3">
                    <EstadoVerificadoBadge verificado={p.verificado} />
                  </td>
                  <td className="max-md:hidden px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{p.dni}</td>
                  <td className="max-md:hidden px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{p.telefono}</td>
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
                      {/* Corrección de QA (2026-09-06): en mobile este
                          link competía por espacio con el chevron y el
                          resto de la fila — pasa a max-md:hidden, la
                          navegación en mobile ahora vive como botón
                          propio dentro del panel desplegado (ver abajo). */}
                      <Link
                        href={`/panel/pacientes/${p.id}`}
                        className="max-md:hidden text-sm font-medium text-salvia-oscuro hover:text-grafito"
                      >
                        Ver ficha →
                      </Link>
                    </div>
                  </td>
                </ClickableTableRow>
                {expandido && (
                  <tr className="border-b border-arena bg-hueso last:border-b-0 md:hidden">
                    {/* w-px + el div interno min-w-full — corrección de QA
                        (2026-09-06, "imitando las dimensiones de mi
                        celular el mail queda recortado"): en una
                        `<table>` con `table-layout: auto` (el default),
                        el algoritmo de ancho mira el contenido de
                        CUALQUIER celda —incluida una con `colSpan`— para
                        decidir cuánto necesita la tabla entera, y eso
                        puede ignorar que el contenido de adentro ya
                        envuelve (`break-all`): la tabla entera se estira,
                        y el `overflow-x-hidden` del contenedor de más
                        arriba termina RECORTANDO en vez de envolver.
                        `w-px` en la celda le dice al algoritmo de ancho
                        "esta celda casi no necesita nada"; el `div` con
                        `min-w-full` de adentro ocupa todo el ancho real
                        ya resuelto de la tabla — mismo truco que
                        TurnosTable. */}
                    <td colSpan={6} className="w-px px-4 py-3">
                      <div className="min-w-full">
                      {/* grid-cols-[auto_minmax(0,1fr)] — corrección de QA
                          (2026-09-06): con `1fr` a secas, una celda con
                          contenido intrínsecamente ancho (un email largo)
                          empuja la columna más allá del espacio
                          disponible en vez de achicarse — el clásico bug
                          de CSS Grid ("min-width: auto" por default en
                          los hijos). `minmax(0, 1fr)` fuerza el mínimo a
                          0, dejando que el texto/`break-all` de adentro
                          recién ahí puedan envolver de verdad en vez de
                          desbordar la pantalla (mismo fix en
                          TurnosTable). `items-start` (corrección de QA,
                          "también en pacientes se ve un poco
                          desalineado") — sin esto, el default "stretch"
                          de CSS Grid estira cada `dt`/`dd` a la altura de
                          toda su fila; con Email pudiendo envolver a más
                          de una línea y DNI/Teléfono siempre en una sola,
                          las etiquetas quedaban ancladas arriba de una
                          caja más alta de la que su texto necesitaba.
                          Sin fuente monoespaciada en DNI/Teléfono
                          (corrección de QA, pedido textual: "tiene 2
                          tamaños diferentes el contenido a la
                          referencia") — al mismo `text-base`, una fuente
                          monoespaciada se ve más grande que la fuente
                          normal de Email al lado; ahora las 3 filas
                          comparten la misma fuente. */}
                      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-base">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">DNI</dt>
                        <dd className="min-w-0 text-grafito">{p.dni}</dd>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Teléfono</dt>
                        <dd className="min-w-0 text-grafito">{p.telefono}</dd>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Email</dt>
                        <dd className="min-w-0 break-all text-grafito">
                          {textoEsLargo(p.email) ? <VerTextoBoton titulo="Email" texto={p.email} /> : p.email || "—"}
                        </dd>
                      </dl>
                      {/* Botón real (pedido textual del cliente: "poner un
                          botón en mobile para ver la ficha") — reemplaza
                          al link de arriba, que en mobile queda oculto. */}
                      <Link
                        href={`/panel/pacientes/${p.id}`}
                        className="mt-3 inline-block rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
                      >
                        Ver ficha →
                      </Link>
                      </div>
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
