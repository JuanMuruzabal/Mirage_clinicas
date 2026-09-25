import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PaginaPublica } from "@dental-mirage/shared-types";
import type { SesionCompleta } from "@/lib/session";

const {
  ocultarPaginaPublicaActionMock,
  publicarPaginaPublicaActionMock,
  actualizarPaginaPublicaActionMock,
  obtenerPaginaPublicaActionMock,
  subirFotoPaginaPublicaActionMock,
  historialPaginaPublicaActionMock,
  restaurarVersionPaginaPublicaActionMock,
} = vi.hoisted(() => ({
  ocultarPaginaPublicaActionMock: vi.fn(),
  publicarPaginaPublicaActionMock: vi.fn(),
  actualizarPaginaPublicaActionMock: vi.fn(),
  obtenerPaginaPublicaActionMock: vi.fn(),
  subirFotoPaginaPublicaActionMock: vi.fn(),
  historialPaginaPublicaActionMock: vi.fn(),
  restaurarVersionPaginaPublicaActionMock: vi.fn(),
}));

vi.mock("@/app/actions/pagina-publica", () => ({
  ocultarPaginaPublicaAction: ocultarPaginaPublicaActionMock,
  publicarPaginaPublicaAction: publicarPaginaPublicaActionMock,
  actualizarPaginaPublicaAction: actualizarPaginaPublicaActionMock,
  obtenerPaginaPublicaAction: obtenerPaginaPublicaActionMock,
  subirFotoPaginaPublicaAction: subirFotoPaginaPublicaActionMock,
  historialPaginaPublicaAction: historialPaginaPublicaActionMock,
  restaurarVersionPaginaPublicaAction: restaurarVersionPaginaPublicaActionMock,
}));
// La previsualización en vivo reusa ClinicaPublicaTemplate → PedirTurnoButton,
// que usa useSearchParams para leer `?enlace=` (Fase 2, ítem 5) — sin
// mock, jsdom no tiene ningún router real y el hook explota al montar.
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));

const { PaginaEditor } = await import("./pagina-editor");

const sesion: SesionCompleta = {
  id: "prof-1",
  email: "maria@example.com",
  nombre: "María",
  apellido: "Games",
  telefonoPrefijo: "+54",
  telefono: "+5493511234567",
  tipoPerfil: "profesional",
  matriculaTipo: "nacional",
  matriculaNumero: "MP-1",
  especialidades: [{ id: "esp-1", nombre: "Odontología general" }],
  nombreClinica: "Clínica Sonrisas",
  slug: "clinica-sonrisas",
  clinicaId: "c1",
  clinicaTipo: "individual",
  rol: "owner",
  roles: ["owner", "admin", "profesional"],
};

// paginaVacia — fixture base con todos los campos de la Fase 4.2
// (tema/módulos/estadísticas/etc.), sin elegir todavía: una página que
// nadie personalizó, que el editor arranca con la estructura por defecto.
const paginaVacia: PaginaPublica = {
  oculta: false,
  deployadaEn: null,
  tema: "",
  temaVariante: "",
  temaTipografia: "",
  redesSociales: {},
  mostrarMapa: false,
  nombreSobrePortada: false,
  nombreColor: "",
  temaTokens: {},
  modulos: [],
  estadisticas: {},
  revision: 0,
  actualizadaEn: "2026-01-01T00:00:00Z",
};

const panel = () => screen.getByRole("complementary", { name: "Panel de edición" });

// Agregar una sección vacía desde el catálogo (PP-6, H20): antes era un
// <select> + "Agregar".
async function agregarSeccion(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await user.click(within(panel()).getByRole("button", { name: "+ Agregar sección" }));
  const vacias = within(screen.getByRole("dialog", { name: "Agregar una sección" })).getByRole("region", { name: "Secciones" });
  await user.click(within(vacias).getByRole("button", { name: new RegExp(`^${nombre}`) }));
}

function campoTextoDelModulo(): HTMLTextAreaElement {
  const control = within(panel()).getAllByRole("textbox").find((element) => element.tagName === "TEXTAREA");
  if (!(control instanceof HTMLTextAreaElement)) throw new Error("No se encontró el campo de texto del módulo");
  return control;
}

// contenidoPublicadoDeVacia — lo que Publicar guardaría para paginaVacia: la
// estructura POR DEFECTO (sobre_nosotros + especialidades, ver
// modulosPorDefecto en lib/pagina-publica/modulos.ts), no un array vacío —
// borradorDeModulos([]) arma esa estructura para una página que nadie
// personalizó todavía.
const contenidoPublicadoDeVacia = {
  bio: null,
  tema: "",
  temaVariante: "",
  temaTipografia: "",
  redesSociales: {},
  mostrarMapa: false,
  nombreSobrePortada: false,
  nombreColor: "",
  temaTokens: {},
  modulos: [
    { tipo: "sobre_nosotros", orden: 0, visible: true, config: {} },
    { tipo: "especialidades", orden: 1, visible: true, config: {} },
  ],
};
const ultimaVersionPublicadaDeVacia = {
  numero: 1,
  publicadaEn: "2026-08-23T00:00:00Z",
  publicadaPorNombre: "María Games",
  contenido: contenidoPublicadoDeVacia,
};

