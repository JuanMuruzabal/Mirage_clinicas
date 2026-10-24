import type { ReactNode } from "react";
import Link from "next/link";
import { LinkConVista } from "./link-con-vista";
import { Despliegue } from "./despliegue";

// TarjetaTurnero* (F2.3 extra ítem 1 — rediseño del dashboard "Turnero",
// docs/Arquitectura y base/implementation-plan.md §11.5, docs/Fases post MVP/Fase 2/fase2.3-extra-dental-mirage.md)
// — reemplaza el `ResumenCard` viejo (que envolvía toda la tarjeta en un
// único <Link>): con un cuerpo de filas cada una clickeable por su
// cuenta, anidar un <a> dentro de otro <a> no es válido HTML, así que la
// cabecera y las filas del cuerpo pasan a ser links independientes.

// `flex-wrap` + rótulo sin cortes (2026-09-26): en el celular, con un link
// largo al lado ("Ver horarios reservados"), el rótulo se partía en dos
// renglones. Ahora, si no entran juntos, el link baja entero.
const CABECERA_BASE = "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1";
// `grafito/75` y no `/50` (2026-10-17): sobre el vidrio, el rótulo a la
// mitad daba 2,9:1; a tres cuartos pasa de 5:1 en el tramo más oscuro.
const EYEBROW_BASE =
  "font-[family-name:var(--font-mono)] tabular-nums text-xs uppercase tracking-widest whitespace-nowrap text-grafito/75";
const VALOR_BASE =
  "font-[family-name:var(--font-display)] tracking-tight text-4xl font-semibold";
const LABEL_CABECERA_BASE = "text-sm font-medium whitespace-nowrap";

interface TarjetaFila {
  key: string;
  href: string;
  contenido: ReactNode;
  // De qué agenda es esta fila (Fase 3.2.6). Desde la vista general de
  // recepción, tocarla se para en ESA agenda antes de navegar — si no,
  // la pantalla de destino mostraría otra cosa que la que la fila
  // prometía. Vacío en la vista de un profesional: ya se está ahí.
  userId?: string;
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
  // Pie con un link a la derecha (2026-09-19, pedido del cliente: "a
  // turnos próximos y turnos resueltos se les agrega este footer que
  // tiene turnos de hoy"). El link de la CABECERA y el del PIE llevan a
  // lugares distintos a propósito: el de arriba ubica el dato en su
  // pantalla natural (el calendario, o Turnos con el mismo recorte que
  // muestra la tarjeta), el del pie abre la lista completa sin ningún
  // filtro.
  hrefPie?: string;
  labelPie?: string;
  /** Lugar en la página, para desplegarse en cascada (ver Despliegue). */
  orden?: number;
}

