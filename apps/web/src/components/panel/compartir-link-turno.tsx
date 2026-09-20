"use client";

import { useState } from "react";
import type { PacienteConocido } from "@dental-mirage/shared-types";
import { crearEnlaceTurnoAction } from "@/app/actions/turnos";
import { BuscadorPacientes } from "./buscador-pacientes";

// armarMensaje — un solo texto informativo, reusado en TODAS las formas
// de compartir (nativo, WhatsApp, mail, copiar) — pedido explícito del
// cliente: que compartir el link no mande la URL pelada, sino con
// contexto (para qué es, cuánto dura). El link va DENTRO del mensaje en
// los cuatro casos (nunca como campo aparte de `navigator.share`) para
// que no aparezca duplicado en la app que lo reciba — varias apps de
// destino concatenan `text` + `url` si se mandan por separado.
function armarMensaje(url: string): string {
  return `¡Hola! Te paso el link para reservar tu turno: ${url}\n\nEs válido por 1 hora — al entrar vas a poder elegir el día y el horario que prefieras.`;
}

/**
 * "+ Agregar turno" → "Compartir link de turnero" (Fase 2, ítem 5): el
 * profesional ya habló con el paciente y solo necesita mandarle un link
 * de 1h para que termine de elegir día y horario — sin CAPTCHA ni
 * "Confirmanos que sos vos" del otro lado (ver TR de esta fase para el
 * detalle completo de qué controles se mantienen).
 *
 * Desktop: 3 botones explícitos (WhatsApp Web, mail, copiar). Mobile: un
 * solo botón "Compartir" que dispara el panel nativo del sistema
 * operativo — se elige por feature-detection (`navigator.share`
 * disponible), no por ancho de pantalla: es más preciso que un media
 * query (algunas notebooks/tablets con Web Share Level 2 también lo
 * tienen, y ahí la opción nativa es igual de válida).
 */
