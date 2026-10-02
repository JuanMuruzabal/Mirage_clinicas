import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BotonDescargarPDF } from "./descargar-pdf";

// "Descargar PDF" de un documento terminado (Fase 5.3, pedido del cliente
// 2026-10-02): baja el archivo con un fetch a la ruta del BFF y lo guarda
// según dónde corre — en el navegador, un <a download> sobre un object URL;
// en la app instalada, el "Guardar como" del sistema (abierto ANTES del
// fetch) o la hoja de compartir, con un segundo toque si el gesto venció.

const NOMBRE = "Consentimiento informado: Extracción";
const SUGERIDO = "consentimiento-informado-extraccion-folio-3.pdf";
const DE_LA_API = "consentimiento-informado-extraccion-folio-3-api.pdf";
const AVISO = "El PDF está listo: tocá de nuevo para guardarlo.";

// ---------------------------------------------------------------------------
// Dobles del navegador

type Respuesta = {
  ok: boolean;
  status: number;
  headers: Headers;
  blob: () => Promise<Blob>;
  text: () => Promise<string>;
};

function respuestaPDF(contentDisposition: string | null = `attachment; filename="${DE_LA_API}"`): Respuesta {
  const headers = new Headers({ "Content-Type": "application/pdf" });
  if (contentDisposition) headers.set("Content-Disposition", contentDisposition);
  return {
    ok: true,
    status: 200,
    headers,
    blob: async () => new Blob(["%PDF-1.7 prueba"], { type: "application/pdf" }),
    text: async () => "",
  };
}

function respuestaError(status: number, texto: string | Error): Respuesta {
  return {
    ok: false,
    status,
    headers: new Headers({ "Content-Type": "text/plain" }),
    blob: async () => new Blob([]),
    text: async () => {
      if (texto instanceof Error) throw texto;
      return texto;
    },
  };
}

const orden: string[] = [];
let fetchMock: ReturnType<typeof vi.fn>;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let clicsDeEnlace: { href: string; download: string; enElDocumento: boolean; display: string }[];
const propiedadesPuestas: [object, string][] = [];

function poner(objeto: object, clave: string, valor: unknown) {
  Object.defineProperty(objeto, clave, { configurable: true, writable: true, value: valor });
  propiedadesPuestas.push([objeto, clave]);
}

function comoAppInstalada(instalada: boolean) {
  poner(window, "matchMedia", (q: string) => ({ matches: instalada && q === "(display-mode: standalone)" }));
}

function conSelector(resultado: () => Promise<unknown>) {
  const selector = vi.fn((opciones: unknown) => {
    orden.push("selector");
    void opciones;
    return resultado();
  });
  poner(window, "showSaveFilePicker", selector);
  return selector;
}

function conCompartir({ puede = true, share }: { puede?: boolean; share: (datos: ShareData) => Promise<void> }) {
  const shareMock = vi.fn(share);
  const canShare = vi.fn(() => puede);
  poner(navigator, "share", shareMock);
  poner(navigator, "canShare", canShare);
  return { share: shareMock, canShare };
}

function errorDOM(nombre: string) {
  return new DOMException("probando", nombre);
}

// Las promesas del clic (selector, fetch, blob, share) se resuelven en
// varias vueltas de microtareas: esto las deja terminar todas.
async function asentar() {
  for (let i = 0; i < 15; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

// Lo que hizo el navegador con el clic: si quedó cancelado (el componente
// tomó el control) o siguió como un link. Se cancela después de leerlo para
// que jsdom no intente navegar.
let ultimoClicCancelado: boolean | null = null;
function registrarCancelacion(e: Event) {
  if (e.type !== "click" || !(e.target instanceof HTMLElement) || !e.target.closest("[data-boton-pdf] a")) return;
  ultimoClicCancelado = e.defaultPrevented;
  e.preventDefault();
}

function dibujar(props: Partial<Parameters<typeof BotonDescargarPDF>[0]> = {}) {
  render(
    <div data-boton-pdf>
      <BotonDescargarPDF id="doc-9" nombreDeArchivo={SUGERIDO} titulo={NOMBRE} de={NOMBRE} avisoParaGuardar={AVISO} {...props} />
    </div>,
  );
  return screen.getByRole("link");
}

beforeEach(() => {
  orden.length = 0;
  clicsDeEnlace = [];
  ultimoClicCancelado = null;
  fetchMock = vi.fn(async () => {
    orden.push("fetch");
    return respuestaPDF();
  });
  vi.stubGlobal("fetch", fetchMock);
  createObjectURL = vi.fn(() => "blob:http://localhost/pdf-1");
  revokeObjectURL = vi.fn();
  poner(URL, "createObjectURL", createObjectURL);
  poner(URL, "revokeObjectURL", revokeObjectURL);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicsDeEnlace.push({ href: this.getAttribute("href") ?? "", download: this.download, enElDocumento: document.body.contains(this), display: this.style.display });
  });
  window.addEventListener("click", registrarCancelacion);
  comoAppInstalada(false);
});

