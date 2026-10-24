"use client";

import Link from "next/link";
import { useState } from "react";
import type { Paciente, TutorInfo } from "@dental-mirage/shared-types";
import { textoEsLargo } from "@/lib/texto-largo";
import { TUTOR_RELACION_LABEL } from "@/lib/tutores";
import { VerTextoBoton } from "../ver-texto-boton";
import { AvatarIniciales } from "./avatar-iniciales";
import { ClickableTableRow } from "./clickable-table-row";
import { EstadoVerificadoBadge } from "./estado-verificado-badge";
import { CargarMas } from "./cargar-mas";
import { listPacientesPaginadoAction } from "@/app/actions/pacientes";
import { useEstadoDelServidor } from "@/lib/estado-del-servidor";
import { CajaDeTabla } from "./caja-de-tabla";
import {
  CLASE_CABECERA,
  CLASE_CAJA_TABLA,
  CLASE_CELDA,
  CLASE_CELDA_SECUNDARIA,
  CLASE_COLUMNA_FIJA,
  CLASE_FILA_CLICABLE,
  CLASE_MONO,
  CLASE_TABLA,
} from "./tabla";
import type { ListarPacientesParams } from "@/lib/api";
import { PACIENTES_POR_PAGINA } from "@/lib/paginacion";

interface PacientesTableProps {
  // pacientes — la PRIMERA tanda (Fase B de la auditoría), no la lista
  // completa: el resto llega con "Cargar más".
  pacientes: Paciente[];
  // totalInicial / filtros — lo que hace falta para pedir las tandas
  // siguientes. Opcionales, y sin ellos la tabla se comporta como antes
  // de paginar (muestra lo que le pasaron y no ofrece cargar más): así
  // sigue sirviendo para cualquier render que arme la lista a mano.
  totalInicial?: number;
  filtros?: ListarPacientesParams;
}

// todosLosContactos — corrección de QA (ronda de correcciones, 2026-09-06):
// "en la tabla pacientes, si el paciente tiene más de un número o mail
// (agregados por resolución de conflictos) poner un botón de ver mails,
// ver teléfonos si posee más de uno" — mismo criterio que ya usa
// paciente-datos.tsx en la ficha (el principal primero, seguido de los
// alternativos migrados por una resolución de conflicto anterior), acá
// factorizado para las columnas de la tabla.
function todosLosContactos(p: Paciente): { mails: string[]; telefonos: string[] } {
  return {
    mails: [p.email, ...(p.emailsAlternativos ?? [])].filter((m): m is string => Boolean(m)),
    telefonos: [p.telefono, ...(p.telefonosAlternativos ?? [])].filter((t): t is string => Boolean(t)),
  };
}

