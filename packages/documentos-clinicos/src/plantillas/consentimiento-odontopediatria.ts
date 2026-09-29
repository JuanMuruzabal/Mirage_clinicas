// Consentimiento informado de odontopediatría — modelo oficial del Colegio
// Odontológico de la Provincia de Córdoba
// (Consentimiento-Informado-de-Odontopediatría.pdf).
//
// El texto es el del modelo, palabra por palabra; se tocó solo la
// ortografía ("dio"). Lo firma el representante legal del menor, que se
// identifica con sus datos; el menor da su asentimiento con dos casillas
// ("sí quiero atenderme" / "no quiero atenderme", Fase 5.2) y su firma.
import type { Plantilla } from "../esquema";

export const consentimientoOdontopediatria: Plantilla = {
  id: "consentimiento-odontopediatria",
  version: 1,
  nombre: "Odontopediatría",
  tipo: "consentimiento",
  descripcion:
    "Consentimiento informado para el tratamiento odontológico de un menor, que firma su representante legal, con el asentimiento del menor.",
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
      id: "representante",
      titulo: "Representante legal",
      campos: [
        { tipo: "texto", id: "representante_nombre", etiqueta: "Nombre y apellido", requerido: true, ayuda: "Va también como aclaración de la firma." },
        { tipo: "numero", id: "representante_edad", etiqueta: "Edad (años)", requerido: true, min: 0, max: 120 },
        { tipo: "texto", id: "representante_dni", etiqueta: "DNI", requerido: true },
        { tipo: "texto", id: "representante_domicilio", etiqueta: "Domicilio", requerido: true, precarga: "paciente.domicilio" },
      ],
    },
    {
      id: "menor",
      titulo: "Paciente (menor de edad)",
      campos: [
        { tipo: "texto", id: "menor_nombre", etiqueta: "Nombre y apellido", requerido: true, precarga: "paciente.nombreCompleto" },
        { tipo: "texto", id: "menor_dni", etiqueta: "DNI", requerido: true, precarga: "paciente.dni" },
      ],
    },
    {
      id: "profesional",
      titulo: "Profesional",
      campos: [
        {
          tipo: "texto",
          id: "profesional_nombre",
          etiqueta: "Profesional",
          requerido: true,
          precarga: "profesional.nombreCompleto",
          bloqueado: true,
        },
        { tipo: "texto", id: "profesional_matricula", etiqueta: "M.P.", requerido: true, precarga: "profesional.matricula", bloqueado: true },
      ],
    },
    {
      id: "tratamiento",
      titulo: "Diagnóstico y tratamiento",
      campos: [
        { tipo: "texto_largo", id: "diagnostico", etiqueta: "Diagnóstico", requerido: true },
        { tipo: "texto_largo", id: "tratamiento", etiqueta: "Tratamiento al que va a ser sometido el menor", requerido: true },
        { tipo: "texto_largo", id: "tratamientos_alternativos", etiqueta: "Tratamientos alternativos" },
        { tipo: "texto_largo", id: "riesgos_otros", etiqueta: "Otros riesgos y complicaciones esperados" },
        { tipo: "texto_largo", id: "beneficios", etiqueta: "Beneficios esperados del tratamiento" },
        { tipo: "texto_largo", id: "consecuencias", etiqueta: "Consecuencias de la no realización del tratamiento" },
        { tipo: "texto_largo", id: "observaciones", etiqueta: "Observaciones" },
      ],
    },
    {
      id: "asentimiento",
      titulo: "Asentimiento del menor",
      campos: [
        {
          tipo: "opcion_unica",
          id: "asentimiento",
          etiqueta: "Pido lo que quiero",
          ayuda: "Lo elige el menor. Si no corresponde, dejalo vacío.",
          opciones: [
            { valor: "si_quiero", etiqueta: "Sí quiero atenderme" },
            { valor: "no_quiero", etiqueta: "No quiero atenderme" },
          ],
        },
      ],
    },
  ],
  cuerpo: [
    { t: "titulo", texto: "Consentimiento informado" },
    { t: "subtitulo", texto: "Odontopediatría" },
    { t: "parrafo", texto: "Lugar y fecha: {{lugar}}, {{sistema.fecha}}." },
    {
      t: "parrafo",
      texto:
        "Por la presente se hace saber a Usted que tiene derecho a conocer el procedimiento al que va a ser sometido el menor de edad y las complicaciones más frecuentes que ocurren. Este documento explica todas estas cuestiones, léalo atentamente y consulte todas las dudas que se le planteen. Le recordamos que por imperativo legal, tendrá que firmar, el representante legal, el consentimiento informado para que pueda realizarse dicho procedimiento. A propósito declaro haber sido informado y haber comprendido acabadamente el objetivo del tratamiento a realizar.",
    },
    {
      t: "parrafo",
      texto:
        "Yo, {{representante_nombre}}, de {{representante_edad}} años de edad, DNI {{representante_dni}}, domiciliado en {{representante_domicilio}}, como representante legal de {{menor_nombre}}, DNI: {{menor_dni}}, he sido informado/a por el Dr. / Dra. {{profesional_nombre}}, M.P. {{profesional_matricula}}, de los procedimientos propios clínicos en odontopediatría, que constan en el plan de tratamiento otorgando mi consentimiento para realizar las prácticas necesarias al caso clínico.",
    },
    {
      t: "parrafo",
      texto:
        "Estoy de acuerdo a que el niño sea sometido a anestesia local en caso que fuera necesario, sabiendo los riesgos que ello implica, delegando al odontólogo la elección del tipo de anestesia.",
    },
    {
      t: "parrafo",
      texto:
        "Se me ha explicado el diagnóstico, la naturaleza de la enfermedad que padece mi representado y su evolución natural, objetivos del tratamiento propuesto, así como las alternativas del tratamiento que pueden ser practicadas, descripción de las consecuencias derivadas del tratamiento o intervención, beneficios y complicaciones comunes que se pueden desencadenar durante o después del mismo, riesgos personales y entendiendo que ante alguna manifestación de complicaciones deberé acudir nuevamente al profesional tratante de mi representado.",
    },
    { t: "parrafo", texto: "Queda explícito en el siguiente texto lo siguiente:" },
    { t: "campo", campo: "diagnostico" },
    { t: "campo", campo: "tratamiento" },
    { t: "campo", campo: "tratamientos_alternativos" },
    { t: "parrafo", texto: "Riesgos y complicaciones esperados:" },
    {
      t: "lista",
      items: [
        "Dolor.",
        "Inflamación.",
        "Infección.",
        "Fractura del elemento dentario por deterioro.",
        "Pulpitis (inflamación del nervio): determina que se le realice al paciente un tratamiento del nervio.",
        "Hematomas y hemorragias (sangrado - moretones).",
      ],
    },
    { t: "campo", campo: "riesgos_otros" },
    { t: "campo", campo: "beneficios" },
    {
      t: "parrafo",
      texto:
        "Comprendo y entiendo que si no se realiza el tratamiento odontológico, podría sufrir cualquiera de los siguientes problemas: enfermedad ósea, inflamación de las encías, infección, sensibilidad, movilidad de los dientes seguida por la necesidad de realizar la extracción.",
    },
    { t: "campo", campo: "consecuencias" },
    { t: "campo", campo: "observaciones" },
    {
      t: "parrafo",
      texto:
        "Comprendo que la Odontopediatría, es el área de la odontología que se encarga de restablecer la salud bucal integral de niños y adolescentes. Comprendo que la odontología no es una ciencia exacta y por lo que los resultados está sujeto a múltiples factores. He tenido información clara y suficiente, la oportunidad de preguntar y he obtenido respuestas satisfactorias, me siento libre para decidir de acuerdo a mis valores e intereses y me declaro competente para tomar la decisión que corresponda. Asimismo doy fe que mi representado fue oído y/o dio su asentimiento a realizar el tratamiento.",
    },
    {
      t: "parrafo",
      texto:
        "Por lo antes expuesto doy el consentimiento al Dr/Dra: {{profesional_nombre}}, MP: {{profesional_matricula}} a realizar el tratamiento antes expuesto al menor de edad o discapacitado {{menor_nombre}}, DNI: {{menor_dni}}, según lo antes expuesto.",
    },
    { t: "parrafo", texto: "Asentimiento: pido lo que quiero. {{asentimiento}}." },
    { t: "firmas" },
  ],
  firmas: [
    { rol: "representante", etiqueta: "Firma del representante legal", requerida: true },
    { rol: "profesional", etiqueta: "Firma y sello del profesional", requerida: true },
    { rol: "asentimiento", etiqueta: "Firma del paciente (asentimiento)", requerida: false },
  ],
  // A4 (595,3 × 841,9 pt), dos páginas, en Arial Narrow de 12 pt con
  // renglones de puntos. Los huecos que empiezan a mitad del renglón de su
  // título arrancan ahí y siguen en los renglones de abajo (`sangria`).
  lamina: {
    paginas: [
      { ancho: 595.3, alto: 841.9 },
      { ancho: 595.3, alto: 841.9 },
    ],
    zonas: [
      { id: "lugar_fecha", pagina: 1, x: 250, y: 114, ancho: 302, texto: "{{lugar}}, {{sistema.fecha}}" },
      { id: "representante_nombre", pagina: 1, x: 61.5, y: 278.3, ancho: 253, texto: "{{representante_nombre}}" },
      { id: "representante_edad", pagina: 1, x: 327, y: 278.3, ancho: 34, alinear: "centro", texto: "{{representante_edad}}" },
      { id: "representante_dni", pagina: 1, x: 410, y: 278.3, ancho: 139, texto: "{{representante_dni}}" },
      { id: "representante_domicilio", pagina: 1, x: 109.5, y: 295.5, ancho: 440, texto: "{{representante_domicilio}}" },
      { id: "menor_nombre", pagina: 1, x: 174.5, y: 312.8, ancho: 208, texto: "{{menor_nombre}}" },
      { id: "menor_dni", pagina: 1, x: 407.5, y: 312.8, ancho: 97, texto: "{{menor_dni}}" },
      { id: "profesional_nombre", pagina: 1, x: 158, y: 329.9, ancho: 269, texto: "{{profesional_nombre}}" },
      { id: "profesional_matricula", pagina: 1, x: 445.5, y: 329.9, ancho: 59, texto: "{{profesional_matricula}}" },
      { id: "diagnostico", pagina: 1, x: 43.5, y: 551, ancho: 508, sangria: 51, lineas: 4, interlineado: 19.3, texto: "{{diagnostico}}" },
      { id: "tratamiento", pagina: 1, x: 43.5, y: 647.4, ancho: 508, sangria: 246.5, lineas: 4, interlineado: 19.27, texto: "{{tratamiento}}" },
      { id: "tratamientos_alternativos", pagina: 1, x: 43.5, y: 743.8, ancho: 508, sangria: 115.5, lineas: 4, interlineado: 19.27, texto: "{{tratamientos_alternativos}}" },
      { id: "riesgos_otros", pagina: 2, x: 43.5, y: 189.6, ancho: 508, lineas: 2, interlineado: 16.6, texto: "{{riesgos_otros}}" },
      { id: "beneficios", pagina: 2, x: 43.5, y: 239.2, ancho: 505, sangria: 167, lineas: 4, interlineado: 16.53, texto: "{{beneficios}}" },
      { id: "consecuencias", pagina: 2, x: 43.5, y: 371.5, ancho: 505, sangria: 227.5, lineas: 3, interlineado: 16.5, texto: "{{consecuencias}}" },
      { id: "observaciones", pagina: 2, x: 43.5, y: 437.5, ancho: 500, sangria: 71.5, lineas: 3, interlineado: 16.55, texto: "{{observaciones}}" },
      { id: "profesional_nombre_consiente", pagina: 2, x: 284, y: 588, ancho: 267, texto: "{{profesional_nombre}}" },
      { id: "profesional_matricula_consiente", pagina: 2, x: 65.5, y: 605.9, ancho: 136, texto: "{{profesional_matricula}}" },
      { id: "menor_nombre_consiente", pagina: 2, x: 43.5, y: 625.2, ancho: 244, texto: "{{menor_nombre}}" },
      { id: "menor_dni_consiente", pagina: 2, x: 412, y: 625.2, ancho: 137, texto: "{{menor_dni}}" },
      { id: "asentimiento_si", pagina: 2, x: 359.4, y: 761.2, ancho: 9.8, alinear: "centro", texto: "{{asentimiento=si_quiero}}", vacio: "—" },
      { id: "asentimiento_no", pagina: 2, x: 520.1, y: 761.2, ancho: 9.8, alinear: "centro", texto: "{{asentimiento=no_quiero}}", vacio: "—" },
      { id: "aclaracion", pagina: 2, x: 88, y: 806.9, ancho: 246, texto: "{{representante_nombre}}" },
      { id: "dni_firma", pagina: 2, x: 61.5, y: 819.6, ancho: 271, texto: "{{representante_dni}}" },
    ],
    firmas: [
      { rol: "representante", pagina: 2, x: 163, y: 794.3, ancho: 175, alto: 20 },
      { rol: "profesional", pagina: 2, x: 416.6, y: 806.9, ancho: 142.8, alto: 38 },
      { rol: "asentimiento", pagina: 2, x: 59.1, y: 731.7, ancho: 130.5, alto: 38 },
    ],
  },
};
