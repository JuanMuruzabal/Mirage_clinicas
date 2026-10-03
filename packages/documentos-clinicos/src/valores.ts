// Lo que carga el profesional en un documento, y cómo se valida.
//
// Dos modos, los mismos que usa la API (internal/documentos):
//   - "tolerante": al guardar un borrador. Rechaza lo que está MAL (un
//     campo que no existe, una fecha imposible, una pieza que no es FDI)
//     pero deja vacíos los obligatorios: un borrador está a medio hacer.
//   - "estricto": al terminar. Además exige los obligatorios y el detalle
//     de un SI/NO que lo pide.
//
// La API es la que manda; esta copia existe para que la pantalla marque el
// error en el campo antes de mandar nada.
import { camposDe, type Campo, type Plantilla } from "./esquema";
import { errorDeOdontograma, odontogramaVacio, textoDeOdontograma, type ValorOdontograma } from "./odontograma";
import { esPiezaValida, piezasDe } from "./piezas";

export interface RespuestaSiNo {
  respuesta: "si" | "no";
  detalle?: string;
}
export type Valor = string | number | string[] | RespuestaSiNo | ValorOdontograma;
export type Valores = Record<string, Valor>;

export type ModoDeValidacion = "tolerante" | "estricto";

export interface ErrorDeCampo {
  campo: string;
  mensaje: string;
}

export const LARGO_TEXTO = 500;
export const LARGO_TEXTO_LARGO = 5000;
export const LARGO_DETALLE = 1000;

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** ¿Es una fecha real del calendario, entre 1900 y 2100? */
export function esFechaValida(v: string): boolean {
  const m = FECHA.exec(v);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (anio < 1900 || anio > 2100 || mes < 1 || mes > 12 || dia < 1) return false;
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return dia <= diasDelMes;
}

export function estaVacio(campo: Campo, valor: unknown): boolean {
  if (valor === undefined || valor === null) return true;
  // Antes que el texto y la lista: un "" o un [] no es un odontograma vacío.
  if (campo.tipo === "odontograma") return odontogramaVacio(campo, valor);
  if (typeof valor === "string") return valor.trim() === "";
  if (Array.isArray(valor)) return valor.length === 0;
  // Un SI/NO sin respuesta está vacío; con una respuesta que no es "si" ni
  // "no" NO está vacío: está mal, y lo tiene que decir la validación en vez
  // de pasar callado como un campo sin completar.
  if (campo.tipo === "si_no" && esObjeto(valor)) {
    return valor.respuesta === undefined || valor.respuesta === null || valor.respuesta === "";
  }
  return false;
}

function errorDeTipo(campo: Campo, valor: unknown): string | null {
  switch (campo.tipo) {
    case "texto":
    case "texto_largo": {
      if (typeof valor !== "string") return "Tiene que ser un texto.";
      const maximo = campo.tipo === "texto" ? LARGO_TEXTO : LARGO_TEXTO_LARGO;
      if (valor.trim().length > maximo) return `Puede tener hasta ${maximo} caracteres.`;
      return null;
    }
    case "fecha":
      return typeof valor === "string" && esFechaValida(valor) ? null : "No es una fecha válida.";
    case "hora":
      return typeof valor === "string" && HORA.test(valor) ? null : "No es una hora válida.";
    case "numero": {
      if (typeof valor !== "number" || !Number.isFinite(valor)) return "Tiene que ser un número.";
      if (campo.min !== undefined && valor < campo.min) return `Tiene que ser ${campo.min} o más.`;
      if (campo.max !== undefined && valor > campo.max) return `Tiene que ser ${campo.max} o menos.`;
      const decimales = campo.decimales ?? 0;
      const escala = 10 ** decimales;
      if (Math.abs(Math.round(valor * escala) - valor * escala) > 1e-9) {
        return decimales === 0 ? "Tiene que ser un número entero." : `Puede tener hasta ${decimales} decimales.`;
      }
      return null;
    }
    case "si_no": {
      if (!esObjeto(valor) || (valor.respuesta !== "si" && valor.respuesta !== "no")) return "Elegí Sí o No.";
      const extra = Object.keys(valor).filter((k) => k !== "respuesta" && k !== "detalle");
      if (extra.length > 0) return "Tiene datos que no corresponden.";
      if (valor.detalle !== undefined) {
        if (typeof valor.detalle !== "string") return "El detalle tiene que ser un texto.";
        if (valor.detalle.trim().length > LARGO_DETALLE) return `El detalle puede tener hasta ${LARGO_DETALLE} caracteres.`;
      }
      return null;
    }
    case "opcion_unica":
      return typeof valor === "string" && campo.opciones.some((o) => o.valor === valor) ? null : "Elegí una de las opciones.";
    case "opcion_multiple": {
      if (!Array.isArray(valor) || valor.some((v) => typeof v !== "string")) return "Elegí entre las opciones.";
      if (new Set(valor).size !== valor.length) return "Hay una opción repetida.";
      return valor.every((v) => campo.opciones.some((o) => o.valor === v)) ? null : "Hay una opción que no existe.";
    }
    case "piezas": {
      if (!Array.isArray(valor) || valor.some((v) => typeof v !== "string")) return "Elegí las piezas.";
      if (new Set(valor).size !== valor.length) return "Hay una pieza repetida.";
      const denticion = campo.denticion ?? "ambas";
      const invalida = valor.find((p) => !esPiezaValida(p as string, denticion));
      return invalida === undefined ? null : `${invalida} no es una pieza dentaria válida.`;
    }
    case "odontograma":
      return errorDeOdontograma(campo, valor);
  }
}

