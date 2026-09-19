"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Equipo, MiembroDelEquipo, Presencia } from "@dental-mirage/shared-types";
import { presenciaAction } from "@/app/actions/presencia";
import { IconChevronDown } from "@/components/icons";

const ETIQUETA_ROL: Record<string, string> = {
  owner: "Titular",
  admin: "Administrador de página",
  profesional: "Profesional",
  recepcion: "Recepción",
};

// Las iniciales de una persona, sin el tratamiento. "Dra. Lucía Ferrer" →
// "LF": la "D" de "Dra." no distingue a nadie en una clínica llena de
// odontólogos.
export function iniciales(nombre: string): string {
  const partes = nombre
    .replace(/^(Dra?\.|Od\.|Lic\.)\s*/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const primera = partes[0]?.charAt(0) ?? "";
  const segunda = partes[1]?.charAt(0) ?? "";
  return (primera + segunda).toUpperCase() || "?";
}

// haceCuanto — "hace 20 min" a partir del último latido. Sin librería de
// fechas: son cuatro rangos y entra en diez líneas.
export function haceCuanto(iso: string | null, ahora: number = Date.now()): string {
  if (!iso) return "Sin actividad";
  const minutos = Math.floor((ahora - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "Recién";
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "Ayer" : `Hace ${dias} días`;
}

// EquipoPopover — quién trabaja en esta clínica y quién está ahora
// (Fase 3.2.5).
//
// La presencia se refresca sola mientras el panel está abierto, y el
// intervalo lo manda el backend (`latidoSegundos`) en vez de ser una
// constante de acá: así el ritmo del latido y el umbral de "en línea" no
// pueden quedar desalineados en dos archivos distintos.
//
// El primer dibujo usa la presencia que ya vino con el equipo desde el
// servidor — sin eso, el popover mostraría a todo el mundo ausente
// durante el primer minuto.
export function EquipoPopover({
  equipo,
  bloqueado = false,
}: {
  equipo: Equipo;
  /** No se despliega. En el panel, mientras el menú lateral de mobile
   *  está abierto: el popover quedaría tapado por el drawer, o tapándolo. */
  bloqueado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [presencia, setPresencia] = useState<Presencia | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;

    async function latir() {
      const nueva = await presenciaAction();
      if (!vivo) return;
      if (nueva) setPresencia(nueva);
      // Se reprograma DESPUÉS de cada respuesta, no con setInterval: si
      // la API tarda, no se apilan llamadas encima de una que no volvió.
      const segundos = nueva?.latidoSegundos ?? 60;
      timer = setTimeout(latir, segundos * 1000);
    }

    void latir();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, []);

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

  // La presencia fresca pisa a la que vino con el equipo; el resto de los
  // datos de cada persona (nombre, roles) sale siempre del equipo.
  const porUsuario = new Map(presencia?.miembros.map((m) => [m.userId, m]) ?? []);
  const conPresencia = equipo.miembros.map((m) => {
    const viva = porUsuario.get(m.userId);
    return viva ? { ...m, enLinea: viva.enLinea, ultimaActividad: viva.ultimaActividad } : m;
  });

  const enLinea = conPresencia.filter((m) => m.enLinea);
  const ausentes = conPresencia.filter((m) => !m.enLinea);

  return (
    <div ref={contenedor} className="relative flex-shrink-0">
      <button
        type="button"
        aria-expanded={abierto && !bloqueado}
        aria-label="Ver colaboradores"
        disabled={bloqueado}
        onClick={() => setAbierto((a) => !a)}
        className="flex flex-shrink-0 items-center gap-2 rounded-full border-linea bg-marfil p-0 transition-colors hover:border-salvia"
      >
        {/* Los avatares apilados: tres como mucho. Más arriba de eso la
            pila deja de leerse de un vistazo, que es para lo único que
            sirve. */}
        <span aria-hidden="true" className="flex -space-x-2">
          {enLinea.length === 0 && (
            // Sin nadie en línea no habría ningún avatar, y en mobile el
            // botón quedaría sin nada que tocar.
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-linea bg-hueso text-[10px] font-semibold text-grafito/50 md:h-6 md:w-6">
              0
            </span>
          )}
          {enLinea.slice(0, 3).map((m) => (
            <span
              key={m.userId}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-marfil bg-salvia-oscuro text-[11px] font-semibold text-marfil md:h-6 md:w-6 md:text-[10px]"
            >
              {iniciales(m.nombre)}
            </span>
          ))}
        </span>
        {/* Solo los avatares, también en escritorio (2026-09-19, pedido
            del cliente: "el componente de colaboradores ahora pasa a ser
            globalmente un icono, como está implementado en mobile").
            Antes el texto y el chevron aparecían desde `md`; la pila de
            avatares ya comunica lo mismo y ocupa un tercio. El conteo
            sigue estando para lectores de pantalla. */}
        <span className="sr-only">
          {enLinea.length === 1 ? "1 en línea" : `${enLinea.length} en línea`}
        </span>
      </button>

      {abierto && !bloqueado && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 flex w-80 max-w-[calc(100vw-3rem)] flex-col rounded-card border border-linea bg-marfil p-2 shadow-soft">
          <p className="px-3 py-2 font-[family-name:var(--font-mono)] text-[11.5px] uppercase tracking-[0.16em] text-grafito/45">
            Colaboradores
          </p>
          <ul className="scrollbar-fina flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto">
            {conPresencia.length === 0 && (
              <li className="px-3 py-2 text-sm text-grafito/50">Todavía no hay nadie más en la clínica.</li>
            )}
            {enLinea.map((m) => (
              <FilaColaborador key={m.userId} miembro={m} />
            ))}
            {ausentes.length > 0 && enLinea.length > 0 && (
              <li className="px-3 pb-1 pt-3 font-[family-name:var(--font-mono)] text-[11.5px] uppercase tracking-[0.16em] text-grafito/45">
                Sin actividad
              </li>
            )}
            {ausentes.map((m) => (
              <FilaColaborador key={m.userId} miembro={m} />
            ))}
          </ul>
          <Link
            href="/colaboradores"
            onClick={() => setAbierto(false)}
            className="mt-1 border-t border-linea px-3 pb-1 pt-3 text-sm font-medium text-salvia-oscuro hover:text-grafito"
          >
            Ver todos los colaboradores
          </Link>
        </div>
      )}
    </div>
  );
}

function FilaColaborador({ miembro }: { miembro: MiembroDelEquipo }) {
  const rol = miembro.esTitular ? "Titular" : (ETIQUETA_ROL[miembro.roles[0] ?? ""] ?? miembro.roles[0] ?? "");
  return (
    <li className="flex items-center gap-3 rounded-field px-3 py-2">
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          miembro.enLinea ? "bg-salvia-oscuro text-marfil" : "bg-arena text-grafito/60"
        }`}
      >
        {iniciales(miembro.nombre)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-grafito">
          {miembro.nombre}
          {miembro.esVos && <span className="text-grafito/50"> (vos)</span>}
        </span>
        <span className="truncate text-xs text-grafito/50">{rol}</span>
      </span>
      <span
        className={`ml-auto flex flex-shrink-0 items-center gap-1.5 text-xs ${
          miembro.enLinea ? "text-salvia-oscuro" : "text-grafito/45"
        }`}
      >
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${miembro.enLinea ? "bg-salvia-oscuro" : "bg-arena"}`} />
        {miembro.enLinea ? "En línea" : haceCuanto(miembro.ultimaActividad)}
      </span>
    </li>
  );
}
