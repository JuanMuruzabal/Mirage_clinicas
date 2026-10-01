// Consentimiento informado de prótesis completa — modelo oficial del
// Colegio Odontológico de la Provincia de Córdoba
// (Consentimiento-Informado-de-Protesis-Completa.pdf).
//
// El texto es el del modelo, palabra por palabra; se tocó solo la
// ortografía ("fonoaudiólogo", "sobre todo", "esté", "dé", y un
// "inflación" que es "inflamación"). La próxima consulta del papel es
// "el día …. / ….. / ………….hora.": el día y el mes en sus huecos, y el año
// y la hora juntos en el último ("2026, 16:30 hora").
//
// Los datos de quien suscribe (nombre, DNI, domicilio) se completa a mano en la hoja impresa (pedido del cliente, 2026-09-29).
import type { Plantilla } from "../esquema";

export const consentimientoProtesisCompleta: Plantilla = {
  id: "consentimiento-protesis-completa",
  version: 1,
  nombre: "Prótesis completa",
  tipo: "consentimiento",
  descripcion: "Consentimiento informado para una prótesis dental completa, con sus limitaciones, riesgos, recomendaciones e indicaciones.",
  fuente: {
    nombre: "Colegio Odontológico de la Provincia de Córdoba",
    url: "https://colodontcba.org.ar/informacion-general/modelo-historia-clinica/",
  },
  secciones: [
    {
      id: "lugar",
      titulo: "Lugar y fecha",
      campos: [{ tipo: "texto", id: "lugar", etiqueta: "Lugar", requerido: true, precarga: "clinica.ciudad" }],
    },
    {
      id: "tratamiento",
      titulo: "Tratamiento",
      campos: [
        { tipo: "texto_largo", id: "material_convenido", etiqueta: "Material convenido", requerido: true },
        { tipo: "texto_largo", id: "tratamiento_alternativo", etiqueta: "Tratamiento alternativo (riesgo, beneficios y perjuicios)" },
        { tipo: "texto", id: "consecuencias_otras", etiqueta: "Otras consecuencias de no hacerlo" },
        {
          tipo: "texto_largo",
          id: "riesgos_personalizados",
          etiqueta: "Riesgos personalizados y especificaciones de la no realización",
        },
      ],
    },
    {
      id: "proxima_consulta",
      titulo: "Próxima consulta",
      campos: [
        { tipo: "fecha", id: "proxima_consulta_fecha", etiqueta: "Día" },
        { tipo: "hora", id: "proxima_consulta_hora", etiqueta: "Hora" },
      ],
    },
    {
      id: "firmante",
      titulo: "Maxilares y profesional",
      campos: [
        {
          tipo: "opcion_unica",
          id: "maxilares",
          etiqueta: "Maxilar/es",
          requerido: true,
          opciones: [
            { valor: "superior", etiqueta: "Superior" },
            { valor: "inferior", etiqueta: "Inferior" },
            { valor: "ambos", etiqueta: "Superior e inferior" },
          ],
        },
        {
          tipo: "texto",
          id: "profesional_nombre",
          etiqueta: "Profesional",
          requerido: true,
          precarga: "profesional.nombreCompleto",
          bloqueado: true,
        },
        { tipo: "texto", id: "profesional_matricula", etiqueta: "MP", requerido: true, precarga: "profesional.matricula", bloqueado: true },
      ],
    },
  ],
  cuerpo: [
    { t: "titulo", texto: "Consentimiento informado" },
    { t: "subtitulo", texto: "Prótesis completa" },
    { t: "parrafo", texto: "Lugar y fecha: {{lugar}}, {{sistema.fecha}}." },
    {
      t: "parrafo",
      texto:
        "Usted tiene derecho a conocer el procedimiento al que va a ser sometido y las complicaciones más frecuentes que ocurren. Este documento intenta explicarle todas estas cuestiones, léalo atentamente y consulte todas las dudas que se le planteen. Le recordamos que por imperativo legal, tendrá que firmar, usted o su representante legal, el consentimiento informado para que pueda realizarle dicho procedimiento.",
    },
    {
      t: "parrafo",
      texto:
        "A propósito declaro haber sido informado y haber comprendido acabadamente que el objeto del tratamiento es reemplazar los dientes naturales perdidos y rehabilitar la función estética y fonética de la cavidad bucal.",
    },
    { t: "campo", campo: "material_convenido" },
    { t: "campo", campo: "tratamiento_alternativo" },
    {
      t: "parrafo",
      texto:
        "Declaro que mi odontólogo ha examinado mi boca debidamente. Que se me ha explicado otras alternativas a este tratamiento, con prótesis convencionales (fija con implante dental como anclaje de distinto tipo de prótesis, con un costo mayor), y que se ha estudiado y considerado estos métodos que se me informaron, siendo mi voluntad que se me realice el tratamiento objeto del presente consentimiento.",
    },
    {
      t: "parrafo",
      texto:
        "Limitaciones: al carecer de fijación mecánica al hueso, estos aparatos experimentan una cierta movilidad al comer, sobre todo el inferior. Una limitación estética derivada de esta inestabilidad es que, en prótesis completas, los dientes anteriores y superiores no siempre pueden montarse sobre los anteriores e inferiores, según las indicaciones técnicas y mecánicas derivadas de la confección de prótesis removible en muchas ocasiones no será posible la reproducción de la posición de los dientes naturales. La duración de la prótesis removible es limitada por lo que deberá renovarse periódicamente.",
    },
    { t: "parrafo", texto: "Riesgos típicos:" },
    {
      t: "lista",
      items: [
        "Sensación extraña de ocupación.",
        "Más producción de saliva de lo normal.",
        "Disminución del sentido del gusto.",
        "Dificultades de pronunciación de ciertos sonidos.",
        "Es probable que se muerda fácilmente en las mejillas o lengua.",
        "Algunas molestias (dolor, inflamación, ulceración) en las zonas donde apoyan las prótesis, sobre todo a la altura de los bordes.",
        "Probablemente se muevan mucho al comer, al menos inicialmente, por lo que deberá masticar de los dos lados.",
      ],
    },
    { t: "parrafo", texto: "Consecuencia de la no realización del tratamiento:" },
    {
      t: "lista",
      items: [
        "Reabsorción ósea (del hueso del maxilar y de la mandíbula).",
        "Problemas articulares y de oclusión.",
        "Problemas en la digestión.",
        "Alteración de la fonación y estética.",
      ],
    },
    { t: "campo", campo: "consecuencias_otras" },
    {
      t: "parrafo",
      texto:
        "Riesgos personalizados: además de los riesgos antes descriptos, por mis circunstancias especiales hay que esperar los siguientes riesgos y especificaciones de la no realización del tratamiento: {{riesgos_personalizados}}",
    },
    { t: "parrafo", texto: "Recomendaciones:" },
    {
      t: "lista",
      items: [
        "Los primeros días procure cerrar la boca y masticar con cuidado para no morderse y sobrecargar las encías.",
        "Inicialmente, mastique suavemente alimentos blandos y no pegajosos, pasando poco a poco a comer productos más consistentes.",
        "Concurrir con derivación al fonoaudiólogo en caso de ser necesario.",
        "Para tratar heridas de mordeduras puede utilizar cicatrizantes.",
      ],
    },
    { t: "parrafo", texto: "Indicaciones:" },
    {
      t: "lista",
      items: [
        "Lavar la prótesis y la boca después de cada comida, para evitar la formación de sarro.",
        "Quitarse la prótesis para dormir, para que los tejidos descansen.",
        "Mientras la prótesis esté fuera de la boca conviene conservarla en agua para evitar golpes y deformaciones.",
        "Es aconsejable que se dé masajes en las encías para mejorar la circulación y prevenir en lo posible su reabsorción.",
        "Se debe realizar revisión cada seis meses para observar el estado de los dientes y mucosas, realizar adaptaciones para corregir desajustes provocados por el cambio de forma de los maxilares y posición de los dientes que siempre ocurren con el paso del tiempo.",
        "Acudir a una consulta inmediata siempre que aparezcan heridas, llagas, dolor o inestabilidad de la prótesis.",
      ],
    },
    {
      t: "parrafo",
      texto:
        "He leído las instrucciones de manejo, cuidado y mantenimiento que me ha entregado el Dr/a. {{profesional_nombre}} y he comprendido todas las explicaciones que se me han facilitado en el lenguaje claro y sencillo, he podido realizar todas las observaciones y se me han aclarado todas las dudas; por lo que estoy completamente de acuerdo con lo consignado en esta fórmula de consentimiento.",
    },
    {
      t: "parrafo",
      texto:
        "Asimismo, entiendo que la colocación de la prótesis no constituye el acto final del tratamiento, sino que es necesario un proceso de adaptación que puede exigir retoques, por lo que me comprometo a regresar a la próxima consulta el día {{proxima_consulta_fecha}}, hora {{proxima_consulta_hora}}.",
    },
    {
      t: "parrafo",
      texto:
        "El/la que suscribe __________, DNI Nº __________, con domicilio en calle __________, otorgo mi consentimiento a la colocación de una prótesis dental completa en el/los maxilar/es {{maxilares}} propuesta por el/la Dr/a {{profesional_nombre}}, MP {{profesional_matricula}}.",
    },
    { t: "firmas" },
  ],
  firmas: [
    { rol: "paciente", etiqueta: "Firma del paciente o representante", requerida: true },
    { rol: "profesional", etiqueta: "Firma del profesional", requerida: true },
  ],
  // Carta (612 × 792 pt), dos páginas, en Times de 12 pt con renglones de
  // puntos (y uno de rayas largas, para el nombre del profesional en las
  // instrucciones). El material convenido y los riesgos personalizados
  // arrancan a mitad del renglón de su título y siguen en los de abajo
  // (`sangria`).
  lamina: {
    paginas: [
      { ancho: 612, alto: 792 },
      { ancho: 612, alto: 792 },
    ],
    zonas: [
      { id: "lugar_fecha", pagina: 1, x: 107, y: 77.1, ancho: 461, texto: "{{lugar}}, {{sistema.fecha}}" },
      { id: "material_convenido", pagina: 1, x: 40.5, y: 215.7, ancho: 526, sangria: 106.5, lineas: 3, interlineado: 20.55, texto: "{{material_convenido}}" },
      { id: "tratamiento_alternativo", pagina: 1, x: 40.5, y: 290.9, ancho: 525, lineas: 3, interlineado: 13.8, texto: "{{tratamiento_alternativo}}" },
      { id: "consecuencias_otras", pagina: 1, x: 40.5, y: 750.6, ancho: 464, texto: "{{consecuencias_otras}}" },
      { id: "riesgos_personalizados", pagina: 2, x: 41, y: 110.1, ancho: 461, sangria: 275, lineas: 5, interlineado: 12.63, texto: "{{riesgos_personalizados}}" },
      { id: "profesional_instrucciones", pagina: 2, x: 417, y: 487, ancho: 128, texto: "{{profesional_nombre}}" },
      { id: "proxima_consulta_dia", pagina: 2, x: 481.6, y: 544.5, ancho: 12.5, alinear: "centro", texto: "{{proxima_consulta_fecha:dia}}", vacio: "—" },
      { id: "proxima_consulta_mes", pagina: 2, x: 501.9, y: 544.5, ancho: 15, alinear: "centro", texto: "{{proxima_consulta_fecha:mes}}", vacio: "—" },
      {
        id: "proxima_consulta_anio_hora",
        pagina: 2,
        x: 40,
        y: 556.1,
        ancho: 42,
        texto: "{{proxima_consulta_fecha:anio}}, {{proxima_consulta_hora}}",
        // Sin la hora (o sin el día) dice "2026, No consigna": achicado entra en el tramo.
        minimo: 4.5,
        vacio: "—",
      },
      { id: "maxilares", pagina: 2, x: 40.5, y: 655.5, ancho: 221, texto: "{{maxilares}}" },
      { id: "profesional_matricula", pagina: 2, x: 387.5, y: 655.5, ancho: 142, texto: "{{profesional_matricula}}" },
    ],
    firmas: [
      { rol: "paciente", pagina: 2, x: 57.4, y: 704.4, ancho: 162.5, alto: 38 },
      { rol: "profesional", pagina: 2, x: 294.5, y: 704.4, ancho: 157.7, alto: 38 },
    ],
  },
};
