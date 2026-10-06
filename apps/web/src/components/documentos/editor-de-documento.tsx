"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  armarFiguras,
  armarLamina,
  campoPorId,
  estaVacio,
  seccionDelCampo,
  seFirmaEnPapel,
  validarLamina,
  validarValores,
  type Plantilla,
  type Valor,
  type Valores,
} from "@dental-mirage/documentos-clinicos";
import type { DocumentoDetalle, ErrorDeCampoDeDocumento } from "@dental-mirage/shared-types";
import { descartarBorradorAction, guardarBorradorAction, terminarDocumentoAction } from "@/app/actions/documentos";
import { Dialogo } from "@/components/dialogo";
import { CLASE_TACTIL } from "@/components/editor-pagina/estilos";
import { IconChevronDown } from "@/components/icons";
import { CalcoEnVivo } from "./calco";
import { CampoDeDocumento, idDelCampo } from "./campo-de-documento";
import { LaminaDocumento, paginasDeLaLamina } from "./lamina-documento";
import { PantallaCompleta } from "./pantalla-completa";

type EstadoDeGuardado = "guardado" | "pendiente" | "guardando" | "error";

const ESPERA_GUARDADO_MS = 900;

function erroresPorCampo(errores: ErrorDeCampoDeDocumento[] | undefined): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const e of errores ?? []) if (e.campo && !mapa[e.campo]) mapa[e.campo] = e.mensaje;
  return mapa;
}

/** Ancho / alto del recuadro de un campo dibujo en la hoja: el lienzo donde
 *  se dibuja tiene la misma forma. */
function proporcionDelDibujo(plantilla: Plantilla, campoId: string): number | undefined {
  const recuadro = plantilla.lamina?.dibujos?.find((d) => d.campo === campoId);
  return recuadro ? recuadro.ancho / recuadro.alto : undefined;
}

/** La transición más larga de un elemento, en milisegundos ("0.3s, 150ms"
 *  → 300). Cero con "reducir movimiento" (las clases son `motion-safe:`) y
 *  en jsdom, que no calcula estilos. */
function duracionDeTransicion(el: HTMLElement): number {
  const ms = getComputedStyle(el)
    .transitionDuration.split(",")
    .map((d) => (d.trim().endsWith("ms") ? parseFloat(d) : parseFloat(d) * 1000))
    .filter((n) => Number.isFinite(n));
  return ms.length > 0 ? Math.max(...ms) : 0;
}

/** Ir a un campo: lo resuelve un efecto, después del render que abre su
 *  sección. `vuelta` hace que tocar dos veces el mismo dato lo repita. */
type PedidoDeFoco = { campoId: string; seccionId: string | null; vuelta: number };