// PacientesTable — extraída de pacientes/page.tsx. El DNI va en su propia
// columna (pedido del cliente, 2026-08-27: "no debajo del nombre"), en
// todos los anchos: desde el 2026-10-12 la tabla del celular va completa y
// scrollea de costado, en vez de esconder columnas en un panel desplegable.
// La fila entera lleva a la ficha (TR-023, `ClickableTableRow`).
export function PacientesTable({ pacientes: pacientesIniciales, totalInicial, filtros }: PacientesTableProps) {
  // useEstadoDelServidor y no useState: con useState, los datos nuevos
  // que trae `router.refresh()` se ignoraban y la tabla solo se
  // actualizaba con F5 (ver el comentario grande de ese hook).
  const [total, setTotal] = useState(totalInicial ?? pacientesIniciales.length);
  const [pacientes, setPacientes] = useEstadoDelServidor<Paciente[]>(pacientesIniciales, (frescos) =>
    setTotal(totalInicial ?? frescos.length),
  );
  const [cargandoMas, setCargandoMas] = useState(false);

  // La columna se dibuja cuando el dato viene, y el backend solo lo manda
  // en la vista general (Fase 3.2.6) — así la regla de "cuándo se ve"
  // tiene un solo dueño, igual que la columna de profesional en Turnos.
  const conProfesionales = pacientes.some((p) => (p.profesionales?.length ?? 0) > 0);

  // cargarMas — la siguiente tanda desde donde quedó la anterior. El
  // total se refresca en cada tanda: entre un click y el otro pudo
  // haberse dado de alta (o borrado) una ficha.
  async function cargarMas() {
    setCargandoMas(true);
    try {
      const pagina = await listPacientesPaginadoAction(filtros ?? {}, PACIENTES_POR_PAGINA, pacientes.length);
      setPacientes((actuales) => [...actuales, ...pagina.items]);
      setTotal(pagina.total);
    } finally {
      setCargandoMas(false);
    }
  }

  return (
    <>
    {/* La misma tabla en todos los anchos, con el sistema común de las
        tablas del panel (components/panel/tabla.ts). Hasta el 2026-10-12
        el celular mostraba solo Nombre y Estado, y DNI, Teléfono, Email,
        Tutor y Profesionales al desplegar la fila; desde las correcciones
        generales (ítem 9, pedido de la persona) la tabla va COMPLETA, en el
        orden de la computadora, y scrollea de costado adentro de su caja,
        con el nombre fijo a la izquierda. Tocar la fila lleva a la ficha en
        todos los anchos, como en la computadora. El alto crece hasta el
        espacio libre de la pantalla (CajaDeTabla). Sticky por `th`
        (`.panel-th-sticky`): bug de Safari de iOS con rebote elástico
        (2026-08-28). */}
    <CajaDeTabla llenaLaPantalla className={CLASE_CAJA_TABLA}>
      <table className={CLASE_TABLA}>
        <thead>
          <tr>
            <th className={`${CLASE_CABECERA} ${CLASE_COLUMNA_FIJA}`}>Nombre</th>
            <th className={CLASE_CABECERA}>Estado</th>
            <th className={CLASE_CABECERA}>DNI</th>
            <th className={CLASE_CABECERA}>Teléfono</th>
            <th className={CLASE_CABECERA}>Email</th>
            {/* Tutor (Fase 2.4.2) — nombre de quien reservó en nombre del
                paciente, solo cuando la ficha se cargó por "sacar turno
                para otro"; "—" en cualquier otro caso. */}
            <th className={CLASE_CABECERA}>Tutor</th>
            {/* Profesionales (Fase 3.2.6, mockup `pacientes-recepcion.html`)
                — solo en la vista general de recepción, que es la única
                donde las fichas son de varias personas. En la vista de un
                profesional son todas suyas y la columna sería su inicial
                repetida en cada fila. Misma regla que la columna de
                profesional en Turnos: se dibuja cuando el dato viene. */}
            {conProfesionales && <th className={CLASE_CABECERA}>Profesionales</th>}
          </tr>
        </thead>
        <tbody>
          {pacientes.map((p) => {
            const { mails, telefonos } = todosLosContactos(p);
            return (
              <ClickableTableRow key={p.id} href={`/panel/pacientes/${p.id}`} className={CLASE_FILA_CLICABLE}>
                <td className={`${CLASE_CELDA} ${CLASE_COLUMNA_FIJA}`}>
                  <div className="flex items-center gap-3">
                    {/* En el celular sin el avatar: la columna queda fija a la
                        izquierda, y cuanto más angosta, más lugar le deja a
                        las que scrollean. */}
                    <AvatarIniciales nombre={p.nombre} apellido={p.apellido} className="max-md:hidden" />
                    {/* El nombre es el link a la ficha: el único camino por
                        teclado y lector de pantalla, porque la fila no recibe
                        foco (el click en el resto de la fila es para el mouse).
                        Se dibuja como el nombre del paciente en "Pacientes con
                        documentos" (subrayado al pasar el mouse), con el foco
                        en el verde de marca: el `marca-medio` da 2,7:1 sobre
                        el blanco, y un indicador de foco pide 3:1. */}
                    <Link
                      href={`/panel/pacientes/${p.id}`}
                      className="rounded-sm font-medium text-grafito hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
                    >
                      {p.nombre} {p.apellido}
                    </Link>
                  </div>
                </td>
                <td className={CLASE_CELDA}>
                  <EstadoVerificadoBadge verificado={p.verificado} />
                </td>
                <td className={`${CLASE_CELDA} ${CLASE_MONO}`}>{p.dni}</td>
                <td className={CLASE_CELDA}>
                  {/* Con más de un teléfono, un botón que los muestra
                      todos (sin flecha: abre un modal, no navega). El valor
                      plano va en la monoespaciada; el botón, en la normal. */}
                  {telefonos.length > 1 ? (
                    <VerTextoBoton titulo="Teléfonos" texto={telefonos.join("\n")} principal={p.telefono} />
                  ) : (
                    <span className={CLASE_MONO}>{telefonos[0] || "—"}</span>
                  )}
                </td>
                <td className={CLASE_CELDA_SECUNDARIA}>
                  {/* Extra 2.3.4 (E4.1): un email largo no se muestra
                      inline — rompía el ancho de la fila. Con más de un
                      mail, un solo botón con todos, como "Ver teléfonos". */}
                  {mails.length > 1 ? (
                    <VerTextoBoton titulo="Mails" texto={mails.join("\n")} principal={p.email} />
                  ) : textoEsLargo(mails[0]) ? (
                    <VerTextoBoton titulo="Email" texto={mails[0]!} />
                  ) : (
                    mails[0] || "—"
                  )}
                </td>
                <td className={CLASE_CELDA}>
                  {/* Un paciente puede tener más de un tutor: con más de
                      uno, "Ver tutores" los muestra en un modal, el mismo
                      botón que "Ver teléfonos" y "Ver mails" (2026-10-17;
                      antes llevaba a la ficha). */}
                  {(p.tutores?.length ?? 0) > 1 ? (
                    <VerTextoBoton titulo="Tutores" contenido={<ListaDeTutores tutores={p.tutores!} />} />
                  ) : (
                    p.tutores?.[0]?.nombre || "—"
                  )}
                </td>
                {conProfesionales && (
                  <td className={CLASE_CELDA}>
                    <AvataresDeProfesionales profesionales={p.profesionales ?? []} />
                  </td>
                )}
              </ClickableTableRow>
            );
          })}
        </tbody>
      </table>
    </CajaDeTabla>
    {/* Fuera de la caja con scroll de arriba, no adentro: el botón tiene
        que estar siempre a la vista, no al final de un scroll interno. */}
    <CargarMas cargados={pacientes.length} total={total} cargando={cargandoMas} onCargarMas={cargarMas} sustantivo="pacientes" />
    </>
  );
}

