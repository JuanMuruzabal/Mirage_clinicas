"use client";

import { useId, useRef, useState } from "react";
import { subirFotoPaginaPublicaAction } from "@/app/actions/pagina-publica";
import { CLASE_AYUDA, CLASE_BOTON, CLASE_BOTON_PELIGRO } from "./estilos";

// Espejo de los límites del backend (subirFotoPaginaPublicaHandler): validar
// acá evita subir 5 MB para enterarse después de que no servían, pero el
// backend sigue siendo quien decide.
const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

interface SubirFotoProps {
  /** La foto actual ("" = ninguna). Con `modo="agregar"` no se muestra. */
  url: string;
  /** Recibe la URL de la foto recién subida. */
  onSubida: (url: string) => void;
  /** Sin esto no aparece "Quitar" (p. ej. en la galería, que quita por foto). */
  onQuitar?: () => void;
  /** "reemplazar" muestra la foto actual; "agregar" solo el botón. */
  modo?: "reemplazar" | "agregar";
  etiqueta: string;
  deshabilitado?: boolean;
}

// SubirFoto (Fase 4.4) — un botón de archivo que sube la imagen apenas se
// elige (la foto queda en el storage, pero recién forma parte de la página
// al "Guardar cambios") y avisa la URL resultante.
export function SubirFoto({ url, onSubida, onQuitar, modo = "reemplazar", etiqueta, deshabilitado }: SubirFotoProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    // Sin esto, elegir DOS veces el mismo archivo no dispara `change`.
    if (input.current) input.current.value = "";
    if (!archivo) return;

    setError(null);
    if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
      setError("Formato no soportado — usá JPEG, PNG o WebP.");
      return;
    }
    if (archivo.size > MAX_BYTES) {
      setError("La imagen supera los 5 MB.");
      return;
    }

    setSubiendo(true);
    const datos = new FormData();
    datos.append("foto", archivo);
    const resultado = await subirFotoPaginaPublicaAction(datos);
    setSubiendo(false);
    if ("error" in resultado) {
      setError(resultado.error);
      return;
    }
    onSubida(resultado.url);
  }

  const hayFoto = modo === "reemplazar" && url !== "";

  return (
    <div className="flex flex-col gap-2">
      {hayFoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="aspect-[16/9] w-full rounded-field border-[0.5px] border-arena object-cover" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          id={id}
          type="file"
          accept={TIPOS_ACEPTADOS.join(",")}
          onChange={alElegir}
          disabled={deshabilitado || subiendo}
          className="sr-only"
        />
        <label
          htmlFor={id}
          className={`${CLASE_BOTON} cursor-pointer ${deshabilitado || subiendo ? "pointer-events-none opacity-50" : ""}`}
        >
          {subiendo ? "Subiendo…" : hayFoto ? `Cambiar ${etiqueta}` : `Subir ${etiqueta}`}
        </label>
        {hayFoto && onQuitar && (
          <button type="button" onClick={onQuitar} disabled={deshabilitado || subiendo} className={CLASE_BOTON_PELIGRO}>
            Quitar
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-terracota-oscuro">
          {error}
        </p>
      )}
      {!error && !hayFoto && <p className={CLASE_AYUDA}>JPEG, PNG o WebP, hasta 5 MB.</p>}
    </div>
  );
}
