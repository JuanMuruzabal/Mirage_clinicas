"use client";

import {
  MAX_LARGO_TITULO_PUBLICO,
  CATALOGO_EFECTOS,
  definicionDeModulo,
  textoDeConfig,
  varianteDeConfig,
  type FondoSeccion,
  type ModuloBorrador,
} from "@dental-mirage/prisma-engine";
import { SelectorDeVariante } from "./selector-de-variante";
import { SubirFoto } from "./subir-foto";
import { CLASE_AYUDA, CLASE_CAMPO, CLASE_ETIQUETA, CLASE_PASTILLA, CLASE_TACTIL, claseDeEleccion } from "./estilos";
import { GrupoDeOpciones } from "./grupo-de-opciones";

interface OpcionesDeModuloProps {
  modulo: ModuloBorrador;
  onConfig: (config: Record<string, unknown>) => void;
}

const FONDOS: { id: FondoSeccion; nombre: string }[] = [
  { id: "normal", nombre: "Normal" },
  { id: "acento", nombre: "Color suave" },
  { id: "contraste", nombre: "Contraste" },
];


/** Escribe una clave de la config; un valor vacío (o el default) la saca, así la config no acumula claves sin efecto. */
function conClave(config: Record<string, unknown>, clave: string, valor: string, porDefecto = ""): Record<string, unknown> {
  const resto = { ...config };
  delete resto[clave];
  return valor === porDefecto ? resto : { ...resto, [clave]: valor };
}

