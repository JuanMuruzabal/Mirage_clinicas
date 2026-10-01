// Consentimiento informado de ortodoncia — modelo oficial del Colegio
// Odontológico de la Provincia de Córdoba. Viene adentro de la historia
// clínica de ortodoncia (Historia-Clinica-para-Modulo-de-Ortodoncia.pdf,
// páginas 5 y 6) y se separa como un documento propio.
//
// El texto es el del modelo, palabra por palabra; se tocó solo la
// ortografía ("más", "úlceras", "dientes ó muelas" → "o",
// "temporomandibular"). Los datos de quien suscribe ("Sr/Sra … con DNI Nº
// …"), el asentimiento del menor ("sí quiero / no quiero atenderme") y la
// aclaración y el DNI de la firma: todo eso se completa a mano en la hoja impresa (pedido del cliente, 2026-09-29).
import type { Plantilla } from "../esquema";

export const consentimientoOrtodoncia: Plantilla = {
  id: "consentimiento-ortodoncia",
  version: 1,
  nombre: "Ortodoncia",
  tipo: "consentimiento",
  descripcion:
    "Consentimiento informado para el tratamiento de ortodoncia u ortopedia, con sus riesgos, recomendaciones, el tiempo estimado y el asentimiento del paciente menor.",
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
        { tipo: "texto", id: "matricula_de", etiqueta: "M.P. de", requerido: true, precarga: "clinica.ciudad", ayuda: "Dónde es la matrícula (\"de Córdoba\")." },
      ],
    },
    {
      id: "tratamiento",
      titulo: "Tratamiento",
      campos: [
        {
          tipo: "texto_largo",
          id: "observaciones",
          etiqueta: "Observaciones, procedimientos alternativos, riesgo y beneficio",
        },
        { tipo: "texto_largo", id: "consecuencias_abandono", etiqueta: "Consecuencias de la no realización o abandono" },
        { tipo: "texto", id: "tiempo_estimado", etiqueta: "Tiempo estimado", requerido: true },
      ],
    },
  ],
  cuerpo: [
    { t: "titulo", texto: "Consentimiento informado" },
    { t: "subtitulo", texto: "Ortodoncia" },
    { t: "parrafo", texto: "Lugar y fecha: {{lugar}}, {{sistema.fecha}}." },
    {
      t: "parrafo",
      texto:
        "Usted tiene derecho a conocer el procedimiento al que va a ser sometido y las complicaciones más frecuentes que ocurren. Este documento intenta explicarle todas estas cuestiones, léalo atentamente y consulte todas las dudas que se le planteen. Le recordamos que por imperativo legal, tendrá que firmar, usted o su representante legal, el consentimiento informado para que pueda realizarse dicho procedimiento. A propósito declaro haber sido informado y haber comprendido acabadamente el objetivo del tratamiento de ortodoncia u ortopedia y la aparatología a utilizar.",
    },
    {
      t: "parrafo",
      texto:
        "Sr/Sra __________ con DNI Nº __________ como paciente (en caso de menores o incapacitados consignar nombre y DNI del padre, madre o tutor) ha sido informado/a por el Dr. / Dra. {{profesional_nombre}}, M.P. {{profesional_matricula}} de {{matricula_de}} sobre los procedimientos propios clínicos de ortodoncia y ortopedia, que constan en el plan de tratamiento otorgando mi consentimiento para realizar las prácticas necesarias al caso clínico.",
    },
    { t: "parrafo", texto: "El/la paciente ha sido informado/a y conoce los riesgos que puede comportar este tratamiento:" },
    {
      t: "lista",
      items: [
        "Al colocar la ortodoncia puede generar en los dientes una leve reacción inflamatoria, provocando dolor temporario, que va disminuyendo progresivamente.",
        "Si los brackets no se tratan con cuidado pueden romperse o despegarse, en cuyo caso el tratamiento sufrirá un retraso y el paciente deberá hacerse cargo de los gastos ocasionados.",
        "Se pueden producir úlceras o llagas, etc. (lesiones de tejidos blandos).",
        "Mayor sensibilidad en los dientes o muelas sobre los que se apoya el aparato que desaparece normalmente de modo espontáneo.",
        "Riesgo de alergia a los materiales empleados que podría provocar su retirada y un eventual cambio en el plan de tratamiento, con posibles modificaciones de los costos, a cargo del paciente.",
        "Riesgo de que una deficiente higiene facilite la aparición de manchas blancas permanentes (descalcificaciones), caries dental o gingivitis (encías inflamadas). Se me ha explicado con toda claridad que durante el tratamiento debo de extremar las medidas higiénicas y evitar la ingesta frecuente de productos muy azucarados.",
        "Riesgo de que el desarrollo imprevisible de la erupción dentaria, el crecimiento de los maxilares o de respuesta de dientes o hueso a las fuerzas ortodóncicas obliguen a cambiar el plan de tratamiento, requiriendo en ocasiones extracciones de dientes definitivos para conseguir espacio y el alargamiento del tiempo de tratamiento.",
        "Algunos pacientes son más susceptibles a que se produzca la reabsorción (acortamiento) de la raíz de uno o varios dientes y/o muelas sometidos a fuerzas ortodóncicas. Este fenómeno es infrecuente, de etiología desconocida pero imprevisible. Habitualmente esto no tiene consecuencias apreciables, pero en ocasiones puede afectar la longevidad del diente e implicaría alterar el plan de tratamiento.",
        "Riesgo de molestias o dolor en la articulación temporomandibular debido a la modificación de la mordida. Estos problemas pueden ocurrir con o sin tratamiento de ortodoncia y en gral. son debidos a factores previos predisponentes (hiperlaxitud ligamentosa, traumatismos previos, artrosis, artritis, bruxismo, stress, etc.) y malos hábitos.",
        "Riesgo de retracciones de la encía, no previsibles, debidas al efecto de los movimientos dentarios. También pueden aparecer agrandadas como consecuencia de la placa bacteriana.",
        "Los dientes incluidos tienen un tratamiento más complejo y sus resultados no se pueden asegurar. Existe la posibilidad que el diente incluido dañe la raíz de los dientes vecinos hasta en ocasiones, provocar su pérdida. En ocasiones el tratamiento falla por anquilosis dental (se pega el diente al hueso y no se puede mover) que es imposible diagnosticar previo al tratamiento y que conllevaría la necesidad de extraerlo y reponerlo (estas actuaciones corresponderían a su dentista).",
        "Existen riesgos que se produzcan modificaciones en los resultados conseguidos al finalizar el tratamiento; estos factores son difícilmente predecibles pero pueden ser paliados siguiendo las indicaciones dadas por el profesional, respecto a la utilización de contenedores y a los controles periódicos una vez terminado el tratamiento.",
      ],
    },
    { t: "parrafo", texto: "Recomendaciones:" },
    {
      t: "lista",
      items: [
        "Evite comer alimentos duros o comer a mordiscos una manzana, zanahoria, choclo, etc.",
        "Prohibido comer chicle, caramelos pegajosos, turrones, etc.",
        "Se aconseja beber zumos de naranja y comer abundante fruta, así como aportes de vitamina D para facilitar el movimiento dental.",
        "No morder lapicera u otros cuerpos extraños (a la boca).",
      ],
    },
    { t: "parrafo", texto: "Indicaciones:" },
    {
      t: "lista",
      items: [
        "Extremar las medidas de higiene de la boca, los dientes y el aparato para evitar mayor exposición a las caries y a la enfermedad de las encías.",
        "Concurrir a cada una de las consultas para que el profesional realice las revisiones necesarias a los fines de evitar retraso del tratamiento.",
      ],
    },
    { t: "campo", campo: "observaciones" },
    { t: "campo", campo: "consecuencias_abandono" },
    { t: "parrafo", texto: "Tiempo estimado: {{tiempo_estimado}} (pudiendo superar éste según evolución del caso clínico)." },
    {
      t: "parrafo",
      texto:
        "He leído las instrucciones de manejo, cuidado y mantenimiento que me ha entregado el Dr./a {{profesional_nombre}}, y he comprendido todas las explicaciones que se me han facilitado en lenguaje claro y sencillo, he podido realizar todas las observaciones y se me han aclarado todas las dudas; por lo que estoy completamente de acuerdo con lo consignado en esta fórmula de consentimiento. La ortodoncia no es una ciencia exacta y, por ello ningún ortodoncista puede garantizar el éxito ni un resultado específico.",
    },
    {
      t: "parrafo",
      texto:
        "Asimismo, entiendo que la colocación del aparato no constituye el acto final del tratamiento, sino que es necesario un proceso de contención, por lo que me comprometo a regresar a la consulta odontológica cada vez que el profesional lo requiera.",
    },
    { t: "parrafo", texto: "Asentimiento: PIDO LO QUE QUIERO. SI QUIERO ATENDERME ☐ NO QUIERO ATENDERME ☐" },
    { t: "firmas" },
  ],
  firmas: [
    { rol: "paciente", etiqueta: "Firma del paciente o responsable", requerida: true },
    { rol: "profesional", etiqueta: "Firma y sello del profesional", requerida: true },
  ],
  // A4 (595,3 × 841,9 pt), las páginas 5 y 6 del modelo de la historia de
  // ortodoncia, en Arial Narrow de 12 pt. Las observaciones arrancan en el
  // renglón de su título (`sangria`); las consecuencias, en los renglones
  // de abajo del suyo, que ocupa todo el ancho. El nombre del profesional de
  // las instrucciones va en el tramo largo del renglón de abajo.
  lamina: {
    paginas: [
      { ancho: 595.3, alto: 841.9 },
      { ancho: 595.3, alto: 841.9 },
    ],
    zonas: [
      { id: "lugar_fecha", pagina: 1, x: 103, y: 95.4, ancho: 302, texto: "{{lugar}}, {{sistema.fecha}}" },
      { id: "profesional_nombre", pagina: 1, x: 160.5, y: 246.9, ancho: 291, texto: "{{profesional_nombre}}" },
      { id: "profesional_matricula", pagina: 1, x: 470.5, y: 246.9, ancho: 81, texto: "{{profesional_matricula}}" },
      { id: "matricula_de", pagina: 1, x: 57, y: 262.1, ancho: 125, texto: "{{matricula_de}}" },
      { id: "observaciones", pagina: 2, x: 43.5, y: 283.1, ancho: 500, sangria: 411.5, lineas: 3, interlineado: 17.9, texto: "{{observaciones}}" },
      { id: "consecuencias_abandono", pagina: 2, x: 43.5, y: 354.7, ancho: 500, lineas: 2, interlineado: 17.8, texto: "{{consecuencias_abandono}}" },
      { id: "tiempo_estimado", pagina: 2, x: 124.5, y: 390.5, ancho: 176, texto: "{{tiempo_estimado}}" },
      { id: "profesional_instrucciones", pagina: 2, x: 43.5, y: 444.2, ancho: 230, texto: "{{profesional_nombre}}" },
    ],
    firmas: [
      { rol: "paciente", pagina: 2, x: 39.7, y: 794.4, ancho: 160, alto: 38 },
      { rol: "profesional", pagina: 2, x: 430.8, y: 794.4, ancho: 119.6, alto: 38 },
    ],
  },
};