// EditorDeDocumento — completar un borrador (Fase 5.1, R4–R6 del brief).
//
// A la izquierda, el sidebar con los campos de la plantilla, sección por
// sección; a la derecha, el documento armándose en vivo: la página original
// del Colegio con lo cargado escrito sobre sus renglones (la lámina,
// TR-187) — es exactamente lo que se va a firmar y lo que va al PDF. Una
// plantilla sin lámina muestra el calco. Tocar un dato de la hoja abre su
// sección y pone el foco en su campo (el mismo criterio que el editor de la
// página, TR-173). En el celular, una cosa por vez: Completar o Ver
// documento (TR-172). La hoja se puede ver a pantalla completa, en el
// celular y en la computadora.
//
// Las secciones se despliegan y se pliegan con una animación (filas de
// grilla 0fr→1fr, el mismo patrón que la tarjeta de notificación): por eso
// los campos de una sección cerrada quedan MONTADOS pero inertes —no se
// alcanzan con Tab ni con un lector de pantalla—. Con "reducir movimiento"
// se abren y se cierran sin animar.
//
// Un consentimiento se firma a mano (TR-188): terminarlo lo deja listo para
// imprimir, no "a firmar".
//
// Terminar pide confirmación (pedido del cliente, 2026-09-29): terminado,
// el documento ya no se edita (TR-188). Si hay que corregir algo después,
// se hace otro.
//
// El estado local es lo que la persona está escribiendo: por eso NO usa
// `useEstadoDelServidor` (CLAUDE.md, TR-156). Se guarda solo, un momento
// después de cada cambio.
export function EditorDeDocumento({
  documento,
  plantilla,
  retomado = false,
  actualizado = false,
}: {
  documento: DocumentoDetalle;
  plantilla: Plantilla;
  /** Se pidió uno nuevo y ya había un borrador de este documento para este
   *  paciente: se abrió ese (un solo borrador por documento y paciente). */
  retomado?: boolean;
  /** Ese borrador era de una versión anterior del documento y pasó a la
   *  vigente, con lo que ya tenía (TR-189, addendum). */
  actualizado?: boolean;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Valores>(() => (documento.valores ?? {}) as Valores);
  const [seccionAbierta, setSeccionAbierta] = useState<string>(plantilla.secciones[0]?.id ?? "");
  const [campoActivo, setCampoActivo] = useState<string | null>(null);
  const [erroresDelServidor, setErroresDelServidor] = useState<Record<string, string>>({});
  const [erroresAlTerminar, setErroresAlTerminar] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState<EstadoDeGuardado>("guardado");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [terminando, setTerminando] = useState(false);
  const [vista, setVista] = useState<"completar" | "documento">("completar");
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  // Lo que rechaza la API al descartar (una historia con anexos, 5.6b): se
  // muestra en el diálogo, que queda abierto.
  const [errorAlDescartar, setErrorAlDescartar] = useState<string | null>(null);
  const [confirmarTerminar, setConfirmarTerminar] = useState(false);
  const [pedidoDeFoco, setPedidoDeFoco] = useState<PedidoDeFoco | null>(null);
  // El campo cuya pantalla emergente está abierta (un odontograma o un dibujo).
  const [emergenteAbierta, setEmergenteAbierta] = useState<string | null>(null);
  const idBase = useId();
  const idDelCuerpo = (seccionId: string) => `${idBase}-seccion-${seccionId}`;
  const hoy = documento.hoy ?? "";
  const paginasDeLamina = paginasDeLaLamina(plantilla);
  const enPapel = seFirmaEnPapel(plantilla);

  const ultimo = useRef(valores);
  const vuelta = useRef(0);
  const sinGuardar = useRef(false);

  // Los errores de formato se ven mientras se escribe, sin esperar a la API.
  const erroresLocales = useMemo(() => erroresPorCampo(validarValores(plantilla, valores, "tolerante")), [plantilla, valores]);
  // Lo cargado, compuesto sobre la página original, y lo que no entra en
  // su renglón: se avisa mientras se escribe, pero el borrador se guarda
  // igual (terminar es lo que no lo deja pasar).
  const zonas = useMemo(() => armarLamina(plantilla, valores, { fecha: hoy }, "borrador"), [plantilla, valores, hoy]);
  const figuras = useMemo(() => armarFiguras(plantilla, valores, "borrador"), [plantilla, valores]);
  const erroresDeLamina = useMemo(() => erroresPorCampo(validarLamina(plantilla, valores, { fecha: hoy })), [plantilla, valores, hoy]);
  const errores = { ...erroresDeLamina, ...erroresAlTerminar, ...erroresDelServidor, ...erroresLocales };

  async function guardar(): Promise<boolean> {
    if (!sinGuardar.current) return true;
    if (Object.keys(erroresPorCampo(validarValores(plantilla, ultimo.current, "tolerante"))).length > 0) {
      setGuardado("error");
      return false;
    }
    const esta = ++vuelta.current;
    setGuardado("guardando");
    const res = await guardarBorradorAction(documento.id, ultimo.current);
    if (esta !== vuelta.current) return res.ok;
    if (!res.ok) {
      setGuardado("error");
      setErroresDelServidor(erroresPorCampo(res.errores));
      setMensaje(res.error);
      return false;
    }
    sinGuardar.current = false;
    setErroresDelServidor({});
    setMensaje(null);
    setGuardado("guardado");
    return true;
  }

  // Guardado automático: un momento después del último cambio.
  useEffect(() => {
    if (!sinGuardar.current) return;
    const espera = setTimeout(() => void guardar(), ESPERA_GUARDADO_MS);
    return () => clearTimeout(espera);
    // `guardar` lee todo de referencias: depende solo de los valores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valores]);

  function cambiar(campoId: string, valor: Valor | undefined) {
    const nuevos = { ...ultimo.current };
    if (valor === undefined) delete nuevos[campoId];
    else nuevos[campoId] = valor;
    ultimo.current = nuevos;
    sinGuardar.current = true;
    setValores(nuevos);
    setGuardado("pendiente");
    if (erroresAlTerminar[campoId]) {
      const resto = { ...erroresAlTerminar };
      delete resto[campoId];
      setErroresAlTerminar(resto);
    }
  }

  function irAlCampo(campoId: string) {
    const seccion = seccionDelCampo(plantilla, campoId);
    if (seccion) setSeccionAbierta(seccion.id);
    setCampoActivo(campoId);
    // El odontograma y el dibujo se completan en su pantalla emergente:
    // tocarlos en la hoja, o un error al terminar, la abre sin cambiar de
    // vista. Al cerrarla, el foco vuelve a lo que la abrió.
    const tipo = campoPorId(plantilla, campoId)?.tipo;
    if (tipo === "odontograma" || tipo === "dibujo") {
      setEmergenteAbierta(campoId);
      return;
    }
    setVista("completar");
    setPedidoDeFoco((p) => ({ campoId, seccionId: seccion?.id ?? null, vuelta: (p?.vuelta ?? 0) + 1 }));
  }

  // El campo existe siempre, pero mientras su sección está cerrada es inerte
  // (no acepta el foco) y mide 0 de alto. Por eso, en dos tiempos:
  // - el foco, apenas el render que abre la sección le saca el `inert`
  //   (este efecto corre después de ese commit), sin scrollear: a mitad de
  //   la animación el campo todavía no está donde va a quedar;
  // - el scroll, cuando la sección terminó de desplegarse (`transitionend`
  //   de su contenedor, con un respaldo por si el evento no llega). Si ya
  //   estaba abierta, o sin movimiento, enseguida.
  useEffect(() => {
    if (!pedidoDeFoco) return;
    const { campoId, seccionId } = pedidoDeFoco;
    const control =
      document.getElementById(idDelCampo(campoId)) ?? document.querySelector<HTMLElement>(`[data-campo="${campoId}"] button`);
    control?.focus({ preventScroll: true });
    const scrollear = () => control?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    const cuerpo = seccionId ? document.getElementById(`${idBase}-seccion-${seccionId}`) : null;
    const interior = cuerpo?.firstElementChild as HTMLElement | null | undefined;
    // Todavía desplegándose: lo que tiene adentro es más alto que lo que muestra.
    const desplegandose = !!interior && interior.scrollHeight - interior.clientHeight > 1;
    const duracion = cuerpo ? duracionDeTransicion(cuerpo) : 0;
    if (!cuerpo || !desplegandose || duracion === 0) {
      scrollear();
      return;
    }
    let hecho = false;
    const terminar = () => {
      if (hecho) return;
      hecho = true;
      scrollear();
    };
    const alTerminar = (e: TransitionEvent) => {
      if (e.target === cuerpo && e.propertyName === "grid-template-rows") terminar();
    };
    cuerpo.addEventListener("transitionend", alTerminar);
    const respaldo = window.setTimeout(terminar, duracion + 50);
    return () => {
      cuerpo.removeEventListener("transitionend", alTerminar);
      window.clearTimeout(respaldo);
    };
  }, [pedidoDeFoco, idBase]);

  // Primero lo que falta o no entra; si está todo, la confirmación.
  function pedirTerminar() {
    setMensaje(null);
    const faltan = erroresPorCampo([
      ...validarValores(plantilla, ultimo.current, "estricto"),
      ...validarLamina(plantilla, ultimo.current, { fecha: hoy }),
    ]);
    if (Object.keys(faltan).length > 0) {
      setErroresAlTerminar(faltan);
      setMensaje("Hay datos para revisar antes de terminar: están marcados en el formulario.");
      irAlCampo(Object.keys(faltan)[0]);
      return;
    }
    setConfirmarTerminar(true);
  }

  async function terminar() {
    setConfirmarTerminar(false);
    setTerminando(true);
    if (!(await guardar())) {
      setTerminando(false);
      setMensaje("No se pudo guardar el borrador. Revisá los datos marcados y probá de nuevo.");
      return;
    }
    const res = await terminarDocumentoAction(documento.id);
    setTerminando(false);
    if (!res.ok) {
      const porCampo = erroresPorCampo(res.errores);
      setErroresAlTerminar(porCampo);
      setMensaje(res.error);
      const primero = Object.keys(porCampo)[0];
      if (primero) irAlCampo(primero);
      return;
    }
    router.refresh();
  }

  const textoGuardado: Record<EstadoDeGuardado, string> = {
    guardado: "Borrador guardado",
    pendiente: "Cambios sin guardar…",
    guardando: "Guardando…",
    error: "No se pudo guardar",
  };

  return (
    <div className="flex flex-col gap-4">
      {(retomado || actualizado) && (
        <p role="status" className="rounded-card border border-linea bg-marfil px-4 py-3 text-sm text-grafito shadow-soft">
          {retomado && (
            <>Ya tenías un borrador de este documento para {documento.paciente.nombre}: seguís desde acá. Hay un solo borrador de cada documento por paciente.</>
          )}
          {retomado && actualizado && " "}
          {actualizado && (
            <>El documento tiene una versión nueva y tu borrador pasó a esa versión, con lo que ya habías completado.</>
          )}
        </p>
      )}
      {/* En el celular, una cosa por vez (TR-172). Todo es CSS: el HTML del
          servidor y el del cliente son el mismo. */}
      <div role="tablist" aria-label="Qué mostrar" className="grid grid-cols-2 gap-1 rounded-full border border-linea bg-marfil p-1 shadow-soft lg:hidden">
        {(["completar", "documento"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={vista === v}
            onClick={() => setVista(v)}
            className={`rounded-full py-2 text-sm font-medium transition-colors ${vista === v ? "bg-salvia-oscuro text-marfil" : "text-grafito"}`}
          >
            {v === "completar" ? "Completar" : "Ver documento"}
          </button>
        ))}
      </div>

      {/* En la computadora, "Ver en pantalla completa" va por encima de las
          dos columnas: así "Quién suscribe" arranca a la altura de la hoja
          (pedido del cliente, 2026-09-29). En el celular va arriba de la hoja,
          en "Ver documento". */}
      {paginasDeLamina && (
        <div className="hidden justify-end lg:flex">
          <PantallaCompleta titulo={`${plantilla.nombre}: tu documento`}>
            <LaminaDocumento plantilla={plantilla} paginas={paginasDeLamina} zonas={zonas} figuras={figuras} etiqueta="Tu documento" />
          </PantallaCompleta>
        </div>
      )}

      {/* grid-cols-1 (una columna de `minmax(0, 1fr)`) y min-w-0: sin eso,
          en el celular la columna se estira a lo que mida su contenido más
          ancho (las piezas) y la pantalla entera se corre de costado. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
        {/* Pegada debajo del header fijo, no a 1rem del borde de la ventana:
            ahí el header la tapaba y "Quién suscribe" desaparecía al hacer
            scroll (mismo cálculo que el editor de la página, TR-173).
            La barra de desplazamiento es discreta (`.scrollbar-discreta`) y
            su canal queda reservado (`scrollbar-gutter: stable`): sin eso,
            al desplegar una sección la barra aparece a mitad de la animación
            y el formulario se corre de costado. El `pr-1` separa las
            tarjetas del canal. */}
        <aside
          aria-label="Datos del documento"
          className={`${vista === "completar" ? "flex" : "hidden"} scrollbar-discreta min-w-0 flex-col gap-3 lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:flex lg:max-h-[calc(100dvh-var(--header-height)-2rem)] lg:overflow-y-auto lg:pr-1 lg:[scrollbar-gutter:stable]`}
        >
          {plantilla.secciones.map((seccion) => {
            const abierta = seccion.id === seccionAbierta;
            const obligatorios = seccion.campos.filter((c) => c.requerido);
            const completos = obligatorios.filter((c) => !estaVacio(c, valores[c.id])).length;
            const conError = seccion.campos.some((c) => errores[c.id]);
            return (
              <section key={seccion.id} className="rounded-card border border-linea bg-marfil">
                <h3>
                  <button
                    type="button"
                    aria-expanded={abierta}
                    aria-controls={idDelCuerpo(seccion.id)}
                    onClick={() => setSeccionAbierta(abierta ? "" : seccion.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">{seccion.titulo}</span>
                    <span className="flex flex-shrink-0 items-center gap-2">
                      <span className={`text-xs font-medium ${conError ? "text-terracota-oscuro" : "text-grafito/75"}`}>
                        {conError
                          ? "Revisar"
                          : obligatorios.length > 0
                            ? `${completos} de ${obligatorios.length} obligatorios`
                            : "Opcional"}
                      </span>
                      <IconChevronDown
                        className={`h-4 w-4 flex-shrink-0 text-grafito/60 motion-safe:transition-transform motion-safe:duration-300 ${
                          abierta ? "rotate-180" : ""
                        }`}
                      />
                    </span>
                  </button>
                </h3>
                {/* grid-rows 0fr→1fr: se despliega a la altura de su contenido
                    sin medirlo. El borde y el padding van ADENTRO del
                    overflow-hidden: afuera, la sección cerrada dejaría una
                    línea y un hueco. */}
                <div
                  id={idDelCuerpo(seccion.id)}
                  className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300 ${
                    abierta ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden" inert={!abierta}>
                    <div className="flex min-w-0 flex-col gap-4 border-t border-linea px-4 py-4">
                      {seccion.campos.map((campo) => (
                        <CampoDeDocumento
                          key={campo.id}
                          campo={campo}
                          valor={valores[campo.id]}
                          error={errores[campo.id]}
                          onCambio={(v) => cambiar(campo.id, v)}
                          proporcion={proporcionDelDibujo(plantilla, campo.id)}
                          emergenteAbierta={emergenteAbierta === campo.id}
                          onEmergenteAbierta={(abierto) => setEmergenteAbierta(abierto ? campo.id : null)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}

          <div className="flex flex-col gap-3 rounded-card border border-linea bg-marfil p-4 shadow-soft">
            <p aria-live="polite" className={`text-xs ${guardado === "error" ? "text-terracota-oscuro" : "text-grafito/75"}`}>
              {textoGuardado[guardado]}
            </p>
            {mensaje && (
              <p role="alert" className="text-sm text-terracota-oscuro">
                {mensaje}
              </p>
            )}
            <button
              type="button"
              onClick={pedirTerminar}
              disabled={terminando}
              className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              {terminando ? "Terminando…" : enPapel ? "Terminar documento" : "Terminar y pasar a firmas"}
            </button>
            <p className="text-xs text-grafito/75">
              {enPapel
                ? "Al terminar, queda listo para imprimir o descargar —se firma a mano, en papel— y ya no se puede editar."
                : "Al terminar, el texto del documento queda fijo y pasa a firmas: ya no se puede editar."}
            </p>
            <button
              type="button"
              onClick={() => setConfirmarDescarte(true)}
              className="self-start rounded-full px-3 py-1.5 text-sm font-medium text-terracota-oscuro hover:bg-arena"
            >
              Descartar borrador
            </button>
          </div>
        </aside>

        <div className={`${vista === "documento" ? "flex" : "hidden"} min-w-0 flex-col gap-3 lg:flex`}>
          {paginasDeLamina ? (
            <>
              <PantallaCompleta titulo={`${plantilla.nombre}: tu documento`} className="self-end lg:hidden">
                <LaminaDocumento plantilla={plantilla} paginas={paginasDeLamina} zonas={zonas} figuras={figuras} etiqueta="Tu documento" />
              </PantallaCompleta>
              <LaminaDocumento
                plantilla={plantilla}
                paginas={paginasDeLamina}
                zonas={zonas}
                figuras={figuras}
                editable={{ campoActivo, errores, onElegir: irAlCampo, valores }}
                etiqueta="Tu documento"
              />
            </>
          ) : (
            <CalcoEnVivo plantilla={plantilla} valores={valores} hoy={hoy} campoActivo={campoActivo} onElegir={irAlCampo} />
          )}
        </div>
      </div>

      {confirmarTerminar && (
        <Dialogo
          titulo="¿Terminar el documento?"
          descripcion={
            enPapel
              ? "Queda listo para imprimir o descargar y ya no se puede editar. Revisá que esté todo bien: si después hay que corregir algo, vas a tener que hacer otro."
              : "El texto queda fijo, pasa a firmas y ya no se puede editar. Revisá que esté todo bien: si después hay que corregir algo, vas a tener que hacer otro."
          }
          onCerrar={() => setConfirmarTerminar(false)}
          superficie="marfil"
          centrado
        >
          <div className="flex justify-end gap-2 p-4 sm:p-6">
            <button
              type="button"
              data-autofocus
              onClick={() => setConfirmarTerminar(false)}
              className="rounded-full px-4 py-2 text-sm font-medium text-grafito hover:bg-arena"
            >
              Seguir revisando
            </button>
            <button
              type="button"
              onClick={() => void terminar()}
              className="rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95"
            >
              {enPapel ? "Sí, terminar" : "Sí, terminar y pasar a firmas"}
            </button>
          </div>
        </Dialogo>
      )}

      {confirmarDescarte && (
        <Dialogo
          titulo="¿Descartar este borrador?"
          descripcion="Se borra lo que cargaste. Todavía no es parte de la historia clínica del paciente."
          onCerrar={() => {
            setConfirmarDescarte(false);
            setErrorAlDescartar(null);
          }}
          superficie="marfil"
          centrado
        >
          {errorAlDescartar && (
            <p role="alert" className="px-4 pt-4 text-sm text-terracota-oscuro first-letter:uppercase sm:px-6 sm:pt-6">
              {errorAlDescartar}
            </p>
          )}
          <div className="flex justify-end gap-2 p-4 sm:p-6">
            <button type="button" onClick={() => { setConfirmarDescarte(false); setErrorAlDescartar(null); }} className={`rounded-full px-4 py-2 text-sm font-medium text-grafito hover:bg-arena ${CLASE_TACTIL}`}>
              Seguir editando
            </button>
            <button
              type="button"
              onClick={async () => {
                setErrorAlDescartar(null);
                // Si salió bien, la acción redirige y esto no vuelve.
                const res = await descartarBorradorAction(documento.id);
                if (res?.error) setErrorAlDescartar(res.error);
              }}
              className={`rounded-full bg-terracota-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95 ${CLASE_TACTIL}`}
            >
              Descartar
            </button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
