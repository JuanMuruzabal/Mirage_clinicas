import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { crearEnlaceTurnoActionMock } = vi.hoisted(() => ({
  crearEnlaceTurnoActionMock: vi.fn(),
}));
vi.mock("@/app/actions/turnos", () => ({
  crearEnlaceTurnoAction: crearEnlaceTurnoActionMock,
}));

const { CompartirLinkTurno } = await import("./compartir-link-turno");

const URL_ENLACE = "https://dentalmirage.com.ar/clinica-x?enlace=abc123";

async function generarLink(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Generar link" }));
  await screen.findByDisplayValue(URL_ENLACE);
}

describe("CompartirLinkTurno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crearEnlaceTurnoActionMock.mockResolvedValue({ url: URL_ENLACE, expiraEn: "2026-09-07T13:00:00Z" });
    // `navigator.clipboard`/`navigator.share` son accessors heredados del
    // prototipo en este jsdom (no propiedades propias) — un spread
    // (`{...navigator}`) no los arrastra, y sobrescribirlos en la propia
    // instancia (Object.assign/defineProperty) no siempre pisa el
    // accessor heredado de forma confiable entre versiones de jsdom. Se
    // reemplaza el global ENTERO por un objeto de cero (sin heredar nada
    // del navigator real) — el componente solo necesita
    // `.share`/`.clipboard.writeText`, nada más de la interfaz real de
    // Navigator.
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("muestra 'Generar link' antes de generar nada", () => {
    render(<CompartirLinkTurno />);
    expect(screen.getByRole("button", { name: "Generar link" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Link para compartir")).not.toBeInTheDocument();
  });

  // Pedido explícito del cliente: compartir el link nunca manda la URL
  // pelada — siempre con un mensaje que explica para qué es y cuánto dura.
  describe("mensaje informativo (pedido del cliente: nunca la URL pelada)", () => {
    it("WhatsApp Web lleva el mensaje completo, no solo la URL", async () => {
      const user = userEvent.setup();
      render(<CompartirLinkTurno />);
      await generarLink(user);

      const link = screen.getByRole("link", { name: "WhatsApp Web" });
      const href = decodeURIComponent(link.getAttribute("href") ?? "");
      expect(href).toContain(URL_ENLACE);
      expect(href).toContain("Es válido por 1 hora");
    });

    it("el mail lleva asunto y cuerpo informativos, con el link adentro", async () => {
      const user = userEvent.setup();
      render(<CompartirLinkTurno />);
      await generarLink(user);

      const link = screen.getByRole("link", { name: "Mail" });
      const href = decodeURIComponent(link.getAttribute("href") ?? "");
      expect(href).toContain("subject=Link para reservar tu turno");
      expect(href).toContain(URL_ENLACE);
      expect(href).toContain("Es válido por 1 hora");
    });

    it("'Copiar mensaje' copia el mensaje completo, no la URL sola", async () => {
      const user = userEvent.setup();
      // userEvent.setup() trae su PROPIO polyfill de clipboard para
      // simular copiar/pegar por teclado — pisa lo que el beforeEach
      // haya puesto en navigator.clipboard. Se vuelve a stubear DESPUÉS,
      // para que el componente use el mock de este test y no el
      // clipboard real de userEvent.
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText: writeTextMock } });
      render(<CompartirLinkTurno />);
      await generarLink(user);

      await user.click(screen.getByRole("button", { name: "Copiar mensaje" }));

      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining(URL_ENLACE));
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("Es válido por 1 hora"));
      expect(await screen.findByText("¡Copiado!")).toBeInTheDocument();
    });
  });

  describe("con navigator.share disponible (mobile)", () => {
    beforeEach(() => {
      vi.stubGlobal("navigator", {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
        share: vi.fn().mockResolvedValue(undefined),
      });
    });

    it("muestra el botón 'Compartir' nativo en vez de los 3 botones de desktop", async () => {
      const user = userEvent.setup();
      render(<CompartirLinkTurno />);
      await generarLink(user);

      expect(screen.getByRole("button", { name: "Compartir" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "WhatsApp Web" })).not.toBeInTheDocument();
    });

    it("comparte el mensaje informativo completo, sin duplicar el link en un campo `url` aparte", async () => {
      const user = userEvent.setup();
      render(<CompartirLinkTurno />);
      await generarLink(user);

      await user.click(screen.getByRole("button", { name: "Compartir" }));

      expect(navigator.share).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining(URL_ENLACE) }),
      );
      const llamada = (navigator.share as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(llamada.text).toContain("Es válido por 1 hora");
      expect(llamada.url).toBeUndefined();
    });
  });

  it("un error al generar el link ofrece reintentar", async () => {
    crearEnlaceTurnoActionMock.mockResolvedValue({ error: "no se pudo generar el link" });
    const user = userEvent.setup();
    render(<CompartirLinkTurno />);

    await user.click(screen.getByRole("button", { name: "Generar link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo generar el link");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(crearEnlaceTurnoActionMock).toHaveBeenCalledTimes(2);
  });
});
