import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PacientesTable } from "./pacientes-table";

// Cada fila es un ClickableTableRow (TR-023 en docs/Arquitectura y base/tradeoffs.md), que usa
// useRouter() internamente — mismo mock que clickable-table-row.test.tsx.
const { pushMock, listPacientesPaginadoActionMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  listPacientesPaginadoActionMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
// La tabla pide las tandas siguientes de "Cargar más" por Server Action
// (@/lib/api es server-only, no puede importarse desde jsdom).
vi.mock("@/app/actions/pacientes", () => ({ listPacientesPaginadoAction: listPacientesPaginadoActionMock }));

const paciente = {
  id: "p-1",
  nombre: "Bruno",
  apellido: "Iglesias",
  dni: "30111222",
  telefono: "3511234567",
  email: "bruno@example.com",
  createdAt: new Date().toISOString(),
};

describe("PacientesTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPacientesPaginadoActionMock.mockResolvedValue({ items: [], total: 0 });
  });

  it("muestra nombre, teléfono, DNI y email como columnas", () => {
    render(<PacientesTable pacientes={[paciente]} />);
    expect(screen.getByText("Bruno Iglesias")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "3511234567" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "30111222" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "bruno@example.com" })).toBeInTheDocument();
  });

  // El sticky vive en cada `th` (`.panel-th-sticky`), no en thead/tr —
  // bug de Safari de iOS con rebote elástico (2026-08-28): WebKit no
  // recalcula bien el sticky en thead/tr durante el overscroll.
  it("cada th del encabezado tiene la clase sticky (no el thead)", () => {
    const { container } = render(<PacientesTable pacientes={[paciente]} />);
    const thead = container.querySelector("thead")!;
    expect(thead.className).toBe("");
    const ths = container.querySelectorAll("thead th");
    expect(ths.length).toBeGreaterThan(0);
    ths.forEach((th) => expect(th).toHaveClass("panel-th-sticky"));
  });

  // Pedido explícito del cliente, 2026-08-27: "el DNI se sigue viendo
  // pequeño en los datos, debe estar como dato desplegable no debajo del
  // nombre" — ya no hay ningún subtítulo de DNI pegado al nombre.
  it("no muestra el DNI como subtítulo debajo del nombre", () => {
    render(<PacientesTable pacientes={[paciente]} />);
    expect(screen.queryByText(`DNI ${paciente.dni}`)).not.toBeInTheDocument();
  });

  it("sin email, la columna muestra —", () => {
    render(<PacientesTable pacientes={[{ ...paciente, email: null }]} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  // Correcciones generales, ítem 9 (2026-10-12): la tabla va completa en
  // todos los anchos, así que no hay panel desplegable ni chevron; tocar la
  // fila lleva a la ficha.
  it("no hay panel desplegable: tocar la fila navega a la ficha", async () => {
    const user = userEvent.setup();
    render(<PacientesTable pacientes={[paciente]} />);

    expect(screen.queryByRole("button", { name: "Mostrar datos" })).not.toBeInTheDocument();
    await user.click(screen.getByText("30111222"));
    expect(pushMock).toHaveBeenCalledWith("/panel/pacientes/p-1");
  });

  it("el nombre es el link a la ficha del paciente", () => {
    render(<PacientesTable pacientes={[paciente]} />);
    expect(screen.getByRole("link", { name: "Bruno Iglesias" })).toHaveAttribute("href", "/panel/pacientes/p-1");
  });

  // Extra 2.3.4 (E4.1): un email largo ya no se muestra inline (rompía el
  // ancho de la fila) — se reemplaza por el botón "Ver email"
  // (VerTextoBoton, Extra 2.3.1/E1.7), que abre el texto completo en un
  // modal aparte, sin navegar a la ficha (stopPropagation propio de
  // VerTextoBoton, mismo criterio que el link del nombre).
  describe("E4.1: 'Ver email' para un email largo", () => {
    const emailLargo = "bruno.alejandro.iglesias.paciente.frecuente@clinica-ejemplo.com.ar";
    const pacienteEmailLargo = { ...paciente, email: emailLargo };

    it("un email largo se oculta detrás del botón 'Ver email', sin mostrar el texto inline", () => {
      render(<PacientesTable pacientes={[pacienteEmailLargo]} />);

      expect(screen.getByRole("button", { name: "Ver email" })).toBeInTheDocument();
      expect(screen.queryByText(emailLargo)).not.toBeInTheDocument();
    });

    it("tocar 'Ver email' muestra el texto completo en un modal, sin navegar a la ficha", async () => {
      const user = userEvent.setup();
      render(<PacientesTable pacientes={[pacienteEmailLargo]} />);
      // pushMock no se limpia entre tests de este archivo (no hay
      // `beforeEach(vi.clearAllMocks)`) — se compara contra la cantidad de
      // llamadas ya acumuladas, no contra cero, para no depender del
      // orden en que corren los demás tests del describe.
      const llamadasPrevias = pushMock.mock.calls.length;

      await user.click(screen.getByRole("button", { name: "Ver email" }));

      const dialogo = await screen.findByRole("dialog", { name: "Email" });
      expect(within(dialogo).getByText(emailLargo)).toBeInTheDocument();
      expect(pushMock.mock.calls.length).toBe(llamadasPrevias);
    });

    it("un email corto se sigue mostrando inline, sin botón 'Ver email'", () => {
      render(<PacientesTable pacientes={[paciente]} />);

      expect(screen.getByRole("cell", { name: "bruno@example.com" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ver email" })).not.toBeInTheDocument();
    });
  });

  // Corrección de QA (ronda de correcciones, 2026-09-06): "en la tabla
  // pacientes, si el paciente tiene más de un número o mail poner un
  // botón de ver mails, ver teléfonos si posee más de uno" — antes solo
  // la ficha de detalle mostraba los alternativos, la tabla se quedaba
  // con el principal a secas.
  describe("Ver mails/Ver teléfonos con alternativos (ronda de correcciones, 2026-09-06)", () => {
    it("con un mail alternativo, agrupa detrás de 'Ver mails' en vez de mostrar solo el principal", async () => {
      const user = userEvent.setup();
      render(<PacientesTable pacientes={[{ ...paciente, emailsAlternativos: ["bruno.alt@example.com"] }]} />);

      expect(screen.queryByText("bruno@example.com")).not.toBeInTheDocument();
      // Segunda ronda de correcciones (2026-09-06): "quitar de los
      // botones el '->'" — estos dos ya no llevan flecha (no son
      // navegación, abren un modal).
      const boton = screen.getByRole("button", { name: "Ver mails" });
      await user.click(boton);
      const dialogo = await screen.findByRole("dialog", { name: "Mails" });
      expect(dialogo).toHaveTextContent("bruno@example.com");
      expect(dialogo).toHaveTextContent("bruno.alt@example.com");
    });

    it("con un teléfono alternativo, agrupa detrás de 'Ver teléfonos'", () => {
      render(<PacientesTable pacientes={[{ ...paciente, telefonosAlternativos: ["3519999999"] }]} />);

      expect(screen.queryByRole("cell", { name: "3511234567" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ver teléfonos" })).toBeInTheDocument();
    });

    it("sin alternativos, sigue mostrando el principal sin botón", () => {
      render(<PacientesTable pacientes={[paciente]} />);
      expect(screen.queryByRole("button", { name: "Ver mails" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ver teléfonos" })).not.toBeInTheDocument();
    });
  });

  // Fase 2.4.2, rediseñado en la ronda de correcciones (2026-09-06): un
  // paciente puede tener MÁS de un tutor — con más de uno, la columna
  // pasa a un botón "Ver tutores" que lleva a la ficha (donde se ven
  // todos), en vez de un solo nombre que escondería a los demás.
  describe("columna Tutor (ronda de correcciones, 2026-09-06)", () => {
    const tutor1 = { id: "tutor-tutor1", relacion: "familiar", nombre: "Julián Ortiz", telefono: "+5493511111111", email: "julian@example.com" };
    const tutor2 = { id: "tutor-tutor2", relacion: "otro", nombre: "Abuela Rosa", telefono: "+5493512222222", email: "rosa@example.com" };

    it("sin tutores, muestra —", () => {
      render(<PacientesTable pacientes={[paciente]} />);
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
    });

    it("con un tutor, muestra su nombre", () => {
      render(<PacientesTable pacientes={[{ ...paciente, tutores: [tutor1] }]} />);
      expect(screen.getByText("Julián Ortiz")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Ver tutores" })).not.toBeInTheDocument();
    });

    // 2026-10-17 (pedido de la persona): "Ver tutores" pasa a ser el mismo
    // botón que "Ver teléfonos" y abre un modal con cada tutor, en vez de
    // llevar a la ficha.
    it("con más de un tutor, 'Ver tutores' abre un modal con todos, sin navegar", async () => {
      const user = userEvent.setup();
      render(<PacientesTable pacientes={[{ ...paciente, tutores: [tutor1, tutor2] }]} />);
      expect(screen.queryByText("Julián Ortiz")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Ver tutores" }));
      const dialogo = await screen.findByRole("dialog", { name: "Tutores" });
      expect(within(dialogo).getByText("Julián Ortiz")).toBeInTheDocument();
      expect(within(dialogo).getByText("Familiar")).toBeInTheDocument();
      expect(within(dialogo).getByText("rosa@example.com")).toBeInTheDocument();
      expect(pushMock).not.toHaveBeenCalled();
    });
  });

  // Corrección de QA (2026-09-06, screenshot del cliente): en mobile,
  // Teléfono competía con Nombre/Estado por el ancho y quedaba recortado.
  // Pasa a max-md:hidden (mismo criterio que DNI/Email), visible desde
  // `md` como columna propia y, en mobile, dentro del panel desplegable.
  describe("Teléfono es una columna en todos los anchos (2026-10-12)", () => {
    it("Teléfono es una columna visible en la fila", () => {
      render(<PacientesTable pacientes={[paciente]} />);
      expect(screen.getByRole("cell", { name: paciente.telefono })).toBeInTheDocument();
    });

    it("no se repite en un panel desplegable", () => {
      render(<PacientesTable pacientes={[paciente]} />);
      expect(screen.getAllByText(paciente.telefono)).toHaveLength(1);
    });
  });

  // Hasta el 2026-10-12, en el celular tocar la fila desplegaba un panel
  // con las columnas escondidas y un botón "Ver ficha" propio (pedido del
  // 2026-09-06). Desde las correcciones generales (ítem 9) el celular ve la
  // tabla completa, con scroll de costado, y tocar la fila hace lo mismo
  // que en la computadora: lleva a la ficha.
  describe("en mobile, tocar la fila navega como en la computadora (2026-10-12)", () => {
    function mockearMobile() {
      const original = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
      return () => {
        window.matchMedia = original;
      };
    }

    it("tocar la fila navega a la ficha, sin desplegar nada", async () => {
      const restaurar = mockearMobile();
      try {
        const user = userEvent.setup();
        render(<PacientesTable pacientes={[paciente]} />);

        await user.click(screen.getByText("30111222"));

        expect(pushMock).toHaveBeenCalledWith("/panel/pacientes/p-1");
        expect(screen.queryByRole("button", { name: "Ocultar datos" })).not.toBeInTheDocument();
      } finally {
        restaurar();
      }
    });

    it("hay un solo link a la ficha por fila, el del nombre", () => {
      const restaurar = mockearMobile();
      try {
        render(<PacientesTable pacientes={[paciente]} />);
        const links = screen.getAllByRole("link", { name: "Bruno Iglesias" });
        expect(links).toHaveLength(1);
        expect(links[0]).toHaveAttribute("href", "/panel/pacientes/p-1");
      } finally {
        restaurar();
      }
    });
  });

  // Fase 2.4.1, pedido explícito del cliente: columna "Estado" con
  // VERIFICADO en verde / NO VERIFICADO en naranja.
  describe("columna Estado (Fase 2.4.1)", () => {
    it("paciente verificado muestra el badge verde VERIFICADO", () => {
      render(<PacientesTable pacientes={[{ ...paciente, verificado: true }]} />);

      const badge = screen.getByText("VERIFICADO");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("border-salvia", "bg-salvia-claro", "text-salvia-oscuro");
    });

    it("paciente no verificado muestra el badge naranja NO VERIFICADO", () => {
      render(<PacientesTable pacientes={[{ ...paciente, verificado: false }]} />);

      const badge = screen.getByText("NO VERIFICADO");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("border-terracota", "bg-terracota-claro", "text-terracota-oscuro");
    });

    it("sin el campo verificado (fixture vieja), se trata como no verificado", () => {
      render(<PacientesTable pacientes={[paciente]} />);
      expect(screen.getByText("NO VERIFICADO")).toBeInTheDocument();
    });
  });

  // Fase B de la auditoría: la tabla recibe una TANDA, no la lista
  // entera. Sin el total no hay forma de saber si falta algo, así que
  // el pie solo aparece cuando de verdad quedan filas por traer.
  describe("Cargar más", () => {
    const otro = { ...paciente, id: "p-2", nombre: "Carla", apellido: "Mendez", dni: "30111333" };

    it("no muestra el pie cuando ya está todo cargado", () => {
      render(<PacientesTable pacientes={[paciente]} totalInicial={1} filtros={{}} />);
      expect(screen.queryByRole("button", { name: /Cargar más/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
    });

    it("sin totalInicial asume que lo recibido es todo (no ofrece cargar más)", () => {
      render(<PacientesTable pacientes={[paciente]} />);
      expect(screen.queryByRole("button", { name: /Cargar más/ })).not.toBeInTheDocument();
    });

    it("ofrece cargar el resto y suma la tanda nueva a la que ya estaba", async () => {
      listPacientesPaginadoActionMock.mockResolvedValue({ items: [otro], total: 2 });
      const user = userEvent.setup();
      render(<PacientesTable pacientes={[paciente]} totalInicial={2} filtros={{ q: "me" }} />);

      expect(screen.getByText("Mostrando 1 de 2 pacientes")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cargar más (1)" }));

      // El offset es la cantidad YA cargada — es lo que evita repetir
      // filas o saltearlas, y los filtros vigentes viajan con el pedido.
      await waitFor(() => expect(listPacientesPaginadoActionMock).toHaveBeenCalledWith({ q: "me" }, 50, 1));
      expect(await screen.findByText("Carla Mendez")).toBeInTheDocument();
      expect(screen.getByText("Bruno Iglesias")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Cargar más/ })).not.toBeInTheDocument();
    });
  });

  // El bug que el cliente reportó como "solo desaparece al refrescar la
  // página" (2026-09-19).
  //
  // La tabla copiaba las props a `useState`, cuyo inicializador corre una
  // sola vez: los datos nuevos que trae `router.refresh()` —después de
  // resolver un conflicto, o al cambiar de clínica— se ignoraban, y solo
  // un F5 (que la desmonta) actualizaba la pantalla.
  it("muestra los datos nuevos cuando el servidor vuelve a renderizar", () => {
    const otro = { ...paciente, id: "p-2", nombre: "Muru", apellido: "Zabal", dni: "44020992" };
    const { rerender } = render(<PacientesTable pacientes={[paciente, otro]} totalInicial={2} />);
    expect(screen.getByText("Muru Zabal")).toBeInTheDocument();

    // El servidor ya no lo trae: se resolvió el conflicto y su ficha se
    // fusionó.
    rerender(<PacientesTable pacientes={[paciente]} totalInicial={1} />);

    expect(screen.queryByText("Muru Zabal")).not.toBeInTheDocument();
    expect(screen.getByText("Bruno Iglesias")).toBeInTheDocument();
  });

  // Fase 3.2.6, mockup `pacientes-recepcion.html`: en la vista general
  // cada ficha muestra avatares apilados de quiénes la tienen entre sus
  // pacientes.
  describe("la columna Profesionales (vista de toda la clínica)", () => {
    const conDos = {
      ...paciente,
      profesionales: [
        { userId: "u1", nombre: "Lucía Gómez" },
        { userId: "u2", nombre: "Marcos Díaz" },
      ],
    };

    it("dibuja una inicial por profesional, con el nombre completo al pasar el mouse", () => {
      render(<PacientesTable pacientes={[conDos]} />);

      expect(screen.getByText("Profesionales")).toBeInTheDocument();
      expect(screen.getByTitle("Lucía Gómez")).toHaveTextContent("LG");
      expect(screen.getByTitle("Marcos Díaz")).toHaveTextContent("MD");
    });

    // Pasado el tercero la pila deja de leerse y el número dice lo mismo
    // en menos espacio (es lo que dibuja el mockup).
    it("con más de tres, muestra tres y un +N", () => {
      const conCinco = {
        ...paciente,
        profesionales: [1, 2, 3, 4, 5].map((n) => ({
          userId: `u${n}`,
          nombre: `Nombre${n} Apellido${n}`,
        })),
      };
      render(<PacientesTable pacientes={[conCinco]} />);

      expect(screen.getByText("+2")).toBeInTheDocument();
      expect(screen.getByTitle("Nombre1 Apellido1")).toBeInTheDocument();
      expect(screen.queryByTitle("Nombre4 Apellido4")).not.toBeInTheDocument();
    });

    // En la vista de un profesional son todas suyas: el backend no manda
    // el dato y la columna no se dibuja.
    it("sin el dato, la columna no existe", () => {
      render(<PacientesTable pacientes={[paciente]} />);

      expect(screen.queryByText("Profesionales")).not.toBeInTheDocument();
    });
  });
});