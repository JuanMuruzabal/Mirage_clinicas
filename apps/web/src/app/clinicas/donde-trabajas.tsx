"use client";

import { useState, useTransition } from "react";
import type {
  ClinicaDelUsuario,
  CodigoInvitacion,
  Especialidad,
  InvitacionRecibida,
  PerfilProfesional,
} from "@dental-mirage/shared-types";
import { entrarEnClinicaAction, generarCodigoInvitacionAction } from "@/app/actions/clinicas";
import { aceptarInvitacionAction, rechazarInvitacionAction } from "@/app/actions/equipo";
import { OnboardingClinicaForm } from "@/app/sumarse/onboarding-clinica-form";
import { OnboardingPerfilForm } from "@/app/sumarse/onboarding-perfil-form";
import { QuadrantMark } from "@/components/quadrant-mark";

interface DondeTrabajasProps {
  clinicas: ClinicaDelUsuario[];
  codigoInicial?: CodigoInvitacion;
  perfil?: PerfilProfesional;
  especialidades?: Especialidad[];
  /** Clínicas que me invitaron y todavía no confirmé (Fase 3.2.4). */
  invitaciones?: InvitacionRecibida[];
}

// Qué hacer una vez completados los datos profesionales que faltaban.
type Despues =
  | { clase: "crear-clinica" }
  | { clase: "entrar"; clinicaId: string }
  | { clase: "aceptar"; invitacionId: string };

const ETIQUETA_ROL: Record<string, string> = {
  owner: "Titular",
  admin: "Administrador de página",
  profesional: "Profesional",
  recepcion: "Recepción",
};

