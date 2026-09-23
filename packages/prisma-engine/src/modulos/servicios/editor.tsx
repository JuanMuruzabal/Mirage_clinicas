import { CLASE_AYUDA, CLASE_ETIQUETA } from "../../comunes";
import { listaDeConfig } from "../../lectura-config";
import type { EditorModuloProps, ServicioVista } from "../../tipos";
import { claveServicio } from "./clave";

function duracion(servicio: ServicioVista): string {
  return servicio.duracionMinima === servicio.duracionMaxima
    ? `${servicio.duracionMinima} min`
    : `${servicio.duracionMinima}–${servicio.duracionMaxima} min según el profesional`;
}

function mover(nombres: string[], indice: number, delta: -1 | 1): string[] {
  const destino = indice + delta;
  if (destino < 0 || destino >= nombres.length) return nombres;
  const copia = nombres.slice();
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return copia;
}

export function Editor({ modulo, serviciosDisponibles = [], onConfig }: EditorModuloProps) {
  const { config } = modulo;
  const nombres = listaDeConfig(config, "nombres");
  const servicios = new Map(serviciosDisponibles.map((servicio) => [claveServicio(servicio.nombre), servicio]));
  const faltantes = nombres.filter((nombre) => !servicios.has(claveServicio(nombre)));

  function actualizar(nuevosNombres: string[]) {
    onConfig({ ...config, nombres: nuevosNombres });
  }

  function elegir(nombre: string, marcado: boolean) {
    const elegidos = nombres.filter((actual) => claveServicio(actual) !== claveServicio(nombre));
    actualizar(marcado ? [...elegidos, nombre] : elegidos);
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className={CLASE_ETIQUETA}>Servicios disponibles</legend>
        {serviciosDisponibles.length === 0 ? (
          <p className={CLASE_AYUDA}>Todavía no hay servicios activos para ofrecer.</p>
        ) : (
          serviciosDisponibles.map((servicio) => {
            const seleccionado = nombres.some((nombre) => claveServicio(nombre) === claveServicio(servicio.nombre));
            return (
              <label key={claveServicio(servicio.nombre)} className="flex items-start gap-2 text-sm text-grafito">
                <input type="checkbox" className="mt-1" checked={seleccionado} onChange={(event) => elegir(servicio.nombre, event.target.checked)} />
                <span>
                  {servicio.nombre}
                  <span className={`${CLASE_AYUDA} block`}>{duracion(servicio)}</span>
                </span>
              </label>
            );
          })
        )}
        <span className={CLASE_AYUDA}>El mismo servicio puede tener duraciones distintas según el profesional.</span>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={CLASE_ETIQUETA}>Orden de aparición</legend>
        {nombres.length === 0 && <p className={CLASE_AYUDA}>Seleccioná uno o más servicios para ordenarlos.</p>}
        <ol className="flex flex-col gap-2">
          {nombres.map((nombre, indice) => {
            const servicio = servicios.get(claveServicio(nombre));
            return (
              <li key={`${claveServicio(nombre)}-${indice}`} className="flex items-center gap-2 rounded-field border border-linea bg-marfil px-3 py-2">
                <span className="min-w-0 flex-1 text-sm text-grafito">
                  {servicio?.nombre ?? nombre}
                  {!servicio && <span className={`${CLASE_AYUDA} block`}>Ya no está disponible; quitá esta selección.</span>}
                </span>
                <button type="button" className="px-1 text-xs underline disabled:opacity-40" aria-label={`Mover ${nombre} hacia arriba`} disabled={indice === 0} onClick={() => actualizar(mover(nombres, indice, -1))}>Subir</button>
                <button type="button" className="px-1 text-xs underline disabled:opacity-40" aria-label={`Mover ${nombre} hacia abajo`} disabled={indice === nombres.length - 1} onClick={() => actualizar(mover(nombres, indice, 1))}>Bajar</button>
                <button type="button" className="px-1 text-xs underline" aria-label={`Quitar ${nombre}`} onClick={() => elegir(nombre, false)}>Quitar</button>
              </li>
            );
          })}
        </ol>
        {faltantes.length > 0 && <p className={CLASE_AYUDA}>Hay selecciones que ya no están activas. Quitalas para actualizar la lista.</p>}
      </fieldset>
    </div>
  );
}