describe("PaginaEditor — barra de acciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("el link 'Ver página' apunta al slug de la clínica, en una pestaña nueva", () => {
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaVacia} />);
    const link = screen.getByRole("link", { name: "Ver página" });
    expect(link).toHaveAttribute("href", "/clinica-sonrisas");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("sin publicar todavía, el botón dice 'Publicar'; al confirmar, aparece la insignia 'Publicada'", async () => {
    publicarPaginaPublicaActionMock.mockResolvedValue({
      pagina: { ...paginaVacia, deployadaEn: "2026-08-23T00:00:00Z", ultimaVersionPublicada: ultimaVersionPublicadaDeVacia },
    });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaVacia} />);

    expect(screen.queryByText("Publicada")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    expect(publicarPaginaPublicaActionMock).toHaveBeenCalledWith(sesion.slug);
    expect(await screen.findByText("Publicada")).toBeInTheDocument();
  });

  it("ya publicada y sin cambios sin publicar, el botón 'Publicar' queda deshabilitado y se ve la insignia", () => {
    render(
      <PaginaEditor
        sesion={sesion}
        paginaInicial={{ ...paginaVacia, deployadaEn: "2026-08-23T00:00:00Z", ultimaVersionPublicada: ultimaVersionPublicadaDeVacia }}
      />,
    );
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
    expect(screen.getByText("Publicada")).toBeInTheDocument();
  });

  it("'Ocultar' pone la página en mantenimiento y el botón pasa a decir 'Mostrar'", async () => {
    ocultarPaginaPublicaActionMock.mockResolvedValue({ pagina: { ...paginaVacia, oculta: true } });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaVacia} />);

    await user.click(screen.getByRole("button", { name: "Ocultar" }));

    expect(ocultarPaginaPublicaActionMock).toHaveBeenCalledWith(true);
    expect(await screen.findByRole("button", { name: "Mostrar" })).toBeInTheDocument();
    expect(screen.getByText(/en modo mantenimiento/)).toBeInTheDocument();
  });

  it("muestra el error de la acción sin romper el resto del panel", async () => {
    ocultarPaginaPublicaActionMock.mockResolvedValue({ error: "no se pudo actualizar la página" });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaVacia} />);

    await user.click(screen.getByRole("button", { name: "Ocultar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no se pudo actualizar la página");
  });

  it("botones deshabilitados mientras la acción está en curso", async () => {
    let resolver: (value: { pagina: PaginaPublica }) => void = () => {};
    publicarPaginaPublicaActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaVacia} />);

    await user.click(screen.getByRole("button", { name: "Publicar" }));
    expect(screen.getByRole("button", { name: "Publicando…" })).toBeDisabled();

    resolver({ pagina: { ...paginaVacia, deployadaEn: "2026-08-23T00:00:00Z", ultimaVersionPublicada: ultimaVersionPublicadaDeVacia } });
    await waitFor(() => expect(screen.getByText("Publicada")).toBeInTheDocument());
  });
});

describe("PaginaEditor — panel y vista previa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("el panel de edición se puede retraer y expandir de nuevo", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaVacia} />);

    // Retraído se oculta con CSS y solo desde lg (PP-5): debajo, el panel
    // siempre se ve. jsdom no evalúa media queries, así que se mira la clase.
    const contenido = () => screen.getByRole("tablist", { name: "Qué editar" }).parentElement!;
    expect(contenido()).not.toHaveClass("lg:hidden");
    await user.click(screen.getByRole("button", { name: "Retraer panel de edición" }));
    expect(screen.getByRole("button", { name: "Expandir panel de edición" })).toHaveAttribute("aria-expanded", "false");
    expect(contenido()).toHaveClass("lg:hidden");

    await user.click(screen.getByRole("button", { name: "Expandir panel de edición" }));
    expect(contenido()).not.toHaveClass("lg:hidden");
  });

  it("la previsualización muestra el nombre de la clínica (mismo componente que la página real)", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaVacia} />);
    await user.click(screen.getByRole("button", { name: "Cerrar galería de plantillas" }));
    expect(screen.getByText("Previsualización en vivo")).toBeInTheDocument();
    expect(screen.getAllByText("Clínica Sonrisas").length).toBeGreaterThan(0);
  });

  it("la previsualización se puede acotar a móvil, tablet o escritorio", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaVacia} />);
    // Una página vacía abre la galería inicial de plantillas, que tiene su
    // propia vista previa. Cerrar la galería para operar sobre la del editor.
    await user.click(screen.getByRole("button", { name: "Cerrar galería de plantillas" }));
    const marco = screen.getByTestId("vista-previa-marco");

    // El ancho va en una variable que solo aplica desde lg (PP-5, H17): en
    // un celular la vista previa es siempre el ancho real.
    const ancho = () => marco.style.getPropertyValue("--ancho-vista");
    expect(marco).toHaveClass("lg:max-w-(--ancho-vista)");
    expect(ancho()).toBe("100%");
    await user.click(screen.getByRole("radio", { name: "Móvil" }));
    expect(ancho()).toBe("390px");
    await user.click(screen.getByRole("radio", { name: "Tablet" }));
    expect(ancho()).toBe("768px");
  });

  it("en un celular se ve una cosa a la vez: Editar o Vista previa (PP-5)", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaVacia} />);
    await user.click(screen.getByRole("button", { name: "Cerrar galería de plantillas" }));
    const grupo = screen.getByRole("group", { name: "Qué mostrar" });
    const editar = within(grupo).getByRole("button", { name: "Editar" });
    const vista = within(grupo).getByRole("button", { name: "Vista previa" });
    const panel = screen.getByRole("complementary", { name: "Panel de edición" });
    const previa = screen.getByTestId("vista-previa-marco").closest(".min-w-0")!;

    expect(editar).toHaveAttribute("aria-pressed", "true");
    expect(panel).not.toHaveClass("hidden");
    expect(previa).toHaveClass("hidden");

    await user.click(vista);
    expect(vista).toHaveAttribute("aria-pressed", "true");
    expect(panel).toHaveClass("hidden");
    expect(previa).not.toHaveClass("hidden");
    // Desde lg las dos se ven igual.
    expect(panel).toHaveClass("lg:flex");
    expect(previa).toHaveClass("lg:flex");
  });

  it("en un celular Plantillas, Historial y Ocultar están en el menú Más (PP-5)", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaVacia} />);
    await user.click(screen.getByRole("button", { name: "Cerrar galería de plantillas" }));
    const mas = screen.getByRole("button", { name: "Más" });
    expect(mas).toHaveAttribute("aria-expanded", "false");
    await user.click(mas);
    expect(mas).toHaveAttribute("aria-expanded", "true");
    const lista = document.getElementById(mas.getAttribute("aria-controls")!)!;
    expect(within(lista).getByRole("link", { name: "Ver página" })).toHaveAttribute("href", `/${sesion.slug}`);
    expect(within(lista).getByRole("button", { name: "Ocultar la página" })).toBeInTheDocument();

    await user.click(within(lista).getByRole("button", { name: "Plantillas" }));
    expect(mas).toHaveAttribute("aria-expanded", "false");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

