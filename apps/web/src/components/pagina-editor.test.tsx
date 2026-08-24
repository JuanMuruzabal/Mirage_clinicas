import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { ocultarPaginaPublicaActionMock, deployarPaginaPublicaActionMock } = vi.hoisted(() => ({
  ocultarPaginaPublicaActionMock: vi.fn(),
  deployarPaginaPublicaActionMock: vi.fn(),
}));

vi.mock("@/app/actions/pagina-publica", () => ({
  ocultarPaginaPublicaAction: ocultarPaginaPublicaActionMock,
  deployarPaginaPublicaAction: deployarPaginaPublicaActionMock,
}));

const { PaginaEditor } = await import("./pagina-editor");

const profesional = {
  id: "prof-1",
  nombre: "María Games",
  email: "maria@example.com",
  telefono: "+5493511234567",
  nombreClinica: "Clínica Sonrisas",
  slug: "clinica-sonrisas",
  especialidades: [{ id: "esp-1", nombre: "Odontología general" }],
};

describe("PaginaEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("el link 'Ver página' apunta al slug del profesional, en una pestaña nueva", () => {
    render(<PaginaEditor profesional={profesional} paginaInicial={{ oculta: false, deployadaEn: null }} />);
    const link = screen.getByRole("link", { name: "Ver página →" });
    expect(link).toHaveAttribute("href", "/clinica-sonrisas");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("'Guardar cambios' está deshabilitado — la edición real de contenido es trabajo futuro", () => {
    render(<PaginaEditor profesional={profesional} paginaInicial={{ oculta: false, deployadaEn: null }} />);
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("sin deployar todavía, muestra el botón 'Deployar'; al confirmar, pasa a la insignia 'Publicada'", async () => {
    deployarPaginaPublicaActionMock.mockResolvedValue({ pagina: { oculta: false, deployadaEn: "2026-08-23T00:00:00Z" } });
    const user = userEvent.setup();
    render(<PaginaEditor profesional={profesional} paginaInicial={{ oculta: false, deployadaEn: null }} />);

    expect(screen.queryByText("Publicada")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Deployar" }));

    expect(deployarPaginaPublicaActionMock).toHaveBeenCalled();
    expect(await screen.findByText("Publicada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deployar" })).not.toBeInTheDocument();
  });

  it("ya deployada, no muestra el botón 'Deployar' — solo la insignia (spec §5.2: 'solo visible la primera vez')", () => {
    render(<PaginaEditor profesional={profesional} paginaInicial={{ oculta: false, deployadaEn: "2026-08-23T00:00:00Z" }} />);
    expect(screen.queryByRole("button", { name: "Deployar" })).not.toBeInTheDocument();
    expect(screen.getByText("Publicada")).toBeInTheDocument();
  });

  it("'Ocultar' pone la página en mantenimiento y el botón pasa a decir 'Mostrar'", async () => {
    ocultarPaginaPublicaActionMock.mockResolvedValue({ pagina: { oculta: true, deployadaEn: null } });
    const user = userEvent.setup();
    render(<PaginaEditor profesional={profesional} paginaInicial={{ oculta: false, deployadaEn: null }} />);

    await user.click(screen.getByRole("button", { name: "Ocultar" }));

    expect(ocultarPaginaPublicaActionMock).toHaveBeenCalledWith(true);
    expect(await screen.findByRole("button", { name: "Mostrar" })).toBeInTheDocument();
    expect(screen.getByText(/en modo mantenimiento/)).toBeInTheDocument();
  });

  it("muestra el error de la acción sin romper el resto del panel", async () => {
    ocultarPaginaPublicaActionMock.mockResolvedValue({ error: "no se pudo actualizar la página" });
    const user = userEvent.setup();
    render(<PaginaEditor profesional={profesional} paginaInicial={{ oculta: false, deployadaEn: null }} />);

    await user.click(screen.getByRole("button", { name: "Ocultar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no se pudo actualizar la página");
  });

  it("el panel de edición se puede retraer y expandir de nuevo", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor profesional={profesional} paginaInicial={{ oculta: false, deployadaEn: null }} />);

    expect(screen.getByText("Nombre de la clínica")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retraer panel de edición" }));
    expect(screen.queryByText("Nombre de la clínica")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expandir panel de edición" }));
    expect(await screen.findByText("Nombre de la clínica")).toBeInTheDocument();
  });

  it("el panel de solo lectura refleja los datos del profesional", () => {
    render(<PaginaEditor profesional={profesional} paginaInicial={{ oculta: false, deployadaEn: null }} />);
    expect(screen.getByDisplayValue("Clínica Sonrisas")).toBeDisabled();
    expect(screen.getByDisplayValue("+5493511234567")).toBeDisabled();
    // "Odontología general" aparece dos veces (previsualización + panel de
    // solo lectura) — se acota la búsqueda al panel (aside).
    const panel = screen.getByRole("button", { name: "Retraer panel de edición" }).closest("aside")!;
    expect(within(panel).getByText("Odontología general")).toBeInTheDocument();
  });

  it("la previsualización muestra el nombre de la clínica (mismo componente que la página real)", () => {
    render(<PaginaEditor profesional={profesional} paginaInicial={{ oculta: false, deployadaEn: null }} />);
    expect(screen.getByText("Previsualización en vivo")).toBeInTheDocument();
    expect(screen.getAllByText("Clínica Sonrisas").length).toBeGreaterThan(0);
  });

  it("botones deshabilitados mientras la acción está en curso", async () => {
    let resolver: (value: { pagina: { oculta: boolean; deployadaEn: string | null } }) => void = () => {};
    deployarPaginaPublicaActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<PaginaEditor profesional={profesional} paginaInicial={{ oculta: false, deployadaEn: null }} />);

    await user.click(screen.getByRole("button", { name: "Deployar" }));
    expect(screen.getByRole("button", { name: "Publicando…" })).toBeDisabled();

    resolver({ pagina: { oculta: false, deployadaEn: "2026-08-23T00:00:00Z" } });
    await waitFor(() => expect(screen.getByText("Publicada")).toBeInTheDocument());
  });
});
