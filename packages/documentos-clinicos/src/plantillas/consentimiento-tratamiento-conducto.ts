// Consentimiento informado de tratamiento de conducto — modelo oficial del
// Colegio Odontológico de la Provincia de Córdoba
// (Consentimiento-Informado-de-Tratamiento-de-Conducto.pdf).
//
// El texto es el del modelo, palabra por palabra. Lo único que se tocó es
// la ortografía (las tildes que faltaban: "administrará", "más",
// "pérdida", "endodónticamente"…) y el formato de los huecos: donde el
// papel tiene una línea para escribir, acá hay un campo.
//
// Es la primera plantilla de la Fase 5 (subfase 5.1): la más simple de
// las diecinueve, para probar el circuito entero —completar, terminar,
// firmar, sellar— antes de sumar las demás.
import type { Plantilla } from "../esquema";

export const consentimientoTratamientoConducto: Plantilla = {
  id: "consentimiento-tratamiento-conducto",
  version: 1,
  nombre: "Tratamiento de conducto",
  tipo: "consentimiento",
  descripcion:
    "Consentimiento informado para el tratamiento de conducto de uno o más elementos, con sus riesgos, las indicaciones y la medicación.",
  fuente: {
    nombre: "Colegio Odontológico de la Provincia de Córdoba",
    url: "https://colodontcba.org.ar/informacion-general/modelo-historia-clinica/",
  },
  secciones: [
    {
      id: "firmante",
      titulo: "Quién suscribe",
      campos: [
        {
          tipo: "texto",
          id: "lugar",
          etiqueta: "Lugar",
          requerido: true,
          precarga: "clinica.ciudad",
        },
        {
          tipo: "texto",
          id: "suscribe_nombre",
          etiqueta: "Nombre y apellido",
          requerido: true,
          precarga: "paciente.nombreCompleto",
          ayuda: "Si firma un representante (por ejemplo, el padre o la madre de un menor), poné sus datos.",
        },
        {
          tipo: "fecha",
          id: "suscribe_fecha_nacimiento",
          etiqueta: "Fecha de nacimiento",
          requerido: true,
          precarga: "paciente.fechaNacimiento",
        },
        {
          tipo: "texto",
          id: "suscribe_dni",
          etiqueta: "DNI",
          requerido: true,
          precarga: "paciente.dni",
        },
        {
          tipo: "texto",
          id: "suscribe_domicilio",
          etiqueta: "Domicilio",
          requerido: true,
          precarga: "paciente.domicilio",
        },
      ],
    },
    {
      id: "tratamiento",
      titulo: "Tratamiento",
      campos: [
        {
          tipo: "piezas",
          id: "elementos",
          etiqueta: "Elemento(s) a tratar",
          requerido: true,
          denticion: "ambas",
        },
        {
          tipo: "texto",
          id: "profesional_nombre",
          etiqueta: "Profesional que lo propone",
          requerido: true,
          precarga: "profesional.nombreCompleto",
          bloqueado: true,
        },
      ],
    },
    {
      id: "indicaciones",
      titulo: "Indicaciones y medicación",
      campos: [
        { tipo: "texto_largo", id: "indicaciones", etiqueta: "Indicaciones" },
        { tipo: "texto_largo", id: "medicacion", etiqueta: "Medicación indicada" },
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
  ],
  cuerpo: [
    { t: "titulo", texto: "Consentimiento informado" },
    { t: "subtitulo", texto: "Tratamiento de conducto" },
    { t: "parrafo", texto: "Lugar y fecha: {{lugar}}, {{sistema.fecha}}." },
    {
      t: "parrafo",
      texto:
        "El/la que suscribe {{suscribe_nombre}}, fecha de nacimiento {{suscribe_fecha_nacimiento}}, DNI N° {{suscribe_dni}}, con domicilio {{suscribe_domicilio}}, otorgo mi consentimiento al tratamiento de conducto en el elemento N° {{elementos}} propuesto por el/la Dr. {{profesional_nombre}}.",
    },
    {
      t: "parrafo",
      texto:
        "A propósito declaro haber sido informado y haber comprendido acabadamente la conveniencia del Tratamiento de Conducto, proceso por el cual se remueve el nervio (pulpa dental) infectado, dañado o muerto del diente, como alternativa a la extracción de dicho elemento y las consecuencias de no llevar a cabo dicho tratamiento, así como las complicaciones que pueden asociarse con el tratamiento de conducto, las cuales incluyen (aunque no se limitan) a las siguientes:",
    },
    {
      t: "lista",
      items: [
        "Molestias post-operatorias que pueden durar desde unas horas hasta varios días y para lo cual se administrará medicación en caso de ser necesario.",
        "Tumefacción post-operatorio del área gingival en la vecindad del diente tratado o tumefacción facial, las cuales pueden persistir durante varios días.",
        "Infección, para las cuales se indicará medicación.",
        "Trismus, (limitación de la apertura de la boca), que usualmente dura algunos días pero puede persistir durante un período más prolongado.",
        "Fracaso del tratamiento. Si el tratamiento fracasa puede ser necesario un nuevo tratamiento, una intervención quirúrgica del extremo radicular (apicectomía), eliminación de la raíz afectada (radectomía) o la extracción del diente tratado.",
        "Ruptura de los instrumentos endodónticos en el interior del conducto durante el tratamiento, doy mi consentimiento para que el profesional actúe del modo más conocido, dejar los restos en el conducto tratado o realizar una intervención quirúrgica con el fin de extraerlos, por el exclusivo interés de mi salud.",
        "La perforación del conducto radicular con instrumentos, lo que puede requerir un tratamiento correctivo quirúrgico adicional o traer como consecuencia la pérdida o extracción prematura del diente.",
        "Pérdida prematura del diente como consecuencia de enfermedad periodontal progresiva en el área circundante.",
        "El diente después de tratado endodónticamente está más expuesto a posibles fracturas por lo que debe ser restaurado adecuadamente entre 8 a 15 días de transcurrida la intervención endodóntica aunque esto no garantice o prevenga las fracturas.",
      ],
    },
    { t: "campo", campo: "indicaciones" },
    { t: "campo", campo: "medicacion" },
    {
      t: "parrafo",
      texto:
        "Todas mis dudas han sido aclaradas y estoy completamente de acuerdo con lo consignado en esta fórmula de consentimiento. Si al momento de la intervención surgiera una situación anátomo-patológica distinta y más grave a la prevista, doy mi consentimiento para que se actúe del modo más conocido, según la ciencia y conciencia respecto a lo programado, por el exclusivo interés de mi salud.",
    },
    {
      t: "parrafo",
      texto:
        "Asimismo, doy consentimiento para la administración de anestesia local que se aplicará para la realización de dicho tratamiento y me comprometo a regresar a la próxima consulta el día {{proxima_consulta_fecha}}, hora {{proxima_consulta_hora}}.",
    },
    { t: "firmas" },
  ],
  firmas: [
    { rol: "paciente", etiqueta: "Firma del paciente o representante", requerida: true },
    { rol: "profesional", etiqueta: "Firma del profesional", requerida: true },
  ],
  // Dónde va cada dato sobre la página original (carta, 612 × 792 pt).
  // Medido sobre el PDF del Colegio: cada `x`/`ancho` es el tramo de
  // guiones bajos del renglón, y cada `y`, su línea de base 1,2 pt más
  // arriba — así lo escrito se apoya en la línea sin taparla. El papel
  // está en Tahoma de 10 pt; lo escrito también parte de 10.
  lamina: {
    paginas: [{ ancho: 612, alto: 792 }],
    zonas: [
      { id: "lugar_fecha", pagina: 1, x: 147, y: 105, ancho: 178, texto: "{{lugar}}, {{sistema.fecha}}" },
      { id: "suscribe_nombre", pagina: 1, x: 164, y: 129.1, ancho: 129, texto: "{{suscribe_nombre}}" },
      { id: "suscribe_fecha_nacimiento", pagina: 1, x: 384, y: 129.1, ancho: 134, texto: "{{suscribe_fecha_nacimiento}}" },
      { id: "suscribe_dni", pagina: 1, x: 118, y: 141.1, ancho: 113, texto: "{{suscribe_dni}}" },
      { id: "suscribe_domicilio", pagina: 1, x: 296, y: 141.1, ancho: 195, texto: "{{suscribe_domicilio}}" },
      { id: "elementos", pagina: 1, x: 86, y: 165.3, ancho: 146, texto: "{{elementos}}" },
      { id: "profesional_nombre", pagina: 1, x: 334, y: 165.3, ancho: 184, texto: "{{profesional_nombre}}" },
      { id: "indicaciones", pagina: 1, x: 86, y: 483.3, ancho: 435, lineas: 6, interlineado: 12.08, texto: "{{indicaciones}}" },
      { id: "medicacion", pagina: 1, x: 86, y: 579.9, ancho: 438, lineas: 2, interlineado: 12, texto: "{{medicacion}}" },
      // "___/___/___": el día, el mes y el año, cada uno en su tramo. Vacíos
      // no entra "No consigna": se tachan con una raya.
      {
        id: "proxima_consulta_dia",
        pagina: 1,
        x: 85.1,
        y: 700.7,
        ancho: 16.2,
        alinear: "centro",
        texto: "{{proxima_consulta_fecha:dia}}",
        vacio: "—",
      },
      {
        id: "proxima_consulta_mes",
        pagina: 1,
        x: 105.3,
        y: 700.7,
        ancho: 16.3,
        alinear: "centro",
        texto: "{{proxima_consulta_fecha:mes}}",
        vacio: "—",
      },
      {
        id: "proxima_consulta_anio",
        pagina: 1,
        x: 125.4,
        y: 700.7,
        ancho: 16.3,
        alinear: "centro",
        texto: "{{proxima_consulta_fecha:anio2}}",
        vacio: "—",
      },
      {
        id: "proxima_consulta_hora",
        pagina: 1,
        x: 170,
        y: 700.7,
        ancho: 42.7,
        alinear: "centro",
        texto: "{{proxima_consulta_hora}}",
      },
    ],
    firmas: [
      { rol: "paciente", pagina: 1, x: 85.1, y: 749, ancho: 158, alto: 38 },
      { rol: "profesional", pagina: 1, x: 353.7, y: 749, ancho: 169.3, alto: 38 },
    ],
  },
};
