"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ClinicaDelUsuario } from "@dental-mirage/shared-types";
import { entrarEnClinicaAction } from "@/app/actions/clinicas";
import { IconCheck, IconChevronDown } from "@/components/icons";

const ETIQUETA_ROL: Record<string, string> = {
  owner: "Titular",
  admin: "Administrador de página",
  profesional: "Profesional",
  recepcion: "Recepción",
};

// Selector de clínica — rediseño del 2026-09-14.
//
// Reemplaza a la línea "Estás en [píldora] Cambiar de clínica", que eran
// **tres tratamientos visuales para una sola idea** apretados abajo del
// saludo: un texto, una píldora y un enlace, para decir dónde estás y
// cómo cambiarlo. Acá es un control único, a la derecha del título.
//
// Que además llene ese costado no es decoración: el encabezado tenía todo
// el peso a la izquierda y la mitad derecha vacía.
//
// Desde la Fase 3.2.5 tiene una segunda vida en el topbar de /panel/**,
// donde el espacio es otro: ahí va la variante `compacto` (punto + nombre
// + chevron, sin el rótulo "Estás en") y el popover se alinea a la
// izquierda, porque el control vive pegado al logo y no al borde derecho.
// Es el mismo componente y no una copia: lo que cambia es la caja, no lo
// que hace ni lo que sabe.
export function SelectorClinica({
  clinicas,
  nombreActual,
  variante = "tarjeta",
  alineacion = "derecha",
}: {
  clinicas: ClinicaDelUsuario[];
  nombreActual: string;
  variante?: "tarjeta" | "compacto";
  alineacion?: "izquierda" | "derecha";
}) {
  const compacto = variante === "compacto";
  const [abierto, setAbierto] = useState(false);
  const [entrando, setEntrando] = useState<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const [, iniciar] = useTransition();

  useEffect(() => {
    if (!abierto) return;
    function alClickearAfuera(evento: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }
    function alApretarEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alClickearAfuera);
    document.addEventListener("keydown", alApretarEscape);
    return () => {
      document.removeEventListener("mousedown", alClickearAfuera);
      document.removeEventListener("keydown", alApretarEscape);
    };
  }, [abierto]);

  function cambiarA(clinicaId: string) {
    setEntrando(clinicaId);
    iniciar(async () => {
      await entrarEnClinicaAction(clinicaId);
      setEntrando(null);
    });
  }

  return (
    <div ref={contenedor} className="relative flex-shrink-0">
      <button
        type="button"
        aria-expanded={abierto}
        aria-label="Cambiar de clínica"
        onClick={() => setAbierto((a) => !a)}
        className={`flex items-center border border-linea bg-marfil text-left transition-colors hover:border-salvia ${
          compacto ? "gap-2 rounded-full px-3 py-1.5" : "gap-3 rounded-[12px] px-4 py-2.5"
        }`}
      >
        <span aria-hidden="true" className="h-[9px] w-[9px] flex-shrink-0 rounded-full bg-salvia-oscuro" />
        {compacto ? (
          <span className="max-w-[9rem] truncate text-sm font-medium text-grafito sm:max-w-[14rem]">{nombreActual}</span>
        ) : (
          <span className="flex flex-col">
            <span className="font-[family-name:var(--font-mono)] text-[11.5px] uppercase tracking-[0.16em] text-grafito/45">
              Estás en
            </span>
            <span className="font-[family-name:var(--font-display)] text-[17px] font-semibold text-grafito">
              {nombreActual}
            </span>
          </span>
        )}
        <IconChevronDown className={`h-4 w-4 flex-shrink-0 text-grafito/40 ${abierto ? "rotate-180" : ""}`} />
      </button>

      {/* `max-w-[calc(100vw-3rem)]`: en un teléfono angosto, 288px fijos
          se salen igual aunque el ancla esté a la derecha. */}
      {abierto && (
        <div
          className={`absolute top-[calc(100%+0.5rem)] z-20 flex w-72 max-w-[calc(100vw-3rem)] flex-col rounded-card border border-linea bg-marfil p-2 shadow-soft ${
            alineacion === "izquierda" ? "left-0" : "right-0"
          }`}
        >
          <p className="px-3 py-2 font-[family-name:var(--font-mono)] text-[11.5px] uppercase tracking-[0.16em] text-grafito/45">
            Cambiar de clínica
          </p>
          <ul className="flex flex-col gap-0.5">
            {clinicas.map((clinica) => (
              <li key={clinica.id}>
                <button
                  type="button"
                  disabled={entrando !== null}
                  onClick={() => (clinica.activa ? setAbierto(false) : cambiarA(clinica.id))}
                  className={`flex w-full items-center gap-2 rounded-field px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                    clinica.activa ? "bg-salvia-claro" : "hover:bg-hueso"
                  }`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-grafito">{clinica.nombre}</span>
                    <span className="truncate text-xs text-grafito/50">
                      {ETIQUETA_ROL[clinica.rolPrincipal] ?? clinica.rolPrincipal}
                    </span>
                  </span>
                  {clinica.activa && <IconCheck className="ml-auto h-4 w-4 flex-shrink-0 text-salvia-oscuro" />}
                </button>
              </li>
            ))}
          </ul>
          <Link
            href="/clinicas"
            onClick={() => setAbierto(false)}
            className="mt-1 border-t border-linea px-3 pb-1 pt-3 text-sm font-medium text-salvia-oscuro hover:text-grafito"
          >
            Ver todas las clínicas
          </Link>
        </div>
      )}
    </div>
  );
}