// --- Fase 4.4: edición real -------------------------------------------------

const paginaGuardada: PaginaPublica = {
  ...paginaVacia,
  bio: "Atendemos desde 1998.",
  direccionClinica: "Av. Colón 100",
  modulos: [
    { id: "m1", tipo: "sobre_nosotros", orden: 0, visible: true, config: {} },
    { id: "m2", tipo: "especialidades", orden: 1, visible: true, config: {} },
  ],
  revision: 5,
};

describe("PaginaEditor — edición", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("arranca sin cambios: 'Guardar cambios' deshabilitado y sin 'Descartar'", () => {
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Descartar" })).not.toBeInTheDocument();
  });

  it("una página que nadie personalizó arranca con la estructura por defecto", () => {
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaVacia} />);
    expect(within(panel()).getByRole("button", { name: "Sobre nosotros" })).toBeInTheDocument();
    expect(within(panel()).getByRole("button", { name: "Especialidades" })).toBeInTheDocument();
  });

  it("editar la bio actualiza la previsualización y habilita guardar", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={{ ...paginaGuardada, bio: null }} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(campoTextoDelModulo(), "Cuidamos tu sonrisa.");

    // Aparece en la vista previa (la página real) y no solo en el campo.
    expect(screen.getByRole("heading", { name: "Sobre nosotros" })).toBeInTheDocument();
    expect(screen.getByText("Tenés cambios sin guardar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("guardar manda el contenido completo, en el orden de la lista, y vuelve a 'sin cambios'", async () => {
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "ok", pagina: { ...paginaGuardada, bio: "Hola" } });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    const texto = campoTextoDelModulo();
    await user.clear(texto);
    await user.type(texto, "Hola");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(actualizarPaginaPublicaActionMock).toHaveBeenCalledTimes(1);
    expect(actualizarPaginaPublicaActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bio: "Hola",
        tema: "",
        modulos: [
          { tipo: "sobre_nosotros", orden: 0, visible: true, config: {} },
          { tipo: "especialidades", orden: 1, visible: true, config: {} },
        ],
      }),
    );
    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("PE-8: un 409 al guardar muestra quién y cuándo, y 'Recargar' trae el estado real del servidor", async () => {
    const conflicto = { error: "x", revisionActual: 9, actualizadaEn: "2026-09-22T10:00:00Z", actualizadaPorNombre: "Juan" };
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "conflicto", conflicto });
    obtenerPaginaPublicaActionMock.mockResolvedValue({ pagina: { ...paginaGuardada, bio: "Lo de Juan", revision: 9 } });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(campoTextoDelModulo(), " Más.");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Juan");
    expect(screen.getByRole("alert")).toHaveTextContent("mientras editabas");

    await user.click(screen.getByRole("button", { name: /Recargar/ }));
    expect(obtenerPaginaPublicaActionMock).toHaveBeenCalled();
    await waitFor(() => expect(campoTextoDelModulo()).toHaveValue("Lo de Juan"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("PE-8 + PP-2 (H6): 'Mantener mi copia' reintenta el guardado con la revisión nueva, en el mismo click", async () => {
    const conflicto = { error: "x", revisionActual: 9, actualizadaEn: "2026-09-22T10:00:00Z", actualizadaPorNombre: "Juan" };
    actualizarPaginaPublicaActionMock.mockResolvedValueOnce({ kind: "conflicto", conflicto });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(campoTextoDelModulo(), " Mío.");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByRole("alert");

    actualizarPaginaPublicaActionMock.mockResolvedValueOnce({ kind: "ok", pagina: { ...paginaGuardada, bio: "Atendemos desde 1998. Mío.", revision: 10 } });
    await user.click(screen.getByRole("button", { name: "Mantener mi copia" }));

    expect(actualizarPaginaPublicaActionMock).toHaveBeenCalledTimes(2);
    expect(actualizarPaginaPublicaActionMock).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 9, bio: "Atendemos desde 1998. Mío." }));
    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });


  it("si el backend rechaza el guardado, muestra el error y conserva el borrador", async () => {
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "error", error: "la bio admite hasta 2000 caracteres" });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(campoTextoDelModulo(), " Más.");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("la bio admite hasta 2000 caracteres");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(campoTextoDelModulo()).toHaveValue("Atendemos desde 1998. Más.");
  });

  it("'Descartar' vuelve al último estado guardado", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(campoTextoDelModulo(), " Más.");
    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(campoTextoDelModulo()).toHaveValue("Atendemos desde 1998.");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("Ocultar o Deployar no descartan lo que se está editando", async () => {
    ocultarPaginaPublicaActionMock.mockResolvedValue({ pagina: { ...paginaGuardada, oculta: true } });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(campoTextoDelModulo(), " Más.");
    await user.click(screen.getByRole("button", { name: "Ocultar" }));

    await screen.findByRole("button", { name: "Mostrar" });
    expect(campoTextoDelModulo()).toHaveValue("Atendemos desde 1998. Más.");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("agrega un módulo, lo reordena con las flechas y lo oculta", async () => {
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "ok", pagina: paginaGuardada });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await agregarSeccion(user, "Contacto");
    expect(within(panel()).getByRole("button", { name: "Contacto" })).toBeInTheDocument();

    // Contacto entró al final: subirlo dos lugares lo deja primero.
    await user.click(within(panel()).getByRole("button", { name: "Subir Contacto" }));
    await user.click(within(panel()).getByRole("button", { name: "Subir Contacto" }));
    expect(within(panel()).getByRole("button", { name: "Subir Contacto" })).toBeDisabled();

    await user.click(within(panel()).getByRole("button", { name: "Ocultar Contacto" }));
    expect(within(panel()).getByText("Oculto")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    const { modulos } = actualizarPaginaPublicaActionMock.mock.calls[0][0];
    expect(modulos.map((m: { tipo: string }) => m.tipo)).toEqual(["contacto", "sobre_nosotros", "especialidades"]);
    expect(modulos[0]).toMatchObject({ orden: 0, visible: false });
  });

  it("un módulo único ya agregado no se ofrece de nuevo, y el último no se puede quitar", async () => {
    const user = userEvent.setup();
    render(
      <PaginaEditor
        sesion={sesion}
        paginaInicial={{ ...paginaGuardada, modulos: [{ id: "m1", tipo: "contacto", orden: 0, visible: true, config: {} }] }}
      />,
    );
    await user.click(within(panel()).getByRole("button", { name: "+ Agregar sección" }));
    const vacias = within(screen.getByRole("dialog", { name: "Agregar una sección" })).getByRole("region", { name: "Secciones" });
    expect(within(vacias).queryByRole("button", { name: /^Contacto/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    await user.click(within(panel()).getByRole("button", { name: "Contacto" }));
    expect(within(panel()).getByRole("button", { name: "Quitar Contacto" })).toBeDisabled();
  });

  it("un texto libre nuevo pide título y texto, y se ve en la previsualización", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await agregarSeccion(user, "Texto libre");
    await user.type(within(panel()).getByPlaceholderText("Ej.: Nuestra filosofía"), "Financiación");
    await user.type(campoTextoDelModulo(), "Hasta 6 cuotas.");

    // Acotado a la vista previa: el mismo texto también está en el <textarea>.
    const vista = within(screen.getByTestId("vista-previa-marco"));
    expect(vista.getByRole("heading", { name: "Financiación" })).toBeInTheDocument();
    expect(vista.getByText("Hasta 6 cuotas.")).toBeInTheDocument();
  });

  it("elegir un tema cambia la vista previa, y cada tema ofrece sus propias variantes", async () => {
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "ok", pagina: paginaGuardada });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("tab", { name: "Diseño" }));
    expect(within(panel()).getByRole("radio", { name: /Original/ })).toBeChecked();
    await user.click(within(panel()).getByRole("radio", { name: /Clínico/ }));

    // Arranca con la primera variante y la primera tipografía del tema.
    expect(within(panel()).getByRole("radio", { name: "Teal" })).toBeChecked();
    await user.click(within(panel()).getByRole("radio", { name: "Azul acero" }));

    const marco = screen.getByTestId("vista-previa-marco");
    expect((marco.firstElementChild as HTMLElement).style.getPropertyValue("--pp-acento")).toBe("#3d6a8a");

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(actualizarPaginaPublicaActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ tema: "clinico", temaVariante: "clinico-2", temaTipografia: "condensada-institucional" }),
    );
  });

  it("volver a 'Original' limpia tema, variante y tipografía", async () => {
    const user = userEvent.setup();
    render(
      <PaginaEditor
        sesion={sesion}
        paginaInicial={{ ...paginaGuardada, tema: "clasico", temaVariante: "clasico-2", temaTipografia: "serif-clasica" }}
      />,
    );
    await user.click(within(panel()).getByRole("tab", { name: "Diseño" }));
    expect(within(panel()).getByRole("radio", { name: /Clásico/ })).toBeChecked();
    await user.click(within(panel()).getByRole("radio", { name: /Original/ }));
    expect(within(panel()).queryByRole("radiogroup", { name: "Variante de color" })).not.toBeInTheDocument();
  });

  it("sube la foto de portada, la muestra y la manda al guardar", async () => {
    subirFotoPaginaPublicaActionMock.mockResolvedValue({ url: "http://localhost:8080/uploads/portada.jpg" });
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "ok", pagina: paginaGuardada });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: /Portada/ }));
    await user.upload(within(panel()).getByLabelText("Subir foto de portada"), new File(["x"], "p.png", { type: "image/png" }));

    expect(await screen.findByAltText("Portada de Clínica Sonrisas")).toHaveAttribute("src", "http://localhost:8080/uploads/portada.jpg");
    expect(subirFotoPaginaPublicaActionMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(actualizarPaginaPublicaActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ fotoPortadaUrl: "http://localhost:8080/uploads/portada.jpg" }),
    );
  });

  it("si la subida falla, muestra el motivo y no cambia la página", async () => {
    subirFotoPaginaPublicaActionMock.mockResolvedValue({ error: "La subida de fotos todavía no está disponible en este entorno." });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: /Portada/ }));
    await user.upload(within(panel()).getByLabelText("Subir foto de portada"), new File(["x"], "p.png", { type: "image/png" }));

    expect(await within(panel()).findByRole("alert")).toHaveTextContent("todavía no está disponible");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("rechaza en el cliente una imagen de más de 5 MB sin llamar al servidor", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: /Portada/ }));
    const grande = new File(["x"], "grande.png", { type: "image/png" });
    Object.defineProperty(grande, "size", { value: 6 * 1024 * 1024 });
    await user.upload(within(panel()).getByLabelText("Subir foto de portada"), grande);

    expect(await within(panel()).findByRole("alert")).toHaveTextContent("5 MB");
    expect(subirFotoPaginaPublicaActionMock).not.toHaveBeenCalled();
  });

  it("estadísticas: se eligen de la lista cerrada y viajan en la config del módulo", async () => {
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "ok", pagina: paginaGuardada });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={{ ...paginaGuardada, estadisticas: { pacientes_atendidos: 12, turnos_realizados: 30 } }} />);

    await agregarSeccion(user, "Estadísticas");
    // Arrancan las dos marcadas; desmarcar "turnos realizados" deja una.
    await user.click(within(panel()).getByRole("checkbox", { name: /Turnos realizados/ }));

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByText("30")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    const { modulos } = actualizarPaginaPublicaActionMock.mock.calls[0][0];
    expect(modulos[2]).toMatchObject({ tipo: "estadisticas", config: { mostrar: ["pacientes_atendidos"] } });
  });

  it("contacto: la dirección de la clínica es la de fondo, y un override la pisa en la vista previa", async () => {
    const user = userEvent.setup();
    render(
      <PaginaEditor
        sesion={sesion}
        paginaInicial={{ ...paginaGuardada, modulos: [{ id: "m1", tipo: "contacto", orden: 0, visible: true, config: {} }] }}
      />,
    );
    expect(screen.getByText("Av. Colón 100")).toBeInTheDocument();

    await user.click(within(panel()).getByRole("button", { name: "Contacto" }));
    await user.type(within(panel()).getByLabelText(/Dirección/), "Bv. San Juan 200");
    expect(screen.getByText("Bv. San Juan 200")).toBeInTheDocument();
    expect(screen.queryByText("Av. Colón 100")).not.toBeInTheDocument();
  });
});

