import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { borrador, conducto, todoTipo } from "./fixtures";

// Las secciones del editor se despliegan con una animación (grid-rows
// 0fr→1fr) y quedan montadas pero inertes al cerrarse; ir a un campo desde
// la hoja enfoca enseguida y scrollea cuando la sección terminó de abrirse.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/actions/documentos", () => ({
  guardarBorradorAction: vi.fn(),
  terminarDocumentoAction: vi.fn(),
  descartarBorradorAction: vi.fn(),
}));

const { EditorDeDocumento } = await import("./editor-de-documento");

const scrollIntoView = vi.fn();
const getComputedStyleReal = window.getComputedStyle.bind(window);

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** El cuerpo de una sección: el elemento que su botón controla. */
function cuerpoDe(boton: HTMLElement): HTMLElement {
  const id = boton.getAttribute("aria-controls");
  expect(id).toBeTruthy();
  const cuerpo = document.getElementById(id as string);
  expect(cuerpo).not.toBeNull();
  return cuerpo as HTMLElement;
}

/** Simula lo que jsdom no calcula: el cuerpo de cada sección con una
 *  transición de 300 ms, y su interior todavía a medio desplegar (más alto
 *  de lo que muestra). */
function simularAnimacion({ desplegandose = true }: { desplegandose?: boolean } = {}) {
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
    const estilo = getComputedStyleReal(el, pseudo);
    if (el.id.includes("-seccion-")) Object.defineProperty(estilo, "transitionDuration", { value: "0.3s", configurable: true });
    return estilo;
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(500);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(desplegandose ? 0 : 500);
}

function finDeTransicion(el: HTMLElement, propiedad: string) {
  const evento = new Event("transitionend", { bubbles: true });
  Object.defineProperty(evento, "propertyName", { value: propiedad });
  act(() => {
    el.dispatchEvent(evento);
  });
}

async function tocar(nombre: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nombre }));
  });
}

describe("EditorDeDocumento: los rótulos de terminar", () => {
  it("un consentimiento dice «Terminar documento» y queda listo para imprimir o descargar", async () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={conducto} />);
    expect(screen.getByRole("button", { name: "Terminar documento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Terminar para imprimir" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Al terminar, queda listo para imprimir o descargar —se firma a mano, en papel— y ya no se puede editar."),
    ).toBeInTheDocument();
  });

  it("una historia clínica sigue diciendo «Terminar y pasar a firmas», con su ayuda y su diálogo", async () => {
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    expect(screen.getByRole("button", { name: "Terminar y pasar a firmas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Terminar documento" })).not.toBeInTheDocument();
    expect(screen.getByText("Al terminar, el texto del documento queda fijo y pasa a firmas: ya no se puede editar.")).toBeInTheDocument();
    expect(screen.queryByText(/imprimir o descargar/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Terminar y pasar a firmas" }));
    const dialogo = await screen.findByRole("dialog", { name: "¿Terminar el documento?" });
    expect(dialogo).toHaveTextContent("El texto queda fijo, pasa a firmas y ya no se puede editar.");
    expect(dialogo).not.toHaveTextContent(/imprimir/);
  });

  it("el diálogo de un consentimiento dice el texto completo nuevo", async () => {
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
    const dialogo = await screen.findByRole("dialog", { name: "¿Terminar el documento?" });
    expect(dialogo).toHaveTextContent(
      "Queda listo para imprimir o descargar y ya no se puede editar. Revisá que esté todo bien: si después hay que corregir algo, vas a tener que hacer otro.",
    );
  });
});

describe("EditorDeDocumento: las secciones se despliegan", () => {
  it("el botón dice si está abierta y controla su cuerpo; el cerrado es inerte y mide 0fr", () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    const datos = screen.getByRole("button", { name: /Datos/ });
    const clinica = screen.getByRole("button", { name: /Clínica/ });
    expect(datos).toHaveAttribute("aria-expanded", "true");
    expect(clinica).toHaveAttribute("aria-expanded", "false");

    const cuerpoDatos = cuerpoDe(datos);
    const cuerpoClinica = cuerpoDe(clinica);
    expect(cuerpoDatos).not.toBe(cuerpoClinica);
    // Abierta: 1fr y nada inerte.
    expect(cuerpoDatos).toHaveClass("grid", "grid-rows-[1fr]", "motion-safe:transition-[grid-template-rows]", "motion-safe:duration-300");
    expect(cuerpoDatos.querySelector("[inert]")).toBeNull();
    // Cerrada: 0fr y el interior inerte, pero los campos siguen montados.
    expect(cuerpoClinica).toHaveClass("grid-rows-[0fr]");
    expect(cuerpoClinica).not.toHaveClass("grid-rows-[1fr]");
    const interior = cuerpoClinica.firstElementChild as HTMLElement;
    expect(interior).toHaveAttribute("inert");
    expect(interior).toHaveClass("overflow-hidden");
    expect(cuerpoClinica).toContainElement(screen.getByRole("radiogroup", { name: "Higiene" }));
    // El borde y el padding van adentro del overflow-hidden.
    expect(interior.firstElementChild).toHaveClass("border-t", "px-4", "py-4");
    // El chevron gira con la sección abierta.
    expect(datos.querySelector("svg")).toHaveClass("rotate-180");
    expect(clinica.querySelector("svg")).not.toHaveClass("rotate-180");
  });

  it("abrir una sección cierra la otra", () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    const datos = screen.getByRole("button", { name: /Datos/ });
    const clinica = screen.getByRole("button", { name: /Clínica/ });
    fireEvent.click(clinica);
    expect(clinica).toHaveAttribute("aria-expanded", "true");
    expect(datos).toHaveAttribute("aria-expanded", "false");
    expect(cuerpoDe(clinica)).toHaveClass("grid-rows-[1fr]");
    expect(cuerpoDe(clinica).firstElementChild).not.toHaveAttribute("inert");
    expect(cuerpoDe(datos)).toHaveClass("grid-rows-[0fr]");
    expect(cuerpoDe(datos).firstElementChild).toHaveAttribute("inert");
    // Tocar la abierta la cierra: quedan las dos cerradas.
    fireEvent.click(clinica);
    expect(clinica).toHaveAttribute("aria-expanded", "false");
    expect(cuerpoDe(clinica).firstElementChild).toHaveAttribute("inert");
  });

  it("la columna de las secciones lleva la barra discreta y el canal reservado desde lg", () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    expect(screen.getByRole("complementary", { name: "Datos del documento" })).toHaveClass(
      "scrollbar-discreta",
      "lg:[scrollbar-gutter:stable]",
      "lg:overflow-y-auto",
    );
  });
});

