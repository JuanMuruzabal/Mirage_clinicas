import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { anexoDePrueba, sellado } from "./fixtures";

// El paso de un anexo después del paciente (5.6b, ronda A): a qué historia
// clínica pertenece, o crear la General si no tiene ninguna.

const acciones = vi.hoisted(() => ({
  crearDocumentoAction: vi.fn(),
  crearAnexoConHistoriaGeneralAction: vi.fn(),
  historiasDelPacienteAction: vi.fn(),
}));
vi.mock("@/app/actions/documentos", () => acciones);
const pacientes = vi.hoisted(() => ({ listPacientesAction: vi.fn() }));
vi.mock("@/app/actions/pacientes", () => pacientes);

const { ElegirHistoria } = await import("./elegir-historia");
const { ElegirPaciente } = await import("./elegir-paciente");
const { ModuloDocumentos } = await import("./modulo-documentos");

beforeEach(() => vi.clearAllMocks());

const ANEXO = anexoDePrueba.id;
const paciente = { id: "pac-1", nombre: "Ana", apellido: "Paz" };

const historia = (extra: Partial<DocumentoResumen>): DocumentoResumen => ({
  ...sellado(),
  tipo: "historia_clinica",
  plantillaId: "historia-clinica-general",
  plantillaNombre: "Historia clínica general",
  ...extra,
});

const historias = [
  historia({ id: "h-borrador", estado: "borrador", folio: undefined, selladoEn: undefined, terminadoEn: undefined, actualizadoEn: "2026-10-01T09:15:00-03:00" }),
  historia({ id: "h-sellada", folio: 7, autorNombre: "Pedro Díaz", selladoEn: "2026-09-20T16:40:00-03:00" }),
];

function renderElegir(lista = historias) {
  const onCerrar = vi.fn();
  render(<ElegirHistoria plantillaId={ANEXO} plantillaNombre="Anexo de prueba" paciente={paciente} historias={lista} onCerrar={onCerrar} />);
  return onCerrar;
}

describe("ElegirHistoria", () => {
  it("lista las historias con su fecha, su autor, su folio y su estado; elegir una crea el anexo colgado de ella", async () => {
    acciones.crearDocumentoAction.mockReturnValue(new Promise(() => {}));
    renderElegir();
    const dialogo = screen.getByRole("dialog", { name: "¿A qué historia clínica pertenece?" });
    expect(dialogo).toHaveTextContent("Anexo de prueba · Ana Paz");

    const opciones = within(dialogo).getAllByRole("button", { name: /Historia clínica general/ });
    expect(opciones).toHaveLength(2);
    expect(opciones[0]).toHaveTextContent("01/10/2026 · 09:15");
    expect(opciones[0]).toHaveTextContent("Borrador");
    expect(opciones[0]).not.toHaveTextContent("folio");
    expect(opciones[1]).toHaveTextContent("20/09/2026 · 16:40 · Pedro Díaz · folio 7");
    expect(opciones[1]).toHaveTextContent("Completado");

    await act(async () => {
      fireEvent.click(opciones[1]);
    });
    expect(acciones.crearDocumentoAction).toHaveBeenCalledWith(ANEXO, "pac-1", "h-sellada");
    // Mientras se crea: lo dice y no deja elegir de nuevo.
    expect(screen.getByText("Creando el anexo…")).toBeInTheDocument();
    for (const b of within(dialogo).getAllByRole("button", { name: /Historia clínica general/ })) expect(b).toBeDisabled();
    fireEvent.click(opciones[0]);
    expect(acciones.crearDocumentoAction).toHaveBeenCalledTimes(1);
  });

  it("si crear falla, lo dice arriba y deja volver a elegir", async () => {
    acciones.crearDocumentoAction.mockResolvedValue({ error: "ya tenés un borrador de este anexo para otra historia clínica" });
    renderElegir();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /Historia clínica general/ })[0]);
    });
    expect(acciones.crearDocumentoAction).toHaveBeenCalledWith(ANEXO, "pac-1", "h-borrador");
    expect(screen.getByRole("alert")).toHaveTextContent("ya tenés un borrador de este anexo para otra historia clínica");
    expect(screen.queryByText("Creando el anexo…")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Historia clínica general/ })[0]).toBeEnabled();
  });

  it("sin ninguna historia, ofrece crear la General y colgarle el anexo", async () => {
    acciones.crearAnexoConHistoriaGeneralAction.mockResolvedValue({ error: "completá tu perfil profesional" });
    renderElegir([]);
    expect(screen.getByText("Este paciente todavía no tiene historia clínica.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Crear la Historia Clínica General" }));
    });
    expect(acciones.crearAnexoConHistoriaGeneralAction).toHaveBeenCalledWith(ANEXO, "pac-1");
    expect(acciones.crearDocumentoAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("completá tu perfil profesional");
  });

  it("mientras crea la General, el botón queda deshabilitado", async () => {
    acciones.crearAnexoConHistoriaGeneralAction.mockReturnValue(new Promise(() => {}));
    renderElegir([]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Crear la Historia Clínica General" }));
    });
    expect(screen.getByText("Creando el anexo…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear la Historia Clínica General" })).toBeDisabled();
  });

  it("cerrar avisa", () => {
    const onCerrar = renderElegir();
    fireEvent.click(screen.getByRole("button", { name: /Cerrar/ }));
    expect(onCerrar).toHaveBeenCalled();
  });
});

