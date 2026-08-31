import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelSidebarProvider } from "@/lib/panel-sidebar-context";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn(() => "/buscar") }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { SiteHeaderChrome } = await import("./site-header-chrome");
type EstadoHeaderSesion = "anonimo" | "cuentaSinTerminar" | "completo";

// usePanelSidebar() (TR-075 en docs/tradeoffs.md) tira si no hay
// PanelSidebarProvider en el árbol — mismo wrapper que app/layout.tsx.
function renderHeader(estado: EstadoHeaderSesion) {
  return render(
    <PanelSidebarProvider>
      <SiteHeaderChrome estado={estado} />
    </PanelSidebarProvider>,
  );
}
function rerenderHeader(rerender: (ui: ReactElement) => void, estado: EstadoHeaderSesion) {
  rerender(
    <PanelSidebarProvider>
      <SiteHeaderChrome estado={estado} />
    </PanelSidebarProvider>,
  );
}

// Corrección post-entrega (2026-08-24, pedido explícito del cliente: "el
// header cuando se acumulan componentes se ve espantoso [en mobile]...
// aplicar la misma solucion que alojamientos madryn... una barra
// desplegable"). Este archivo cubre el toggle mobile del estado anónimo
// (único que lo necesita) y — TR-058/TR-060 en docs/tradeoffs.md — qué
// aparece en el header en cada combinación de `estado` × ruta.
describe("SiteHeaderChrome — menú mobile (estado anónimo)", () => {
  it("arranca cerrado: el botón de menú existe pero el dropdown no está en el DOM", () => {
    usePathnameMock.mockReturnValue("/");
    renderHeader("anonimo");

    const boton = screen.getByRole("button", { name: "Abrir menú" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Menú y accesos directos" })).not.toBeInTheDocument();
  });

  it("clickear el botón abre el dropdown con Buscar clínicas/Servicios/Ingresar/Sumate", async () => {
    usePathnameMock.mockReturnValue("/");
    const user = userEvent.setup();
    renderHeader("anonimo");

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));

    expect(screen.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");
    const dropdown = screen.getByRole("navigation", { name: "Menú y accesos directos" });
    const textos = Array.from(dropdown.querySelectorAll("a")).map((a) => a.textContent);
    expect(textos).toEqual(["Buscar clínicas", "Servicios para profesionales", "Ingresar", "Sumate"]);
  });

  it("clickear un link del dropdown lo cierra", async () => {
    usePathnameMock.mockReturnValue("/");
    const user = userEvent.setup();
    renderHeader("anonimo");

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    const dropdown = screen.getByRole("navigation", { name: "Menú y accesos directos" });
    await user.click(within(dropdown).getByRole("link", { name: "Ingresar" }));

    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
  });

  it("clickear el botón de nuevo lo cierra (toggle)", async () => {
    usePathnameMock.mockReturnValue("/");
    const user = userEvent.setup();
    renderHeader("anonimo");

    const boton = screen.getByRole("button", { name: "Abrir menú" });
    await user.click(boton);
    await user.click(screen.getByRole("button", { name: "Cerrar menú" }));

    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
  });

  it("cambiar de ruta cierra el menú aunque no se haya clickeado nada adentro", async () => {
    usePathnameMock.mockReturnValue("/buscar");
    const { rerender } = renderHeader("anonimo");

    await userEvent.setup().click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toBeInTheDocument();

    usePathnameMock.mockReturnValue("/panel");
    rerenderHeader(rerender, "anonimo");
    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
  });

  it("con el menú abierto, el header queda sólido incluso en el Home sin scrollear", async () => {
    usePathnameMock.mockReturnValue("/");
    const user = userEvent.setup();
    const { container } = renderHeader("anonimo");

    expect(container.querySelector("header")).toHaveClass("bg-transparent");
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(container.querySelector("header")).toHaveClass("bg-porcelain");
  });

  it("no muestra el botón de menú mobile en los otros dos estados (un solo botón compacto, nunca desborda)", () => {
    usePathnameMock.mockReturnValue("/");
    const { rerender } = renderHeader("completo");
    expect(screen.queryByRole("button", { name: /menú/i })).not.toBeInTheDocument();

    rerenderHeader(rerender, "cuentaSinTerminar");
    expect(screen.queryByRole("button", { name: /menú/i })).not.toBeInTheDocument();
  });
});

// El logo siempre vuelve a la home pública (pedido explícito del
// cliente, 2026-08-26) — antes, con onboarding completo, llevaba a
// /seleccionar-servicio. Sigue siendo así para anonimo/cuentaSinTerminar
// en CUALQUIER ruta (nunca disparan `ocultarLogo`, ver TR-075 más abajo)
// — para estado completo, el logo depende de la ruta (ver ese describe).
describe("SiteHeaderChrome — logo", () => {
  it.each(["anonimo", "cuentaSinTerminar"] as const)("con estado=%s en /panel, el logo linkea a / siempre", (estado) => {
    usePathnameMock.mockReturnValue("/panel");
    renderHeader(estado);
    expect(screen.getByRole("link", { name: /Dental Mirage/ })).toHaveAttribute("href", "/");
  });

  it("con estado completo fuera de una pantalla de herramienta (Home), el logo linkea a /", () => {
    usePathnameMock.mockReturnValue("/");
    renderHeader("completo");
    expect(screen.getByRole("link", { name: /Dental Mirage/ })).toHaveAttribute("href", "/");
  });
});

// TR-060 en docs/tradeoffs.md (pedido explícito del cliente, 2026-08-26):
// en una pantalla de herramienta con onboarding completo, el botón de
// configuración reemplaza a los tres links sueltos de antes.
describe("SiteHeaderChrome — botón de configuración (estado completo, pantalla de herramienta)", () => {
  it.each(["/seleccionar-servicio", "/perfil", "/personalizar-pagina"])(
    "en %s con estado completo, muestra el botón de configuración y no 'Mi clínica'",
    (pathname) => {
      usePathnameMock.mockReturnValue(pathname);
      renderHeader("completo");
      expect(screen.getByRole("button", { name: "Accesos rápidos" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Mi clínica" })).not.toBeInTheDocument();
    },
  );

  // Corrección de QA (2026-09-05, textual): "saque del header del panel
  // de gestion de clinica la tuerquita de opciones, ya que en el
  // sidebar da las opciones" — a diferencia de /perfil/
  // /personalizar-pagina/seleccionar-servicio (sin sidebar propio, único
  // acceso a Tu perfil/Cerrar sesión), en /panel/** el sidebar ya las
  // ofrece — el gear queda redundante ahí, y "Mi clínica" tampoco
  // aparece (ese espacio lo ocupa la hamburguesa/el botón "Panel").
  it.each(["/panel", "/panel/turnos"])(
    "en %s (con sidebar) con estado completo, NO muestra el botón de configuración ni 'Mi clínica'",
    (pathname) => {
      usePathnameMock.mockReturnValue(pathname);
      renderHeader("completo");
      expect(screen.queryByRole("button", { name: "Accesos rápidos" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Mi clínica" })).not.toBeInTheDocument();
    },
  );

  // TR-061 en docs/tradeoffs.md (pedido explícito del cliente,
  // 2026-08-26): "Volver al inicio" se sacó del header — con el logo ya
  // yendo siempre a "/", era redundante.
  it("en /seleccionar-servicio con estado completo, ya NO muestra 'Volver al inicio'", () => {
    usePathnameMock.mockReturnValue("/seleccionar-servicio");
    renderHeader("completo");
    expect(screen.queryByRole("link", { name: /Volver al inicio/ })).not.toBeInTheDocument();
  });

  it("fuera de una pantalla de herramienta (Home), con estado completo NO muestra el botón de configuración", () => {
    usePathnameMock.mockReturnValue("/");
    renderHeader("completo");
    expect(screen.queryByRole("button", { name: "Accesos rápidos" })).not.toBeInTheDocument();
  });
});

// TR-075 en docs/tradeoffs.md (pedido explícito del cliente, 2026-08-27):
// "quitar de aquí el logo de Dental Mirage... solo en la página de
// /seleccionar-servicio debe ser visible el ícono para volver al home".
// De las 4 pantallas de herramienta, solo /seleccionar-servicio conserva
// el logo — en /panel/** (mobile) lo reemplaza la hamburguesa que abre
// el sidebar; en el resto (desktop de /panel/**, y /perfil/
// /personalizar-pagina en cualquier ancho) lo reemplaza un botón "Panel".
describe("SiteHeaderChrome — logo oculto fuera de /seleccionar-servicio (TR-075)", () => {
  it("en /seleccionar-servicio con estado completo, el logo sigue visible (única excepción)", () => {
    usePathnameMock.mockReturnValue("/seleccionar-servicio");
    renderHeader("completo");
    expect(screen.getByRole("link", { name: /Dental Mirage/ })).toHaveAttribute("href", "/");
  });

  it.each(["/panel", "/panel/turnos", "/perfil", "/personalizar-pagina"])(
    "en %s con estado completo, el logo YA NO está",
    (pathname) => {
      usePathnameMock.mockReturnValue(pathname);
      renderHeader("completo");
      expect(screen.queryByRole("link", { name: /Dental Mirage/ })).not.toBeInTheDocument();
    },
  );

  it("en una ruta de /panel, muestra la hamburguesa que abre el sidebar (mobile)", () => {
    usePathnameMock.mockReturnValue("/panel/turnos");
    renderHeader("completo");
    const boton = screen.getByRole("button", { name: "Abrir menú" });
    expect(boton).toHaveAttribute("aria-controls", "panel-sidebar-drawer");
    expect(boton).toHaveAttribute("aria-expanded", "false");
  });

  it("clickear la hamburguesa cambia aria-expanded a true", async () => {
    usePathnameMock.mockReturnValue("/panel");
    const user = userEvent.setup();
    renderHeader("completo");

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");
  });

  // Corrección de QA (2026-09-05, textual): "cuando tengo desplegado el
  // sidebar cambiar las tres rayitas con una x cuando esta abierto, y
  // cuando se cierra vuelven las rayitas".
  it("el ícono cambia de 3 rayitas a una X al abrir el drawer, y vuelve a 3 rayitas al cerrar", async () => {
    usePathnameMock.mockReturnValue("/panel");
    const user = userEvent.setup();
    renderHeader("completo");

    const cerrado = screen.getByRole("button", { name: "Abrir menú" });
    expect(cerrado.querySelector("path")).toHaveAttribute("d", "M3 5.5h14M3 10h14M3 14.5h14");

    await user.click(cerrado);
    const abierto = screen.getByRole("button", { name: "Cerrar menú" });
    expect(abierto.querySelector("path")).toHaveAttribute("d", "M4.5 4.5l11 11M15.5 4.5l-11 11");

    await user.click(abierto);
    expect(screen.getByRole("button", { name: "Abrir menú" }).querySelector("path")).toHaveAttribute(
      "d",
      "M3 5.5h14M3 10h14M3 14.5h14",
    );
  });

  it("en /perfil y /personalizar-pagina (sin sidebar), NO muestra la hamburguesa, muestra 'Panel' en su lugar", () => {
    usePathnameMock.mockReturnValue("/perfil");
    renderHeader("completo");
    expect(screen.queryByRole("button", { name: "Abrir menú" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Panel" })).toHaveAttribute("href", "/seleccionar-servicio");
  });

  it("en una ruta de /panel, el botón 'Panel' también existe (para desktop, oculto en mobile vía CSS)", () => {
    usePathnameMock.mockReturnValue("/panel");
    renderHeader("completo");
    expect(screen.getByRole("link", { name: "Panel" })).toHaveAttribute("href", "/seleccionar-servicio");
  });
});

// TR-058/TR-060: "Mi clínica" es el botón único para cualquier sesión
// autenticada que no esté viendo el menú de configuración — Home,
// buscador, o una pantalla de herramienta con el onboarding todavía sin
// terminar (bloqueada por el modal de bienvenida). Pedido explícito del
// cliente, 2026-08-26: "sigue persistiendo que se ve el header del home
// por detrás del formulario... y no el header correspondiente a esa
// sección" — ya no hay excepción de ruta para /seleccionar-servicio acá.
describe("SiteHeaderChrome — botón único 'Mi clínica'", () => {
  it.each(["/", "/buscar"])("con estado completo en %s (fuera de una herramienta), muestra 'Mi clínica'", (pathname) => {
    usePathnameMock.mockReturnValue(pathname);
    renderHeader("completo");
    expect(screen.getByRole("link", { name: "Mi clínica" })).toHaveAttribute("href", "/seleccionar-servicio");
  });

  it.each(["/", "/buscar", "/seleccionar-servicio"])(
    "con estado cuentaSinTerminar en %s, muestra 'Mi clínica' (sin excepción de ruta)",
    (pathname) => {
      usePathnameMock.mockReturnValue(pathname);
      renderHeader("cuentaSinTerminar");
      expect(screen.getByRole("link", { name: "Mi clínica" })).toHaveAttribute("href", "/seleccionar-servicio");
      expect(screen.queryByRole("link", { name: "Ingresar" })).not.toBeInTheDocument();
    },
  );

  it("con estado anónimo, nunca muestra 'Mi clínica'", () => {
    usePathnameMock.mockReturnValue("/");
    renderHeader("anonimo");
    expect(screen.queryByRole("link", { name: "Mi clínica" })).not.toBeInTheDocument();
  });
});

// TR-065 en docs/tradeoffs.md (pedido explícito del cliente, 2026-08-26:
// "en desktop hay un gap en la esquina superior derecha... no llega
// hasta el borde derecho del área de contenido") — /panel es el único
// layout con sidebar, así que el header ahí deja de centrarse en
// max-w-5xl (que ignora el sidebar) y pasa a ancho completo con el mismo
// padding que ya usa el contenido de esas páginas (p-8).
describe("SiteHeaderChrome — alineación del header en /panel", () => {
  it("en una ruta de /panel, el contenedor del header es ancho completo con px-8 (mismo padding que el contenido)", () => {
    usePathnameMock.mockReturnValue("/panel/turnos");
    const { container } = renderHeader("completo");
    const fila = container.querySelector("header > div")!;
    expect(fila).toHaveClass("w-full", "px-8");
    expect(fila).not.toHaveClass("max-w-5xl", "px-6");
  });

  it("fuera de /panel, el header sigue centrado en max-w-5xl con px-6 (sin cambios)", () => {
    usePathnameMock.mockReturnValue("/seleccionar-servicio");
    const { container } = renderHeader("completo");
    const fila = container.querySelector("header > div")!;
    expect(fila).toHaveClass("max-w-5xl", "px-6");
    expect(fila).not.toHaveClass("w-full", "px-8");
  });
});
