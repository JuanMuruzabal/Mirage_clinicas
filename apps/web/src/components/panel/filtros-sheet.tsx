"use client";

import { useState } from "react";
import { IconFilter } from "@/components/icons";
import { ModalPortal } from "./modal-portal";

interface FiltrosSheetProps {
  // activo — pinta el botón disparador distinto (mismo criterio visual
  // que el resto del panel: borde/fondo salvia cuando hay algo aplicado)
  // para que se note de un vistazo que la lista está filtrada sin tener
  // que abrir la hoja.
  activo: boolean;
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
export function FiltrosSheet({ activo, aplicarLabel, onAplicar, onLimpiar, onAbrir, children, triggerLabel = "Filtros" }: FiltrosSheetProps) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {/* Corrección de QA (2026-09-06), pedido textual del cliente: "al
          botón de filtros ponerle un icono de filtros y que el botón se
          vea verde" — antes era neutro (borde arena) salvo con un filtro
          ya aplicado; ahora es siempre el mismo verde sólido que el resto
          de las acciones primarias del panel (Buscar, Confirmar). El
          indicador de "hay un filtro aplicado" pasa de un cambio de color
          (que ya no puede notarse, el botón siempre es verde) a un punto
          color marfil superpuesto, visible sobre el fondo verde. */}
      <button
        type="button"
        onClick={() => {
          onAbrir?.();
          setAbierto(true);
        }}
        className="inline-flex items-center gap-2 rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95 whitespace-nowrap"
      >
        <IconFilter className="h-4 w-4" />
        {triggerLabel}
        {activo && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-marfil" />}
      </button>

      {abierto && (
        <ModalPortal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={triggerLabel}
            className="fixed inset-0 z-50 flex items-end justify-center bg-grafito/50 backdrop-blur-sm md:items-center md:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setAbierto(false);
            }}
          >
            <div className="flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-t-card border-t-[0.5px] border-arena bg-marfil shadow-soft md:max-h-[90vh] md:max-w-md md:rounded-card md:border-[0.5px]">
              <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
                <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">{triggerLabel}</h2>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                  className="text-2xl leading-none text-grafito/50 hover:text-grafito"
                >
                  ×
                </button>
              </div>

              <div className="flex flex-col gap-4 p-6">{children}</div>

              <div className="flex items-center justify-between gap-3 border-t-[0.5px] border-arena px-6 py-4">
                {onLimpiar ? (
                  <button type="button" onClick={onLimpiar} className="text-sm font-medium text-salvia-oscuro hover:text-grafito">
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
                  className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95"
                >
                  {aplicarLabel}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
