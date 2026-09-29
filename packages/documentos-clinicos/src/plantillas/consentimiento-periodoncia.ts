// Consentimiento informado de periodoncia — modelo oficial del Colegio
// Odontológico de la Provincia de Córdoba
// (Consentimiento-Informado-de-Periodoncia.pdf).
//
// El texto es el del modelo, palabra por palabra; se tocó solo la
// ortografía (tildes: "diagnóstico", "encía", "pérdida", "cálculo",
// "gingivectomía", "ayudará", "comunicaré", "específicas", "medicación").
// El modelo deja renglones sin título después de los beneficios y del
// tratamiento alternativo: son para lo que el profesional quiera agregar.
import type { Plantilla } from "../esquema";

export const consentimientoPeriodoncia: Plantilla = {
  id: "consentimiento-periodoncia",
  version: 1,
  nombre: "Periodoncia",
  tipo: "consentimiento",
  descripcion: "Consentimiento informado para el tratamiento periodontal, con los riesgos, las alternativas y la medicación.",
  fuente: {
    nombre: "Colegio Odontológico de la Provincia de Córdoba",
    url: "https://colodontcba.org.ar/informacion-general/modelo-historia-clinica/",
  },
  secciones: [
    {
      id: "lugar",
      titulo: "Lugar, fecha y diagnóstico",
      campos: [
        { tipo: "texto", id: "lugar", etiqueta: "Lugar", requerido: true, precarga: "clinica.ciudad" },
        { tipo: "texto", id: "diagnostico", etiqueta: "Diagnóstico", requerido: true },
      ],
    },
    {
      id: "beneficios",
      titulo: "Beneficios",
      campos: [
        {
          tipo: "texto_largo",
          id: "beneficios_aclaraciones",
          etiqueta: "Aclaraciones sobre los beneficios",
          ayuda: "Los renglones libres del modelo, después de los beneficios del tratamiento.",
        },
      ],
    },
    {
      id: "riesgos",
      titulo: "Medicamentos y alternativas",
      campos: [
        { tipo: "texto_largo", id: "medicamentos_actuales", etiqueta: "Medicamentos que toma en la actualidad" },
        {
          tipo: "texto_largo",
          id: "alternativas_aclaraciones",
          etiqueta: "Aclaraciones sobre el tratamiento alternativo",
          ayuda: "Los renglones libres del modelo, después del tratamiento alternativo.",
        },
      ],
    },
    {
      id: "indicaciones",
      titulo: "Indicaciones y medicación",
      campos: [
        { tipo: "texto_largo", id: "indicaciones_especificas", etiqueta: "Indicaciones específicas" },
        { tipo: "texto", id: "medicacion_pre", etiqueta: "Medicación pre tratamiento" },
        { tipo: "texto", id: "medicacion_durante", etiqueta: "Medicación durante el tratamiento" },
        { tipo: "texto", id: "medicacion_post", etiqueta: "Medicación pos tratamiento" },
        { tipo: "texto_largo", id: "observaciones", etiqueta: "Observaciones" },
      ],
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
        },
        { tipo: "texto", id: "suscribe_dni", etiqueta: "DNI", requerido: true, precarga: "paciente.dni" },
        { tipo: "texto", id: "suscribe_domicilio", etiqueta: "Domicilio", requerido: true, precarga: "paciente.domicilio" },
        { tipo: "texto_largo", id: "tratamiento_periodontal", etiqueta: "Tratamiento periodontal propuesto", requerido: true },
        {
          tipo: "texto",
          id: "profesional_nombre",
          etiqueta: "Profesional que lo propone",
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
    { t: "subtitulo", texto: "Periodoncia" },
    { t: "parrafo", texto: "Lugar y fecha: {{lugar}}, {{sistema.fecha}}." },
    { t: "parrafo", texto: "Diagnóstico: {{diagnostico}}." },
    {
      t: "parrafo",
      texto:
        "Usted tiene derecho a conocer el procedimiento al que va a ser sometido, y las complicaciones más frecuentes que ocurren. Este documento intenta explicarle todas estas cuestiones, léalo atentamente y consulte todas las dudas que se le planteen. Le recordamos que por imperativo legal, tendrá que firmar, usted o su representante legal, el consentimiento informado para que pueda realizarle dicho procedimiento.",
    },
    {
      t: "parrafo",
      texto:
        "A propósito declaro haber sido informado y haber comprendido acabadamente el objeto del tratamiento que es la eliminación de los factores irritativos e infecciosos presentes en los tejidos que rodean al diente y/o implante (encía, hueso alveolar, ligamento periodontal, cemento radicular, superficie del implante), para conseguir el mantenimiento de los mismos en el tiempo, función y estética, evitando movilidad, pérdida de hueso y caída de los mismos.",
    },
    {
      t: "parrafo",
      texto:
        "El tratamiento propuesto consiste en la eliminación de placa y cálculo (sarro) con curetas o ultrasonido (instrumentos afilados para el raspaje), en la cantidad de sesiones necesarias según el caso clínico y de ser necesario la cirugía de encía a colgajo para eliminar las bolsas infecciosas, agregado o reducción de tejido blando (injerto o gingivectomía), o aumentar el volumen de encía y tratar los defectos óseos. Estos procedimientos persiguen detener el avance de la enfermedad y limitar los daños generados, debiendo con control periódico y supervisión profesional mantener los resultados obtenidos en el tiempo.",
    },
    {
      t: "parrafo",
      texto:
        "Estoy de acuerdo con ser sometido a anestesia local, sabiendo los riesgos que ello implica, delegando al odontólogo la elección del tipo de anestesia.",
    },
    {
      t: "parrafo",
      texto:
        "Entiendo perfectamente que, durante y a continuación del procedimiento previsto, cirugía o tratamiento, pueden surgir condiciones que, según el criterio del profesional requiera un plan de tratamiento complementario/alternativo, relacionado directamente con el éxito del tratamiento. También apruebo cualquier modificación en diseño, materiales o mantenimiento, si se considera que es para mi beneficio.",
    },
    { t: "parrafo", texto: "En caso de ser necesario se podrá utilizar biomateriales como complemento al tratamiento." },
    {
      t: "parrafo",
      texto:
        "El beneficio al realizar el tratamiento periodontal es desarrollar un medio ambiente limpio en el cual las encías pueden cicatrizar; reducen las probabilidades de sufrir irritaciones e infecciones adicionales; le facilitan la limpieza de sus dientes; y disminuyen el costo de reemplazar los dientes perdidos a causa de la enfermedad periodontal, aumentar la posibilidad de retener sus dientes y su función; este plan de tratamiento ayudará a mejorar su estado de salud bucal y general (evitar el parto prematuro, evitar complicaciones en enfermedades sistémicas como diabetes, cardiopatías, entre otras) y evitar que la enfermedad se extienda.",
    },
    { t: "campo", campo: "beneficios_aclaraciones" },
    { t: "parrafo", texto: "Riesgos, molestias y efectos adversos:" },
    {
      t: "parrafo",
      texto:
        "Entiendo que mis encías pueden sangrar, inflamarse, o infectarse localmente, experimentar una molestia posterior al tratamiento. Si los problemas perduran durante más de unos pocos días me comunicaré con el odontólogo.",
    },
    {
      t: "parrafo",
      texto:
        "Entiendo que mantener mi boca abierta durante el tratamiento puede hacer que mi mandíbula quede endurecida y adolorida temporalmente, y tal vez me sea difícil abrir bien la boca durante varios días.",
    },
    {
      t: "parrafo",
      texto:
        "A medida que cicatriza el tejido de mi encía, el mismo puede encogerse un poco y dejar expuesta parte de la superficie de la raíz. Esto puede hacer que mis dientes se vuelvan más sensibles al calor o al frío y afectar el aspecto estético con la aparición de espacios entre los dientes lo cual puede generar atrapamiento de comida, aumentar la movilidad de los dientes y generar un aspecto de diente largo.",
    },
    {
      t: "parrafo",
      texto:
        "Entiendo que dependiendo de mi condición dental actual, problemas de salud existentes, medicamentos que pueda estar tomando, predisposición genética o factores irritantes locales (tabaco, ortodoncia, prótesis mal adaptadas), estos métodos por sí solos tal vez no reviertan por completo los efectos de la enfermedad periodontal o prevengan problemas futuros.",
    },
    {
      t: "parrafo",
      texto:
        "Entiendo que todos los medicamentos son potencialmente peligrosos, y pueden tener efectos secundarios y contraindicaciones con otras drogas. Por lo tanto, es fundamental que le informe a mi odontólogo todos los medicamentos que estoy tomando en la actualidad, los cuales son: {{medicamentos_actuales}}",
    },
    {
      t: "parrafo",
      texto:
        "Como tratamiento alternativo a la periodoncia se puede considerar la exodoncia de la o las piezas afectadas, eliminando así los factores causales de la enfermedad, necesitando posteriormente la reposición de las piezas perdidas con prótesis fijas, removibles, implantes.",
    },
    { t: "campo", campo: "alternativas_aclaraciones" },
    {
      t: "parrafo",
      texto:
        "Entiendo que si no se aplica ningún tratamiento, o el tratamiento comenzado es interrumpido o discontinuado, mi enfermedad periodontal puede continuar y probablemente empeorar. Esto puede causar una mayor inflamación e infección del tejido de la encía, caries por encima y por debajo del borde de la encía, deterioro del hueso que rodea el diente y finalmente, la pérdida de ciertos dientes, como así también afectar el estado de salud general.",
    },
    {
      t: "parrafo",
      texto:
        "Entiendo que se harán todos los esfuerzos razonables para asegurar que mi afección sea tratada apropiadamente, pero no es posible garantizar resultados perfectos. Mediante mi firma más abajo, doy fe de que he recibido información adecuada sobre el tratamiento propuesto, de que entiendo dicha información, y de que todas mis preguntas han sido contestadas satisfactoriamente.",
    },
    {
      t: "parrafo",
      texto:
        "El resultado del tratamiento depende en parte de que usted se comprometa a cepillarse los dientes y a usar el hilo dental después de cada comida, a recibir limpiezas según le sean indicadas, a seguir una dieta saludable, a evitar el tabaco y a cumplir con un plan de cuidado en el hogar que se le enseñará en este consultorio.",
    },
    { t: "campo", campo: "indicaciones_especificas" },
    { t: "campo", campo: "medicacion_pre" },
    { t: "campo", campo: "medicacion_durante" },
    { t: "campo", campo: "medicacion_post" },
    { t: "campo", campo: "observaciones" },
    {
      t: "parrafo",
      texto:
        "El/la que suscribe {{suscribe_nombre}}, DNI Nº {{suscribe_dni}}, con domicilio en calle {{suscribe_domicilio}}, otorgo mi consentimiento a la realización del tratamiento periodontal {{tratamiento_periodontal}} propuesta por el/la Dr./a {{profesional_nombre}}, MP {{profesional_matricula}}.",
    },
    { t: "firmas" },
  ],
  firmas: [
    { rol: "paciente", etiqueta: "Firma del paciente", requerida: true },
    { rol: "profesional", etiqueta: "Firma del profesional", requerida: true },
  ],
  // Carta (612 × 792 pt), tres páginas, en Arial de 11 pt con renglones de
  // puntos. Dos huecos empiezan a mitad de un renglón con otro interlineado
  // que los de abajo (los medicamentos y el tratamiento propuesto): se
  // escriben en los renglones enteros que siguen. Las firmas no tienen
  // línea: van arriba de su leyenda.
  lamina: {
    paginas: [
      { ancho: 612, alto: 792 },
      { ancho: 612, alto: 792 },
      { ancho: 612, alto: 792 },
    ],
    zonas: [
      { id: "lugar_fecha", pagina: 1, x: 147.5, y: 109.9, ancho: 378, texto: "{{lugar}}, {{sistema.fecha}}" },
      { id: "diagnostico", pagina: 1, x: 149.5, y: 135.4, ancho: 376, texto: "{{diagnostico}}" },
      { id: "beneficios_aclaraciones", pagina: 1, x: 86, y: 685.1, ancho: 460, lineas: 4, interlineado: 14.5, texto: "{{beneficios_aclaraciones}}" },
      { id: "medicamentos_actuales", pagina: 2, x: 86, y: 402.2, ancho: 460, lineas: 3, interlineado: 12.65, texto: "{{medicamentos_actuales}}" },
      { id: "alternativas_aclaraciones", pagina: 2, x: 86, y: 503.8, ancho: 460, lineas: 3, interlineado: 14.55, texto: "{{alternativas_aclaraciones}}" },
      { id: "indicaciones_especificas", pagina: 3, x: 86, y: 151.6, ancho: 460, lineas: 3, interlineado: 14.5, texto: "{{indicaciones_especificas}}" },
      { id: "medicacion_pre", pagina: 3, x: 215.5, y: 205.2, ancho: 325, texto: "{{medicacion_pre}}" },
      { id: "medicacion_durante", pagina: 3, x: 254.5, y: 229.7, ancho: 289, texto: "{{medicacion_durante}}" },
      { id: "medicacion_post", pagina: 3, x: 223.5, y: 254.3, ancho: 322, texto: "{{medicacion_post}}" },
      { id: "observaciones", pagina: 3, x: 86, y: 317.9, ancho: 460, lineas: 5, interlineado: 14.55, texto: "{{observaciones}}" },
      { id: "suscribe_nombre", pagina: 3, x: 176, y: 400.8, ancho: 364, texto: "{{suscribe_nombre}}" },
      { id: "suscribe_dni", pagina: 3, x: 120, y: 425.2, ancho: 81, texto: "{{suscribe_dni}}" },
      { id: "suscribe_domicilio", pagina: 3, x: 313.5, y: 425.2, ancho: 229, texto: "{{suscribe_domicilio}}" },
      { id: "tratamiento_periodontal", pagina: 3, x: 86, y: 454.4, ancho: 386, lineas: 2, interlineado: 14.5, texto: "{{tratamiento_periodontal}}" },
      { id: "profesional", pagina: 3, x: 158.5, y: 483.4, ancho: 254, texto: "{{profesional_nombre}}, MP {{profesional_matricula}}" },
    ],
    firmas: [
      { rol: "paciente", pagina: 3, x: 85, y: 595, ancho: 150, alto: 38 },
      { rol: "profesional", pagina: 3, x: 410, y: 595, ancho: 145, alto: 38 },
    ],
  },
};
