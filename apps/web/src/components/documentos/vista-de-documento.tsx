"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentoDetalle } from "@dental-mirage/shared-types";
import { plantillaPorId, type FirmaDePlantilla } from "@dental-mirage/documentos-clinicos";
import { volverAEditarDocumentoAction } from "@/app/actions/documentos";
import { contenidoCongelado, fechaYHora, huellaCorta } from "@/lib/documentos";
import { CalcoCongelado } from "./calco";
import { FirmarDialogo } from "./firmar-dialogo";
import { LaminaDocumento, paginasDeLaLamina } from "./lamina-documento";
import { PantallaCompleta } from "./pantalla-completa";

// VistaDeDocumento — un documento terminado (Fase 5.1): esperando firmas,
// sellado o anulado. Lo que se muestra es lo CONGELADO —lo que la API fijó
// al terminar y es lo que se firma—, nunca vuelto a armar con la
// plantilla: la página original con la composición congelada encima (la
// lámina, TR-187) y las firmas en su renglón; o, en una plantilla sin
// lámina, el calco con el texto congelado.
//
// Lee los datos directo de las props: después de firmar, `router.refresh()`
// trae el documento nuevo y la pantalla lo muestra sin estado local que
// quede viejo (TR-156).
export function VistaDeDocumento({ documento }: { documento: DocumentoDetalle }) {
  const router = useRouter();
  const [firmando, setFirmando] = useState<FirmaDePlantilla | null>(null);
  const [volviendo, setVolviendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contenido = contenidoCongelado(documento.contenido);

  if (!contenido) {
    return <p className="text-sm text-terracota-oscuro">No se pudo leer el contenido de este documento.</p>;
  }

  const aFirmar = documento.estado === "a_firmar";
  const puedeFirmar = aFirmar && documento.esMio;
  const puedeVolverAEditar = puedeFirmar && documento.firmas.length === 0;
  const profesionalNombre = `${contenido.profesional.nombre} ${contenido.profesional.apellido}`.trim();
  // La versión que se firmó, no la última: su lámina y su página.
  const plantilla = plantillaPorId(contenido.plantilla.id, contenido.plantilla.version);
  const paginasDeLamina = contenido.lamina ? paginasDeLaLamina(plantilla) : null;
  const etiquetaDeLaHoja = documento.estado === "sellado" ? "Documento sellado" : "Documento para firmar";

  async function volverAEditar() {
    setVolviendo(true);
    setError(null);
    const res = await volverAEditarDocumentoAction(documento.id);
    setVolviendo(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  const pie = (
    <div className="flex flex-col gap-1">
      <p>
        Modelo: {contenido.plantilla.fuente.nombre} · versión {contenido.plantilla.version}.
      </p>
      <p>
        Terminado el {fechaYHora(documento.terminadoEn)} · huella del contenido{" "}
        <span title={documento.hashContenido} className="font-[family-name:var(--font-mono)]">
          {huellaCorta(documento.hashContenido)}
        </span>
      </p>
      {documento.estado === "sellado" && (
        <p>
          Sellado el {fechaYHora(documento.selladoEn)} · folio {documento.folio} · sello{" "}
          <span title={documento.hashSello} className="font-[family-name:var(--font-mono)]">
            {huellaCorta(documento.hashSello)}
          </span>
        </p>
      )}
    </div>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      <aside aria-label="Firmas del documento" className="flex flex-col gap-3 lg:sticky lg:top-4">
        {documento.estado === "sellado" && (
          <section className="rounded-card border border-salvia/40 bg-salvia-claro p-4 text-sm text-salvia-oscuro">
            <h3 className="font-[family-name:var(--font-display)] text-lg font-medium">Firmado y sellado</h3>
            <p className="mt-1">
              Es parte de la historia clínica del paciente y ya no se puede modificar ni borrar. Si hace falta corregir algo, se hace con un documento nuevo.
            </p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-salvia-oscuro/80">Folio</dt>
              <dd>{documento.folio}</dd>
              <dt className="text-salvia-oscuro/80">Sellado</dt>
              <dd>{fechaYHora(documento.selladoEn)}</dd>
              <dt className="text-salvia-oscuro/80">Hecho por</dt>
              <dd>{documento.autorNombre}</dd>
            </dl>
          </section>
        )}
        {documento.estado === "anulado" && (
          <section className="rounded-card border border-linea bg-arena p-4 text-sm text-grafito">
            <h3 className="font-[family-name:var(--font-display)] text-lg font-medium">Anulado</h3>
            <p className="mt-1">{documento.motivoAnulacion}</p>
          </section>
        )}

        <section className="rounded-card border border-linea bg-marfil p-4">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Firmas</h3>
          <ul className="mt-2 flex flex-col divide-y divide-linea">
            {contenido.firmas.map((definicion) => {
              const firma = documento.firmas.find((f) => f.rol === definicion.rol);
              return (
                <li key={definicion.rol} className="flex flex-col gap-1.5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-grafito">{definicion.etiqueta}</p>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        firma ? "border-salvia/40 bg-salvia-claro text-salvia-oscuro" : "border-linea bg-hueso text-grafito/75"
                      }`}
                    >
                      {firma ? "Firmada" : definicion.requerida ? "Pendiente" : "Opcional"}
                    </span>
                  </div>
                  {firma ? (
                    <p className="text-xs text-grafito/75">
                      {firma.nombre} · {fechaYHora(firma.firmadoEn)} · en este dispositivo
                    </p>
                  ) : (
                    puedeFirmar && (
                      <button
                        type="button"
                        onClick={() => setFirmando(definicion)}
                        className="self-start rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95"
                      >
                        Firmar en este dispositivo
                      </button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
          {aFirmar && !documento.esMio && (
            <p className="mt-2 text-xs text-grafito/75">Las firmas las junta quien hizo el documento.</p>
          )}
          {aFirmar && documento.esMio && (
            <p className="mt-2 text-xs text-grafito/75">Con la última firma, el documento se sella y pasa a la historia clínica del paciente.</p>
          )}
        </section>

        {puedeVolverAEditar && (
          <button
            type="button"
            onClick={() => void volverAEditar()}
            disabled={volviendo}
            className="self-start rounded-full px-3 py-1.5 text-sm font-medium text-salvia-oscuro hover:bg-arena disabled:opacity-60"
          >
            {volviendo ? "Volviendo…" : "Volver a editar"}
          </button>
        )}
        {error && (
          <p role="alert" className="text-sm text-terracota-oscuro">
            {error}
          </p>
        )}
      </aside>

      <div className="flex min-w-0 flex-col gap-3">
        {plantilla && paginasDeLamina && contenido.lamina ? (
          <>
            <PantallaCompleta titulo={`${contenido.plantilla.nombre}: ${etiquetaDeLaHoja.toLowerCase()}`} className="self-end lg:hidden">
              <LaminaDocumento
                plantilla={plantilla}
                paginas={paginasDeLamina}
                zonas={contenido.lamina}
                firmas={documento.firmas}
                etiqueta={etiquetaDeLaHoja}
              />
            </PantallaCompleta>
            <LaminaDocumento
              plantilla={plantilla}
              paginas={paginasDeLamina}
              zonas={contenido.lamina}
              firmas={documento.firmas}
              etiqueta={etiquetaDeLaHoja}
            />
            <div className="rounded-card border border-linea bg-marfil p-4 text-xs text-grafito/75 shadow-soft">{pie}</div>
          </>
        ) : (
          <CalcoCongelado cuerpo={contenido.cuerpo} definiciones={contenido.firmas} firmas={documento.firmas} pie={pie} />
        )}
      </div>

      {firmando && (
        <FirmarDialogo
          documentoId={documento.id}
          definicion={firmando}
          paciente={contenido.paciente}
          profesionalNombre={profesionalNombre}
          onCerrar={() => setFirmando(null)}
        />
      )}
    </div>
  );
}