// --- Nombre propio de un módulo y nombre sobre la portada ------------------------

describe("PaginaEditor — nombre propio de cada módulo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const dosFotos: PaginaPublica = {
    ...paginaGuardada,
    modulos: [
      { id: "f1", tipo: "foto", orden: 0, visible: true, config: { subtipo: "banner", fotoUrl: "" } },
      { id: "f2", tipo: "foto", orden: 1, visible: true, config: { subtipo: "banner", fotoUrl: "" } },
    ],
  };

  it("dos módulos del mismo tipo se distinguen poniéndoles nombre, y la fila conserva el tipo como etiqueta", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={dosFotos} />);

    // Sin nombre son indistinguibles: dos filas "Foto".
    expect(within(panel()).getAllByRole("button", { name: "Foto" })).toHaveLength(2);

    await user.click(within(panel()).getAllByRole("button", { name: "Foto" })[0]);
    await user.type(within(panel()).getByLabelText(/Nombre en la lista/), "Sala de espera");

    // La fila se llama por el nombre propio y lleva el tipo como etiqueta al
    // lado ("Sala de espera" + "Foto").
    expect(within(panel()).getByRole("button", { name: "Sala de espera Foto" })).toBeInTheDocument();
    // Y los botones de la fila ya se llaman por el nombre nuevo.
    expect(within(panel()).getByRole("button", { name: "Bajar Sala de espera" })).toBeInTheDocument();
  });

  it("el nombre viaja en config.nombre, y borrarlo lo QUITA en vez de guardar una cadena vacía", async () => {
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "ok", pagina: dosFotos });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={dosFotos} />);

    await user.click(within(panel()).getAllByRole("button", { name: "Foto" })[0]);
    const campo = within(panel()).getByLabelText(/Nombre en la lista/);
    await user.type(campo, "Equipo");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(actualizarPaginaPublicaActionMock.mock.calls[0][0].modulos[0].config).toMatchObject({ nombre: "Equipo", subtipo: "banner" });
  });

  it("borrar el nombre vuelve al estado original: no queda un cambio fantasma por una cadena vacía", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={dosFotos} />);

    await user.click(within(panel()).getAllByRole("button", { name: "Foto" })[0]);
    const campo = within(panel()).getByLabelText(/Nombre en la lista/);
    await user.type(campo, "Equipo");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();

    await user.clear(campo);
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("aclara que el nombre es solo del editor", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);
    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    expect(within(panel()).getByText(/No cambia lo que ve el público/)).toBeInTheDocument();
  });

  it("el nombre propio NO cambia lo que ve el público: la previsualización sigue con el título de siempre", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);
    await user.click(within(panel()).getByRole("button", { name: "Especialidades" }));
    await user.type(within(panel()).getByLabelText(/Nombre en la lista/), "Lo que hacemos");

    const vista = within(screen.getByTestId("vista-previa-marco"));
    expect(vista.getByRole("heading", { name: "Especialidades" })).toBeInTheDocument();
    expect(vista.queryByText("Lo que hacemos")).not.toBeInTheDocument();
  });
});

