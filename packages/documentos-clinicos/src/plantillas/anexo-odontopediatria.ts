// Anexo de odontopediatría — modelo oficial del Colegio Odontológico de la
// Provincia de Córdoba (Anexo-Odontopediatria.pdf, Fase 5.6b).
//
// Los datos del niño y de su médico, el GENOGRAMA (un dibujo a mano alzada,
// el primer campo `dibujo` del motor), el embarazo y el nacimiento, la
// alimentación, los antecedentes odontológicos, los hábitos, el examen de
// los tejidos blandos y duros, el odontograma de odontopediatría y el
// diagnóstico y el plan. La lámina son las dos páginas del PDF. Se firma en
// el sistema (TR-188): el representante legal y el profesional.
//
// Lo que el papel deja a criterio de quien lo llena se resolvió como en la
// historia clínica para PcD:
//   - un SI/NO lleva `detalle` cuando lo que sigue pide aclarar la respuesta
//     ("cuál?", "hasta qué edad?"); el renglón de la aclaración lleva solo
//     el detalle (`{{campo:detalle}}`). El de "Han seguido las instrucciones"
//     aclara el no ("Por qué?"); el del embarazo normal, también;
//   - una pregunta con una sola casilla y su renglón (las anomalías de los
//     tejidos duros, la alimentación natural y la artificial) es un SI/NO con
//     detalle: la X va en la casilla si es sí, y el detalle en el renglón;
//   - la lengua es una opción múltiple (puede ser geográfica y escrotal a la
//     vez) y el renglón de cada opción, un texto aparte: obligar a aclarar
//     una lengua normal no tendría sentido;
//   - "Competentes: ……" e "Incompetentes: ……" de los labios son una sola
//     respuesta: la X en el renglón de la elegida, como un hueco donde se
//     responde marcando;
//   - "Dieta actual del niño" (completa o incompleta) y su "por qué?" son dos
//     campos: una opción única no lleva aclaración;
//   - los puntos que siguen a "meses" en el renglón de la edad no piden
//     nada: quedan sin usar;
//   - la firma del profesional va sobre su línea, sin aclaración ni sello
//     escrito ("Firma y sello del Profesional"); la aclaración y el DNI del
//     representante, centrados sobre sus rótulos.
// La página 1 se dibuja al 99 % (`escala`): la fila de "Interposición
// lingual" termina a medio punto del pie del PDF, que la tapaba.
import type { LugarDeFirma, Plantilla, Zona } from "../esquema";

const r2 = (n: number) => Math.round(n * 100) / 100;

// Las casillas del papel son glifos de Wingdings 2 a 12 pt: un recuadro que
// empieza `dx` después del origen del glifo, medido por sus píxeles. La X va
// centrada adentro (`alzado`: cuánto sube su base para quedar al medio).
type Glifo = { dx: number; ancho: number; tamano: number; alzado: number };
/** El cuadrado de las preguntas: 6,7 × 9 pt, de la base − 8,8 a la base + 0,2. */
const CUADRADO: Glifo = { dx: 0.85, ancho: 6.7, tamano: 7, alzado: 1.8 };
/** El rectángulo de las anomalías de los tejidos duros: 11,15 × 8,65 pt. */
const RECTANGULO: Glifo = { dx: 1.0, ancho: 11.15, tamano: 7, alzado: 1.9 };

function casilla(id: string, pagina: number, base: number, xGlifo: number, texto: string, glifo: Glifo = CUADRADO): Zona {
  return {
    id,
    pagina,
    x: r2(xGlifo + glifo.dx),
    y: r2(base - glifo.alzado),
    ancho: glifo.ancho,
    tamano: glifo.tamano,
    alinear: "centro",
    vacio: "—",
    texto,
  };
}

/** Las dos casillas de un SI/NO, en el renglón de su pregunta. */
function siNo(campo: string, base: number, xSi: number, xNo: number): Zona[] {
  return [casilla(`${campo}_si`, 1, base, xSi, `{{${campo}=si}}`), casilla(`${campo}_no`, 1, base, xNo, `{{${campo}=no}}`)];
}

/** Las casillas de las opciones de un campo, en su renglón. */
function opciones(campo: string, base: number, xPorOpcion: Record<string, number>): Zona[] {
  return Object.entries(xPorOpcion).map(([opcion, x]) => casilla(`${campo}_${opcion}`, 1, base, x, `{{${campo}=${opcion}}}`));
}

type Ajustes = Partial<Pick<Zona, "tamano" | "minimo" | "alinear" | "vacio">>;

/** Un hueco de puntos de un renglón, con la convención de
 *  scripts/medir-huecos.py: un punto después de donde empieza, la línea de
 *  base − 1,2 y un par de puntos menos de ancho. */
function hueco(id: string, pagina: number, base: number, desde: number, hasta: number, texto: string, ajustes: Ajustes = {}): Zona {
  return { id, pagina, x: r2(desde + 1), y: r2(base - 1.2), ancho: r2(hasta - desde - 2), tamano: 9, texto, ...ajustes };
}

/** Un hueco de varios renglones: el primero arranca en `desde` (a mitad del
 *  renglón de su pregunta, si es más que `margen`) y los demás son enteros,
 *  desde `margen`. */
