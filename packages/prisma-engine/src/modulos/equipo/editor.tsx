import { CLASE_AYUDA, CLASE_CAMPO, CLASE_ETIQUETA } from "../../comunes";
import { listaDeConfig } from "../../lectura-config";
import type { EditorModuloProps, EquipoElegible } from "../../tipos";

function estaActivo(config: Record<string, unknown>, campo: string, valorInicial: boolean): boolean {
  return typeof config[campo] === "boolean" ? (config[campo] as boolean) : valorInicial;
}

function sinFoto(profesional: EquipoElegible): boolean {
  return !profesional.fotoUrl?.trim();
}

function mover(ids: string[], indice: number, delta: -1 | 1): string[] {
  const destino = indice + delta;
  if (destino < 0 || destino >= ids.length) return ids;
  const copia = ids.slice();
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return copia;
}

export function Editor({ modulo, equipoElegible = [], onConfig }: EditorModuloProps) {
  const { config } = modulo;
  const modo = config.modo === "seleccion" ? "seleccion" : "todos";
  const userIds = listaDeConfig(config, "userIds");
  const idsDisponibles = new Set(equipoElegible.map((p) => p.userId));
  const idsDesconocidos = userIds.filter((id) => !idsDisponibles.has(id));
  const seleccionados = equipoElegible.filter((p) => userIds.includes(p.userId));
  const sinFotoEnModo = (modo === "todos" ? equipoElegible.filter((p) => p.aval) : seleccionados.filter((p) => p.aval)).filter(sinFoto);

  function actualizarSeleccion(ids: string[]) {
    onConfig({ ...config, userIds: ids });
  }

  function elegir(profesional: EquipoElegible, marcado: boolean) {
    if (!profesional.aval) return;
    actualizarSeleccion(marcado ? [...userIds, profesional.userId] : userIds.filter((id) => id !== profesional.userId));
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className={CLASE_ETIQUETA}>Quiénes aparecen</span>
        <select
          className={CLASE_CAMPO}
          value={modo}
          onChange={(event) => onConfig({ ...config, modo: event.target.value, userIds })}
        >
          <option value="todos">Todos los que dieron su aval</option>
          <option value="seleccion">Elegir profesionales</option>
        </select>
        <span className={CLASE_AYUDA}>Quien retire su aval o deje el equipo desaparece de la página automáticamente.</span>
      </label>

      {modo === "seleccion" && (
        <fieldset className="flex flex-col gap-2">
          <legend className={CLASE_ETIQUETA}>Profesionales</legend>
          {equipoElegible.length === 0 ? (
            <p className={CLASE_AYUDA}>No hay profesionales activos en el equipo de esta clínica.</p>
          ) : (
            equipoElegible.map((profesional) => {
              const marcado = userIds.includes(profesional.userId);
              return (
                <label key={profesional.userId} className="flex items-start gap-2 text-sm text-grafito">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={marcado}
                    disabled={!profesional.aval}
                    onChange={(event) => elegir(profesional, event.target.checked)}
                  />
                  <span className="min-w-0 flex-1">
                    {profesional.nombre}
                    {!profesional.aval && <span className={`${CLASE_AYUDA} block`}>Falta su aval; no aparecerá en la página.</span>}
                    {marcado && profesional.aval && sinFoto(profesional) && (
                      <span className={`${CLASE_AYUDA} block`}>No tiene foto: se mostrará un ícono por defecto.</span>
                    )}
                  </span>
                  {marcado && !profesional.aval && (
                    <button type="button" className="text-xs underline" onClick={() => elegir(profesional, false)}>
                      Quitar
                    </button>
                  )}
                </label>
              );
            })
          )}
          {idsDesconocidos.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-field border border-linea bg-marfil p-3">
              <p className={CLASE_AYUDA}>Hay selecciones que ya no están disponibles en el equipo.</p>
              <button type="button" className="shrink-0 text-xs underline" onClick={() => actualizarSeleccion(userIds.filter((id) => idsDisponibles.has(id)))}>
                Quitarlas
              </button>
            </div>
          )}
          {userIds.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className={CLASE_ETIQUETA}>Orden de aparición</span>
              <ol className="flex flex-col gap-2">
                {userIds.map((id, indice) => {
                  const profesional = equipoElegible.find((p) => p.userId === id);
                  return (
                    <li key={`${id}-${indice}`} className="flex items-center gap-2 rounded-field border border-linea bg-marfil px-3 py-2">
                      <span className="min-w-0 flex-1 text-sm text-grafito">{profesional?.nombre ?? "Profesional no disponible"}</span>
                      <button type="button" className="px-1 text-xs underline disabled:opacity-40" aria-label={`Mover ${profesional?.nombre ?? "profesional"} hacia arriba`} disabled={indice === 0} onClick={() => actualizarSeleccion(mover(userIds, indice, -1))}>Subir</button>
                      <button type="button" className="px-1 text-xs underline disabled:opacity-40" aria-label={`Mover ${profesional?.nombre ?? "profesional"} hacia abajo`} disabled={indice === userIds.length - 1} onClick={() => actualizarSeleccion(mover(userIds, indice, 1))}>Bajar</button>
                      <button type="button" className="px-1 text-xs underline" aria-label={`Quitar ${profesional?.nombre ?? "profesional"}`} onClick={() => actualizarSeleccion(userIds.filter((actual) => actual !== id))}>Quitar</button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          <span className={CLASE_AYUDA}>Podés cambiar el orden con Subir y Bajar.</span>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className={CLASE_ETIQUETA}>Datos visibles</legend>
        <label className="flex items-center gap-2 text-sm text-grafito">
          <input
            type="checkbox"
            checked={estaActivo(config, "mostrarNombre", true)}
            onChange={(event) => onConfig({ ...config, mostrarNombre: event.target.checked })}
          />
          Mostrar nombres
        </label>
        <label className="flex items-center gap-2 text-sm text-grafito">
          <input
            type="checkbox"
            checked={estaActivo(config, "mostrarDescripcion", true)}
            onChange={(event) => onConfig({ ...config, mostrarDescripcion: event.target.checked })}
          />
          Mostrar descripciones
        </label>
      </fieldset>

      {sinFotoEnModo.length > 0 && modo === "todos" && (
        <p className={CLASE_AYUDA}>
          Sin foto: {sinFotoEnModo.map((p) => p.nombre).join(", ")}. Se mostrarán con un ícono por defecto.
        </p>
      )}
      <p className={CLASE_AYUDA}>La matrícula nunca se muestra en la página pública.</p>
    </div>
  );
}
