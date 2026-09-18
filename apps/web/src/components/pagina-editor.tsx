"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PaginaPublica } from "@dental-mirage/shared-types";
import type { SesionCompleta } from "@/lib/session";
import {
  actualizarPaginaPublicaAction,
  deployarPaginaPublicaAction,
  ocultarPaginaPublicaAction,
} from "@/app/actions/pagina-publica";
import { formatFechaHora } from "@/lib/turno-format";
import { borradorAPayload, borradorDePagina, contenidoDeBorrador, hayCambios, type Borrador } from "@/lib/pagina-publica/borrador";
import { ListaModulos } from "@/components/editor-pagina/lista-modulos";
import { SelectorDeTema } from "@/components/editor-pagina/selector-de-tema";
import { VistaPrevia } from "@/components/editor-pagina/vista-previa";

interface PaginaEditorProps {
  sesion: SesionCompleta;
  paginaInicial: PaginaPublica;
}

type Pestana = "modulos" | "diseno";

// PaginaEditor (T4.1/T4.2, spec §5; contenido real desde la Fase 4.4) —
// layout del editor: barra de acciones arriba (Ver página/Guardar
// cambios/Ocultar/Deployar, spec §5.2) + izquierda previsualización en vivo
// (mismo componente que la página real, ClinicaPublicaTemplate, alimentado
// con el BORRADOR) / derecha panel de edición desplegable (spec §5.1:
// "sidebar desplegable, igual criterio que el de gestión de clínica", ver
// PanelSidebar). Vive en su propia página, /personalizar-pagina — no dentro
// de /panel/** (pedido explícito del cliente, 2026-08-23: "es una pagina
// aparte por fuera de gestion clinica"), así que acá tiene todo el ancho
// disponible.
//
// Todo lo editable vive en UN borrador del lado del cliente; "Guardar
// cambios" lo manda de una vez (el PATCH reemplaza el contenido completo).
// Ocultar y Deployar son acciones aparte, con su propio endpoint: no
// guardan el borrador, y guardar el borrador tampoco publica nada.
export function PaginaEditor({ sesion, paginaInicial }: PaginaEditorProps) {
  const nombreCompleto = `${sesion.nombre} ${sesion.apellido}`.trim();
  const [pagina, setPagina] = useState(paginaInicial);
  const [guardado, setGuardado] = useState<Borrador>(() => borradorDePagina(paginaInicial));
  const [borrador, setBorrador] = useState<Borrador>(guardado);
  const [pendingGuardar, setPendingGuardar] = useState(false);
  const [pendingOcultar, setPendingOcultar] = useState(false);
  const [pendingDeployar, setPendingDeployar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("modulos");

  const sinGuardar = useMemo(() => hayCambios(guardado, borrador), [guardado, borrador]);
  const contenido = useMemo(() => contenidoDeBorrador(borrador, pagina), [borrador, pagina]);

  // Salir con cambios sin guardar pierde el borrador — el navegador avisa.
  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  function editar(parcial: Partial<Borrador>) {
    setAviso(null);
    setBorrador((actual) => ({ ...actual, ...parcial }));
  }

  async function guardar() {
    setError(null);
    setAviso(null);
    setPendingGuardar(true);
    const result = await actualizarPaginaPublicaAction(borradorAPayload(borrador));
    setPendingGuardar(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    // Lo que devuelve el servidor es lo que quedó de verdad (recortó
    // espacios, sacó redes vacías...): el borrador pasa a ser eso.
    const guardadoAhora = borradorDePagina(result.pagina);
    setPagina(result.pagina);
    setGuardado(guardadoAhora);
    setBorrador(guardadoAhora);
    setAviso("Cambios guardados.");
  }

  function descartar() {
    setError(null);
    setAviso(null);
    setBorrador(guardado);
  }

  async function alternarOcultar() {
    setError(null);
    setPendingOcultar(true);
    const result = await ocultarPaginaPublicaAction(!pagina.oculta);
    setPendingOcultar(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    // Solo el estado de la página: el borrador (que puede tener cambios sin
    // guardar) no se toca.
    setPagina((actual) => ({ ...actual, oculta: result.pagina.oculta }));
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
    setPagina((actual) => ({ ...actual, deployadaEn: result.pagina.deployadaEn }));
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
            href={`/${sesion.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border-[0.5px] border-arena bg-marfil px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
          >
            Ver página
          </Link>
          <button
            type="button"
            onClick={guardar}
            disabled={!sinGuardar || pendingGuardar}
            className="rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pendingGuardar ? "Guardando…" : "Guardar cambios"}
          </button>
          {sinGuardar && (
            <button
              type="button"
              onClick={descartar}
              disabled={pendingGuardar}
              className="rounded-full border-[0.5px] border-arena bg-marfil px-4 py-2 text-sm font-medium text-grafito hover:border-terracota hover:text-terracota-oscuro disabled:opacity-50"
            >
              Descartar
            </button>
          )}
          {/* role="status": se anuncia sin robar el foco. */}
          <span role="status" className="text-xs text-grafito/70">
            {sinGuardar ? "Tenés cambios sin guardar." : aviso}
          </span>
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
          la pagina") — con `flex` fijo, el panel de edición y la
          previsualización competían por el mismo ancho angosto en mobile;
          apilados, cada uno usa el 100% del ancho disponible. */}
      <div className="flex flex-col gap-5 lg:flex-row">
        <VistaPrevia
          slug={sesion.slug}
          nombreClinica={sesion.nombreClinica}
          profesionalNombre={nombreCompleto}
          telefono={sesion.telefono}
          especialidades={sesion.especialidades.map((e) => e.nombre)}
          contenido={contenido}
        />

        {/* Panel de edición desplegable (spec §5.1) — mismo patrón de
            retracción que PanelSidebar, a la derecha en vez de a la
            izquierda. */}
        <aside
          aria-label="Panel de edición"
          className={`flex flex-shrink-0 flex-col rounded-card border-[0.5px] border-arena bg-marfil shadow-soft transition-[width] duration-300 ${
            panelAbierto ? "w-full lg:w-[26rem]" : "w-full lg:w-12"
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
              <div role="tablist" aria-label="Qué editar" className="flex gap-1 rounded-full bg-hueso p-1">
                {(
                  [
                    ["modulos", "Módulos"],
                    ["diseno", "Diseño"],
                  ] as const
                ).map(([id, etiqueta]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={pestana === id}
                    onClick={() => setPestana(id)}
                    className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium ${
                      pestana === id ? "bg-marfil text-grafito shadow-soft" : "text-grafito/60 hover:text-grafito"
                    }`}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>

              {pestana === "modulos" ? (
                <ListaModulos
                  borrador={borrador}
                  direccionClinica={pagina.direccionClinica}
                  telefono={sesion.telefono}
                  onBorrador={editar}
                />
              ) : (
                <SelectorDeTema
                  tema={borrador.tema}
                  temaVariante={borrador.temaVariante}
                  temaTipografia={borrador.temaTipografia}
                  onCambio={editar}
                />
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
