import type { Metadata } from "next";
import Link from "next/link";
import {
  apiListTiposConsulta,
  apiListTurnosPaginado,
} from "@/lib/api";
import { getSessionToken, requireOnboardingComplete } from "@/lib/session";
import { datosDeLaVista } from "@/lib/vista-de-recepcion";
import { conPaletaPrecargada } from "@/lib/paleta-recepcion";
import { ZonaProfesional } from "@/components/panel/zona-profesional";
import { CLASE_PANTALLA_CON_ENCABEZADO, EncabezadoDeSeccion } from "@/components/panel/encabezado-de-seccion";
import {
  etiquetaDeRango,
  filtrosDeTab,
  parseTab,
  parseVerificacion,
  type Tab,
} from "@/lib/turnos-filtros";
import { TurnosTable } from "@/components/panel/turnos-table";
import { TurnosFiltros } from "@/components/panel/turnos-filtros";
import { BuscadorEnVivo } from "@/components/panel/buscador-en-vivo";
import { AgregarTurnoButton } from "@/components/panel/agregar-turno-button";
import { TURNOS_POR_PAGINA } from "@/lib/paginacion";

export const metadata: Metadata = { title: "Turnos — PRISMA" };

// "Resueltos" (pedido explícito del cliente, 2026-08-23) separa, dentro de
// lo que antes era una sola bolsa "Confirmadas", los turnos cuya hora de
// fin ya pasó — mejor organización, no un estado nuevo en la base: sigue
// siendo `agendado`, filtrado por `resuelto` (GET /turnos, ver
// internal/http/turnos.go).
// "Pendientes" sacada de las pestañas (Extra 2.3.3, TR-104): ese estado
// se eliminó del todo — un turno siempre nace `agendado`, con horario
// real, incluso el que llega de la página pública (Extra 2.3.5). "Todas"
// se había sacado de las pestañas en ese mismo cambio (entrar sin
// `?estado=` autoseleccionaba "Confirmadas", E3.2) — pedido explícito del
// cliente, se repone como pestaña visible de nuevo; el DEFAULT sin
// `?estado=` sigue siendo "Confirmadas" (parseTab de abajo), la única
// diferencia es que ahora "Todas" también se puede elegir a mano.
// "Pendientes" y no "Confirmadas" (2026-09-19): mismo cambio de rótulo
// que ESTADO_LABEL (ver turno-format.ts). La CLAVE de la pestaña sigue
// siendo `agendado` y la URL sigue siendo `?estado=agendado`, así que
// ningún link compartido se rompe.
const TABS: { label: string; tab: Tab }[] = [
  { label: "Pendientes", tab: "agendado" },
  { label: "Resueltos", tab: "resuelto" },
  { label: "Canceladas", tab: "cancelada" },
  { label: "Todas", tab: "todas" },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// /panel/turnos (T3.3, "Turnos entrantes") — tabs + búsqueda por
// searchParams (GET, URL compartible, mismo patrón que /buscar): cada
// cambio de filtro navega y re-renderiza en el servidor, sin estado
// cliente para eso. Las acciones por fila (Confirmar/Editar/Cancelar) sí
// necesitan cliente — viven en TurnosTable.
export default async function TurnosPage({
  searchParams,
}: PageProps<"/panel/turnos">) {
  const resolved = await searchParams;
  const tab = parseTab(firstParam(resolved.estado));
  const q = firstParam(resolved.q);
  // Desde/Hasta (Extra 2.3.3, E3.5) — mismos nombres de query param que
  // el resto de este archivo (GET, URL compartible): un rango vacío no
  // filtra nada, igual que hoy filtrosDeTab omite `q` cuando no vino.
  const desde = firstParam(resolved.desde);
  const hasta = firstParam(resolved.hasta);
  // tipoConsultaId (corrección de QA: "faltó el filtro de tipo de
  // consulta" en Turnos) — mismo filtro que ya tenía "Turnos activos"/
  // "Historial" de la ficha de paciente, acá resuelto en el servidor.
  const tipoConsultaId = firstParam(resolved.tipoConsultaId);
  // verificacion (corrección de seguridad, Fase 2.4.1) — ver
  // parseVerificacion más arriba.
  const verificacion = parseVerificacion(firstParam(resolved.verificacion));
  // Deep-link desde TurnoDetalle ("Ver turno", 2026-08-23): esa fila
  // arranca ya desplegada, ver TurnosTable/abrirId.
  const abrirId = firstParam(resolved.turno);

  const sesion = await requireOnboardingComplete();
  const token = await getSessionToken();
  // Fase 3.2.6 — el alcance de ESTA pantalla: toda la clínica, o los
  // turnos de un profesional.
  const { profesionales, vista, esRecepcion } = await datosDeLaVista(
    token,
    sesion.roles,
  );
  const filtros = filtrosDeTab(
    tab,
    q,
    desde,
    hasta,
    tipoConsultaId,
    verificacion,
  );
  // querySecundaria — se repite en el href de cada tab/atajo de fecha de
  // abajo para no perder los demás filtros activos al navegar entre
  // ellos (mismo criterio que ya se aplicaba a tipoConsultaId, extendido
  // acá para no seguir concatenando a mano en cada lugar).
  const querySecundaria = `${q ? `&q=${encodeURIComponent(q)}` : ""}${tipoConsultaId ? `&tipoConsultaId=${tipoConsultaId}` : ""}${
    verificacion ? `&verificacion=${verificacion}` : ""
  }`;
  // hrefBaseSinQ — mismos filtros vigentes que `querySecundaria`, pero SIN
  // `q` (lo agrega BuscadorEnVivo solo, con cada tecla) y CON desde/hasta
  // (que `querySecundaria` no lleva, se arma aparte en cada chip de fecha
  // de más abajo).
  const hrefBaseSinQ = `/panel/turnos?estado=${tab}${desde ? `&desde=${desde}` : ""}${hasta ? `&hasta=${hasta}` : ""}${
    tipoConsultaId ? `&tipoConsultaId=${tipoConsultaId}` : ""
  }${verificacion ? `&verificacion=${verificacion}` : ""}`;

  const [tiposResult, paginaTurnos] = token
    ? await Promise.all([
        apiListTiposConsulta(token),
        apiListTurnosPaginado(token, filtros, TURNOS_POR_PAGINA, 0),
      ])
    : [null, null];

  // El color es de QUIEN MIRA (TR-145): para recepción, su paleta
  // precargada, en todas sus vistas. Ver `lib/tipos-de-la-vista.ts`.
  const tiposDelServidor = tiposResult?.ok ? tiposResult.data : [];
  const tiposConsulta = esRecepcion
    ? conPaletaPrecargada(tiposDelServidor)
    : tiposDelServidor;
  const turnos = paginaTurnos?.ok ? paginaTurnos.data.items : [];
  const totalTurnos = paginaTurnos?.ok ? paginaTurnos.data.total : 0;

  // Chips de filtros activos (fotos de referencia: "Esta semana ✕",
  // "Consulta general ✕") — cada uno navega a la misma URL sin ESE
  // filtro puntual al tocar la ✕, sin tocar los demás. El nombre del rango
  // sale de `etiquetaDeRango`, el mismo que usan la ficha y los documentos.
  const chips: { label: string; hrefSinEste: string }[] = [];
  if (desde || hasta) {
    chips.push({
      label: etiquetaDeRango(desde ?? "", hasta ?? ""),
      hrefSinEste: `/panel/turnos?estado=${tab}${querySecundaria}`,
    });
  }
  if (tipoConsultaId) {
    const tipo = tiposConsulta.find((t) => t.id === tipoConsultaId);
    chips.push({
      label: tipo?.nombre ?? "Tipo de consulta",
      hrefSinEste: `/panel/turnos?estado=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}${verificacion ? `&verificacion=${verificacion}` : ""}${desde ? `&desde=${desde}` : ""}${hasta ? `&hasta=${hasta}` : ""}`,
    });
  }
  if (verificacion) {
    chips.push({
      label: verificacion === "verificado" ? "Verificados" : "Sin verificar",
      hrefSinEste: `/panel/turnos?estado=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}${tipoConsultaId ? `&tipoConsultaId=${tipoConsultaId}` : ""}${desde ? `&desde=${desde}` : ""}${hasta ? `&hasta=${hasta}` : ""}`,
    });
  }

  return (
    // px/pb con clamp() + pt fijo y chico (rama fix/mobile, sexta
    // corrección 2026-08-24 — ver TR-029 en docs/Arquitectura y base/tradeoffs.md: "hay un
    // espacio de más entre el header y donde arranca el scroll... quitá
    // el padding-top sobrante"). El de arriba de todo ya lo da
    // `pt-[var(--header-height)]` en app/panel/layout.tsx (ese no se
    // toca) — este era una segunda capa redundante encima de esa.
    <div className={CLASE_PANTALLA_CON_ENCABEZADO}>
      {/* Encabezado de sección (correcciones generales, ítem 2). Sin el
          contador "x en total" al lado del título (ítem 4). El selector
          de recepción va debajo del título. */}
      <EncabezadoDeSeccion
        seccion="turnos"
        titulo="Turnos"
        antes={
          esRecepcion ? (
            <ZonaProfesional
              profesionales={profesionales}
              vista={vista}
              etiqueta="Mostrando"
              etiquetaGeneral="Toda la clínica"
              detalleGeneral="Turnos de todos los profesionales"
            />
          ) : undefined
        }
      />

      {/* Dos filas arriba de la tabla (correcciones generales, ítem 6):
          el buscador con "+ Agregar turno" al lado, como "+ Agregar
          paciente" en Pacientes, y debajo las pestañas de estado con
          "Filtros" en su misma fila. Tabla sin cambios (pedido explícito
          del cliente: "las tablas dejelas como estaba, no toque eso"). */}
      <div className="flex flex-col gap-4">
        {/* BuscadorEnVivo (TR-115, 2026-09-06) — reemplaza el `<form
            method="get">` de antes: pedido textual del cliente, "que me
            vaya apareciendo resultados sin tocar enter". El componente
            arma su propio href con los filtros vigentes (`hrefBaseSinQ`)
            y navega solo, con debounce. El ancho es el mismo que en
            Pacientes y en los documentos de la ficha. */}
        {/* En el celular el orden es otro: arriba "+ Agregar turno", el
            buscador debajo, y las pestañas con "Filtros" justo encima de la
            tabla (pedido de la persona, 2026-10-19: el buscador y las
            pestañas cambian de lugar; el 2026-10-17 el buscador iba abajo).
            Esta fila se disuelve ahí (`max-md:contents`) y cada pieza toma
            su lugar con `order`; desde `md`, todo como siempre. El orden del
            DOM sigue siendo el de la computadora. */}
        <div className="flex flex-wrap items-center gap-3 max-md:contents">
          <div className="w-full max-md:order-2 md:w-auto">
            <BuscadorEnVivo
              q={q}
              hrefBase={hrefBaseSinQ}
              placeholder="Nombre, apellido, DNI o email…"
            />
          </div>
          {/* El mismo modal que "+ Agregar turno" del calendario. */}
          <div className="max-md:order-1">
            <AgregarTurnoButton tiposConsulta={tiposConsulta} />
          </div>
        </div>

        {/* Entre 768 y 1023 px, con el menú lateral abierto, las pestañas
            con todo su margen y "Filtros" con el rótulo no entraban juntas,
            y "Filtros" bajaba solo a otro renglón. Ahí las pestañas van con
            un margen menor (`md:px-3`) y "Filtros" en su ícono, como en el
            celular; desde `lg`, las dos cosas completas. El `flex-wrap`
            queda de red. */}
        <div className="flex flex-wrap items-center gap-2 max-md:order-3">
          <nav
            aria-label="Filtrar por estado"
            // Las cuatro pestañas y "Filtros" en UNA fila, también en el
            // celular (ítem 6): ahí las pestañas reparten el ancho que
            // deja "Filtros" (que queda en su ícono), con el rótulo en
            // 12 px (a 14 px no entran: medido, 337 px contra 274 a 360 px
            // de pantalla). Así entran desde 360 px; debajo de eso el
            // `<nav>` scrollea solo, sin correr la página (`min-w-0` +
            // `overflow-x-auto` acá).
            //
            // Historia: el 2026-08-27 el cliente pidió que el selector
            // no hiciera overflow (pasó a un grid de 2×2), y el
            // 2026-09-19, que volviera a una sola fila con scroll propio
            // porque el cuadrado ocupaba dos renglones. Esta versión es
            // una sola fila que, además, ya no necesita el scroll.
            //
            // 44 px de alto, el de "Filtros" (antes 46 contra 38). Cada
            // pestaña ocupa ese alto entero para el dedo, y su pastilla
            // va adentro, con el margen que antes era el `p-1` del nav.
            className="scrollbar-fina flex h-11 min-w-0 flex-1 items-stretch overflow-x-auto rounded-control border-[0.5px] border-arena bg-marfil text-sm md:flex-none"
          >
            {TABS.map((t) => {
              const active = t.tab === tab;
              const href = `/panel/turnos?estado=${t.tab}${querySecundaria}`;
              return (
                <Link
                  key={t.tab}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="group flex flex-auto shrink-0 rounded-control px-0.5 py-1 first:pl-1 last:pr-1 md:flex-none"
                >
                  <span
                    className={`flex w-full items-center justify-center rounded-pastilla px-1 text-center text-xs font-medium whitespace-nowrap md:px-3 md:text-sm lg:px-4 ${active ? "bg-marca-relleno text-marfil" : "text-grafito group-hover:bg-velo"}`}
                  >
                    {t.label}
                  </span>
                </Link>
              );
            })}
          </nav>
          {/* Corrección de QA (2026-09-06), pedido textual del cliente:
              "los filtros de búsqueda... pasan a aparecer cuando se toca
              un botón... bottom sheet en mobile... en vez de decir
              aplicar, aparezca 'ver X turnos'". */}
          <TurnosFiltros
            tab={tab}
            q={q}
            tiposConsulta={tiposConsulta}
            desde={desde}
            hasta={hasta}
            tipoConsultaId={tipoConsultaId}
            verificacion={verificacion}
          />
        </div>

        {/* Chips de filtros activos, removibles (fotos de referencia:
            "Esta semana ✕", "Consulta general ✕") — cada ✕ navega a la
            misma URL sin ESE filtro puntual, sin tocar los demás. Solo se
            muestra la fila si hay al menos un chip (nada que remodelar
            cuando no hay filtros aplicados). */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 max-md:order-4">
            {chips.map((chip) => (
              <Link
                key={chip.label}
                href={chip.hrefSinEste}
                className="inline-flex items-center gap-1.5 rounded-control bg-marca-claro px-3 py-1.5 text-xs font-medium text-marca hover:brightness-95"
              >
                {chip.label}
                <span aria-hidden="true">✕</span>
              </Link>
            ))}
          </div>
        )}

        {/* key por pestaña+búsqueda+rango de fecha: fuerza a remontar
            TurnosTable en cada cambio de filtro. Sin esto, su
            `useState(turnosIniciales)` solo toma el valor inicial una vez
            — al navegar entre pestañas (misma instancia de componente,
            React no la desmonta solo porque cambió un prop) la tabla
            seguía mostrando los datos de la pestaña anterior hasta un
            refresh manual (bug reportado 2026-08-23). */}
        {/* La tabla con lo suyo (el aviso de cancelar en bloque, "Cargar
            más"), con el mismo espacio de siempre entre esas piezas. */}
        <div className="flex min-w-0 flex-col gap-4 max-md:order-5">
        <TurnosTable
          key={`${tab}-${q ?? ""}-${desde ?? ""}-${hasta ?? ""}-${tipoConsultaId ?? ""}-${verificacion ?? ""}-${abrirId ?? ""}`}
          turnosIniciales={turnos}
          totalInicial={totalTurnos}
          tiposConsulta={tiposConsulta}
          filtros={filtros}
          abrirId={abrirId}
        />
        </div>
      </div>
    </div>
  );
}
