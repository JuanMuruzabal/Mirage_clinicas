"use client";

import { useState } from "react";
import type { BloqueosSeguridad } from "@dental-mirage/shared-types";
import { desbloquearIPAction, desbloquearMailAction, listBloqueosSeguridadAction } from "@/app/actions/seguridad";
import { formatFechaHora } from "@/lib/turno-format";
import { CLASE_TACTIL } from "@/components/editor-pagina/estilos";
import { CajaDeTabla } from "./caja-de-tabla";
import { CLASE_CABECERA, CLASE_CAJA_TABLA, CLASE_CELDA, CLASE_CELDA_SECUNDARIA, CLASE_CODIGO, CLASE_COLUMNA_ACCIONES, CLASE_FILA, CLASE_MONO, CLASE_TABLA } from "./tabla";

// Las tres tablas con el sistema común del panel (correcciones generales,
// ítem 9): en el celular, completas, con scroll de costado. Cada caja mide
// como mucho una pantalla, sin bajar de cuatro filas (CajaDeTabla).
const BOTON = `inline-flex items-center rounded-control border border-linea bg-marfil px-3 py-1.5 text-xs font-medium text-grafito hover:border-marca-medio hover:bg-velo hover:text-marca disabled:opacity-60 ${CLASE_TACTIL}`;

interface SeguridadBloqueosProps {
  inicial: BloqueosSeguridad;
}

const MOTIVO_LABEL: Record<string, string> = {
  mail_muchos_dnis: "Mismo mail, muchos DNIs distintos",
  ip_rotacion: "Rotación de mail y DNI desde la misma IP",
  dni_tipo_tope: "Tope de turnos sin verificar por DNI",
};

