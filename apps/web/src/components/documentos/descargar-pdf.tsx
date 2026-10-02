"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import {
  caminoDeDescarga,
  esAppInstalada,
  mensajeDeErrorDelPDF,
  nombreDelContentDisposition,
  rutaDelPDF,
  type EntornoDeDescarga,
} from "@/lib/pdf-de-documentos";

// BotonDescargarPDF — "Descargar PDF" de un documento terminado (Fase 5.3),
// que descarga también en el celular (pedido del cliente, 2026-10-02).
//
// Con un link común a la ruta (que responde `attachment`), el iPhone abría
// el PDF en una página aparte, y en la app instalada en la pantalla de
// inicio, en una vista previa sin salida. Así que el clic baja el archivo
// y lo guarda según dónde corre la página (`caminoDeDescarga`):
// - en el navegador, un link de descarga sobre el archivo ya bajado;
// - en la app instalada, el "Guardar como" del sistema si existe, o la hoja
//   de compartir (en el iPhone, "Guardar en Archivos" pregunta la carpeta).
//
// Sin JavaScript —o con el botón del medio, o con Ctrl/Cmd— es el link de
// siempre (`<a href download>`) y el navegador hace lo suyo.
//
// Es un fetch a la ruta propia del BFF (/panel/documentos/{id}/pdf, mismo
// origen, la cookie viaja sola) y no una Server Action: los bytes del
// archivo tienen que llegar a la página para guardarlos, y la ruta ya los
// sirve con su nombre. El navegador sigue sin hablarle a la API.

/** Lo que este componente usa de `showSaveFilePicker` (File System Access),
 *  que no está en los tipos del DOM. */
