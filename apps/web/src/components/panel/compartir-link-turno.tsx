"use client";

import { useState } from "react";
import { crearEnlaceTurnoAction } from "@/app/actions/turnos";

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

  const puedeCompartirNativo = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function generar() {
    setEstado("generando");
    const resultado = await crearEnlaceTurnoAction();
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
      <p className="text-sm text-grafito/70">
        Generá un link de 1 hora para que la persona elija día y horario directamente — sin pasar por el código de
        verificación (ya hablaste con ella).
      </p>

      {estado === "inicial" && (
        <button
          type="button"
          onClick={generar}
          className="self-start rounded-full bg-salvia-oscuro px-6 py-2.5 text-sm font-semibold text-marfil hover:brightness-95"
        >
          Generar link
        </button>
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
