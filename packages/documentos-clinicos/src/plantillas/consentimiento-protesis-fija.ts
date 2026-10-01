// Consentimiento informado de prótesis fija — modelo oficial del Colegio
// Odontológico de la Provincia de Córdoba
// (Consentimiento-Informado-de-Protesis-Fija.pdf).
//
// El texto es el del modelo, palabra por palabra; se tocó solo la
// ortografía ("pérdida", "extremadamente", un "mi circunstancias" que es
// "mis", un "aditamentos aditamientos" repetido y "o llamad o de
// conduccto"). La próxima consulta del papel es "el día …. / ….. /
// ………….hora.": el día y el mes en sus huecos, y el año y la hora juntos
// en el último ("2026, 16:30 hora").
//
// Los datos de quien suscribe (nombre, DNI, domicilio) se completa a mano en la hoja impresa (pedido del cliente, 2026-09-29).
import type { Plantilla } from "../esquema";

export const consentimientoProtesisFija: Plantilla = {
  id: "consentimiento-protesis-fija",
  version: 1,
  nombre: "Prótesis fija",
  tipo: "consentimiento",
  descripcion: "Consentimiento informado para una prótesis fija (coronas), con los riesgos, el material y las recomendaciones.",
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
        { tipo: "texto_largo", id: "tratamiento_alternativo", etiqueta: "Tratamiento alternativo (riesgo, beneficios y perjuicios)" },
        { tipo: "texto_largo", id: "material_convenido", etiqueta: "Material convenido", requerido: true },
        { tipo: "texto_largo", id: "riesgos_personalizados", etiqueta: "Riesgos personalizados" },
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
      titulo: "Elementos y profesional",
      campos: [
        { tipo: "piezas", id: "elementos", etiqueta: "Elemento(s)", requerido: true, denticion: "permanente" },
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
    { t: "subtitulo", texto: "Prótesis fija" },
    { t: "parrafo", texto: "Lugar y fecha: {{lugar}}, {{sistema.fecha}}." },
    {
      t: "parrafo",
      texto:
        "Usted tiene derecho a conocer el procedimiento al que va a ser sometido y las complicaciones más frecuentes que ocurren. Este documento intenta explicarle todas estas cuestiones, léalo atentamente y consulte todas las dudas que se le planteen. Le recordamos que por imperativo legal, tendrá que firmar, usted o su representante legal, el consentimiento informado para que pueda realizarle el procedimiento descripto a continuación.",
    },
    {
      t: "parrafo",
      texto:
        "A propósito declaro haber sido informado y haber comprendido acabadamente que el objeto del tratamiento, es devolver la función, estética y fonética de la cavidad bucal a través de coronas (fundas) de diferentes materiales pudiendo o no necesitar colocar algunos aditamentos, como ser pernos (que se coloca en el interior del conducto del diente el cual previamente recibió el tratamiento de conducto correspondiente), o implantes (reemplazo de las raíces naturales), etc. cuyo destino es darle retención a la prótesis fija formada por las coronas.",
    },
    {
      t: "parrafo",
      texto:
        "La prótesis fija proporciona una masticación similar a la natural y un habla adecuada aunque no permite cerrar los espacios que pudieran haberse creado entre los dientes cuando han menguado las encías y al hablar se puede escapar saliva o aire; con el tiempo, el proceso de atrofia natural de los huesos maxilares y de las encías deja a la vista las uniones entre dientes y fundas, por lo que estéticamente puede necesitar reemplazo; otras causas de sustitución pueden ser: lesiones irrecuperables (caries, fracturas, filtraciones marginales, cambios en los maxilares y en la posición de los dientes naturales), procesos inexorables del paso del tiempo (envejecimiento) y que se ven agravados por descuidos y falta de higiene por parte del portador.",
    },
    {
      t: "parrafo",
      texto:
        "Para realizar un tratamiento de prótesis dental se me ha explicado la necesidad de tallar los dientes pilares de la prótesis fija, lo que puede conllevar la posibilidad de aproximación excesiva a la cámara pulpar (nervio) que nos obligaría a realizar un tratamiento de endodoncia (o llamado de conducto) y en algunos casos si el muñón (remanente de la corona) queda frágil, se necesitará realizar un perno de fibra o colado (metálico). También se me ha explicado la necesidad de mantener una higiene escrupulosa y diaria para evitar el desarrollo de gingivitis y secundariamente enfermedad periodontal (que se manifiestan con inflamación de las encías, sangrado y a veces dolor).",
    },
    {
      t: "parrafo",
      texto:
        "Se me ha aclarado que existe la posibilidad de fractura de cualquier componente de la prótesis, que implique la reparación, cambio total de la misma e incluso la pérdida de la pieza dentaria pilar (donde asienta la prótesis fija).",
    },
    { t: "campo", campo: "tratamiento_alternativo" },
    { t: "campo", campo: "material_convenido" },
    { t: "parrafo", texto: "Riesgos:" },
    {
      t: "lista",
      items: [
        "Sensación de que los dientes artificiales son demasiado grandes o con diferencia en tamaño, forma y color con los naturales.",
        "La pronunciación de ciertos sonidos puede resultar un poco alterada.",
        "Es probable que se muerda fácilmente las mejillas y la lengua.",
        "Si se le ha cementado la prótesis provisionalmente: se le puede desprender o puede notar ligeras molestias en los dientes que sirven de sujeción, al consumir o ingerir bebidas o alimentos fríos, calientes y dulces.",
      ],
    },
    {
      t: "parrafo",
      texto:
        "Además de los riesgos antes descriptos, por mis circunstancias especiales hay que esperar los siguientes riesgos: {{riesgos_personalizados}}",
    },
    {
      t: "lista",
      items: [
        "Los primeros días, procure cerrar la boca y masticar con cuidado para no morderse.",
        "Evite comer alimentos duros como frutos secos con cáscara, huesos, etc.",
        "Evite comer alimentos extremadamente pegajosos como chicles, caramelos masticables, etc.",
        "Si se le ha cementado la prótesis provisionalmente, es recomendable masticar del otro lado, hacer una dieta semi blanda, prestar atención a la retención de alimentos entre prótesis y los dientes de al lado o la encía y advierta al dentista, antes de cementarla definitivamente.",
        "Es importante mantener una correcta higiene oral en el resto de los dientes, independientemente de la prótesis.",
        "Se debe realizar revisión cada seis meses para comprobar y corregir la aparición de caries, inflamación de encías, movilidades dentarias y el estado y ajuste de la prótesis. Acudir a una consulta inmediata siempre que aparezcan ulceraciones, alguna anormalidad o movilidad de la prótesis.",
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
        "El/la que suscribe __________, DNI Nº __________, con domicilio en calle __________, otorgo mi consentimiento a la colocación de una prótesis fija en los elemento/s {{elementos}} propuesta por el/la Dr/a {{profesional_nombre}}, MP {{profesional_matricula}}.",
    },
    { t: "firmas" },
  ],
  firmas: [
    { rol: "paciente", etiqueta: "Firma del paciente o representante", requerida: true },
    { rol: "profesional", etiqueta: "Firma del profesional", requerida: true },
  ],
  // Carta (612 × 792 pt), dos páginas, en Times de 10 pt. El nombre del
  // profesional de las instrucciones va en el renglón de rayas largas que
  // sigue a "Dr/a." (el tramo largo, el de abajo).
  lamina: {
    paginas: [
      { ancho: 612, alto: 792 },
      { ancho: 612, alto: 792 },
    ],
    zonas: [
      { id: "lugar_fecha", pagina: 1, x: 141.5, y: 101.7, ancho: 293, texto: "{{lugar}}, {{sistema.fecha}}" },
      { id: "tratamiento_alternativo", pagina: 1, x: 86, y: 469.6, ancho: 438, lineas: 3, interlineado: 11.55, texto: "{{tratamiento_alternativo}}" },
      { id: "material_convenido", pagina: 1, x: 86, y: 515.7, ancho: 438, sangria: 80.5, lineas: 3, interlineado: 11.45, texto: "{{material_convenido}}" },
      { id: "riesgos_personalizados", pagina: 2, x: 86, y: 101.7, ancho: 438, lineas: 3, interlineado: 11.5, texto: "{{riesgos_personalizados}}" },
      { id: "profesional_instrucciones", pagina: 2, x: 86, y: 308.7, ancho: 158, texto: "{{profesional_nombre}}" },
      { id: "proxima_consulta_dia", pagina: 2, x: 181, y: 366.2, ancho: 12.5, alinear: "centro", texto: "{{proxima_consulta_fecha:dia}}", vacio: "—" },
      { id: "proxima_consulta_mes", pagina: 2, x: 201.4, y: 366.2, ancho: 15, alinear: "centro", texto: "{{proxima_consulta_fecha:mes}}", vacio: "—" },
      {
        id: "proxima_consulta_anio_hora",
        pagina: 2,
        x: 224.1,
        y: 366.2,
        ancho: 42.3,
        texto: "{{proxima_consulta_fecha:anio}}, {{proxima_consulta_hora}}",
        // Sin la hora (o sin el día) dice "2026, No consigna": achicado entra en el tramo.
        minimo: 4.5,
        vacio: "—",
      },
      { id: "elementos", pagina: 2, x: 462.5, y: 446.7, ancho: 64, texto: "{{elementos}}" },
      { id: "profesional_matricula", pagina: 2, x: 197.5, y: 458.2, ancho: 68, texto: "{{profesional_matricula}}" },
    ],
    firmas: [
      { rol: "paciente", pagina: 2, x: 85.1, y: 550, ancho: 162.3, alto: 38 },
      { rol: "profesional", pagina: 2, x: 299.8, y: 550, ancho: 157.1, alto: 38 },
    ],
  },
};
