import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { conducto, todoTipo } from "./fixtures";

const acciones = vi.hoisted(() => ({ crearDocumentoAction: vi.fn() }));
vi.mock("@/app/actions/documentos", () => acciones);
const pacientes = vi.hoisted(() => ({ listPacientesAction: vi.fn() }));
vi.mock("@/app/actions/pacientes", () => pacientes);

const { ModuloDocumentos } = await import("./modulo-documentos");

beforeEach(() => vi.clearAllMocks());

const plantillas = [conducto, todoTipo];

describe("ModuloDocumentos", () => {
  it("las flechas recorren los documentos como una rueda, y la vista acompaña", () => {
    render(<ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" />);
    expect(screen.getByText("1 de 2")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Vista de Tratamiento de conducto" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Documento siguiente" }));
    expect(screen.getByText("2 de 2")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Vista de Prueba de campos" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Documento siguiente" }));
    expect(screen.getByText("1 de 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Documento anterior" }));
    expect(screen.getByText("2 de 2")).toBeInTheDocument();
  });

  it("tocar el carrusel despliega los documentos, separados en consentimientos, historias clínicas y el resto", () => {
    const anexo = { ...todoTipo, id: "prueba-anexo", nombre: "Registro de prueba", tipo: "anexo" as const };
    render(<ModuloDocumentos plantillas={[todoTipo, anexo, conducto]} hoy="2026-09-27" />);
    // El orden del menú manda también en las flechas: primero el consentimiento.
    expect(screen.getByText("1 de 3")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Elegir documento: Tratamiento de conducto" }));
    const grupos = screen.getAllByRole("group");
    expect(grupos.map((g) => g.getAttribute("aria-label"))).toEqual(["Consentimientos informados", "Historias clínicas", "Anexos y otros"]);
    expect(screen.getByRole("button", { name: "Tratamiento de conducto" })).toHaveAttribute("aria-current", "true");

    fireEvent.click(screen.getByRole("button", { name: "Registro de prueba" }));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getByText("3 de 3")).toBeInTheDocument();

    // Escape y un click afuera lo cierran.
    fireEvent.click(screen.getByRole("button", { name: "Elegir documento: Registro de prueba" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Elegir documento: Registro de prueba" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("la plantilla de entrada se puede elegir, el original del Colegio se ve tal cual, y la web del Colegio se abre aparte", () => {
    render(<ModuloDocumentos plantillas={plantillas} plantillaInicial="consentimiento-tratamiento-conducto" hoy="2026-09-27" />);
    const original = screen.getByRole("img", { name: "Tratamiento de conducto: modelo original del Colegio" });
    expect(original).toHaveAttribute("src", "/documentos-clinicos/originales/consentimiento-tratamiento-conducto/v1/pagina-1.w1600.webp");
    expect(original.getAttribute("srcset")).toContain("pagina-1.w800.webp 800w");
    expect(screen.getByRole("link", { name: "Web del Colegio ↗" })).toHaveAttribute("href", conducto.fuente.url);
    // Sin textos de relleno: ni la bajada del módulo ni la descripción del documento.
    expect(screen.queryByText(conducto.descripcion)).not.toBeInTheDocument();
  });

  it("en el celular, el modelo se abre a pantalla completa, y se puede acercar", async () => {
    render(<ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Ver en pantalla completa" }));
    const capa = await screen.findByRole("dialog", { name: "Tratamiento de conducto" });
    expect(capa.querySelector("img")).toHaveAttribute("alt", "Tratamiento de conducto: modelo original del Colegio");
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Acercar" }));
    expect(screen.getByRole("button", { name: "Alejar" })).toHaveAttribute("aria-pressed", "true");
    // El foco no se sale de la capa.
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Alejar" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("una plantilla sin original renderizado muestra el calco vacío", () => {
    render(<ModuloDocumentos plantillas={plantillas} plantillaInicial="prueba-todo-tipo" hoy="2026-09-27" />);
    expect(screen.getByText("2 de 2")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /modelo original/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Prueba" })).toBeInTheDocument();
  });

  it("lo en curso va debajo de «Completar este documento», y lo de abajo al fondo, después del modelo", () => {
    render(
      <ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" enCurso={<p>En curso de prueba</p>} abajo={<p>Tabla de prueba</p>} />,
    );
    const vista = screen.getByRole("region", { name: "Vista de Tratamiento de conducto" });
    const completar = screen.getByRole("button", { name: "Completar este documento" });
    const enCurso = screen.getByText("En curso de prueba");
    const tabla = screen.getByText("Tabla de prueba");
    expect(completar.compareDocumentPosition(enCurso) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(enCurso.compareDocumentPosition(vista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(vista.compareDocumentPosition(tabla) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("completar pide el paciente con el buscador de «Paciente conocido», y elegirlo crea el documento", async () => {
    pacientes.listPacientesAction.mockResolvedValue([
      { id: "pac-1", nombre: "Ana", apellido: "Paz", dni: "30111222", telefono: "", email: "", esMio: true },
      { id: "pac-2", nombre: "Juan", apellido: "Sosa", dni: "35111222", telefono: "", email: "", esMio: false },
    ]);
    acciones.crearDocumentoAction.mockResolvedValue({ error: "completá tu perfil profesional antes de hacer un documento" });
    render(<ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Completar este documento" }));
    expect(await screen.findByRole("dialog", { name: "¿Para qué paciente?" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Ana Paz/ })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar paciente" }), { target: { value: "Juan" } });
    expect(screen.queryByRole("button", { name: /Ana Paz/ })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Juan Sosa/ }));
    });
    expect(acciones.crearDocumentoAction).toHaveBeenCalledWith("consentimiento-tratamiento-conducto", "pac-2");
    expect(screen.getByRole("alert")).toHaveTextContent("completá tu perfil profesional");
  });

  it("una búsqueda sin resultados lo dice", async () => {
    pacientes.listPacientesAction.mockResolvedValue([]);
    render(<ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Completar este documento" }));
    expect(await screen.findByText("No encontramos pacientes para esa búsqueda.")).toBeInTheDocument();
  });

  it("desde la ficha, el documento ya es para ese paciente", async () => {
    acciones.crearDocumentoAction.mockResolvedValue({ error: "este paciente tiene un conflicto de identidad sin resolver" });
    render(<ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" paciente={{ id: "pac-1", nombre: "Ana", apellido: "Paz" }} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Completar para Ana Paz" }));
    });
    expect(acciones.crearDocumentoAction).toHaveBeenCalledWith("consentimiento-tratamiento-conducto", "pac-1");
    expect(screen.getByRole("alert")).toHaveTextContent("conflicto de identidad");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
