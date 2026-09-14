import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClinicaDelUsuario } from "@dental-mirage/shared-types";

const {
  entrarEnClinicaActionMock,
  generarCodigoInvitacionActionMock,
  onboardingClinicaActionMock,
  onboardingPerfilActionMock,
} = vi.hoisted(() => ({
  entrarEnClinicaActionMock: vi.fn(),
  generarCodigoInvitacionActionMock: vi.fn(),
  onboardingClinicaActionMock: vi.fn(),
  onboardingPerfilActionMock: vi.fn(),
}));

vi.mock("@/app/actions/clinicas", () => ({
  entrarEnClinicaAction: entrarEnClinicaActionMock,
  generarCodigoInvitacionAction: generarCodigoInvitacionActionMock,
}));

// El formulario de alta de clínica se renderiza DE VERDAD: desde la Fase
// 3.2.3 vive acá adentro (antes era el paso 2 del modal de bienvenida), y
// esta suite es la que verifica que siga funcionando en su casa nueva.
vi.mock("@/app/actions/auth", () => ({
  onboardingClinicaAction: onboardingClinicaActionMock,
  onboardingPerfilAction: onboardingPerfilActionMock,
}));

const { DondeTrabajas } = await import("./donde-trabajas");

function clinica(over: Partial<ClinicaDelUsuario> = {}): ClinicaDelUsuario {
  return {
    id: "clinica-1",
    nombre: "Consultorio Propio",
    slug: "consultorio-propio",
    tipo: "individual",
    direccion: "Av. Colón 1240",
    ciudad: "Córdoba",
    provincia: "Córdoba",
    roles: ["owner", "admin", "profesional"],
    rolPrincipal: "owner",
    esPropia: true,
    profesionales: 3,
    activa: false,
    ...over,
  };
}

const perfilQueNoAtiende = {
  tipoPerfil: "actividades" as const,
  nombre: "Lucía",
  apellido: "Mostrador",
  telefonoPrefijo: "+54",
  telefono: "+5493511234567",
  matriculaTipo: "nacional" as const,
  matriculaNumero: "",
  especialidades: [],
};

// Ubicación y contacto son obligatorios desde la ronda de QA del
// 2026-09-13: son los datos que la página pública muestra y por los que el
// buscador encuentra a la clínica.
async function completarClinica(nombre: string) {
  await userEvent.click(screen.getByRole("button", { name: /Clínica individual/ }));
  await userEvent.type(screen.getByLabelText("Nombre de tu clínica o consultorio"), nombre);
  await userEvent.selectOptions(screen.getByLabelText("Provincia"), "Córdoba");
  await userEvent.type(screen.getByLabelText("Ciudad"), "Córdoba");
  await userEvent.type(screen.getByLabelText("Dirección"), "Av. Colón 1240");
  await userEvent.type(screen.getByLabelText("Teléfono de contacto"), "3511234567");
}

