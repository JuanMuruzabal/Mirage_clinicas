"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  estaVacio,
  seccionDelCampo,
  validarValores,
  type Plantilla,
  type Valor,
  type Valores,
} from "@dental-mirage/documentos-clinicos";
import type { DocumentoDetalle, ErrorDeCampoDeDocumento } from "@dental-mirage/shared-types";
import { descartarBorradorAction, guardarBorradorAction, terminarDocumentoAction } from "@/app/actions/documentos";
import { Dialogo } from "@/components/dialogo";
import { CalcoEnVivo } from "./calco";
import { CampoDeDocumento, idDelCampo } from "./campo-de-documento";

type EstadoDeGuardado = "guardado" | "pendiente" | "guardando" | "error";

const ESPERA_GUARDADO_MS = 900;

function erroresPorCampo(errores: ErrorDeCampoDeDocumento[] | undefined): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const e of errores ?? []) if (e.campo && !mapa[e.campo]) mapa[e.campo] = e.mensaje;
  return mapa;
}

// EditorDeDocumento — completar un borrador (Fase 5.1, R4–R6 del brief).
//
// A la izquierda, el sidebar con los campos de la plantilla, sección por
// sección; a la derecha, el calco del documento armándose en vivo. Tocar un
// dato del calco abre su sección y pone el foco en su campo (el mismo
// criterio que el editor de la página, TR-173). En el celular, una cosa por
// vez: Completar o Ver documento (TR-172).
//
// El estado local es lo que la persona está escribiendo: por eso NO usa
// `useEstadoDelServidor` (CLAUDE.md, TR-156). Se guarda solo, un momento
// después de cada cambio.
export function EditorDeDocumento({ documento, plantilla }: { documento: DocumentoDetalle; plantilla: Plantilla }) {
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

  const ultimo = useRef(valores);
  const vuelta = useRef(0);
  const sinGuardar = useRef(false);

  // Los errores de formato se ven mientras se escribe, sin esperar a la API.
  const erroresLocales = useMemo(() => erroresPorCampo(validarValores(plantilla, valores, "tolerante")), [plantilla, valores]);
  const errores = { ...erroresAlTerminar, ...erroresDelServidor, ...erroresLocales };

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
    setVista("completar");
    // Después de que la sección se abra y el campo exista.
    requestAnimationFrame(() => {
      const control = document.getElementById(idDelCampo(campoId)) ?? document.querySelector<HTMLElement>(`[data-campo="${campoId}"] button`);
      control?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      control?.focus({ preventScroll: true });
    });
  }

  async function terminar() {
    setMensaje(null);
    const faltan = erroresPorCampo(validarValores(plantilla, ultimo.current, "estricto"));
    if (Object.keys(faltan).length > 0) {
      setErroresAlTerminar(faltan);
      setMensaje("Faltan datos para terminar: están marcados en el formulario.");
      irAlCampo(Object.keys(faltan)[0]);
      return;
    }
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
      {/* En el celular, una cosa por vez (TR-172). Todo es CSS: el HTML del
          servidor y el del cliente son el mismo. */}
      <div role="tablist" aria-label="Qué mostrar" className="grid grid-cols-2 gap-1 rounded-full border border-linea bg-hueso p-1 lg:hidden">
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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
        <aside
          aria-label="Datos del documento"
          className={`${vista === "completar" ? "flex" : "hidden"} flex-col gap-3 lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100dvh-var(--header-height)-2rem)] lg:overflow-y-auto lg:pr-1`}
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
                    onClick={() => setSeccionAbierta(abierta ? "" : seccion.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">{seccion.titulo}</span>
                    <span className={`text-xs font-medium ${conError ? "text-terracota-oscuro" : "text-grafito/75"}`}>
                      {conError
                        ? "Revisar"
                        : obligatorios.length > 0
                          ? `${completos} de ${obligatorios.length} obligatorios`
                          : "Opcional"}
                    </span>
                  </button>
                </h3>
                {abierta && (
                  <div className="flex flex-col gap-4 border-t border-linea px-4 py-4">
                    {seccion.campos.map((campo) => (
                      <CampoDeDocumento
                        key={campo.id}
                        campo={campo}
                        valor={valores[campo.id]}
                        error={errores[campo.id]}
                        onCambio={(v) => cambiar(campo.id, v)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          <div className="flex flex-col gap-3 rounded-card border border-linea bg-hueso p-4">
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
              onClick={() => void terminar()}
              disabled={terminando}
              className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              {terminando ? "Terminando…" : "Terminar y pasar a firmas"}
            </button>
            <p className="text-xs text-grafito/75">
              Al terminar, el texto del documento queda fijo. Si nadie firmó todavía, se puede volver a editar.
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

        <div className={`${vista === "documento" ? "block" : "hidden"} min-w-0 lg:block`}>
          <CalcoEnVivo
            plantilla={plantilla}
            valores={valores}
            hoy={documento.hoy ?? ""}
            campoActivo={campoActivo}
            onElegir={irAlCampo}
          />
        </div>
      </div>

      {confirmarDescarte && (
        <Dialogo
          titulo="¿Descartar este borrador?"
          descripcion="Se borra lo que cargaste. Todavía no es parte de la historia clínica del paciente."
          onCerrar={() => setConfirmarDescarte(false)}
        >
          <div className="flex justify-end gap-2 p-4 sm:p-6">
            <button type="button" onClick={() => setConfirmarDescarte(false)} className="rounded-full px-4 py-2 text-sm font-medium text-grafito hover:bg-arena">
              Seguir editando
            </button>
            <button
              type="button"
              onClick={() => void descartarBorradorAction(documento.id)}
              className="rounded-full bg-terracota-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95"
            >
              Descartar
            </button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
