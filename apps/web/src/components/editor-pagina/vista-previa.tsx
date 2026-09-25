"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from "react";
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
  telefono?: string | null;
  especialidades: string[];
  contenido: ContenidoPagina;
  /**
   * PP-6 (H21): tocar una sección avisa qué módulo es (su clave, o "portada"),
   * para que el editor lo abra. Sin esto (la galería de plantillas) las
   * secciones no se pueden elegir.
   */
  onElegirSeccion?: (clave: string) => void;
  /** El módulo abierto en la lista: su sección queda marcada y la vista previa hace scroll hasta ella. */
  moduloAbierto?: string | null;
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
export function VistaPrevia({ slug, nombreClinica, telefono, especialidades, contenido, onElegirSeccion, moduloAbierto }: VistaPreviaProps) {
  const [dispositivo, setDispositivo] = useState<IdDispositivo>("escritorio");
  const [reproduccion, setReproduccion] = useState(0);
  const [aviso, setAviso] = useState(false);
  const marco = useRef<HTMLDivElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  // Un prefijo por instancia: la galería de plantillas abre una segunda
  // vista previa sobre la del editor, y los ids no pueden repetirse.
  const prefijoIds = `vp${useId().replace(/[^a-zA-Z0-9]/g, "")}-`;
  const ancho = DISPOSITIVOS.find((d) => d.id === dispositivo)?.ancho ?? null;

  // Abrir un módulo desde la lista lleva la vista previa hasta su sección
  // (PP-6, H21). Solo se mueve el scroll de ESTE recuadro, no el de la
  // ventana: en escritorio el panel está al lado y no tiene que saltar. Oculta
  // (en un celular, mientras se edita) no hay nada que mover.
  useEffect(() => {
    const contenedor = raiz.current;
    if (!moduloAbierto || !contenedor || !contenedor.offsetParent) return;
    const seccion = marco.current?.querySelector<HTMLElement>(`[data-modulo="${CSS.escape(moduloAbierto)}"]`);
    if (!seccion || contenedor.scrollHeight <= contenedor.clientHeight) return;
    const arriba = seccion.getBoundingClientRect().top - contenedor.getBoundingClientRect().top + contenedor.scrollTop - 16;
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    contenedor.scrollTo?.({ top: Math.max(0, arriba), behavior: quieto ? "auto" : "smooth" });
  }, [moduloAbierto]);

  function elegir(desde: EventTarget) {
    const seccion = (desde as HTMLElement).closest<HTMLElement>("[data-modulo]");
    if (seccion?.dataset.modulo) onElegirSeccion?.(seccion.dataset.modulo);
  }

  function alTocar(e: MouseEvent<HTMLDivElement>) {
    const objetivo = (e.target as HTMLElement).closest("a, button, summary");
    // Tocar una sección fuera de un control abre su módulo (PP-6, H21).
    if (!objetivo) {
      elegir(e.target);
      return;
    }
    if (objetivo.tagName === "SUMMARY") return;
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
    // Un botón o link de una sección tampoco hace nada acá, pero dice cuál
    // es la sección que se quiere tocar.
    elegir(e.target);
  }

  return (
    <div ref={raiz} className="min-h-0 flex-1 overflow-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-[0.5px] border-arena bg-marfil px-4 py-2">
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/75">Previsualización en vivo</p>
        <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setReproduccion((r) => r + 1)} className="rounded-full border-[0.5px] border-arena px-3 py-1 text-xs font-medium text-grafito hover:border-salvia">
          Reproducir efectos
        </button>
        {/* El selector de ancho solo desde lg (PP-5, H17): en un celular
            "Móvil" (390 px) no entraba y hacía scroll horizontal, y "Tablet"
            o "Escritorio" no tienen sentido. Ahí la vista previa es siempre
            el ancho real del dispositivo. */}
        <div className="hidden lg:block">
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
      </div>
      {/* Sin fondo propio acá — ClinicaPublicaTemplate trae el suyo. El
          wrapper con ancho fijo es lo único que cambia entre dispositivos. */}
      {/* role="status": se anuncia sin mover el foco. */}
      <p role="status" className={aviso ? "border-b-[0.5px] border-arena bg-hueso px-4 py-2 text-xs text-grafito/80" : "sr-only"}>
        {aviso ? "En la vista previa los botones y enlaces no hacen nada. Probalos desde “Ver página”." : ""}
      </p>
      <div ref={marco} onClickCapture={alTocar} data-testid="vista-previa-marco" className="mx-auto transition-[max-width] duration-300 lg:max-w-(--ancho-vista)"
        style={{ "--ancho-vista": ancho ? `${ancho}px` : "100%" } as CSSProperties}>
        <ClinicaPublicaTemplate
          vistaPrevia={{ prefijoIds, seccionesElegibles: !!onElegirSeccion, moduloAbierto }}

          key={reproduccion}
          slug={slug}
          nombreClinica={nombreClinica}
          telefono={telefono}
          especialidades={especialidades}
          contenido={contenido}
        />
      </div>
    </div>
  );
}