// En la vista previa el nombre de la clínica no es un h1 (PP-2, H5): se
// busca por su texto.
describe("PaginaEditor — nombre de la clínica sobre la portada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const conPortada: PaginaPublica = { ...paginaGuardada, fotoPortadaUrl: "https://cdn.example.com/portada.jpg" };
  const casilla = () => within(panel()).getByRole("checkbox", { name: /nombre de la clínica sobre la foto/ });

  it("sin foto de portada, la opción está deshabilitada y explica por qué", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);
    await user.click(within(panel()).getByRole("button", { name: /Portada/ }));

    expect(casilla()).toBeDisabled();
    expect(within(panel()).getByText(/Subí una foto de portada/)).toBeInTheDocument();
    expect(within(panel()).getByRole("radio", { name: "Dorado" })).toBeDisabled();
  });

  it("con foto se puede poner el nombre encima, y la vista previa lo dibuja sobre la foto", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={conPortada} />);
    await user.click(within(panel()).getByRole("button", { name: /Portada/ }));

    const vista = () => within(screen.getByTestId("vista-previa-marco"));
    const foto = vista().getByAltText("Portada de Clínica Sonrisas");
    expect(foto.parentElement).not.toContainElement(vista().getByText("Clínica Sonrisas"));

    await user.click(casilla());
    expect(foto.parentElement).toContainElement(vista().getByText("Clínica Sonrisas"));
  });

  it("el color solo se puede elegir con el nombre sobre la foto, y cambia el color del nombre", async () => {
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "ok", pagina: conPortada });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={conPortada} />);
    await user.click(within(panel()).getByRole("button", { name: /Portada/ }));

    // Con el nombre debajo de la foto, los colores están apagados.
    expect(within(panel()).getByRole("radio", { name: "Dorado" })).toBeDisabled();
    await user.click(casilla());

    // Sin color elegido el default es blanco.
    expect(within(panel()).getByRole("radio", { name: "Blanco" })).toBeChecked();
    await user.click(within(panel()).getByRole("radio", { name: "Dorado" }));
    expect(within(panel()).getByRole("radio", { name: "Dorado" })).toBeChecked();

    expect(within(screen.getByTestId("vista-previa-marco")).getByText("Clínica Sonrisas")).toHaveStyle({ color: "#f2d27a" });

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(actualizarPaginaPublicaActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ nombreSobrePortada: true, nombreColor: "dorado" }),
    );
  });

  it("quitar la foto de portada deja el nombre debajo (la opción prendida no rompe nada)", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={{ ...conPortada, nombreSobrePortada: true, nombreColor: "negro" }} />);
    await user.click(within(panel()).getByRole("button", { name: /Portada/ }));
    expect(within(panel()).getByRole("radio", { name: "Negro" })).toBeChecked();

    await user.click(within(panel()).getByRole("button", { name: "Quitar" }));
    const vista = within(screen.getByTestId("vista-previa-marco"));
    expect(vista.queryByRole("img")).not.toBeInTheDocument();
    expect(vista.getByText("Clínica Sonrisas")).toHaveClass("text-(--pp-texto)");
    expect(casilla()).toBeDisabled();
  });
});

