import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PanelSidebarProvider } from "@/lib/panel-sidebar-context";

const { cookiesMock, headersMock, apiMeMock, apiMisClinicasMock, apiEquipoMock, usePathnameMock } = vi.hoisted(
  () => ({
    cookiesMock: vi.fn(),
    headersMock: vi.fn(),
    apiMeMock: vi.fn(),
    apiMisClinicasMock: vi.fn(),
    apiEquipoMock: vi.fn(),
    usePathnameMock: vi.fn(() => "/buscar"),
  }),
);

// `x-pathname` lo pone el middleware (Fase 3.2.5): es lo que deja a este
// Server Component saber si está dentro de /panel/** y solo ahí pedir las
// clínicas y el equipo. Por default estos tests no están en el panel, así
// que el header se comporta como siempre.
vi.mock("next/headers", () => ({ cookies: cookiesMock, headers: headersMock }));
vi.mock("@/lib/api", () => ({
  apiMe: apiMeMock,
  apiMisClinicas: apiMisClinicasMock,
  apiEquipo: apiEquipoMock,
}));
// El popover de colaboradores late apenas se monta (Fase 3.2.5). Acá no
// se prueba el latido —eso vive en equipo-popover.test.tsx—, pero sin
// esto la llamada real quedaría como un rechazo sin atender.
vi.mock("@/app/actions/presencia", () => ({ presenciaAction: vi.fn(async () => null) }));
// HeaderFrame (dentro de SiteHeader) usa usePathname — "/buscar" en todos
// estos tests por default (no Home) así el header queda siempre sólido/
// predecible; header-frame.test.tsx cubre la lógica de transparencia
// sobre el Home. `isHerramientaRoute` (site-header-chrome.tsx) también
// lee este mismo mock.
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { SiteHeader } = await import("./site-header");

function fakeCookieStore(value?: string) {
  cookiesMock.mockResolvedValue({
    get: vi.fn(() => (value !== undefined ? { name: "dm_session", value } : undefined)),
  });
}

function mockMe(data: { emailVerificado?: boolean; onboardingCompletado?: boolean }) {
  fakeCookieStore("un-token");
  apiMeMock.mockResolvedValue({ ok: true, data: { id: "1", email: "a@example.com", ...data } });
}

// usePanelSidebar() (TR-075 en docs/Arquitectura y base/tradeoffs.md) tira si no hay
// PanelSidebarProvider en el árbol — mismo wrapper que app/layout.tsx.
function renderConProvider(ui: ReactNode) {
  return render(<PanelSidebarProvider>{ui}</PanelSidebarProvider>);
}