// "¿Dónde trabajás hoy?" — Fase 3.2.3, mockup `donde-trabajas-hoy.html`.
//
// El brief: "al iniciar sesión o abrir la aplicación con una sesión activa
// siempre me llevará a este apartado, este siempre será el inicio de
// partida". De acá se entra a una clínica; todo lo demás del panel asume
// que esa elección ya se hizo.
export function DondeTrabajas({
  clinicas,
  codigoInicial,
  perfil,
  especialidades = [],
  invitaciones = [],
}: DondeTrabajasProps) {
  const propia = clinicas.find((c) => c.esPropia);
  const otras = clinicas.filter((c) => !c.esPropia);
  // Armar la clínica propia exige matrícula, y quien entró a la app para
  // hacer recepción o administrar la página no la cargó — no se le pidió
  // (Fase 3.2.3). Antes del alta se le piden los datos profesionales que
  // faltan, en un modal encadenado, sin sacarlo de esta pantalla.
  const [datosProfesionalesListos, setDatosProfesionalesListos] = useState(false);
  const faltanDatosProfesionales =
    perfil !== undefined && perfil.tipoPerfil !== "profesional" && !datosProfesionalesListos;

  // Un solo modal de "completá tus datos profesionales" para los dos
  // caminos que necesitan lo mismo: armar la clínica propia, y ENTRAR a
  // una clínica donde el rol es `profesional`. El segundo es el caso que
  // trae la 3.2.4 — alguien se registra para hacer recepción en una
  // clínica y otra lo invita a atender pacientes.
  const [modal, setModal] = useState<
    { tipo: "no" } | { tipo: "datos-profesionales"; despues: Despues } | { tipo: "alta-clinica" }
  >({ tipo: "no" });

  // Las invitaciones aceptadas o rechazadas se sacan de la lista en el
  // acto: la acción revalida la página, pero el modal y la tarjeta viven
  // acá y tienen que reaccionar sin esperar al servidor.
  const [respondidas, setRespondidas] = useState<string[]>([]);
  const sinResponder = invitaciones.filter((inv) => !respondidas.includes(inv.id));

  const [entrando, setEntrando] = useState<string | null>(null);
  const [errorEntrar, setErrorEntrar] = useState<{ clinicaId: string; mensaje: string } | null>(null);
  const [, iniciarEntrada] = useTransition();

  function entrar(clinicaId: string) {
    setErrorEntrar(null);
    setEntrando(clinicaId);
    iniciarEntrada(async () => {
      const resultado = await entrarEnClinicaAction(clinicaId);
      // Si salió bien la acción ya redirigió y esto no se alcanza.
      setEntrando(null);
      if (resultado?.error) {
        setErrorEntrar({ clinicaId, mensaje: resultado.error });
      }
    });
  }

  function aceptar(invitacionId: string) {
    setErrorEntrar(null);
    iniciarEntrada(async () => {
      const resultado = await aceptarInvitacionAction(invitacionId);
      if (resultado.error) {
        setErrorEntrar({ clinicaId: invitacionId, mensaje: resultado.error });
        return;
      }
      setRespondidas((previas) => [...previas, invitacionId]);
    });
  }

  // Aceptar una invitación DE PROFESIONAL es la tercera puerta de la
  // misma regla de la 3.2.3: sin matrícula no se entra a atender. Mismo
  // modal, mismo encadenado.
  function pedirAceptar(invitacion: InvitacionRecibida) {
    if (faltanDatosProfesionales && invitacion.rol === "profesional") {
      setModal({ tipo: "datos-profesionales", despues: { clase: "aceptar", invitacionId: invitacion.id } });
      return;
    }
    aceptar(invitacion.id);
  }

  function pedirEntrar(clinica: ClinicaDelUsuario) {
    if (faltanDatosProfesionales && clinica.roles.includes("profesional")) {
      setModal({ tipo: "datos-profesionales", despues: { clase: "entrar", clinicaId: clinica.id } });
      return;
    }
    entrar(clinica.id);
  }

  function pedirCrearClinica() {
    setModal(
      faltanDatosProfesionales
        ? { tipo: "datos-profesionales", despues: { clase: "crear-clinica" } }
        : { tipo: "alta-clinica" },
    );
  }

  return (
    <>
      <section className="flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">Mi clínica</h2>
        {propia ? (
          <TarjetaClinica
            clinica={propia}
            ancha
            onEntrar={() => pedirEntrar(propia)}
            pendiente={entrando === propia.id}
            error={errorEntrar?.clinicaId === propia.id ? errorEntrar.mensaje : undefined}
          />
        ) : (
          <TarjetaCrearClinica onClick={pedirCrearClinica} />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">Otras clínicas</h2>
          <span className="text-sm text-grafito/50">
            {otras.length + sinResponder.length === 0
              ? "Ninguna todavía"
              : `${otras.length + sinResponder.length} ${otras.length + sinResponder.length === 1 ? "clínica" : "clínicas"}`}
          </span>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* Las invitaciones sin confirmar van PRIMERO: son lo único de
              esta pantalla que espera una decisión (Fase 3.2.4). */}
          {sinResponder.map((invitacion) => (
            <TarjetaInvitacion
              key={invitacion.id}
              invitacion={invitacion}
              onAceptar={() => pedirAceptar(invitacion)}
              onRechazar={() => setRespondidas((previas) => [...previas, invitacion.id])}
              error={errorEntrar?.clinicaId === invitacion.id ? errorEntrar.mensaje : undefined}
            />
          ))}
          {otras.length === 0 && sinResponder.length === 0 ? (
            <div className="flex flex-col gap-2 rounded-card border border-dashed border-linea bg-transparent p-8">
              <h3 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">
                Todavía no trabajás en otras clínicas
              </h3>
              <p className="text-sm text-grafito/60">
                Cuando un colega te invite, o cuando uses un código de invitación, la clínica va a aparecer acá y vas a poder
                cambiar de una a otra sin cerrar sesión.
              </p>
            </div>
          ) : (
            otras.map((clinica) => (
              <TarjetaClinica
                key={clinica.id}
                clinica={clinica}
                onEntrar={() => pedirEntrar(clinica)}
                pendiente={entrando === clinica.id}
                error={errorEntrar?.clinicaId === clinica.id ? errorEntrar.mensaje : undefined}
              />
            ))
          )}
          <Unirme codigoInicial={codigoInicial} />
        </div>
      </section>

      {/* Los dos formularios traen su PROPIO modal (ModalShell: overlay,
          tarjeta, encabezado y pie fijos) desde la ronda de QA del
          2026-09-13. Envolverlos además en un AuthShell dejaba una
          segunda tarjeta rectangular asomando por detrás y dos capas de
          fondo oscuro superpuestas. Reportado con una captura en la
          segunda ronda de QA. */}
      {modal.tipo === "datos-profesionales" && (
        <OnboardingPerfilForm
          especialidades={especialidades}
          perfilInicial={perfil}
          soloProfesional
          onCancelar={() => setModal({ tipo: "no" })}
          onListo={() => {
            // El perfil ya es profesional. Se recuerda acá en vez de
            // refrescar la pantalla: un `router.refresh()` cerraría el
            // modal a mitad del encadenado, y la página se va a recargar
            // igual apenas se entre a la clínica o se cree la propia.
            setDatosProfesionalesListos(true);
            if (modal.despues.clase === "crear-clinica") {
              setModal({ tipo: "alta-clinica" });
              return;
            }
            setModal({ tipo: "no" });
            if (modal.despues.clase === "aceptar") {
              aceptar(modal.despues.invitacionId);
              return;
            }
            entrar(modal.despues.clinicaId);
          }}
        />
      )}

      {modal.tipo === "alta-clinica" && (
        <OnboardingClinicaForm
          onAtras={() => setModal({ tipo: "no" })}
          volverLabel="Cancelar"
          submitLabel="Crear mi clínica"
        />
      )}
    </>
  );
}

// TarjetaClinica no decide si se puede entrar: avisa al padre, que es
// quien sabe si antes hay que pedir los datos profesionales que faltan.
function TarjetaClinica({
  clinica,
  ancha = false,
  onEntrar,
  pendiente = false,
  error,
}: {
  clinica: ClinicaDelUsuario;
  ancha?: boolean;
  onEntrar: () => void;
  pendiente?: boolean;
  error?: string;
}) {
  const ubicacion = [clinica.direccion, clinica.ciudad].filter(Boolean).join(", ");
  const cuantos = `${clinica.profesionales} ${clinica.profesionales === 1 ? "profesional" : "profesionales"}`;

  return (
    <article
      className={`group relative flex h-full flex-col gap-3 rounded-card border border-linea bg-marfil p-8 shadow-soft transition-all duration-300 ease-out hover:border-salvia hover:shadow-lg ${
        ancha ? "sm:col-span-2" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <QuadrantMark className="text-salvia transition-transform duration-300 group-hover:scale-110 group-hover:text-salvia-oscuro" />
        <span className="rounded-full bg-salvia-claro px-3 py-1 text-xs font-medium text-salvia-oscuro">
          {ETIQUETA_ROL[clinica.rolPrincipal] ?? clinica.rolPrincipal}
        </span>
      </div>
      <h3 className="font-[family-name:var(--font-display)] text-2xl font-medium text-grafito">{clinica.nombre}</h3>
      <p className="text-sm text-grafito/60">
        {clinica.esPropia
          ? "Tu clínica. Desde acá manejás la agenda, los pacientes y tu página pública."
          : "Tu agenda y tus pacientes en esta clínica, separados del resto del equipo."}
      </p>
      <p className="font-[family-name:var(--font-mono)] text-xs text-grafito/45">
        {ubicacion ? `${ubicacion} · ${cuantos}` : cuantos}
      </p>
      {error && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={pendiente}
        onClick={onEntrar}
        className="mt-2 self-start text-sm font-medium text-salvia-oscuro transition-transform duration-300 hover:translate-x-1 hover:text-grafito disabled:opacity-60"
      >
        {pendiente ? "Entrando…" : "Entrar"}
      </button>
    </article>
  );
}

function TarjetaCrearClinica({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-3 rounded-card border border-linea bg-marfil p-8 text-left shadow-soft transition-all duration-300 ease-out hover:border-salvia hover:bg-hueso hover:shadow-lg sm:p-10"
    >
      <QuadrantMark className="text-salvia transition-transform duration-300 group-hover:scale-110 group-hover:text-salvia-oscuro" />
      <h3 className="font-[family-name:var(--font-display)] text-2xl font-medium text-grafito sm:text-3xl">Crear mi clínica</h3>
      <p className="text-sm text-grafito/60">
        Tu propio consultorio, con su agenda, sus pacientes y su página pública. Podés crearla ahora o esperar a que un colega te
        sume al equipo del suyo.
      </p>
      <span className="mt-2 text-sm font-medium text-salvia-oscuro transition-transform duration-300 group-hover:translate-x-1 group-hover:text-grafito">
        Empezar
      </span>
    </button>
  );
}

// Unirme — el código con el que la persona se ofrece para que una clínica
// la sume. La dirección del pedido es al revés que la de una invitación:
// acá el profesional se ofrece y la clínica lo carga (Fase 3.2.4).
function Unirme({ codigoInicial }: { codigoInicial?: CodigoInvitacion }) {
  const [codigo, setCodigo] = useState<CodigoInvitacion | undefined>(codigoInicial);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  return (
    <article className="flex h-full flex-col gap-3 rounded-card border border-dashed border-salvia bg-salvia-claro/40 p-8">
      <h3 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">Unirme a otra clínica</h3>
      <p className="text-sm text-grafito/60">
        Generá tu código y pasáselo a la clínica para que te sumen al equipo. También podés darles el mail de tu cuenta y que te
        manden la invitación desde ahí.
      </p>

      {codigo && (
        <div className="flex flex-wrap items-center gap-3 rounded-field border border-salvia bg-marfil px-4 py-3">
          <code className="font-[family-name:var(--font-mono)] text-lg tracking-widest text-grafito">{codigo.codigo}</code>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(codigo.codigo);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1800);
              } catch {
                // Sin permiso de portapapeles el código igual está a la
                // vista para copiarlo a mano: no hay nada que avisar.
              }
            }}
            className="ml-auto text-sm font-medium text-salvia-oscuro hover:text-grafito"
          >
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
      )}

      {codigo && <p className="text-xs text-grafito/45">Vence en 24 horas. La clínica lo carga desde Colaboradores.</p>}

      {error && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            setError(null);
            const resultado = await generarCodigoInvitacionAction();
            if ("error" in resultado) {
              setError(resultado.error);
              return;
            }
            setCodigo(resultado);
          })
        }
        className="mt-auto self-start rounded-full border border-salvia bg-marfil px-5 py-2.5 text-sm font-medium text-salvia-oscuro hover:bg-hueso hover:text-grafito disabled:opacity-60"
      >
        {pendiente ? "Generando…" : codigo ? "Generar otro" : "Generar mi código"}
      </button>
    </article>
  );
}

// TarjetaInvitacion — una clínica que me invitó y todavía no confirmé.
//
// Va en "Otras clínicas" junto a las que ya son mías, con su estado
// (pedido del cliente, 2026-09-13). Se ve distinta a propósito: es la
// única tarjeta de la pantalla que no lleva a ningún lado hasta que se
// tome una decisión.
function TarjetaInvitacion({
  invitacion,
  onAceptar,
  onRechazar,
  error,
}: {
  invitacion: InvitacionRecibida;
  onAceptar: () => void;
  onRechazar: () => void;
  error?: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  return (
    <article className="flex h-full flex-col gap-3 rounded-card border border-dashed border-salvia bg-salvia-claro/40 p-8">
      <div className="flex items-start justify-between gap-4">
        <QuadrantMark className="text-salvia" />
        <span className="rounded-full bg-marfil px-3 py-1 text-xs font-medium text-salvia-oscuro">
          Pendiente a confirmar
        </span>
      </div>
      <h3 className="font-[family-name:var(--font-display)] text-2xl font-medium text-grafito">
        {invitacion.nombreClinica}
      </h3>
      <p className="text-sm text-grafito/60">
        Te invitaron como {ETIQUETA_ROL[invitacion.rol] ?? invitacion.rol}. Hasta que confirmes, no ves nada de esa
        clínica ni ellos de lo tuyo.
      </p>

      {(error || errorLocal) && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error ?? errorLocal}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-4 pt-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={onAceptar}
          className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
        >
          Confirmar
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              setErrorLocal(null);
              const resultado = await rechazarInvitacionAction(invitacion.id);
              if (resultado.error) {
                setErrorLocal(resultado.error);
                return;
              }
              onRechazar();
            })
          }
          className="text-sm font-medium text-grafito/60 hover:text-terracota-oscuro disabled:opacity-60"
        >
          Rechazar
        </button>
      </div>
    </article>
  );
}
