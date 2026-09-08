"use client";

/**
 * Campo de teléfono con selector de país (docs/Fase 2/turnero_pagina/rediseno-flujo-turnos.md
 * §5, [3a]) — un solo control visual: contenedor con el estilo de campo
 * de 3.3, y adentro `<select>` de país + separador + `<input>`. El foco
 * en cualquiera de las dos partes ilumina el contenedor entero
 * (`focus-within`), para que se lea como un campo único.
 */

export interface PaisTelefono {
  iso: string;
  prefijo: string;
  /** Formato local de ejemplo — reemplaza el placeholder del input al elegir este país. */
  ejemplo: string;
}

// PAISES_TELEFONO — orden y set tal cual el doc (§5, [3a]): código ISO y
// prefijo juntos en cada opción ("solo el número o solo la bandera obliga
// a pensar", textual del doc).
export const PAISES_TELEFONO: PaisTelefono[] = [
  { iso: "AR", prefijo: "+54", ejemplo: "9 11 1234-5678" },
  { iso: "UY", prefijo: "+598", ejemplo: "99 123 456" },
  { iso: "CL", prefijo: "+56", ejemplo: "9 1234 5678" },
  { iso: "PY", prefijo: "+595", ejemplo: "981 123456" },
  { iso: "BO", prefijo: "+591", ejemplo: "71234567" },
  { iso: "BR", prefijo: "+55", ejemplo: "11 91234-5678" },
  { iso: "ES", prefijo: "+34", ejemplo: "612 34 56 78" },
  { iso: "US", prefijo: "+1", ejemplo: "201 555 0123" },
];

export const PAIS_TELEFONO_DEFAULT = "AR";

// telefonoConPais — compone el valor que de verdad viaja al backend
// (mismo campo `telefonoContacto`/`tutorTelefono` de siempre, validado
// contra TELEFONO_REGEX en pedir-turno-form.tsx): prefijo del país +
// solo dígitos de lo tipeado, con un "+" adelante. El campo compuesto
// (3.3) solo captura la parte local — el prefijo nunca se mezcla con lo
// que el usuario tipea.
export function telefonoConPais(pais: string, numeroLocal: string): string {
  const prefijo = PAISES_TELEFONO.find((p) => p.iso === pais)?.prefijo ?? PAISES_TELEFONO[0].prefijo;
  const digitos = numeroLocal.replace(/\D/g, "");
  return digitos ? `${prefijo}${digitos}` : "";
}

interface CampoTelefonoConPaisProps {
  id: string;
  label: string;
  hint?: string;
  pais: string;
  onPaisChange: (iso: string) => void;
  valor: string;
  onValorChange: (v: string) => void;
  required?: boolean;
}

export function CampoTelefonoConPais({ id, label, hint, pais, onPaisChange, valor, onValorChange, required }: CampoTelefonoConPaisProps) {
  const paisActual = PAISES_TELEFONO.find((p) => p.iso === pais) ?? PAISES_TELEFONO[0];

  const labelId = `${id}-label`;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Un solo label visible para 2 controles (país + número) — el
          input principal se asocia por aria-labelledby (no htmlFor,
          porque un <label> normal solo puede apuntar a un control) para
          que "Teléfono" siga siendo su nombre accesible (§6: "Cada input
          con su <label for>"); el select de país lleva su propio
          aria-label ("País") por separado, como pide el doc para
          controles sin label visible propio. */}
      <span id={labelId} className="text-[13px] text-grafito/70">
        {label}
      </span>
      <div className="flex h-11 items-center rounded-field border-[1.5px] border-transparent bg-hueso pl-2.5 pr-3 focus-within:border-salvia-oscuro focus-within:bg-marfil">
        <select
          aria-label="País"
          value={pais}
          onChange={(e) => {
            onPaisChange(e.target.value);
            // Cambiar de país limpia el valor — el formato local de un
            // país no tiene por qué ser válido en otro (doc, §5 [3a]).
            onValorChange("");
          }}
          className="appearance-none bg-transparent py-2 pr-1 text-[15px] text-grafito outline-none"
        >
          {PAISES_TELEFONO.map((p) => (
            <option key={p.iso} value={p.iso}>
              {p.iso} {p.prefijo}
            </option>
          ))}
        </select>
        <span className="mx-2 h-[22px] w-px shrink-0 bg-arena" aria-hidden="true" />
        <input
          id={id}
          aria-labelledby={labelId}
          type="tel"
          inputMode="tel"
          required={required}
          value={valor}
          onChange={(e) => onValorChange(e.target.value)}
          placeholder={paisActual.ejemplo}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-grafito outline-none placeholder:text-grafito/50"
        />
      </div>
      {hint && <p className="text-xs text-grafito/50">{hint}</p>}
    </div>
  );
}