function renglones(
  id: string,
  pagina: number,
  bases: number[],
  desde: number,
  margen: number,
  hasta: number,
  texto: string,
  ajustes: Ajustes = {},
): Zona {
  const sangria = r2(desde - margen);
  return {
    id,
    pagina,
    x: r2(margen + 1),
    y: r2(bases[0] - 1.2),
    ancho: r2(hasta - margen - 2),
    ...(sangria > 0 ? { sangria } : {}),
    lineas: bases.length,
    interlineado: r2((bases[bases.length - 1] - bases[0]) / (bases.length - 1)),
    tamano: 9,
    texto,
    ...ajustes,
  };
}

/** Una X en un hueco de puntos ("Competentes: ……"). */
function enHueco(id: string, base: number, desde: number, hasta: number, texto: string): Zona {
  return hueco(id, 1, base, desde, hasta, texto, { tamano: 8, alinear: "centro", vacio: "—" });
}

// Un hueco corto: arranca a 8 pt y se achica hasta 5 para que entre.
const ACHICABLE = { tamano: 8, minimo: 5 } as const;
// Un renglón de aclaración que queda vacío dice "—": son muchos, y "No
// consigna" en cada uno taparía la hoja.
const ACLARACION = { vacio: "—" } as const;

/** Una anomalía de los tejidos duros: un SI/NO cuya X va en el rectángulo
 *  si es sí, con su aclaración en el renglón de puntos. */
function anomalia(campo: string, base: number, hasta = 546.7): Zona[] {
  return [
    casilla(`${campo}_si`, 1, base, 387.0, `{{${campo}=si}}`, RECTANGULO),
    hueco(`${campo}_detalle`, 1, base, 400.2, hasta, `{{${campo}:detalle}}`, ACLARACION),
  ];
}

const ANOMALIAS: { id: string; etiqueta: string; base: number; hasta?: number }[] = [
  { id: "supernumerarios", etiqueta: "Supernumerarios", base: 550.1, hasta: 555.7 },
  { id: "agenesias", etiqueta: "Agenesias", base: 562.8 },
  { id: "macrodoncia", etiqueta: "Macrodoncia", base: 596.2 },
  { id: "microdoncia", etiqueta: "Microdoncia", base: 608.8 },
  { id: "hipoplasia", etiqueta: "Hipoplasia", base: 642.1 },
  { id: "hipocalcificacion", etiqueta: "Hipocalcificación", base: 654.7 },
  { id: "pigmentacion_endogena", etiqueta: "Pigmentación endógena", base: 667.4 },
  { id: "pigmentacion_exogena", etiqueta: "Pigmentación exógena", base: 680.0 },
  { id: "fusionados", etiqueta: "Dientes fusionados", base: 713.4 },
  { id: "germinados", etiqueta: "Dientes germinados", base: 726.1 },
  { id: "conoides", etiqueta: "Dientes conoides", base: 738.7, hasta: 537.7 },
  { id: "anomalias_otras", etiqueta: "Otras anomalías de forma", base: 751.3 },
];

/** Las opciones de la lengua: la x de su casilla, la línea de base y dónde
 *  empieza y termina su renglón. */
const LENGUA: { valor: string; etiqueta: string; x: number; base: number; desde: number; hasta: number }[] = [
  { valor: "normal", etiqueta: "Normal", x: 384.6, base: 422.5, desde: 405.0, hasta: 561.4 },
  { valor: "macroglosia", etiqueta: "Macroglosia", x: 404.0, base: 435.1, desde: 412.4, hasta: 558.9 },
  { valor: "geografica", etiqueta: "Geográfica", x: 397.1, base: 447.7, desde: 405.5, hasta: 561.0 },
  { valor: "escrotal", etiqueta: "Escrotal", x: 388.1, base: 460.4, desde: 396.5, hasta: 566.0 },
  { valor: "glositis", etiqueta: "Glositis", x: 385.1, base: 473.0, desde: 393.5, hasta: 563.0 },
];

/** Un renglón de la página 2: puntos de Arial Narrow a 12 pt, con 18 pt
 *  entre renglones; se escribe a 10 y se achica hasta 6. */
const RENGLON_DE_LA_PAGINA_2 = { tamano: 10, minimo: 6 } as const;

const FIRMAS: LugarDeFirma[] = [
  // Centrada sobre "Firma del representante legal" (41,7–159,1), a la
  // izquierda de la línea larga (38,9–387,5).
  { rol: "representante", pagina: 2, x: 38.9, y: 790.8, ancho: 124, alto: 46 },
  // La línea corta, sobre "Firma y sello del Profesional".
  { rol: "profesional", pagina: 2, x: 413, y: 790.8, ancho: 141.7, alto: 46 },
];

const siNoConDetalle = (id: string, etiqueta: string, detalle: string, cuando: "si" | "no" = "si") =>
  ({ tipo: "si_no", id, etiqueta, detalle: { etiqueta: detalle, cuando } }) as const;