export function CompartirLinkTurno() {
  const [estado, setEstado] = useState<"inicial" | "generando" | "listo" | "error">("inicial");
  const [url, setUrl] = useState("");
  const [copiado, setCopiado] = useState(false);

  // Las dos decisiones del link (Fase 3.2.7b). Los defaults son el
  // comportamiento de siempre: mi agenda, sin paciente elegido — el caso
  // para el que se creó esta pestaña.
  const [paraTodos, setParaTodos] = useState(false);
  // La ficha entera y no solo su id: el buscador compartido la devuelve
  // completa, y es lo que hace falta para mostrar a quién se eligió.
  const [elegido, setElegido] = useState<PacienteConocido | null>(null);

  const puedeCompartirNativo = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function generar() {
    setEstado("generando");
    const resultado = await crearEnlaceTurnoAction({
      paraTodosLosProfesionales: paraTodos,
      pacienteId: elegido?.id,
    });
    if ("error" in resultado) {
      setEstado("error");
      return;
    }
    setUrl(resultado.url);
    setEstado("listo");
  }

  async function copiar() {
    try {
      // Copia el mensaje completo (no la URL pelada) — pedido explícito
      // del cliente: lo que se comparte siempre lleva el mensaje
      // informativo, sea cual sea el método.
      await navigator.clipboard.writeText(armarMensaje(url));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Clipboard puede fallar (permisos, contexto no seguro) — el link
      // sigue visible y seleccionable a mano en el campo de texto, así
      // que no hace falta un mensaje de error aparte.
    }
  }

  async function compartirNativo() {
    try {
      // Sin `url` aparte: ya va incluida en `text` (armarMensaje) — con
      // los dos campos juntos, varias apps de destino la muestran dos
      // veces.
      await navigator.share({ title: "Turno", text: armarMensaje(url) });
    } catch {
      // El usuario canceló el panel de compartir, o el navegador lo
      // rechazó — no es un error real, no hace falta avisar nada.
    }
  }

  const textoWhatsapp = encodeURIComponent(armarMensaje(url));
  const asuntoMail = encodeURIComponent("Link para reservar tu turno");
  const cuerpoMail = encodeURIComponent(armarMensaje(url));

  return (
    <div className="flex flex-col gap-4">
      {/* Sin párrafo propio (2026-09-19): decía lo mismo que el de la
          pestaña, dos veces seguidas y con distinto texto. */}
      {estado === "inicial" && (
        <div className="flex flex-col gap-4">
          {/* Con quién es el turno (Fase 3.2.7b). "Vos mismo" es el
              default y el caso para el que se creó esta pestaña: ya
              hablaste con la persona y solo falta que elija horario EN TU
              agenda. "Todos" es el link de mostrador. */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-medium text-grafito">¿Con quién es el turno?</legend>
            {[
              { valor: false, titulo: "Con vos", detalle: "El turno entra en tu agenda y no se le pregunta nada." },
              { valor: true, titulo: "Con cualquier profesional", detalle: "La persona elige con quién atenderse." },
            ].map((opcion) => (
              <label
                key={String(opcion.valor)}
                className={`flex cursor-pointer items-start gap-2.5 rounded-field border px-3 py-2.5 transition-colors ${
                  paraTodos === opcion.valor ? "border-salvia-oscuro bg-salvia-claro" : "border-linea bg-hueso hover:border-salvia"
                }`}
              >
                {/* Cuadrado con checkmark, no el radio redondo azul del
                    navegador (2026-09-19): el azul de sistema no existe
                    en la paleta, y el resto del panel marca las opciones
                    así. `sr-only` deja el input real —foco, teclado,
                    lectores de pantalla— y lo que se ve es la caja. */}
                <input
                  type="radio"
                  name="alcance-enlace"
                  checked={paraTodos === opcion.valor}
                  onChange={() => setParaTodos(opcion.valor)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border peer-focus-visible:ring-2 peer-focus-visible:ring-salvia ${
                    paraTodos === opcion.valor ? "border-salvia-oscuro bg-salvia-oscuro text-marfil" : "border-linea bg-marfil"
                  }`}
                >
                  {paraTodos === opcion.valor && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-grafito">{opcion.titulo}</span>
                  <span className="text-xs text-grafito/60">{opcion.detalle}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {/* La ficha, opcional: con ella el wizard no le vuelve a pedir
              los datos que ya tenemos. */}
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-grafito">¿Para quién? (opcional)</span>
            {elegido ? (
              <div className="flex items-center justify-between gap-3 rounded-field border border-salvia-oscuro bg-salvia-claro px-3 py-2.5">
                <span className="text-sm text-grafito">
                  {elegido.nombre} {elegido.apellido}
                  <span className="text-grafito/60"> · DNI {elegido.dni}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setElegido(null)}
                  className="shrink-0 text-xs font-medium text-salvia-oscuro hover:underline"
                >
                  Quitar
                </button>
              </div>
            ) : (
              <>
                {/* El mismo buscador que "Paciente conocido" (2026-09-19):
                    eran dos campos distintos preguntando lo mismo sobre
                    la misma lista. */}
                <BuscadorPacientes onElegir={setElegido} altoMaximo="max-h-48" />
                <p className="text-xs text-grafito/60">
                  Si la elegís, no va a tener que cargar sus datos de nuevo.
                </p>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={generar}
            className="self-start rounded-full bg-salvia-oscuro px-6 py-2.5 text-sm font-semibold text-marfil hover:brightness-95"
          >
            Generar link
          </button>
        </div>
      )}

      {estado === "generando" && <p className="text-sm text-grafito/60">Generando…</p>}

      {estado === "error" && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-terracota-oscuro">
            No se pudo generar el link. Intentá de nuevo.
          </p>
          <button type="button" onClick={generar} className="self-start text-sm font-medium text-salvia-oscuro hover:underline">
            Reintentar
          </button>
        </div>
      )}

      {estado === "listo" && (
        <div className="flex flex-col gap-3">
          <input
            type="text"
            readOnly
            value={url}
            aria-label="Link para compartir"
            onFocus={(e) => e.target.select()}
            className="w-full rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2.5 text-sm text-grafito"
          />
          <p className="text-xs text-grafito/50">Válido por 1 hora desde que se generó.</p>

          {puedeCompartirNativo ? (
            <button
              type="button"
              onClick={compartirNativo}
              className="self-start rounded-full bg-salvia-oscuro px-6 py-2.5 text-sm font-semibold text-marfil hover:brightness-95"
            >
              Compartir
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://wa.me/?text=${textoWhatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border-[0.5px] border-arena px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
              >
                WhatsApp Web
              </a>
              <a
                href={`mailto:?subject=${asuntoMail}&body=${cuerpoMail}`}
                className="rounded-full border-[0.5px] border-arena px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
              >
                Mail
              </a>
              <button
                type="button"
                onClick={copiar}
                className="rounded-full border-[0.5px] border-arena px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
              >
                {copiado ? "¡Copiado!" : "Copiar mensaje"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
