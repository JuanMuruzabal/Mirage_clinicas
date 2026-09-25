"use client";

import { useId, useRef, useState, type MouseEvent } from "react";
import type { ContenidoPagina } from "@/lib/pagina-publica/contenido";
import { ClinicaPublicaTemplate } from "@/components/public/clinica-publica-template";
import { CLASE_TACTIL } from "./estilos";
import { GrupoDeOpciones } from "./grupo-de-opciones";

const DISPOSITIVOS = [
  { id: "movil", etiqueta: "Móvil", ancho: 390 },
  { id: "tablet", etiqueta: "Tablet", ancho: 768 },
  { id: "escritorio", etiqueta: "Escritorio", ancho: null },
] as const;

type IdDispositivo = (typeof DISPOSITIVOS)[number]["id"];

interface VistaPreviaProps {
  slug: string;
  nombreClinica: string;
  profesionalNombre: string;
  telefono?: string | null;
  especialidades: string[];
  contenido: ContenidoPagina;
}

// VistaPrevia (Fase 4.4) — la página tal como la ve un visitante, en tres
// anchos. No es un iframe: la plantilla reordena su grilla según el ANCHO
// DE SU CONTENEDOR (container queries, ver ClinicaPublicaTemplate), así que
// acotar el ancho de este wrapper alcanza para que muestre el layout de
// mobile o de tablet — con media queries de viewport, "Móvil" se vería igual
// que "Escritorio" en cualquier pantalla ancha.
//
// Tampoco es la página real para lo que se toca (PP-2, H5): "Pedir turno"
// abría el wizard de verdad —se podía sacar un turno real desde el editor— y
// un link a la página pública sacaba del editor con cambios sin guardar. Los
// clics se interceptan en captura, antes de que llegue el onClick del botón:
// un ancla de la propia página hace scroll dentro de la vista previa, y todo
// lo demás avisa que en la vista previa no funciona. Se deja pasar solo lo
// que no sale de la página ni crea nada (los <details> de las preguntas
// frecuentes y "Ver nombre" de Equipo).
export function VistaPrevia({ slug, nombreClinica, profesionalNombre, telefono, especialidades, contenido }: VistaPreviaProps) {
  const [dispositivo, setDispositivo] = useState<IdDispositivo>("escritorio");
  const [reproduccion, setReproduccion] = useState(0);
  const [aviso, setAviso] = useState(false);
  const marco = useRef<HTMLDivElement>(null);
  // Un prefijo por instancia: la galería de plantillas abre una segunda
  // vista previa sobre la del editor, y los ids no pueden repetirse.
  const prefijoIds = `vp${useId().replace(/[^a-zA-Z0-9]/g, "")}-`;
  const ancho = DISPOSITIVOS.find((d) => d.id === dispositivo)?.ancho ?? null;

  function alTocar(e: MouseEvent<HTMLDivElement>) {
    const objetivo = (e.target as HTMLElement).closest("a, button, summary");
    if (!objetivo || objetivo.tagName === "SUMMARY") return;
    e.preventDefault();
    e.stopPropagation();
    if (objetivo instanceof HTMLAnchorElement) {
      const destino = new URL(objetivo.href, window.location.href);
      const deEstaPagina = objetivo.getAttribute("href")?.startsWith("#") || destino.pathname === `/${slug}`;
      const ancla = destino.hash.slice(1);
      if (deEstaPagina && ancla) {
        // Las anclas del menú ya llevan el prefijo; las de un módulo
        // ("/slug?tipo=…#turno") no.
        const seccion = marco.current?.querySelector(`[id="${CSS.escape(ancla)}"]`) ?? marco.current?.querySelector(`[id="${CSS.escape(prefijoIds + ancla)}"]`);
        seccion?.scrollIntoView({ block: "start" });
        return;
      }
    }
    setAviso(true);
  }

  return (
    <div className="min-h-[640px] flex-1 overflow-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-[0.5px] border-arena bg-marfil px-4 py-2">
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/75">Previsualización en vivo</p>
        <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setReproduccion((r) => r + 1)} className="rounded-full border-[0.5px] border-arena px-3 py-1 text-xs font-medium text-grafito hover:border-salvia">
          Reproducir efectos
        </button>
        <GrupoDeOpciones
          etiqueta="Tamaño de la previsualización"
          etiquetaOculta
          valor={dispositivo}
          onCambio={(id) => setDispositivo(id as IdDispositivo)}
          opciones={DISPOSITIVOS.map((d) => ({ valor: d.id, contenido: d.etiqueta }))}
          className="flex gap-1"
          claseOpcion={(elegida) =>
            `rounded-full border-[0.5px] px-3 py-1 text-xs font-medium ${CLASE_TACTIL} ${
              elegida ? "border-salvia-oscuro bg-salvia-claro text-salvia-oscuro" : "border-arena bg-marfil text-grafito hover:border-salvia"
            }`
          }
        />
        </div>
      </div>
      {/* Sin fondo propio acá — ClinicaPublicaTemplate trae el suyo. El
          wrapper con ancho fijo es lo único que cambia entre dispositivos. */}
      {/* role="status": se anuncia sin mover el foco. */}
      <p role="status" className={aviso ? "border-b-[0.5px] border-arena bg-hueso px-4 py-2 text-xs text-grafito/80" : "sr-only"}>
        {aviso ? "En la vista previa los botones y enlaces no hacen nada. Probalos desde “Ver página”." : ""}
      </p>
      <div ref={marco} onClickCapture={alTocar} data-testid="vista-previa-marco" className="mx-auto transition-[max-width] duration-300" style={{ maxWidth: ancho ?? "100%" }}>
        <ClinicaPublicaTemplate
          vistaPrevia={{ prefijoIds }}

          key={reproduccion}
          slug={slug}
          nombreClinica={nombreClinica}
          profesionalNombre={profesionalNombre}
          telefono={telefono}
          especialidades={especialidades}
          contenido={contenido}
        />
      </div>
    </div>
  );
}
