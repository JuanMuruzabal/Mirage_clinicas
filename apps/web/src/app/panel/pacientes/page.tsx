import type { Metadata } from "next";
import {
  apiListConflictosPaciente,
  apiListPacientesPaginado,
} from "@/lib/api";
import type { ListarPacientesParams } from "@/lib/api";
import { PACIENTES_POR_PAGINA } from "@/lib/paginacion";
import { getSessionToken, requireOnboardingComplete } from "@/lib/session";
import { datosDeLaVista } from "@/lib/vista-de-recepcion";
import { tiposConsultaDeLaVista } from "@/lib/tipos-de-la-vista";
import { ZonaProfesional } from "@/components/panel/zona-profesional";
import { CLASE_PANTALLA_CON_ENCABEZADO, EncabezadoDeSeccion } from "@/components/panel/encabezado-de-seccion";
import { PacientesTable } from "@/components/panel/pacientes-table";
import { CLASE_CAJA_VACIA } from "@/components/panel/tabla";
import { AgregarPacienteButton } from "@/components/panel/agregar-paciente-button";
import { ConflictosPacienteBanner } from "@/components/panel/conflictos-paciente-banner";
import { QueEsVerificadoBoton } from "@/components/panel/que-es-verificado-boton";
import { BuscadorEnVivo } from "@/components/panel/buscador-en-vivo";

