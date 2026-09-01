import type { ReactNode } from "react";
import Link from "next/link";

// TarjetaTurnero* (F2.3 extra ítem 1 — rediseño del dashboard "Turnero",
// docs/implementation-plan.md §11.5, docs/fase2.3-extra-dental-mirage.md)
// — reemplaza el `ResumenCard` viejo (que envolvía toda la tarjeta en un
// único <Link>): con un cuerpo de filas cada una clickeable por su
// cuenta, anidar un <a> dentro de otro <a> no es válido HTML, así que la
// cabecera y las filas del cuerpo pasan a ser links independientes.

const CABECERA_BASE = "flex items-baseline justify-between gap-3";
const EYEBROW_BASE = "font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50";
const VALOR_BASE = "font-[family-name:var(--font-display)] text-5xl font-medium";
const LABEL_CABECERA_BASE = "text-sm font-medium whitespace-nowrap";

interface TarjetaFila {
  key: string;
  href: string;
  contenido: ReactNode;
}

interface TarjetaConListaProps {
  eyebrow: string;
  valor: number;
  filas: TarjetaFila[];
  vacioMensaje: string;
  acento?: boolean;
  // Cabecera clickeable: o bien un link normal (hrefCabecera+labelCabecera,
  // el caso común), o un nodo custom (la tarjeta de horarios reservados
  // abre un modal en vez de navegar — ver AbrirConfiguracionBoton).
  hrefCabecera?: string;
  labelCabecera?: string;
  cabeceraCustom?: ReactNode;
  // Ícono decorativo de fondo de la cabecera (F2.3 extra ítem 1,
  // corrección de QA, ver diseño1.png/diseño2.png en docs/ y
  // tarjeta-turnero-iconos.tsx) — ya viene con su propia posición/tamaño/
  // color (el caller arma el className completo), este componente solo
  // lo ubica detrás del contenido real (`z-10`) y lo recorta si se pasa
  // del borde de la tarjeta.
  icono?: ReactNode;
}

