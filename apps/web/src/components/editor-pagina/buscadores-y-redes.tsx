"use client";

import { MAX_LARGO_SEO_DESCRIPCION, MAX_LARGO_SEO_TITULO, recortar } from "@/lib/pagina-publica/seo";
import type { Borrador } from "@/lib/pagina-publica/borrador";
import { CLASE_AYUDA, CLASE_CAMPO, CLASE_ETIQUETA } from "./estilos";

interface BuscadoresYRedesProps {
  slug: string;
  seoTitulo: string;
  seoDescripcion: string;
  /** Lo que se usa si el campo queda vacío (lib/pagina-publica/seo.ts). */
  tituloPorDefecto: string;
  descripcionPorDefecto: string;
  onCambio: (parcial: Partial<Borrador>) => void;
}

// Pestaña "Buscadores y redes" (PE-9): cómo aparece la página en Google y en
// la vista previa de un link compartido. Dos campos opcionales — vacíos, la
// página usa un título y una descripción armados con el nombre, las
// especialidades y la ciudad, que se muestran de sugerencia. Como el resto
// del editor, se guarda con el borrador y llega al público al Publicar.
export function BuscadoresYRedes({ slug, seoTitulo, seoDescripcion, tituloPorDefecto, descripcionPorDefecto, onCambio }: BuscadoresYRedesProps) {
  const titulo = seoTitulo.trim() || tituloPorDefecto;
  const descripcion = seoDescripcion.trim() || descripcionPorDefecto;

  return (
    <section aria-label="Buscadores y redes" className="flex flex-col gap-4 rounded-card border-[0.5px] border-arena bg-marfil p-4">
      <div>
        <h2 className="text-sm font-semibold text-grafito">Buscadores y redes</h2>
        <p className={`mt-1 ${CLASE_AYUDA}`}>
          Así aparece tu página en Google y cuando alguien comparte el link por WhatsApp. Si dejás un campo vacío, usamos el que ves de ejemplo.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="flex items-baseline justify-between">
          <span className={CLASE_ETIQUETA}>Título</span>
          <span className={CLASE_AYUDA}>
            {seoTitulo.length}/{MAX_LARGO_SEO_TITULO}
          </span>
        </span>
        <input
          type="text"
          value={seoTitulo}
          maxLength={MAX_LARGO_SEO_TITULO}
          placeholder={tituloPorDefecto}
          onChange={(e) => onCambio({ seoTitulo: e.target.value })}
          className={CLASE_CAMPO}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="flex items-baseline justify-between">
          <span className={CLASE_ETIQUETA}>Descripción</span>
          <span className={CLASE_AYUDA}>
            {seoDescripcion.length}/{MAX_LARGO_SEO_DESCRIPCION}
          </span>
        </span>
        <textarea
          value={seoDescripcion}
          maxLength={MAX_LARGO_SEO_DESCRIPCION}
          rows={3}
          placeholder={descripcionPorDefecto}
          onChange={(e) => onCambio({ seoDescripcion: e.target.value })}
          className={CLASE_CAMPO}
        />
      </label>

      {/* Una aproximación al resultado de Google: el buscador decide el
          formato final, pero los largos y el texto son estos. */}
      <figure aria-label="Vista previa en Google" className="flex flex-col gap-0.5 rounded-field border border-linea bg-hueso p-3">
        <figcaption className={CLASE_ETIQUETA}>Vista previa en Google</figcaption>
        <span className="mt-1 truncate text-xs text-grafito/75">/{slug}</span>
        <span className="text-base leading-snug text-[#1a0dab]">{recortar(titulo, 60)}</span>
        <span className="text-xs text-grafito/75">{descripcion}</span>
      </figure>

      <p className={CLASE_AYUDA}>
        La imagen que acompaña el link se arma sola con los colores y la tipografía de tu tema publicado.{" "}
        <a href={`/${slug}/opengraph-image`} target="_blank" rel="noopener noreferrer" className="underline hover:text-salvia-oscuro">
          Ver la imagen actual
        </a>
      </p>
    </section>
  );
}