describe("ElegirPaciente para un anexo", () => {
  beforeEach(() => {
    pacientes.listPacientesAction.mockResolvedValue([{ id: "pac-1", nombre: "Ana", apellido: "Paz", dni: "30111222", telefono: "", email: "", esMio: true }]);
  });

  it("elegir el paciente busca sus historias y pasa al paso de la historia, sin crear nada", async () => {
    acciones.historiasDelPacienteAction.mockResolvedValue({ ok: true, historias });
    render(<ElegirPaciente plantillaId={ANEXO} plantillaNombre="Anexo de prueba" esAnexo onCerrar={vi.fn()} />);
    const ana = await screen.findByRole("button", { name: /Ana Paz/ });
    await act(async () => {
      fireEvent.click(ana);
    });
    expect(acciones.historiasDelPacienteAction).toHaveBeenCalledWith("pac-1");
    expect(acciones.crearDocumentoAction).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "¿A qué historia clínica pertenece?" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Historia clínica general/ })).toHaveLength(2);
  });

  it("mientras busca lo dice; si falla, lo dice y se queda en el paciente", async () => {
    let responder: (v: unknown) => void = () => {};
    acciones.historiasDelPacienteAction.mockReturnValue(new Promise((r) => (responder = r)));
    render(<ElegirPaciente plantillaId={ANEXO} plantillaNombre="Anexo de prueba" esAnexo onCerrar={vi.fn()} />);
    const ana = await screen.findByRole("button", { name: /Ana Paz/ });
    await act(async () => {
      fireEvent.click(ana);
    });
    expect(screen.getByText("Buscando sus historias clínicas…")).toBeInTheDocument();
    await act(async () => responder({ ok: false, error: "paciente no encontrado" }));
    expect(screen.getByRole("alert")).toHaveTextContent("paciente no encontrado");
    expect(screen.getByRole("dialog", { name: "¿Para qué paciente?" })).toBeInTheDocument();
  });
});

describe("ModuloDocumentos con un anexo", () => {
  const anexo = anexoDePrueba;

  it("desde la ficha, completar busca las historias del paciente y abre el paso de la historia", async () => {
    acciones.historiasDelPacienteAction.mockResolvedValue({ ok: true, historias: [] });
    render(<ModuloDocumentos plantillas={[anexo]} hoy="2026-10-05" paciente={paciente} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Completar para Ana Paz" }));
    });
    expect(acciones.historiasDelPacienteAction).toHaveBeenCalledWith("pac-1");
    expect(acciones.crearDocumentoAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Crear la Historia Clínica General" })).toBeInTheDocument();

    // Cerrarlo vuelve al módulo.
    fireEvent.click(screen.getByRole("button", { name: /Cerrar/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si no se pueden traer las historias, lo dice", async () => {
    acciones.historiasDelPacienteAction.mockResolvedValue({ ok: false, error: "no se pudieron obtener las historias clínicas" });
    render(<ModuloDocumentos plantillas={[anexo]} hoy="2026-10-05" paciente={paciente} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Completar para Ana Paz" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("no se pudieron obtener las historias clínicas");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin paciente, el buscador pregunta para quién y después la historia", async () => {
    pacientes.listPacientesAction.mockResolvedValue([{ id: "pac-1", nombre: "Ana", apellido: "Paz", dni: "30111222", telefono: "", email: "", esMio: true }]);
    acciones.historiasDelPacienteAction.mockResolvedValue({ ok: true, historias });
    render(<ModuloDocumentos plantillas={[anexo]} hoy="2026-10-05" />);
    fireEvent.click(screen.getByRole("button", { name: "Completar este documento" }));
    const ana = await screen.findByRole("button", { name: /Ana Paz/ });
    await act(async () => {
      fireEvent.click(ana);
    });
    expect(screen.getByRole("dialog", { name: "¿A qué historia clínica pertenece?" })).toBeInTheDocument();
  });
});