// La tarjeta ENTERA es de vidrio (`.vidrio` en globals.css, 2026-10-17, el
// modelo del Centro de Control de iOS que mandó la persona): el panel
// translúcido con el borde iluminado, y adentro la cabecera como segunda
// capa (`.vidrio-capa`, la "carátula": un poco más clara, a la misma curva
// que las esquinas). La lista y el pie van sobre el panel. Antes la
// cabecera era blanca y opaca, y solo el cuerpo era de vidrio.
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
  hrefPie,
  labelPie,
  orden,
}: TarjetaConListaProps) {
  return (
    <Despliegue orden={orden} className="vidrio flex flex-col overflow-hidden">
      {/* 6 px de margen + 18 de relleno: el texto queda a 24 px del borde,
          alineado con el de las filas (`px-6`).
          120 px de alto como mínimo, los de la carátula de "Turnos de hoy"
          en el celular, con la cifra abajo (pedido de la persona,
          2026-10-18: "Ver turnos" y "Ver en calendario" quedaban pegados al
          dibujo). El dibujo va anclado abajo: con 104 px su parte de arriba
          tocaba el link; con 120 queda a 15 px, y del mismo tamaño que en
          las otras tarjetas. */}
      <div className="vidrio-capa relative flex min-h-30 flex-col gap-2 overflow-hidden p-4.5">
        {icono}
        <div className="relative z-10 flex flex-1 flex-col justify-between gap-2">
          <div className={CABECERA_BASE}>
            <p className={EYEBROW_BASE}>{eyebrow}</p>
            {/* Sin link de cabecera, la tarjeta queda solo con su
                cuerpo interactuable — que es lo que se pidió para
                "Turnos próximos" y "Horarios reservados" en la vista
                general: ahí un link único no puede llevar a la agenda
                correcta, porque cada fila es de alguien distinto. */}
            {cabeceraCustom ??
              (hrefCabecera && labelCabecera && (
                <Link
                  href={hrefCabecera}
                  className={`${LABEL_CABECERA_BASE} text-marca hover:text-grafito`}
                >
                  {labelCabecera}
                </Link>
              ))}
          </div>
          <p
            className={`despliegue-cifra ${VALOR_BASE} ${acento ? "text-marca" : "text-grafito"}`}
          >
            {valor}
          </p>
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
          contenido o no. Desde que el vidrio es la tarjeta entera
          (2026-10-17) eso ya no se nota, pero el `flex-1` sigue dejando el
          pie siempre abajo. */}
      {/* DOS CAJAS Y NO UNA (QA de la 3.2.6): la de afuera recorta el
          despliegue (`despliegue-cuerpo`, que se abre con un `clip-path`)
          y la de adentro scrollea en los dos ejes (el horizontal, "por las
          dudas de que sea muy grande el nombre del profesional"). La de
          afuera cierra los dos ejes: con uno solo en `hidden`, el otro
          computa `auto` y sería un segundo contenedor de scroll. */}
      <div className="despliegue-cuerpo max-h-52 flex-1 overflow-hidden">
        <div className="panel-card-scroll h-full overflow-auto">
          {filas.length === 0 ? (
            // Misma tipografía de display que las filas con contenido
            // (corrección de QA, 2026-09-06: "cambiar el font para que
            // quede coherente con el font de las tarjetas con contenido",
            // ver cambiar2.png en docs/) — antes quedaba en la fuente
            // sans-serif por default, discordante con el resto del cuerpo.
            <p className="px-6 py-4 font-[family-name:var(--font-display)] text-base font-semibold text-grafito/75">
              {vacioMensaje}
            </p>
          ) : (
            <ul>
              {filas.map((f) => (
                <li
                  key={f.key}
                  className="border-b border-grafito/10 last:border-b-0"
                >
                  <LinkConVista
                    href={f.href}
                    userId={f.userId}
                    className="block px-6 py-3 hover:bg-velo"
                  >
                    {f.contenido}
                  </LinkConVista>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* El mismo pie que "Turnos de hoy": la salida a la lista
          completa, separada del link de la cabecera que lleva al
          recorte que la tarjeta está mostrando. */}
      {hrefPie && labelPie && (
        <div className="flex items-center justify-end border-t border-grafito/10 px-6 py-3">
          <Link
            href={hrefPie}
            className="text-sm font-medium text-marca hover:text-grafito"
          >
            {labelPie}
          </Link>
        </div>
      )}
    </Despliegue>
  );
}

interface FilaResumenProps {
  // Profesional (Fase 3.2.6) — solo llega en la vista general de
  // recepción, donde cada fila puede ser de alguien distinto. En la
  // vista de un profesional viene vacío y la fila queda como siempre.
  profesional?: string;
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
export function FilaResumen({
  etiqueta,
  hora,
  children,
  uppercase = true,
  profesional,
}: FilaResumenProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {etiqueta && (
        // font-bold (corrección de QA, 2026-09-08: "esos días ponerlos en
        // negrita así se ven bien") — antes era font-normal por default,
        // se perdía un poco al lado de la hora/contenido en negrita justo
        // debajo.
        <span className="font-[family-name:var(--font-mono)] tabular-nums text-[10px] font-bold uppercase tracking-widest text-grafito/75">
          {etiqueta}
        </span>
      )}
      <div className="flex items-baseline gap-x-3">
        <span className="w-[8.5rem] shrink-0 font-[family-name:var(--font-display)] text-lg leading-tight font-bold tabular-nums whitespace-nowrap text-marca">
          {hora}
        </span>
        {/* `min-w-[9rem]` y no `min-w-0`: el nombre del paciente sigue
            cortando con "…" (pedido explícito del cliente), pero deja de
            poder encogerse hasta desaparecer. Ese piso es lo que hace que
            un nombre de profesional largo desborde la fila en vez de
            comerse al paciente — y ese desborde es el que la tarjeta
            scrollea de costado. */}
        <span
          className={`min-w-[9rem] flex-1 truncate font-[family-name:var(--font-display)] text-base leading-tight font-bold text-grafito ${uppercase ? "uppercase" : ""}`}
        >
          {children}
        </span>
        {/* Al final de la fila: es de quién, no qué — la hora y el
            paciente siguen siendo lo que se lee primero.
            LA MISMA TIPOGRAFÍA QUE EL RESTO DE LA TARJETA (QA de la
            3.2.6): estaba en la fuente del cuerpo y a 12px, y al lado de
            un nombre en display se leía como una nota al pie de otra
            pantalla. Lo que lo pone en segundo plano ahora es el peso y
            el tono, no una familia distinta.
            Sin `truncate` ni ancho máximo: el nombre se lee entero y, si
            no entra, la tarjeta scrollea de costado (ver TarjetaConLista). */}
        {profesional && (
          <span className="shrink-0 font-[family-name:var(--font-display)] text-base leading-tight font-semibold whitespace-nowrap text-grafito/75">
            {profesional}
          </span>
        )}
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
  orden?: number;
}

// Sin cuerpo (tarjeta "Turnos confirmados", que solo pide un número) —
// mismo diseño que el ResumenCard original, toda la tarjeta es un link.
export function TarjetaSimple({
  eyebrow,
  valor,
  href,
  titulo,
  acento = false,
  icono,
  orden,
}: TarjetaSimpleProps) {
  return (
    <Despliegue orden={orden} className="flex">
    <Link
      href={href}
      className="vidrio vidrio-enlace group flex flex-1 flex-col gap-2 overflow-hidden p-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
    >
      {icono}
      <div className="relative z-10 flex flex-col gap-2">
        <p className={EYEBROW_BASE}>{eyebrow}</p>
        <p
          className={`despliegue-cifra ${VALOR_BASE} text-6xl ${acento ? "text-marca" : "text-grafito"}`}
        >
          {valor}
        </p>
        <p className="text-sm font-medium text-marca group-hover:text-grafito">
          {titulo}
        </p>
      </div>
    </Link>
    </Despliegue>
  );
}

interface TarjetaEstadisticaProps {
  eyebrow: string;
  asistieron: number;
  ausentes: number;
  icono?: ReactNode;
  orden?: number;
}

// TarjetaEstadistica (F2.3 extra ítem 1, corrección de QA 2026-09-06:
// "crear una tarjeta nueva al lado de turnos confirmados, llamada
// estadística donde dice turnos asistidos en verde y turnos ausentados en
// rojo") — puramente informativa, sin link (no hay a dónde navegar desde
// "cuántos asistieron en total"), acumulado histórico completo, no
// acotado a hoy/la semana como las demás tarjetas.
export function TarjetaEstadistica({
  eyebrow,
  asistieron,
  ausentes,
  icono,
  orden,
}: TarjetaEstadisticaProps) {
  return (
    <Despliegue
      orden={orden}
      className="vidrio flex flex-1 flex-col gap-4 overflow-hidden p-8"
    >
      {icono}
      <div className="relative z-10 flex flex-col gap-4">
        <p className={EYEBROW_BASE}>{eyebrow}</p>
        <div className="flex gap-8">
          <div className="flex flex-col gap-1">
            <p className={`despliegue-cifra ${VALOR_BASE} text-5xl text-salvia-oscuro`}>
              {asistieron}
            </p>
            <p className="text-sm font-medium text-grafito/75">Asistieron</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className={`despliegue-cifra ${VALOR_BASE} text-5xl text-terracota-oscuro`}>
              {ausentes}
            </p>
            <p className="text-sm font-medium text-grafito/75">Ausentes</p>
          </div>
        </div>
      </div>
    </Despliegue>
  );
}
