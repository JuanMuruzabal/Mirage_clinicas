"use client";

import { useEffect, useState } from "react";
import type { VersionPaginaPublica } from "@dental-mirage/shared-types";
import { historialPaginaPublicaAction } from "@/app/actions/pagina-publica";
import { Dialogo } from "@/components/dialogo";
import { formatFechaHora } from "@/lib/turno-format";

interface HistorialVersionesProps {
  /** Hay cambios sin guardar: restaurar los pisa, así que se avisa antes. */
  sinGuardar: boolean;
  /** Restaura esa versión en el borrador; devuelve el error a mostrar acá, o null para cerrar. */
  onRestaurar: (numero: number) => Promise<string | null>;
  onCerrar: () => void;
}

type Estado =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "listo"; versiones: VersionPaginaPublica[] };

// HistorialVersiones (PP-3, H2) — la pantalla que le faltaba a PE-8: las
// versiones publicadas, de la más nueva a la más vieja, y "Restaurar en el
// borrador". Restaurar NUNCA publica: copia el contenido de esa versión al
// borrador (el backend lo guarda con el mismo candado de revisión que
// "Guardar cambios") y la persona decide después si la publica.
export function HistorialVersiones({ sinGuardar, onRestaurar, onCerrar }: HistorialVersionesProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  // Con cambios sin guardar, el primer click pide confirmar EN LA FILA (un
  // diálogo encima de otro complica el foco sin ganar nada).
  const [porConfirmar, setPorConfirmar] = useState<number | null>(null);
  const [restaurando, setRestaurando] = useState<number | null>(null);
  const [errorRestaurar, setErrorRestaurar] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    historialPaginaPublicaAction().then((result) => {
      if (!vigente) return;
      setEstado("error" in result ? { tipo: "error", mensaje: result.error } : { tipo: "listo", versiones: result.versiones });
    });
    return () => {
      vigente = false;
    };
  }, []);

  async function restaurar(numero: number) {
    if (sinGuardar && porConfirmar !== numero) {
      setPorConfirmar(numero);
      return;
    }
    setRestaurando(numero);
    setErrorRestaurar(null);
    const error = await onRestaurar(numero);
    setRestaurando(null);
    if (error === null) onCerrar();
    else setErrorRestaurar(error);
  }

  return (
    <Dialogo
      titulo="Historial de publicaciones"
      descripcion="Restaurar una versión la copia en tu borrador. No se publica hasta que toques “Publicar”."
      onCerrar={onCerrar}
      ancho="medio"
      etiquetaCerrar="Cerrar historial"
    >
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        {errorRestaurar && (
          <p role="alert" className="rounded-card border-[0.5px] border-terracota bg-terracota-claro px-4 py-3 text-sm text-terracota-oscuro">
            {errorRestaurar}
          </p>
        )}
        {estado.tipo === "cargando" && (
          <p role="status" className="text-sm text-grafito/80">
            Cargando versiones…
          </p>
        )}
        {estado.tipo === "error" && (
          <p role="alert" className="text-sm text-terracota-oscuro">
            {estado.mensaje}
          </p>
        )}
        {estado.tipo === "listo" && estado.versiones.length === 0 && (
          <p className="text-sm text-grafito/80">Todavía no publicaste ninguna versión.</p>
        )}
        {estado.tipo === "listo" && estado.versiones.length > 0 && (
          <ol className="flex flex-col divide-y-[0.5px] divide-arena rounded-card border-[0.5px] border-arena bg-marfil">
            {estado.versiones.map((v, i) => (
              <li key={v.numero} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="text-sm text-grafito">
                  <p className="font-medium">
                    Versión {v.numero}
                    {i === 0 && (
                      <span className="ml-2 rounded-full border-[0.5px] border-salvia bg-salvia-claro px-2 py-0.5 text-xs font-medium text-salvia-oscuro">
                        Publicada ahora
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-grafito/80">
                    {formatFechaHora(v.publicadaEn)} · {v.publicadaPorNombre}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {porConfirmar === v.numero && (
                    <p role="alert" className="max-w-64 text-right text-xs text-terracota-oscuro">
                      Tenés cambios sin guardar: restaurar los reemplaza.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void restaurar(v.numero)}
                    disabled={restaurando !== null}
                    className="min-h-11 rounded-full border-[0.5px] border-arena bg-marfil px-4 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro disabled:opacity-50"
                  >
                    {restaurando === v.numero
                      ? "Restaurando…"
                      : porConfirmar === v.numero
                        ? `Sí, restaurar la versión ${v.numero}`
                        : `Restaurar la versión ${v.numero}`}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Dialogo>
  );
}
