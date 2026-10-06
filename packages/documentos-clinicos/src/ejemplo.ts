// Valores de ejemplo para una plantilla, siempre los mismos. Los usa el
// generador para armar el fixture que la API (Go) compara contra su propia
// versión del texto: si las dos implementaciones se separan en un detalle
// —cómo se escribe una fecha, en qué orden van las piezas, qué dice un
// campo vacío—, ese test falla.
//
// Deja vacío uno de cada cuatro campos opcionales a propósito, para que el
// fixture pruebe también el "No consigna".
import { camposDe, type Campo, type Plantilla } from "./esquema";
import type { ValorDibujo } from "./dibujo";
import { redondear2 } from "./metricas";
import type { CampoOdontograma, Punto, ValorOdontograma } from "./odontograma";
import type { Valor, Valores } from "./valores";

// Un texto de ejemplo tiene la forma del dato real —un DNI, una
// matrícula— o es corto: el fixture es un documento que se puede terminar,
// así que tiene que entrar en los huecos de la lámina, y muchos son chicos
// ("MP……", "Edad……"). Con la etiqueta entera ("Ejemplo de profesional
// odontólogo que deriva al paciente") no entraba ni achicado (Fase 5.2).
const ES_MATRICULA = /(^|_)(mp|matricula)(_|$)/;
const ES_DNI = /(^|_)dni(_|$)/;

// Desordenado a propósito (las caras, la prótesis de 23 a 13): el texto y
// las figuras lo tienen que ordenar.
function odontogramaDeEjemplo(campo: CampoOdontograma): ValorOdontograma {
  if (campo.leyenda === "pediatrica") {
    return { piezas: { "75": { marcas: { x: "azul" } }, "61": { caras: { V: "rojo" }, marcas: { traumatizado: "rojo" } }, "55": { marcas: { sellador: "azul" } } } };
  }
  return {
    piezas: { "16": { caras: { O: "rojo", M: "rojo" }, marcas: { corona: "rojo" } }, "26": { marcas: { x: "azul" } }, "36": { caras: { D: "azul" } } },
    protesis: [{ tipo: "fija", desde: "23", hasta: "13", color: "rojo" }],
    ...(campo.existentes ? { existentes: 28 } : {}),
  };
}

/** Un genograma mínimo, en un lienzo con la proporción del recuadro del
 *  papel: el padre (un cuadrado), la madre (un círculo), la línea que los
 *  une y la que baja hacia los hijos. */
export function dibujoDeEjemplo(): ValorDibujo {
  const circulo = Array.from({ length: 13 }, (_, i): Punto => {
    const angulo = (i / 12) * 2 * Math.PI;
    return [redondear2(480 + 30 * Math.cos(angulo)), redondear2(90 + 30 * Math.sin(angulo))];
  });
  return {
    ancho: 780,
    alto: 290,
    trazos: [
      [[300, 60], [360, 60], [360, 120], [300, 120], [300, 60]],
      circulo,
      [[360, 90], [450, 90]],
      [[405, 90], [405, 200]],
    ],
  };
}

function ejemploDe(campo: Campo): Valor {
  switch (campo.tipo) {
    case "texto":
      if (campo.precarga === "profesional.matricula" || campo.precarga === "profesional.matriculaNumero" || ES_MATRICULA.test(campo.id)) return "1234";
      // Un número de afiliado va en casillas de a un carácter.
      if (campo.precarga === "paciente.obraSocialAfiliado") return "40123456";
      if (campo.precarga === "paciente.dni" || ES_DNI.test(campo.id)) return "30111222";
      return `Ejemplo de ${campo.etiqueta.split(/\s+/)[0].toLowerCase()}`;
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
    case "odontograma":
      return odontogramaDeEjemplo(campo);
    case "dibujo":
      return dibujoDeEjemplo();
  }
}

export function valoresDeEjemplo(plantilla: Plantilla): Valores {
  const valores: Valores = {};
  let opcionales = 0;
  for (const campo of camposDe(plantilla)) {
    // El odontograma y el dibujo van siempre: es lo que más hay que
    // comparar con Go.
    if (!campo.requerido && campo.tipo !== "odontograma" && campo.tipo !== "dibujo") {
      opcionales += 1;
      if (opcionales % 4 === 0) continue;
    }
    valores[campo.id] = ejemploDe(campo);
  }
  return valores;
}