/** Valida los valores de un documento contra su plantilla. Devuelve la
 *  lista de errores; vacía = válido. */
export function validarValores(plantilla: Plantilla, valores: unknown, modo: ModoDeValidacion): ErrorDeCampo[] {
  if (!esObjeto(valores)) return [{ campo: "", mensaje: "Los datos del documento no tienen la forma esperada." }];
  const campos = new Map(camposDe(plantilla).map((c) => [c.id, c]));
  const errores: ErrorDeCampo[] = [];

  for (const clave of Object.keys(valores)) {
    if (!campos.has(clave)) errores.push({ campo: clave, mensaje: "Este campo no es de este documento." });
  }

  for (const campo of campos.values()) {
    const valor = valores[campo.id];
    if (estaVacio(campo, valor)) {
      if (modo === "estricto" && campo.requerido) errores.push({ campo: campo.id, mensaje: "Este dato es obligatorio." });
      continue;
    }
    const error = errorDeTipo(campo, valor);
    if (error) {
      errores.push({ campo: campo.id, mensaje: error });
      continue;
    }
    if (modo === "estricto" && campo.tipo === "si_no" && campo.detalle) {
      const r = valor as RespuestaSiNo;
      if (r.respuesta === campo.detalle.cuando && (r.detalle ?? "").trim() === "") {
        errores.push({ campo: campo.id, mensaje: `Completá: ${campo.detalle.etiqueta}.` });
      }
    }
  }
  return errores;
}

function numeroComoTexto(valor: number, decimales?: number): string {
  const crudo = decimales === undefined ? String(valor) : valor.toFixed(decimales);
  return crudo.replace(".", ",");
}

function fechaComoTexto(iso: string): string {
  const m = FECHA.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Cómo se lee un valor dentro del documento ("36, 37", "27/09/2026",
 *  "Sí (penicilina)"). Vacío → "". Tiene que dar EXACTAMENTE lo mismo que
 *  `valorComoTexto` de internal/documentos (Go): el texto que firma el
 *  paciente lo arma la API, y el fixture que genera este paquete es el
 *  que lo verifica. */
export function valorComoTexto(campo: Campo, valor: unknown): string {
  if (estaVacio(campo, valor)) return "";
  switch (campo.tipo) {
    case "texto":
    case "texto_largo":
      return (valor as string).trim();
    case "fecha":
      return fechaComoTexto(valor as string);
    case "hora":
      return valor as string;
    case "numero": {
      const numero = numeroComoTexto(valor as number, campo.decimales);
      return campo.unidad ? `${numero} ${campo.unidad}` : numero;
    }
    case "si_no": {
      const r = valor as RespuestaSiNo;
      const base = r.respuesta === "si" ? "Sí" : "No";
      const detalle = (r.detalle ?? "").trim();
      return detalle ? `${base} (${detalle})` : base;
    }
    case "opcion_unica":
      return campo.opciones.find((o) => o.valor === valor)?.etiqueta ?? "";
    case "opcion_multiple": {
      const elegidos = new Set(valor as string[]);
      return campo.opciones
        .filter((o) => elegidos.has(o.valor))
        .map((o) => o.etiqueta)
        .join(", ");
    }
    case "piezas": {
      // En el orden del odontograma, no en el que se tocaron: el mismo
      // documento tiene que leerse igual sin importar cómo se cargó.
      const orden = piezasDe(campo.denticion ?? "ambas");
      return [...(valor as string[])].sort((a, b) => orden.indexOf(a) - orden.indexOf(b)).join(", ");
    }
    case "odontograma":
      return textoDeOdontograma(campo, valor as ValorOdontograma);
  }
}

export { fechaComoTexto };
