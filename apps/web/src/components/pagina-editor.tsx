"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ConflictoRevisionPagina, PaginaPublica } from "@dental-mirage/shared-types";
import {
  aplicarPresetEstilo,
  CATALOGO_PLANTILLAS,
  CATALOGO_PRESETS_ESTILO,
  textosEjemploPendientes,
  type HorariosClinica,
} from "@dental-mirage/prisma-engine";
import type { SesionCompleta } from "@/lib/session";
import {
  actualizarPaginaPublicaAction,
  guardarHorariosClinicaAction,
  obtenerPaginaPublicaAction,
  ocultarPaginaPublicaAction,
  publicarPaginaPublicaAction,
  restaurarVersionPaginaPublicaAction,
} from "@/app/actions/pagina-publica";
import { Confirmacion } from "@/components/dialogo";
import { formatFechaHora } from "@/lib/turno-format";
import {
  borradorAPayload,
  borradorDePagina,
  contenidoDeBorrador,
  hayCambios,
  hayCambiosSinPublicar,
  type Borrador,
} from "@/lib/pagina-publica/borrador";
import { ListaModulos } from "@/components/editor-pagina/lista-modulos";
import { SelectorDeTema } from "@/components/editor-pagina/selector-de-tema";
import { VistaPrevia } from "@/components/editor-pagina/vista-previa";
import { GaleriaPlantillas } from "@/components/editor-pagina/galeria-plantillas";
import { HistorialVersiones } from "@/components/editor-pagina/historial-versiones";
import { BuscadoresYRedes } from "@/components/editor-pagina/buscadores-y-redes";
import { Pestanas } from "@/components/editor-pagina/pestanas";
import { descripcionSeoPorDefecto, tituloSeoPorDefecto } from "@/lib/pagina-publica/seo";

interface PaginaEditorProps {
  sesion: SesionCompleta;
  paginaInicial: PaginaPublica;
}

type Pestana = "modulos" | "diseno" | "buscadores";

