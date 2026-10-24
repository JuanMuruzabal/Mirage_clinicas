"use client";

import { useState } from "react";
import { IconFilter } from "@/components/icons";
import { Dialogo } from "@/components/dialogo";

interface FiltrosSheetProps {
  // activo — pinta el botón disparador distinto (mismo criterio visual
  // que el resto del panel: borde/fondo salvia cuando hay algo aplicado)
  // para que se note de un vistazo que la lista está filtrada sin tener
  // que abrir la hoja.
  activo: boolean;
  // activeCount — corrección de estética (2026-09-06, fotos de
  // referencia del cliente): "Filtros" pasa a mostrar la CANTIDAD de
  // filtros aplicados en vez de un punto genérico ("Filtros 2"). Opcional
  // — sin esto (o en 0), sigue el punto simple de antes.
  activeCount?: number;
  // aplicarLabel — pedido textual del cliente (2026-09-06): "en vez de
  // decir aplicar, aparezca 'ver X turnos'" — el conteo en vivo de
  // cuántos resultados matchean los filtros SIN CONFIRMAR todavía (el
  // consumidor arma el string, ver TurnosFiltros/PacienteTurnosTable).
  aplicarLabel: string;
  onAplicar: () => void;
  // onLimpiar — si no viene, no se muestra el link (nada que limpiar).
  onLimpiar?: () => void;
  // onAbrir — se llama ANTES de mostrar la hoja, así el consumidor puede
  // resetear su estado "borrador" (los valores que se editan mientras la
  // hoja está abierta) a los valores ya aplicados — la hoja siempre
  // arranca mostrando lo que está vigente, nunca lo que quedó de la
  // última vez que se abrió y se cerró sin aplicar.
  onAbrir?: () => void;
  children: React.ReactNode;
  triggerLabel?: string;
  /** En el celular y hasta `lg`, solo el ícono (el rótulo queda para el
   *  lector de pantalla). Para Turnos, donde el botón comparte la fila con
   *  las cuatro pestañas de estado y con el rótulo no entraban: en el
   *  celular, y entre 768 y 1023 px con el menú lateral (correcciones
   *  generales, ítem 6). También los documentos de la ficha, para que el
   *  buscador y el botón entren en una línea (2026-10-17). */
  soloIconoEnCelular?: boolean;
}

// FiltrosSheet — corrección de QA (2026-09-06), pedido textual del
// cliente: "los filtros de búsqueda, en turnos y ficha de pacientes pasan
// a aparecer cuando se toca un botón, aparecen de forma de bottom sheet
// en mobile... para ahorrarnos el lío de botones tanto en escritorio y
// pc (en pc debe aparecer como saltan los demás carteles)". Reemplaza la
// fila de Tipo de consulta/Verificación/Desde/Hasta/Hoy-Semana-Mes que
// vivía siempre visible (turnos/page.tsx, paciente-turnos-table.tsx) por
// un botón "Filtros" que abre:
//   - mobile (`items-end`, sin `md:`): hoja que sube desde abajo,
//     esquinas redondeadas solo arriba (`rounded-t-card`) — patrón
//     estándar de "bottom sheet".
//   - escritorio (`md:items-center`): tarjeta centrada con blur de fondo,
//     MISMO patrón que el resto de los modales del panel
//     (editar-paciente-modal.tsx, agregar-turno-modal.tsx, etc.) — nunca
//     un componente de modal nuevo, solo se reusa `ModalPortal`.
// Deliberadamente "tonto" (sin saber nada de tipo/fecha/verificación
// puntual): cada consumidor le pasa los campos como `children` y arma su
// propio string de conteo — así sirve igual para Turnos (conteo pedido al
// backend, debounced) y para la ficha de paciente (conteo síncrono, ya
// tiene todos los turnos en memoria).
export function FiltrosSheet({ activo, activeCount, aplicarLabel, onAplicar, onLimpiar, onAbrir, children, triggerLabel = "Filtros", soloIconoEnCelular = false }: FiltrosSheetProps) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {/* Corrección de estética (2026-09-06, foto de referencia
          "diseño2turnos.png"): el botón vuelve a un fondo claro (mismo
          tono que el buscador de al lado, `bg-marfil` + borde arena) en
          vez del verde sólido de la corrección anterior — la foto lo
          muestra así, texto/ícono en salvia oscuro, con la cantidad de
          filtros aplicados en un círculo salvia oscuro con número
          blanco ("Filtros 2"). El punto simple (sin cantidad) queda como
          respaldo para un consumidor que marque `activo` sin pasar
          `activeCount` — no pasa hoy (Turnos/ficha de paciente siempre
          mandan los dos juntos), pero el componente es deliberadamente
          "tonto" y no debería asumirlo. */}
      <button
        type="button"
        onClick={() => {
          onAbrir?.();
          setAbierto(true);
        }}
        // 44 px de alto, el mismo de los buscadores y de las pestañas de
        // al lado (correcciones generales, ítem 6). Con solo el ícono en el
        // celular es un círculo de 44 × 44, y la cantidad de filtros va
        // en una pastilla sobre su borde.
        className={`relative inline-flex h-11 flex-none items-center justify-center gap-2 rounded-control border-[0.5px] border-arena bg-marfil px-4 text-sm font-semibold whitespace-nowrap text-marca hover:border-marca-medio ${soloIconoEnCelular ? "max-lg:w-11 max-lg:px-0" : ""}`}
      >
        <IconFilter className="h-4 w-4 flex-shrink-0" />
        <span className={soloIconoEnCelular ? "max-lg:sr-only" : undefined}>{triggerLabel}</span>
        {activo &&
          (activeCount && activeCount > 0 ? (
            <span
              aria-hidden="true"
              className={`flex h-4 min-w-4 items-center justify-center rounded-full bg-marca-relleno px-1 text-[10px] font-bold text-marfil ${soloIconoEnCelular ? "max-lg:absolute max-lg:-top-1 max-lg:-right-1" : ""}`}
            >
              {activeCount}
            </span>
          ) : (
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full bg-marca-relleno ${soloIconoEnCelular ? "max-lg:absolute max-lg:top-1.5 max-lg:right-1.5" : ""}`} />
          ))}
      </button>

      {/* Sobre el Dialogo de todos (foco adentro, Tab atrapado, Escape, el
          foco vuelve al botón): en el celular, una hoja que sube desde
          abajo; desde `md`, centrado. El pie, fijo, con "Limpiar" a la
          izquierda y la acción a la derecha. */}
      {abierto && (
        <Dialogo
          titulo={triggerLabel}
          onCerrar={() => setAbierto(false)}
          superficie="marfil"
          centrado
          hoja
          pie={
            <div className="flex w-full items-center justify-between gap-3">
              {onLimpiar ? (
                <button type="button" onClick={onLimpiar} className="text-sm font-medium text-marca hover:text-grafito">
                  Limpiar filtros
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => {
                  onAplicar();
                  setAbierto(false);
                }}
                className="rounded-control boton-primario px-5 py-2.5 text-sm font-semibold"
              >
                {aplicarLabel}
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-4 p-6">{children}</div>
        </Dialogo>
      )}
    </>
  );
}
