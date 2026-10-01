import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { plantillaPorId, type Plantilla } from "@dental-mirage/documentos-clinicos";
import { muestrasSiFaltan, MODELOS_PARA_LA_PILA, esMuestra } from "@/lib/documentos-de-muestra";
import { conducto, todoTipo } from "./fixtures";

const acciones = vi.hoisted(() => ({ crearDocumentoAction: vi.fn() }));
vi.mock("@/app/actions/documentos", () => acciones);
const pacientes = vi.hoisted(() => ({ listPacientesAction: vi.fn() }));
vi.mock("@/app/actions/pacientes", () => pacientes);

const { ModuloDocumentos } = await import("./modulo-documentos");

beforeEach(() => vi.clearAllMocks());

const plantillas = [conducto, todoTipo];

// jsdom no tiene AnimationEvent, y sin él React escucha la versión con
// prefijo del evento; se disparan las dos para no depender de eso.
function terminarAnimacion(el: Element) {
  fireEvent(el, new Event("animationend", { bubbles: true }));
  fireEvent(el, new Event("webkitAnimationEnd", { bubbles: true }));
}

describe("las hojas de muestra", () => {
  it("hacen falta hasta que haya tres modelos de verdad, y se reconocen", () => {
    expect(muestrasSiFaltan(1)).toHaveLength(3);
    expect(muestrasSiFaltan(MODELOS_PARA_LA_PILA - 1)).toHaveLength(3);
    expect(muestrasSiFaltan(MODELOS_PARA_LA_PILA)).toEqual([]);
    expect(esMuestra(muestrasSiFaltan(1)[0])).toBe(true);
    expect(esMuestra(conducto)).toBe(false);
  });
});

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

  it("sin el rótulo «Modelo» arriba de la hoja", () => {
    render(<ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" />);
    expect(screen.queryByText("Modelo")).not.toBeInTheDocument();
  });

  it("con varios documentos se apilan: el anterior y el siguiente asoman detrás, y cambiar baraja las hojas", () => {
    const tercero = { ...todoTipo, id: "prueba-tercero", nombre: "Tercero de prueba", tipo: "anexo" as const };
    render(<ModuloDocumentos plantillas={[conducto, todoTipo, tercero]} hoy="2026-09-27" />);
    const pila = screen.getByTestId("pila-de-modelos");
    // Detrás, a la izquierda el último (la rueda) y a la derecha el siguiente;
    // son decoración: fuera del árbol de accesibilidad.
    const izquierda = pila.querySelector(".pila-hoja--izquierda");
    const derecha = pila.querySelector(".pila-hoja--derecha");
    expect(izquierda).toHaveAttribute("aria-hidden", "true");
    expect(derecha).toHaveAttribute("aria-hidden", "true");
    expect(pila.querySelector(".pila-entra")).toBeNull();
    expect(pila.querySelector(".pila-sale")).toBeNull();

    // Siguiente: la nueva viene desde la derecha y la de antes va a la izquierda.
    fireEvent.click(screen.getByRole("button", { name: "Documento siguiente" }));
    expect(pila.querySelector(".pila-entra--derecha")).not.toBeNull();
    expect(pila.querySelector(".pila-sale--izquierda")).toHaveAttribute("aria-hidden", "true");
    expect(pila.querySelector(".pila-sale--izquierda img")).toHaveAttribute(
      "src",
      "/documentos-clinicos/originales/consentimiento-tratamiento-conducto/v1/pagina-1.w1600.webp",
    );
    expect(screen.getByRole("region", { name: "Vista de Prueba de campos" })).toBeInTheDocument();

    // Al terminar la animación de la hoja de adelante, la que se iba desaparece.
    terminarAnimacion(pila.querySelector(".pila-entra") as Element);
    expect(pila.querySelector(".pila-sale")).toBeNull();
    expect(pila.querySelector(".pila-entra")).toBeNull();

    // Anterior: al revés.
    fireEvent.click(screen.getByRole("button", { name: "Documento anterior" }));
    expect(pila.querySelector(".pila-entra--izquierda")).not.toBeNull();
    expect(pila.querySelector(".pila-sale--derecha")).not.toBeNull();
  });

  it("un salto con el menú a un documento que no asomaba entra y sale de lejos", () => {
    const mas = [conducto, todoTipo, ...[1, 2, 3].map((n) => ({ ...todoTipo, id: `prueba-${n}`, nombre: `Anexo ${n}`, tipo: "anexo" as const }))];
    render(<ModuloDocumentos plantillas={mas} hoy="2026-09-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Elegir documento: Tratamiento de conducto" }));
    fireEvent.click(screen.getByRole("button", { name: "Anexo 2" }));
    const pila = screen.getByTestId("pila-de-modelos");
    expect(pila.querySelector(".pila-entra--lejos")).not.toBeNull();
    expect(pila.querySelector(".pila-sale--lejos")).not.toBeNull();
  });

  it("con dos documentos asoma una sola hoja, y con uno no hay pila", () => {
    const { unmount } = render(<ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" />);
    const pila = screen.getByTestId("pila-de-modelos");
    expect(pila.querySelectorAll(".pila-hoja")).toHaveLength(1);
    // Con dos, las dos flechas llevan al mismo: la nueva viene de la derecha
    // y la de antes vuelve a la derecha.
    fireEvent.click(screen.getByRole("button", { name: "Documento anterior" }));
    expect(pila.querySelector(".pila-entra--derecha")).not.toBeNull();
    expect(pila.querySelector(".pila-sale--derecha")).not.toBeNull();
    // La que se va, sin original renderizado, es el calco que se veía.
    unmount();

    render(<ModuloDocumentos plantillas={[conducto]} hoy="2026-09-27" />);
    const sola = screen.getByTestId("pila-de-modelos");
    expect(sola.querySelectorAll(".pila-hoja")).toHaveLength(0);
    expect(sola).not.toHaveClass("px-[14%]");
    expect(sola.querySelector(".pila-flota")).toBeNull();
  });

  it("con pila, la hoja de adelante flota y se inclina hacia el mouse, no hacia el dedo", () => {
    render(<ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" />);
    const pila = screen.getByTestId("pila-de-modelos");
    expect(pila).toHaveClass("px-[14%]");
    expect(pila.querySelector(".pila-frente .pila-flota .pila-inclina")).not.toBeNull();
    const hoja = pila.querySelector(".pila-inclina") as HTMLElement;
    hoja.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 260, right: 200, bottom: 260, x: 0, y: 0, toJSON: () => ({}) });

    // Con el dedo no: arrastrar es hacer scroll.
    fireEvent.pointerMove(hoja, { pointerType: "touch", clientX: 200, clientY: 0 });
    expect(hoja.dataset.inclinada).toBeUndefined();

    // Arriba a la derecha: gira hacia la derecha y hacia arriba, con la sombra del otro lado.
    fireEvent.pointerMove(hoja, { pointerType: "mouse", clientX: 200, clientY: 0 });
    expect(hoja.dataset.inclinada).toBe("true");
    expect(hoja.style.getPropertyValue("--pila-ry")).toBe("6.00deg");
    expect(hoja.style.getPropertyValue("--pila-rx")).toBe("4.50deg");
    expect(hoja.style.getPropertyValue("--pila-sombra-x")).toBe("-9.0px");

    fireEvent.pointerLeave(hoja);
    expect(hoja.dataset.inclinada).toBeUndefined();
    expect(hoja.style.getPropertyValue("--pila-ry")).toBe("");
  });

  // Pedido del cliente (2026-09-29): sedoanalgesia, de cuatro páginas, se
  // movía brusco. El vaivén y la inclinación se dividen por las páginas.
  it("una hoja de varias páginas se mueve menos: la amplitud es 1 sobre sus páginas", () => {
    const sedoanalgesia = plantillaPorId("consentimiento-sedoanalgesia") as Plantilla;
    render(<ModuloDocumentos plantillas={[conducto, sedoanalgesia]} hoy="2026-09-27" />);
    const pila = screen.getByTestId("pila-de-modelos");
    expect((pila.querySelector(".pila-frente") as HTMLElement).style.getPropertyValue("--pila-amplitud")).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Documento siguiente" }));
    const frente = pila.querySelector(".pila-frente") as HTMLElement;
    expect(frente.style.getPropertyValue("--pila-amplitud")).toBe("0.25");
    const hoja = pila.querySelector(".pila-inclina") as HTMLElement;
    hoja.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 1040, right: 200, bottom: 1040, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(hoja, { pointerType: "mouse", clientX: 200, clientY: 260 });
    // Hacia adelante y atrás, un cuarto; de costado, igual que en una página.
    expect(hoja.style.getPropertyValue("--pila-rx")).toBe("0.56deg");
    expect(hoja.style.getPropertyValue("--pila-ry")).toBe("6.00deg");
  });

  it("las hojas de muestra completan la pila: se recorren, van en su grupo, y no se completan", () => {
    render(<ModuloDocumentos plantillas={[conducto]} muestras={muestrasSiFaltan(1)} hoy="2026-09-27" />);
    expect(screen.getByText("1 de 4")).toBeInTheDocument();
    const pila = screen.getByTestId("pila-de-modelos");
    expect(pila.querySelectorAll(".pila-hoja")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Documento siguiente" }));
    expect(screen.getByText("2 de 4")).toBeInTheDocument();
    expect(screen.getByText("Hoja de muestra")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Modelo de muestra 1: hoja de muestra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Completar este documento" })).toBeDisabled();
    expect(screen.getByText(/no se puede completar/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Web del Colegio ↗" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Completar este documento" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Elegir documento: Modelo de muestra 1" }));
    expect(screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["Consentimientos informados", "Hojas de muestra"]);
  });

  it("a pantalla completa, una hoja de muestra se ve igual", async () => {
    render(<ModuloDocumentos plantillas={[conducto]} muestras={muestrasSiFaltan(1)} hoy="2026-09-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Documento siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver en pantalla completa" }));
    const capa = await screen.findByRole("dialog", { name: "Modelo de muestra 1" });
    expect(capa.querySelector("[aria-label='Modelo de muestra 1: hoja de muestra']")).not.toBeNull();
  });

  it("la hoja que se va conserva el calco si el documento no tiene original", () => {
    render(<ModuloDocumentos plantillas={plantillas} plantillaInicial="prueba-todo-tipo" hoy="2026-09-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Documento siguiente" }));
    const sale = screen.getByTestId("pila-de-modelos").querySelector(".pila-sale");
    expect(sale?.querySelector("img")).toBeNull();
    expect(sale?.textContent).toContain("Prueba");
    // Y la hoja de atrás de un documento sin original es una hoja en blanco.
    expect(screen.getByTestId("pila-de-modelos").querySelector(".pila-hoja--derecha img")).toBeNull();
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
