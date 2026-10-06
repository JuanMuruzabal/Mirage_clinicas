import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { plantillaSchema, type Plantilla } from "@dental-mirage/documentos-clinicos";
import type { AsientoDeDocumento, DocumentoDetalle } from "@dental-mirage/shared-types";
import { borrador } from "./fixtures";

// Los anexos de continuación (5.6d): el diálogo con sus anotaciones (los
// asientos de la API), la anotación nueva —sin firma dibujada, con su
// registro digital— y su confirmación en línea, la página propia del anexo y
// el "Continúa en anexo Nº" del editor de la historia.

const acciones = vi.hoisted(() => ({
  crearContinuacionAction: vi.fn(),
  leerDocumentoAction: vi.fn(),
  sumarAsientoAction: vi.fn(),
  guardarBorradorAction: vi.fn(),
  terminarDocumentoAction: vi.fn(),
  descartarBorradorAction: vi.fn(),
}));
vi.mock("@/app/actions/documentos", () => acciones);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const { AnexoDeContinuacion, ContinuacionDeLaSeccion, DialogoDeAnexo } = await import("./anexo-de-continuacion");
const { EditorDeDocumento } = await import("./editor-de-documento");

function asiento(numero: number, texto: string, autorNombre = "Lucía Gómez"): AsientoDeDocumento {
  return { numero, texto, autorUserId: "user-1", autorNombre, creadoEn: `2026-10-05T1${numero}:00:00-03:00` };
}

function anexo(extra: Partial<DocumentoDetalle> = {}): DocumentoDetalle {
  return {
    id: "c1",
    plantillaId: "anexo-de-continuacion",
    plantillaVersion: 1,
    plantillaNombre: "Anexo de continuación",
    tipo: "anexo",
    estado: "abierto",
    folioMostrado: "3.2",
    anexoNumero: 2,
    continuacion: { seccion: "plan", numero: 2 },
    asientos: [],
    ...extra,
  } as unknown as DocumentoDetalle;
}

const sinBorrador = () => ({ texto: "", onTexto: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  acciones.leerDocumentoAction.mockResolvedValue({ ok: true, documento: anexo() });
});

/** El diálogo con el texto en un estado propio, como lo tiene la sección. */
function DialogoConTexto({ inicial }: { inicial?: DocumentoDetalle }) {
  const [texto, setTexto] = useState("");
  return <DialogoDeAnexo anexoId="c1" inicial={inicial} borrador={{ texto, onTexto: setTexto }} onCerrar={() => {}} />;
}

describe("DialogoDeAnexo", () => {
  it("muestra las anotaciones en orden, con su número y su registro digital, y el nombre y el folio x.y del anexo", () => {
    render(
      <DialogoDeAnexo
        anexoId="c1"
        inicial={anexo({ asientos: [asiento(1, "Primer control."), asiento(2, "Segundo control.", "Pedro Díaz")] })}
        borrador={sinBorrador()}
        onCerrar={() => {}}
      />,
    );
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText("Anexo Nº 2 · Plan de tratamiento")).toBeInTheDocument();
    expect(within(dialogo).getByText(/Folio 3\.2 · cada anotación queda fija/)).toBeInTheDocument();
    const items = within(dialogo).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Anotación 1"),
      expect.stringContaining("Anotación 2"),
    ]);
    expect(items[0]).toHaveTextContent("Primer control.");
    // En el lugar de la firma, el registro digital: quién, el día y la hora.
    expect(items[1]).toHaveTextContent(/Registrado digitalmente por Pedro Díaz · .*05\/10\/2026/);
    expect(within(dialogo).queryByRole("img", { name: /Firma de/ })).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("link", { name: /pantalla completa/ })).toHaveAttribute("href", "/panel/documentos/c1");
  });

  it("sin asientos lo dice, y sin el anexo inicial lo pide", async () => {
    render(<DialogoDeAnexo anexoId="c1" borrador={sinBorrador()} onCerrar={() => {}} />);
    expect(screen.getByText("Cargando el anexo…")).toBeInTheDocument();
    expect(await screen.findByText("Sin anotaciones todavía.")).toBeInTheDocument();
    expect(acciones.leerDocumentoAction).toHaveBeenCalledWith("c1");
  });

  it("si no lo puede leer, dice por qué", async () => {
    acciones.leerDocumentoAction.mockResolvedValue({ ok: false, error: "documento no encontrado" });
    render(<DialogoDeAnexo anexoId="c1" borrador={sinBorrador()} onCerrar={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("documento no encontrado");
    expect(screen.queryByText("Cargando el anexo…")).not.toBeInTheDocument();
  });

  it("con la historia sin folio, el anexo dice su número", () => {
    render(<DialogoDeAnexo anexoId="c1" inicial={anexo({ folioMostrado: "Anexo Nº 2" })} borrador={sinBorrador()} onCerrar={() => {}} />);
    expect(screen.getByText("Anexo Nº 2 · cada anotación queda fija una vez guardada")).toBeInTheDocument();
  });

  it("un anexo que no está abierto no ofrece una anotación nueva", () => {
    render(<DialogoDeAnexo anexoId="c1" inicial={anexo({ estado: "anulado" })} borrador={sinBorrador()} onCerrar={() => {}} />);
    expect(screen.queryByRole("textbox", { name: /Texto/ })).not.toBeInTheDocument();
  });
});