export const metadata: Metadata = { title: "Pacientes — PRISMA" };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Sin pestañas Todos/Verificados/Sin verificar (correcciones generales,
// ítem 5, 2026-10-11, pedido de la persona): la lista muestra siempre a
// todos, y cada fila sigue diciendo si la ficha está verificada. Un enlace
// viejo con `?estado=verificados` o `?estado=sin_verificar` no rompe nada:
// el parámetro se ignora.

// /panel/pacientes (T3.5) — tabla + buscador por nombre/apellido/DNI. La
// página sigue siendo Server Component (mismo criterio que /buscar); la
// tabla en sí (fila clickeable de punta a punta, TR-023, + el panel
// desplegable de DNI/Email en mobile) vive en PacientesTable, la única
// pieza de cliente acá.
export default async function PacientesPage({
  searchParams,
}: PageProps<"/panel/pacientes">) {
  const resolved = await searchParams;
  const q = firstParam(resolved.q);

  const sesion = await requireOnboardingComplete();
  const token = await getSessionToken();
  const { profesionales, vista, esRecepcion } = await datosDeLaVista(
    token,
    sesion.roles,
  );

  // La primera tanda (PACIENTES_POR_PAGINA, el resto llega con "Cargar
  // más"), de todas las fichas: sin filtro de verificación.
  const filtros: ListarPacientesParams = { q };
  // TODO lo que esta pantalla necesita, de una sola vez (ronda de
  // optimización post-Fase 3, 2026-09-22): la lista, los conflictos y los
  // tipos de consulta no dependen entre sí, así que van en paralelo. Los
  // contadores de las pestañas se fueron con ellas.
  const [paginaPacientes, conflictosResult, tiposConsulta] = token
    ? await Promise.all([
        apiListPacientesPaginado(token, filtros, PACIENTES_POR_PAGINA, 0),
        apiListConflictosPaciente(token),
        // El color es de QUIEN MIRA (TR-145): para recepción, su paleta
        // precargada. Ver `lib/tipos-de-la-vista.ts`.
        tiposConsultaDeLaVista(token, sesion.roles),
      ])
    : [null, null, []];

  const pacientesFiltrados = paginaPacientes?.ok
    ? paginaPacientes.data.items
    : [];
  const totalPacientes = paginaPacientes?.ok ? paginaPacientes.data.total : 0;
  // hrefBase — para BuscadorEnVivo (TR-115): la pantalla sin `q` (el
  // componente lo agrega solo, con cada tecla).
  const hrefBaseSinQ = "/panel/pacientes";

  // Fase 2.4.1: conflictos de pacientes sin resolver (dos fichas
  // compitiendo por el mismo DNI, detectadas desde el formulario público)
  // — banner arriba de la tabla, igual criterio que el banner de
  // conflicto del calendario (TR-095).
  const conflictos = conflictosResult?.ok ? conflictosResult.data : [];
  // Corrección de QA: la pantalla de resolución de conflictos muestra el
  // NOMBRE del tipo de consulta del turno en conflicto (y del que ya
  // estuviera activo, si hay colisión) — el endpoint de conflictos solo
  // trae el id.
  // Recepción sin nadie en foco: ahí ya se ven todas las fichas de la
  // clínica, así que "+ Agregar paciente > De la clínica" no tiene a qué
  // lista sumar (ver AgregarPacienteModal).
  const enVistaGeneral = esRecepcion && vista?.profesional == null;

  return (
    // px/pb con clamp() + pt fijo y chico (rama fix/mobile, sexta
    // corrección 2026-08-24 — ver TR-029 en docs/Arquitectura y base/tradeoffs.md: "hay un
    // espacio de más entre el header y donde arranca el scroll... quitá
    // el padding-top sobrante").
    <div className={CLASE_PANTALLA_CON_ENCABEZADO}>
      {/* Encabezado de sección (correcciones generales, ítem 2). Sin el
          contador "x registrados" al lado del título (ítem 4). El selector
          de recepción va arriba de la tarjeta, a su mismo ancho. */}
      {/* El aviso de conflictos va pegado al encabezado y trae su propia
          distancia solo cuando se ve: plegado a cero, adentro del `gap`
          de la pantalla sumaba un segundo hueco (48 px en vez de 24,
          ítem 3). */}
      <div className="flex flex-col">
        <EncabezadoDeSeccion
          seccion="pacientes"
          titulo="Pacientes"
          antes={
            esRecepcion ? (
              <ZonaProfesional
                profesionales={profesionales}
                vista={vista}
                etiqueta="Mostrando"
                etiquetaConFoco="Pacientes de"
                etiquetaGeneral="Toda la clínica"
                detalleGeneral="Pacientes de todo el equipo"
              />
            ) : undefined
          }
        />
        <ConflictosPacienteBanner
          conflictos={conflictos}
          tiposConsulta={tiposConsulta}
        />
      </div>

      {/* Corrección de estética (2026-09-06, foto de referencia): buscador
          + "+ Agregar paciente" van juntos en su fila, y al final "¿Qué
          es verificado?" (las pestañas de verificación salieron, ítem
          5). Tabla sin cambios (mismo pedido explícito del
          cliente que en Turnos: "las tablas dejelas como estaba, no
          toque eso"). */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3 max-md:w-full">
          {/* BuscadorEnVivo (TR-115, 2026-09-06) — reemplaza el `<form
              method="get">` de antes, mismo pedido que en Turnos: "que me
              vaya apareciendo resultados sin tocar enter". */}
          {/* El ancho lo trae el buscador: el mismo en Turnos, Pacientes
              y los documentos de la ficha (ítem 6). */}
          {/* En el celular el buscador baja al final, justo encima de la
              tabla, y arriba quedan "+ Agregar paciente" y "¿Qué es
              verificado?" (pedido de la persona, 2026-10-17). Desde `md`,
              todo en una fila como siempre. */}
          <div className="w-full max-md:order-last md:w-auto">
            <BuscadorEnVivo
              q={q}
              hrefBase={hrefBaseSinQ}
              placeholder="Nombre, apellido o DNI…"
            />
          </div>
          <AgregarPacienteButton sinListaPropia={enVistaGeneral} />
          <div className="md:ml-auto">
            <QueEsVerificadoBoton />
          </div>
        </div>

        {/* Misma tabla en mobile y escritorio, completa en los dos: en el
            celular scrollea de costado (correcciones generales, ítem 9;
            ver PacientesTable). */}
        {pacientesFiltrados.length === 0 ? (
          <p className={`${CLASE_CAJA_VACIA} p-8 text-center text-sm text-grafito/75`}>
            {q
              ? "No encontramos pacientes para esa búsqueda."
              : "Todavía no hay pacientes cargados."}
          </p>
        ) : (
          <PacientesTable
            pacientes={pacientesFiltrados}
            totalInicial={totalPacientes}
            filtros={filtros}
          />
        )}
      </div>
    </div>
  );
}
