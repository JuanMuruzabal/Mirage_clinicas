import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DatosDelTopbar } from "@/app/actions/topbar-panel";

const datosMock = vi.fn();
const usePathnameMock = vi.fn(() => "/panel");

vi.mock("@/app/actions/topbar-panel", () => ({ datosDelTopbarAction: () => datosMock() }));
vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@/app/actions/presencia", () => ({ presenciaAction: vi.fn(async () => null) }));
// El estado del menú lateral de mobile: con el drawer abierto, el header
// no despliega nada (el popover quedaría tapado, o tapándolo).
const sidebarAbiertoMock = vi.fn(() => false);
vi.mock("@/lib/panel-sidebar-context", () => ({
  usePanelSidebar: () => ({ open: sidebarAbiertoMock(), toggle: vi.fn(), close: vi.fn() }),
}));
const entrarMock = vi.fn(async (_id: string, _opciones?: { redirigir?: boolean }) => undefined);
const refreshMock = vi.fn();
vi.mock("@/app/actions/clinicas", () => ({ entrarEnClinicaAction: entrarMock }));

const { EquipoDelPanel, PanelTopbarProvider, SelectorClinicaDelPanel } = await import("./panel-topbar");

function datos(over: Partial<DatosDelTopbar> = {}): DatosDelTopbar {
  return {
    clinicas: [
      { id: "c1", nombre: "Clínica Norte", slug: "norte", rolPrincipal: "profesional", activa: true },
      { id: "c2", nombre: "Clínica Sur", slug: "sur", rolPrincipal: "recepcion", activa: false },
    ] as DatosDelTopbar["clinicas"],
    nombreClinicaActual: "Clínica Norte",
    equipo: {
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
    ...over,
  };
}

let rerenderTopbar: () => void;

function montar() {
  const utils = render(
    <PanelTopbarProvider habilitado>
      <SelectorClinicaDelPanel />
      <EquipoDelPanel />
    </PanelTopbarProvider>,
  );
  rerenderTopbar = () =>
    utils.rerender(
      <PanelTopbarProvider habilitado>
        <SelectorClinicaDelPanel />
        <EquipoDelPanel />
      </PanelTopbarProvider>,
    );
  return utils;
}

beforeEach(() => {
  datosMock.mockReset();
  entrarMock.mockClear();
  refreshMock.mockClear();
  usePathnameMock.mockReturnValue("/panel");
  sidebarAbiertoMock.mockReturnValue(false);
  datosMock.mockResolvedValue(datos());
});

describe("PanelTopbar", () => {
  it("dentro del panel muestra el selector de clínica y los colaboradores", async () => {
    montar();

    expect(await screen.findByRole("button", { name: "Cambiar de clínica" })).toHaveTextContent("Clínica Norte");
    expect(screen.getByRole("button", { name: "Ver colaboradores" })).toHaveTextContent("1 en línea");
  });

  // EL BUG QUE SE ESCAPÓ DOS VECES (reportado el 2026-09-14). La primera
  // versión pedía estos datos en el Server Component del header, que vive
  // en el layout RAÍZ — y un layout no se vuelve a renderizar en una
  // navegación del cliente. Quien entraba por /clinicas y navegaba a
  // /panel se quedaba con el render de /clinicas y no veía nada.
  it("fuera del panel no pide nada, y al entrar sí", async () => {
    usePathnameMock.mockReturnValue("/clinicas");
    const { rerender } = montar();

    await waitFor(() => expect(datosMock).not.toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Ver colaboradores" })).not.toBeInTheDocument();

    // La misma sesión navega al panel, sin recargar la página.
    usePathnameMock.mockReturnValue("/panel");
    rerender(
      <PanelTopbarProvider habilitado>
        <SelectorClinicaDelPanel />
        <EquipoDelPanel />
      </PanelTopbarProvider>,
    );

    expect(await screen.findByRole("button", { name: "Ver colaboradores" })).toBeInTheDocument();
  });

  // El otro modo de falla de la primera versión: el selector se dibujaba
  // solo si encontraba una clínica con `activa: true`, y ese flag vale
  // true únicamente cuando la sesión eligió una a mano. Quien entró por
  // el fallback de "la más antigua" las tiene todas en false.
  it("muestra el selector aunque ninguna clínica esté marcada como activa", async () => {
    datosMock.mockResolvedValue(
      datos({
        clinicas: [
          { id: "c1", nombre: "Clínica Norte", slug: "norte", rolPrincipal: "profesional", activa: false },
          { id: "c2", nombre: "Clínica Sur", slug: "sur", rolPrincipal: "recepcion", activa: false },
        ] as DatosDelTopbar["clinicas"],
        nombreClinicaActual: "Clínica Norte",
      }),
    );

    montar();

    expect(await screen.findByRole("button", { name: "Cambiar de clínica" })).toHaveTextContent("Clínica Norte");
  });

  // 2026-09-19, pedido del cliente: "el componente se extiende ahora
  // hasta la página de /seleccionar-servicio reemplazando el ícono de
  // tuerca". El SELECTOR no lo sigue hasta ahí: esa pantalla ya tiene el
  // suyo en el cuerpo, y dos controles para lo mismo en la misma vista
  // es exactamente lo que el ítem 4 vino a sacar.
  it("en /seleccionar-servicio muestra los colaboradores, pero no el selector de clínica", async () => {
    usePathnameMock.mockReturnValue("/seleccionar-servicio");
    datosMock.mockResolvedValue(datos());

    montar();

    expect(await screen.findByRole("button", { name: "Ver colaboradores" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cambiar de clínica" })).not.toBeInTheDocument();
  });

  it("sin sesión completa no pide nada", async () => {
    render(
      <PanelTopbarProvider habilitado={false}>
        <SelectorClinicaDelPanel />
        <EquipoDelPanel />
      </PanelTopbarProvider>,
    );

    await waitFor(() => expect(datosMock).not.toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Ver colaboradores" })).not.toBeInTheDocument();
  });

  it("si la API no responde, el header no se rompe", async () => {
    datosMock.mockResolvedValue(null);

    montar();

    await waitFor(() => expect(datosMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Cambiar de clínica" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver colaboradores" })).not.toBeInTheDocument();
  });

  // EXCLUSIVOS del header de /panel (pedido explícito del cliente,
  // 2026-09-14: "estos componentes son exclusivos del header de /panel").
  // El chequeo de ruta se repite en los controles además de en el
  // provider: con la comprobación en un solo lado, cualquiera que los
  // monte en otra pantalla los vería igual.
  // /perfil y no /colaboradores: esa última pasó a mostrar el
  // componente el 2026-09-19 ("el header de /colaboradores y
  // /personalizar-pagina tiene que ser igual al header del /panel").
  // /perfil sigue afuera — es la pantalla a la que lleva ese menú.
  it("no se filtran a otras pantallas aunque el provider tenga datos", async () => {
    montar();
    await screen.findByRole("button", { name: "Ver colaboradores" });

    usePathnameMock.mockReturnValue("/perfil");
    rerenderTopbar();

    expect(screen.queryByRole("button", { name: "Cambiar de clínica" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver colaboradores" })).not.toBeInTheDocument();
  });

  it("en /colaboradores y /personalizar-pagina muestra los colaboradores, pero no el selector", async () => {
    montar();
    await screen.findByRole("button", { name: "Ver colaboradores" });

    for (const ruta of ["/colaboradores", "/personalizar-pagina"]) {
      usePathnameMock.mockReturnValue(ruta);
      rerenderTopbar();
      expect(screen.getByRole("button", { name: "Ver colaboradores" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cambiar de clínica" })).not.toBeInTheDocument();
    }
  });

  // Cambiar de clínica desde el topbar NO saca del panel y NO apaga los
  // controles: los actualiza (pedido explícito del cliente, 2026-09-14).
  it("al cambiar de clínica se queda en el panel y vuelve a pedir los datos", async () => {
    montar();
    await screen.findByRole("button", { name: "Cambiar de clínica" });
    const pedidosAntes = datosMock.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de clínica" }));
    await userEvent.click(screen.getByRole("button", { name: /Clínica Sur/ }));

    // Sin redirect: la acción se llama pidiendo quedarse.
    await waitFor(() => expect(entrarMock).toHaveBeenCalledWith("c2", { redirigir: false }));
    // Y el header vuelve a pedir, en vez de quedarse con la anterior.
    await waitFor(() => expect(datosMock.mock.calls.length).toBeGreaterThan(pedidosAntes));
    // El contenido del panel también es de la otra clínica ahora.
    expect(refreshMock).toHaveBeenCalled();
  });

  // Con el menú lateral de mobile desplegado, los dos controles del
  // header quedan DEBAJO del drawer: abrirlos dejaría un popover tapado,
  // o tapando el menú (pedido del cliente, 2026-09-14).
  it("con el sidebar abierto no se despliega nada", async () => {
    sidebarAbiertoMock.mockReturnValue(true);
    montar();

    const clinica = await screen.findByRole("button", { name: "Cambiar de clínica" });
    const equipo = screen.getByRole("button", { name: "Ver colaboradores" });
    expect(clinica).toBeDisabled();
    expect(equipo).toBeDisabled();

    await userEvent.click(clinica);
    expect(screen.queryByText("Cambiar de clínica", { selector: "p" })).not.toBeInTheDocument();
    await userEvent.click(equipo);
    expect(screen.queryByText("Colaboradores", { selector: "p" })).not.toBeInTheDocument();
  });
});