afterEach(() => {
  window.removeEventListener("click", registrarCancelacion);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const [objeto, clave] of propiedadesPuestas.splice(0)) {
    delete (objeto as Record<string, unknown>)[clave];
  }
});

// ---------------------------------------------------------------------------

describe("BotonDescargarPDF: lo que se dibuja", () => {
  it("es un <a href download> a la ruta del BFF: anda sin JavaScript", () => {
    const enlace = dibujar();
    expect(enlace).toHaveAttribute("href", "/panel/documentos/doc-9/pdf");
    expect(enlace).toHaveAttribute("download");
    expect(enlace).toHaveAccessibleName(`Descargar PDF de ${NOMBRE}`);
    expect(enlace).toHaveTextContent("Descargar PDF");
    expect(enlace).not.toHaveAttribute("aria-busy");
  });

  it("sin `de`, el nombre accesible es el texto visible", () => {
    const enlace = dibujar({ de: undefined, children: "Bajar" });
    expect(enlace).not.toHaveAttribute("aria-label");
    expect(enlace).toHaveAccessibleName("Bajar");
  });
});

describe("BotonDescargarPDF en el navegador", () => {
  it("baja el archivo y hace clic en un <a download> con el nombre del Content-Disposition; revoca el object URL a los 60 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const enlace = dibujar();
    fireEvent.click(enlace);
    expect(ultimoClicCancelado).toBe(true);
    await asentar();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/panel/documentos/doc-9/pdf", expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/pdf");

    expect(clicsDeEnlace).toEqual([{ href: "blob:http://localhost/pdf-1", download: DE_LA_API, enElDocumento: true, display: "none" }]);
    // El enlace temporal no queda en la página.
    expect(document.querySelectorAll("a")).toHaveLength(1);

    // No se revoca enseguida: Safari lo necesita vivo mientras arranca.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(59_999);
    });
    expect(revokeObjectURL).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/pdf-1");

    expect(enlace).not.toHaveAttribute("aria-busy");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sin Content-Disposition usa `nombreDeArchivo`", async () => {
    fetchMock.mockImplementation(async () => respuestaPDF(null));
    fireEvent.click(dibujar());
    await asentar();
    expect(clicsDeEnlace.map((c) => c.download)).toEqual([SUGERIDO]);
  });

  it("con un Content-Disposition sin nombre, también `nombreDeArchivo`", async () => {
    fetchMock.mockImplementation(async () => respuestaPDF("attachment"));
    fireEvent.click(dibujar());
    await asentar();
    expect(clicsDeEnlace.map((c) => c.download)).toEqual([SUGERIDO]);
  });

  it("en el navegador no usa ni el selector ni compartir, aunque existan", async () => {
    const selector = conSelector(async () => ({}));
    const { share } = conCompartir({ share: async () => {} });
    fireEvent.click(dibujar());
    await asentar();
    expect(selector).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    expect(clicsDeEnlace).toHaveLength(1);
  });

  it.each<[string, Record<string, unknown>]>([
    ["Ctrl", { ctrlKey: true }],
    ["Cmd", { metaKey: true }],
    ["Shift", { shiftKey: true }],
    ["Alt", { altKey: true }],
    ["el botón del medio", { button: 1 }],
  ])("un clic con %s es el del link: sin preventDefault ni fetch", async (_caso, opciones) => {
    fireEvent.click(dibujar(), opciones);
    expect(ultimoClicCancelado).toBe(false);
    await asentar();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

describe("BotonDescargarPDF en la app instalada, con el selector de archivo", () => {
  function destinoQueEscribe() {
    const write = vi.fn(async (datos: Blob) => {
      orden.push(datos.size > 0 ? "write" : "write-vacio");
    });
    const close = vi.fn(async () => {
      orden.push("close");
    });
    const createWritable = vi.fn(async () => ({ write, close }));
    return { handle: { createWritable }, write, close, createWritable };
  }

  it("abre el selector ANTES del fetch, dentro del clic, y escribe el PDF en el archivo elegido", async () => {
    comoAppInstalada(true);
    const { handle, write, close } = destinoQueEscribe();
    const selector = conSelector(async () => handle);
    fireEvent.click(dibujar());
    // Sincrónico dentro del clic: el gesto del usuario sigue vivo.
    expect(selector).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(selector).toHaveBeenCalledWith({
      suggestedName: SUGERIDO,
      types: [{ description: "Documento PDF", accept: { "application/pdf": [".pdf"] } }],
    });
    await asentar();

    expect(orden).toEqual(["selector", "fetch", "write", "close"]);
    expect((write.mock.calls[0][0] as Blob).type).toBe("application/pdf");
    expect(close).toHaveBeenCalledTimes(1);
    // No descarga además por el otro camino.
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clicsDeEnlace).toHaveLength(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("link")).not.toHaveAttribute("aria-busy");
  });

  it("detecta la app del iPhone por navigator.standalone", async () => {
    poner(navigator, "standalone", true);
    const { handle } = destinoQueEscribe();
    const selector = conSelector(async () => handle);
    fireEvent.click(dibujar());
    await asentar();
    expect(selector).toHaveBeenCalledTimes(1);
  });

  it("si la persona cancela el selector (AbortError), no baja nada ni avisa", async () => {
    comoAppInstalada(true);
    conSelector(async () => {
      throw errorDOM("AbortError");
    });
    const enlace = dibujar();
    fireEvent.click(enlace);
    await asentar();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(enlace).not.toHaveAttribute("aria-busy");
    expect(enlace).toHaveTextContent("Descargar PDF");
  });

  it("si el selector falla con otro error, cae a la descarga común", async () => {
    comoAppInstalada(true);
    conSelector(async () => {
      throw errorDOM("SecurityError");
    });
    fireEvent.click(dibujar());
    await asentar();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicsDeEnlace.map((c) => c.download)).toEqual([DE_LA_API]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un selector que falla con algo que no es un DOMException también cae a la descarga común", async () => {
    comoAppInstalada(true);
    conSelector(() => Promise.reject("raro"));
    fireEvent.click(dibujar());
    await asentar();
    expect(clicsDeEnlace).toHaveLength(1);
  });

  it("si falla la escritura en el archivo, avisa", async () => {
    comoAppInstalada(true);
    conSelector(async () => ({
      createWritable: async () => ({
        write: async () => {
          throw new Error("disco lleno");
        },
        close: async () => {},
      }),
    }));
    fireEvent.click(dibujar());
    await asentar();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo descargar el PDF. Probá de nuevo.");
  });
});

describe("BotonDescargarPDF en la app instalada, con la hoja de compartir", () => {
  it("comparte un File PDF con el nombre de la API y el título", async () => {
    comoAppInstalada(true);
    const { share, canShare } = conCompartir({ share: async () => {} });
    fireEvent.click(dibujar());
    await asentar();

    expect(canShare).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledTimes(1);
    const datos = share.mock.calls[0][0];
    expect(datos.title).toBe(NOMBRE);
    expect(datos.files).toHaveLength(1);
    const archivo = datos.files![0];
    expect(archivo).toBeInstanceOf(File);
    expect(archivo.name).toBe(DE_LA_API);
    expect(archivo.type).toBe("application/pdf");
    expect(canShare.mock.calls[0]).toEqual([{ files: [archivo] }]);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByRole("link")).toHaveAccessibleName(`Descargar PDF de ${NOMBRE}`);
  });

  it("sin Content-Disposition, el File se llama como `nombreDeArchivo`", async () => {
    comoAppInstalada(true);
    fetchMock.mockImplementation(async () => respuestaPDF(null));
    const { share } = conCompartir({ share: async () => {} });
    fireEvent.click(dibujar());
    await asentar();
    expect(share.mock.calls[0][0].files![0].name).toBe(SUGERIDO);
  });

  it("si la persona cierra la hoja (AbortError), no avisa nada", async () => {
    comoAppInstalada(true);
    conCompartir({
      share: async () => {
        throw errorDOM("AbortError");
      },
    });
    const enlace = dibujar();
    fireEvent.click(enlace);
    await asentar();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(enlace).toHaveAccessibleName(`Descargar PDF de ${NOMBRE}`);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("si el gesto venció (NotAllowedError), pasa a 'Guardar PDF' y el segundo toque comparte sin volver a bajar", async () => {
    comoAppInstalada(true);
    let intento = 0;
    const { share } = conCompartir({
      share: async () => {
        intento++;
        if (intento === 1) throw errorDOM("NotAllowedError");
      },
    });
    const enlace = dibujar();
    fireEvent.click(enlace);
    await asentar();

    expect(enlace).toHaveAccessibleName(`Guardar PDF de ${NOMBRE}`);
    expect(enlace).toHaveTextContent("Guardar PDF");
    expect(screen.getByRole("status")).toHaveTextContent(AVISO);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(enlace);
    expect(ultimoClicCancelado).toBe(true);
    await asentar();
    expect(share).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // El mismo archivo que ya estaba en memoria.
    expect(share.mock.calls[1][0].files![0]).toBe(share.mock.calls[0][0].files![0]);
    expect(enlace).toHaveAccessibleName(`Descargar PDF de ${NOMBRE}`);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("'Guardar PDF' usa la etiqueta propia si la hay", async () => {
    comoAppInstalada(true);
    conCompartir({
      share: async () => {
        throw errorDOM("NotAllowedError");
      },
    });
    const enlace = dibujar({ etiquetas: { guardar: "Guardar" } });
    fireEvent.click(enlace);
    await asentar();
    expect(enlace).toHaveTextContent(/^Guardar$/);
  });

  it("sin `avisoParaGuardar` no hay aviso, solo el botón", async () => {
    comoAppInstalada(true);
    conCompartir({
      share: async () => {
        throw errorDOM("NotAllowedError");
      },
    });
    const enlace = dibujar({ avisoParaGuardar: undefined });
    fireEvent.click(enlace);
    await asentar();
    expect(enlace).toHaveTextContent("Guardar PDF");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("si compartir falla con otro error, cae a la descarga común con el mismo archivo", async () => {
    comoAppInstalada(true);
    conCompartir({
      share: async () => {
        throw new TypeError("no se pudo");
      },
    });
    fireEvent.click(dibujar());
    await asentar();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const archivo = createObjectURL.mock.calls[0][0] as File;
    expect(archivo).toBeInstanceOf(File);
    expect(clicsDeEnlace.map((c) => c.download)).toEqual([DE_LA_API]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si el navegador no puede compartir ese archivo (canShare false), descarga", async () => {
    comoAppInstalada(true);
    const { share } = conCompartir({ puede: false, share: async () => {} });
    fireEvent.click(dibujar());
    await asentar();
    expect(share).not.toHaveBeenCalled();
    expect(clicsDeEnlace.map((c) => c.download)).toEqual([DE_LA_API]);
  });

  it("instalada sin selector ni compartir, descarga", async () => {
    comoAppInstalada(true);
    fireEvent.click(dibujar());
    await asentar();
    expect(clicsDeEnlace).toHaveLength(1);
  });
});

describe("BotonDescargarPDF: errores y espera", () => {
  it("una respuesta no OK muestra su texto en un alert y el botón queda listo", async () => {
    fetchMock.mockImplementation(async () => respuestaError(409, "este documento no tiene lámina"));
    const enlace = dibujar();
    fireEvent.click(enlace);
    await asentar();
    expect(screen.getByRole("alert")).toHaveTextContent("Este documento no tiene lámina");
    expect(enlace).not.toHaveAttribute("aria-busy");
    expect(enlace).toHaveTextContent("Descargar PDF");
    expect(createObjectURL).not.toHaveBeenCalled();

    // Se puede volver a probar, y el aviso viejo se va.
    fetchMock.mockImplementation(async () => respuestaPDF());
    fireEvent.click(enlace);
    await asentar();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(clicsDeEnlace).toHaveLength(1);
  });

  it("si no se puede leer el texto del error, el mensaje genérico con el código", async () => {
    fetchMock.mockImplementation(async () => respuestaError(500, new Error("cortado")));
    fireEvent.click(dibujar());
    await asentar();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo descargar el PDF (error 500).");
  });

  it("un fetch que tira avisa 'No se pudo descargar el PDF. Probá de nuevo.'", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    const enlace = dibujar();
    fireEvent.click(enlace);
    await asentar();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo descargar el PDF. Probá de nuevo.");
    expect(enlace).not.toHaveAttribute("aria-busy");
  });

  it("el aviso va con la clase que pide quien lo usa", async () => {
    fetchMock.mockImplementation(async () => respuestaError(401, "sin sesión"));
    fireEvent.click(dibujar({ claseDelAviso: "col-span-3 mt-1 text-xs" }));
    await asentar();
    expect(screen.getByRole("alert")).toHaveClass("col-span-3", "mt-1", "text-xs", "text-terracota-oscuro");
  });

  it("mientras baja: aria-busy, 'Preparando…', y los clics de más se ignoran (un solo fetch)", async () => {
    let soltar: (r: Respuesta) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise<Respuesta>((r) => {
          soltar = r;
        }),
    );
    const enlace = dibujar();
    fireEvent.click(enlace);
    await asentar();
    expect(enlace).toHaveAttribute("aria-busy", "true");
    expect(enlace).toHaveAttribute("aria-disabled", "true");
    expect(enlace).toHaveTextContent("Preparando…");

    fireEvent.click(enlace);
    expect(ultimoClicCancelado).toBe(true);
    fireEvent.click(enlace);
    await asentar();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      soltar(respuestaPDF());
    });
    await asentar();
    expect(enlace).not.toHaveAttribute("aria-busy");
    expect(enlace).toHaveTextContent("Descargar PDF");
    expect(clicsDeEnlace).toHaveLength(1);
  });

  it("'Preparando…' usa la etiqueta propia si la hay", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const enlace = dibujar({ etiquetas: { preparando: "PDF…" } });
    fireEvent.click(enlace);
    await asentar();
    expect(enlace).toHaveTextContent(/^PDF…$/);
  });
});