const PESTANAS = [
  ["modulos", "Módulos"],
  ["diseno", "Diseño"],
  ["buscadores", "Buscadores"],
] as const satisfies readonly (readonly [Pestana, string])[];

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
  const [pendingPublicar, setPendingPublicar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // conflicto (PE-8): 409 al guardar/restaurar — "otra persona guardó
  // antes". null = no hay ningún conflicto pendiente de resolver.
  const [conflicto, setConflicto] = useState<ConflictoRevisionPagina | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("modulos");
  const [galeriaAbierta, setGaleriaAbierta] = useState(() => paginaInicial.modulos.length === 0);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [confirmarPublicar, setConfirmarPublicar] = useState(false);
  // deshacer (PP-3, H19): la última acción que cambió mucho de golpe (quitar
  // un módulo, aplicar una plantilla) y el borrador de antes. Vive hasta el
  // próximo cambio: sin temporizador, para que nadie pierda la opción por
  // leer despacio (WCAG 2.2.1).
  const [deshacer, setDeshacer] = useState<{ mensaje: string; anterior: Borrador } | null>(null);

  const sinGuardar = useMemo(() => hayCambios(guardado, borrador), [guardado, borrador]);
  const sinPublicar = useMemo(() => hayCambiosSinPublicar(guardado, pagina.ultimaVersionPublicada?.contenido), [guardado, pagina]);
  const contenido = useMemo(() => contenidoDeBorrador(borrador, pagina), [borrador, pagina]);
  // PE-9: el título y la descripción que usa la página pública si el admin
  // deja los campos vacíos — con los mismos datos que usa ella.
  const seoPorDefecto = useMemo(() => {
    const datos = {
      nombreClinica: sesion.nombreClinica,
      especialidades: pagina.especialidadesClinica ?? sesion.especialidades.map((e) => e.nombre),
      ciudad: pagina.ciudadClinica,
      bio: borrador.bio,
    };
    return { titulo: tituloSeoPorDefecto(datos), descripcion: descripcionSeoPorDefecto(datos) };
  }, [sesion, pagina.especialidadesClinica, pagina.ciudadClinica, borrador.bio]);
  const ejemplosPendientes = useMemo(() => {
    const unicos = new Map<string, { ruta: string; valor: string; etiqueta: string }>();
    for (const plantilla of CATALOGO_PLANTILLAS) {
      for (const ejemplo of textosEjemploPendientes(borrador, plantilla)) {
        unicos.set(`${ejemplo.ruta}:${ejemplo.valor}`, ejemplo);
      }
    }
    return [...unicos.values()];
  }, [borrador]);

  // Salir con cambios sin guardar pierde el borrador — el navegador avisa.
  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  function editar(parcial: Partial<Borrador>) {
    setAviso(null);
    setDeshacer(null);
    setBorrador((actual) => ({ ...actual, ...parcial }));
  }

  // Un cambio que se puede deshacer: en vez de confirmar antes, avisa
  // después con "Deshacer" (PP-3, H10/H19).
  function editarDeshacible(parcial: Partial<Borrador>, mensaje: string) {
    setAviso(null);
    setDeshacer({ mensaje, anterior: borrador });
    setBorrador((actual) => ({ ...actual, ...parcial }));
  }

  function deshacerUltimo() {
    if (!deshacer) return;
    setBorrador(deshacer.anterior);
    setDeshacer(null);
  }

  async function guardarHorariosClinica(valor: HorariosClinica) {
    const result = await guardarHorariosClinicaAction(valor);
    if (result.ok) {
      setPagina((actual) => ({ ...actual, horariosClinica: result.valor }));
      return { ok: true as const, valor: result.valor };
    }
    return { ok: false as const, error: result.error };
  }

  // guardar devuelve si salió bien: "Guardar y publicar" (PP-2, H3) solo
  // publica si el guardado de antes llegó. Recibe el borrador a mandar
  // porque "Mantener mi copia" lo llama con la revisión nueva en el mismo
  // evento, antes de que el estado se actualice.
  async function guardar(aGuardar: Borrador = borrador): Promise<boolean> {
    setError(null);
    setAviso(null);
    setConflicto(null);
    setPendingGuardar(true);
    const result = await actualizarPaginaPublicaAction(borradorAPayload(aGuardar));
    setPendingGuardar(false);
    if (result.kind === "conflicto") {
      setConflicto(result.conflicto);
      return false;
    }
    if (result.kind === "error") {
      setError(result.error);
      return false;
    }
    // Lo que devuelve el servidor es lo que quedó de verdad (recortó
    // espacios, sacó redes vacías...): el borrador pasa a ser eso.
    const guardadoAhora = borradorDePagina(result.pagina);
    setPagina(result.pagina);
    setGuardado(guardadoAhora);
    setBorrador(guardadoAhora);
    setDeshacer(null);
    setAviso("Cambios guardados.");
    return true;
  }

  function descartar() {
    setError(null);
    setAviso(null);
    setDeshacer(null);
    setBorrador(guardado);
  }

  // restaurar (PP-3, H2) — copia una versión publicada al borrador, con el
  // candado de revisión. Devuelve el error a mostrar DENTRO del historial, o
  // null para cerrarlo: un 409 cierra el historial y abre el mismo aviso de
  // conflicto que Guardar (con el diálogo abierto, ese aviso quedaría tapado).
  async function restaurar(numero: number): Promise<string | null> {
    setError(null);
    setAviso(null);
    setConflicto(null);
    const result = await restaurarVersionPaginaPublicaAction(numero, guardado.revision);
    if (result.kind === "conflicto") {
      setConflicto(result.conflicto);
      return null;
    }
    if (result.kind === "error") {
      return result.error;
    }
    const guardadoAhora = borradorDePagina(result.pagina);
    setPagina(result.pagina);
    setGuardado(guardadoAhora);
    setBorrador(guardadoAhora);
    setDeshacer(null);
    setAviso(`Versión ${numero} restaurada en el borrador. Publicá para que se vea.`);
    return null;
  }

  // recargar (PE-8) — "otra persona guardó antes": trae el estado real del
  // servidor y descarta el borrador local (edición perdida a propósito, es
  // la otra mitad de la decisión que le toca a quien está editando).
  async function recargar() {
    setError(null);
    setConflicto(null);
    setPendingGuardar(true);
    const result = await obtenerPaginaPublicaAction();
    setPendingGuardar(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const guardadoAhora = borradorDePagina(result.pagina);
    setPagina(result.pagina);
    setGuardado(guardadoAhora);
    setBorrador(guardadoAhora);
    setAviso("Recargado con la última versión guardada.");
  }

  // mantenerMiCopia (PE-8) — la otra mitad: seguir con lo tipeado acá,
  // solo se toma la Revision nueva del conflicto (el resto del contenido
  // ajeno se descarta) y se reintenta guardar con eso — de verdad, en el
  // mismo click (PP-2, H6): antes solo cambiaba la revisión y había que
  // volver a tocar "Guardar cambios" sin que nada lo dijera.
  async function mantenerMiCopia() {
    if (!conflicto) return;
    const conRevisionNueva = { ...borrador, revision: conflicto.revisionActual };
    setGuardado((actual) => ({ ...actual, revision: conflicto.revisionActual }));
    setBorrador(conRevisionNueva);
    await guardar(conRevisionNueva);
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

  async function publicar(confirmado = false) {
    // Textos de ejemplo sin editar: se pregunta con un diálogo propio, no con
    // window.confirm (PP-3, H10).
    if (ejemplosPendientes.length > 0 && !confirmado) {
      setConfirmarPublicar(true);
      return;
    }
    setConfirmarPublicar(false);
    setError(null);
    // Publicar copia la versión GUARDADA, no la que se ve en pantalla. Con
    // cambios sin guardar, el botón es "Guardar y publicar" (PP-2, H3): si
    // el guardado falla o choca con otra persona, no se publica nada.
    if (sinGuardar && !(await guardar())) return;
    setPendingPublicar(true);
    const result = await publicarPaginaPublicaAction(sesion.slug);
    setPendingPublicar(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setPagina((actual) => ({ ...actual, deployadaEn: result.pagina.deployadaEn, ultimaVersionPublicada: result.pagina.ultimaVersionPublicada }));
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-card border-[0.5px] border-terracota bg-terracota-claro px-4 py-3 text-sm text-terracota-oscuro">
          {error}
        </p>
      )}

      {conflicto && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border-[0.5px] border-terracota bg-terracota-claro px-4 py-3 text-sm text-terracota-oscuro">
          <span>
            {conflicto.actualizadaPorNombre ?? "Alguien"} guardó cambios el {formatFechaHora(conflicto.actualizadaEn)}, mientras editabas. ¿Qué querés hacer?
          </span>
          <span className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={recargar}
              className="rounded-full border-[0.5px] border-terracota bg-marfil px-3 py-1.5 text-xs font-medium text-terracota-oscuro hover:bg-terracota-claro"
            >
              Recargar (perdés lo que tipeaste)
            </button>
            <button
              type="button"
              onClick={mantenerMiCopia}
              className="rounded-full bg-terracota-oscuro px-3 py-1.5 text-xs font-medium text-marfil hover:brightness-95"
            >
              Mantener mi copia
            </button>
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border-[0.5px] border-arena bg-marfil p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGaleriaAbierta(true)}
            className="rounded-full border-[0.5px] border-arena bg-marfil px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
          >
            Plantillas
          </button>
          <button
            type="button"
            onClick={() => setHistorialAbierto(true)}
            className="rounded-full border-[0.5px] border-arena bg-marfil px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
          >
            Historial
          </button>
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
            onClick={() => void guardar()}
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
          <span role="status" className="text-xs text-grafito/75">
            {sinGuardar ? "Tenés cambios sin guardar." : aviso ? aviso : sinPublicar ? "Hay cambios sin publicar." : null}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void publicar()}
            disabled={pendingPublicar || pendingGuardar || (!sinGuardar && !sinPublicar && !!pagina.deployadaEn)}
            title={pagina.deployadaEn ? `Última publicación: ${formatFechaHora(pagina.deployadaEn)}` : undefined}
            className="rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pendingPublicar ? "Publicando…" : sinGuardar ? "Guardar y publicar" : "Publicar"}
          </button>
          {/* "Publicada" solo si lo que se ve es lo que está publicado. */}
          {pagina.deployadaEn && !sinPublicar && !sinGuardar && (

            <span className="rounded-full border-[0.5px] border-salvia bg-salvia-claro px-3 py-1.5 text-xs font-medium text-salvia-oscuro">
              Publicada
            </span>
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

      {ejemplosPendientes.length > 0 && (
        <aside className="rounded-card border-[0.5px] border-arena bg-marfil px-4 py-3 text-sm text-grafito/75" aria-label="Textos de ejemplo sin editar">
          <p className="font-medium">Textos de ejemplo</p>
          <ul className="mt-1 list-inside list-disc opacity-70">
            {ejemplosPendientes.map((ejemplo) => <li key={`${ejemplo.ruta}:${ejemplo.valor}`}>{ejemplo.etiqueta}</li>)}
          </ul>
          <p className="mt-1 text-xs">Al editarlos dejan de aparecer acá. Antes de publicar te vamos a avisar si queda alguno.</p>
        </aside>
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
            className="flex items-center justify-center border-b-[0.5px] border-arena py-3 text-grafito/75 hover:text-grafito"
          >
            <span aria-hidden="true" className={`inline-block transition-transform duration-300 ${panelAbierto ? "" : "rotate-180"}`}>
              →
            </span>
          </button>

          {panelAbierto && (
            <div className="flex flex-col gap-4 overflow-auto p-4">
              <Pestanas
                etiqueta="Qué editar"
                pestanas={PESTANAS}
                activa={pestana}
                onCambio={setPestana}
              >
              {pestana === "buscadores" ? (
                <BuscadoresYRedes
                  slug={sesion.slug}
                  seoTitulo={borrador.seoTitulo}
                  seoDescripcion={borrador.seoDescripcion}
                  tituloPorDefecto={seoPorDefecto.titulo}
                  descripcionPorDefecto={seoPorDefecto.descripcion}
                  onCambio={editar}
                />
              ) : pestana === "modulos" ? (
                <ListaModulos
                  borrador={borrador}
                  direccionClinica={pagina.direccionClinica}
                  telefono={sesion.telefono}
                  equipoElegible={pagina.equipoElegible}
                  horariosClinica={pagina.horariosClinica}
                  serviciosDisponibles={pagina.serviciosDisponibles}
                  guardarHorariosClinica={guardarHorariosClinica}
                  onBorrador={editar}
                  onBorradorDeshacible={editarDeshacible}
                />
              ) : (
                <>
                <SelectorDeTema
                  tema={borrador.tema}
                  temaVariante={borrador.temaVariante}
                  temaTipografia={borrador.temaTipografia}
                  temaTokens={borrador.temaTokens}
                  onCambio={editar}
                />
                <section aria-label="Presets de estilo" className="flex flex-col gap-2 rounded-card border-[0.5px] border-arena bg-marfil p-4">
                  <h2 className="text-sm font-semibold text-grafito">Presets de estilo</h2>
                  {CATALOGO_PRESETS_ESTILO.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => editar(aplicarPresetEstilo(borrador, preset))}
                      className="rounded-field border-[0.5px] border-arena px-3 py-2 text-left hover:border-salvia"
                    >
                      <span className="block text-sm font-medium text-grafito">{preset.nombre}</span>
                      <span className="block text-xs text-grafito/75">{preset.descripcion}</span>
                    </button>
                  ))}
                </section>
                </>
              )}
              </Pestanas>
            </div>
          )}
        </aside>
      </div>
      {galeriaAbierta && (
        <GaleriaPlantillas
          slug={sesion.slug}
          nombreClinica={sesion.nombreClinica}
          profesionalNombre={nombreCompleto}
          telefono={sesion.telefono}
          especialidades={sesion.especialidades.map((e) => e.nombre)}
          borrador={borrador}
          pagina={pagina}
          onAplicar={(nuevo, modo, plantilla) =>
            editarDeshacible(nuevo, modo === "diseno" ? `Aplicaste el diseño de “${plantilla.nombre}”.` : `Reemplazaste el borrador con “${plantilla.nombre}”.`)
          }
          onCerrar={() => setGaleriaAbierta(false)}
        />
      )}
      {historialAbierto && (
        <HistorialVersiones sinGuardar={sinGuardar} onRestaurar={restaurar} onCerrar={() => setHistorialAbierto(false)} />
      )}
      {confirmarPublicar && (
        <Confirmacion
          titulo="Quedan textos de ejemplo"
          mensaje={
            <>
              <p>Estos textos son de la plantilla y todavía no los cambiaste:</p>
              <ul className="list-inside list-disc text-grafito/80">
                {ejemplosPendientes.map((ejemplo) => (
                  <li key={`${ejemplo.ruta}:${ejemplo.valor}`}>{ejemplo.etiqueta}</li>
                ))}
              </ul>
              <p>¿Querés publicar igual?</p>
            </>
          }
          confirmar="Publicar igual"
          onConfirmar={() => void publicar(true)}
          onCancelar={() => setConfirmarPublicar(false)}
        />
      )}
      {/* El aviso de "Deshacer" (PP-3, H19). role="status": se anuncia sin
          robar el foco; el botón queda al alcance del teclado. */}
      <div role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        {deshacer && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-full bg-grafito px-4 py-2 text-sm text-marfil shadow-soft">
            <span>{deshacer.mensaje}</span>
            <button type="button" onClick={deshacerUltimo} className="min-h-11 rounded-full px-3 font-semibold underline underline-offset-2 hover:bg-marfil/10">
              Deshacer
            </button>
            <button type="button" onClick={() => setDeshacer(null)} aria-label="Cerrar aviso" className="min-h-11 min-w-11 rounded-full hover:bg-marfil/10">
              <span aria-hidden="true">×</span>
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