// TR-058/TR-060 en docs/Arquitectura y base/tradeoffs.md: el header tiene 3 estados de
// sesión, y su apariencia además depende de si la pantalla actual es una
// "de herramienta" (`isHerramientaRoute`) o no.
describe("SiteHeader", () => {
  beforeEach(() => {
  headersMock.mockResolvedValue(new Headers({ "x-pathname": "/buscar" }));
  apiMisClinicasMock.mockResolvedValue({ ok: true, data: { clinicas: [], invitaciones: [] } });
  apiEquipoMock.mockResolvedValue({ ok: true, data: { miembros: [], pendientes: [], puedeInvitar: false } });
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue("/buscar");
  });

  it("sin sesión, muestra Ingresar/Sumate y el logo lleva a la home pública", async () => {
    fakeCookieStore(undefined);
    // Los Server Components async se pueden invocar directo y renderizar
    // el JSX ya resuelto (patrón React 19 / Next 15+).
    renderConProvider(await SiteHeader());

    expect(screen.getByRole("link", { name: "Ingresar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sumate" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mis clínicas" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PRISMA" })).toHaveAttribute("href", "/");
  });

  it("con token vencido (apiMe falla), se comporta como sin sesión", async () => {
    fakeCookieStore("un-jwt-vencido");
    apiMeMock.mockResolvedValue({ ok: false, status: 401, error: "token inválido" });

    renderConProvider(await SiteHeader());

    expect(screen.getByRole("link", { name: "Ingresar" })).toBeInTheDocument();
  });

  it("el logo siempre lleva a / — con o sin sesión, con onboarding completo o no (fuera de una pantalla de herramienta)", async () => {
    mockMe({ emailVerificado: true, onboardingCompletado: true });
    // Distinto de /panel a propósito: desde TR-075 en docs/Arquitectura y base/tradeoffs.md,
    // el logo YA NO se muestra en /panel/**, /perfil ni
    // /personalizar-pagina (ver site-header-chrome.test.tsx para esos
    // casos) — acá se prueba el caso general, sin esa excepción.
    usePathnameMock.mockReturnValue("/buscar");

    renderConProvider(await SiteHeader());

    expect(screen.getByRole("link", { name: "PRISMA" })).toHaveAttribute("href", "/");
  });

  it("con sesión, 'Cerrar sesión' NO está en el header — vive solo en /perfil (pedido explícito)", async () => {
    mockMe({ emailVerificado: true, onboardingCompletado: true });
    renderConProvider(await SiteHeader());

    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();
  });

  it("sin sesión, muestra los accesos directos a Buscar clínicas y Servicios para profesionales", async () => {
    fakeCookieStore(undefined);
    renderConProvider(await SiteHeader());

    expect(screen.getByRole("link", { name: "Buscar clínicas" })).toHaveAttribute("href", "/#buscar");
    expect(screen.getByRole("link", { name: "Servicios para profesionales" })).toHaveAttribute(
      "href",
      "/#como-funciona",
    );
  });

  it("con sesión, oculta los accesos directos (son para un visitante sin cuenta, pedido explícito)", async () => {
    mockMe({ emailVerificado: true, onboardingCompletado: true });
    renderConProvider(await SiteHeader());

    expect(screen.queryByRole("link", { name: "Buscar clínicas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Servicios para profesionales" })).not.toBeInTheDocument();
  });

  it("el texto de navegación es mayúscula/negrita (pedido explícito, más llamativo)", async () => {
    fakeCookieStore(undefined);
    renderConProvider(await SiteHeader());

    expect(screen.getByRole("link", { name: "Ingresar" })).toHaveClass("uppercase", "font-bold");
    expect(screen.getByRole("link", { name: "Buscar clínicas" })).toHaveClass("uppercase", "font-bold");
  });

  it("el header es fixed (se mantiene visible al scrollear)", async () => {
    fakeCookieStore(undefined);
    const { container } = renderConProvider(await SiteHeader());
    expect(container.querySelector("header")).toHaveClass("fixed", "top-0");
  });

  // TR-060: fuera de una pantalla de herramienta (Home, buscador...), una
  // cuenta con onboarding YA completo también muestra "Mi clínica" — bug
  // real reportado por el cliente (2026-08-26): antes se mostraban ahí
  // los tres links sueltos, como si esa fuera la pantalla correcta para
  // navegar entre herramientas.
  describe("con onboarding completo, fuera de una pantalla de herramienta", () => {
    it("muestra 'Mis clínicas' hacia /clinicas, no los links sueltos", async () => {
      mockMe({ emailVerificado: true, onboardingCompletado: true });
      renderConProvider(await SiteHeader());

      expect(screen.getByRole("link", { name: "Mis clínicas" })).toHaveAttribute("href", "/clinicas");
      expect(screen.queryByRole("link", { name: "Gestionar tu clínica" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Accesos rápidos" })).not.toBeInTheDocument();
    });
  });

  // TR-060: en una pantalla de herramienta con onboarding completo, el
  // botón de configuración reemplaza a los tres links sueltos de antes.
  describe("con onboarding completo, en una pantalla de herramienta", () => {
    it.each(["/seleccionar-servicio", "/perfil", "/personalizar-pagina"])(
      "en %s, muestra el botón de configuración (no 'Mis clínicas')",
      async (pathname) => {
        usePathnameMock.mockReturnValue(pathname);
        mockMe({ emailVerificado: true, onboardingCompletado: true });

        renderConProvider(await SiteHeader());

        expect(screen.getByRole("button", { name: "Accesos rápidos" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Mis clínicas" })).not.toBeInTheDocument();
      },
    );

    // Corrección de QA (2026-09-05, textual): "saque del header del panel
    // de gestion de clinica la tuerquita de opciones, ya que en el
    // sidebar da las opciones" — /panel/** es la única pantalla de
    // herramienta CON sidebar propio, así que ahí el botón de
    // configuración queda redundante (ni "Mi clínica" tampoco aparece).
    it("en /panel, NO muestra el botón de configuración ni 'Mis clínicas' (el sidebar ya da esas opciones)", async () => {
      usePathnameMock.mockReturnValue("/panel");
      mockMe({ emailVerificado: true, onboardingCompletado: true });

      renderConProvider(await SiteHeader());

      expect(screen.queryByRole("button", { name: "Accesos rápidos" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Mis clínicas" })).not.toBeInTheDocument();
    });

    // TR-061 en docs/Arquitectura y base/tradeoffs.md (pedido explícito del cliente,
    // 2026-08-26): "Volver al inicio" se sacó del header — con el logo
    // ya yendo siempre a "/", era redundante.
    it("en /seleccionar-servicio, el único link es el de volver al selector de clínica", async () => {
      usePathnameMock.mockReturnValue("/seleccionar-servicio");
      mockMe({ emailVerificado: true, onboardingCompletado: true });

      const { container } = renderConProvider(await SiteHeader());
      const header = container.querySelector("header")!;
      const nombresDeLinks = within(header)
        .getAllByRole("link")
        .map((el) => el.textContent);

      expect(nombresDeLinks).toEqual(["Clínicas"]);
      expect(within(header).getByRole("button", { name: "Accesos rápidos" })).toBeInTheDocument();
    });
  });

  // Bug real reportado por el cliente (2026-08-26): con una cuenta a
  // medio sumar (mail sin confirmar, o perfil/clínica sin terminar), el
  // header mostraba los links de herramienta como si la cuenta ya
  // estuviera lista — esos links redirigen de vuelta a /sumarse
  // (requireOnboardingComplete), no llevan a nada usable.
  describe("con mail sin verificar (estado anónimo)", () => {
    it("se comporta como sin sesión (Ingresar/Sumate, no Mis clínicas ni el botón de configuración)", async () => {
      mockMe({ emailVerificado: false, onboardingCompletado: false });
      renderConProvider(await SiteHeader());

      expect(screen.getByRole("link", { name: "Ingresar" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Sumate" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Mis clínicas" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Accesos rápidos" })).not.toBeInTheDocument();
    });
  });

  // TR-058/TR-060: mail verificado pero perfil/clínica sin terminar —
  // "Mi clínica" en cualquier pantalla, SIN excepción para
  // /seleccionar-servicio (pedido explícito del cliente, 2026-08-26:
  // "sigue persistiendo que se ve el header del home por detrás del
  // formulario... y no el header correspondiente a esa sección").
  describe("con mail verificado pero onboarding incompleto (cuentaSinTerminar)", () => {
    it.each(["/", "/buscar", "/seleccionar-servicio"])(
      "en %s, muestra 'Mis clínicas', nunca Ingresar/Sumate ni el botón de configuración",
      async (pathname) => {
        usePathnameMock.mockReturnValue(pathname);
        mockMe({ emailVerificado: true, onboardingCompletado: false });

        renderConProvider(await SiteHeader());

        expect(screen.getByRole("link", { name: "Mis clínicas" })).toHaveAttribute("href", "/clinicas");
        expect(screen.queryByRole("link", { name: "Ingresar" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Accesos rápidos" })).not.toBeInTheDocument();
      },
    );
  });

  // Fase 3.2.5 — el topbar del panel suma el selector de clínica y el
  // popover de colaboradores. Las dos direcciones importan: que aparezcan
  // donde tienen que aparecer, y que el resto del sitio NO pague dos
  // llamadas a la API por página para no mostrarlos.
  describe("dentro de /panel/** (Fase 3.2.5)", () => {
    beforeEach(() => {
      usePathnameMock.mockReturnValue("/panel");
      headersMock.mockResolvedValue(new Headers({ "x-pathname": "/panel" }));
      apiMisClinicasMock.mockResolvedValue({
        ok: true,
        data: {
          clinicas: [
            { id: "c1", nombre: "Clínica Norte", slug: "norte", rolPrincipal: "profesional", activa: true },
            { id: "c2", nombre: "Clínica Sur", slug: "sur", rolPrincipal: "recepcion", activa: false },
          ],
          invitaciones: [],
        },
      });
      apiEquipoMock.mockResolvedValue({
        ok: true,
        data: {
          miembros: [
            {
              userId: "u1",
              nombre: "Ana Titular",
              email: "ana@example.com",
              roles: ["owner"],
              esTitular: true,
              esVos: true,
              ultimaActividad: new Date().toISOString(),
              enLinea: true,
            },
          ],
          pendientes: [],
          puedeInvitar: true,
        },
      });
    });

    it("muestra el selector de clínica con la clínica activa y el popover de colaboradores", async () => {
      mockMe({ emailVerificado: true, onboardingCompletado: true });

      renderConProvider(await SiteHeader());

      expect(screen.getByRole("button", { name: "Cambiar de clínica" })).toHaveTextContent("Clínica Norte");
      expect(screen.getByRole("button", { name: "Ver colaboradores" })).toHaveTextContent("1 en línea");
    });

    it("fuera del panel no pide las clínicas ni el equipo", async () => {
      usePathnameMock.mockReturnValue("/buscar");
      headersMock.mockResolvedValue(new Headers({ "x-pathname": "/buscar" }));
      mockMe({ emailVerificado: true, onboardingCompletado: true });

      renderConProvider(await SiteHeader());

      expect(apiMisClinicasMock).not.toHaveBeenCalled();
      expect(apiEquipoMock).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Ver colaboradores" })).not.toBeInTheDocument();
    });
  });
});