// OpcionesDeModulo (PE-3) — lo que TODO módulo puede tener además de su
// contenido: variante de layout, título público, fondo de sección y
// alineación. Qué se ofrece lo decide el meta.ts de cada módulo; este
// componente no conoce módulos por nombre.
export function OpcionesDeModulo({ modulo, onConfig }: OpcionesDeModuloProps) {
  const definicion = definicionDeModulo(modulo.tipo);
  if (!definicion) return null;
  const { variantes, opcionesDeSeccion: opciones } = definicion;
  if (variantes.length < 2 && !opciones.titulo && !opciones.fondo && !opciones.alineacion && definicion.slotsAnimables.length === 0) return null;

  const ids = variantes.map((v) => v.id);
  const variante = ids.length > 0 ? varianteDeConfig(modulo.config, ids) : "";
  const fondo = (textoDeConfig(modulo.config, "fondoSeccion") || "normal") as FondoSeccion;
  const izquierda = textoDeConfig(modulo.config, "alineacion") === "izquierda";
  const hayMasOpciones = opciones.fondo || opciones.alineacion || definicion.slotsAnimables.length > 0;
  const efectos = modulo.config.efectos && typeof modulo.config.efectos === "object" ? modulo.config.efectos as Record<string, unknown> : {};

  function elegirEfecto(slot: string, id: string) {
    const siguiente = { ...efectos };
    if (!id) delete siguiente[slot];
    else siguiente[slot] = { id, intensidad: "sutil" };
    const config = { ...modulo.config };
    if (Object.keys(siguiente).length) config.efectos = siguiente;
    else delete config.efectos;
    onConfig(config);
  }

  function elegirIntensidad(slot: string, intensidad: string) {
    const actual = efectos[slot] && typeof efectos[slot] === "object" ? efectos[slot] as Record<string, unknown> : {};
    onConfig({ ...modulo.config, efectos: { ...efectos, [slot]: { ...actual, intensidad } } });
  }

  return (
    <div className="flex flex-col gap-4 border-t-[0.5px] border-arena pt-3">
      {variantes.length > 1 && (
        <SelectorDeVariante
          etiqueta="Diseño de la sección"
          variantes={variantes}
          elegida={variante}
          // La primera variante es el default: elegirla saca la clave.
          onElegir={(id) => onConfig(conClave(modulo.config, "variante", id, ids[0]))}
        />
      )}

      {variante === "con-foto" && (
        <SubirFoto
          etiqueta="foto de la sección"
          url={textoDeConfig(modulo.config, "fotoUrl")}
          onSubida={(url) => onConfig({ ...modulo.config, fotoUrl: url })}
          onQuitar={() => onConfig(conClave(modulo.config, "fotoUrl", ""))}
        />
      )}

      {opciones.titulo && (
        <label className="flex flex-col gap-1.5">
          <span className={CLASE_ETIQUETA}>Título en la página</span>
          <input
            type="text"
            maxLength={MAX_LARGO_TITULO_PUBLICO}
            // Crudo, no recortado (mismo motivo que "Nombre en la lista").
            value={textoDeConfig(modulo.config, "tituloPublico")}
            onChange={(e) => onConfig(conClave(modulo.config, "tituloPublico", e.target.value))}
            placeholder={definicion.nombre}
            className={CLASE_CAMPO}
          />
          <span className={CLASE_AYUDA}>Lo ven los visitantes, y es el texto del link en el menú.</span>
        </label>
      )}

      {hayMasOpciones && (
        // Más opciones (PP-6, H18): fondo, alineación y efectos por elemento son
        // afinación, no lo que se busca al abrir un módulo — cerradas por
        // defecto, a la vista quedan el contenido y el diseño de la sección.
        // Un <details> nativo: se abre con teclado y el lector anuncia el estado.
        <details className="group flex flex-col border-t-[0.5px] border-arena pt-3">
          <summary className={`flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-grafito hover:text-salvia-oscuro ${CLASE_TACTIL}`}>
            <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">›</span>
            Más opciones
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            {opciones.fondo && (
              <GrupoDeOpciones
                etiqueta="Fondo de la sección"
                valor={fondo}
                onCambio={(id) => onConfig(conClave(modulo.config, "fondoSeccion", id, "normal"))}
                opciones={FONDOS.map((f) => ({ valor: f.id, contenido: f.nombre }))}
                className="flex flex-wrap gap-2"
                claseOpcion={(elegida) => `${CLASE_PASTILLA} ${claseDeEleccion(elegida)}`}
              />
            )}

            {opciones.alineacion && (
              <label className="flex items-center gap-2 text-sm text-grafito">
                <input
                  type="checkbox"
                  checked={izquierda}
                  onChange={(e) => onConfig(conClave(modulo.config, "alineacion", e.target.checked ? "izquierda" : ""))}
                />
                Alinear el texto a la izquierda
              </label>
            )}

            {definicion.slotsAnimables.length > 0 && (
              <fieldset className="flex flex-col gap-3">
                <legend className={CLASE_ETIQUETA}>Efectos por elemento</legend>
                {definicion.slotsAnimables.map((slot) => {
                  const actual = efectos[slot.id] && typeof efectos[slot.id] === "object" ? efectos[slot.id] as Record<string, unknown> : {};
                  const elegido = typeof actual.id === "string" ? actual.id : "";
                  const intensidad = actual.intensidad === "media" || actual.intensidad === "marcada" ? actual.intensidad : "sutil";
                  const disponibles = slot.efectos.map((id) => CATALOGO_EFECTOS.find((efecto) => efecto.id === id)).filter((efecto) => efecto?.habilitado);
                  return (
                    <div key={slot.id} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className={CLASE_AYUDA}>{slot.etiqueta}</span>
                        <select aria-label={`Efecto para ${slot.etiqueta}`} value={elegido} onChange={(e) => elegirEfecto(slot.id, e.target.value)} className={CLASE_CAMPO}>
                          <option value="">Automático</option>
                          <option value="ninguno">Sin efecto</option>
                          {disponibles.map((efecto) => <option key={efecto!.id} value={efecto!.id}>{efecto!.nombre}</option>)}
                        </select>
                      </label>
                      {elegido && elegido !== "ninguno" && (
                        <label className="flex flex-col gap-1">
                          <span className={CLASE_AYUDA}>Intensidad</span>
                          <select aria-label={`Intensidad para ${slot.etiqueta}`} value={intensidad} onChange={(e) => elegirIntensidad(slot.id, e.target.value)} className={CLASE_CAMPO}>
                            <option value="sutil">Sutil</option><option value="media">Media</option><option value="marcada">Marcada</option>
                          </select>
                        </label>
                      )}
                    </div>
                  );
                })}
                <span className={CLASE_AYUDA}>Automático sigue el estilo global. Los efectos respetan el movimiento reducido del dispositivo.</span>
              </fieldset>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
