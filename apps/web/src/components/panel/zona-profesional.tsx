"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MiembroDelEquipo, VistaActual } from "@dental-mirage/shared-types";
import { elegirVistaAction } from "@/app/actions/topbar-panel";
import { IconChevronLeft, IconChevronRight, IconUsers } from "@/components/icons";

// ZonaProfesional — el control con el que recepción elige de quién es la
// vista que está mirando (Fase 3.2.6, mockups `panel-recepcionista-general.html`,
// `calendario-recepcion.html`, `turnos-recepcion.html` y
// `pacientes-recepcion.html`).
//
// Es UN control y va en la cabecera de CADA pantalla del panel, no en el
// header de la app: los cuatro mockups lo dibujan ahí, al lado del
// título, y tiene sentido — lo que se elige es el alcance de ESA
// pantalla, no del sitio. (La primera versión de esta subfase lo puso
// como un dropdown en el header global; estaba mal y se reemplazó por
// esto.)
//
// LAS FLECHAS NO SON UN ADORNO. Recepción atiende un teléfono y pasa de
// un profesional a otro todo el tiempo; con un menú, cada salto son dos
// clics y una lectura. Con `‹ ›` es un clic y la mirada no se mueve del
// nombre. El menú queda para ir a alguien puntual cuando son muchos.
//
// El texto de la etiqueta y el default cambian por pantalla, y eso
// también sale de los mockups:
//
//   - General     → "Viendo la agenda de", SIN opción general: el
//                   estado de un profesional a la vez.
//   - Calendario  → "Viendo la agenda de", con "Vista general" primero.
//   - Turnos      → "Mostrando", con "Toda la clínica" primero.
//   - Pacientes   → "Mostrando" / "Pacientes de", ídem.

export interface OpcionProfesional {
  userId: string;
  nombre: string;
  /** La especialidad, o el rol si todavía no cargó perfil. */
  detalle: string;
}

