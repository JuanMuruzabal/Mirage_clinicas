import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { plantillaPorId, type Plantilla } from "@dental-mirage/documentos-clinicos";
import { borrador, conducto, todoTipo } from "./fixtures";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));

const acciones = vi.hoisted(() => ({
  guardarBorradorAction: vi.fn(),
  terminarDocumentoAction: vi.fn(),
  descartarBorradorAction: vi.fn(),
}));
vi.mock("@/app/actions/documentos", () => acciones);

const { EditorDeDocumento } = await import("./editor-de-documento");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // El foco y el scroll al elegir un campo del calco.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Terminar pide confirmación: el primer botón valida y abre el diálogo. */
async function terminarConfirmando(boton = "Terminar y pasar a firmas", confirmar = "Sí, terminar y pasar a firmas") {
  fireEvent.click(screen.getByRole("button", { name: boton }));
  const si = await screen.findByRole("button", { name: confirmar });
  await act(async () => {
    fireEvent.click(si);
  });
}

/** Las secciones cerradas siguen montadas (se pliegan con una animación),
 *  pero inertes. jsdom no saca lo inerte del árbol de accesibilidad: se
 *  mira el atributo. */
function enSeccionCerrada(el: HTMLElement): boolean {
  return el.closest("[inert]") !== null;
}

async function esperarGuardado() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
}