/**
 * AvataresDeProfesionales — quiénes tienen a esta persona entre sus
 * pacientes (Fase 3.2.6, mockup `pacientes-recepcion.html`).
 *
 * Apilados y con iniciales, no una lista de nombres: en una tabla de
 * muchas filas lo que se necesita saber de un vistazo es "¿es de uno o de
 * varios?", y tres nombres completos por fila comerían el ancho de la
 * columna que de verdad importa, el del paciente.
 *
 * Tope de tres y un "+N": el mockup lo dibuja así, y tiene sentido —
 * pasado ese punto la pila deja de leerse y el número dice lo mismo en
 * menos espacio. El nombre completo va en el `title` de cada avatar.
 */
function AvataresDeProfesionales({
  profesionales,
}: {
  profesionales: { userId: string; nombre: string }[];
}) {
  if (profesionales.length === 0) {
    return <span className="text-grafito/75">—</span>;
  }
  const visibles = profesionales.slice(0, 3);
  const resto = profesionales.length - visibles.length;
  return (
    <div className="flex items-center gap-2">
      {/* `ms-[-9px]` salvo en el primero: es lo que hace la pila. El
          borde del color de la fila los separa entre sí. */}
      <span className="flex items-center">
        {visibles.map((prof, i) => (
          <span
            key={prof.userId}
            title={prof.nombre}
            className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full border-2 border-marfil bg-marca-claro font-[family-name:var(--font-display)] text-[11.5px] font-semibold text-marca ${
              i > 0 ? "-ms-[9px]" : ""
            }`}
          >
            {inicialesDeProfesional(prof.nombre)}
          </span>
        ))}
      </span>
      {resto > 0 && <span className="text-[13.5px] text-grafito/75">+{resto}</span>}
    </div>
  );
}

// Las mismas iniciales que el resto del panel (ver zona-profesional.tsx):
// el tratamiento no distingue a nadie en una clínica llena de odontólogos.
function inicialesDeProfesional(nombre: string): string {
  const partes = nombre
    .replace(/^(Dra?\.|Od\.|Lic\.)\s*/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return ((partes[0]?.charAt(0) ?? "") + (partes[1]?.charAt(0) ?? "")).toUpperCase() || "?";
}

/**
 * ListaDeTutores — el cuerpo de "Ver tutores": nombre, relación y lo que
 * tenga cada tutor para contactarlo (teléfonos y mail). Mismo orden y
 * mismas piezas que "Datos de tutores" de la ficha, sin el avatar: es un
 * modal chico.
 */
function ListaDeTutores({ tutores }: { tutores: TutorInfo[] }) {
  return (
    <ul className="flex flex-col px-6 py-2 text-sm text-grafito">
      {tutores.map((tutor, i) => {
        const telefonos = [tutor.telefono, ...(tutor.telefonosAlternativos ?? [])].filter(Boolean);
        return (
          <li key={tutor.id || `${tutor.email}-${i}`} className={`flex flex-col gap-1.5 py-4 ${i > 0 ? "border-t border-grafito/10" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{tutor.nombre}</span>
              {tutor.relacion && (
                <span className="rounded-pastilla bg-marca-claro px-2.5 py-0.5 text-xs font-medium text-marca">
                  {TUTOR_RELACION_LABEL[tutor.relacion] ?? tutor.relacion}
                </span>
              )}
            </div>
            {telefonos.map((tel) => (
              <span key={tel} className={`${CLASE_MONO} text-grafito/75`}>
                {tel}
              </span>
            ))}
            {tutor.email && <span className="break-all text-grafito/75">{tutor.email}</span>}
            {telefonos.length === 0 && !tutor.email && <span className="text-grafito/75">Sin datos de contacto</span>}
          </li>
        );
      })}
    </ul>
  );
}
