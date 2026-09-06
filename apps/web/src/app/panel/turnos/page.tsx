import type { Metadata } from "next";
import Link from "next/link";
import { apiListTiposConsulta, apiListTurnos } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { rangoRapidoFechas } from "@/lib/calendar-utils";
import { filtrosDeTab, parseTab, parseVerificacion, type Tab } from "@/lib/turnos-filtros";
import { TurnosTable } from "@/components/panel/turnos-table";
import { TurnosFiltros } from "@/components/panel/turnos-filtros";
import { BuscadorEnVivo } from "@/components/panel/buscador-en-vivo";

export const metadata: Metadata = { title: "Turnos — Dental Mirage" };

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
const TABS: { label: string; tab: Tab }[] = [
  { label: "Confirmadas", tab: "agendado" },
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
export default async function TurnosPage({ searchParams }: PageProps<"/panel/turnos">) {
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
  // Deep-link desde TurnoDetalle ("Ver turno →", 2026-08-23): esa fila
  // arranca ya desplegada, ver TurnosTable/abrirId.
  const abrirId = firstParam(resolved.turno);

  const token = await getSessionToken();
  const filtros = filtrosDeTab(tab, q, desde, hasta, tipoConsultaId, verificacion);
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

  // Corrección de estética (2026-09-06, fotos de referencia del cliente):
  // cada pestaña muestra su propia cantidad ("Confirmadas 8", "Resueltos
  // 4"...) — se pide el conteo de las OTRAS 3 pestañas en paralelo con la
  // data de la pestaña activa (misma q/desde/hasta/tipo/verificación,
  // solo cambia el estado). Sin endpoint de "solo contar" en el backend
  // — reusa apiListTurnos y se queda con `.length`; volumen esperado de
  // una clínica (decenas/centenas de turnos, no miles) hace este costo
  // aceptable sin sumar un endpoint nuevo solo para esto.
  const [tiposResult, turnosResult, agendadoResult, resueltoResult, canceladaResult, todasResult] = token
    ? await Promise.all([
        apiListTiposConsulta(token),
        apiListTurnos(token, filtros),
        apiListTurnos(token, filtrosDeTab("agendado", q, desde, hasta, tipoConsultaId, verificacion)),
        apiListTurnos(token, filtrosDeTab("resuelto", q, desde, hasta, tipoConsultaId, verificacion)),
        apiListTurnos(token, filtrosDeTab("cancelada", q, desde, hasta, tipoConsultaId, verificacion)),
        apiListTurnos(token, filtrosDeTab("todas", q, desde, hasta, tipoConsultaId, verificacion)),
      ])
    : [null, null, null, null, null, null];

  const tiposConsulta = tiposResult?.ok ? tiposResult.data : [];
  const turnos = turnosResult?.ok ? turnosResult.data : [];
  const conteoPorTab: Record<Tab, number> = {
    agendado: agendadoResult?.ok ? agendadoResult.data.length : 0,
    resuelto: resueltoResult?.ok ? resueltoResult.data.length : 0,
    cancelada: canceladaResult?.ok ? canceladaResult.data.length : 0,
    todas: todasResult?.ok ? todasResult.data.length : 0,
  };
  // Chips de filtros activos (fotos de referencia: "Esta semana ✕",
  // "Consulta general ✕") — cada uno navega a la misma URL sin ESE
  // filtro puntual al tocar la ✕, sin tocar los demás.
  const rangoActivo = (["hoy", "semana", "mes"] as const).find((r) => {
    const calculado = rangoRapidoFechas(r);
    return desde === calculado.desde && hasta === calculado.hasta;
  });
  const RANGO_CHIP_LABEL: Record<"hoy" | "semana" | "mes", string> = { hoy: "Hoy", semana: "Esta semana", mes: "Este mes" };
  const chips: { label: string; hrefSinEste: string }[] = [];
  if (desde || hasta) {
    chips.push({
      label: rangoActivo ? RANGO_CHIP_LABEL[rangoActivo] : "Rango de fechas",
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
    // corrección 2026-08-24 — ver TR-029 en docs/tradeoffs.md: "hay un
    // espacio de más entre el header y donde arranca el scroll... quitá
    // el padding-top sobrante"). El de arriba de todo ya lo da
    // `pt-[var(--header-height)]` en app/panel/layout.tsx (ese no se
    // toca) — este era una segunda capa redundante encima de esa.
    <div className="flex flex-col gap-6 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      {/* Contador total (corrección de estética, 2026-09-06, fotos de
          referencia del cliente: "Turnos 14 en total") — la cuenta de
          "todas" (agendados + cancelados, sin duplicar confirmados/
          resueltos que ya son subconjuntos de agendados). */}
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.375rem,6.5vw,1.875rem)]">
          Turnos
        </h1>
        <span className="text-sm text-grafito/50">{conteoPorTab.todas} en total</span>
      </div>

      {/* Corrección de estética (2026-09-06, foto de referencia
          "diseño2turnos.png"): buscador + botón Filtros van juntos en su
          propia fila, ARRIBA de las pestañas de estado — la foto muestra
          ese orden (buscador/filtros, pestañas, chips), no el de antes
          (pestañas y buscador lado a lado, filtros+chips debajo). Tabla
          sin cambios (pedido explícito del cliente: "las tablas dejelas
          como estaba, no toque eso" — este rediseño es solo la parte de
          arriba). */}
      <div className="flex flex-col gap-4">
        {/* BuscadorEnVivo (TR-115, 2026-09-06) — reemplaza el `<form
            method="get">` de antes: pedido textual del cliente, "que me
            vaya apareciendo resultados sin tocar enter". Ya no hace falta
            `<form>` ni inputs ocultos — el componente arma su propio href
            con los filtros vigentes (`hrefBaseSinQ`) y navega solo, con
            debounce. */}
        <div className="flex flex-wrap items-center gap-2">
          <BuscadorEnVivo q={q} hrefBase={hrefBaseSinQ} placeholder="Nombre, apellido, DNI o email…" />
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

        <nav
          aria-label="Filtrar por estado"
          // Grid de 2×2 en mobile en vez de una fila con scroll propio
          // (pedido explícito del cliente, 2026-08-27: "el
          // seleccionador... sigue haciendo overflow, lo que habilita
          // el desplazamiento horizontal de este apartado, cosa que no
          // es correcto") — con 4 tabs de texto largo ("Confirmadas",
          // "Canceladas"), ni sacándole el min-width al `<nav>`
          // alcanzaba para que entren en una sola fila en pantallas
          // angostas: seguía necesitando su propio `overflow-x-auto`
          // para no desbordar, que es exactamente el movimiento
          // horizontal que se pidió sacar. Un grid de 2 columnas
          // siempre entra sin necesitar scroll, sea cual sea el ancho.
          // Desde `md` vuelve a ser la fila original (`rounded-full`,
          // una sola línea) — cero cambio en escritorio.
          className="grid grid-cols-2 gap-1 rounded-card border-[0.5px] border-arena bg-marfil p-1 text-sm md:flex md:w-fit md:flex-nowrap md:items-center md:overflow-x-auto md:rounded-full"
        >
          {TABS.map((t) => {
            const active = t.tab === tab;
            const href = `/panel/turnos?estado=${t.tab}${querySecundaria}`;
            return (
              <Link
                key={t.tab}
                href={href}
                className={`flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-center font-medium whitespace-nowrap ${active ? "bg-salvia-oscuro text-marfil" : "text-grafito hover:bg-arena"}`}
              >
                {t.label}
                {/* Corrección de estética (2026-09-06): cantidad al
                    lado de cada pestaña ("Confirmadas 8") — mismo tono
                    que el texto de la pestaña, solo un poco más tenue,
                    para no competir con la etiqueta. */}
                <span className={active ? "text-marfil/70" : "text-grafito/40"}>{conteoPorTab[t.tab]}</span>
              </Link>
            );
          })}
        </nav>

        {/* Chips de filtros activos, removibles (fotos de referencia:
            "Esta semana ✕", "Consulta general ✕") — cada ✕ navega a la
            misma URL sin ESE filtro puntual, sin tocar los demás. Solo se
            muestra la fila si hay al menos un chip (nada que remodelar
            cuando no hay filtros aplicados). */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <Link
                key={chip.label}
                href={chip.hrefSinEste}
                className="inline-flex items-center gap-1.5 rounded-full bg-salvia-claro px-3 py-1.5 text-xs font-medium text-salvia-oscuro hover:brightness-95"
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
        <TurnosTable
          key={`${tab}-${q ?? ""}-${desde ?? ""}-${hasta ?? ""}-${tipoConsultaId ?? ""}-${verificacion ?? ""}-${abrirId ?? ""}`}
          turnosIniciales={turnos}
          tiposConsulta={tiposConsulta}
          filtros={filtros}
          abrirId={abrirId}
        />
      </div>
    </div>
  );
}
