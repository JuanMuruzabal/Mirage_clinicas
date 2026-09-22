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
} = vi.hoisted(() => ({
  ocultarPaginaPublicaActionMock: vi.fn(),
  publicarPaginaPublicaActionMock: vi.fn(),
  actualizarPaginaPublicaActionMock: vi.fn(),
  obtenerPaginaPublicaActionMock: vi.fn(),
  subirFotoPaginaPublicaActionMock: vi.fn(),
}));

vi.mock("@/app/actions/pagina-publica", () => ({
  ocultarPaginaPublicaAction: ocultarPaginaPublicaActionMock,
  publicarPaginaPublicaAction: publicarPaginaPublicaActionMock,
  actualizarPaginaPublicaAction: actualizarPaginaPublicaActionMock,
  obtenerPaginaPublicaAction: obtenerPaginaPublicaActionMock,
  subirFotoPaginaPublicaAction: subirFotoPaginaPublicaActionMock,
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

    expect(screen.getByRole("tab", { name: "Módulos" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retraer panel de edición" }));
    expect(screen.queryByRole("tab", { name: "Módulos" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expandir panel de edición" }));
    expect(await screen.findByRole("tab", { name: "Módulos" })).toBeInTheDocument();
  });

  it("la previsualización muestra el nombre de la clínica (mismo componente que la página real)", () => {
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaVacia} />);
    expect(screen.getByText("Previsualización en vivo")).toBeInTheDocument();
    expect(screen.getAllByText("Clínica Sonrisas").length).toBeGreaterThan(0);
  });

  it("la previsualización se puede acotar a móvil, tablet o escritorio", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaVacia} />);
    const marco = screen.getByTestId("vista-previa-marco");

    expect(marco).toHaveStyle({ maxWidth: "100%" });
    await user.click(screen.getByRole("radio", { name: "Móvil" }));
    expect(marco).toHaveStyle({ maxWidth: "390px" });
    await user.click(screen.getByRole("radio", { name: "Tablet" }));
    expect(marco).toHaveStyle({ maxWidth: "768px" });
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
    await user.type(within(panel()).getByLabelText(/Texto/), "Cuidamos tu sonrisa.");

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
    const texto = within(panel()).getByLabelText(/Texto/);
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
    await user.type(within(panel()).getByLabelText(/Texto/), " Más.");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Juan");
    expect(screen.getByRole("alert")).toHaveTextContent("mientras editabas");

    await user.click(screen.getByRole("button", { name: /Recargar/ }));
    expect(obtenerPaginaPublicaActionMock).toHaveBeenCalled();
    expect(await within(panel()).findByLabelText(/Texto/)).toHaveValue("Lo de Juan");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("PE-8: 'Mantener mi copia' descarta el conflicto y deja reintentar con la revisión nueva", async () => {
    const conflicto = { error: "x", revisionActual: 9, actualizadaEn: "2026-09-22T10:00:00Z", actualizadaPorNombre: "Juan" };
    actualizarPaginaPublicaActionMock.mockResolvedValueOnce({ kind: "conflicto", conflicto });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(within(panel()).getByLabelText(/Texto/), " Mío.");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByRole("alert");

    actualizarPaginaPublicaActionMock.mockResolvedValueOnce({ kind: "ok", pagina: { ...paginaGuardada, bio: "Atendemos desde 1998. Mío.", revision: 10 } });
    await user.click(screen.getByRole("button", { name: "Mantener mi copia" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(panel()).getByLabelText(/Texto/)).toHaveValue("Atendemos desde 1998. Mío.");

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(actualizarPaginaPublicaActionMock).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 9 }));
  });

  it("si el backend rechaza el guardado, muestra el error y conserva el borrador", async () => {
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "error", error: "la bio admite hasta 2000 caracteres" });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(within(panel()).getByLabelText(/Texto/), " Más.");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("la bio admite hasta 2000 caracteres");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(within(panel()).getByLabelText(/Texto/)).toHaveValue("Atendemos desde 1998. Más.");
  });

  it("'Descartar' vuelve al último estado guardado", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(within(panel()).getByLabelText(/Texto/), " Más.");
    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(within(panel()).getByLabelText(/Texto/)).toHaveValue("Atendemos desde 1998.");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("Ocultar o Deployar no descartan lo que se está editando", async () => {
    ocultarPaginaPublicaActionMock.mockResolvedValue({ pagina: { ...paginaGuardada, oculta: true } });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.click(within(panel()).getByRole("button", { name: "Sobre nosotros" }));
    await user.type(within(panel()).getByLabelText(/Texto/), " Más.");
    await user.click(screen.getByRole("button", { name: "Ocultar" }));

    await screen.findByRole("button", { name: "Mostrar" });
    expect(within(panel()).getByLabelText(/Texto/)).toHaveValue("Atendemos desde 1998. Más.");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("agrega un módulo, lo reordena con las flechas y lo oculta", async () => {
    actualizarPaginaPublicaActionMock.mockResolvedValue({ kind: "ok", pagina: paginaGuardada });
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.selectOptions(within(panel()).getByLabelText("Agregar un módulo"), "contacto");
    await user.click(within(panel()).getByRole("button", { name: "Agregar" }));
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
    const opciones = within(within(panel()).getByLabelText("Agregar un módulo")).getAllByRole("option");
    expect(opciones.map((o) => o.textContent)).not.toContainEqual(expect.stringContaining("Contacto"));

    await user.click(within(panel()).getByRole("button", { name: "Contacto" }));
    expect(within(panel()).getByRole("button", { name: "Quitar Contacto" })).toBeDisabled();
  });

  it("un texto libre nuevo pide título y texto, y se ve en la previsualización", async () => {
    const user = userEvent.setup();
    render(<PaginaEditor sesion={sesion} paginaInicial={paginaGuardada} />);

    await user.selectOptions(within(panel()).getByLabelText("Agregar un módulo"), "texto_libre");
    await user.click(within(panel()).getByRole("button", { name: "Agregar" }));
    await user.type(within(panel()).getByLabelText(/Título/), "Financiación");
    await user.type(within(panel()).getByLabelText(/^Texto/), "Hasta 6 cuotas.");

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

    await user.selectOptions(within(panel()).getByLabelText("Agregar un módulo"), "estadisticas");
    await user.click(within(panel()).getByRole("button", { name: "Agregar" }));
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
    expect(foto.parentElement).not.toContainElement(vista().getByRole("heading", { level: 1 }));

    await user.click(casilla());
    expect(foto.parentElement).toContainElement(vista().getByRole("heading", { level: 1 }));
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

    expect(within(screen.getByTestId("vista-previa-marco")).getByRole("heading", { level: 1 })).toHaveStyle({ color: "#f2d27a" });

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
    expect(vista.getByRole("heading", { level: 1 })).toHaveClass("text-(--pp-texto)");
    expect(casilla()).toBeDisabled();
  });
});