// --- PP-2: que Publicar publique lo que se ve, y una vista previa inerte ----

describe("PaginaEditor — PP-2: publicar lo que se ve (H3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const publicada: PaginaPublica = {
    ...paginaGuardada,
    deployadaEn: "2026-08-23T00:00:00Z",
    ultimaVersionPublicada: {
      ...ultimaVersionPublicadaDeVacia,
      contenido: {
        ...contenidoPublicadoDeVacia,
        bio: "Atendemos desde 1998.",
        modulos: [
          { tipo: "sobre_nosotros", orden: 0, visible: true, config: {} },
          { tipo: "especialidades", orden: 1, visible: true, config: {} },
        ],
      },
    },
  };

  it("con cambios sin guardar el botón es 'Guardar y publicar' y la insignia 'Publicada' desaparece", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={publicada} />);
    expect(screen.getByText("Publicada")).toBeInTheDocument();

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(campoTextoDelModulo(), " Más.");

    expect(screen.getByRole("button", { name: "Guardar y publicar" })).toBeEnabled();
    expect(screen.queryByText("Publicada")).not.toBeInTheDocument();
  });

  it("'Guardar y publicar' guarda primero y publica después", async () => {
    const guardadaAhora = { ...publicada, bio: "Atendemos desde 1998. Más.", revision: 6 };
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "ok", pagina: guardadaAhora });
    publicarPaginaPublicaActionMock.mockResolvedValue({ pagina: { ...guardadaAhora, deployadaEn: "2026-09-25T10:00:00Z" } });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={publicada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(campoTextoDelModulo(), " Más.");
    await user.click(screen.getByRole("button", { name: "Guardar y publicar" }));

    await waitFor(() => expect(publicarPaginaPublicaActionMock).toHaveBeenCalledWith(sesion.slug));
    expect(actualizarPaginaPublicaActionMock).toHaveBeenCalledWith(expect.objectContaining({ bio: "Atendemos desde 1998. Más." }));
    expect(actualizarPaginaPublicaActionMock.mock.invocationCallOrder[0]).toBeLessThan(publicarPaginaPublicaActionMock.mock.invocationCallOrder[0]);
  });

  it("si el guardado falla, no publica nada", async () => {
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "error", error: "no se pudo guardar" });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={publicada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(campoTextoDelModulo(), " Más.");
    await user.click(screen.getByRole("button", { name: "Guardar y publicar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no se pudo guardar");
    expect(publicarPaginaPublicaActionMock).not.toHaveBeenCalled();
  });
});

describe("PaginaEditor — PP-2: la vista previa no es la página real (H5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("'Pedir turno' en la vista previa no abre el wizard: avisa que ahí no funciona", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);
    const marco = screen.getByTestId("vista-previa-marco");

    await user.click(within(marco).getByRole("button", { name: "Pedir turno" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/En la vista previa los botones y enlaces no hacen nada/)).toBeInTheDocument();
  });

  it("la vista previa no emite un h1 ni repite los ids de la página", () => {
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);
    const marco = screen.getByTestId("vista-previa-marco");

    expect(within(marco).queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(marco.querySelector("#turno")).toBeNull();
    const turno = marco.querySelector("[id$='-turno']");
    expect(turno).not.toBeNull();
    expect(within(marco).getByRole("link", { name: "Pedí tu turno" })).toHaveAttribute("href", `#${turno!.id}`);
  });
});

// --- PP-3: deshacer, confirmar con un diálogo propio e historial -----------