describe("DondeTrabajas (Fase 3.2.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("separa la clínica propia de las de colegas", () => {
    render(
      <DondeTrabajas
        clinicas={[
          clinica(),
          clinica({ id: "clinica-2", nombre: "Clínica Del Colega", esPropia: false, rolPrincipal: "profesional" }),
        ]}
      />,
    );

    expect(screen.getByText("Consultorio Propio")).toBeInTheDocument();
    expect(screen.getByText("Titular")).toBeInTheDocument();
    expect(screen.getByText("Clínica Del Colega")).toBeInTheDocument();
    expect(screen.getByText("Profesional")).toBeInTheDocument();
    expect(screen.getByText("1 clínica")).toBeInTheDocument();
  });

  it("muestra dirección y cantidad de profesionales", () => {
    render(<DondeTrabajas clinicas={[clinica()]} />);
    expect(screen.getByText("Av. Colón 1240, Córdoba · 3 profesionales")).toBeInTheDocument();
  });

  // Alguien que entró a la app porque un colega lo sumó puede no tener
  // clínica propia nunca — el lugar de "Mi clínica" lo ocupa la invitación
  // a crearla, no un hueco.
  it("sin clínica propia, ofrece crearla", async () => {
    render(<DondeTrabajas clinicas={[]} />);

    const crear = screen.getByRole("button", { name: /Crear mi clínica/ });
    expect(screen.getByText("Todavía no trabajás en otras clínicas")).toBeInTheDocument();
    expect(screen.getByText("Ninguna todavía")).toBeInTheDocument();

    await userEvent.click(crear);
    expect(screen.getByRole("button", { name: /Clínica individual/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Organización/ })).toBeInTheDocument();
  });

  it("elegir organización avisa que las invitaciones llegan después", async () => {
    render(<DondeTrabajas clinicas={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /Crear mi clínica/ }));
    await userEvent.click(screen.getByRole("button", { name: /Organización/ }));

    expect(screen.getByText(/próximamente/i)).toBeInTheDocument();
  });

  it("crea la clínica con los datos cargados", async () => {
    onboardingClinicaActionMock.mockResolvedValue(undefined);
    render(<DondeTrabajas clinicas={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /Crear mi clínica/ }));
    await completarClinica("Clínica Games");
    await userEvent.click(screen.getByRole("button", { name: "Crear mi clínica" }));

    await waitFor(() =>
      expect(onboardingClinicaActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: "individual",
          nombre: "Clínica Games",
          provincia: "Córdoba",
          ciudad: "Córdoba",
          direccion: "Av. Colón 1240",
        }),
      ),
    );
  });

  // Sin ubicación ni contacto el alta no pasa, y cada campo dice lo suyo.
  it("ubicación y contacto son obligatorios", async () => {
    render(<DondeTrabajas clinicas={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /Crear mi clínica/ }));
    await userEvent.click(screen.getByRole("button", { name: /Clínica individual/ }));
    await userEvent.type(screen.getByLabelText("Nombre de tu clínica o consultorio"), "Clínica Games");
    await userEvent.click(screen.getByRole("button", { name: "Crear mi clínica" }));

    expect(await screen.findByText("Elegí la provincia.")).toBeInTheDocument();
    expect(screen.getByText("La ciudad es obligatoria.")).toBeInTheDocument();
    expect(screen.getByText("La dirección es obligatoria.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá un teléfono válido.")).toBeInTheDocument();
    expect(onboardingClinicaActionMock).not.toHaveBeenCalled();
  });

  // A diferencia del modal de bienvenida viejo, de este SÍ se sale: crear
  // una clínica dejó de ser obligatorio.
  it("se puede cancelar el alta y volver a la pantalla", async () => {
    render(<DondeTrabajas clinicas={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /Crear mi clínica/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("button", { name: /Clínica individual/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear mi clínica/ })).toBeInTheDocument();
  });

  it("al entrar, manda la clínica elegida a la acción", async () => {
    entrarEnClinicaActionMock.mockResolvedValue(undefined);
    render(<DondeTrabajas clinicas={[clinica({ id: "la-elegida" })]} />);

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(entrarEnClinicaActionMock).toHaveBeenCalledWith("la-elegida"));
  });

  it("si entrar falla, lo dice en la tarjeta y no deja la pantalla en blanco", async () => {
    entrarEnClinicaActionMock.mockResolvedValue({ error: "no trabajás en esa clínica" });
    render(<DondeTrabajas clinicas={[clinica()]} />);

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no trabajás en esa clínica");
  });

  it("genera el código de invitación y después ofrece generar otro", async () => {
    generarCodigoInvitacionActionMock.mockResolvedValue({ codigo: "PR-ABCD-EFGH", venceAt: "2026-09-14T12:00:00Z" });
    render(<DondeTrabajas clinicas={[clinica()]} />);

    await userEvent.click(screen.getByRole("button", { name: "Generar mi código" }));

    expect(await screen.findByText("PR-ABCD-EFGH")).toBeInTheDocument();
    expect(screen.getByText(/Vence en 24 horas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar otro" })).toBeInTheDocument();
  });

  // Un código que ya estaba vigente se muestra sin tener que volver a
  // generarlo — generar otro invalida el anterior, así que pedirlo de
  // nuevo para verlo sería romper el que la persona ya compartió.
  it("muestra el código que ya estaba vigente", () => {
    render(<DondeTrabajas clinicas={[clinica()]} codigoInicial={{ codigo: "PR-WXYZ-1234", venceAt: "2026-09-14T12:00:00Z" }} />);

    expect(screen.getByText("PR-WXYZ-1234")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar otro" })).toBeInTheDocument();
  });

  it("si generar el código falla, lo dice", async () => {
    generarCodigoInvitacionActionMock.mockResolvedValue({ error: "no se pudo generar el código" });
    render(<DondeTrabajas clinicas={[clinica()]} />);

    await userEvent.click(screen.getByRole("button", { name: "Generar mi código" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no se pudo generar el código");
  });

  it("sin dirección cargada, muestra solo cuántos profesionales atienden", () => {
    render(<DondeTrabajas clinicas={[clinica({ direccion: null, ciudad: null, profesionales: 1 })]} />);
    expect(screen.getByText("1 profesional")).toBeInTheDocument();
  });

  // Los roles los define el backend; si algún día suma uno que esta
  // pantalla no conoce, se muestra tal cual en vez de dejar el lugar
  // vacío.
  it("un rol desconocido se muestra tal cual", () => {
    render(<DondeTrabajas clinicas={[clinica({ rolPrincipal: "suplente" as ClinicaDelUsuario["rolPrincipal"] })]} />);
    expect(screen.getByText("suplente")).toBeInTheDocument();
  });

  it("copia el código al portapapeles y lo confirma", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<DondeTrabajas clinicas={[clinica()]} codigoInicial={{ codigo: "PR-WXYZ-1234", venceAt: "2026-09-14T12:00:00Z" }} />);

    await userEvent.click(screen.getByRole("button", { name: "Copiar" }));

    expect(writeText).toHaveBeenCalledWith("PR-WXYZ-1234");
    expect(await screen.findByRole("button", { name: "Copiado" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  // Sin permiso de portapapeles el código igual está a la vista: no hay
  // nada que avisar, pero tampoco puede romperse la pantalla.
  it("si el portapapeles falla, no rompe nada", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("sin permiso")) } });
    render(<DondeTrabajas clinicas={[clinica()]} codigoInicial={{ codigo: "PR-WXYZ-1234", venceAt: "2026-09-14T12:00:00Z" }} />);

    await userEvent.click(screen.getByRole("button", { name: "Copiar" }));

    expect(screen.getByText("PR-WXYZ-1234")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  // --- Ronda de QA del 2026-09-13 (ver la bitácora de la fase) ---

  // Antes el botón quedaba gris hasta elegir el tipo, sin decir por qué:
  // "un botón gris sin explicación deja al usuario adivinando qué falta".
  it("el botón de crear nunca está deshabilitado y el error dice qué falta", async () => {
    render(<DondeTrabajas clinicas={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /Crear mi clínica/ }));

    const crear = screen.getByRole("button", { name: "Crear mi clínica" });
    expect(crear).toBeEnabled();

    await userEvent.click(crear);

    expect(await screen.findByText("Elegí el tipo de clínica.")).toBeInTheDocument();
    expect(onboardingClinicaActionMock).not.toHaveBeenCalled();

    // Con el tipo elegido aparecen los campos, y el que falta avisa.
    await userEvent.click(screen.getByRole("button", { name: /Clínica individual/ }));
    await userEvent.click(crear);

    expect(await screen.findByText("El nombre de la clínica es obligatorio.")).toBeInTheDocument();
    expect(onboardingClinicaActionMock).not.toHaveBeenCalled();
  });

  // Corrección de QA del 2026-09-13: el orden de la pantalla es el de la
  // decisión — primero qué clase de clínica es, después sus datos.
  it("los datos de la clínica aparecen recién con el tipo elegido", async () => {
    render(<DondeTrabajas clinicas={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /Crear mi clínica/ }));

    expect(screen.queryByLabelText("Nombre de tu clínica o consultorio")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Provincia")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Clínica individual/ }));

    expect(screen.getByLabelText("Nombre de tu clínica o consultorio")).toBeInTheDocument();
    expect(screen.getByLabelText("Provincia")).toBeInTheDocument();
  });

  // Campo libre ensuciaba la base con "Cordoba", "CBA", "córdoba" — y esa
  // columna es la que filtra el buscador público.
  it("provincia es una lista cerrada, y va antes que ciudad", async () => {
    render(<DondeTrabajas clinicas={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /Crear mi clínica/ }));
    await userEvent.click(screen.getByRole("button", { name: /Clínica individual/ }));

    const provincia = screen.getByLabelText("Provincia");
    expect(provincia.tagName).toBe("SELECT");
    await userEvent.selectOptions(provincia, "Córdoba");
    expect(provincia).toHaveValue("Córdoba");

    const ciudad = screen.getByLabelText("Ciudad");
    expect(provincia.compareDocumentPosition(ciudad) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("la tarjeta elegida queda marcada como seleccionada", async () => {
    render(<DondeTrabajas clinicas={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /Crear mi clínica/ }));

    const individual = screen.getByRole("button", { name: /Clínica individual/ });
    expect(individual).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(individual);
    expect(individual).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Organización/ })).toHaveAttribute("aria-pressed", "false");
  });

  // El teléfono de la clínica es UNA columna en la base, así que el
  // prefijo y el número se unen al enviar.
  it("manda el teléfono con el prefijo del país adelante", async () => {
    onboardingClinicaActionMock.mockResolvedValue(undefined);
    render(<DondeTrabajas clinicas={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /Crear mi clínica/ }));
    await completarClinica("Clínica Games");
    await userEvent.click(screen.getByRole("button", { name: "Crear mi clínica" }));

    await waitFor(() =>
      expect(onboardingClinicaActionMock).toHaveBeenCalledWith(expect.objectContaining({ telefono: "+54 3511234567" })),
    );
  });

  // --- Armar la clínica propia sin ser profesional (Fase 3.2.3) ---
  //
  // Quien entró a la app para hacer recepción o administrar la página no
  // cargó matrícula, porque no se le pidió. Para tener clínica propia sí
  // hace falta: se le piden los datos que faltan antes del alta, sin
  // sacarlo de esta pantalla.
  it("a quien no atiende le pide primero los datos profesionales", async () => {
    render(<DondeTrabajas clinicas={[]} perfil={perfilQueNoAtiende} especialidades={[{ id: "esp-1", nombre: "Ortodoncia" }]} />);

    await userEvent.click(screen.getByRole("button", { name: /Crear mi clínica/ }));

    expect(screen.getByRole("heading", { name: "Completá tus datos profesionales" })).toBeInTheDocument();
    // Y no el alta de la clínica todavía.
    expect(screen.queryByRole("button", { name: /Clínica individual/ })).not.toBeInTheDocument();
  });

  it("completados los datos, sigue derecho al alta de la clínica", async () => {
    onboardingPerfilActionMock.mockResolvedValue(undefined);
    render(<DondeTrabajas clinicas={[]} perfil={perfilQueNoAtiende} especialidades={[{ id: "esp-1", nombre: "Ortodoncia" }]} />);

    await userEvent.click(screen.getByRole("button", { name: /Crear mi clínica/ }));
    await userEvent.selectOptions(screen.getByLabelText("Matrícula — tipo"), "nacional");
    await userEvent.type(screen.getByLabelText("Matrícula — número"), "MP-1");
    await userEvent.click(screen.getByRole("button", { name: "Ortodoncia" }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    // El encadenado no redirige: la pantalla sigue viva y abre el modal
    // siguiente.
    await waitFor(() =>
      expect(onboardingPerfilActionMock).toHaveBeenCalledWith(expect.objectContaining({ tipoPerfil: "profesional" }), {
        redirigir: false,
      }),
    );
    expect(await screen.findByRole("button", { name: /Clínica individual/ })).toBeInTheDocument();
  });

  it("quien ya es profesional va derecho al alta", async () => {
    render(
      <DondeTrabajas
        clinicas={[]}
        perfil={{ ...perfilQueNoAtiende, tipoPerfil: "profesional", matriculaNumero: "MP-1" }}
        especialidades={[]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Crear mi clínica/ }));

    expect(screen.getByRole("button", { name: /Clínica individual/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Completá tus datos profesionales" })).not.toBeInTheDocument();
  });

  // El mismo modal, el otro camino: entrar a una clínica donde el rol es
  // profesional. Es el caso que trae la 3.2.4 — alguien se registra para
  // hacer recepción en una clínica y otra lo invita a atender pacientes.
  it("antes de entrar como profesional pide los datos que faltan", async () => {
    const comoProfesional = clinica({ id: "la-que-atiende", esPropia: false, roles: ["profesional"], rolPrincipal: "profesional" });
    render(
      <DondeTrabajas
        clinicas={[comoProfesional]}
        perfil={perfilQueNoAtiende}
        especialidades={[{ id: "esp-1", nombre: "Ortodoncia" }]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(screen.getByRole("heading", { name: "Completá tus datos profesionales" })).toBeInTheDocument();
    expect(entrarEnClinicaActionMock).not.toHaveBeenCalled();
  });

  it("completados los datos, entra sin pedirlos de nuevo", async () => {
    onboardingPerfilActionMock.mockResolvedValue(undefined);
    entrarEnClinicaActionMock.mockResolvedValue(undefined);
    const comoProfesional = clinica({ id: "la-que-atiende", esPropia: false, roles: ["profesional"], rolPrincipal: "profesional" });
    render(
      <DondeTrabajas
        clinicas={[comoProfesional]}
        perfil={perfilQueNoAtiende}
        especialidades={[{ id: "esp-1", nombre: "Ortodoncia" }]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await userEvent.selectOptions(screen.getByLabelText("Matrícula — tipo"), "nacional");
    await userEvent.type(screen.getByLabelText("Matrícula — número"), "MP-1");
    await userEvent.click(screen.getByRole("button", { name: "Ortodoncia" }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(entrarEnClinicaActionMock).toHaveBeenCalledWith("la-que-atiende"));
  });

  // Donde NO atiende no se le pide nada: ahí la matrícula no hace falta.
  it("a una clínica donde hace recepción entra derecho", async () => {
    entrarEnClinicaActionMock.mockResolvedValue(undefined);
    const deRecepcion = clinica({ id: "la-del-mostrador", esPropia: false, roles: ["recepcion"], rolPrincipal: "recepcion" });
    render(<DondeTrabajas clinicas={[deRecepcion]} perfil={perfilQueNoAtiende} especialidades={[]} />);

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(entrarEnClinicaActionMock).toHaveBeenCalledWith("la-del-mostrador"));
    expect(screen.queryByRole("heading", { name: "Completá tus datos profesionales" })).not.toBeInTheDocument();
  });
});

