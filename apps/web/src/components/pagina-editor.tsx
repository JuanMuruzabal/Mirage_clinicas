"use client";

import { useState } from "react";
import Link from "next/link";
import type { PaginaPublica, Profesional } from "@dental-mirage/shared-types";
import { deployarPaginaPublicaAction, ocultarPaginaPublicaAction } from "@/app/actions/pagina-publica";
import { formatFechaHora } from "@/lib/turno-format";
import { ClinicaPublicaTemplate } from "@/components/public/clinica-publica-template";

interface PaginaEditorProps {
  profesional: Profesional;
  paginaInicial: PaginaPublica;
}

// PaginaEditor (T4.1/T4.2, spec §5) — layout del editor: barra de
// acciones arriba (Ver página/Guardar cambios/Ocultar/Deployar, spec
// §5.2) + izquierda previsualización en vivo (mismo componente que la
// página real, ClinicaPublicaTemplate) / derecha panel de edición
// desplegable (spec §5.1: "sidebar desplegable, igual criterio que el de
// gestión de clínica", ver PanelSidebar). Vive en su propia página,
// /personalizar-pagina — no dentro de /panel/** (pedido explícito del
// cliente, 2026-08-23: "es una pagina aparte por fuera de gestion
// clinica"), así que acá tiene todo el ancho disponible, sin un sidebar
// de navegación de clínica al lado — de ahí el panel y la previsualización
// más generosos que si compartieran espacio con ese sidebar. "Guardar
// cambios" y los campos del panel quedan deshabilitados a propósito — la
// personalización real de contenido "queda para desarrollo posterior"
// (spec §5.1), acá solo se define layout y estructura.
export function PaginaEditor({ profesional, paginaInicial }: PaginaEditorProps) {
  const [pagina, setPagina] = useState(paginaInicial);
  const [pendingOcultar, setPendingOcultar] = useState(false);
  const [pendingDeployar, setPendingDeployar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(true);

  async function alternarOcultar() {
    setError(null);
    setPendingOcultar(true);
    const result = await ocultarPaginaPublicaAction(!pagina.oculta);
    setPendingOcultar(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setPagina(result.pagina);
  }

  async function deployar() {
    setError(null);
    setPendingDeployar(true);
    const result = await deployarPaginaPublicaAction();
    setPendingDeployar(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setPagina(result.pagina);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-card border-[0.5px] border-terracota bg-terracota-claro px-4 py-3 text-sm text-terracota-oscuro">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border-[0.5px] border-arena bg-marfil p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/${profesional.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border-[0.5px] border-arena bg-marfil px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
          >
            Ver página →
          </Link>
          <button
            type="button"
            disabled
            title="Vas a poder editar el contenido de tu página en una próxima actualización."
            className="cursor-not-allowed rounded-full border-[0.5px] border-arena bg-marfil px-4 py-2 text-sm font-medium text-grafito/40"
          >
            Guardar cambios
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pagina.deployadaEn ? (
            <span
              title={`Publicada el ${formatFechaHora(pagina.deployadaEn)}`}
              className="rounded-full border-[0.5px] border-salvia bg-salvia-claro px-3 py-1.5 text-xs font-medium text-salvia-oscuro"
            >
              Publicada
            </span>
          ) : (
            <button
              type="button"
              onClick={deployar}
              disabled={pendingDeployar}
              className="rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              {pendingDeployar ? "Publicando…" : "Deployar"}
            </button>
          )}
          <button
            type="button"
            onClick={alternarOcultar}
            disabled={pendingOcultar}
            className={`rounded-full border-[0.5px] px-4 py-2 text-sm font-medium disabled:opacity-60 ${
              pagina.oculta
                ? "border-terracota bg-marfil text-terracota-oscuro hover:bg-terracota-claro"
                : "border-arena bg-marfil text-grafito hover:border-salvia hover:text-salvia-oscuro"
            }`}
          >
            {pendingOcultar ? "Guardando…" : pagina.oculta ? "Mostrar" : "Ocultar"}
          </button>
        </div>
      </div>

      {pagina.oculta && (
        <p className="rounded-card border-[0.5px] border-terracota bg-terracota-claro px-4 py-3 text-sm text-terracota-oscuro">
          Tu página está en modo mantenimiento — los visitantes no ven el contenido hasta que la muestres de nuevo.
        </p>
      )}

      {/* flex-col en mobile, flex-row desde lg (2026-08-24, mismo pedido
          que el resto del panel: "los modulos se ven contraidos contra
          la pagina") — con `flex` fijo, el panel de edición (w-80, 320px)
          y la previsualización competían por el mismo ancho angosto en
          mobile; apilados, cada uno usa el 100% del ancho disponible. */}
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="min-h-[640px] flex-1 overflow-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
          <p className="border-b-[0.5px] border-arena bg-marfil px-4 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
            Previsualización en vivo
          </p>
          {/* Sin wrapper de fondo propio acá — ClinicaPublicaTemplate ya
              trae su propio fondo celeste y su padding (pedido explícito
              del cliente, 2026-08-23), la previsualización es fiel a la
              página real tal cual. */}
          <ClinicaPublicaTemplate
            slug={profesional.slug}
            nombreClinica={profesional.nombreClinica}
            profesionalNombre={profesional.nombre}
            telefono={profesional.telefono}
            especialidades={profesional.especialidades.map((e) => e.nombre)}
          />
        </div>

        {/* Panel de edición desplegable (spec §5.1) — mismo patrón de
            retracción que PanelSidebar, a la derecha en vez de a la
            izquierda. Todos los campos son de solo lectura: reflejan los
            datos ya cargados en "Tu perfil", no hay edición propia de
            contenido de página todavía. */}
        <aside
          className={`flex flex-shrink-0 flex-col rounded-card border-[0.5px] border-arena bg-marfil shadow-soft transition-[width] duration-300 ${
            panelAbierto ? "w-full lg:w-80" : "w-full lg:w-12"
          }`}
        >
          <button
            type="button"
            onClick={() => setPanelAbierto((a) => !a)}
            aria-label={panelAbierto ? "Retraer panel de edición" : "Expandir panel de edición"}
            aria-expanded={panelAbierto}
            className="flex items-center justify-center border-b-[0.5px] border-arena py-3 text-grafito/50 hover:text-grafito"
          >
            <span aria-hidden="true" className={`inline-block transition-transform duration-300 ${panelAbierto ? "" : "rotate-180"}`}>
              →
            </span>
          </button>

          {panelAbierto && (
            <div className="flex flex-col gap-4 overflow-auto p-4">
              <p className="text-xs text-grafito/60">
                Vas a poder editar estos campos en una próxima actualización — por ahora reflejan los datos de tu
                perfil.
              </p>

              <CampoSoloLectura label="Nombre de la clínica" valor={profesional.nombreClinica} />
              <CampoSoloLectura label="Teléfono" valor={profesional.telefono ?? "—"} />

              <div>
                <p className="text-xs uppercase tracking-widest text-grafito/50">Especialidades</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {profesional.especialidades.length === 0 ? (
                    <span className="text-sm text-grafito/60">—</span>
                  ) : (
                    profesional.especialidades.map((esp) => (
                      <span key={esp.id} className="rounded-full border-[0.5px] border-arena bg-hueso px-2.5 py-1 text-xs text-grafito/60">
                        {esp.nombre}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs uppercase tracking-widest text-grafito/50">Sobre nosotros</span>
                <textarea
                  disabled
                  rows={4}
                  readOnly
                  value="Esta sección todavía no tiene contenido propio."
                  className="cursor-not-allowed rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-sm text-grafito/60 outline-none"
                />
              </label>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function CampoSoloLectura({ label, valor }: { label: string; valor: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs uppercase tracking-widest text-grafito/50">{label}</span>
      <input
        disabled
        readOnly
        value={valor}
        className="cursor-not-allowed rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-sm text-grafito/60 outline-none"
      />
    </label>
  );
}