describe("la anotación nueva", () => {
  it("guardar se habilita con texto, sin firma dibujada", () => {
    render(<DialogoConTexto inicial={anexo()} />);
    expect(screen.getByRole("heading", { name: "Agregar anotación" })).toBeInTheDocument();
    expect(screen.queryByText("Tu firma")).not.toBeInTheDocument();
    const guardar = () => screen.getByRole("button", { name: "Guardar anotación" });
    expect(guardar()).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /Texto/ }), { target: { value: "Control." } });
    expect(guardar()).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox", { name: /Texto/ }), { target: { value: "   " } });
    expect(guardar()).toBeDisabled();
    expect(screen.getByText("3 de 4000")).toBeInTheDocument();
  });

  it("confirma en línea, y cancelar vuelve sin guardar", () => {
    render(<DialogoConTexto inicial={anexo()} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Texto/ }), { target: { value: "Control." } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar anotación" }));

    const confirmar = screen.getByRole("group", { name: "Confirmar la anotación" });
    expect(confirmar).toHaveTextContent("La anotación queda registrada a tu nombre y no se puede modificar ni borrar después. ¿La guardás?");
    expect(within(confirmar).getByRole("button", { name: "Cancelar" })).toHaveFocus();
    // Sigue en el mismo diálogo: no abre otro encima.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    fireEvent.click(within(confirmar).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group", { name: "Confirmar la anotación" })).not.toBeInTheDocument();
    expect(acciones.sumarAsientoAction).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: /Texto/ })).toHaveValue("Control.");
  });

  it("mientras guarda dice Guardando…, y después muestra la anotación y limpia el formulario", async () => {
    let resolver: (v: unknown) => void = () => {};
    acciones.sumarAsientoAction.mockReturnValue(new Promise((r) => (resolver = r)));
    render(<DialogoConTexto inicial={anexo()} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Texto/ }), { target: { value: "  Control a los siete días.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar anotación" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirmar la anotación" })).getByRole("button", { name: "Guardar anotación" }));

    expect(await screen.findByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: /Texto/ })).toBeDisabled();
    expect(acciones.sumarAsientoAction).toHaveBeenCalledWith("c1", "Control a los siete días.");

    await act(async () => resolver({ ok: true, documento: anexo({ asientos: [asiento(1, "Control a los siete días.")] }) }));
    expect(screen.getByRole("listitem")).toHaveTextContent("Control a los siete días.");
    expect(screen.getByRole("textbox", { name: /Texto/ })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Guardar anotación" })).toBeDisabled();
  });

  it("si la API lo rechaza, muestra el error y conserva lo escrito", async () => {
    acciones.sumarAsientoAction.mockResolvedValue({ ok: false, error: "no se pudo guardar la anotación" });
    render(<DialogoConTexto inicial={anexo()} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Texto/ }), { target: { value: "Control." } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar anotación" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirmar la anotación" })).getByRole("button", { name: "Guardar anotación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no se pudo guardar la anotación");
    expect(screen.getByRole("textbox", { name: /Texto/ })).toHaveValue("Control.");
    expect(screen.getByRole("button", { name: "Guardar anotación" })).toBeEnabled();
    expect(screen.queryByRole("group", { name: "Confirmar la anotación" })).not.toBeInTheDocument();
  });
});

