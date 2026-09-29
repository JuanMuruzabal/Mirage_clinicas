// Consentimiento informado de implantes — modelo oficial del Colegio
// Odontológico de la Provincia de Córdoba
// (Consentimiento-Informado-de-Implantes.pdf).
//
// El texto es el del modelo, palabra por palabra; se tocó solo la
// ortografía ("drogas ó materiales" → "o", "témporomandibular"). El modelo
// trae cinco renglones sin título al final de la primera página: son para
// lo que el profesional quiera aclarar.
import type { Plantilla } from "../esquema";

export const consentimientoImplantes: Plantilla = {
  id: "consentimiento-implantes",
  version: 1,
  nombre: "Implantes",
  tipo: "consentimiento",
  descripcion: "Consentimiento informado para la cirugía de implantes, con los riesgos, las alternativas y los cuidados.",
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
      id: "firmante",
      titulo: "Quién suscribe",
      campos: [
        {
          tipo: "texto",
          id: "suscribe_nombre",
          etiqueta: "Nombre y apellido",
          requerido: true,
          precarga: "paciente.nombreCompleto",
          ayuda: "Si firma un representante (por ejemplo, el padre o la madre de un menor), poné sus datos.",
        },
        // Sin unidad: el papel ya dice "años de edad" después del hueco.
        { tipo: "numero", id: "suscribe_edad", etiqueta: "Edad (años)", requerido: true, min: 0, max: 120 },
        { tipo: "texto", id: "suscribe_dni", etiqueta: "DNI", requerido: true, precarga: "paciente.dni" },
        { tipo: "texto", id: "suscribe_domicilio", etiqueta: "Domicilio", requerido: true, precarga: "paciente.domicilio" },
      ],
    },
    {
      id: "profesional",
      titulo: "Profesional",
      campos: [
        {
          tipo: "texto",
          id: "profesional_nombre",
          etiqueta: "Profesional que informa",
          requerido: true,
          precarga: "profesional.nombreCompleto",
          bloqueado: true,
        },
        { tipo: "texto", id: "profesional_matricula", etiqueta: "M.P.", requerido: true, precarga: "profesional.matricula", bloqueado: true },
      ],
    },
    {
      id: "aclaraciones",
      titulo: "Aclaraciones",
      campos: [
        {
          tipo: "texto_largo",
          id: "aclaraciones",
          etiqueta: "Aclaraciones",
          ayuda: "Los renglones libres del modelo, después de los problemas de no hacer el tratamiento.",
        },
      ],
    },
    {
      id: "alternativo",
      titulo: "Tratamiento alternativo",
      campos: [
        {
          tipo: "texto_largo",
          id: "tratamiento_alternativo",
          etiqueta: "Especificación de tratamiento alternativo (riesgos, beneficios y perjuicios)",
        },
      ],
    },
  ],
  cuerpo: [
    { t: "titulo", texto: "Consentimiento informado" },
    { t: "subtitulo", texto: "Implantes" },
    { t: "parrafo", texto: "Lugar y fecha: {{lugar}}, {{sistema.fecha}}." },
    {
      t: "parrafo",
      texto:
        "Por la presente se hace saber a Usted que tiene derecho a conocer el procedimiento al que va a ser sometido y las complicaciones más frecuentes que ocurren. Este documento explica todas estas cuestiones, léalo atentamente y consulte todas las dudas que se le planteen. Le recordamos que por imperativo legal, tendrá que firmar el consentimiento informado para que pueda realizarse dicho procedimiento. A propósito declaro haber sido informado y haber comprendido acabadamente el objetivo del tratamiento a realizar.",
    },
    {
      t: "parrafo",
      texto:
        "Yo, {{suscribe_nombre}}, de {{suscribe_edad}} años de edad, DNI {{suscribe_dni}}, domiciliado en {{suscribe_domicilio}}, he sido informado/a por el Dr. / Dra. {{profesional_nombre}}, M.P. {{profesional_matricula}}, de los procedimientos propios clínicos. Declaro que he sido debidamente informado y comprendo el objetivo y la naturaleza de la cirugía con implantes. Se me ha explicado y consiento en emplear un procedimiento quirúrgico para colocar los implantes por debajo de la encía y dentro del hueso, con el objetivo de reponer dientes con estabilidad similar o incluso superior a la de los naturales perdidos, obtener un anclaje para las prótesis dentales móviles, conseguir que el hueso de los maxilares mantenga su función y no pierda volumen por reabsorción, siendo de mi absoluta responsabilidad obedecer, cumpliendo los controles indicados por el profesional.",
    },
    {
      t: "parrafo",
      texto:
        "Declaro que mi odontólogo ha examinado mi boca debidamente. Que se me ha explicado otras alternativas a este tratamiento, con prótesis convencionales (fijas y removibles), incluso de menor costo, y que se ha estudiado y considerado estos métodos que se me informaron, siendo mi voluntad que me coloquen implantes para reemplazar las piezas que he perdido o deseo sustituir.",
    },
    {
      t: "parrafo",
      texto:
        "Declaro, además, que he sido informado de los riesgos y complicaciones posibles involucradas con el procedimiento quirúrgico, medicación y anestesia. Tales complicaciones incluyen: dolor, inflamación, infección y decoloraciones. Que puedo sufrir una insensibilidad de: labios, lengua, barbilla, mejillas y dientes. Que no existe tiempo exacto que durará esta sensación en caso de complicación, que no puede ser determinado y quizás sea irreversible según los casos y seriedad del problema. Que puede surgir también, inflamación o daño del tejido de la zona (diente, hueso, mucosa), fractura ósea, penetración en el seno maxilar y piso de fosas nasales, cicatrización retardada, reacciones alérgicas a medicación, drogas o materiales empleados en la técnica quirúrgica, falla en la óseo-integración del implante que obligará a un re-tratamiento.",
    },
    {
      t: "parrafo",
      texto:
        "Comprendo y entiendo que si no se me realiza un tratamiento odontológico, podría sufrir cualquiera de los siguientes problemas: enfermedad ósea, inflamación de las encías, infección, sensibilidad, movilidad de los dientes seguida por la necesidad de realizar la extracción. También es posible que pueda sufrir problemas de la unión temporomandibular (mandíbula), dolores de cabeza, dolores en la parte posterior del cuello y músculos faciales y cansancio de los músculos al masticar.",
    },
    { t: "campo", campo: "aclaraciones" },
    {
      t: "parrafo",
      texto:
        "Declaro que se me ha explicado que no existe un método que pueda predecir con certeza la capacidad de cicatrización del hueso, de las encías y que es diferente en cada paciente, tras la colocación de implantes. Declaro que se me ha explicado que en algunos casos los implantes pueden fallar y deben ser retirados. Que se me ha informado y entiendo, que las prácticas odontológicas no son una ciencia exacta: por lo tanto no se puede ofrecer garantías o seguridades sobre el resultado final del tratamiento o cirugía.",
    },
    {
      t: "parrafo",
      texto:
        "Declaro que se me ha informado de la inconveniencia de fumar, de beber alcohol o tomar demasiada azúcar, para la cicatrización de las encías y tales hábitos ponen en compromiso el éxito del implante. Estoy plenamente de acuerdo con las instrucciones que me ha dado el odontólogo sobre el cuidado que debo realizar yo personalmente, en relación a la higiene de mi boca y he comprendido la manera de hacerlo. Me comprometo a acudir a la consulta de mi odontólogo con el fin de ser examinado e instruido, tal como él me lo indique.",
    },
    {
      t: "parrafo",
      texto:
        "Estoy de acuerdo con ser sometido a anestesia local, sabiendo los riesgos que ello implica, delegando al odontólogo la elección del tipo de anestesia. Entiendo perfectamente que, durante y a continuación del procedimiento previsto, cirugía o tratamiento, pueden surgir condiciones que, según el criterio del profesional requiera un plan de tratamiento complementario/alternativo, relacionado directamente con el éxito del tratamiento. También apruebo cualquier modificación en diseño, materiales o mantenimiento, si se considera que es para mi beneficio.",
    },
    { t: "campo", campo: "tratamiento_alternativo" },
    {
      t: "parrafo",
      texto:
        "Declaro que he sido informado que las complicaciones de oseointegración referidas a la colocación de implantes y de los riesgos de someterlos a movilidad posterior a su inserción y que se deberán respetar los controles odontológicos posteriores, extremándose en caso de existir prótesis. Me comprometo a tomar todos los cuidados y recaudos necesarios; a cumplir con la medicación estipulada, sin incorporar modificación alguna; asistir a los controles estipulados y a informar de inmediato al odontólogo responsable cualquier sintomatología que aparezca, a fin de tratarla precozmente.",
    },
    {
      t: "parrafo",
      texto:
        "Confirmo que he leído y comprendido todo el escrito precedente y que el facultativo y su equipo me han explicado todo el acto quirúrgico y me han permitido realizar todas las preguntas necesarias, dándome respuestas a mis inquietudes, en un lenguaje claro y sencillo.",
    },
    { t: "firmas" },
  ],
  firmas: [
    { rol: "paciente", etiqueta: "Firma del paciente o representante", requerida: true },
    { rol: "profesional", etiqueta: "Firma y sello del profesional", requerida: true },
  ],
  // A4 (595,3 × 841,9 pt), dos páginas, en Calibri de 11 pt con renglones
  // de puntos cada 20 pt. La especificación del tratamiento alternativo
  // arranca a mitad del renglón de su título y sigue en los tres de abajo
  // (`sangria`).
  lamina: {
    paginas: [
      { ancho: 595.3, alto: 841.9 },
      { ancho: 595.3, alto: 841.9 },
    ],
    zonas: [
      { id: "lugar_fecha", pagina: 1, x: 111, y: 92.4, ancho: 431, texto: "{{lugar}}, {{sistema.fecha}}" },
      { id: "suscribe_nombre", pagina: 1, x: 68, y: 220.5, ancho: 264, texto: "{{suscribe_nombre}}" },
      { id: "suscribe_edad", pagina: 1, x: 344.5, y: 220.5, ancho: 25, alinear: "centro", texto: "{{suscribe_edad}}" },
      { id: "suscribe_dni", pagina: 1, x: 452, y: 220.5, ancho: 88, texto: "{{suscribe_dni}}" },
      { id: "suscribe_domicilio", pagina: 1, x: 118.5, y: 237.3, ancho: 420, texto: "{{suscribe_domicilio}}" },
      { id: "profesional_nombre", pagina: 1, x: 215, y: 254.1, ancho: 162, texto: "{{profesional_nombre}}" },
      { id: "profesional_matricula", pagina: 1, x: 396, y: 254.1, ancho: 48, texto: "{{profesional_matricula}}" },
      { id: "aclaraciones", pagina: 1, x: 52, y: 657, ancho: 490, lineas: 5, interlineado: 20.12, texto: "{{aclaraciones}}" },
      { id: "tratamiento_alternativo", pagina: 2, x: 52, y: 372.4, ancho: 490, sangria: 341.5, lineas: 4, interlineado: 20.17, texto: "{{tratamiento_alternativo}}" },
    ],
    firmas: [
      { rol: "paciente", pagina: 2, x: 93.4, y: 746, ancho: 159.4, alto: 38 },
      { rol: "profesional", pagina: 2, x: 347.4, y: 746, ancho: 152.8, alto: 38 },
    ],
  },
};
