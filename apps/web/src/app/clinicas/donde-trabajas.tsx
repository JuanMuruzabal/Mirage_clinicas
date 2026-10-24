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
import { Despliegue } from "@/components/panel/despliegue";
import {
  CLASE_ANTETITULO_DE_TARJETA,
  CLASE_BOTON_DE_TARJETA,
  CLASE_BOTON_DE_TARJETA_ENLAZADA,
  CLASE_DESCRIPCION_DE_TARJETA,
  CLASE_TITULO_DE_TARJETA,
  TarjetaConDibujo,
} from "@/components/tarjeta-con-dibujo";

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
        <h2 className="font-[family-name:var(--font-mono)] tabular-nums text-xs uppercase tracking-widest text-marca">Mi clínica</h2>
        {/* Las tarjetas entran con `Despliegue` (TR-180), como las de
            "¿Qué necesitás hoy?", la pantalla siguiente: no con
            `ScrollReveal`, cuya `opacity` en un ancestro le cortaba el
            desenfoque al vidrio mientras duraba la entrada. */}
        <Despliegue orden={0}>
          {propia ? (
            <TarjetaClinica
              clinica={propia}
              onEntrar={() => pedirEntrar(propia)}
              pendiente={entrando === propia.id}
              error={errorEntrar?.clinicaId === propia.id ? errorEntrar.mensaje : undefined}
            />
          ) : (
            <TarjetaCrearClinica onClick={pedirCrearClinica} />
          )}
        </Despliegue>
      </section>

      <section className="flex flex-col gap-4">
        {/* Sin el contador de al lado ("Ninguna todavía", "3 clínicas"):
            ítem 15, pedido de la persona (2026-10-19). */}
        <h2 className="font-[family-name:var(--font-mono)] tabular-nums text-xs uppercase tracking-widest text-marca">Otras clínicas</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Las invitaciones sin confirmar van PRIMERO: son lo único de
              esta pantalla que espera una decisión (Fase 3.2.4). */}
          {sinResponder.map((invitacion, i) => (
            <Despliegue key={invitacion.id} orden={1 + i} className="h-full">
              <TarjetaInvitacion
                invitacion={invitacion}
                onAceptar={() => pedirAceptar(invitacion)}
                onRechazar={() => setRespondidas((previas) => [...previas, invitacion.id])}
                error={errorEntrar?.clinicaId === invitacion.id ? errorEntrar.mensaje : undefined}
              />
            </Despliegue>
          ))}
          {otras.length === 0 && sinResponder.length === 0 ? (
            <Despliegue orden={1} className="h-full">
              <div className="vidrio encabezado-seccion flex h-full flex-col gap-2 px-5 py-4.5 sm:px-6 sm:py-5">
                <h3 className="font-[family-name:var(--font-display)] text-xl leading-tight font-semibold tracking-tight text-marca">
                  Todavía no trabajás en otras clínicas
                </h3>
                <p className="text-[15px] text-grafito">
                  Cuando un colega te invite, o cuando uses un código de invitación, la clínica va a aparecer acá y vas a poder
                  cambiar de una a otra sin cerrar sesión.
                </p>
              </div>
            </Despliegue>
          ) : (
            otras.map((clinica, i) => (
              <Despliegue key={clinica.id} orden={1 + sinResponder.length + i} className="h-full">
                <TarjetaClinica
                  clinica={clinica}
                  otra
                  onEntrar={() => pedirEntrar(clinica)}
                  pendiente={entrando === clinica.id}
                  error={errorEntrar?.clinicaId === clinica.id ? errorEntrar.mensaje : undefined}
                />
              </Despliegue>
            ))
          )}
          <Despliegue orden={1 + sinResponder.length + Math.max(otras.length, 1)} className="h-full">
            <Unirme codigoInicial={codigoInicial} />
          </Despliegue>
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

// LAS TARJETAS DE ESTA PANTALLA (ítems 14 y 15, 2026-10-19) son
// `TarjetaConDibujo`, el mismo armado de las de "¿Qué necesitás hoy?": el
// vidrio con la carátula, el título en petróleo, la descripción en grafito,
// el botón delineado de 44 px y una escena de la paleta común que cambia de
// color. "Mi clínica" va a lo ancho, como las de servicio; las de "Otras
// clínicas" van en columna (la grilla es de dos), y las clínicas de ahí son
// BLANCAS y sin la descripción (ítem 15). La invitación sigue de vidrio a
// propósito: es la única tarjeta que espera una decisión.