interface ArchivoParaEscribir {
  createWritable(): Promise<{ write(datos: Blob): Promise<void>; close(): Promise<void> }>;
}
type MostrarSelectorParaGuardar = (opciones: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<ArchivoParaEscribir>;
type VentanaConSelector = Window & { showSaveFilePicker?: MostrarSelectorParaGuardar };
/** `navigator.standalone` solo existe en Safari de iOS. */
type NavegadorDeIOS = Navigator & { standalone?: boolean };

type Estado =
  | { tipo: "listo" }
  | { tipo: "bajando" }
  /** El PDF ya está en memoria pero la hoja de compartir no se abrió: el
   *  gesto venció mientras se generaba (`NotAllowedError`). El próximo
   *  toque —un gesto nuevo— la abre. */
  | { tipo: "para-guardar"; archivo: File };

function entornoDelNavegador(): EntornoDeDescarga & { selector?: MostrarSelectorParaGuardar } {
  const ventana = window as VentanaConSelector;
  const navegador = navigator as NavegadorDeIOS;
  return {
    instalada: esAppInstalada({
      matchMedia: typeof window.matchMedia === "function" ? (q) => window.matchMedia(q) : undefined,
      navigator: { standalone: navegador.standalone },
    }),
    conSelectorDeArchivo: typeof ventana.showSaveFilePicker === "function",
    conCompartir: typeof navigator.share === "function" && typeof navigator.canShare === "function",
    selector: ventana.showSaveFilePicker?.bind(ventana),
  };
}

function nombreDeError(err: unknown): string {
  // Un DOMException (AbortError, NotAllowedError) no siempre es un Error.
  return typeof err === "object" && err !== null && "name" in err ? String(err.name) : "";
}

// La descarga de siempre, sobre un archivo que ya está en memoria. El
// object URL se revoca después de un rato y no enseguida: Safari lo
// necesita vivo mientras arranca la descarga.
function bajarConEnlace(datos: Blob, nombre: string) {
  const url = URL.createObjectURL(datos);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.rel = "noopener";
  enlace.style.display = "none";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function BotonDescargarPDF({
  id,
  nombreDeArchivo,
  titulo,
  de,
  icono,
  className = "",
  claseDelAviso = "mt-1 text-xs",
  etiquetas,
  avisoParaGuardar,
  children = "Descargar PDF",
}: {
  id: string;
  /** El nombre que se sugiere al guardar antes de tener la respuesta
   *  (`nombreDeArchivoDelPDF`); después manda el de la API. */
  nombreDeArchivo: string;
  /** El título de la hoja de compartir. */
  titulo: string;
  /** Para el nombre accesible ("Descargar PDF de …"), cuando el texto
   *  visible no alcanza a decir de qué documento es. */
  de?: string;
  icono?: ReactNode;
  className?: string;
  /** Dónde va el aviso de abajo (un error, o `avisoParaGuardar`); el color
   *  lo pone el componente. */
  claseDelAviso?: string;
  /** Lo que dice el botón mientras baja el PDF ("Preparando…") y cuando
   *  hay que tocarlo de nuevo para guardarlo ("Guardar PDF"). La fila de la
   *  tabla los acorta en el celular: no entran en la columna. */
  etiquetas?: { preparando?: ReactNode; guardar?: ReactNode };
  /** Si el botón no alcanza a decir "Guardar PDF", lo explica abajo. */
  avisoParaGuardar?: string;
  /** Lo que dice el botón listo para descargar. */
  children?: ReactNode;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "listo" });
  const [error, setError] = useState<string | null>(null);

  async function compartir(archivo: File) {
    setEstado({ tipo: "bajando" });
    try {
      await navigator.share({ files: [archivo], title: titulo });
      setEstado({ tipo: "listo" });
    } catch (err) {
      const nombre = nombreDeError(err);
      if (nombre === "AbortError") {
        // La persona cerró la hoja: no es un error.
        setEstado({ tipo: "listo" });
      } else if (nombre === "NotAllowedError") {
        setEstado({ tipo: "para-guardar", archivo });
      } else {
        bajarConEnlace(archivo, archivo.name);
        setEstado({ tipo: "listo" });
      }
    }
  }

  async function descargar() {
    setError(null);
    const entorno = entornoDelNavegador();
    const camino = caminoDeDescarga(entorno);
    // El "Guardar como" se abre PRIMERO y sin await antes: necesita el gesto
    // del clic, y un fetch de por medio lo vencería.
    const destino =
      camino === "selector" && entorno.selector
        ? entorno.selector({
            suggestedName: nombreDeArchivo,
            types: [{ description: "Documento PDF", accept: { "application/pdf": [".pdf"] } }],
          })
        : null;
    setEstado({ tipo: "bajando" });
    try {
      let archivoDestino: ArchivoParaEscribir | null = null;
      if (destino) {
        try {
          archivoDestino = await destino;
        } catch (err) {
          if (nombreDeError(err) === "AbortError") {
            setEstado({ tipo: "listo" });
            return;
          }
          // El selector no se pudo abrir: se sigue con la descarga común.
        }
      }

      const respuesta = await fetch(rutaDelPDF(id), { credentials: "same-origin", cache: "no-store" });
      if (!respuesta.ok) {
        setError(mensajeDeErrorDelPDF(respuesta.status, await respuesta.text().catch(() => "")));
        setEstado({ tipo: "listo" });
        return;
      }
      const datos = await respuesta.blob();
      const nombre = nombreDelContentDisposition(respuesta.headers.get("Content-Disposition")) ?? nombreDeArchivo;

      if (archivoDestino) {
        const escritura = await archivoDestino.createWritable();
        await escritura.write(datos);
        await escritura.close();
        setEstado({ tipo: "listo" });
        return;
      }
      if (camino === "compartir") {
        const archivo = new File([datos], nombre, { type: "application/pdf" });
        if (navigator.canShare({ files: [archivo] })) {
          await compartir(archivo);
          return;
        }
      }
      bajarConEnlace(datos, nombre);
      setEstado({ tipo: "listo" });
    } catch {
      setError("No se pudo descargar el PDF. Probá de nuevo.");
      setEstado({ tipo: "listo" });
    }
  }

  function alHacerClic(e: MouseEvent<HTMLAnchorElement>) {
    // Ctrl/Cmd/Shift/Alt + clic: lo que el navegador haga con un link.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (estado.tipo === "bajando") return;
    if (estado.tipo === "para-guardar") {
      void compartir(estado.archivo);
      return;
    }
    void descargar();
  }

  const ocupado = estado.tipo === "bajando";
  const accion = estado.tipo === "para-guardar" ? "Guardar PDF" : "Descargar PDF";
  return (
    <>
      <a
        href={rutaDelPDF(id)}
        download
        onClick={alHacerClic}
        aria-label={de ? `${accion} de ${de}` : undefined}
        aria-busy={ocupado || undefined}
        aria-disabled={ocupado || undefined}
        className={`aria-disabled:cursor-wait aria-disabled:opacity-70 ${className}`}
      >
        {icono}
        {ocupado ? (etiquetas?.preparando ?? "Preparando…") : estado.tipo === "para-guardar" ? (etiquetas?.guardar ?? "Guardar PDF") : children}
      </a>
      {error && (
        <p role="alert" className={`${claseDelAviso} text-terracota-oscuro`}>
          {error}
        </p>
      )}
      {estado.tipo === "para-guardar" && avisoParaGuardar && (
        <p role="status" className={`${claseDelAviso} text-grafito/75`}>
          {avisoParaGuardar}
        </p>
      )}
    </>
  );
}
