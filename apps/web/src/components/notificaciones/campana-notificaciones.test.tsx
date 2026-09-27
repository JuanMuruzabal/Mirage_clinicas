import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BandejaDeNotificaciones, Notificacion } from "@dental-mirage/shared-types";
import { PanelSidebarProvider, usePanelSidebar } from "@/lib/panel-sidebar-context";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/panel",
  useRouter: () => ({ push: pushMock }),
}));

const acciones = vi.hoisted(() => ({
  contarNotificacionesNuevasAction: vi.fn(),
  bandejaDeNotificacionesAction: vi.fn(),
  leerNotificacionAction: vi.fn(),
  abrirNotificacionAction: vi.fn(),
}));
vi.mock("@/app/actions/notificaciones", () => acciones);
// Los avisos al celular tienen su propio archivo de tests: acá, fuera.
vi.mock("./avisos-en-este-dispositivo", () => ({ AvisosEnEsteDispositivo: () => null }));

const { CampanaNotificaciones } = await import("./campana-notificaciones");

const turno = (id: string, paciente: string, extra: Partial<Notificacion["datos"]> = {}): Notificacion => ({
  id,
  tipo: "turno_nuevo",
  creadaEn: "2026-09-26T13:00:00Z",
  leidaEn: null,
  clinicaId: "c-1",
  turnoId: "t-" + id,
  datos: {
    pacienteNombre: paciente,
    clinicaNombre: "Clínica Norte",
    tipoConsulta: "Limpieza",
    horaInicio: "2026-10-05T10:00:00-03:00",
    horaFin: "2026-10-05T10:30:00-03:00",
    ...extra,
  },
});

const bienvenida: Notificacion = {
  id: "b",
  tipo: "bienvenida",
  creadaEn: "2026-09-20T13:00:00Z",
  leidaEn: "2026-09-21T13:00:00Z",
  datos: {},
};

function bandeja(notificaciones: Notificacion[], nuevas: number, leidas: number): BandejaDeNotificaciones {
  return { notificaciones, nuevas, leidas };
}

// La campana cierra el menú lateral del panel: se prueba con el proveedor
// real y un botón que lo abre, como la hamburguesa del header.
function MenuDelPanel() {
  const s = usePanelSidebar();
  return (
    <>
      <button type="button" onClick={s.toggle}>
        abrir menú del panel
      </button>
      <span data-testid="menu-del-panel">{s.open ? "abierto" : "cerrado"}</span>
    </>
  );
}

function renderCampana() {
  return render(
    <PanelSidebarProvider>
      <MenuDelPanel />
      <CampanaNotificaciones />
    </PanelSidebarProvider>,
  );
}

const campana = () => screen.getByRole("button", { name: /^Notificaciones/ });

let mensajesDelServiceWorker: ((e: MessageEvent) => void)[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  mensajesDelServiceWorker = [];
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      addEventListener: (_tipo: string, fn: (e: MessageEvent) => void) => mensajesDelServiceWorker.push(fn),
      removeEventListener: vi.fn(),
    },
  });
  acciones.contarNotificacionesNuevasAction.mockResolvedValue(2);
  acciones.bandejaDeNotificacionesAction.mockImplementation(async (estado: string) =>
    estado === "nuevas"
      ? bandeja([turno("1", "Bruno Iglesias"), turno("2", "Ana Paz")], 2, 1)
      : bandeja([bienvenida], 2, 1),
  );
  acciones.leerNotificacionAction.mockResolvedValue(true);
});

