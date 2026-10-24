"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ClinicaDelUsuario } from "@dental-mirage/shared-types";
import { entrarEnClinicaAction } from "@/app/actions/clinicas";
import { IconCheck, IconChevronDown } from "@/components/icons";

const ETIQUETA_ROL: Record<string, string> = {
  owner: "Titular",
  admin: "Administrador de página",
  profesional: "Profesional",
  recepcion: "Recepción",
};

// Selector de clínica del topbar de /panel/** (Fase 3.2.5): punto + nombre
// + chevron, y el popover alineado a la izquierda, porque el control vive
// pegado al logo. El nombre de la clínica con su punto dice dónde se está, y
// el nombre accesible del botón ("Cambiar de clínica") dice para qué sirve.
//
// Hasta el 2026-10-19 tuvo además una variante grande en "¿Qué necesitás
// hoy?"; la persona la sacó de ahí (para cambiar de clínica se vuelve a
// /clinicas) y con ella se fueron `variante` y `alineacion`. El archivo
// sigue en esta carpeta por historia: lo importa `panel-topbar.tsx`.
export function SelectorClinica({
  clinicas,
  nombreActual,
  quedarseAca = false,
  onCambiada,
  bloqueado = false,
}: {
  clinicas: ClinicaDelUsuario[];
  nombreActual: string;
  /** En el topbar del panel, cambiar de clínica NO saca de la pantalla:
   *  deja al profesional en el panel de la otra clínica. */
  quedarseAca?: boolean;
  /** Se llama después de cambiar, para que quien tenga los datos los
   *  vuelva a pedir — el nombre y la lista tienen que decir lo nuevo. */
  onCambiada?: () => void;
  /** No se despliega. En el panel, mientras el menú lateral de mobile
   *  está abierto: el popover quedaría tapado por el drawer, o tapándolo. */
  bloqueado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [entrando, setEntrando] = useState<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const [, iniciar] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!abierto) return;
    function alClickearAfuera(evento: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
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

  function cambiarA(clinicaId: string) {
    setEntrando(clinicaId);
    iniciar(async () => {
      // Sin segundo argumento fuera del panel: la llamada de siempre se
      // mantiene igual, no "igual pero con un undefined al final".
      await (quedarseAca ? entrarEnClinicaAction(clinicaId, { redirigir: false }) : entrarEnClinicaAction(clinicaId));
      setEntrando(null);
      if (quedarseAca) {
        setAbierto(false);
        // Sin redirect no hay navegación que dispare nada: hay que pedir
        // los datos de nuevo a mano, o el header seguiría mostrando la
        // clínica anterior.
        onCambiada?.();
        // Y el CONTENIDO del panel también es de la otra clínica ahora.
        router.refresh();
      }
    });
  }

  return (
    <div ref={contenedor} className="relative flex-shrink-0">
      <button
        type="button"
        aria-expanded={abierto && !bloqueado}
        aria-label="Cambiar de clínica"
        disabled={bloqueado}
        onClick={() => setAbierto((a) => !a)}
        // Ancho completo en mobile —donde es el elemento principal del
        // renglón— y al tamaño de su contenido en escritorio, donde convive
        // con el logo y el resto del header.
        className="flex w-full items-center gap-2 rounded-control border border-linea bg-marfil px-3 py-1.5 text-left transition-colors hover:border-marca-medio md:w-auto"
      >
        <span aria-hidden="true" className="h-[9px] w-[9px] flex-shrink-0 rounded-full bg-marca-relleno" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-grafito md:max-w-[14rem] md:flex-none">
          {nombreActual}
        </span>
        <IconChevronDown className={`h-4 w-4 flex-shrink-0 text-grafito/40 ${abierto ? "rotate-180" : ""}`} />
      </button>

      {/* `max-w-[calc(100vw-3rem)]`: en un teléfono angosto, 288px fijos
          se salen igual aunque el ancla esté a la derecha. */}
      {abierto && !bloqueado && (
        <div className="absolute top-[calc(100%+0.5rem)] left-0 z-20 flex w-72 max-w-[calc(100vw-3rem)] flex-col rounded-card border border-linea bg-marfil p-2 shadow-soft">
          <p className="px-3 py-2 font-[family-name:var(--font-mono)] tabular-nums text-[11.5px] uppercase tracking-[0.16em] text-grafito/45">
            Cambiar de clínica
          </p>
          <ul className="flex flex-col gap-0.5">
            {clinicas.map((clinica) => (
              <li key={clinica.id}>
                <button
                  type="button"
                  disabled={entrando !== null}
                  onClick={() => (clinica.activa ? setAbierto(false) : cambiarA(clinica.id))}
                  className={`flex w-full items-center gap-2 rounded-field px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                    clinica.activa ? "bg-marca-claro" : "hover:bg-velo"
                  }`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-grafito">{clinica.nombre}</span>
                    <span className="truncate text-xs text-grafito/50">
                      {ETIQUETA_ROL[clinica.rolPrincipal] ?? clinica.rolPrincipal}
                    </span>
                  </span>
                  {clinica.activa && <IconCheck className="ml-auto h-4 w-4 flex-shrink-0 text-marca" />}
                </button>
              </li>
            ))}
          </ul>
          <Link
            href="/clinicas"
            onClick={() => setAbierto(false)}
            className="mt-1 border-t border-linea px-3 pb-1 pt-3 text-sm font-medium text-marca hover:text-grafito"
          >
            Ver todas las clínicas
          </Link>
        </div>
      )}
    </div>
  );
}