// SeguridadBloqueos — corrección de seguridad (Fase 2.4.1), pedido
// textual del cliente: "el apartado de auditoría de turnos de bloqueos,
// donde muestre los mails bloqueados etc, por las dudas de algún
// malentendido". Tres secciones: mails/IPs bloqueados ahora mismo (con
// botón para desbloquear, por si fue un falso positivo) y la auditoría
// completa (qué se borró y por qué — los turnos en sí no vuelven, esto
// es solo para entender qué pasó).
export function SeguridadBloqueos({ inicial }: SeguridadBloqueosProps) {
  const [datos, setDatos] = useState(inicial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function recargar() {
    listBloqueosSeguridadAction().then(setDatos);
  }

  async function desbloquearMail(id: string) {
    setError(null);
    setPendingId(id);
    const result = await desbloquearMailAction(id);
    setPendingId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    recargar();
  }

  async function desbloquearIP(id: string) {
    setError(null);
    setPendingId(id);
    const result = await desbloquearIPAction(id);
    setPendingId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    recargar();
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="rounded-card border-[0.5px] border-terracota bg-terracota-claro px-4 py-3 text-sm text-terracota-oscuro">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-grafito">Mails bloqueados</h2>
        {datos.mailsBloqueados.length === 0 ? (
          <p className="text-sm text-grafito/75">No hay ningún mail bloqueado en este momento.</p>
        ) : (
          <CajaDeTabla llenaLaPantalla className={CLASE_CAJA_TABLA}>
            <table className={CLASE_TABLA}>
              <thead>
                <tr>
                  <th className={CLASE_CABECERA}>Mail</th>
                  <th className={CLASE_CABECERA}>Bloqueado hasta</th>
                  <th className={`${CLASE_CABECERA} ${CLASE_COLUMNA_ACCIONES}`}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {datos.mailsBloqueados.map((m) => (
                  <tr key={m.id} className={CLASE_FILA}>
                    <td className={CLASE_CELDA}>{m.email}</td>
                    <td className={`${CLASE_CELDA_SECUNDARIA} ${CLASE_MONO}`}>{formatFechaHora(m.bloqueadoHasta)}</td>
                    <td className={`${CLASE_CELDA} ${CLASE_COLUMNA_ACCIONES}`}>
                      <button
                        type="button"
                        onClick={() => desbloquearMail(m.id)}
                        disabled={pendingId === m.id}
                        className={BOTON}
                      >
                        {pendingId === m.id ? "Desbloqueando…" : "Desbloquear"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CajaDeTabla>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-grafito">IPs bloqueadas</h2>
        {datos.ipsBloqueadas.length === 0 ? (
          <p className="text-sm text-grafito/75">No hay ninguna IP bloqueada en este momento.</p>
        ) : (
          <CajaDeTabla llenaLaPantalla className={CLASE_CAJA_TABLA}>
            <table className={CLASE_TABLA}>
              <thead>
                <tr>
                  <th className={CLASE_CABECERA}>IP</th>
                  <th className={CLASE_CABECERA}>Bloqueada hasta</th>
                  <th className={`${CLASE_CABECERA} ${CLASE_COLUMNA_ACCIONES}`}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {datos.ipsBloqueadas.map((ipRow) => (
                  <tr key={ipRow.id} className={CLASE_FILA}>
                    <td className={`${CLASE_CELDA} ${CLASE_CODIGO}`}>{ipRow.ip}</td>
                    <td className={`${CLASE_CELDA_SECUNDARIA} ${CLASE_MONO}`}>{formatFechaHora(ipRow.bloqueadoHasta)}</td>
                    <td className={`${CLASE_CELDA} ${CLASE_COLUMNA_ACCIONES}`}>
                      <button
                        type="button"
                        onClick={() => desbloquearIP(ipRow.id)}
                        disabled={pendingId === ipRow.id}
                        className={BOTON}
                      >
                        {pendingId === ipRow.id ? "Desbloqueando…" : "Desbloquear"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CajaDeTabla>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-grafito">Auditoría</h2>
        <p className="text-sm text-grafito/75">
          Turnos borrados automáticamente por un patrón de abuso detectado — no se pueden recuperar, esto es solo un registro de qué pasó.
          Una fila marcada <span className="font-semibold text-grafito">Simulado</span> no bloqueó ni borró nada de verdad — es el modo de
          prueba en desarrollo local.
        </p>
        {datos.auditoria.length === 0 ? (
          <p className="text-sm text-grafito/75">Todavía no se registró ningún bloqueo.</p>
        ) : (
          <CajaDeTabla llenaLaPantalla className={CLASE_CAJA_TABLA}>
            <table className={CLASE_TABLA}>
              <thead>
                <tr>
                  <th className={CLASE_CABECERA}>Motivo</th>
                  <th className={CLASE_CABECERA}>Mail / IP</th>
                  <th className={CLASE_CABECERA}>DNIs</th>
                  <th className={`${CLASE_CABECERA} text-right`}>Turnos borrados</th>
                  <th className={CLASE_CABECERA}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {datos.auditoria.map((a) => (
                  <tr key={a.id} className={CLASE_FILA}>
                    <td className={CLASE_CELDA}>
                      <div className="flex items-center gap-2">
                        <span>{MOTIVO_LABEL[a.motivo] ?? a.motivo}</span>
                        {a.simulado && (
                          <span className="rounded-pastilla border-[0.5px] border-marca-medio bg-marca-claro px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-marca">
                            Simulado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={CLASE_CELDA_SECUNDARIA}>
                      {a.email && <div>{a.email}</div>}
                      {a.ip && <div className={CLASE_CODIGO}>{a.ip}</div>}
                    </td>
                    {/* Una lista de DNIs puede ser larga: es la única celda
                        que parte renglón, con un ancho tope. */}
                    <td className={`${CLASE_CELDA_SECUNDARIA} ${CLASE_MONO} max-w-[18rem] min-w-[10rem] whitespace-normal`}>{a.dnis || "—"}</td>
                    <td className={`${CLASE_CELDA} text-right tabular-nums`}>{a.turnosBorrados}</td>
                    <td className={`${CLASE_CELDA_SECUNDARIA} ${CLASE_MONO}`}>{formatFechaHora(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CajaDeTabla>
        )}
      </section>
    </div>
  );
}