export const anexoOdontopediatria: Plantilla = {
  id: "anexo-odontopediatria",
  version: 1,
  nombre: "Anexo de odontopediatría",
  tipo: "anexo",
  descripcion:
    "Anexo de odontopediatría: datos del niño y de su médico, genograma, embarazo y nacimiento, alimentación, antecedentes odontológicos, hábitos, examen bucal, odontograma, diagnóstico y plan de tratamiento.",
  fuente: {
    nombre: "Colegio Odontológico de la Provincia de Córdoba",
    url: "https://colodontcba.org.ar/wp-content/uploads/Anexo-Odontopediatria.pdf",
  },
  secciones: [
    {
      id: "paciente",
      titulo: "Paciente",
      campos: [
        { tipo: "texto", id: "paciente_nombre", etiqueta: "Paciente", requerido: true, precarga: "paciente.nombreCompleto" },
        { tipo: "texto", id: "afiliado", etiqueta: "Número de afiliado", precarga: "paciente.obraSocialAfiliado" },
        { tipo: "texto", id: "obra_social", etiqueta: "Obra social", precarga: "paciente.obraSocial" },
        { tipo: "fecha", id: "fecha_nacimiento", etiqueta: "Fecha de nacimiento", precarga: "paciente.fechaNacimiento" },
        { tipo: "texto", id: "nacionalidad", etiqueta: "Nacionalidad" },
        { tipo: "texto", id: "dni", etiqueta: "Nº de documento", precarga: "paciente.dni" },
        { tipo: "texto", id: "telefono", etiqueta: "Teléfono", precarga: "paciente.telefono" },
        { tipo: "texto", id: "domicilio", etiqueta: "Domicilio (calle, número, barrio, localidad)", precarga: "paciente.domicilio" },
        { tipo: "texto", id: "peso", etiqueta: "Peso" },
        { tipo: "texto", id: "talla", etiqueta: "Talla" },
        { tipo: "numero", id: "edad_anios", etiqueta: "Edad: años", min: 0, max: 120, precarga: "paciente.edadAnios" },
        { tipo: "numero", id: "edad_meses", etiqueta: "Edad: meses", min: 0, max: 11, precarga: "paciente.edadMeses" },
        { tipo: "texto", id: "grado_escolar", etiqueta: "Grado escolar" },
      ],
    },
    {
      id: "consulta",
      titulo: "Consulta y médico actuante",
      campos: [
        { tipo: "texto_largo", id: "motivo_consulta", etiqueta: "Motivo de la consulta" },
        { tipo: "texto", id: "actitud_nino", etiqueta: "Actitud del niño" },
        { tipo: "texto", id: "actitud_padres", etiqueta: "Actitud de los padres" },
        { tipo: "texto", id: "medico", etiqueta: "Médico actuante" },
        { tipo: "texto", id: "medico_telefono", etiqueta: "Teléfono del médico" },
        { tipo: "texto", id: "medico_domicilio", etiqueta: "Domicilio del médico" },
        { tipo: "texto", id: "centro_asistencial", etiqueta: "Centro asistencial" },
      ],
    },
    {
      id: "genograma",
      titulo: "Genograma",
      campos: [{ tipo: "dibujo", id: "genograma", etiqueta: "Genograma" }],
    },
    {
      id: "nacimiento",
      titulo: "Embarazo y nacimiento",
      campos: [
        siNoConDetalle("embarazo_normal", "¿Embarazo normal?", "¿Qué no fue normal?", "no"),
        {
          tipo: "opcion_unica",
          id: "nacimiento",
          etiqueta: "Nacimiento",
          opciones: [
            { valor: "a_termino", etiqueta: "A término" },
            { valor: "prematuro", etiqueta: "Prematuro" },
            { valor: "post_termino", etiqueta: "Post-término" },
          ],
        },
        {
          tipo: "opcion_unica",
          id: "parto",
          etiqueta: "Parto",
          opciones: [
            { valor: "normal", etiqueta: "Normal" },
            { valor: "cesarea", etiqueta: "Cesárea" },
            { valor: "forceps", etiqueta: "Fórceps" },
          ],
        },
      ],
    },
    {
      id: "alimentacion",
      titulo: "Alimentación y dieta",
      campos: [
        siNoConDetalle("alimentacion_natural", "¿Alimentación natural del recién nacido?", "¿Hasta cuándo?"),
        siNoConDetalle("alimentacion_artificial", "¿Alimentación artificial del recién nacido?", "¿Hasta cuándo?"),
        { tipo: "texto", id: "alimentacion_mixta", etiqueta: "Comienzo de la alimentación mixta" },
        {
          tipo: "opcion_unica",
          id: "dieta",
          etiqueta: "Dieta actual del niño",
          opciones: [
            { valor: "completa", etiqueta: "Completa" },
            { valor: "incompleta", etiqueta: "Incompleta" },
          ],
        },
        { tipo: "texto_largo", id: "dieta_por_que", etiqueta: "Dieta: ¿por qué?" },
        { tipo: "texto", id: "momentos_azucar", etiqueta: "Momentos de azúcar" },
        { tipo: "texto", id: "tipo_azucar", etiqueta: "¿Qué tipo de azúcar consume?" },
      ],
    },
    {
      id: "antecedentes",
      titulo: "Antecedentes odontológicos",
      campos: [
        { tipo: "si_no", id: "experiencia_previa", etiqueta: "¿Tuvo experiencia odontológica previa?" },
        { tipo: "si_no", id: "informacion_preventiva", etiqueta: "¿Recibió información de medidas preventivas?" },
        siNoConDetalle(
          "siguio_instrucciones",
          "¿Han seguido las instrucciones y medidas impartidas por su odontólogo?",
          "¿Por qué?",
          "no",
        ),
        siNoConDetalle("pasta_dental", "¿Usa pasta dentífrica?", "¿Cuál?"),
        {
          tipo: "opcion_unica",
          id: "cepillado",
          etiqueta: "¿Cuántas veces se cepilla al día?",
          opciones: [
            { valor: "1", etiqueta: "1 vez" },
            { valor: "2", etiqueta: "2 veces" },
            { valor: "3", etiqueta: "3 veces" },
            { valor: "4", etiqueta: "4 veces" },
          ],
        },
        siNoConDetalle("otro_elemento", "¿Usa otro elemento de higiene oral?", "¿Cuál?"),
        siNoConDetalle("fluor", "¿Recibió baño de flúor?", "¿Con qué frecuencia?"),
      ],
    },
    {
      id: "habitos",
      titulo: "Hábitos",
      campos: [
        siNoConDetalle("chupete", "¿Succión de chupete?", "¿Cuándo?"),
        { tipo: "texto", id: "chupete_hasta", etiqueta: "Edad hasta la que usó chupete" },
        siNoConDetalle("digital", "¿Succión digital?", "¿Hasta qué edad?"),
        siNoConDetalle("mamadera", "¿Mamadera?", "¿Hasta qué edad?"),
        siNoConDetalle("otros_objetos", "¿Succión de otros objetos?", "¿Cuáles?"),
        { tipo: "si_no", id: "deglucion_atipica", etiqueta: "¿Deglución atípica?" },
        { tipo: "si_no", id: "interposicion_lingual", etiqueta: "¿Interposición lingual?" },
      ],
    },
    {
      id: "respiracion",
      titulo: "Respiración y fonación",
      campos: [
        { tipo: "si_no", id: "irn", etiqueta: "¿Insuficiente respiración nasal (IRN)?" },
        {
          tipo: "opcion_unica",
          id: "fonacion",
          etiqueta: "Fonación",
          opciones: [
            { valor: "correcta", etiqueta: "Correcta" },
            { valor: "incorrecta", etiqueta: "Incorrecta" },
          ],
        },
      ],
    },
    {
      id: "tejidos_blandos",
      titulo: "Examen bucal: tejidos blandos",
      campos: [
        {
          tipo: "opcion_unica",
          id: "labios",
          etiqueta: "Labios",
          opciones: [
            { valor: "competentes", etiqueta: "Competentes" },
            { valor: "incompetentes", etiqueta: "Incompetentes" },
          ],
        },
        { tipo: "texto", id: "labios_lesiones", etiqueta: "Labios: lesiones" },
        { tipo: "texto", id: "frenillos", etiqueta: "Frenillos" },
        {
          tipo: "opcion_unica",
          id: "frenillos_estado",
          etiqueta: "Frenillos: normal o anormal",
          opciones: [
            { valor: "normal", etiqueta: "Normal" },
            { valor: "anormal", etiqueta: "Anormal" },
          ],
        },
        { tipo: "texto", id: "mucosa_lesiones", etiqueta: "Mucosa: lesiones" },
        { tipo: "texto", id: "tejido_gingival", etiqueta: "Tejido gingival" },
        {
          tipo: "opcion_multiple",
          id: "lengua",
          etiqueta: "Lengua",
          opciones: LENGUA.map(({ valor, etiqueta }) => ({ valor, etiqueta })),
        },
        ...LENGUA.map(({ valor, etiqueta }) => ({ tipo: "texto" as const, id: `lengua_${valor}`, etiqueta: `Lengua ${etiqueta.toLowerCase()}: detalle` })),
        { tipo: "texto_largo", id: "observaciones_blandos", etiqueta: "Observaciones de los tejidos blandos" },
      ],
    },
    {
      id: "tejidos_duros",
      titulo: "Examen bucal: tejidos duros",
      campos: [
        {
          tipo: "opcion_unica",
          id: "denticion",
          etiqueta: "Tipo de dentición",
          opciones: [
            { valor: "primaria", etiqueta: "Primaria" },
            { valor: "mixta", etiqueta: "Mixta" },
            { valor: "permanente", etiqueta: "Permanente" },
          ],
        },
        ...ANOMALIAS.map(({ id, etiqueta }) => siNoConDetalle(id, `¿${etiqueta}?`, id === "anomalias_otras" ? "¿Cuáles?" : "¿En qué piezas?")),
        siNoConDetalle("traumatismos", "¿Traumatismos dentarios?", "¿Cuál?"),
      ],
    },
    {
      id: "odontograma",
      titulo: "Odontograma",
      campos: [{ tipo: "odontograma", id: "odontograma", etiqueta: "Odontograma", leyenda: "pediatrica", denticion: "ambas" }],
    },
    {
      id: "diagnostico",
      titulo: "Diagnóstico y plan",
      campos: [
        { tipo: "texto_largo", id: "diagnostico", etiqueta: "Diagnóstico" },
        { tipo: "texto", id: "derivacion", etiqueta: "El diagnóstico incluye derivación a" },
        { tipo: "texto_largo", id: "plan", etiqueta: "Plan de tratamiento presuntivo" },
        { tipo: "texto_largo", id: "aparatologia", etiqueta: "Aparatología requerida" },
        { tipo: "texto_largo", id: "observaciones", etiqueta: "Observaciones" },
      ],
    },
    {
      id: "representante",
      titulo: "Representante legal",
      campos: [
        { tipo: "texto", id: "aclaracion", etiqueta: "Nombre y apellido del representante", requerido: true },
        { tipo: "texto", id: "aclaracion_dni", etiqueta: "DNI del representante", requerido: true },
      ],
    },
  ],
  cuerpo: [
    { t: "titulo", texto: "Anexo de odontopediatría" },
    {
      t: "parrafo",
      texto: "Paciente: {{paciente_nombre}}. Nº de afiliado: {{afiliado}}. Obra social: {{obra_social}}. Fecha de nacimiento: {{fecha_nacimiento}}.",
    },
    {
      t: "parrafo",
      texto: "Nacionalidad: {{nacionalidad}}. Nº de documento: {{dni}}. Tel.: {{telefono}}. Domicilio (calle, núm., barrio, localidad): {{domicilio}}.",
    },
    {
      t: "parrafo",
      texto: "Peso: {{peso}}. Talla: {{talla}}. Edad en años: {{edad_anios}}. Meses: {{edad_meses}}. Grado escolar: {{grado_escolar}}.",
    },
    { t: "parrafo", texto: "Motivo de la consulta: {{motivo_consulta}}." },
    { t: "parrafo", texto: "Actitud del niño: {{actitud_nino}}. Actitud de los padres: {{actitud_padres}}." },
    {
      t: "parrafo",
      texto: "Médico actuante: {{medico}}. Tel.: {{medico_telefono}}. Domicilio: {{medico_domicilio}}. Centro asistencial: {{centro_asistencial}}.",
    },
    { t: "campo", campo: "genograma" },
    {
      t: "lista",
      items: ["Embarazo normal: {{embarazo_normal}}.", "Nacimiento: {{nacimiento}}. Parto: {{parto}}."],
    },
    { t: "subtitulo", texto: "Alimentación del recién nacido" },
    { t: "lista", items: ["Natural: {{alimentacion_natural}}.", "Artificial: {{alimentacion_artificial}}."] },
    { t: "subtitulo", texto: "Nutrición y dieta" },
    {
      t: "lista",
      items: [
        "Comienzo de la alimentación mixta: {{alimentacion_mixta}}.",
        "Dieta actual del niño: {{dieta}}. ¿Por qué? {{dieta_por_que}}.",
        "Momentos de azúcar: {{momentos_azucar}}.",
        "¿Qué tipo de azúcar consume? {{tipo_azucar}}.",
      ],
    },
    { t: "subtitulo", texto: "Antecedentes odontológicos" },
    {
      t: "lista",
      items: [
        "¿Tuvo experiencia odontológica previa? {{experiencia_previa}}.",
        "¿Recibió información de medidas preventivas? {{informacion_preventiva}}.",
        "¿Han seguido las instrucciones y medidas impartidas por su odontólogo? {{siguio_instrucciones}}.",
        "¿Usa pasta dentífrica? {{pasta_dental}}.",
        "¿Cuántas veces se cepilla al día? {{cepillado}}.",
        "¿Usa otro elemento de higiene oral? {{otro_elemento}}.",
        "¿Recibió baño de flúor? {{fluor}}.",
      ],
    },
    { t: "subtitulo", texto: "Hábitos" },
    {
      t: "lista",
      items: [
        "Succión, chupete: {{chupete}}. ¿Hasta qué edad? {{chupete_hasta}}.",
        "Digital: {{digital}}.",
        "Mamadera: {{mamadera}}.",
        "Otros objetos: {{otros_objetos}}.",
        "Deglución atípica: {{deglucion_atipica}}.",
        "Interposición lingual: {{interposicion_lingual}}.",
      ],
    },
    { t: "parrafo", texto: "IRN (insuficiente respiración nasal): {{irn}}. Fonación: {{fonacion}}." },
    { t: "subtitulo", texto: "Examen bucal: tejidos blandos" },
    {
      t: "lista",
      items: [
        "Labios: {{labios}}. Lesiones: {{labios_lesiones}}.",
        "Frenillos: {{frenillos}}. Normal o anormal: {{frenillos_estado}}.",
        "Mucosa, lesiones: {{mucosa_lesiones}}.",
        "Tejido gingival: {{tejido_gingival}}.",
        "Lengua: {{lengua}}.",
        `Detalle de la lengua. ${LENGUA.map(({ valor, etiqueta }) => `${etiqueta}: {{lengua_${valor}}}.`).join(" ")}`,
        "Observaciones: {{observaciones_blandos}}.",
      ],
    },
    { t: "subtitulo", texto: "Examen bucal: tejidos duros" },
    {
      t: "lista",
      items: [
        "Tipo de dentición: {{denticion}}.",
        "Anomalías de número. Supernumerarios: {{supernumerarios}}. Agenesias: {{agenesias}}.",
        "Anomalías de tamaño. Macrodoncia: {{macrodoncia}}. Microdoncia: {{microdoncia}}.",
        "Anomalías de la estructura. Hipoplasia: {{hipoplasia}}. Hipocalcificación: {{hipocalcificacion}}. Pigmentación endógena: {{pigmentacion_endogena}}. Pigmentación exógena: {{pigmentacion_exogena}}.",
        "Anomalías de forma. Dientes fusionados: {{fusionados}}. Dientes germinados: {{germinados}}. Dientes conoides: {{conoides}}. Otros: {{anomalias_otras}}.",
        "Lesiones adquiridas de los tejidos duros. Traumatismos dentarios: {{traumatismos}}.",
      ],
    },
    { t: "campo", campo: "odontograma" },
    { t: "campo", campo: "diagnostico" },
    { t: "parrafo", texto: "El diagnóstico incluye derivación a: {{derivacion}}." },
    { t: "campo", campo: "plan" },
    { t: "campo", campo: "aparatologia" },
    { t: "campo", campo: "observaciones" },
    { t: "parrafo", texto: "Representante legal: {{aclaracion}}. DNI: {{aclaracion_dni}}." },
    { t: "firmas" },
  ],
  firmas: [
    { rol: "representante", etiqueta: "Representante legal", requerida: true },
    { rol: "profesional", etiqueta: "Profesional odontólogo", requerida: true },
  ],
  // A4 (595,32 × 841,92 pt), dos páginas. La 1 en Arial Narrow y Arial de
  // 9 pt con renglones de puntos; la 2, renglones de puntos de Arial Narrow
  // a 12 pt. Medido con scripts/medir-huecos.py; las casillas, por los
  // píxeles del glifo; el odontograma, con scripts/medir-odontograma.py
  // sobre las dos imágenes escaneadas de la página 2 (temporarios arriba,
  // permanentes abajo).
  lamina: {
    paginas: [
      { ancho: 595.32, alto: 841.92, escala: 0.99 },
      { ancho: 595.32, alto: 841.92 },
    ],
    zonas: [
      // Encabezado: el nombre sobre la línea de base del rótulo PACIENTE.
      { id: "paciente_nombre", pagina: 1, x: 74, y: 97.2, ancho: 205, tamano: 9, minimo: 6, texto: "{{paciente_nombre}}" },
      // Dieciséis casillas de 12,8 a 19,5 pt: el paso deja cada carácter a
      // menos de 2,1 pt del centro de la suya. Centrado en el alto de la fila.
      {
        id: "afiliado",
        pagina: 1,
        x: 329.9,
        y: 101.2,
        ancho: 239.84,
        casillas: { cantidad: 16, paso: 14.99 },
        texto: "{{afiliado}}",
      },
      hueco("obra_social", 1, 131.3, 69.5, 373.4, "{{obra_social}}"),
      hueco("fecha_nacimiento", 1, 131.3, 393.1, 559.0, "{{fecha_nacimiento}}"),
      hueco("nacionalidad", 1, 144.3, 78.0, 223.6, "{{nacionalidad}}"),
      hueco("dni", 1, 144.3, 257.2, 405.6, "{{dni}}"),
      hueco("telefono", 1, 144.3, 417.9, 557.9, "{{telefono}}"),
      hueco("domicilio", 1, 157.1, 168.2, 557.8, "{{domicilio}}"),
      hueco("peso", 1, 170.1, 54.2, 173.1, "{{peso}}"),
      hueco("talla", 1, 170.1, 191.2, 310.4, "{{talla}}"),
      hueco("edad_anios", 1, 170.1, 329.6, 415.9, "{{edad_anios}}", { alinear: "centro", vacio: "—" }),
      hueco("edad_meses", 1, 170.1, 431.8, 487.2, "{{edad_meses}}", { alinear: "centro", vacio: "—" }),
      hueco("grado_escolar", 1, 182.9, 85.8, 557.8, "{{grado_escolar}}"),
      renglones("motivo_consulta", 1, [195.9, 208.7], 106.6, 35.4, 558.6, "{{motivo_consulta}}"),
      hueco("actitud_nino", 1, 221.7, 89.9, 558.6, "{{actitud_nino}}"),
      hueco("actitud_padres", 1, 234.6, 108.3, 558.2, "{{actitud_padres}}"),
      hueco("medico", 1, 247.5, 93.6, 344.4, "{{medico}}"),
      hueco("medico_telefono", 1, 247.5, 360.8, 558.6, "{{medico_telefono}}"),
      hueco("medico_domicilio", 1, 260.5, 69.5, 322.1, "{{medico_domicilio}}"),
      hueco("centro_asistencial", 1, 260.5, 383.6, 557.4, "{{centro_asistencial}}"),

      // Columna izquierda: embarazo, nacimiento y parto.
      ...siNo("embarazo_normal", 410.9, 139.6, 171.5),
      hueco("embarazo_normal_detalle", 1, 410.9, 191.9, 285.5, "{{embarazo_normal:detalle}}", { ...ACHICABLE, ...ACLARACION }),
      ...opciones("nacimiento", 423.5, { a_termino: 129.5, prematuro: 195.1, post_termino: 269.0 }),
      ...opciones("parto", 436.3, { normal: 134.6, cesarea: 199.5, forceps: 267.0 }),

      // Alimentación del recién nacido.
      casilla("alimentacion_natural_si", 1, 471.9, 63.5, "{{alimentacion_natural=si}}"),
      hueco("alimentacion_natural_detalle", 1, 471.9, 136.0, 284.9, "{{alimentacion_natural:detalle}}", ACLARACION),
      casilla("alimentacion_artificial_si", 1, 484.5, 63.5, "{{alimentacion_artificial=si}}"),
      hueco("alimentacion_artificial_detalle", 1, 484.5, 136.0, 284.9, "{{alimentacion_artificial:detalle}}", ACLARACION),

      // Nutrición y dieta.
      hueco("alimentacion_mixta", 1, 518.4, 171.5, 288.5, "{{alimentacion_mixta}}"),
      ...opciones("dieta", 540.9, { completa: 68.1, incompleta: 130.5 }),
      renglones("dieta_por_que", 1, [540.9, 551.7], 186.5, 27.0, 286.3, "{{dieta_por_que}}", { tamano: 8, minimo: 5 }),
      hueco("momentos_azucar", 1, 562.1, 111.0, 285.9, "{{momentos_azucar}}"),
      hueco("tipo_azucar", 1, 572.4, 147.1, 287.0, "{{tipo_azucar}}"),

      // Antecedentes odontológicos.
      ...siNo("experiencia_previa", 607.6, 236.1, 267.9),
      ...siNo("informacion_preventiva", 620.3, 236.1, 267.9),
      ...siNo("siguio_instrucciones", 643.2, 236.1, 267.9),
      hueco("siguio_instrucciones_detalle", 1, 654.1, 63.6, 286.4, "{{siguio_instrucciones:detalle}}", ACLARACION),
      ...siNo("pasta_dental", 666.2, 128.1, 164.4),
      hueco("pasta_dental_detalle", 1, 666.2, 199.5, 286.9, "{{pasta_dental:detalle}}", { ...ACHICABLE, ...ACLARACION }),
      ...opciones("cepillado", 679.0, { 1: 193.6, 2: 217.0, 3: 245.0, 4: 268.4 }),
      ...siNo("otro_elemento", 691.6, 235.8, 267.7),
      hueco("otro_elemento_detalle", 1, 702.4, 56.1, 280.9, "{{otro_elemento:detalle}}", ACLARACION),
      ...siNo("fluor", 714.6, 133.1, 169.5),
      hueco("fluor_detalle", 1, 714.6, 229.5, 279.5, "{{fluor:detalle}}", { ...ACHICABLE, ...ACLARACION }),

      // Hábitos.
      ...siNo("chupete", 750.3, 239.7, 271.6),
      hueco("chupete_detalle", 1, 761.1, 74.1, 166.5, "{{chupete:detalle}}", ACLARACION),
      hueco("chupete_hasta", 1, 761.1, 236.1, 283.5, "{{chupete_hasta}}", { ...ACHICABLE, vacio: "—" }),
      ...siNo("digital", 773.2, 90.5, 127.0),
      hueco("digital_detalle", 1, 773.2, 207.5, 270.5, "{{digital:detalle}}", { ...ACHICABLE, ...ACLARACION }),
      ...siNo("mamadera", 785.9, 91.1, 127.5),
      hueco("mamadera_detalle", 1, 785.9, 207.9, 270.9, "{{mamadera:detalle}}", { ...ACHICABLE, ...ACLARACION }),
      ...siNo("otros_objetos", 798.5, 94.1, 130.5),
      hueco("otros_objetos_detalle", 1, 798.5, 175.0, 282.9, "{{otros_objetos:detalle}}", { ...ACHICABLE, ...ACLARACION }),
      ...siNo("deglucion_atipica", 811.2, 236.1, 267.9),
      ...siNo("interposicion_lingual", 823.8, 236.1, 267.9),

      // Columna derecha: respiración y fonación.
      ...siNo("irn", 297.0, 508.6, 540.4),
      ...opciones("fonacion", 309.6, { correcta: 481.1, incorrecta: 539.5 }),

      // Tejidos blandos.
      enHueco("labios_competentes", 356.2, 411.6, 564.5, "{{labios=competentes}}"),
      enHueco("labios_incompetentes", 366.5, 417.2, 559.6, "{{labios=incompetentes}}"),
      hueco("labios_lesiones", 1, 376.9, 394.1, 566.1, "{{labios_lesiones}}"),
      hueco("frenillos", 1, 389.1, 354.5, 467.5, "{{frenillos}}"),
      ...opciones("frenillos_estado", 389.1, { normal: 499.1, anormal: 555.6 }),
      hueco("mucosa_lesiones", 1, 399.9, 394.1, 561.0, "{{mucosa_lesiones}}"),
      hueco("tejido_gingival", 1, 410.2, 383.9, 565.0, "{{tejido_gingival}}"),
      ...LENGUA.flatMap(({ valor, x, base, desde, hasta }) => [
        casilla(`lengua_${valor}_x`, 1, base, x, `{{lengua=${valor}}}`),
        hueco(`lengua_${valor}`, 1, base, desde, hasta, `{{lengua_${valor}}}`, ACLARACION),
      ]),
      renglones("observaciones_blandos", 1, [483.9, 494.3], 364.6, 299.5, 565.5, "{{observaciones_blandos}}", { tamano: 8, minimo: 5 }),

      // Tejidos duros.
      ...opciones("denticion", 527.1, { primaria: 431.0, mixta: 475.5, permanente: 547.5 }),
      ...ANOMALIAS.flatMap(({ id, base, hasta }) => anomalia(id, base, hasta)),
      ...siNo("traumatismos", 784.7, 406.6, 438.5),
      renglones("traumatismos_detalle", 1, [784.7, 795.6], 471.0, 299.5, 559.0, "{{traumatismos:detalle}}", { tamano: 8, minimo: 5, ...ACLARACION }),

      // Página 2: diagnóstico, plan, aparatología y observaciones.
      renglones("diagnostico", 2, [325.0, 342.9, 360.8, 378.8, 396.7], 36.6, 36.6, 556.5, "{{diagnostico}}", RENGLON_DE_LA_PAGINA_2),
      hueco("derivacion", 2, 414.5, 199.0, 555.9, "{{derivacion}}", RENGLON_DE_LA_PAGINA_2),
      renglones(
        "plan",
        2,
        [464.1, 482.0, 499.9, 517.9, 535.8, 553.7, 571.5],
        36.6,
        36.6,
        556.5,
        "{{plan}}",
        RENGLON_DE_LA_PAGINA_2,
      ),
      renglones("aparatologia", 2, [589.4, 607.3, 625.3], 142.2, 36.6, 553.8, "{{aparatologia}}", RENGLON_DE_LA_PAGINA_2),
      renglones("observaciones", 2, [665.2, 684.5], 119.5, 36.6, 558.1, "{{observaciones}}", RENGLON_DE_LA_PAGINA_2),
      // La aclaración y el DNI del representante, sobre la línea larga
      // (790,8) y centrados sobre sus rótulos: "Aclaración" (226,8–268,9) y
      // "DNI" (344,1–359,6).
      { id: "aclaracion", pagina: 2, x: 186, y: 788, ancho: 123.7, tamano: 9, minimo: 6, alinear: "centro", texto: "{{aclaracion}}" },
      { id: "aclaracion_dni", pagina: 2, x: 316.2, y: 788, ancho: 71.3, tamano: 9, minimo: 6, alinear: "centro", texto: "{{aclaracion_dni}}" },
    ],
    firmas: FIRMAS,
    // El espacio en blanco de la columna izquierda, entre el título
    // GENOGRAMA (termina en 299,4) y EMBARAZO (empieza en 402,8).
    dibujos: [{ campo: "genograma", pagina: 1, x: 27, y: 301, ancho: 261, alto: 98 }],
    odontogramas: [
      {
        campo: "odontograma",
        pagina: 2,
        piezas: [
          { pieza: "55", x: 96.98, y: 84.83, lado: 18.5 },
          { pieza: "54", x: 118.23, y: 84.71, lado: 18.26 },
          { pieza: "53", x: 139.36, y: 84.95, lado: 18.02 },
          { pieza: "52", x: 160.01, y: 84.95, lado: 18.26 },
          { pieza: "51", x: 180.96, y: 85.13, lado: 18.38 },
          { pieza: "61", x: 209.23, y: 85.19, lado: 18.26 },
          { pieza: "62", x: 230.42, y: 85.13, lado: 18.38 },
          { pieza: "63", x: 251.56, y: 85.37, lado: 18.38 },
          { pieza: "64", x: 272.57, y: 85.49, lado: 18.14 },
          { pieza: "65", x: 293.4, y: 85.55, lado: 18.02 },
          { pieza: "85", x: 96.38, y: 111.89, lado: 18.26 },
          { pieza: "84", x: 117.45, y: 111.95, lado: 18.38 },
          { pieza: "83", x: 138.46, y: 112.07, lado: 18.14 },
          { pieza: "82", x: 159.35, y: 112.31, lado: 18.14 },
          { pieza: "81", x: 180.18, y: 112.37, lado: 18.26 },
          { pieza: "71", x: 209.35, y: 112.49, lado: 18.26 },
          { pieza: "72", x: 230.42, y: 112.55, lado: 18.38 },
          { pieza: "73", x: 251.56, y: 112.79, lado: 18.14 },
          { pieza: "74", x: 272.57, y: 112.91, lado: 18.14 },
          { pieza: "75", x: 293.34, y: 112.79, lado: 18.14 },
          { pieza: "18", x: 33.77, y: 183.47, lado: 18.14 },
          { pieza: "17", x: 54.54, y: 183.59, lado: 18.14 },
          { pieza: "16", x: 75.37, y: 183.9, lado: 18.02 },
          { pieza: "15", x: 96.14, y: 183.78, lado: 18.26 },
          { pieza: "14", x: 117.03, y: 183.53, lado: 18.5 },
          { pieza: "13", x: 138.22, y: 183.96, lado: 18.14 },
          { pieza: "12", x: 159.05, y: 184.02, lado: 18.02 },
          { pieza: "11", x: 180.0, y: 183.96, lado: 18.14 },
          { pieza: "21", x: 209.53, y: 183.96, lado: 18.38 },
          { pieza: "22", x: 230.91, y: 184.2, lado: 18.14 },
          { pieza: "23", x: 252.04, y: 184.2, lado: 18.14 },
          { pieza: "24", x: 272.81, y: 184.32, lado: 18.14 },
          { pieza: "25", x: 293.52, y: 184.26, lado: 18.26 },
          { pieza: "26", x: 314.41, y: 184.5, lado: 18.02 },
          { pieza: "27", x: 335.36, y: 183.96, lado: 18.14 },
          { pieza: "28", x: 355.77, y: 183.96, lado: 18.14 },
          { pieza: "48", x: 34.37, y: 210.29, lado: 18.14 },
          { pieza: "47", x: 55.08, y: 210.47, lado: 18.02 },
          { pieza: "46", x: 76.09, y: 210.59, lado: 18.02 },
          { pieza: "45", x: 96.92, y: 210.65, lado: 18.14 },
          { pieza: "44", x: 118.05, y: 210.65, lado: 18.14 },
          { pieza: "43", x: 138.76, y: 210.59, lado: 18.26 },
          { pieza: "42", x: 159.83, y: 210.89, lado: 17.9 },
          { pieza: "41", x: 180.72, y: 210.89, lado: 18.14 },
          { pieza: "31", x: 209.77, y: 210.89, lado: 18.14 },
          { pieza: "32", x: 230.85, y: 210.71, lado: 18.26 },
          { pieza: "33", x: 251.8, y: 211.13, lado: 18.14 },
          { pieza: "34", x: 272.87, y: 211.19, lado: 18.02 },
          { pieza: "35", x: 293.58, y: 211.13, lado: 18.14 },
          { pieza: "36", x: 314.41, y: 211.19, lado: 18.02 },
          { pieza: "37", x: 335.6, y: 211.37, lado: 18.14 },
          { pieza: "38", x: 355.95, y: 211.19, lado: 18.26 },
        ],
      },
    ],
  },
};