describe("PaginaEditor — PP-3: deshacer en vez de confirmar (H19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("quitar un módulo no pregunta: avisa con 'Deshacer', y deshacer lo devuelve", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.click(within(panel()).getByRole("button", { name: "Quitar Sobre nosotros" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(within(panel()).queryByRole("button", { name: "Sobre nosotros" })).not.toBeInTheDocument();
    expect(screen.getByText("Quitaste “Sobre nosotros”.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(within(panel()).getByRole("button", { name: "Sobre nosotros" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deshacer" })).not.toBeInTheDocument();
    // Volvió al estado guardado: no queda un cambio fantasma.
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    confirm.mockRestore();
  });

  it("el próximo cambio cierra la opción de deshacer", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: "Especialidades" }));
    await user.click(within(panel()).getByRole("button", { name: "Quitar Especialidades" }));
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeInTheDocument();

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(campoTextoDelModulo(), " Más.");
    expect(screen.queryByRole("button", { name: "Deshacer" })).not.toBeInTheDocument();
  });

  it("aplicar una plantilla se puede deshacer", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(screen.getByRole("button", { name: "Plantillas" }));
    await user.click(screen.getByRole("button", { name: "Reemplazar todo el borrador" }));
    expect(screen.getByText(/Reemplazaste el borrador con/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });
});

describe("PaginaEditor — PP-3: publicar con textos de ejemplo (H10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function conTextosDeEjemplo() {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);
    await user.click(screen.getByRole("button", { name: "Plantillas" }));
    await user.click(screen.getByRole("button", { name: "Reemplazar todo el borrador" }));
    return user;
  }

  it("pregunta con un diálogo propio, no con window.confirm; cancelar no guarda ni publica", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const user = await conTextosDeEjemplo();
    await user.click(screen.getByRole("button", { name: "Guardar y publicar" }));

    const dialogo = screen.getByRole("dialog", { name: "Quedan textos de ejemplo" });
    expect(confirm).not.toHaveBeenCalled();
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(actualizarPaginaPublicaActionMock).not.toHaveBeenCalled();
    expect(publicarPaginaPublicaActionMock).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("'Publicar igual' guarda y publica", async () => {
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "ok", pagina: { ...paginaGuardada, revision: 6 } });
    publicarPaginaPublicaActionMock.mockResolvedValue({ pagina: { ...paginaGuardada, revision: 6, deployadaEn: "2026-09-25T10:00:00Z" } });
    const user = await conTextosDeEjemplo();
    await user.click(screen.getByRole("button", { name: "Guardar y publicar" }));
    await user.click(screen.getByRole("button", { name: "Publicar igual" }));

    await waitFor(() => expect(publicarPaginaPublicaActionMock).toHaveBeenCalledWith(sesion.slug));
    expect(actualizarPaginaPublicaActionMock).toHaveBeenCalledTimes(1);
  });
});