// Cuerpo "medio transparente, mismo efecto que las tarjetas de la página
// principal" (pedido explícito del cliente, ejemplo-para-cuerpo-tarjeta.png
// en docs/; corrección de QA 2026-09-06: "no se ve la transparencia... se
// sigue viendo de color cascarón... la transparencia debe ser más opaca,
// es decir que los objetos de fondo tengan más blur") — `.panel-card-vidrio`
// (globals.css) pinta y desenfoca su PROPIA copia de la textura de
// `.panel-texture` en un pseudo-elemento, en vez de depender de un
// `backdrop-filter` que tenga que atravesar varios contenedores de la
// página para encontrar algo real que desenfocar (eso es lo que se veía
// plano). El fondo opaco (`bg-marfil`) queda SOLO en la cabecera.
export function TarjetaConLista({
  eyebrow,
  valor,
  filas,
  vacioMensaje,
  acento,
  hrefCabecera,
  labelCabecera,
  cabeceraCustom,
  icono,
}: TarjetaConListaProps) {
  return (
    <div className="flex flex-col overflow-hidden rounded-card border-[0.5px] border-arena shadow-soft">
      <div className="relative flex flex-col gap-2 overflow-hidden bg-marfil p-6">
        {icono}
        <div className="relative z-10 flex flex-col gap-2">
          <div className={CABECERA_BASE}>
            <p className={EYEBROW_BASE}>{eyebrow}</p>
            {cabeceraCustom ??
              (hrefCabecera && labelCabecera && (
                <Link href={hrefCabecera} className={`${LABEL_CABECERA_BASE} text-salvia-oscuro hover:text-grafito`}>
                  {labelCabecera} →
                </Link>
              ))}
          </div>
          <p className={`${VALOR_BASE} ${acento ? "text-salvia-oscuro" : "text-grafito"}`}>{valor}</p>
        </div>
      </div>

      {/* max-h + overflow-y-auto (pedido explícito: "si la lista se hace
          muy larga... poder scrollear para bajo dentro del cuerpo de la
          tarjeta") — nunca agranda la tarjeta entera. panel-card-scroll:
          scrollbar fina y discreta en vez de la nativa del navegador.
          `flex-1` (corrección de QA, 2026-09-06, bug real — ver "bug
          visual.png"/"bug visual 2.png" en docs/): el grid de la página
          (`align-items: stretch` por default) estira la tarjeta ENTERA a
          la altura de la más alta de su fila, pero sin esto este cuerpo
          solo crecía hasta el alto de su propio contenido — con pocas
          filas (o ninguna), quedaba un espacio vacío abajo SIN el efecto
          vidrio (`.panel-card-vidrio` solo cubre su propia caja), un
          corte visual feo entre el área con textura desenfocada y la
          textura cruda de la página asomando por debajo. `flex-1` fuerza
          a este cuerpo a ocupar siempre el resto del alto disponible —
          el efecto vidrio pasa a cubrir la tarjeta completa, tenga
          contenido o no. */}
      <div className="panel-card-scroll panel-card-vidrio max-h-52 flex-1 overflow-y-auto">
        {filas.length === 0 ? (
          // Misma tipografía de display que las filas con contenido
          // (corrección de QA, 2026-09-06: "cambiar el font para que
          // quede coherente con el font de las tarjetas con contenido",
          // ver cambiar2.png en docs/) — antes quedaba en la fuente
          // sans-serif por default, discordante con el resto del cuerpo.
          <p className="p-4 font-[family-name:var(--font-display)] text-base font-medium text-grafito/50">{vacioMensaje}</p>
        ) : (
          <ul>
            {filas.map((f) => (
              <li key={f.key} className="border-b-[0.5px] border-arena/60 last:border-b-0">
                <Link href={f.href} className="block px-4 py-3 hover:bg-arena/40">
                  {f.contenido}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface FilaResumenProps {
  // Etiqueta chica arriba de la hora (el día — "MAR 1") — se omite en la
  // tarjeta "Turnos de hoy", donde el día siempre es el mismo, hoy.
  etiqueta?: string;
  hora: string;
  children: ReactNode;
  // uppercase (default true) — nombre de paciente en mayúsculas, como el
  // mockup de referencia; el motivo de un horario reservado (texto libre)
  // se lee mejor sin forzar mayúsculas, ver su uso en panel/page.tsx.
  uppercase?: boolean;
}

// FilaResumen — fila del cuerpo de una tarjeta del Turnero, con la
// tipografía "más llamativa" pedida (mismo criterio que ejemplo-tarjeta-2.png
// en docs/): la hora en la tipografía de display, grande y en VERDE
// (pedido explícito del cliente), con el día como etiqueta chica ARRIBA
// de toda la fila (no al lado de la hora — corrección de QA 2026-09-06,
// ver prueba_mal_vista.png en docs/: el contenido quedaba alineado con
// la etiqueta del día en vez de con la hora); el contenido (nombre/
// motivo) comparte la misma línea de base que la hora, no la del día.
//
// Alineación en columna (corrección de QA, "quiero que se alinien bien
// las cosas... quede bien derechito", ver falta_alininear.png en docs/):
// sin un ancho fijo, "08:15 a 08:45" y "10:30 a 11:00" ocupan un ancho
// levemente distinto en una tipografía no monoespaciada — el nombre de
// cada fila arrancaba en una X distinta según la fila, filas visualmente
// "torcidas" entre sí. `min-w` fijo en la columna de hora + `tabular-nums`
// (dígitos de ancho fijo) fuerza a que el nombre/motivo de TODAS las
// filas arranque siempre en la misma posición horizontal, para cualquier
// tarjeta (turnos u horarios reservados), sin importar el largo real del
// texto de hora u nombre. `truncate` en el contenido (nombre/motivo):
// pedido explícito del cliente — un texto muy largo corta con "…" en vez
// de romper la fila a una segunda línea (eso también rompía la
// alineación vertical entre filas).
export function FilaResumen({ etiqueta, hora, children, uppercase = true }: FilaResumenProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {etiqueta && (
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-grafito/50">{etiqueta}</span>
      )}
      <div className="flex items-baseline gap-x-3">
        <span className="w-[8.5rem] shrink-0 font-[family-name:var(--font-display)] text-lg leading-tight font-bold tabular-nums whitespace-nowrap text-salvia-oscuro">
          {hora}
        </span>
        <span
          className={`min-w-0 flex-1 truncate font-[family-name:var(--font-display)] text-base leading-tight font-bold text-grafito ${uppercase ? "uppercase" : ""}`}
        >
          {children}
        </span>
      </div>
    </div>
  );
}

interface TarjetaSimpleProps {
  eyebrow: string;
  valor: number;
  href: string;
  titulo: string;
  acento?: boolean;
  icono?: ReactNode;
}

// Sin cuerpo (tarjeta "Turnos confirmados", que solo pide un número) —
// mismo diseño que el ResumenCard original, toda la tarjeta es un link.
export function TarjetaSimple({ eyebrow, valor, href, titulo, acento = false, icono }: TarjetaSimpleProps) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-2 overflow-hidden rounded-card border-[0.5px] border-arena bg-marfil p-8 shadow-soft transition-colors duration-300 hover:bg-arena"
    >
      {icono}
      <div className="relative z-10 flex flex-col gap-2">
        <p className={EYEBROW_BASE}>{eyebrow}</p>
        <p className={`${VALOR_BASE} text-6xl ${acento ? "text-salvia-oscuro" : "text-grafito"}`}>{valor}</p>
        <p className="text-sm font-medium text-salvia-oscuro group-hover:text-grafito">{titulo} →</p>
      </div>
    </Link>
  );
}

interface TarjetaEstadisticaProps {
  eyebrow: string;
  asistieron: number;
  ausentes: number;
  icono?: ReactNode;
}

// TarjetaEstadistica (F2.3 extra ítem 1, corrección de QA 2026-09-06:
// "crear una tarjeta nueva al lado de turnos confirmados, llamada
// estadística donde dice turnos asistidos en verde y turnos ausentados en
// rojo") — puramente informativa, sin link (no hay a dónde navegar desde
// "cuántos asistieron en total"), acumulado histórico completo, no
// acotado a hoy/la semana como las demás tarjetas.
export function TarjetaEstadistica({ eyebrow, asistieron, ausentes, icono }: TarjetaEstadisticaProps) {
  return (
    <div className="relative flex flex-col gap-4 overflow-hidden rounded-card border-[0.5px] border-arena bg-marfil p-8 shadow-soft">
      {icono}
      <div className="relative z-10 flex flex-col gap-4">
        <p className={EYEBROW_BASE}>{eyebrow}</p>
        <div className="flex gap-8">
          <div className="flex flex-col gap-1">
            <p className={`${VALOR_BASE} text-5xl text-salvia-oscuro`}>{asistieron}</p>
            <p className="text-sm font-medium text-grafito/60">Asistieron</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className={`${VALOR_BASE} text-5xl text-terracota-oscuro`}>{ausentes}</p>
            <p className="text-sm font-medium text-grafito/60">Ausentes</p>
          </div>
        </div>
      </div>
    </div>
  );
}
