// Consentimiento informado de prótesis parcial removible — modelo oficial
// del Colegio Odontológico de la Provincia de Córdoba
// (Consentimiento-Informado-de-Protesis-Parcial-Removible.pdf).
//
// El texto es el del modelo, palabra por palabra; se tocó solo la
// ortografía ("más evidente", "típicos", "pérdida", "esté", "dé", un
// "inflación" que es "inflamación" y un "es probable que cambio de color"
// que es "cambie"). La próxima consulta del papel es "el día …. / ….. /
// ………….hora.": el día y el mes en sus huecos, y el año y la hora juntos en
// el último ("2026, 16:30 hora").
//
// Los datos de quien suscribe (nombre, DNI, domicilio) se completa a mano en la hoja impresa (pedido del cliente, 2026-09-29).
import type { Plantilla } from "../esquema";

export const consentimientoProtesisRemovible: Plantilla = {
  id: "consentimiento-protesis-removible",
  version: 1,
  nombre: "Prótesis parcial removible",
  tipo: "consentimiento",
  descripcion: "Consentimiento informado para una prótesis parcial removible, con sus limitaciones, riesgos, recomendaciones e indicaciones.",
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
        { tipo: "texto_largo", id: "tratamiento_alternativo", etiqueta: "Tratamiento alternativo (riesgo, beneficios, perjuicios)" },
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
    { t: "subtitulo", texto: "Prótesis parcial removible" },
    { t: "parrafo", texto: "Lugar y fecha: {{lugar}}, {{sistema.fecha}}." },
    {
      t: "parrafo",
      texto:
        "Usted tiene derecho a conocer el procedimiento al que va a ser sometido y las complicaciones más frecuentes que ocurren. Este documento intenta explicarle todas estas cuestiones, léalo atentamente y consulte todas las dudas que se le planteen. Le recordamos que por imperativo legal, tendrá que firmar usted o su representante legal, el consentimiento informado para que pueda realizarle el procedimiento descripto a continuación.",
    },
    {
      t: "parrafo",
      texto:
        "A propósito declaro haber sido informado y haber comprendido acabadamente que el objeto del tratamiento que es reponer dientes ausentes a través de aparatos portadores de dientes artificiales que se sujetan a los naturales mediante dispositivos no rígido (ganchos) y a veces se asientan sobre el hueso cubierto de mucosa.",
    },
    { t: "campo", campo: "material_convenido" },
    { t: "campo", campo: "tratamiento_alternativo" },
    {
      t: "parrafo",
      texto:
        "Aclaro que mi Odontólogo ha examinado mi boca debidamente. Que se me ha explicado otras alternativas a este tratamiento y que se ha estudiado y considerado estos métodos que se me informaron, siendo mi voluntad que se me realice el tratamiento objeto del presente consentimiento.",
    },
    {
      t: "parrafo",
      texto:
        "Limitaciones: al carecer de fijación mecánica al hueso, estos aparatos experimentan una cierta movilidad, más evidente al comer, sobre todo el inferior. Otra limitación es de carácter estético, debido a que según las indicaciones técnicas y mecánicas derivadas de la confección de prótesis removible en muchas ocasiones no será posible la reproducción de la posición de los dientes naturales. La duración de la prótesis removible es limitada por lo que deberá renovarse periódicamente.",
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
        "Algunas molestias (dolor, inflamación, ulceración) en las zonas donde apoyan las prótesis.",
        "Probablemente se muevan al comer, al menos inicialmente, por lo que deberá masticar de los dos lados.",
        "De no mantener una conducta de higiene y limpieza, es probable que cambie de color.",
      ],
    },
    { t: "parrafo", texto: "Consecuencia de la no realización del tratamiento:" },
    {
      t: "lista",
      items: [
        "Reabsorción ósea (pérdida del volumen del hueso de ambos maxilares).",
        "Problemas en la articulación de la mandíbula.",
        "Problemas en la digestión.",
        "Alteración en la pronunciación de las palabras y estética.",
        "Cambios en la mordida normal.",
        "Mayor movilidad de los dientes. Problemas de encía.",
        "Pérdida de los dientes presentes en boca.",
      ],
    },
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
        "Para tratar heridas de mordeduras puede utilizar cicatrizantes.",
      ],
    },
    { t: "parrafo", texto: "Indicaciones:" },
    {
      t: "lista",
      items: [
        "Lavar la prótesis y la boca después de cada comida, para evitar la formación de sarro.",
        "Limpie las partes metálicas con un hisopo embebido en alcohol, hasta que la superficie quede brillante.",
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
        "El/la que suscribe __________, DNI Nº __________, con domicilio en calle __________, otorgo mi consentimiento a la colocación de una prótesis dental parcial removible en el/los maxilar/es {{maxilares}} propuesta por el/la Dr/a {{profesional_nombre}}, MP {{profesional_matricula}}.",
    },
    { t: "firmas" },
  ],
  firmas: [
    { rol: "paciente", etiqueta: "Firma del paciente", requerida: true },
    { rol: "profesional", etiqueta: "Firma del profesional", requerida: true },
  ],
  // A4 (595 × 841,9 pt), dos páginas, en Times de 10 pt. El material, el
  // tratamiento alternativo y los riesgos personalizados arrancan a mitad
  // del renglón de su título y siguen en los de abajo (`sangria`). Las
  // firmas no tienen línea: van arriba de su leyenda.
  lamina: {
    paginas: [
      { ancho: 595, alto: 841.9 },
      { ancho: 595, alto: 841.9 },
    ],
    zonas: [
      { id: "lugar_fecha", pagina: 1, x: 141, y: 84.4, ancho: 363, texto: "{{lugar}}, {{sistema.fecha}}" },
      { id: "material_convenido", pagina: 1, x: 86, y: 210.9, ancho: 417, sangria: 82.5, lineas: 3, interlineado: 11.5, texto: "{{material_convenido}}" },
      { id: "tratamiento_alternativo", pagina: 1, x: 86, y: 257, ancho: 418, sangria: 226.5, lineas: 4, interlineado: 11.47, texto: "{{tratamiento_alternativo}}" },
      { id: "riesgos_personalizados", pagina: 2, x: 86, y: 118.9, ancho: 418, sangria: 45.5, lineas: 4, interlineado: 11.47, texto: "{{riesgos_personalizados}}" },
      { id: "profesional_instrucciones", pagina: 2, x: 86, y: 487.3, ancho: 180, texto: "{{profesional_nombre}}" },
      { id: "proxima_consulta_dia", pagina: 2, x: 190.6, y: 555.8, ancho: 12.4, alinear: "centro", texto: "{{proxima_consulta_fecha:dia}}", vacio: "—" },
      { id: "proxima_consulta_mes", pagina: 2, x: 210.9, y: 555.8, ancho: 15, alinear: "centro", texto: "{{proxima_consulta_fecha:mes}}", vacio: "—" },
      {
        id: "proxima_consulta_anio_hora",
        pagina: 2,
        x: 233.7,
        y: 555.8,
        ancho: 42.3,
        texto: "{{proxima_consulta_fecha:anio}}, {{proxima_consulta_hora}}",
        // Sin la hora (o sin el día) dice "2026, No consigna": achicado entra en el tramo.
        minimo: 4.5,
        vacio: "—",
      },
      { id: "maxilares", pagina: 2, x: 86, y: 647.9, ancho: 181, texto: "{{maxilares}}" },
      { id: "profesional_matricula", pagina: 2, x: 380, y: 647.9, ancho: 119, texto: "{{profesional_matricula}}" },
    ],
    firmas: [
      { rol: "paciente", pagina: 2, x: 91, y: 718, ancho: 150, alto: 38 },
      { rol: "profesional", pagina: 2, x: 367, y: 718, ancho: 150, alto: 38 },
    ],
  },
};
