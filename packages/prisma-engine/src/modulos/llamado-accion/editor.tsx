import { CLASE_AYUDA, CLASE_CAMPO, CLASE_ETIQUETA, Contador } from "../../comunes";
import { textoDeConfig } from "../../lectura-config";
import { telefonoLegible } from "../../telefono";
import type { EditorModuloProps } from "../../tipos";
import { DESTINOS_LLAMADO } from "./schema";

const ETIQUETAS_DESTINO = {
  turno: "Pedir un turno",
  whatsapp: "Escribir por WhatsApp",
  telefono: "Llamar por teléfono",
} as const;

export function Editor({ modulo, telefono, onConfig }: EditorModuloProps) {
  const texto = textoDeConfig(modulo.config, "texto");
  const etiquetaBoton = textoDeConfig(modulo.config, "etiquetaBoton");
  const destino = DESTINOS_LLAMADO.includes(modulo.config.destino as (typeof DESTINOS_LLAMADO)[number])
    ? modulo.config.destino as (typeof DESTINOS_LLAMADO)[number]
    : "turno";

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className={CLASE_ETIQUETA}>Texto breve</span>
        <textarea
          rows={3}
          maxLength={500}
          value={texto}
          onChange={(e) => onConfig({ ...modulo.config, texto: e.target.value })}
          placeholder="Contanos qué necesitás y te orientamos."
          className={CLASE_CAMPO}
        />
        <Contador actual={texto.length} max={500} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={CLASE_ETIQUETA}>Texto del botón</span>
        <input
          type="text"
          maxLength={48}
          value={etiquetaBoton}
          onChange={(e) => onConfig({ ...modulo.config, etiquetaBoton: e.target.value })}
          placeholder={ETIQUETAS_DESTINO[destino]}
          className={CLASE_CAMPO}
        />
        <Contador actual={etiquetaBoton.length} max={48} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={CLASE_ETIQUETA}>Acción</span>
        <select value={destino} onChange={(e) => onConfig({ ...modulo.config, destino: e.target.value })} className={CLASE_CAMPO}>
          {DESTINOS_LLAMADO.map((opcion) => <option key={opcion} value={opcion}>{ETIQUETAS_DESTINO[opcion]}</option>)}
        </select>
      </label>
      <p className={CLASE_AYUDA}>
        {destino === "turno" && "El botón lleva a la sección para pedir turno."}
        {destino === "whatsapp" && `El botón abre WhatsApp${telefono ? ` al ${telefonoLegible(telefono)}` : "; cargá un teléfono de clínica para habilitarlo"}.`}
        {destino === "telefono" && `El botón inicia una llamada${telefono ? ` al ${telefonoLegible(telefono)}` : "; cargá un teléfono de clínica para habilitarlo"}.`}
      </p>
    </div>
  );
}
