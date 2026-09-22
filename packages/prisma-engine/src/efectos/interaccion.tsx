"use client";

import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { IntensidadEfecto } from "./catalogo";

export default function EfectoInteraccion({ id, intensidad, children }: { id: string; intensidad: IntensidadEfecto; children: ReactNode }) {
  const [pulso, setPulso] = useState(false);
  function mover(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--pp-cursor-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
    e.currentTarget.style.setProperty("--pp-cursor-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
    if (id === "magnetico") {
      const fuerza = intensidad === "sutil" ? 2 : intensidad === "media" ? 4 : 6;
      e.currentTarget.style.setProperty("--pp-magnet-x", `${((e.clientX - rect.left - rect.width / 2) / rect.width) * fuerza}px`);
      e.currentTarget.style.setProperty("--pp-magnet-y", `${((e.clientY - rect.top - rect.height / 2) / rect.height) * fuerza}px`);
    }
  }
  return (
    <div
      data-pp-efecto={id}
      data-pp-pulso={pulso ? "true" : "false"}
      data-pp-intensidad={intensidad}
      onPointerMove={id === "magnetico" || id === "foco-cursor" ? mover : undefined}
      onClick={id === "chispas" ? () => { setPulso(true); window.setTimeout(() => setPulso(false), 520); } : undefined}
      onPointerLeave={(e) => {
        e.currentTarget.style.setProperty("--pp-magnet-x", "0px");
        e.currentTarget.style.setProperty("--pp-magnet-y", "0px");
      }}
      style={{
        "--pp-efecto-fuerza": intensidad === "sutil" ? "2px" : intensidad === "media" ? "4px" : "6px",
        "--pp-efecto-inclinacion-x": intensidad === "sutil" ? ".3deg" : intensidad === "media" ? ".7deg" : "1deg",
        "--pp-efecto-inclinacion-y": intensidad === "sutil" ? "-.3deg" : intensidad === "media" ? "-.7deg" : "-1deg",
        "--pp-efecto-reflejo": intensidad === "sutil" ? ".12" : intensidad === "media" ? ".2" : ".28",
      } as CSSProperties}
    >
      {children}
    </div>
  );
}