describe("PaginaEditor — PP-3: historial de publicaciones (H2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const versiones = [
    { ...ultimaVersionPublicadaDeVacia, numero: 2, publicadaEn: "2026-09-20T10:00:00Z", publicadaPorNombre: "Juan Pérez" },
    { ...ultimaVersionPublicadaDeVacia, numero: 1 },
  ];

  it("lista las versiones y restaura una en el borrador, con la revisión guardada, sin publicar", async () => {
    historialPaginaPublicaActionMock.mockResolvedValue({ versiones });
    restaurarVersionPaginaPublicaActionMock.mockResolvedValue({ kind: "ok", pagina: { ...paginaGuardada, bio: "Texto de la versión 1", revision: 6 } });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(screen.getByRole("button", { name: "Historial" }));
    const dialogo = screen.getByRole("dialog", { name: "Historial de publicaciones" });
    expect(await within(dialogo).findByText("Publicada ahora")).toBeInTheDocument();
    expect(within(dialogo).getByText(/Juan Pérez/)).toBeInTheDocument();

    await user.click(within(dialogo).getByRole("button", { name: "Restaurar la versión 1" }));

    expect(restaurarVersionPaginaPublicaActionMock).toHaveBeenCalledWith(1, 5);
    expect(publicarPaginaPublicaActionMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Versión 1 restaurada en el borrador. Publicá para que se vea.")).toBeInTheDocument();
  });

  it("con cambios sin guardar, restaurar pide confirmación en la fila antes de pisarlos", async () => {
    historialPaginaPublicaActionMock.mockResolvedValue({ versiones });
    restaurarVersionPaginaPublicaActionMock.mockResolvedValue({ kind: "ok", pagina: { ...paginaGuardada, revision: 6 } });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);
    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(campoTextoDelModulo(), " Más.");

    await user.click(screen.getByRole("button", { name: "Historial" }));
    const dialogo = screen.getByRole("dialog", { name: "Historial de publicaciones" });
    await user.click(await within(dialogo).findByRole("button", { name: "Restaurar la versión 2" }));

    expect(restaurarVersionPaginaPublicaActionMock).not.toHaveBeenCalled();
    expect(within(dialogo).getByText("Tenés cambios sin guardar: restaurar los reemplaza.")).toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: "Sí, restaurar la versión 2" }));
    expect(restaurarVersionPaginaPublicaActionMock).toHaveBeenCalledWith(2, 5);
  });

  it("un 409 al restaurar cierra el historial y muestra el aviso de conflicto", async () => {
    historialPaginaPublicaActionMock.mockResolvedValue({ versiones });
    restaurarVersionPaginaPublicaActionMock.mockResolvedValue({
      kind: "conflicto",
      conflicto: { error: "x", revisionActual: 9, actualizadaEn: "2026-09-22T10:00:00Z", actualizadaPorNombre: "Juan" },
    });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(screen.getByRole("button", { name: "Historial" }));
    await user.click(await screen.findByRole("button", { name: "Restaurar la versión 1" }));

    expect(await screen.findByText(/Juan guardó cambios/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("un error al restaurar se muestra dentro del historial, que queda abierto", async () => {
    historialPaginaPublicaActionMock.mockResolvedValue({ versiones });
    restaurarVersionPaginaPublicaActionMock.mockResolvedValue({ kind: "error", error: "no existe esa versión" });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(screen.getByRole("button", { name: "Historial" }));
    await user.click(await screen.findByRole("button", { name: "Restaurar la versión 1" }));

    const dialogo = screen.getByRole("dialog", { name: "Historial de publicaciones" });
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("no existe esa versión");
  });
});

describe("PaginaEditor — PP-6: un editor más simple", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("H20: con un módulo abierto, la sección nueva entra debajo de él", async () => {
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "ok", pagina: paginaGuardada });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.click(within(panel()).getByRole("button", { name: "+ Agregar sección" }));
    const dialogo = screen.getByRole("dialog", { name: "Agregar una sección" });
    expect(within(dialogo).getByRole("radio", { name: "Debajo de “Sobre nosotros”" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(within(dialogo).getByRole("region", { name: "Secciones" })).getByRole("button", { name: /^Contacto/ }));

    // Entra abierta, para editarla de una.
    expect(within(panel()).getByRole("button", { name: "Contacto" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    const { modulos } = actualizarPaginaPublicaActionMock.mock.calls[0][0];
    expect(modulos.map((m: { tipo: string }) => m.tipo)).toEqual(["sobre_nosotros", "contacto", "especialidades"]);
  });

  it("H20: el catálogo muestra una miniatura por sección, también las prearmadas", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);
    await user.click(within(panel()).getByRole("button", { name: "+ Agregar sección" }));
    const dialogo = screen.getByRole("dialog", { name: "Agregar una sección" });
    for (const nombre of ["Secciones", "Prearmadas"]) {
      const botones = within(within(dialogo).getByRole("region", { name: nombre })).getAllByRole("button");
      expect(botones.length).toBeGreaterThan(0);
      for (const b of botones) expect(b.querySelector("svg")).not.toBeNull();
    }
    // Sin módulo abierto no hay nada que elegir sobre dónde: va al final.
    expect(within(dialogo).queryByRole("radiogroup", { name: "Dónde" })).not.toBeInTheDocument();
  });

  it("H18: fondo, alineación y efectos quedan en «Más opciones», cerrado", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);
    await user.click(within(panel()).getByRole("button", { name: "Especialidades" }));
    const resumen = within(panel()).getByText("Más opciones");
    const detalles = resumen.closest("details")!;
    expect(detalles.open).toBe(false);
    expect(within(detalles).getByRole("radiogroup", { name: "Fondo de la sección" })).toBeInTheDocument();
    // El diseño de la sección sigue a la vista, fuera del desplegable.
    expect(within(panel()).getByRole("radiogroup", { name: "Diseño de la sección" }).closest("details")).toBeNull();
    await user.click(resumen);
    expect(detalles.open).toBe(true);
  });

  it("H18: Diseño arranca por los presets y termina con el movimiento", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);
    await user.click(within(panel()).getByRole("tab", { name: "Diseño" }));
    const titulos = within(screen.getByRole("tabpanel")).getAllByRole("heading").map((h) => h.textContent);
    expect(titulos[0]).toBe("Presets de estilo");
    expect(titulos.at(-1)).toBe("Movimiento");
  });

  it("H21: tocar una sección en la vista previa abre su módulo y lleva el foco ahí", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);
    const marco = screen.getByTestId("vista-previa-marco");
    const secciones = [...marco.querySelectorAll<HTMLElement>("[data-modulo]")];
    // La portada y un <section> por módulo visible.
    expect(secciones[0].dataset.modulo).toBe("portada");
    const especialidades = secciones.find((s) => s.dataset.modulo !== "portada" && s.textContent?.includes("Odontología general"))!;

    await user.click(especialidades);
    const fila = within(panel()).getByRole("button", { name: "Especialidades" });
    expect(fila).toHaveAttribute("aria-expanded", "true");
    expect(fila).toHaveFocus();
    // Y en la vista previa queda marcada como la abierta.
    expect(especialidades).toHaveClass("outline-salvia-oscuro");
  });

  it("H21: tocar la portada abre el editor de la portada, aunque se estuviera en otra pestaña", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);
    await user.click(within(panel()).getByRole("tab", { name: "Diseño" }));
    await user.click(screen.getByTestId("vista-previa-marco").querySelector<HTMLElement>('[data-modulo="portada"]')!);
    expect(within(panel()).getByRole("tab", { name: "Módulos" })).toHaveAttribute("aria-selected", "true");
    expect(within(panel()).getByRole("button", { name: /^Portada/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("H23: la pestaña se llama «Google y redes» y Ocultar dice qué está haciendo", async () => {
    let resolver: (v: unknown) => void = () => {};
    ocultarPaginaPublicaActionMock.mockReturnValue(new Promise((r) => (resolver = r)));
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} urlSitio="https://prisma.com.ar" />);
    expect(within(panel()).getByRole("tab", { name: "Google y redes" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(screen.getByRole("button", { name: "Ocultando…" })).toBeInTheDocument();
    resolver({ pagina: { ...paginaGuardada, oculta: true } });
    expect(await screen.findByRole("button", { name: "Mostrar" })).toBeInTheDocument();

    await user.click(within(panel()).getByRole("tab", { name: "Google y redes" }));
    expect(screen.getByRole("figure", { name: /vista previa en google/i })).toHaveTextContent(`prisma.com.ar › ${sesion.slug}`);
  });
});
