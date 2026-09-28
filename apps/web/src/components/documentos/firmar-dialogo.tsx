"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TrazoDeFirma } from "@dental-mirage/shared-types";
import type { FirmaDePlantilla } from "@dental-mirage/documentos-clinicos";
import { firmarDocumentoAction } from "@/app/actions/documentos";
import { Dialogo } from "@/components/dialogo";
import { LienzoDeFirma } from "./lienzo-de-firma";

const CLASE_CAMPO = "w-full rounded-field border border-linea bg-hueso px-3 py-2 text-[15px] text-grafito outline-none focus:border-salvia";

// FirmarDialogo — una firma en este dispositivo, en persona (Fase 5.1,
// TR-184): la identidad la constata el profesional, que está presente.
//
// El profesional firma como sí mismo (nombre y documento salen de su
// perfil, la API ignora lo que mande la pantalla). Para cualquier otro rol
// se piden nombre y DNI de quien firma; en el del paciente, además, si
// firma un representante y con qué vínculo.
export function FirmarDialogo({
  documentoId,
  definicion,
  paciente,
  profesionalNombre,
  onCerrar,
}: {
  documentoId: string;
  definicion: FirmaDePlantilla;
  /** Para precargar la firma del paciente. */
  paciente: { nombre: string; apellido: string; dni: string };
  profesionalNombre: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const esProfesional = definicion.rol === "profesional";
  const admiteRepresentante = definicion.rol === "paciente";
  const [enRepresentacion, setEnRepresentacion] = useState(false);
  const [nombre, setNombre] = useState(definicion.rol === "paciente" ? `${paciente.nombre} ${paciente.apellido}` : "");
  const [dni, setDni] = useState(definicion.rol === "paciente" ? paciente.dni : "");
  const [vinculo, setVinculo] = useState("");
  const [trazo, setTrazo] = useState<TrazoDeFirma | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cambiarARepresentante(si: boolean) {
    setEnRepresentacion(si);
    // Quien firma en nombre del paciente es otra persona: sus datos no son
    // los de la ficha.
    setNombre(si ? "" : `${paciente.nombre} ${paciente.apellido}`);
    setDni(si ? "" : paciente.dni);
  }

  const faltaAlgo =
    !trazo || (!esProfesional && (nombre.trim().length < 3 || !/^\d{7,8}$/.test(dni.trim()))) || (enRepresentacion && vinculo.trim() === "");

  async function firmar() {
    if (!trazo) return;
    setEnviando(true);
    setError(null);
    const res = await firmarDocumentoAction(documentoId, {
      rol: definicion.rol,
      trazo,
      ...(esProfesional ? {} : { nombre: nombre.trim(), dni: dni.trim() }),
      ...(enRepresentacion ? { enRepresentacion: true, vinculo: vinculo.trim() } : {}),
    });
    setEnviando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCerrar();
    router.refresh();
  }

  return (
    <Dialogo
      titulo={definicion.etiqueta}
      descripcion={
        esProfesional
          ? `Firmás como ${profesionalNombre}. La firma queda atada al texto exacto de este documento.`
          : "Antes de firmar, quien firma tiene que haber leído el documento completo."
      }
      onCerrar={onCerrar}
      ancho="medio"
    >
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {admiteRepresentante && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-grafito">¿Quién firma?</legend>
            <div className="flex flex-wrap gap-2">
              {[
                { si: false, texto: "El paciente" },
                { si: true, texto: "Un representante" },
              ].map((o) => (
                <label
                  key={o.texto}
                  className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                    enRepresentacion === o.si ? "border-salvia-oscuro bg-salvia-oscuro text-marfil" : "border-linea bg-hueso text-grafito"
                  }`}
                >
                  <input type="radio" name="quien-firma" className="sr-only" checked={enRepresentacion === o.si} onChange={() => cambiarARepresentante(o.si)} />
                  {o.texto}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {!esProfesional && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-grafito">
              Nombre y apellido de quien firma
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} className={CLASE_CAMPO} autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-grafito">
              DNI
              <input
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={8}
                placeholder="Sin puntos"
                className={CLASE_CAMPO}
                autoComplete="off"
              />
            </label>
            {enRepresentacion && (
              <label className="flex flex-col gap-1 text-sm font-medium text-grafito sm:col-span-2">
                Vínculo con el paciente
                <input
                  value={vinculo}
                  onChange={(e) => setVinculo(e.target.value)}
                  maxLength={60}
                  placeholder="Madre, padre, tutor, curador…"
                  className={CLASE_CAMPO}
                />
              </label>
            )}
          </div>
        )}

        <LienzoDeFirma etiqueta={`Lienzo para ${definicion.etiqueta.toLowerCase()}`} onCambio={setTrazo} />

        {error && (
          <p role="alert" className="text-sm text-terracota-oscuro">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-full px-4 py-2 text-sm font-medium text-grafito hover:bg-arena">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void firmar()}
            disabled={faltaAlgo || enviando}
            className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
          >
            {enviando ? "Firmando…" : "Firmar"}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
