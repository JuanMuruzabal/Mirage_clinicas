"use client";

import { Dialogo } from "@/components/dialogo";
import { useState, type ReactNode } from "react";

interface VerTextoBotonProps {
  // Título del modal (ej. "Motivo de consulta", "Email") — también es el
  // texto accesible del botón, junto con `variante`.
  titulo: string;
  // texto — lo que muestra el modal. Opcional solo si viene `contenido`.
  texto?: string;
  // contenido — un cuerpo armado para el modal en vez del texto plano
  // ("Ver tutores" en Pacientes: nombre, relación y contacto de cada
  // tutor, 2026-10-17). Va adentro del mismo `Dialogo`, sin padding: lo
  // pone quien lo arma.
  contenido?: ReactNode;
  // "boton" (default): blanco con el borde y el rótulo en el verde de
  // marca (como los botones con contorno de /clinicas), para usar dentro
  // de una fila de tabla. Hasta el 2026-10-17 era un borde de medio píxel
  // sin relleno, casi invisible sobre el vidrio de las tablas. Mide 26 px
  // de alto para no agrandar la fila, y su área táctil se estira a 44 px
  // con un `::after` invisible (cabe en el padding de la celda).
  // "link": texto simple subrayado al hover, para el cuerpo
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
export function VerTextoBoton({ titulo, texto = "", contenido, variante = "boton", className = "", principal }: VerTextoBotonProps) {
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
            ? `text-left text-sm font-medium text-marca underline-offset-2 hover:underline ${className}`
            : `relative inline-flex items-center rounded-control border border-marca-medio bg-marfil px-3 py-1 text-xs font-medium whitespace-nowrap text-marca hover:border-marca hover:bg-marca-claro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca after:absolute after:-inset-x-1 after:-inset-y-[9px] after:content-[''] ${className}`
        }
      >
        Ver {titulo.toLowerCase()}
      </button>

      {abierto && (
        <Dialogo titulo={titulo} onCerrar={() => setAbierto(false)} superficie="marfil" centrado ancho="chico">
          {contenido ? (
            contenido
          ) : items ? (
            <ul className="flex flex-col gap-2 p-6 text-sm text-grafito">
              {items.map((item, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 break-all">
                  <span className="font-[family-name:var(--font-mono)] tabular-nums">{item}</span>
                  {i === indicePrincipal && (
                    <span className="rounded-pastilla bg-marca-claro px-2.5 py-0.5 text-xs font-medium text-marca">Principal</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="whitespace-pre-wrap p-6 text-sm text-grafito">{texto}</p>
          )}
        </Dialogo>
      )}
    </>
  );
}
