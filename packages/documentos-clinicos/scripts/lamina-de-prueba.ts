// Compone la lámina de una plantilla con todos sus campos cargados —con
// valores largos, para ver hasta dónde llega cada zona— y la escribe en
// JSON. `scripts/dibujar-lamina.py` (raíz del repo) la dibuja sobre la
// página original: es cómo se verifica a ojo que cada dato cae en su
// renglón al escribir o tocar una lámina (Fase 5.2, TR-189).
//
// Uso: pnpm --filter @dental-mirage/documentos-clinicos exec tsx scripts/lamina-de-prueba.ts <id> <salida.json>
import { writeFileSync } from "node:fs";
import {
  armarFiguras,
  armarLamina,
  camposDe,
  plantillaPorId,
  validarLamina,
  type Campo,
  type MarcaDePieza,
  type PiezaOdontograma,
  type Valor,
  type ValorOdontograma,
  type Valores,
} from "../src/index";

const LARGO =
  "Enjuagues con clorhexidina al 0,12 % dos veces por día durante siete días, después del cepillado. Evitar alimentos duros o muy calientes del lado tratado y volver a la consulta ante cualquier molestia.";

function lleno(c: Campo): Valor {
  switch (c.tipo) {
    case "texto":
      if (/(^|_)dni(_|$)/.test(c.id)) return "30.111.222";
      if (/(^|_)(mp|matricula)(_|$)/.test(c.id)) return "12345";
      return `${c.etiqueta} de prueba`;
    case "texto_largo":
      return `${LARGO} ${LARGO}`;
    case "fecha":
      return "2026-10-05";
    case "hora":
      return "16:30";
    case "numero":
      return c.min !== undefined && c.min > 0 ? c.min : 34;
    case "si_no":
      return { respuesta: "si", detalle: "Detalle" };
    case "opcion_unica":
      return c.opciones[c.opciones.length - 1].valor;
    case "opcion_multiple":
      return [c.opciones[0].valor];
    case "piezas":
      return ["11", "21", "36", "46"];
    case "odontograma":
      return odontogramaLleno(c.leyenda);
  }
}

// Las cinco caras en los dos colores, cada marca de la leyenda, una prótesis
// de cada tipo y la cantidad de dientes: todo lo que dibuja el odontograma,
// en las cuatro filas (Fase 5.5).
function odontogramaLleno(leyenda: "general" | "pediatrica"): ValorOdontograma {
  const marcas: MarcaDePieza[] =
    leyenda === "general"
      ? ["x", "corona"]
      : ["x", "corona", "sellador", "traumatizado"];
  const piezas: Record<string, PiezaOdontograma> = {
    "16": { caras: { V: "rojo", M: "rojo", O: "azul" } },
    "21": { caras: { L: "azul", D: "rojo" } },
    "36": { caras: { O: "rojo", D: "azul", V: "azul" } },
    "44": { caras: { M: "azul", L: "rojo" } },
    "55": { caras: { O: "rojo" } },
    "63": { caras: { V: "azul", M: "azul" } },
    "75": { caras: { O: "azul", D: "rojo" } },
    "82": { caras: { L: "rojo" } },
  };
  ["18", "28", "48", "38", "85", "71"].forEach((p, i) => {
    piezas[p] = {
      marcas: { [marcas[i % marcas.length]]: i % 2 ? "azul" : "rojo" },
    };
  });
  if (leyenda === "pediatrica") return { piezas, existentes: 20 };
  return {
    piezas,
    protesis: [
      { tipo: "fija", desde: "13", hasta: "11", color: "rojo" },
      { tipo: "removible", desde: "34", hasta: "37", color: "azul" },
    ],
    existentes: 26,
  };
}

const [id, salida] = process.argv.slice(2);
const plantilla = id ? plantillaPorId(id) : undefined;
if (!plantilla || !salida) {
  console.error(
    "Uso: tsx scripts/lamina-de-prueba.ts <id de plantilla> <salida.json>",
  );
  process.exit(1);
}
const valores: Valores = {};
for (const c of camposDe(plantilla)) valores[c.id] = lleno(c);
const contexto = { fecha: "2026-09-29" };
const compuesta = armarLamina(plantilla, valores, contexto, "sellado");
const desbordes = validarLamina(plantilla, valores, contexto);
const figuras = armarFiguras(plantilla, valores, "sellado");
writeFileSync(
  salida,
  JSON.stringify({
    plantilla: plantilla.id,
    lamina: plantilla.lamina,
    compuesta,
    figuras,
    desbordes,
  }),
);
// Con valores tan largos, los huecos chicos desbordan: es esperable. Lo que
// importa es dónde cae cada renglón.
console.log(
  `${plantilla.id}: ${compuesta.length} zonas; desbordan con valores largos: ${desbordes.map((d) => d.campo).join(", ") || "ninguna"}`,
);
