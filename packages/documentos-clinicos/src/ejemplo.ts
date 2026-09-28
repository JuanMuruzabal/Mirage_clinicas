// Valores de ejemplo para una plantilla, siempre los mismos. Los usa el
// generador para armar el fixture que la API (Go) compara contra su propia
// versión del texto: si las dos implementaciones se separan en un detalle
// —cómo se escribe una fecha, en qué orden van las piezas, qué dice un
// campo vacío—, ese test falla.
//
// Deja vacío uno de cada cuatro campos opcionales a propósito, para que el
// fixture pruebe también el "No consigna".
import { camposDe, type Campo, type Plantilla } from "./esquema";
import type { Valor, Valores } from "./valores";

function ejemploDe(campo: Campo): Valor {
  switch (campo.tipo) {
    case "texto":
      return `Ejemplo de ${campo.etiqueta.toLowerCase()}`;
    case "texto_largo":
      return "Primera línea del ejemplo.\nSegunda línea del ejemplo.";
    case "fecha":
      return "1984-03-07";
    case "hora":
      return "09:30";
    case "numero":
      return campo.min ?? (campo.decimales ? 12.5 : 12);
    case "si_no":
      return { respuesta: "si", detalle: "detalle de ejemplo" };
    case "opcion_unica":
      return campo.opciones[0].valor;
    case "opcion_multiple":
      return [campo.opciones[1].valor, campo.opciones[0].valor];
    case "piezas":
      // Desordenadas a propósito: el texto las tiene que ordenar.
      return campo.denticion === "temporaria" ? ["75", "51"] : ["37", "11", "36"];
  }
}

export function valoresDeEjemplo(plantilla: Plantilla): Valores {
  const valores: Valores = {};
  let opcionales = 0;
  for (const campo of camposDe(plantilla)) {
    if (!campo.requerido) {
      opcionales += 1;
      if (opcionales % 4 === 0) continue;
    }
    valores[campo.id] = ejemploDe(campo);
  }
  return valores;
}
