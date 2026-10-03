"use client";

import { useState } from "react";
import type { DocumentoDetalle } from "@dental-mirage/shared-types";
import { plantillaPorId, type FirmaDePlantilla } from "@dental-mirage/documentos-clinicos";
import Link from "next/link";
import { registrarImpresionAction } from "@/app/actions/documentos";
import { contenidoCongelado, fechaYHora, huellaCorta, nombreConTipo } from "@/lib/documentos";
import { nombreDeArchivoDelPDF, rutaDelPDF, tienePDF } from "./acciones-de-pdf";
import { CalcoCongelado } from "./calco";
import { BotonDescargarPDF } from "./descargar-pdf";
import { FirmarDialogo } from "./firmar-dialogo";
import { ImpresionDelDocumento } from "./impresion-del-documento";
import { LaminaDocumento, paginasDeLaLamina } from "./lamina-documento";
import { PantallaCompleta } from "./pantalla-completa";

// VistaDeDocumento — un documento terminado (Fase 5.1): esperando firmas,
// sellado, anulado o —un consentimiento— listo para imprimir. Lo que se
// muestra es lo CONGELADO —lo que la API fijó al terminar—, nunca vuelto a
// armar con la plantilla: la página original con la composición congelada
// encima (la lámina, TR-187) y las firmas en su renglón; o, en una
// plantilla sin lámina, el calco con el texto congelado.
//
// Un consentimiento se firma a mano (TR-188): en vez de las firmas, la
// pantalla ofrece imprimirlo, y lo que sale por la impresora es la misma
// hoja, a su tamaño de papel (`ImpresionDelDocumento`).
//
// Un documento terminado tiene PDF (Fase 5.3), que la API genera en cada
// pedido: el consentimiento ofrece descargarlo junto a "Imprimir", y una
// historia sellada lo descarga o lo abre en una pestaña nueva para
// imprimirlo (su PDF lleva las firmas y la constancia). La excepción la
// dice la API (`tienePDF`): uno sellado en la 5.1, antes de que se
// congelara la composición de la lámina, se ve acá en su versión de texto,
// pero no tiene PDF — sería la página del Colegio en blanco.
//
// Terminado, un documento no se edita más (TR-188): no hay "volver a
// editar". Si hay que corregir algo, se hace otro.
//
// Lee los datos directo de las props: después de firmar, `router.refresh()`
// trae el documento nuevo y la pantalla lo muestra sin estado local que
// quede viejo (TR-156).
export function VistaDeDocumento({ documento }: { documento: DocumentoDetalle }) {
  const [firmando, setFirmando] = useState<FirmaDePlantilla | null>(null);
  const contenido = contenidoCongelado(documento.contenido);

  if (!contenido) {
    return <p className="text-sm text-terracota-oscuro">No se pudo leer el contenido de este documento.</p>;
  }

  const aFirmar = documento.estado === "a_firmar";
  const paraImprimir = documento.estado === "para_imprimir";
  const conPDF = tienePDF(documento);
  const puedeFirmar = aFirmar && documento.esMio;
  const profesionalNombre = `${contenido.profesional.nombre} ${contenido.profesional.apellido}`.trim();
  // La versión que se firmó, no la última: su lámina y su página.
  const plantilla = plantillaPorId(contenido.plantilla.id, contenido.plantilla.version);
  const paginasDeLamina = contenido.lamina ? paginasDeLaLamina(plantilla) : null;
  const etiquetaDeLaHoja =
    documento.estado === "sellado" ? "Documento sellado" : paraImprimir ? "Documento para imprimir" : "Documento para firmar";
  const conLamina =
    plantilla && paginasDeLamina && contenido.lamina
      ? { plantilla, paginas: paginasDeLamina, zonas: contenido.lamina, figuras: contenido.figuras }
      : null;

  function imprimir() {
    // Queda en la auditoría; si eso falla, la impresión sigue igual.
    void registrarImpresionAction(documento.id);
    window.print();
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

  const hojaCompleta = conLamina ? (
    <LaminaDocumento
      plantilla={conLamina.plantilla}
      paginas={conLamina.paginas}
      zonas={conLamina.zonas}
      figuras={conLamina.figuras}
      firmas={documento.firmas}
      etiqueta={etiquetaDeLaHoja}
    />
  ) : null;
  const tituloPantallaCompleta = `${contenido.plantilla.nombre}: ${etiquetaDeLaHoja.toLowerCase()}`;

  return (
    <div className="flex flex-col gap-4">
      {/* En la computadora, "Ver en pantalla completa" va por encima de las
          dos columnas: así la tarjeta de la izquierda arranca a la altura de
          la hoja (pedido del cliente, 2026-09-29). */}
      {hojaCompleta && (
        <div className="hidden justify-end lg:flex">
          <PantallaCompleta titulo={tituloPantallaCompleta}>{hojaCompleta}</PantallaCompleta>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <aside
          aria-label={paraImprimir ? "Impresión del documento" : "Firmas del documento"}
          className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[calc(var(--header-height)+1rem)]"
        >
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
          {documento.estado === "sellado" && !conPDF && (
            <section className="rounded-card border border-linea bg-marfil p-4 shadow-soft">
              <h3 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Sin PDF</h3>
              <p className="mt-1 text-sm text-grafito/80">
                Este documento se selló antes de que existiera la lámina: se ve en pantalla, pero no tiene PDF.
              </p>
            </section>
          )}
          {documento.estado === "sellado" && conPDF && (
            // El PDF (Fase 5.3): la lámina sellada más la hoja de constancia de
            // las firmas. "Imprimir" es un <a> y no un <Link>: es una ruta que
            // devuelve un archivo, no una pantalla. "Descargar PDF" baja el
            // archivo y lo guarda según el dispositivo (`BotonDescargarPDF`).
            <section className="rounded-card border border-linea bg-marfil p-4 shadow-soft">
              <h3 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">PDF del documento</h3>
              <p className="mt-1 text-sm text-grafito/80">
                El documento sellado, con la constancia de cómo, cuándo y desde dónde se hizo cada firma. Cada descarga e impresión queda registrada.
              </p>
              <BotonDescargarPDF
                id={documento.id}
                nombreDeArchivo={nombreDeArchivoDelPDF(documento)}
                titulo={nombreConTipo(documento)}
                className="mt-3 block w-full rounded-full bg-salvia-oscuro px-5 py-2.5 text-center text-sm font-semibold text-marfil hover:brightness-95"
              />
              <a
                href={rutaDelPDF(documento.id, true)}
                target="_blank"
                rel="noopener"
                aria-label="Imprimir (abre el PDF en una pestaña nueva)"
                className="mt-2 block w-full rounded-full border border-linea bg-hueso px-5 py-2.5 text-center text-sm font-semibold text-salvia-oscuro hover:bg-arena"
              >
                Imprimir
              </a>
              {documento.codigoVerificacion && (
                <p className="mt-3 text-xs text-grafito/75">
                  Código de verificación:{" "}
                  <span className="font-[family-name:var(--font-mono)] text-sm text-grafito">{documento.codigoVerificacion}</span>
                </p>
              )}
            </section>
          )}
          {documento.estado === "anulado" && (
            <section className="rounded-card border border-linea bg-arena p-4 text-sm text-grafito">
              <h3 className="font-[family-name:var(--font-display)] text-lg font-medium">Anulado</h3>
              <p className="mt-1">{documento.motivoAnulacion}</p>
            </section>
          )}

          {paraImprimir ? (
            <section className="rounded-card border border-linea bg-marfil p-4 shadow-soft">
              <h3 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Listo para imprimir o descargar</h3>
              <p className="mt-1 text-sm text-grafito/80">
                Este consentimiento se firma a mano. Imprimilo y que lo firmen el paciente —o quien lo represente— y el profesional: el papel firmado es el
                documento legal, y se guarda con la historia clínica del paciente.
              </p>
              <button
                type="button"
                onClick={imprimir}
                className="mt-3 w-full rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95"
              >
                Imprimir
              </button>
              {conPDF && (
                <BotonDescargarPDF
                  id={documento.id}
                  nombreDeArchivo={nombreDeArchivoDelPDF(documento)}
                  titulo={nombreConTipo(documento)}
                  className="mt-2 block w-full rounded-full border border-linea bg-hueso px-5 py-2.5 text-center text-sm font-semibold text-salvia-oscuro hover:bg-arena"
                />
              )}
              <p className="mt-3 text-xs text-grafito/75">
                {documento.esMio ? "Ya no se puede editar." : `Lo hizo ${documento.autorNombre}.`} Si hay que corregir algo,{" "}
                <Link
                  href={`/panel/documentos?paciente=${documento.paciente.id}&plantilla=${documento.plantillaId}`}
                  className="font-medium text-salvia-oscuro underline-offset-4 hover:underline"
                >
                  hacé uno nuevo
                </Link>
                .
              </p>
            </section>
          ) : (
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
          )}

        </aside>

        <div className="flex min-w-0 flex-col gap-3">
          {hojaCompleta ? (
            <>
              <PantallaCompleta titulo={tituloPantallaCompleta} className="self-end lg:hidden">
                {hojaCompleta}
              </PantallaCompleta>
              {hojaCompleta}
              <div className="rounded-card border border-linea bg-marfil p-4 text-xs text-grafito/75 shadow-soft">{pie}</div>
            </>
          ) : (
            <CalcoCongelado cuerpo={contenido.cuerpo} definiciones={contenido.firmas} firmas={documento.firmas} pie={pie} />
          )}
        </div>
      </div>

      {paraImprimir && (
        <ImpresionDelDocumento hoja={conLamina?.plantilla.lamina?.paginas[0]}>
          {conLamina ? (
            <LaminaDocumento
              plantilla={conLamina.plantilla}
              paginas={conLamina.paginas}
              zonas={conLamina.zonas}
              figuras={conLamina.figuras}
              etiqueta="Documento para imprimir"
              paraImprimir
            />
          ) : (
            <CalcoCongelado cuerpo={contenido.cuerpo} definiciones={contenido.firmas} firmas={[]} />
          )}
        </ImpresionDelDocumento>
      )}

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
