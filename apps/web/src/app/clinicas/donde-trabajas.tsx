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

// En minúscula: el rol siempre va en mitad de una frase ("Te invitaron como
// profesional.", "Trabajás acá como titular.").
const ETIQUETA_ROL: Record<string, string> = {
  owner: "titular",
  admin: "administrador de página",
  profesional: "profesional",
  recepcion: "recepción",
};

// "Mi clínica" y "Otras clínicas" son títulos de sección destacados, en la
// letra de los títulos y siempre más chicos que el h1 (pedido de la persona,
// ítem 8, 2026-10-25): en mono xs no se leían como el comienzo de algo. En
// petróleo, el color de marca (pedido de la persona, ítem 8, 25/10). A 24 px
// en todos los anchos (paso de diseño del ítem 8, 26/10): una escala de tres
// pasos, el h1 a 30/36, la sección a 24 y el
// título de cada tarjeta a 20. Con la sección a 30 en la computadora, del
// tamaño del h1, las dos líneas competían.
const CLASE_TITULO_DE_SECCION =
  "font-[family-name:var(--font-display)] text-2xl leading-tight font-semibold tracking-tight text-marca";

// Las tarjetas de vidrio sin carátula (el aviso de que no hay otras clínicas
// y "Unirme a otra clínica") llevan el texto donde lo lleva la carátula de
// `TarjetaConDibujo`: el margen de la segunda capa y el mismo relleno, así
// los títulos y los botones de la columna quedan en la misma vertical (con
// su propio relleno quedaban 5 px más a la izquierda).
const CLASE_VIDRIO_SIN_CARATULA = "vidrio encabezado-seccion p-[calc(var(--vidrio-margen)-1px)]";
const CLASE_CUERPO_SIN_CARATULA = "despliegue-cuerpo flex flex-col px-5 py-4.5 md:px-6 md:py-5";

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
  const sinNada = otras.length === 0 && sinResponder.length === 0;

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
        <h2 className={CLASE_TITULO_DE_SECCION}>Mi clínica</h2>
        {/* Las tarjetas entran con `Despliegue` (TR-180) y su fundido corto
            (ítem 8, 2026-10-25), como las de "¿Qué necesitás hoy?", la
            pantalla siguiente: no con `ScrollReveal`, cuya `opacity` en un
            ancestro le cortaba el desenfoque al vidrio mientras duraba la
            entrada. */}
        <Despliegue forma="fundido" orden={0}>
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
        <h2 className={CLASE_TITULO_DE_SECCION}>Otras clínicas</h2>

        {/* Una columna con todas las tarjetas a lo ancho, como "Mi clínica"
            (ítem 8, 2026-10-25; antes, una grilla de dos). El orden: las
            invitaciones, las clínicas (o el aviso de que no hay) y
            "Unirme a otra clínica" siempre al final. */}
        <div className="grid gap-4">
          {/* Las invitaciones sin confirmar van PRIMERO: son lo único de
              esta pantalla que espera una decisión (Fase 3.2.4). */}
          {sinResponder.map((invitacion, i) => (
            <Despliegue key={invitacion.id} forma="fundido" orden={1 + i}>
              <TarjetaInvitacion
                invitacion={invitacion}
                onAceptar={() => pedirAceptar(invitacion)}
                onRechazar={() => setRespondidas((previas) => [...previas, invitacion.id])}
                error={errorEntrar?.clinicaId === invitacion.id ? errorEntrar.mensaje : undefined}
              />
            </Despliegue>
          ))}
          {sinNada ? (
            <Despliegue forma="fundido" orden={1}>
              {/* El fundido va en el cuerpo de adentro y no en el vidrio: una
                  `opacity` en la tarjeta le corta el desenfoque. */}
              <div className={CLASE_VIDRIO_SIN_CARATULA}>
                <div className={`${CLASE_CUERPO_SIN_CARATULA} gap-2`}>
                  <h3 className="font-[family-name:var(--font-display)] text-xl leading-tight font-semibold tracking-tight text-marca">
                    Todavía no trabajás en otras clínicas
                  </h3>
                  <p className="text-[15px] text-grafito">
                    Cuando un colega te invite, o cuando uses un código de invitación, la clínica va a aparecer acá y vas a poder
                    cambiar de una a otra sin cerrar sesión.
                  </p>
                </div>
              </div>
            </Despliegue>
          ) : (
            otras.map((clinica, i) => (
              <Despliegue key={clinica.id} forma="fundido" orden={1 + sinResponder.length + i}>
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
          <Despliegue forma="fundido" orden={1 + sinResponder.length + (sinNada ? 1 : otras.length)}>
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
// color. Todas van a lo ancho y en fila, de vidrio y con su descripción,
// también las de "Otras clínicas" (pedido de la persona, ítem 8, 2026-10-25:
// antes eran blancas, sin descripción y en una grilla de dos columnas).

// Un rol que la web no conoce no se muestra crudo (ítem 8, 25/10): la
// persona leía la clave interna.
function descripcionDeOtraClinica(rol: string): string {
  const etiqueta = ETIQUETA_ROL[rol];
  return etiqueta ? `Trabajás acá como ${etiqueta}.` : "Trabajás en esta clínica.";
}

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
  /** Una de "Otras clínicas": su dibujo y su descripción dicen el rol. */
  otra?: boolean;
  onEntrar: () => void;
  pendiente?: boolean;
  error?: string;
}) {
  // Sin el rol de arriba ni la línea de dirección y profesionales (ítem 15,
  // pedido de la persona, 2026-10-19): la tarjeta dice qué clínica es y
  // ofrece entrar, nada más.
  return (
    <TarjetaConDibujo dibujo={otra ? "otra-clinica" : "clinica"}>
      <h3 className={CLASE_TITULO_DE_TARJETA}>{clinica.nombre}</h3>
      <p className={CLASE_DESCRIPCION_DE_TARJETA}>
        {otra
          ? descripcionDeOtraClinica(clinica.rolPrincipal)
          : "Tu clínica. Desde acá manejás la agenda, los pacientes y tu página pública."}
      </p>
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
// El fundido de entrada va en el cuerpo de adentro, no en el <article> de
// vidrio (ítem 8, 2026-10-25): una `opacity` ahí le corta el desenfoque.
function Unirme({ codigoInicial }: { codigoInicial?: CodigoInvitacion }) {
  const [codigo, setCodigo] = useState<CodigoInvitacion | undefined>(codigoInicial);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  return (
    <article className={CLASE_VIDRIO_SIN_CARATULA}>
      <div className={`${CLASE_CUERPO_SIN_CARATULA} gap-1.5`}>
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
      </div>
    </article>
  );
}

// TarjetaInvitacion — una clínica que me invitó y todavía no confirmé.
//
// Va en "Otras clínicas" junto a las que ya son mías, con su estado
// (pedido del cliente, 2026-09-13), en fila y a lo ancho como ellas (ítem 8,
// 2026-10-25). La distinguen el rótulo "Pendiente a confirmar" y sus dos
// botones: es la única tarjeta de la pantalla que no lleva a ningún lado
// hasta que se tome una decisión.
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
    <TarjetaConDibujo dibujo="invitacion">
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