describe("EditorDeDocumento: ir a un campo desde la hoja", () => {
  it("con la sección cerrada, el foco va enseguida y el scroll espera al fin de la transición", async () => {
    vi.useFakeTimers();
    simularAnimacion();
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    const clinica = screen.getByRole("button", { name: /Clínica/ });
    const cuerpo = cuerpoDe(clinica);

    await tocar("Completar: Higiene");
    expect(clinica).toHaveAttribute("aria-expanded", "true");
    expect(cuerpo.firstElementChild).not.toHaveAttribute("inert");
    expect(screen.getByRole("radiogroup", { name: "Higiene" })).toContainElement(document.activeElement as HTMLElement);
    expect(scrollIntoView).not.toHaveBeenCalled();

    // Una transición de otra propiedad, u otra que burbujea desde adentro, no.
    finDeTransicion(cuerpo, "opacity");
    finDeTransicion(cuerpo.firstElementChild as HTMLElement, "grid-template-rows");
    expect(scrollIntoView).not.toHaveBeenCalled();

    finDeTransicion(cuerpo, "grid-template-rows");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(scrollIntoView.mock.contexts[0]).toBe(document.activeElement);

    // El respaldo ya no scrollea otra vez.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("si el transitionend no llega, scrollea el respaldo (duración + 50 ms)", async () => {
    vi.useFakeTimers();
    simularAnimacion();
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    await tocar("Completar: Higiene");
    expect(scrollIntoView).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(349);
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // Un transitionend tardío no lo repite.
    finDeTransicion(cuerpoDe(screen.getByRole("button", { name: /Clínica/ })), "grid-template-rows");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("sin transición (reducir movimiento, o jsdom), scrollea enseguida", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(500);
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    await tocar("Completar: Higiene");
    expect(screen.getByRole("radiogroup", { name: "Higiene" })).toContainElement(document.activeElement as HTMLElement);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("si la sección ya estaba abierta (no se despliega), scrollea enseguida aunque haya transición", async () => {
    simularAnimacion({ desplegandose: false });
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={conducto} />);
    // Domicilio es de la primera sección, que arranca abierta.
    await tocar("Completar: Domicilio");
    expect(screen.getByRole("textbox", { name: /^Domicilio/ })).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("tocar dos veces el mismo dato lo repite", async () => {
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    await tocar("Completar: Higiene");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    (document.activeElement as HTMLElement).blur();
    await tocar("Completar: Higiene");
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("radiogroup", { name: "Higiene" })).toContainElement(document.activeElement as HTMLElement);
  });

  it("desmontar a mitad de la animación saca el listener y el respaldo", async () => {
    vi.useFakeTimers();
    simularAnimacion();
    const quitar = vi.spyOn(HTMLElement.prototype, "removeEventListener");
    const limpiarTimeout = vi.spyOn(window, "clearTimeout");
    const { unmount } = render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    const cuerpo = cuerpoDe(screen.getByRole("button", { name: /Clínica/ }));
    await tocar("Completar: Higiene");
    unmount();
    expect(quitar.mock.calls.some(([tipo], i) => tipo === "transitionend" && quitar.mock.contexts[i] === cuerpo)).toBe(true);
    expect(limpiarTimeout).toHaveBeenCalled();
    finDeTransicion(cuerpo, "grid-template-rows");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