describe("EditorDeDocumento", () => {
  it("se guarda solo un momento después de escribir", async () => {
    acciones.guardarBorradorAction.mockResolvedValue({ ok: true, documento: borrador() });
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    expect(screen.getByText("Borrador guardado")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Ana María" } });
    expect(screen.getByText("Cambios sin guardar…")).toBeInTheDocument();
    await esperarGuardado();
    expect(acciones.guardarBorradorAction).toHaveBeenCalledWith("doc-1", { nombre: "Ana María" });
    expect(screen.getByText("Borrador guardado")).toBeInTheDocument();
  });

  it("un error de formato se ve enseguida y no se manda a guardar", async () => {
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    fireEvent.change(screen.getByLabelText("Peso"), { target: { value: "70.25" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Puede tener hasta 1 decimales.");
    await esperarGuardado();
    expect(acciones.guardarBorradorAction).not.toHaveBeenCalled();
    expect(screen.getByText("No se pudo guardar")).toBeInTheDocument();
  });

  it("si la API rechaza el guardado, marca el campo", async () => {
    acciones.guardarBorradorAction.mockResolvedValue({
      ok: false,
      error: "Revisá los datos marcados.",
      errores: [{ campo: "nombre", mensaje: "Algo no está bien." }],
    });
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Ana M" } });
    await esperarGuardado();
    expect(screen.getByText("Algo no está bien.")).toBeInTheDocument();
    expect(screen.getByText("Revisá los datos marcados.")).toBeInTheDocument();
  });

  it("terminar sin los obligatorios lleva al campo y no manda nada", async () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Terminar y pasar a firmas" }));
    });
    expect(screen.getByText("Hay datos para revisar antes de terminar: están marcados en el formulario.")).toBeInTheDocument();
    expect(screen.getByText("Este dato es obligatorio.")).toBeInTheDocument();
    expect(acciones.terminarDocumentoAction).not.toHaveBeenCalled();
  });

  it("terminar guarda lo pendiente, termina y refresca la página", async () => {
    acciones.guardarBorradorAction.mockResolvedValue({ ok: true, documento: borrador() });
    acciones.terminarDocumentoAction.mockResolvedValue({ ok: true, documento: borrador() });
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Ana Paz" } });
    await terminarConfirmando();
    expect(acciones.guardarBorradorAction).toHaveBeenCalledWith("doc-1", { nombre: "Ana Paz" });
    expect(acciones.terminarDocumentoAction).toHaveBeenCalledWith("doc-1");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("si la API no deja terminar, muestra por qué", async () => {
    acciones.terminarDocumentoAction.mockResolvedValue({
      ok: false,
      error: "Revisá los datos marcados.",
      errores: [{ campo: "nombre", mensaje: "Este dato es obligatorio." }],
    });
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    await terminarConfirmando();
    expect(screen.getByText("Revisá los datos marcados.")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("si el guardado previo falla, no termina", async () => {
    acciones.guardarBorradorAction.mockResolvedValue({ ok: false, error: "caída" });
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Ana P" } });
    await terminarConfirmando();
    expect(acciones.terminarDocumentoAction).not.toHaveBeenCalled();
    expect(screen.getByText("No se pudo guardar el borrador. Revisá los datos marcados y probá de nuevo.")).toBeInTheDocument();
  });

  it("terminar pide confirmar, porque después ya no se edita; «Seguir revisando» no termina", async () => {
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    fireEvent.click(screen.getByRole("button", { name: "Terminar y pasar a firmas" }));
    const dialogo = await screen.findByRole("dialog", { name: "¿Terminar el documento?" });
    expect(dialogo).toHaveTextContent(/ya no se puede editar/);
    fireEvent.click(screen.getByRole("button", { name: "Seguir revisando" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(acciones.terminarDocumentoAction).not.toHaveBeenCalled();
  });

  it("un consentimiento se confirma para imprimir", async () => {
    render(
      <EditorDeDocumento
        documento={borrador({
          lugar: "Córdoba",
          suscribe_nombre: "Ana Paz",
          suscribe_fecha_nacimiento: "1990-01-01",
          suscribe_dni: "30111222",
          suscribe_domicilio: "Calle 1",
          elementos: ["36"],
          profesional_nombre: "Juan Pérez",
        })}
        plantilla={conducto}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Terminar documento" }));
    expect(await screen.findByRole("dialog", { name: "¿Terminar el documento?" })).toHaveTextContent(/listo para imprimir o descargar/);
    expect(screen.getByRole("button", { name: "Sí, terminar" })).toBeInTheDocument();
  });

  it("si ya había un borrador de este documento para el paciente, avisa que se retomó", () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} retomado />);
    expect(screen.getByRole("status")).toHaveTextContent("Ya tenías un borrador de este documento para Ana");
    expect(screen.getByRole("status")).not.toHaveTextContent("versión nueva");
  });

  it("si el borrador era de una versión anterior del documento, avisa que pasó a la vigente", () => {
    const { unmount } = render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} actualizado />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "El documento tiene una versión nueva y tu borrador pasó a esa versión, con lo que ya habías completado.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("Ya tenías");
    unmount();
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} retomado actualizado />);
    expect(screen.getByRole("status")).toHaveTextContent(/seguís desde acá\. .* El documento tiene una versión nueva/);
  });

  it("tocar un dato del calco abre su sección", async () => {
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    expect(enSeccionCerrada(screen.getByRole("radiogroup", { name: "Higiene" }))).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Completar: Higiene" }));
    });
    expect(enSeccionCerrada(screen.getByRole("radiogroup", { name: "Higiene" }))).toBe(false);
    expect(screen.getByRole("button", { name: /Clínica/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("las secciones se abren y se cierran, y dicen cuánto falta", () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    expect(screen.getByText("0 de 1 obligatorios")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Datos/ }));
    expect(screen.getByRole("button", { name: /Datos/ })).toHaveAttribute("aria-expanded", "false");
    expect(enSeccionCerrada(screen.getByRole("textbox", { name: /^Nombre/ }))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Clínica/ }));
    expect(enSeccionCerrada(screen.getByRole("group", { name: "Hábitos" }))).toBe(false);
  });

  it("con lámina, el documento es la página original con lo cargado encima, y tocar un renglón abre su campo", async () => {
    const { container } = render(<EditorDeDocumento documento={borrador({ lugar: "Córdoba", indicaciones: "Enjuagues." })} plantilla={conducto} />);
    // La página del Colegio y lo cargado, en la letra de la lámina.
    const hoja = screen.getByRole("figure", { name: "Tu documento" });
    expect(hoja.querySelector("img")).toHaveAttribute("src", "/documentos-clinicos/originales/consentimiento-tratamiento-conducto/v1/pagina-1.w1600.webp");
    const escrito = [...container.querySelectorAll("figure text")].map((t) => t.textContent);
    expect(escrito).toContain("Córdoba, 27/09/2026");
    expect(escrito).toContain("Enjuagues.");
    // Ya no hay calco ni pestañas para comparar: la hoja ES el original.
    expect(screen.queryByRole("tab", { name: "Modelo original" })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Completar: Domicilio" }));
    });
    expect(screen.getByRole("textbox", { name: /^Domicilio/ })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Completar: Domicilio" })).toHaveClass("bg-salvia/20");
    // Las tres partes de la próxima consulta llevan al mismo campo.
    expect(screen.getByRole("button", { name: "Completar: Próxima consulta (mes)" })).toBeInTheDocument();
  });

  it("lo que no entra en su renglón se avisa mientras se escribe, y no deja terminar", async () => {
    acciones.guardarBorradorAction.mockResolvedValue({ ok: true, documento: borrador() });
    const largo = "Indicación muy larga que no entra. ".repeat(60);
    render(
      <EditorDeDocumento
        documento={borrador({
          lugar: "Córdoba",
          suscribe_nombre: "Ana Paz",
          suscribe_fecha_nacimiento: "1990-01-01",
          suscribe_dni: "30111222",
          suscribe_domicilio: "Calle 1",
          elementos: ["36"],
          profesional_nombre: "Juan Pérez",
          indicaciones: largo,
        })}
        plantilla={conducto}
      />,
    );
    expect(screen.getByRole("button", { name: "Completar: Indicaciones" })).toHaveClass("bg-terracota/15");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Terminar documento" }));
    });
    expect(acciones.terminarDocumentoAction).not.toHaveBeenCalled();
    expect(screen.getByText("No entra en el espacio del documento: acortalo.")).toBeInTheDocument();
  });

  it("la hoja se abre a pantalla completa, en el celular y en la computadora", async () => {
    render(<EditorDeDocumento documento={borrador({ lugar: "Córdoba" })} plantilla={conducto} />);
    // Uno por encima de las dos columnas en la computadora; otro arriba de la
    // hoja en el celular ("Ver documento").
    const [escritorio, celular] = screen.getAllByRole("button", { name: "Ver en pantalla completa" });
    expect(escritorio.parentElement).toHaveClass("hidden", "lg:flex");
    expect(celular).toHaveClass("lg:hidden");
    const boton = escritorio;
    fireEvent.click(boton);
    const capa = await screen.findByRole("dialog", { name: "Tratamiento de conducto: tu documento" });
    // A pantalla completa se lee, no se edita.
    expect(capa.querySelector("[data-zona]")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("un consentimiento se termina para imprimir: se firma a mano", () => {
    render(<EditorDeDocumento documento={borrador({ lugar: "Córdoba" })} plantilla={conducto} />);
    expect(screen.getByRole("button", { name: "Terminar documento" })).toBeInTheDocument();
    expect(screen.getByText(/se firma a mano, en papel/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Terminar y pasar a firmas" })).not.toBeInTheDocument();
  });

  it("la columna de los datos queda pegada debajo del header, no tapada por él", () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    expect(screen.getByRole("complementary", { name: "Datos del documento" })).toHaveClass("lg:top-[calc(var(--header-height)+1rem)]");
  });

  it("una plantilla sin lámina muestra el calco", () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver en pantalla completa" })).not.toBeInTheDocument();
  });

  it("en el celular, Completar o Ver documento", () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    fireEvent.click(screen.getByRole("tab", { name: "Ver documento" }));
    expect(screen.getByRole("tab", { name: "Ver documento" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("complementary", { name: "Datos del documento" })).toHaveClass("hidden");
  });

  it("descartar pide confirmación", async () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
    expect(await screen.findByRole("dialog", { name: "¿Descartar este borrador?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(acciones.descartarBorradorAction).toHaveBeenCalledWith("doc-1", "pac-1");
  });

  it("si la API no deja descartar (una historia con anexos, 5.6b), lo dice en el diálogo, que queda abierto", async () => {
    acciones.descartarBorradorAction.mockResolvedValue({ error: "esta historia tiene anexos: no se puede descartar" });
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
    const dialogo = await screen.findByRole("dialog", { name: "¿Descartar este borrador?" });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Descartar" }));
    });
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("esta historia tiene anexos");
    // Cerrarlo y volver a abrirlo arranca sin el error.
    fireEvent.click(within(dialogo).getByRole("button", { name: "Seguir editando" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
    const otraVez = await screen.findByRole("dialog", { name: "¿Descartar este borrador?" });
    expect(within(otraVez).queryByRole("alert")).not.toBeInTheDocument();
  });
});

// QA de la 5.5: el odontograma se completa en una pantalla emergente, que
// abre tanto el botón del formulario como tocarlo en la hoja.
describe("EditorDeDocumento con un odontograma", () => {
  const general = plantillaPorId("historia-clinica-general", 1) as Plantilla;
  const documento = () => ({ ...borrador(), plantillaId: general.id, plantillaVersion: 1 });

  it("tocar el odontograma en la hoja abre su pantalla emergente, y Listo la cierra", async () => {
    render(<EditorDeDocumento documento={documento()} plantilla={general} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    const enLaHoja = screen.getAllByRole("button", { name: /^Completar: Odontograma/ });
    expect(enLaHoja.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(enLaHoja[0]);
    });
    const dialogo = screen.getByRole("dialog", { name: "Odontograma" });
    expect(within(dialogo).getAllByRole("button", { name: /^Pieza \d\d$/ }).length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Listo" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("el botón Abrir odontograma del formulario abre la misma pantalla", async () => {
    render(<EditorDeDocumento documento={documento()} plantilla={general} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Abrir odontograma" }));
    });
    expect(screen.getByRole("dialog", { name: "Odontograma" })).toBeInTheDocument();
  });
});

// Fase 5.6b: el genograma de odontopediatría se completa en su pantalla emergente,
// que abren el botón del formulario y tocarlo en la hoja; lo dibujado se
// guarda solo, como cualquier otro campo.
describe("EditorDeDocumento con un dibujo", () => {
  const historia = plantillaPorId("historia-clinica-odontopediatria") as Plantilla;
  const documento = () => ({ ...borrador(), plantillaId: historia.id, plantillaVersion: historia.version });

  it("tocar el genograma en la hoja abre su pantalla emergente, con el lienzo de la forma del recuadro", async () => {
    render(<EditorDeDocumento documento={documento()} plantilla={historia} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Completar: Genograma" }));
    });
    const dialogo = screen.getByRole("dialog", { name: "Genograma" });
    const recuadro = historia.lamina!.dibujos![0];
    const alto = Math.round(1000 / (recuadro.ancho / recuadro.alto));
    expect(within(dialogo).getByRole("application", { name: "Genograma" }).style.aspectRatio).toBe("1000 / " + alto);
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Listo" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lo dibujado se guarda solo, aunque se cierre con Escape", async () => {
    acciones.guardarBorradorAction.mockResolvedValue({ ok: true, documento: borrador() });
    render(<EditorDeDocumento documento={documento()} plantilla={historia} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Abrir genograma" }));
    });
    const lienzo = screen.getByRole("application", { name: "Genograma" });
    fireEvent.pointerDown(lienzo, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(lienzo, { clientX: 40, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(lienzo, { pointerId: 1 });
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await esperarGuardado();
    const guardado = acciones.guardarBorradorAction.mock.lastCall?.[1] as Record<string, unknown>;
    expect(guardado.genograma).toMatchObject({ ancho: 1000, trazos: [[[10, 10], [40, 30]]] });
  });
});