export function ZonaProfesional({
  profesionales,
  vista,
  etiqueta,
  etiquetaConFoco,
  conVistaGeneral = true,
  etiquetaGeneral = "Toda la clínica",
  detalleGeneral = "Turnos de todos los profesionales",
}: {
  profesionales: OpcionProfesional[];
  vista: VistaActual | null;
  /** Rótulo de arriba en la vista general ("Mostrando"). */
  etiqueta: string;
  /** Rótulo cuando hay alguien en foco. Si no se pasa, se usa el mismo. */
  etiquetaConFoco?: string;
  /** General no la ofrece: ahí siempre se mira a UN profesional. */
  conVistaGeneral?: boolean;
  etiquetaGeneral?: string;
  detalleGeneral?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function alClickearAfuera(evento: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) setAbierto(false);
    }
    function alApretarEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alClickearAfuera);
    document.addEventListener("keydown", alApretarEscape);
    return () => {
      document.removeEventListener("mousedown", alClickearAfuera);
      document.removeEventListener("keydown", alApretarEscape);
    };
  }, [abierto]);

  const enFocoId = vista?.profesional?.userId ?? null;
  const indice = profesionales.findIndex((p) => p.userId === enFocoId);
  // -1 es la vista general, igual que en los mockups.
  const actual = enFocoId === null ? -1 : indice;

  function elegir(userId: string) {
    iniciar(async () => {
      setError(null);
      const resultado = await elegirVistaAction(userId);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setAbierto(false);
      // Cambiar de vista cambia TODO lo que la pantalla muestra, y eso
      // sale del servidor: sin volver a pedirla, el control diría un
      // nombre y la tabla seguiría mostrando la agenda anterior.
      router.refresh();
    });
  }

  // El recorrido de las flechas incluye la vista general cuando existe,
  // y da la vuelta: es una rueda, no una lista con extremos. Con cuatro
  // profesionales, llegar al primero desde el último es un clic.
  const rueda: (string | null)[] = conVistaGeneral
    ? [null, ...profesionales.map((p) => p.userId)]
    : profesionales.map((p) => p.userId);

  function mover(paso: 1 | -1) {
    if (rueda.length === 0) return;
    const posActual = rueda.indexOf(enFocoId);
    const siguiente = rueda[(posActual + paso + rueda.length) % rueda.length];
    elegir(siguiente ?? "");
  }

  const enFoco = actual >= 0 ? profesionales[actual] : null;
  const nombre = enFoco ? enFoco.nombre : etiquetaGeneral;
  const detalle = enFoco ? enFoco.detalle : detalleGeneral;
  const rotulo = enFoco ? (etiquetaConFoco ?? etiqueta) : etiqueta;
  const conteo = enFoco ? `${actual + 1} de ${profesionales.length}` : etiquetaGeneral;

  return (
    <div className="flex w-full flex-col md:w-auto">
      {/* En verde, no en gris (2026-09-20, pedido del cliente: "para
          mejor visualización"). El rótulo y el conteo dicen QUÉ estoy
          mirando — en recepción eso no es metadato al margen, es la
          primera cosa que hay que poder leer de un vistazo antes de
          contestar un teléfono. */}
      <p className="mb-2 font-[family-name:var(--font-mono)] text-xs font-semibold tracking-[0.16em] text-salvia-oscuro uppercase">
        {rotulo}
      </p>

      <div ref={contenedor} className="relative">
        <div className="flex items-stretch overflow-hidden rounded-card border border-linea bg-marfil">
          <button
            type="button"
            aria-label="Profesional anterior"
            disabled={guardando || rueda.length < 2}
            onClick={() => mover(-1)}
            className="flex items-center px-3 text-grafito/60 transition-colors hover:bg-hueso hover:text-grafito disabled:opacity-40"
          >
            <IconChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            aria-expanded={abierto}
            aria-haspopup="true"
            aria-label="Elegir de quién es la vista"
            disabled={guardando}
            onClick={() => setAbierto((a) => !a)}
            className={`flex min-w-0 flex-1 items-center gap-3 border-x border-linea px-4 py-2.5 text-left transition-colors disabled:opacity-60 md:min-w-[15rem] ${
              abierto ? "bg-salvia-claro" : "hover:bg-hueso"
            }`}
          >
            <span
              aria-hidden="true"
              className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-salvia-claro font-[family-name:var(--font-display)] text-[13px] font-semibold text-salvia-oscuro"
            >
              {enFoco ? iniciales(enFoco.nombre) : <IconUsers className="h-[18px] w-[18px]" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-[family-name:var(--font-display)] text-[17px] leading-tight font-semibold tracking-wide text-grafito">
                {nombre}
              </span>
              <span className="mt-0.5 block truncate text-[12.5px] text-grafito/60">{detalle}</span>
            </span>
          </button>

          <button
            type="button"
            aria-label="Profesional siguiente"
            disabled={guardando || rueda.length < 2}
            onClick={() => mover(1)}
            className="flex items-center px-3 text-grafito/60 transition-colors hover:bg-hueso hover:text-grafito disabled:opacity-40"
          >
            <IconChevronRight className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-[13px] font-medium text-salvia-oscuro">{conteo}</p>

        {abierto && (
          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 flex w-[19rem] max-w-[calc(100vw-3rem)] flex-col rounded-card border border-linea bg-marfil p-2 shadow-soft">
            <p className="px-3 py-2 font-[family-name:var(--font-mono)] text-[11.5px] tracking-[0.16em] text-grafito/45 uppercase">
              Profesionales de la clínica
            </p>

            {conVistaGeneral && (
              <ItemDeVista
                nombre={etiquetaGeneral}
                detalle={detalleGeneral}
                elegida={actual === -1}
                disabled={guardando}
                onElegir={() => elegir("")}
              />
            )}

            {profesionales.map((p, i) => (
              <ItemDeVista
                key={p.userId}
                nombre={p.nombre}
                detalle={p.detalle}
                elegida={i === actual}
                disabled={guardando}
                onElegir={() => elegir(p.userId)}
              />
            ))}

            {error && (
              <p role="alert" className="px-3 py-2 text-xs text-terracota-oscuro">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemDeVista({
  nombre,
  detalle,
  elegida,
  disabled,
  onElegir,
}: {
  nombre: string;
  detalle: string;
  elegida: boolean;
  disabled: boolean;
  onElegir: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onElegir}
      aria-current={elegida ? "true" : undefined}
      className={`flex w-full items-center gap-3 rounded-field px-3 py-3 text-left text-[15px] text-grafito transition-colors disabled:opacity-60 ${
        elegida ? "bg-salvia-claro" : "hover:bg-hueso"
      }`}
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-salvia-claro font-[family-name:var(--font-display)] text-xs font-semibold text-salvia-oscuro"
      >
        {nombre === "Toda la clínica" || nombre === "Vista general" ? (
          <IconUsers className="h-[18px] w-[18px]" />
        ) : (
          iniciales(nombre)
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{nombre}</span>
        <span className="mt-0.5 block truncate text-[13px] text-grafito/60">{detalle}</span>
      </span>
      {elegida && (
        <span aria-hidden="true" className="text-salvia-oscuro">
          ✓
        </span>
      )}
    </button>
  );
}

// Las mismas iniciales que el popover de colaboradores, con el mismo
// criterio: el tratamiento no distingue a nadie en una clínica llena de
// odontólogos.
function iniciales(nombre: string): string {
  const partes = nombre
    .replace(/^(Dra?\.|Od\.|Lic\.)\s*/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return ((partes[0]?.charAt(0) ?? "") + (partes[1]?.charAt(0) ?? "")).toUpperCase() || "?";
}
