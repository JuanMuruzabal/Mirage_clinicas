import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const { cookiesMock, apiMeMock, usePathnameMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  apiMeMock: vi.fn(),
  usePathnameMock: vi.fn(() => "/buscar"),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("@/lib/api", () => ({ apiMe: apiMeMock }));
// HeaderFrame (dentro de SiteHeader) usa usePathname — "/buscar" en todos
// estos tests (no Home) así el header queda siempre sólido/predecible;
// header-frame.test.tsx cubre la lógica de transparencia sobre el Home.
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { SiteHeader } = await import("./site-header");

function fakeCookieStore(value?: string) {
  cookiesMock.mockResolvedValue({
    get: vi.fn(() => (value !== undefined ? { name: "dm_session", value } : undefined)),
  });
}

describe("SiteHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sin sesión, muestra Ingresar/Sumate y el logo lleva a la home pública", async () => {
    fakeCookieStore(undefined);
    // Los Server Components async se pueden invocar directo y renderizar
    // el JSX ya resuelto (patrón React 19 / Next 15+).
    render(await SiteHeader());

    expect(screen.getByRole("link", { name: "Ingresar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sumate" })).toBeInTheDocument();
    expect(screen.queryByText("Tu perfil")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dental Mirage" })).toHaveAttribute("href", "/");
  });

  it("con sesión válida, muestra Tu perfil y el logo lleva a /seleccionar-servicio", async () => {
    fakeCookieStore("un-jwt");
    apiMeMock.mockResolvedValue({ ok: true, data: { id: "1", nombre: "María", onboardingCompletado: true } });

    render(await SiteHeader());

    expect(screen.getByRole("link", { name: "Tu perfil" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ingresar" })).not.toBeInTheDocument();
    // El pedido explícito: una vez sumada la cuenta, volver al logo no debe
    // llevar a la home general — tiene que poder volverse siempre a la
    // pantalla de selección de servicios.
    expect(screen.getByRole("link", { name: "Dental Mirage" })).toHaveAttribute("href", "/seleccionar-servicio");
  });

  it("con sesión, 'Cerrar sesión' NO está en el header — vive solo en /perfil (pedido explícito)", async () => {
    fakeCookieStore("un-jwt");
    apiMeMock.mockResolvedValue({ ok: true, data: { id: "1", nombre: "María", onboardingCompletado: true } });

    render(await SiteHeader());

    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();
  });

  it("con sesión y en /seleccionar-servicio, muestra 'Volver al inicio' detrás del wordmark, hacia la home pública (pedido explícito: 'solo volver al inicio se vera de /seleccionar-servicio')", async () => {
    usePathnameMock.mockReturnValue("/seleccionar-servicio");
    fakeCookieStore("un-jwt");
    apiMeMock.mockResolvedValue({ ok: true, data: { id: "1", nombre: "María", onboardingCompletado: true } });

    render(await SiteHeader());

    expect(screen.getByRole("link", { name: "← Volver al inicio" })).toHaveAttribute("href", "/");
  });

  it("en /seleccionar-servicio, el orden es 'Volver al inicio' → 'Dental Mirage' → Gestionar/Editar/Tu perfil agrupados a la derecha (layout confirmado por el cliente)", async () => {
    usePathnameMock.mockReturnValue("/seleccionar-servicio");
    fakeCookieStore("un-jwt");
    apiMeMock.mockResolvedValue({ ok: true, data: { id: "1", nombre: "María", onboardingCompletado: true } });

    const { container } = render(await SiteHeader());
    const header = container.querySelector("header")!;
    const nombres = within(header)
      .getAllByRole("link")
      .map((el) => el.textContent);

    expect(nombres).toEqual([
      "← Volver al inicio",
      "Dental Mirage",
      "Gestionar tu clínica",
      "Editar tu página",
      "Tu perfil",
    ]);
  });

  it("con sesión pero fuera de /seleccionar-servicio, no muestra 'Volver al inicio'", async () => {
    usePathnameMock.mockReturnValue("/panel");
    fakeCookieStore("un-jwt");
    apiMeMock.mockResolvedValue({ ok: true, data: { id: "1", nombre: "María", onboardingCompletado: true } });

    render(await SiteHeader());

    expect(screen.queryByRole("link", { name: "← Volver al inicio" })).not.toBeInTheDocument();
  });

  it("sin sesión, no muestra 'Volver al inicio' aunque esté en /seleccionar-servicio", async () => {
    usePathnameMock.mockReturnValue("/seleccionar-servicio");
    fakeCookieStore(undefined);

    render(await SiteHeader());

    expect(screen.queryByRole("link", { name: "← Volver al inicio" })).not.toBeInTheDocument();
  });

  it("sin sesión, muestra los accesos directos a Buscar clínicas y Servicios para profesionales", async () => {
    fakeCookieStore(undefined);
    render(await SiteHeader());

    expect(screen.getByRole("link", { name: "Buscar clínicas" })).toHaveAttribute("href", "/#buscar");
    expect(screen.getByRole("link", { name: "Servicios para profesionales" })).toHaveAttribute(
      "href",
      "/#como-funciona",
    );
  });

  it("con sesión, oculta los accesos directos (son para un visitante sin cuenta, pedido explícito)", async () => {
    fakeCookieStore("un-jwt");
    apiMeMock.mockResolvedValue({ ok: true, data: { id: "1", nombre: "María", onboardingCompletado: true } });

    render(await SiteHeader());

    expect(screen.queryByRole("link", { name: "Buscar clínicas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Servicios para profesionales" })).not.toBeInTheDocument();
  });

  it("con sesión, muestra 'Gestionar tu clínica' y 'Editar tu página' hacia sus respectivas áreas (pedido explícito)", async () => {
    fakeCookieStore("un-jwt");
    apiMeMock.mockResolvedValue({ ok: true, data: { id: "1", nombre: "María", onboardingCompletado: true } });

    render(await SiteHeader());

    expect(screen.getByRole("link", { name: "Gestionar tu clínica" })).toHaveAttribute("href", "/panel");
    expect(screen.getByRole("link", { name: "Editar tu página" })).toHaveAttribute("href", "/personalizar-pagina");
  });

  it("sin sesión, no muestra 'Gestionar tu clínica' ni 'Editar tu página'", async () => {
    fakeCookieStore(undefined);

    render(await SiteHeader());

    expect(screen.queryByRole("link", { name: "Gestionar tu clínica" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Editar tu página" })).not.toBeInTheDocument();
  });

  it("el texto de navegación es mayúscula/negrita (pedido explícito, más llamativo)", async () => {
    fakeCookieStore(undefined);
    render(await SiteHeader());

    expect(screen.getByRole("link", { name: "Ingresar" })).toHaveClass("uppercase", "font-bold");
    expect(screen.getByRole("link", { name: "Buscar clínicas" })).toHaveClass("uppercase", "font-bold");
  });

  it("el header es fixed (se mantiene visible al scrollear)", async () => {
    fakeCookieStore(undefined);
    const { container } = render(await SiteHeader());
    expect(container.querySelector("header")).toHaveClass("fixed", "top-0");
  });

  // Bug real reportado por el cliente (2026-08-26): con una cuenta a
  // medio sumar (mail sin confirmar, o perfil/clínica sin terminar), el
  // header mostraba "Gestionar tu clínica"/"Editar tu página"/"Tu perfil"
  // como si la cuenta ya estuviera lista — esos links redirigen de vuelta
  // a /sumarse (requireOnboardingComplete), no llevan a nada usable.
  it("con sesión pero onboarding incompleto, se comporta como sin sesión (Ingresar/Sumate, no Gestionar/Editar/Tu perfil)", async () => {
    fakeCookieStore("un-token");
    apiMeMock.mockResolvedValue({ ok: true, data: { id: "1", email: "a@example.com", onboardingCompletado: false } });

    render(await SiteHeader());

    expect(screen.getByRole("link", { name: "Ingresar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sumate" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Gestionar tu clínica" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Editar tu página" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tu perfil" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dental Mirage" })).toHaveAttribute("href", "/");
  });

  it("con token vencido (apiMe falla), se comporta como sin sesión", async () => {
    fakeCookieStore("un-jwt-vencido");
    apiMeMock.mockResolvedValue({ ok: false, status: 401, error: "token inválido" });

    render(await SiteHeader());

    expect(screen.getByRole("link", { name: "Ingresar" })).toBeInTheDocument();
  });
});