afterEach(() => {
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("CampanaNotificaciones — el número", () => {
  it("muestra cuántas hay sin leer, también en el nombre accesible", async () => {
    renderCampana();
    await waitFor(() => expect(campana()).toHaveAccessibleName("Notificaciones: 2 sin leer"));
    expect(campana()).toHaveTextContent("2");
  });

  it("sin nada nuevo, no hay número", async () => {
    acciones.contarNotificacionesNuevasAction.mockResolvedValue(0);
    renderCampana();
    await waitFor(() => expect(acciones.contarNotificacionesNuevasAction).toHaveBeenCalled());
    expect(campana()).toHaveAccessibleName("Notificaciones");
    expect(campana()).toHaveTextContent("");
  });

  it("de diez en adelante, 9+", async () => {
    acciones.contarNotificacionesNuevasAction.mockResolvedValue(37);
    renderCampana();
    await waitFor(() => expect(campana()).toHaveTextContent("9+"));
  });

  it("se actualiza al volver a la pestaña", async () => {
    renderCampana();
    await waitFor(() => expect(campana()).toHaveAccessibleName("Notificaciones: 2 sin leer"));

    acciones.contarNotificacionesNuevasAction.mockResolvedValue(3);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(campana()).toHaveAccessibleName("Notificaciones: 3 sin leer"));
  });

  // El service worker avisa a las pestañas abiertas cuando llega un push:
  // el número no espera al próximo minuto.
  it("se actualiza al instante cuando el service worker recibe un aviso", async () => {
    renderCampana();
    await waitFor(() => expect(campana()).toHaveAccessibleName("Notificaciones: 2 sin leer"));

    acciones.contarNotificacionesNuevasAction.mockResolvedValue(5);
    act(() => {
      for (const fn of mensajesDelServiceWorker) fn(new MessageEvent("message", { data: { tipo: "otra-cosa" } }));
    });
    expect(acciones.contarNotificacionesNuevasAction).toHaveBeenCalledTimes(1);
    act(() => {
      for (const fn of mensajesDelServiceWorker) fn(new MessageEvent("message", { data: { tipo: "notificacion-nueva" } }));
    });
    await waitFor(() => expect(campana()).toHaveAccessibleName("Notificaciones: 5 sin leer"));
  });

  it("si la acción falla, no rompe ni inventa un número", async () => {
    acciones.contarNotificacionesNuevasAction.mockRejectedValue(new Error("red"));
    renderCampana();
    await waitFor(() => expect(acciones.contarNotificacionesNuevasAction).toHaveBeenCalled());
    expect(campana()).toHaveAccessibleName("Notificaciones");
  });
});

describe("CampanaNotificaciones — la bandeja", () => {
  it("abrirla cierra el menú lateral del panel (entran por el mismo lado)", async () => {
    const user = userEvent.setup();
    renderCampana();
    await user.click(screen.getByRole("button", { name: "abrir menú del panel" }));
    expect(screen.getByTestId("menu-del-panel")).toHaveTextContent("abierto");

    await user.click(campana());

    expect(screen.getByRole("dialog", { name: "Notificaciones" })).toBeInTheDocument();
    expect(screen.getByTestId("menu-del-panel")).toHaveTextContent("cerrado");
    expect(campana()).toHaveAttribute("aria-expanded", "true");
  });

  it("muestra fecha, hora, paciente y clínica de cada turno sin abrirlo", async () => {
    const user = userEvent.setup();
    renderCampana();
    await user.click(campana());

    const lista = await screen.findByRole("list");
    const tarjetas = within(lista).getAllByRole("article");
    expect(tarjetas).toHaveLength(2);
    expect(tarjetas[0]).toHaveTextContent("Bruno Iglesias");
    expect(tarjetas[0]).toHaveTextContent("10:00");
    expect(tarjetas[0]).toHaveTextContent("Clínica Norte");
    expect(tarjetas[0]).toHaveTextContent("LUN5OCT");
    expect(screen.getByRole("tab", { name: /Nuevas/ })).toHaveAttribute("aria-selected", "true");
  });

  it("expandir una la marca leída: la campana resta una y la pestaña también", async () => {
    const user = userEvent.setup();
    renderCampana();
    await waitFor(() => expect(campana()).toHaveAccessibleName("Notificaciones: 2 sin leer"));
    await user.click(campana());
    const primera = (await screen.findAllByRole("article"))[0];

    await user.click(within(primera).getByRole("button", { expanded: false }));

    expect(acciones.leerNotificacionAction).toHaveBeenCalledWith("1");
    expect(within(primera).getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(within(primera).getByText("Limpieza")).toBeInTheDocument();
    expect(within(primera).getByText("10:00 a 10:30")).toBeInTheDocument();
    expect(within(primera).getByText("Tu página pública")).toBeInTheDocument();
    expect(campana()).toHaveAccessibleName("Notificaciones: 1 sin leer");
    expect(screen.getByRole("tab", { name: /Nuevas/ })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /Leídas/ })).toHaveTextContent("2");

    // La leída se queda en la lista mientras el panel sigue abierto, y
    // volver a tocarla no la marca de nuevo.
    await user.click(within(primera).getByRole("button", { expanded: true }));
    await user.click(within(primera).getByRole("button", { expanded: false }));
    expect(acciones.leerNotificacionAction).toHaveBeenCalledTimes(1);
    expect(campana()).toHaveAccessibleName("Notificaciones: 1 sin leer");
  });

  it("recepción ve para qué profesional es el turno", async () => {
    acciones.bandejaDeNotificacionesAction.mockResolvedValue(
      bandeja([turno("1", "Bruno Iglesias", { paraRecepcion: true, profesionalNombre: "Lucía Sosa", porEnlace: true })], 1, 0),
    );
    const user = userEvent.setup();
    renderCampana();
    await user.click(campana());
    const tarjeta = (await screen.findAllByRole("article"))[0];
    await user.click(within(tarjeta).getByRole("button", { expanded: false }));

    expect(within(tarjeta).getByText("Para")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Lucía Sosa")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Un link compartido")).toBeInTheDocument();
  });

  it("Leídas: viene cargada desde la apertura; la bienvenida se lee con su texto", async () => {
    const user = userEvent.setup();
    renderCampana();
    await user.click(campana());
    await screen.findAllByRole("article");

    await user.click(screen.getByRole("tab", { name: /Leídas/ }));

    expect(acciones.bandejaDeNotificacionesAction).toHaveBeenLastCalledWith("leidas");
    const tarjeta = (await screen.findAllByRole("article"))[0];
    expect(tarjeta).toHaveTextContent("Te damos la bienvenida");
    await user.click(within(tarjeta).getByRole("button", { expanded: false }));
    expect(within(tarjeta).getByText(/Esta es tu bandeja/)).toBeInTheDocument();
    // Ya estaba leída: no se vuelve a marcar.
    expect(acciones.leerNotificacionAction).not.toHaveBeenCalled();
    // Volver a la pestaña actual no la vuelve a pedir.
    await user.click(screen.getByRole("tab", { name: /Leídas/ }));
    expect(acciones.bandejaDeNotificacionesAction).toHaveBeenCalledTimes(2);
  });

  // Pedir en cada cambio de pestaña mostraba el esqueleto un instante: las
  // dos se cargan al abrir y cambiar no pide nada.
  it("cambiar de pestaña no vuelve a cargar: sin esqueleto ni pedidos nuevos", async () => {
    const user = userEvent.setup();
    renderCampana();
    await user.click(campana());
    await screen.findAllByRole("article");
    expect(acciones.bandejaDeNotificacionesAction).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("tab", { name: /Leídas/ }));
    expect(screen.queryByLabelText("Cargando notificaciones")).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("Te damos la bienvenida");
    await user.click(screen.getByRole("tab", { name: /Nuevas/ }));
    expect(screen.queryByLabelText("Cargando notificaciones")).not.toBeInTheDocument();
    expect(acciones.bandejaDeNotificacionesAction).toHaveBeenCalledTimes(2);
  });

  it("la que se lee aparece enseguida arriba de Leídas, sin el punto", async () => {
    const user = userEvent.setup();
    renderCampana();
    await user.click(campana());
    const primera = (await screen.findAllByRole("article"))[0];
    await user.click(within(primera).getByRole("button", { expanded: false }));

    await user.click(screen.getByRole("tab", { name: /Leídas/ }));

    const tarjetas = screen.getAllByRole("article");
    expect(tarjetas).toHaveLength(2);
    expect(tarjetas[0]).toHaveTextContent("Bruno Iglesias");
    expect(within(tarjetas[0]).queryByLabelText("Sin leer")).not.toBeInTheDocument();
    expect(tarjetas[1]).toHaveTextContent("Te damos la bienvenida");
    // Volver a abrirla ahí no la marca de nuevo.
    await user.click(within(tarjetas[0]).getByRole("button", { expanded: false }));
    expect(acciones.leerNotificacionAction).toHaveBeenCalledTimes(1);
  });

  it("vacía: 'Estás al día'", async () => {
    acciones.bandejaDeNotificacionesAction.mockResolvedValue(bandeja([], 0, 0));
    const user = userEvent.setup();
    renderCampana();
    await user.click(campana());
    expect(await screen.findByText("Estás al día")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Leídas/ }));
    expect(await screen.findByText("Todavía no leíste ninguna notificación.")).toBeInTheDocument();
  });

  it("si no carga, se puede reintentar", async () => {
    acciones.bandejaDeNotificacionesAction.mockResolvedValueOnce(null);
    const user = userEvent.setup();
    renderCampana();
    await user.click(campana());

    await user.click(await screen.findByRole("button", { name: "Reintentar" }));

    expect(await screen.findAllByRole("article")).toHaveLength(2);
  });

  it("Esc la cierra y el foco vuelve a la campana", async () => {
    const user = userEvent.setup();
    renderCampana();
    await user.click(campana());
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(campana()).toHaveFocus();
    expect(campana()).toHaveAttribute("aria-expanded", "false");
  });

  it("el velo y la X también la cierran", async () => {
    const user = userEvent.setup();
    renderCampana();
    await user.click(campana());
    await user.click(screen.getByRole("button", { name: "Cerrar notificaciones" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(campana());
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("CampanaNotificaciones — Ver turno", () => {
  async function abrirPrimera(user: ReturnType<typeof userEvent.setup>) {
    await user.click(campana());
    const primera = (await screen.findAllByRole("article"))[0];
    await user.click(within(primera).getByRole("button", { expanded: false }));
    return primera;
  }

  it("va al turno y cierra la bandeja y el menú lateral", async () => {
    acciones.abrirNotificacionAction.mockResolvedValue({
      destino: "/panel/calendario?vista=dia&fecha=2026-10-05&turno=t-1",
      recargar: false,
    });
    const user = userEvent.setup();
    renderCampana();
    const primera = await abrirPrimera(user);

    await user.click(within(primera).getByRole("button", { name: "Ver turno" }));

    expect(acciones.abrirNotificacionAction).toHaveBeenCalledWith("1");
    expect(pushMock).toHaveBeenCalledWith("/panel/calendario?vista=dia&fecha=2026-10-05&turno=t-1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("menu-del-panel")).toHaveTextContent("cerrado");
  });

  // Cambió la clínica de la sesión: el header muestra la anterior, así que
  // se recarga la página entera en vez de navegar del lado del cliente.
  it("si cambió de clínica, recarga la página entera", async () => {
    acciones.abrirNotificacionAction.mockResolvedValue({ destino: "/panel/turnos?estado=cancelada&turno=t-1", recargar: true });
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign } });
    try {
      const user = userEvent.setup();
      renderCampana();
      const primera = await abrirPrimera(user);
      await user.click(within(primera).getByRole("button", { name: "Ver turno" }));
      expect(assign).toHaveBeenCalledWith("/panel/turnos?estado=cancelada&turno=t-1");
      expect(pushMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });

  it("si no se puede abrir, lo dice en la tarjeta y no navega", async () => {
    acciones.abrirNotificacionAction.mockResolvedValue({ error: "Tu sesión venció. Volvé a ingresar." });
    const user = userEvent.setup();
    renderCampana();
    const primera = await abrirPrimera(user);

    await user.click(within(primera).getByRole("button", { name: "Ver turno" }));

    expect(within(primera).getByRole("alert")).toHaveTextContent("Tu sesión venció");
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sin destino no navega (la bandeja queda abierta)", async () => {
    acciones.abrirNotificacionAction.mockResolvedValue({ destino: null, recargar: false });
    const user = userEvent.setup();
    renderCampana();
    const primera = await abrirPrimera(user);
    await user.click(within(primera).getByRole("button", { name: "Ver turno" }));
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
