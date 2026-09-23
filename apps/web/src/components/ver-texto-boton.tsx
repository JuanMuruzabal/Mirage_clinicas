"use client";

import { useState } from "react";
import { ModalPortal } from "./panel/modal-portal";

interface VerTextoBotonProps {
  // Título del modal (ej. "Motivo de consulta", "Email") — también es el
  // texto accesible del botón, junto con `variante`.
  titulo: string;
  texto: string;
  // "boton" (default): pastilla con borde, para usar dentro de una fila
  // de tabla. "link": texto simple subrayado al hover, para el cuerpo
  // semi-transparente de las tarjetas del dashboard (F2.3 extra ítem 1).
  variante?: "boton" | "link";
  className?: string;
  // principal (contactos principales, 2026-09-23) — con una lista de mails
  // o teléfonos (uno por línea en `texto`), cuál es el principal: el
  // modal los muestra como lista y lo marca. Sin este prop, el texto se
  // muestra tal cual, como siempre.
  principal?: string | null;
}

// VerTextoBoton (F2.3 extra ítem 1, docs/Arquitectura y base/implementation-plan.md §11.5,
// tarea E1.7) — componente compartido para "Ver motivo"/"Ver mail": un
// texto largo (motivo de un horario reservado/turno, email de un
// paciente) rompía el ancho de la fila que lo mostraba inline — pedido
// explícito del cliente, ver docs/Fases post MVP/Fase 2/fase2.3-extra-dental-mirage.md. Se
// construye ACÁ (tarjeta 3- del Turnero, la primera en usarlo) para que
// los ítems 2.3.3 ("Ver motivo" en Turnos) y 2.3.4 ("Ver mail" en
// Pacientes) lo reusen tal cual, sin duplicar el modal.
//
// Sin flecha (tercera ronda de correcciones, 2026-09-06, pedido textual
// del cliente: "sacar de todos los botones que contengan '->'") — el prop
// `flecha` que existía acá se eliminó del todo: SIEMPRE es un `<button>`
// que abre un modal, nunca navega, así que la flecha no correspondía en
// ninguno de sus usos.
export function VerTextoBoton({ titulo, texto, variante = "boton", className = "", principal }: VerTextoBotonProps) {
  const [abierto, setAbierto] = useState(false);
  const items = principal ? texto.split("\n") : null;
  // Solo la PRIMERA coincidencia: si el dato estuviera repetido, una sola
  // marca de principal.
  const indicePrincipal = items ? items.indexOf(principal!) : -1;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto(true);
        }}
        className={
          variante === "link"
            ? `text-left text-sm font-medium text-salvia-oscuro underline-offset-2 hover:underline ${className}`
            : `rounded-full border-[0.5px] border-arena px-3 py-1 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro ${className}`
        }
      >
        Ver {titulo.toLowerCase()}
      </button>

      {abierto && (
        <ModalPortal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setAbierto(false);
            }}
          >
            <div className="flex w-full max-w-md flex-col overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
              <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
                <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">{titulo}</h2>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                  className="text-2xl leading-none text-grafito/50 hover:text-grafito"
                >
                  ×
                </button>
              </div>
              {items ? (
                <ul className="flex flex-col gap-2 p-6 text-sm text-grafito">
                  {items.map((item, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 break-all">
                      <span className="font-[family-name:var(--font-mono)]">{item}</span>
                      {i === indicePrincipal && (
                        <span className="rounded-full bg-salvia-claro px-2.5 py-0.5 text-xs font-medium text-salvia-oscuro">Principal</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="whitespace-pre-wrap p-6 text-sm text-grafito">{texto}</p>
              )}
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