// TarjetaClinica no decide si se puede entrar: avisa al padre, que es
// quien sabe si antes hay que pedir los datos profesionales que faltan.
function TarjetaClinica({
  clinica,
  otra = false,
  onEntrar,
  pendiente = false,
  error,
}: {
  clinica: ClinicaDelUsuario;
  /** Una de "Otras clínicas": blanca, en columna y sin la descripción. */
  otra?: boolean;
  onEntrar: () => void;
  pendiente?: boolean;
  error?: string;
}) {
  // Sin el rol de arriba ni la línea de dirección y profesionales (ítem 15,
  // pedido de la persona, 2026-10-19): la tarjeta dice qué clínica es y
  // ofrece entrar, nada más.
  return (
    <TarjetaConDibujo dibujo={otra ? "otra-clinica" : "clinica"} disposicion={otra ? "columna" : "fila"} blanca={otra}>
      <h3 className={CLASE_TITULO_DE_TARJETA}>{clinica.nombre}</h3>
      {!otra && (
        <p className={CLASE_DESCRIPCION_DE_TARJETA}>
          Tu clínica. Desde acá manejás la agenda, los pacientes y tu página pública.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error}
        </p>
      )}
      <div className="mt-auto pt-3">
        <button type="button" disabled={pendiente} onClick={onEntrar} className={CLASE_BOTON_DE_TARJETA}>
          {pendiente ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </TarjetaConDibujo>
  );
}

function TarjetaCrearClinica({ onClick }: { onClick: () => void }) {
  return (
    <TarjetaConDibujo onClick={onClick} dibujo="crear-clinica">
      <h3 className={CLASE_TITULO_DE_TARJETA}>Crear mi clínica</h3>
      <p className={`mb-3 ${CLASE_DESCRIPCION_DE_TARJETA}`}>
        Tu propio consultorio, con su agenda, sus pacientes y su página pública. Podés crearla ahora o esperar a que un colega te
        sume al equipo del suyo.
      </p>
      <span className={`mt-auto self-start ${CLASE_BOTON_DE_TARJETA_ENLAZADA}`}>Empezar</span>
    </TarjetaConDibujo>
  );
}

// Unirme — el código con el que la persona se ofrece para que una clínica
// la sume. La dirección del pedido es al revés que la de una invitación:
// acá el profesional se ofrece y la clínica lo carga (Fase 3.2.4). De vidrio
// (pedido de la persona, 2026-10-19), como el aviso de "todavía no trabajás".
function Unirme({ codigoInicial }: { codigoInicial?: CodigoInvitacion }) {
  const [codigo, setCodigo] = useState<CodigoInvitacion | undefined>(codigoInicial);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  return (
    <article className="vidrio encabezado-seccion flex h-full flex-col gap-1.5 px-5 py-4.5 sm:px-6 sm:py-5">
      <h3 className={CLASE_TITULO_DE_TARJETA}>Unirme a otra clínica</h3>
      <p className={CLASE_DESCRIPCION_DE_TARJETA}>
        Generá tu código y pasáselo a la clínica para que te sumen al equipo. También podés darles el mail de tu cuenta y que te
        manden la invitación desde ahí.
      </p>

      {codigo && (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-field border border-marca-medio bg-marfil py-1 pr-1 pl-4">
          <code className="font-[family-name:var(--font-codigo)] text-lg tracking-widest text-grafito">{codigo.codigo}</code>
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
            className="ml-auto inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold text-marca hover:bg-velo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
          >
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
      )}

      {codigo && <p className="text-xs text-grafito/75">Vence en 24 horas. La clínica lo carga desde Colaboradores.</p>}

      {error && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error}
        </p>
      )}

      <div className="mt-auto pt-3">
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
          className={CLASE_BOTON_DE_TARJETA}
        >
          {pendiente ? "Generando…" : codigo ? "Generar otro" : "Generar mi código"}
        </button>
      </div>
    </article>
  );
}

// TarjetaInvitacion — una clínica que me invitó y todavía no confirmé.
//
// Va en "Otras clínicas" junto a las que ya son mías, con su estado
// (pedido del cliente, 2026-09-13). Se ve distinta a propósito —de vidrio,
// entre las blancas—: es la única tarjeta de la pantalla que no lleva a
// ningún lado hasta que se tome una decisión.
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
    <TarjetaConDibujo dibujo="invitacion" disposicion="columna">
      <p className={CLASE_ANTETITULO_DE_TARJETA}>Pendiente a confirmar</p>
      <h3 className={CLASE_TITULO_DE_TARJETA}>{invitacion.nombreClinica}</h3>
      <p className={CLASE_DESCRIPCION_DE_TARJETA}>
        Te invitaron como {ETIQUETA_ROL[invitacion.rol] ?? invitacion.rol}. Hasta que confirmes, no ves nada de esa
        clínica ni ellos de lo tuyo.
      </p>

      {(error || errorLocal) && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error ?? errorLocal}
        </p>
      )}

      {/* Confirmar y Rechazar, del mismo alto y con el mismo radio: el
          primario es la acción que la tarjeta espera. */}
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-3">
        <button
          type="button"
          disabled={pendiente}
          onClick={onAceptar}
          className="inline-flex min-h-11 items-center justify-center rounded-control boton-primario px-5 text-sm font-semibold"
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
          className={CLASE_BOTON_DE_TARJETA}
        >
          Rechazar
        </button>
      </div>
    </TarjetaConDibujo>
  );
}