describe("AnexoDeContinuacion, en su página", () => {
  it("lista sus anotaciones y suma una nueva sin recargar", async () => {
    acciones.sumarAsientoAction.mockResolvedValue({
      ok: true,
      documento: anexo({ asientos: [asiento(1, "Primero."), asiento(2, "Segundo.")] }),
    });
    render(<AnexoDeContinuacion documento={anexo({ asientos: [asiento(1, "Primero.")] })} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(screen.getByRole("textbox", { name: /Texto/ }), { target: { value: "Segundo." } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar anotación" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirmar la anotación" })).getByRole("button", { name: "Guardar anotación" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
  });
});

describe("ContinuacionDeLaSeccion", () => {
  it("crear dice Creando el anexo…, y si falla, por qué", async () => {
    let resolver: (v: unknown) => void = () => {};
    acciones.crearContinuacionAction.mockReturnValue(new Promise((r) => (resolver = r)));
    render(<ContinuacionDeLaSeccion historiaId="h1" seccion="plan" />);
    fireEvent.click(screen.getByRole("button", { name: "Crear anexo" }));
    expect(screen.getByRole("button", { name: "Creando el anexo…" })).toBeDisabled();
    expect(acciones.crearContinuacionAction).toHaveBeenCalledWith("h1", "plan");
    await act(async () => resolver({ ok: false, error: "esta sección ya tiene su anexo de continuación" }));
    expect(screen.getByRole("alert")).toHaveTextContent("esta sección ya tiene su anexo de continuación");
    expect(screen.getByRole("button", { name: "Crear anexo" })).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lo creado se abre enseguida, sin volver a pedirlo, y avisa a quien lo usa", async () => {
    const onCreado = vi.fn();
    acciones.crearContinuacionAction.mockResolvedValue({ ok: true, documento: anexo() });
    render(<ContinuacionDeLaSeccion historiaId="h1" seccion="plan" onCreado={onCreado} />);
    fireEvent.click(screen.getByRole("button", { name: "Crear anexo" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Anexo Nº 2 · Plan de tratamiento");
    expect(onCreado).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
    expect(acciones.leerDocumentoAction).not.toHaveBeenCalled();
  });
});

// Una historia que continúa su diagnóstico (número) y su plan (texto).
const historiaContinuable: Plantilla = plantillaSchema.parse({
  id: "historia-continuable",
  version: 1,
  nombre: "Historia continuable",
  tipo: "historia_clinica",
  descripcion: "Historia de prueba con continuaciones.",
  fuente: { nombre: "Tests", url: "https://example.com" },
  secciones: [
    {
      id: "diagnostico",
      titulo: "Diagnóstico",
      campos: [
        { tipo: "texto_largo", id: "diagnostico", etiqueta: "Diagnóstico" },
        { tipo: "numero", id: "diagnostico_anexo", etiqueta: "Continúa en anexo Nº", continuaEnAnexo: "diagnostico" },
        { tipo: "texto", id: "plan_anexo", etiqueta: "Plan: continúa en anexo Nº", continuaEnAnexo: "plan" },
      ],
    },
  ],
  cuerpo: [{ t: "titulo", texto: "Historia" }, { t: "parrafo", texto: "{{diagnostico}} {{diagnostico_anexo}} {{plan_anexo}}" }, { t: "firmas" }],
  firmas: [{ rol: "profesional", etiqueta: "Firma", requerida: true }],
});

function historia(extra: Partial<DocumentoDetalle> = {}): DocumentoDetalle {
  return { ...borrador(), plantillaId: historiaContinuable.id, tipo: "historia_clinica", ...extra } as DocumentoDetalle;
}

describe("el Continúa en anexo Nº del editor", () => {
  it("sin anexo, el campo se edita y ofrece crearlo; creado, lleva su número y queda de solo lectura", async () => {
    acciones.crearContinuacionAction.mockResolvedValue({
      ok: true,
      documento: anexo({ id: "c9", continuacion: { seccion: "diagnostico", numero: 3 } }),
    });
    render(<EditorDeDocumento documento={historia()} plantilla={historiaContinuable} />);
    const numero = screen.getByRole("spinbutton", { name: /Continúa en anexo Nº/ });
    expect(numero).toBeEnabled();
    expect(screen.queryByText(/Lo numera el anexo/)).not.toBeInTheDocument();

    const crear = screen.getAllByRole("button", { name: "Crear anexo" });
    expect(crear).toHaveLength(2);
    fireEvent.click(crear[0]);
    await screen.findByRole("dialog");
    expect(acciones.crearContinuacionAction).toHaveBeenCalledWith("doc-1", "diagnostico");
    expect(numero).toHaveValue(3);
    expect(numero).toBeDisabled();
    expect(screen.getByText(/Lo numera el anexo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anexo Nº 3" })).toBeInTheDocument();
  });

  it("con anexos que ya existen, cada campo muestra el suyo (un campo de texto, como texto)", () => {
    const vinculo = (id: string, seccion: string, numero: number) => ({
      id,
      plantillaId: "anexo-de-continuacion",
      plantillaNombre: "Anexo de continuación",
      tipo: "anexo",
      estado: "abierto",
      folio: numero + 1,
      fecha: "2026-10-05T10:00:00-03:00",
      continuacion: { seccion, numero },
    });
    render(
      <EditorDeDocumento
        documento={historia({ anexos: [vinculo("c1", "diagnostico", 1), vinculo("c2", "plan", 2)] } as unknown as Partial<DocumentoDetalle>)}
        plantilla={historiaContinuable}
      />,
    );
    expect(screen.getByRole("spinbutton", { name: /Continúa en anexo Nº/ })).toHaveValue(1);
    const texto = screen.getByRole("textbox", { name: /Plan: continúa en anexo Nº/ });
    expect(texto).toHaveValue("2");
    expect(texto).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anexo Nº 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anexo Nº 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear anexo" })).not.toBeInTheDocument();
  });

  it("con la historia ya foliada, el botón de la sección dice el folio x.y", () => {
    render(
      <ContinuacionDeLaSeccion historiaId="h1" seccion="plan" anexo={{ id: "c1", numero: 1, folioMostrado: "3.1" }} />,
    );
    expect(screen.getByRole("button", { name: "Anexo Nº 1 · Folio 3.1" })).toBeInTheDocument();
  });
});
