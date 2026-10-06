// Historia clínica general para PcD (personas con discapacidad) — modelo
// oficial del Colegio Odontológico de la Provincia de Córdoba (HC-PcD.pdf,
// Fase 5.6a).
//
// Es la historia clínica general con los datos que pide la atención de una
// persona con discapacidad: plan, grupo sanguíneo y DNI del paciente,
// movilidad asistida, diagnóstico médico y medicación, centro de día,
// certificado único de discapacidad, ASA, movimientos involuntarios, la
// experiencia odontológica y las sedaciones previas, la oclusión y la
// higiene. La lámina son las páginas 1 y 2 del PDF: la 3 (la tabla de
// prestaciones) es la Fase 5.7 y la 4 está en blanco. Se firma en el sistema
// (TR-188): el paciente o su tutor y el profesional.
//
// Lo que el papel deja a criterio de quien lo llena se resolvió como en la
// historia clínica general:
//   - un SI/NO lleva `detalle` cuando lo que sigue pide aclarar el sí
//     ("cuál?", "Motivo"); el renglón de la aclaración lleva solo el detalle
//     (`{{campo:detalle}}`), porque el sí o el no ya está en su casilla;
//   - un hueco chico donde se responde marcando ("a la anestesia……",
//     "Cepillo manual……") lleva una X: es una opción múltiple;
//   - un hueco que empieza a mitad de renglón y es demasiado angosto para la
//     primera palabra (menos de ~70 pt) no se usa si hay un renglón entero
//     abajo: la respuesta arranca ahí;
//   - los rótulos de la firma del paciente ("Firma del paciente o tutor",
//     "aclaración", "DNI Nº") el modelo los pasó al principio de la página 3:
//     acá van debajo de sus renglones, en la página 2;
//   - la firma del profesional no tiene renglón en el papel: va debajo de
//     la fila del paciente, a la derecha, con su aclaración al lado, cada
//     una sobre un renglón de puntos como los del papel. Abajo quedaban 11 pt
//     hasta el borde, así que la página 2 se dibuja al 93 % (`escala`) para
//     dejarle lugar.
import type { LugarDeFirma, Plantilla, Zona } from "../esquema";

const r2 = (n: number) => Math.round(n * 100) / 100;

// Las casillas del papel son el glifo 🗌 de Arial en tres tamaños: un
// rectángulo que empieza `dx` después del origen del glifo y cuya base es la
// línea de base del renglón. La X va centrada adentro, en el tamaño que
// entra (`alzado`: cuánto sube su base para quedar al medio).
type Glifo = { dx: number; ancho: number; tamano: number; alzado: number };
/** A 11,4 pt (12 pt en un par de renglones): 5,2 × 7,4 pt. */
const GRANDE: Glifo = { dx: 1.4, ancho: 5.2, tamano: 7, alzado: 1.3 };
/** A 9 pt: 4,4 × 5,5 pt. */
const MEDIO: Glifo = { dx: 1.1, ancho: 4.4, tamano: 5.5, alzado: 0.9 };
/** A 8,5 pt: 3,9 × 5,5 pt. */
const CHICO: Glifo = { dx: 1.0, ancho: 3.9, tamano: 5.5, alzado: 0.9 };

function casilla(
  id: string,
  pagina: number,
  base: number,
  xGlifo: number,
  texto: string,
  glifo: Glifo = GRANDE,
): Zona {
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
function siNo(
  campo: string,
  pagina: number,
  base: number,
  xSi: number,
  xNo: number,
  glifo: Glifo = GRANDE,
): Zona[] {
  return [
    casilla(`${campo}_si`, pagina, base, xSi, `{{${campo}=si}}`, glifo),
    casilla(`${campo}_no`, pagina, base, xNo, `{{${campo}=no}}`, glifo),
  ];
}

// Las dos columnas del cuestionario de la página 1 tienen sus casillas en x
// fijas.
const izquierda = (campo: string, base: number) =>
  siNo(campo, 1, base, 243.4, 272.3);
const derecha = (campo: string, base: number) =>
  siNo(campo, 1, base, 521.5, 550.4);

type Ajustes = Partial<Pick<Zona, "tamano" | "minimo" | "alinear" | "vacio">>;

/** Un hueco de puntos de un renglón, con la convención de
 *  scripts/medir-huecos.py: un punto después de donde empieza, la línea de
 *  base − 1,2 y un par de puntos menos de ancho. */
function hueco(
  id: string,
  pagina: number,
  base: number,
  desde: number,
  hasta: number,
  texto: string,
  ajustes: Ajustes = {},
): Zona {
  return {
    id,
    pagina,
    x: r2(desde + 1),
    y: r2(base - 1.2),
    ancho: r2(hasta - desde - 2),
    tamano: 9,
    texto,
    ...ajustes,
  };
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

/** Una X en un hueco de puntos ("a la anestesia……", "Cepillo manual……"). */
function enHueco(
  id: string,
  pagina: number,
  base: number,
  desde: number,
  hasta: number,
  texto: string,
): Zona {
  return hueco(id, pagina, base, desde, hasta, texto, {
    tamano: 8,
    alinear: "centro",
    vacio: "—",
  });
}

/** Un texto fijo del papel, centrado en su tramo. */
function rotulo(
  id: string,
  base: number,
  desde: number,
  hasta: number,
  texto: string,
): Zona {
  return {
    id,
    pagina: 2,
    x: desde,
    y: base,
    ancho: r2(hasta - desde),
    tamano: 8,
    alinear: "centro",
    texto,
  };
}

// El bloque del profesional: la firma (208–376) y la aclaración (388–556),
// debajo de los rótulos del paciente (que terminan en 831) y hasta donde
// terminan sus renglones. Cada lugar mide 168 × 34 en el original: al 93 %,
// en la hoja, 156 × 32, como en la historia clínica general. Su renglón son
// 19 puntos suspensivos a 8,84 pt (167,96 pt, el ancho del lugar), el
// carácter de los renglones del papel.
const RENGLON_DEL_PROFESIONAL = "…".repeat(19);
const ZONAS_DEL_PROFESIONAL: Zona[] = [
  { id: "renglon_firma_profesional", pagina: 2, x: 208, y: 868, ancho: 168, tamano: 8.84, texto: RENGLON_DEL_PROFESIONAL },
  { id: "renglon_aclaracion_profesional", pagina: 2, x: 388, y: 868, ancho: 168, tamano: 8.84, texto: RENGLON_DEL_PROFESIONAL },
  hueco("aclaracion_profesional", 2, 868, 388, 556, "{{odontologo}}", { alinear: "centro" }),
  rotulo("rotulo_firma_profesional", 878, 208, 376, "Firma del profesional"),
  rotulo("rotulo_aclaracion_profesional", 878, 388, 556, "Aclaración"),
];
const FIRMA_DEL_PROFESIONAL: LugarDeFirma = { rol: "profesional", pagina: 2, x: 208, y: 868, ancho: 168, alto: 34 };

// Un hueco corto: arranca a 8 pt y se achica hasta 5 para que entre.
const ACHICABLE = { tamano: 8, minimo: 5 } as const;

export const historiaClinicaPcd: Plantilla = {
  id: "historia-clinica-pcd",
  version: 1,
  nombre: "Historia clínica general para PcD",
  tipo: "historia_clinica",
  descripcion:
    "Historia clínica general para personas con discapacidad: datos del paciente, discapacidad y cuidados, cuestionario de salud con tenor de declaración jurada, historia odontológica, odontograma, diagnóstico, plan de tratamiento y consentimiento.",
  fuente: {
    nombre: "Colegio Odontológico de la Provincia de Córdoba",
    url: "https://colodontcba.org.ar/wp-content/uploads/HC-PcD.pdf",
  },
  secciones: [
    {
      id: "encabezado",
      titulo: "Lugar y profesional",
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
          id: "odontologo",
          etiqueta: "Odontólogo",
          requerido: true,
          precarga: "profesional.nombreCompleto",
          bloqueado: true,
        },
        {
          tipo: "texto",
          id: "matricula",
          etiqueta: "Nº de matrícula",
          requerido: true,
          precarga: "profesional.matriculaNumero",
          bloqueado: true,
        },
      ],
    },
    {
      id: "paciente",
      titulo: "Paciente",
      campos: [
        {
          tipo: "texto",
          id: "paciente_nombre",
          etiqueta: "Paciente",
          requerido: true,
          precarga: "paciente.nombreCompleto",
        },
        {
          tipo: "texto",
          id: "dni",
          etiqueta: "DNI",
          precarga: "paciente.dni",
        },
        {
          tipo: "texto",
          id: "obra_social",
          etiqueta: "Obra social",
          precarga: "paciente.obraSocial",
        },
        {
          tipo: "texto",
          id: "plan_obra_social",
          etiqueta: "Plan",
          precarga: "paciente.obraSocialPlan",
        },
        {
          tipo: "texto",
          id: "afiliado",
          etiqueta: "Número de afiliado",
          precarga: "paciente.obraSocialAfiliado",
        },
        {
          tipo: "fecha",
          id: "fecha_nacimiento",
          etiqueta: "Fecha de nacimiento",
          precarga: "paciente.fechaNacimiento",
        },
        {
          tipo: "numero",
          id: "edad",
          etiqueta: "Edad",
          unidad: "años",
          min: 0,
          max: 120,
        },
        { tipo: "texto", id: "nacionalidad", etiqueta: "Nacionalidad" },
        // Una opción y no un texto: el hueco del papel mide 33 pt.
        {
          tipo: "opcion_unica",
          id: "grupo_sanguineo",
          etiqueta: "Grupo sanguíneo",
          opciones: [
            { valor: "0_pos", etiqueta: "0+" },
            { valor: "0_neg", etiqueta: "0−" },
            { valor: "a_pos", etiqueta: "A+" },
            { valor: "a_neg", etiqueta: "A−" },
            { valor: "b_pos", etiqueta: "B+" },
            { valor: "b_neg", etiqueta: "B−" },
            { valor: "ab_pos", etiqueta: "AB+" },
            { valor: "ab_neg", etiqueta: "AB−" },
          ],
        },
        { tipo: "texto", id: "estado_civil", etiqueta: "Estado civil" },
        // El teléfono de la ficha es el del WhatsApp de los turnos: un celular.
        {
          tipo: "texto",
          id: "celular",
          etiqueta: "Celular",
          precarga: "paciente.telefono",
        },
        {
          tipo: "texto",
          id: "domicilio",
          etiqueta: "Domicilio (calle, número, barrio, localidad)",
          precarga: "paciente.domicilio",
        },
        { tipo: "texto", id: "profesion", etiqueta: "Profesión o actividad" },
        { tipo: "texto", id: "titular", etiqueta: "Titular de la obra social" },
        { tipo: "texto", id: "lugar_trabajo", etiqueta: "Lugar de trabajo" },
        { tipo: "texto", id: "jerarquia", etiqueta: "Jerarquía" },
      ],
    },
    {
      id: "familia",
      titulo: "Antecedentes familiares",
      campos: [
        { tipo: "si_no", id: "padre_vive", etiqueta: "¿Padre con vida?" },
        {
          tipo: "texto_largo",
          id: "padre_enfermedad",
          etiqueta: "Enfermedad que padece o padeció el padre",
        },
        { tipo: "si_no", id: "madre_vive", etiqueta: "¿Madre con vida?" },
        {
          tipo: "texto_largo",
          id: "madre_enfermedad",
          etiqueta: "Enfermedad que padece o padeció la madre",
        },
        { tipo: "si_no", id: "hermanos", etiqueta: "¿Hermanos?" },
        { tipo: "texto", id: "hermanos_sanos", etiqueta: "¿Sanos?" },
      ],
    },
    {
      id: "discapacidad",
      titulo: "Discapacidad y cuidados",
      campos: [
        {
          tipo: "si_no",
          id: "movilidad_asistida",
          etiqueta: "¿Necesita movilidad asistida?",
        },
        {
          tipo: "si_no",
          id: "silla_ruedas",
          etiqueta: "¿Utiliza silla de ruedas?",
        },
        {
          tipo: "si_no",
          id: "diagnostico_medico",
          etiqueta: "¿Posee un diagnóstico médico?",
          detalle: { etiqueta: "Diagnóstico médico", cuando: "si" },
        },
        {
          tipo: "texto_largo",
          id: "medicacion_administrada",
          etiqueta: "Medicación administrada",
        },
        { tipo: "texto", id: "peso_talla", etiqueta: "Peso y talla" },
        {
          tipo: "texto",
          id: "centro_dia",
          etiqueta: "¿Asiste a algún centro de día?",
        },
        {
          tipo: "si_no",
          id: "movimientos_involuntarios",
          etiqueta: "¿Antecedente de movimientos involuntarios?",
        },
      ],
    },
    {
      id: "salud",
      titulo: "Deporte, alergias y cicatrización",
      campos: [
        { tipo: "si_no", id: "deporte", etiqueta: "¿Realiza algún deporte?" },
        {
          tipo: "si_no",
          id: "deporte_malestar",
          etiqueta: "¿Nota algún malestar al realizarlo?",
        },
        {
          tipo: "si_no",
          id: "alergico",
          etiqueta: "¿Es alérgico a alguna droga?",
        },
        {
          tipo: "opcion_multiple",
          id: "alergias",
          etiqueta: "¿A cuáles?",
          opciones: [
            { valor: "anestesia", etiqueta: "A la anestesia" },
            { valor: "penicilina", etiqueta: "A la penicilina" },
          ],
        },
        { tipo: "texto", id: "alergias_otras", etiqueta: "Otras drogas" },
        {
          tipo: "texto_largo",
          id: "cicatrizacion",
          etiqueta: "Cuando se lastima, ¿cicatriza bien? ¿Sangra mucho?",
        },
        {
          tipo: "si_no",
          id: "colageno",
          etiqueta: "¿Tiene problema de colágeno (hiperlaxitud)?",
        },
        {
          tipo: "si_no",
          id: "fiebre_reumatica",
          etiqueta: "¿Antecedentes de fiebre reumática?",
        },
      ],
    },
    {
      id: "enfermedades",
      titulo: "Enfermedades",
      campos: [
        { tipo: "si_no", id: "diabetico", etiqueta: "¿Es diabético?" },
        {
          tipo: "texto",
          id: "diabetes_controlada",
          etiqueta: "¿Está controlado?",
        },
        {
          tipo: "si_no",
          id: "cardiaco",
          etiqueta: "¿Tiene algún problema cardíaco?",
          detalle: { etiqueta: "¿Cuál?", cuando: "si" },
        },
        {
          tipo: "si_no",
          id: "aspirina",
          etiqueta: "¿Toma seguido aspirina o ibuprofeno?",
          detalle: { etiqueta: "¿Con qué frecuencia?", cuando: "si" },
        },
        {
          tipo: "texto",
          id: "presion_arterial",
          etiqueta: "Valores de presión arterial",
        },
        { tipo: "si_no", id: "chagas", etiqueta: "¿Chagas?" },
        {
          tipo: "texto",
          id: "chagas_tratamiento",
          etiqueta: "¿Está en tratamiento?",
        },
        { tipo: "si_no", id: "renales", etiqueta: "¿Tiene problemas renales?" },
        { tipo: "si_no", id: "ulcera", etiqueta: "¿Úlcera gástrica?" },
        { tipo: "si_no", id: "boton_gastrico", etiqueta: "¿Botón gástrico?" },
        { tipo: "si_no", id: "hepatitis", etiqueta: "¿Tuvo hepatitis?" },
        {
          tipo: "opcion_multiple",
          id: "hepatitis_tipo",
          etiqueta: "¿De qué tipo?",
          opciones: [
            { valor: "a", etiqueta: "A" },
            { valor: "b", etiqueta: "B" },
            { valor: "c", etiqueta: "C" },
          ],
        },
        {
          tipo: "si_no",
          id: "hepatico",
          etiqueta: "¿Tiene algún problema hepático?",
          detalle: { etiqueta: "¿Cuál?", cuando: "si" },
        },
        { tipo: "si_no", id: "convulsiones", etiqueta: "¿Tuvo convulsiones?" },
        {
          tipo: "si_no",
          id: "epileptico",
          etiqueta: "¿Es epiléptico?",
          detalle: { etiqueta: "Medicación que toma", cuando: "si" },
        },
        {
          tipo: "si_no",
          id: "ets",
          etiqueta: "¿Ha tenido enfermedades de transmisión sexual?",
          detalle: { etiqueta: "¿Cuál?", cuando: "si" },
        },
        {
          tipo: "si_no",
          id: "infecto",
          etiqueta: "¿Otra enfermedad infecto-contagiosa?",
        },
        {
          tipo: "si_no",
          id: "transfusiones",
          etiqueta: "¿Tuvo transfusiones?",
        },
        {
          tipo: "si_no",
          id: "internado",
          etiqueta: "¿Estuvo internado?",
          detalle: { etiqueta: "Motivo", cuando: "si" },
        },
        {
          tipo: "si_no",
          id: "operado",
          etiqueta: "¿Fue operado alguna vez?",
          detalle: { etiqueta: "¿De qué?", cuando: "si" },
        },
        { tipo: "texto", id: "operado_cuando", etiqueta: "¿Cuándo?" },
        {
          tipo: "si_no",
          id: "respiratorio",
          etiqueta: "¿Tiene algún problema respiratorio?",
          detalle: { etiqueta: "¿Cuál?", cuando: "si" },
        },
        { tipo: "si_no", id: "fuma", etiqueta: "¿Fuma?" },
        {
          tipo: "si_no",
          id: "embarazada",
          etiqueta: "¿Está embarazada?",
          detalle: { etiqueta: "¿De cuántos meses?", cuando: "si" },
        },
        {
          tipo: "si_no",
          id: "otra_enfermedad",
          etiqueta:
            "¿Hay alguna otra enfermedad o recomendación de su médico que quiera dejar constancia?",
          detalle: { etiqueta: "¿Cuál?", cuando: "si" },
        },
      ],
    },
    {
      id: "medico",
      titulo: "Médico y derivación",
      campos: [
        {
          tipo: "texto",
          id: "homeopatia",
          etiqueta:
            "¿Realiza algún tipo de tratamiento homeopático, acupuntura u otros?",
        },
        { tipo: "texto", id: "medico_cabecera", etiqueta: "Médico de cabecera" },
        {
          tipo: "si_no",
          id: "informe_medico",
          etiqueta: "¿Adjunta informe médico?",
        },
        {
          tipo: "si_no",
          id: "cud",
          etiqueta: "¿Presenta el Certificado Único de Discapacidad?",
        },
        {
          tipo: "texto",
          id: "derivacion",
          etiqueta: "Clínica u hospital en caso de hacer falta derivación",
        },
        { tipo: "texto", id: "asa", etiqueta: "ASA tipo" },
      ],
    },
    {
      id: "consulta",
      titulo: "Consulta y experiencia odontológica",
      campos: [
        {
          tipo: "texto_largo",
          id: "motivo_consulta",
          etiqueta: "Motivo de la consulta",
        },
        {
          tipo: "si_no",
          id: "experiencia_previa",
          etiqueta: "¿Tiene experiencia odontológica previa?",
        },
        {
          tipo: "si_no",
          id: "intervencion_quirurgica",
          etiqueta: "¿Antecedente de intervención quirúrgica?",
        },
        {
          tipo: "si_no",
          id: "anestesia_general",
          etiqueta: "¿Con anestesia general?",
        },
        {
          tipo: "si_no",
          id: "sedacion",
          etiqueta: "¿Con sedación consciente o similar?",
        },
      ],
    },
    {
      id: "dolor",
      titulo: "Dolor y medicación",
      campos: [
        { tipo: "si_no", id: "dolor", etiqueta: "¿Ha tenido dolor?" },
        { tipo: "texto_largo", id: "dolor_tipo", etiqueta: "¿De qué tipo?" },
        {
          tipo: "opcion_multiple",
          id: "dolor_localizacion",
          etiqueta: "¿Localizado o irradiado?",
          opciones: [
            { valor: "localizado", etiqueta: "Localizado" },
            { valor: "irradiado", etiqueta: "Irradiado" },
          ],
        },
        { tipo: "texto", id: "dolor_donde", etiqueta: "Localizado: ¿dónde?" },
        {
          tipo: "texto",
          id: "dolor_hacia_donde",
          etiqueta: "Irradiado: ¿hacia dónde?",
        },
        {
          tipo: "texto_largo",
          id: "tomo_medicacion",
          etiqueta: "¿Tomó alguna medicación?",
        },
      ],
    },
    {
      id: "golpes",
      titulo: "Golpes y fracturas",
      campos: [
        {
          tipo: "si_no",
          id: "golpe",
          etiqueta: "¿Sufrió algún golpe en los dientes?",
        },
        { tipo: "texto", id: "golpe_cuando", etiqueta: "¿Cuándo?" },
        {
          tipo: "texto_largo",
          id: "golpe_como",
          etiqueta: "¿Cómo se produjo?",
        },
        {
          tipo: "si_no",
          id: "fractura",
          etiqueta: "¿Se le fracturó algún diente?",
          detalle: { etiqueta: "¿Cuál?", cuando: "si" },
        },
        {
          tipo: "texto_largo",
          id: "fractura_tratamiento",
          etiqueta: "¿Recibió algún tratamiento?",
        },
      ],
    },
    {
      id: "funciones",
      titulo: "Dificultades",
      campos: [
        {
          tipo: "texto",
          id: "dificultad_hablar",
          etiqueta: "¿Tiene dificultad para hablar?",
        },
        {
          tipo: "texto",
          id: "dificultad_masticar",
          etiqueta: "¿Para masticar?",
        },
        {
          tipo: "texto",
          id: "dificultad_abrir",
          etiqueta: "¿Para abrir la boca?",
        },
        {
          tipo: "texto",
          id: "dificultad_tragar",
          etiqueta: "¿Para tragar los alimentos?",
        },
        {
          tipo: "texto",
          id: "dificultad_expectorar",
          etiqueta: "¿Tiene dificultad para tragar y/o expectorar?",
        },
      ],
    },
    {
      id: "lesiones",
      titulo: "Lesiones",
      campos: [
        { tipo: "si_no", id: "manchas", etiqueta: "¿Manchas?" },
        {
          tipo: "si_no",
          id: "abultamiento",
          etiqueta: "¿Abultamiento de los tejidos?",
        },
        { tipo: "si_no", id: "ulceraciones", etiqueta: "¿Ulceraciones?" },
        { tipo: "si_no", id: "ampollas", etiqueta: "¿Ampollas?" },
        { tipo: "texto", id: "lesiones_otras", etiqueta: "Otras lesiones" },
        {
          tipo: "si_no",
          id: "encias_sangran",
          etiqueta: "¿Le sangran las encías?",
          detalle: { etiqueta: "¿Cuándo?", cuando: "si" },
        },
      ],
    },
    {
      id: "signos",
      titulo: "Oclusión e higiene",
      campos: [
        {
          tipo: "si_no",
          id: "pus",
          etiqueta: "¿Sale pus de algún lugar de su boca?",
          detalle: { etiqueta: "¿De dónde?", cuando: "si" },
        },
        {
          tipo: "si_no",
          id: "movilidad",
          etiqueta: "¿Tiene movilidad en sus dientes?",
        },
        { tipo: "texto", id: "trauma_oclusal", etiqueta: "Trauma oclusal" },
        {
          tipo: "si_no",
          id: "ruidos",
          etiqueta: "¿Ruidos o chasquidos?",
        },
        { tipo: "texto", id: "tipo_mordida", etiqueta: "Tipo de mordida" },
        {
          tipo: "texto",
          id: "frecuencia_cepillado",
          etiqueta: "Frecuencia de cepillado",
        },
        {
          tipo: "opcion_multiple",
          id: "cepillo",
          etiqueta: "¿Con qué se higieniza?",
          opciones: [
            { valor: "manual", etiqueta: "Cepillo manual" },
            { valor: "electrico", etiqueta: "Cepillo eléctrico" },
            { valor: "hilo_dental", etiqueta: "Hilo dental" },
          ],
        },
        { tipo: "texto", id: "cepillo_otro", etiqueta: "Otro" },
        {
          tipo: "si_no",
          id: "se_cepilla_solo",
          etiqueta: "¿Se cepilla solo?",
        },
        {
          tipo: "texto",
          id: "momentos_azucar",
          etiqueta: "Momentos de azúcar diario",
        },
        { tipo: "texto", id: "indice_placa", etiqueta: "Índice de placa" },
        {
          tipo: "opcion_unica",
          id: "higiene",
          etiqueta: "Estado de la higiene bucal",
          opciones: [
            { valor: "muy_bueno", etiqueta: "Muy bueno" },
            { valor: "bueno", etiqueta: "Bueno" },
            { valor: "deficiente", etiqueta: "Deficiente" },
            { valor: "malo", etiqueta: "Malo" },
          ],
        },
      ],
    },
    {
      id: "odontograma",
      titulo: "Odontograma",
      campos: [
        {
          tipo: "odontograma",
          id: "odontograma",
          etiqueta: "Odontograma",
          leyenda: "general",
          denticion: "ambas",
          existentes: true,
        },
      ],
    },
    {
      id: "estado_bucal",
      titulo: "Estado bucal general",
      campos: [
        { tipo: "si_no", id: "sarro", etiqueta: "¿Presencia de sarro?" },
        {
          tipo: "si_no",
          id: "periodontal",
          etiqueta: "¿Enfermedad periodontal?",
        },
      ],
    },
    {
      id: "diagnostico",
      titulo: "Diagnóstico, plan y estudios",
      campos: [
        {
          tipo: "texto_largo",
          id: "diagnostico",
          etiqueta: "Diagnóstico presuntivo",
        },
        {
          tipo: "numero",
          id: "diagnostico_anexo",
          etiqueta: "Continúa en anexo Nº",
          continuaEnAnexo: "diagnostico",
          min: 1,
          max: 999,
        },
        {
          tipo: "fecha",
          id: "plan_fecha",
          etiqueta: "Fecha del plan de tratamiento",
        },
        { tipo: "texto_largo", id: "plan", etiqueta: "Plan de tratamiento" },
        {
          tipo: "numero",
          id: "plan_anexo",
          etiqueta: "Continúa en anexo Nº",
          continuaEnAnexo: "plan",
          min: 1,
          max: 999,
        },
        { tipo: "texto_largo", id: "observaciones", etiqueta: "Observaciones" },
        {
          tipo: "texto_largo",
          id: "estudios",
          etiqueta: "Estudios radiográficos y/o complementarios",
        },
        {
          tipo: "numero",
          id: "estudios_anexo",
          etiqueta: "Continúa en anexo Nº",
          continuaEnAnexo: "estudios",
          min: 1,
          max: 999,
        },
      ],
    },
    {
      id: "consentimiento",
      titulo: "Quien suscribe",
      campos: [
        // Precargados del paciente, pero editables: puede suscribir su tutor.
        {
          tipo: "texto",
          id: "suscribe_nombre",
          etiqueta: "Nombre y apellido",
          requerido: true,
          precarga: "paciente.nombreCompleto",
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
          precarga: "paciente.domicilio",
        },
      ],
    },
  ],
  cuerpo: [
    { t: "titulo", texto: "Historia clínica general para PcD" },
    { t: "parrafo", texto: "Lugar: {{lugar}}. Fecha: {{sistema.fecha}}." },
    {
      t: "parrafo",
      texto: "Odontólogo: {{odontologo}}. Nº de matrícula: {{matricula}}.",
    },
    { t: "parrafo", texto: "Paciente: {{paciente_nombre}}. DNI: {{dni}}." },
    {
      t: "parrafo",
      texto:
        "Obra social: {{obra_social}}. Plan: {{plan_obra_social}}. Número de afiliado: {{afiliado}}.",
    },
    {
      t: "parrafo",
      texto:
        "Fecha de nacimiento: {{fecha_nacimiento}}. Edad: {{edad}}. Nacionalidad: {{nacionalidad}}. Grupo sanguíneo: {{grupo_sanguineo}}. Estado civil: {{estado_civil}}. Cel.: {{celular}}.",
    },
    {
      t: "parrafo",
      texto: "Domicilio (calle, núm., barrio, localidad): {{domicilio}}.",
    },
    {
      t: "parrafo",
      texto:
        "Profesión/Actividad: {{profesion}}. Titular: {{titular}}. Lugar de trabajo: {{lugar_trabajo}}. Jerarquía: {{jerarquia}}.",
    },
    {
      t: "subtitulo",
      texto: "Este cuestionario tiene el tenor de una “Declaración Jurada”",
    },
    {
      t: "lista",
      items: [
        "¿Padre con vida? {{padre_vive}}. Enfermedad que padece o padeció: {{padre_enfermedad}}.",
        "¿Madre con vida? {{madre_vive}}. Enfermedad que padece o padeció: {{madre_enfermedad}}.",
        "¿Hermanos? {{hermanos}}. ¿Sanos? {{hermanos_sanos}}.",
        "¿Posee un diagnóstico médico? {{diagnostico_medico}}.",
        "Medicación administrada: {{medicacion_administrada}}.",
        "Peso y talla: {{peso_talla}}.",
        "¿Asiste a algún centro de día? {{centro_dia}}.",
        "¿Realiza algún deporte? {{deporte}}. ¿Nota algún malestar al realizarlo? {{deporte_malestar}}.",
        "¿Es alérgico a alguna droga? {{alergico}}. ¿A cuáles? {{alergias}}. Otras: {{alergias_otras}}.",
        "Cuando se lastima, ¿cicatriza bien? ¿Sangra mucho? {{cicatrizacion}}.",
        "¿Tiene problema de colágeno (hiperlaxitud)? {{colageno}}.",
        "¿Antecedentes de fiebre reumática? {{fiebre_reumatica}}.",
        "¿Es diabético? {{diabetico}}. ¿Está controlado? {{diabetes_controlada}}.",
        "¿Tiene algún problema cardíaco? {{cardiaco}}.",
        "¿Toma seguido aspirina y/o ibuprofeno? {{aspirina}}.",
        "Valores de presión arterial: {{presion_arterial}}.",
        "¿Chagas? {{chagas}}. ¿Está en tratamiento? {{chagas_tratamiento}}.",
        "¿Tiene problemas renales? {{renales}}.",
        "¿Úlcera gástrica? {{ulcera}}.",
        "¿Botón gástrico? {{boton_gastrico}}.",
        "¿Tuvo hepatitis? {{hepatitis}}. ¿De qué tipo? {{hepatitis_tipo}}.",
        "¿Tiene algún problema hepático? {{hepatico}}.",
        "¿Tuvo convulsiones? {{convulsiones}}.",
        "¿Es epiléptico? {{epileptico}}.",
        "¿Antecedente de movimientos involuntarios? {{movimientos_involuntarios}}.",
        "¿Necesita movilidad asistida? {{movilidad_asistida}}.",
        "¿Utiliza silla de ruedas? {{silla_ruedas}}.",
        "¿Ha tenido enfermedades de transmisión sexual? {{ets}}.",
        "¿Otra enfermedad infecto-contagiosa? {{infecto}}.",
        "¿Tuvo transfusiones? {{transfusiones}}.",
        "¿Estuvo internado? {{internado}}.",
        "¿Fue operado alguna vez? {{operado}}. ¿Cuándo? {{operado_cuando}}.",
        "¿Tiene algún problema respiratorio? {{respiratorio}}.",
        "¿Fuma? {{fuma}}.",
        "¿Está embarazada? {{embarazada}}.",
        "¿Hay alguna otra enfermedad o recomendación de su médico que quiera dejar constancia? {{otra_enfermedad}}.",
        "¿Realiza algún tipo de tratamiento homeopático, acupuntura, otros? {{homeopatia}}.",
        "Médico de cabecera: {{medico_cabecera}}.",
        "¿Adjunta informe médico? {{informe_medico}}.",
        "¿Presenta el Certificado Único de Discapacidad? {{cud}}.",
        "Clínica/Hospital en caso de hacer falta derivación: {{derivacion}}.",
        "ASA tipo: {{asa}}.",
      ],
    },
    { t: "subtitulo", texto: "Historia clínica odontológica" },
    {
      t: "lista",
      items: [
        "Motivo de la consulta: {{motivo_consulta}}.",
        "¿Tiene experiencia odontológica previa? {{experiencia_previa}}.",
        "¿Antecedente de intervención quirúrgica? {{intervencion_quirurgica}}. ¿Con anestesia general? {{anestesia_general}}. ¿Con sedación consciente o similar? {{sedacion}}.",
        "¿Ha tenido dolor? {{dolor}}. ¿De qué tipo? {{dolor_tipo}}.",
        "¿Localizado o irradiado? {{dolor_localizacion}}. Localizado, ¿dónde? {{dolor_donde}}. Irradiado, ¿hacia dónde? {{dolor_hacia_donde}}.",
        "¿Tomó alguna medicación? {{tomo_medicacion}}.",
        "¿Sufrió algún golpe en los dientes? {{golpe}}. ¿Cuándo? {{golpe_cuando}}. ¿Cómo se produjo? {{golpe_como}}.",
        "¿Se le fracturó algún diente? {{fractura}}. ¿Recibió algún tratamiento? {{fractura_tratamiento}}.",
        "¿Tiene dificultad para hablar? {{dificultad_hablar}}. ¿Para masticar? {{dificultad_masticar}}. ¿Para abrir la boca? {{dificultad_abrir}}. ¿Para tragar los alimentos? {{dificultad_tragar}}.",
        "¿Tiene dificultad para tragar y/o expectorar? {{dificultad_expectorar}}.",
        "¿Qué tipo de lesiones presenta? Manchas: {{manchas}}. Abultamiento de los tejidos: {{abultamiento}}. Ulceraciones: {{ulceraciones}}. Ampollas: {{ampollas}}. Otros: {{lesiones_otras}}.",
        "¿Le sangran las encías? {{encias_sangran}}.",
        "¿Sale pus de algún lugar de su boca? {{pus}}.",
        "¿Tiene movilidad en sus dientes? {{movilidad}}.",
        "Trauma oclusal: {{trauma_oclusal}}.",
        "¿Ruidos o chasquidos? {{ruidos}}.",
        "Tipo de mordida: {{tipo_mordida}}.",
        "Frecuencia de cepillado: {{frecuencia_cepillado}}.",
        "Cepillo manual, eléctrico, hilo dental: {{cepillo}}. Otro: {{cepillo_otro}}.",
        "¿Se cepilla solo? {{se_cepilla_solo}}.",
        "Momentos de azúcar diario: {{momentos_azucar}}. Índice de placa: {{indice_placa}}.",
        "Estado de la higiene bucal: {{higiene}}.",
      ],
    },
    {
      t: "parrafo",
      texto:
        "Declaro que he contestado todas las preguntas con honestidad y según mi conocimiento. Asimismo, he sido informado que los datos suministrados quedan reservados en la presente Historia Clínica y amparados en secreto profesional.",
    },
    { t: "campo", campo: "odontograma" },
    {
      t: "parrafo",
      texto:
        "Estado bucal general: presencia de sarro: {{sarro}}. Enfermedad periodontal: {{periodontal}}.",
    },
    { t: "campo", campo: "diagnostico" },
    { t: "parrafo", texto: "Continúa en anexo Nº {{diagnostico_anexo}}." },
    { t: "parrafo", texto: "Plan de tratamiento. Fecha: {{plan_fecha}}." },
    { t: "campo", campo: "plan" },
    { t: "parrafo", texto: "Continúa en anexo Nº {{plan_anexo}}." },
    { t: "campo", campo: "observaciones" },
    { t: "campo", campo: "estudios" },
    { t: "parrafo", texto: "Continúa en anexo Nº {{estudios_anexo}}." },
    {
      t: "parrafo",
      texto:
        "He comprendido todas las explicaciones que se me han facilitado en el lenguaje claro y sencillo, he podido realizar todas las observaciones y se me han aclarado todas las dudas; por lo que estoy completamente de acuerdo con el tratamiento que se me va a realizar.",
    },
    {
      t: "parrafo",
      texto:
        "El/la que suscribe {{suscribe_nombre}}, DNI Nº {{suscribe_dni}}, con domicilio en calle {{suscribe_domicilio}}, otorgo mi consentimiento para realizar el tratamiento necesario para rehabilitar mi salud bucodental propuesta por el/la Dr/a {{odontologo}}, MP {{matricula}}.",
    },
    { t: "firmas" },
  ],
  firmas: [
    { rol: "paciente", etiqueta: "Paciente o tutor", requerida: true },
    { rol: "profesional", etiqueta: "Profesional odontólogo", requerida: true },
  ],
  // A4 (595,6 × 842 pt), dos páginas, en Arial de 8 y 9 pt (7 pt el
  // diagnóstico, el plan y el consentimiento) con renglones de puntos.
  // Medido con scripts/medir-huecos.py; las casillas, por los píxeles del
  // glifo; el odontograma, con scripts/medir-odontograma.py sobre la imagen
  // escaneada de la página 2.
  lamina: {
    paginas: [
      { ancho: 595.6, alto: 842 },
      // Al 93 %: la franja libre de abajo (y hasta 905 en coordenadas del
      // original) lleva el bloque del profesional, que termina en 880 —818 en
      // la hoja—, por encima del pie de página del PDF (desde 823).
      { ancho: 595.6, alto: 842, escala: 0.93 },
    ],
    zonas: [
      // Encabezado.
      hueco("lugar", 1, 113.3, 270.5, 464.4, "{{lugar}}"),
      hueco("fecha_dia", 1, 113.3, 491.5, 509.5, "{{sistema.fecha:dia}}", {
        alinear: "centro",
      }),
      hueco("fecha_mes", 1, 113.3, 511.5, 528.5, "{{sistema.fecha:mes}}", {
        alinear: "centro",
      }),
      hueco("fecha_anio", 1, 113.3, 532.5, 554, "{{sistema.fecha:anio}}", {
        alinear: "centro",
      }),
      { id: "odontologo", pagina: 1, x: 98, y: 140.8, ancho: 355, texto: "{{odontologo}}" },
      // Cinco casillas de 14,9 a 17,7 pt: el paso deja cada carácter a
      // menos de 0,2 pt del centro de la suya.
      {
        id: "matricula",
        pagina: 1,
        x: 458.28,
        y: 148.7,
        ancho: 89.5,
        casillas: { cantidad: 5, paso: 17.9 },
        texto: "{{matricula}}",
      },
      { id: "paciente_nombre", pagina: 1, x: 84, y: 183, ancho: 200, texto: "{{paciente_nombre}}" },
      // Dieciséis casillas de 10,1 a 17,1 pt: el paso minimiza el corrimiento
      // más grande (2 pt, dentro de la casilla).
      {
        id: "dni",
        pagina: 1,
        x: 321.28,
        y: 186.8,
        ancho: 228.16,
        casillas: { cantidad: 16, paso: 14.26 },
        texto: "{{dni}}",
      },
      hueco("obra_social", 1, 215.1, 67.1, 269.3, "{{obra_social}}", { tamano: 8 }),
      hueco("plan_obra_social", 1, 215.1, 285.8, 343.2, "{{plan_obra_social}}", ACHICABLE),
      hueco("afiliado", 1, 215.1, 396.4, 540.1, "{{afiliado}}", { tamano: 8 }),
      hueco("fecha_nacimiento", 1, 225.4, 47.9, 191.2, "{{fecha_nacimiento}}", { tamano: 8 }),
      hueco("edad", 1, 225.4, 210.3, 246.2, "{{edad}}", { tamano: 8, vacio: "—" }),
      hueco("nacionalidad", 1, 225.4, 287.9, 453.2, "{{nacionalidad}}", { tamano: 8 }),
      hueco("grupo_sanguineo", 1, 225.4, 508.8, 541.4, "{{grupo_sanguineo}}", {
        tamano: 8,
        vacio: "—",
      }),
      hueco("estado_civil", 1, 238.3, 68.6, 270.6, "{{estado_civil}}", { tamano: 8 }),
      hueco("celular", 1, 238.3, 285.5, 542.3, "{{celular}}", { tamano: 8 }),
      hueco("domicilio", 1, 251.3, 169.5, 546.7, "{{domicilio}}", { tamano: 8 }),
      hueco("profesion", 1, 264.2, 90.2, 228.2, "{{profesion}}", { tamano: 8 }),
      hueco("titular", 1, 264.2, 250.2, 316.1, "{{titular}}", ACHICABLE),
      hueco("lugar_trabajo", 1, 264.2, 379.8, 475.7, "{{lugar_trabajo}}", { tamano: 8 }),
      hueco("jerarquia", 1, 264.2, 506.2, 555.2, "{{jerarquia}}", {
        ...ACHICABLE,
        vacio: "—",
      }),

      // Cuestionario, columna izquierda.
      ...izquierda("padre_vive", 299.0),
      renglones("padre_enfermedad", 1, [310.0, 319.8], 175.9, 35.4, 285.5, "{{padre_enfermedad}}"),
      ...izquierda("madre_vive", 332.3),
      renglones("madre_enfermedad", 1, [343.2, 353.2], 175.9, 35.4, 285.5, "{{madre_enfermedad}}"),
      ...izquierda("hermanos", 365.7),
      hueco("hermanos_sanos", 1, 376.2, 69.7, 283.1, "{{hermanos_sanos}}"),
      ...izquierda("diagnostico_medico", 388.8),
      hueco("diagnostico_medico_detalle", 1, 399.3, 136.1, 282.3, "{{diagnostico_medico:detalle}}"),
      renglones(
        "medicacion_administrada",
        1,
        [409.5, 419.8, 430.1, 440.6, 450.9],
        142.3,
        35.4,
        288.0,
        "{{medicacion_administrada}}",
      ),
      hueco("peso_talla", 1, 461.3, 85.0, 288.0, "{{peso_talla}}"),
      renglones("centro_dia", 1, [471.7, 482.0], 152.1, 35.4, 287.1, "{{centro_dia}}"),
      ...izquierda("deporte", 494.1),
      ...izquierda("deporte_malestar", 506.5),
      ...izquierda("alergico", 519.4),
      enHueco("alergias_anestesia", 1, 530.2, 90.6, 113.6, "{{alergias=anestesia}}"),
      enHueco("alergias_penicilina", 1, 530.2, 172.5, 192.4, "{{alergias=penicilina}}"),
      hueco("alergias_otras", 1, 530.2, 214.7, 284.7, "{{alergias_otras}}", ACHICABLE),
      // El hueco de la pregunta (47 pt) es angosto: los dos renglones de abajo.
      renglones("cicatrizacion", 1, [551.1, 561.1], 35.4, 35.4, 283.0, "{{cicatrizacion}}"),
      ...izquierda("colageno", 573.6),
      ...izquierda("fiebre_reumatica", 586.7),
      ...izquierda("diabetico", 599.7),
      hueco("diabetes_controlada", 1, 610.1, 103.6, 280.8, "{{diabetes_controlada}}"),
      ...izquierda("cardiaco", 622.5),
      hueco("cardiaco_detalle", 1, 633.1, 57.0, 284.2, "{{cardiaco:detalle}}"),
      ...izquierda("aspirina", 645.5),
      hueco("aspirina_detalle", 1, 656.0, 118.3, 285.2, "{{aspirina:detalle}}"),
      hueco("presion_arterial", 1, 668.3, 141.5, 276.4, "{{presion_arterial}}"),
      ...izquierda("chagas", 681.0),
      hueco("chagas_tratamiento", 1, 691.3, 118.6, 280.8, "{{chagas_tratamiento}}"),
      ...izquierda("renales", 703.5),
      ...izquierda("ulcera", 716.1),
      ...siNo("boton_gastrico", 1, 727.2, 244.7, 272.5, MEDIO),
      ...izquierda("hepatitis", 739.2),
      casilla("hepatitis_tipo_a", 1, 751.8, 127.2, "{{hepatitis_tipo=a}}"),
      casilla("hepatitis_tipo_b", 1, 751.8, 151.3, "{{hepatitis_tipo=b}}"),
      casilla("hepatitis_tipo_c", 1, 751.8, 174.7, "{{hepatitis_tipo=c}}"),
      ...izquierda("hepatico", 764.8),
      hueco("hepatico_detalle", 1, 775.3, 62.4, 283.1, "{{hepatico:detalle}}"),
      ...izquierda("convulsiones", 787.4),
      ...izquierda("epileptico", 800.5),
      hueco("epileptico_detalle", 1, 811.0, 119.6, 283.5, "{{epileptico:detalle}}"),
      ...siNo("movimientos_involuntarios", 1, 823.6, 248.9, 277.9),

      // Cuestionario, columna derecha.
      ...derecha("movilidad_asistida", 282.4),
      ...derecha("silla_ruedas", 295.6),
      ...derecha("ets", 308.9),
      hueco("ets_detalle", 1, 322.2, 329.6, 554.3, "{{ets:detalle}}"),
      ...derecha("infecto", 336.3),
      ...derecha("transfusiones", 349.0),
      ...siNo("internado", 1, 361.7, 522.2, 551.3),
      hueco("internado_detalle", 1, 372.4, 334.3, 547.5, "{{internado:detalle}}"),
      ...derecha("operado", 384.9),
      hueco("operado_detalle", 1, 395.8, 343.3, 568.8, "{{operado:detalle}}"),
      hueco("operado_cuando", 1, 405.8, 344.6, 569.7, "{{operado_cuando}}"),
      ...derecha("respiratorio", 418.3),
      hueco("respiratorio_detalle", 1, 428.8, 333.3, 571.1, "{{respiratorio:detalle}}"),
      ...derecha("fuma", 441.1),
      ...derecha("embarazada", 454.0),
      hueco("embarazada_detalle", 1, 464.8, 390.1, 570.1, "{{embarazada:detalle}}"),
      ...derecha("otra_enfermedad", 487.4),
      renglones(
        "otra_enfermedad_detalle",
        1,
        [498.2, 508.6],
        329.6,
        308.0,
        573.2,
        "{{otra_enfermedad:detalle}}",
      ),
      hueco("homeopatia", 1, 529.5, 308.0, 571.5, "{{homeopatia}}"),
      hueco("medico_cabecera", 1, 539.8, 396.1, 569.5, "{{medico_cabecera}}"),
      ...siNo("informe_medico", 1, 552.9, 521.5, 550.3),
      ...derecha("cud", 566.7),
      // El hueco del título (61 pt) es angosto: el renglón entero de abajo.
      hueco("derivacion", 1, 588.2, 308.0, 569.0, "{{derivacion}}"),
      hueco("asa", 1, 598.5, 354.4, 570.5, "{{asa}}"),

      // Historia clínica odontológica.
      renglones("motivo_consulta", 1, [645.7, 656.0], 392.4, 308.0, 568.2, "{{motivo_consulta}}"),
      ...derecha("experiencia_previa", 665.9),
      ...siNo("intervencion_quirurgica", 1, 678.3, 520.5, 549.5),
      ...siNo("anestesia_general", 1, 689.1, 520.4, 549.4),
      ...siNo("sedacion", 1, 699.5, 519.5, 548.4),
      ...siNo("dolor", 1, 719.3, 515.3, 540.5, MEDIO),
      renglones("dolor_tipo", 1, [729.0, 738.8], 359.1, 308.0, 569.0, "{{dolor_tipo}}"),
      casilla("dolor_localizado", 1, 751.1, 353.2, "{{dolor_localizacion=localizado}}"),
      hueco("dolor_donde", 1, 751.1, 400.6, 552.0, "{{dolor_donde}}"),
      casilla("dolor_irradiado", 1, 763.7, 355.3, "{{dolor_localizacion=irradiado}}"),
      hueco("dolor_hacia_donde", 1, 763.7, 426.5, 571.5, "{{dolor_hacia_donde}}"),
      renglones("tomo_medicacion", 1, [774.5, 784.8], 408.5, 308.0, 568.2, "{{tomo_medicacion}}"),
      ...siNo("golpe", 1, 797.9, 527.3, 561.0),
      // No hay renglón entero para el "cuándo": su hueco, achicando la letra.
      hueco("golpe_cuando", 1, 808.4, 342.6, 400.0, "{{golpe_cuando}}", ACHICABLE),
      renglones("golpe_como", 1, [808.4, 818.9], 475.7, 308.0, 568.2, "{{golpe_como}}"),

      // Página 2: fracturas y dificultades. El NO de la fractura quedó en el
      // renglón de abajo, al margen.
      casilla("fractura_si", 2, 56.5, 252.4, "{{fractura=si}}"),
      casilla("fractura_no", 2, 69.7, 35.4, "{{fractura=no}}"),
      hueco("fractura_detalle", 2, 80.2, 57.0, 274.5, "{{fractura:detalle}}"),
      renglones(
        "fractura_tratamiento",
        2,
        [91.0, 101.3],
        143.7,
        35.4,
        287.4,
        "{{fractura_tratamiento}}",
      ),
      hueco("dificultad_hablar", 2, 111.6, 153.2, 288.2, "{{dificultad_hablar}}"),
      hueco("dificultad_masticar", 2, 122.1, 100.2, 283.8, "{{dificultad_masticar}}"),
      hueco("dificultad_abrir", 2, 132.4, 115.8, 286.9, "{{dificultad_abrir}}"),
      hueco("dificultad_tragar", 2, 142.7, 144.7, 287.1, "{{dificultad_tragar}}"),
      hueco("dificultad_expectorar", 2, 163.5, 37.2, 287.7, "{{dificultad_expectorar}}"),

      // Página 2: lesiones. "Otros" quedó en la columna de la derecha.
      ...siNo("manchas", 2, 185.8, 238.5, 264.5, CHICO),
      ...siNo("abultamiento", 2, 198.5, 238.5, 264.5, CHICO),
      ...siNo("ulceraciones", 2, 211.1, 238.5, 264.5, CHICO),
      ...siNo("ampollas", 2, 224.2, 238.5, 264.5, CHICO),
      hueco("lesiones_otras", 2, 222.6, 327.3, 533.2, "{{lesiones_otras}}"),
      ...siNo("encias_sangran", 2, 235.0, 223.0, 245.7, CHICO),
      hueco("encias_sangran_detalle", 2, 245.6, 74.2, 259.1, "{{encias_sangran:detalle}}"),

      // Página 2: oclusión e higiene.
      ...siNo("pus", 2, 54.1, 495.6, 521.6, CHICO),
      hueco("pus_detalle", 2, 64.2, 347.5, 563.4, "{{pus:detalle}}"),
      ...siNo("movilidad", 2, 76.7, 519.6, 543.0, CHICO),
      hueco("trauma_oclusal", 2, 90.0, 364.2, 558.1, "{{trauma_oclusal}}"),
      ...siNo("ruidos", 2, 103.2, 518.5, 544.7, CHICO),
      hueco("tipo_mordida", 2, 116.4, 367.7, 552.6, "{{tipo_mordida}}"),
      hueco("frecuencia_cepillado", 2, 127.6, 398.2, 562.6, "{{frecuencia_cepillado}}"),
      enHueco("cepillo_manual", 2, 137.9, 362.8, 383.4, "{{cepillo=manual}}"),
      enHueco("cepillo_electrico", 2, 137.9, 416.7, 434.7, "{{cepillo=electrico}}"),
      enHueco("cepillo_hilo_dental", 2, 137.9, 475.8, 498.8, "{{cepillo=hilo_dental}}"),
      hueco("cepillo_otro", 2, 137.9, 514.3, 561.7, "{{cepillo_otro}}", ACHICABLE),
      ...siNo("se_cepilla_solo", 2, 150.4, 517.8, 544.0, CHICO),
      hueco("momentos_azucar", 2, 161.3, 413.2, 562.1, "{{momentos_azucar}}"),
      hueco("indice_placa", 2, 171.7, 365.4, 561.8, "{{indice_placa}}"),
      casilla("higiene_muy_bueno", 2, 202.0, 364.9, "{{higiene=muy_bueno}}", MEDIO),
      casilla("higiene_bueno", 2, 202.0, 407.6, "{{higiene=bueno}}", MEDIO),
      casilla("higiene_deficiente", 2, 202.0, 471.9, "{{higiene=deficiente}}", MEDIO),
      casilla("higiene_malo", 2, 202.0, 538.7, "{{higiene=malo}}", MEDIO),

      // Estado bucal general.
      ...siNo("sarro", 2, 503.1, 214.9, 245.7),
      ...siNo("periodontal", 2, 503.1, 399.3, 424.5, MEDIO),

      // Diagnóstico, plan, observaciones y estudios: renglones de puntos a 7 pt.
      renglones(
        "diagnostico",
        2,
        [536.8, 546.5, 556.1, 566.0],
        31.1,
        31.1,
        442.8,
        "{{diagnostico}}",
        { tamano: 8, minimo: 5 },
      ),
      hueco("diagnostico_anexo", 2, 575.5, 542.5, 563.5, "{{diagnostico_anexo}}", {
        tamano: 8,
        alinear: "centro",
        vacio: "—",
      }),
      hueco("plan_fecha_dia", 2, 588.2, 124.0, 137.9, "{{plan_fecha:dia}}", {
        tamano: 7,
        alinear: "centro",
        vacio: "—",
      }),
      hueco("plan_fecha_mes", 2, 588.2, 139.9, 153.9, "{{plan_fecha:mes}}", {
        tamano: 7,
        alinear: "centro",
        vacio: "—",
      }),
      // El año no entra en los puntos del papel (13 pt): sigue hacia la derecha.
      hueco("plan_fecha_anio", 2, 588.2, 155.8, 174.8, "{{plan_fecha:anio}}", {
        tamano: 7,
        alinear: "centro",
        vacio: "—",
      }),
      renglones("plan", 2, [598.1, 607.5, 617.3, 626.9], 31.1, 31.1, 442.8, "{{plan}}", {
        tamano: 8,
        minimo: 5,
      }),
      hueco("plan_anexo", 2, 636.7, 542.4, 563.4, "{{plan_anexo}}", {
        tamano: 8,
        alinear: "centro",
        vacio: "—",
      }),
      renglones(
        "observaciones",
        2,
        [656.0, 665.5, 675.3],
        31.1,
        31.1,
        442.8,
        "{{observaciones}}",
        { tamano: 8, minimo: 5 },
      ),
      renglones("estudios", 2, [694.5, 702.7], 31.1, 31.1, 443.3, "{{estudios}}", {
        tamano: 8,
        minimo: 5,
      }),
      hueco("estudios_anexo", 2, 694.7, 542.4, 563.4, "{{estudios_anexo}}", {
        tamano: 8,
        alinear: "centro",
        vacio: "—",
      }),

      // Consentimiento.
      hueco("suscribe_nombre", 2, 744.4, 89.4, 216.2, "{{suscribe_nombre}}", { tamano: 8 }),
      hueco("suscribe_dni", 2, 744.4, 237.6, 337.6, "{{suscribe_dni}}", { tamano: 8 }),
      hueco("suscribe_domicilio", 2, 744.4, 405.5, 558.3, "{{suscribe_domicilio}}", {
        tamano: 8,
      }),
      // "…propuesta por el/la Dr/a MP……": el nombre y la matrícula. Los
      // puntos (84 pt) no alcanzan para un nombre completo: siguen hasta el
      // margen, donde no hay nada escrito.
      hueco("consiente_profesional", 2, 760.4, 425.0, 564.0, "{{odontologo}}, {{matricula}}", {
        tamano: 7,
        minimo: 4.5,
      }),
      // Los tres renglones del pie: firma, aclaración y DNI de quien suscribe.
      hueco("aclaracion", 2, 817.9, 241.5, 379.0, "{{suscribe_nombre}}", { alinear: "centro" }),
      hueco("aclaracion_dni", 2, 817.9, 443.3, 556.3, "{{suscribe_dni}}", { alinear: "centro" }),
      // Sus rótulos, que el modelo pasó al principio de la página 3.
      rotulo("rotulo_firma_paciente", 829, 31.4, 174.0, "Firma del paciente o tutor"),
      rotulo("rotulo_aclaracion", 829, 241.5, 379.0, "aclaración"),
      rotulo("rotulo_dni", 829, 443.3, 556.3, "DNI Nº"),
      ...ZONAS_DEL_PROFESIONAL,
    ],
    firmas: [{ rol: "paciente", pagina: 2, x: 31.4, y: 817.9, ancho: 142.6, alto: 46 }, FIRMA_DEL_PROFESIONAL],
    odontogramas: [
      {
        campo: "odontograma",
        pagina: 2,
        piezas: [
          { pieza: "18", x: 27.0, y: 333.12, lado: 19.44 },
          { pieza: "17", x: 49.09, y: 333.12, lado: 19.44 },
          { pieza: "16", x: 71.29, y: 333.48, lado: 19.2 },
          { pieza: "15", x: 93.38, y: 333.48, lado: 19.68 },
          { pieza: "14", x: 115.94, y: 333.48, lado: 19.68 },
          { pieza: "13", x: 138.87, y: 333.6, lado: 19.44 },
          { pieza: "12", x: 160.95, y: 333.6, lado: 19.44 },
          { pieza: "11", x: 183.16, y: 333.48, lado: 19.68 },
          { pieza: "21", x: 215.2, y: 333.6, lado: 19.44 },
          { pieza: "22", x: 237.65, y: 333.72, lado: 19.68 },
          { pieza: "23", x: 260.33, y: 334.08, lado: 19.44 },
          { pieza: "24", x: 282.78, y: 334.2, lado: 19.2 },
          { pieza: "25", x: 304.86, y: 334.2, lado: 19.2 },
          { pieza: "26", x: 327.43, y: 334.2, lado: 19.2 },
          { pieza: "27", x: 349.63, y: 333.6, lado: 19.44 },
          { pieza: "28", x: 371.36, y: 333.48, lado: 19.68 },
          { pieza: "48", x: 27.6, y: 361.8, lado: 19.2 },
          { pieza: "47", x: 49.69, y: 361.8, lado: 19.2 },
          { pieza: "46", x: 71.65, y: 361.92, lado: 19.44 },
          { pieza: "45", x: 94.22, y: 361.92, lado: 19.44 },
          { pieza: "44", x: 116.78, y: 361.92, lado: 19.44 },
          { pieza: "43", x: 139.35, y: 361.92, lado: 19.44 },
          { pieza: "42", x: 161.55, y: 362.28, lado: 19.2 },
          { pieza: "41", x: 184.12, y: 362.28, lado: 19.2 },
          { pieza: "31", x: 215.2, y: 362.4, lado: 19.44 },
          { pieza: "32", x: 237.77, y: 362.4, lado: 19.44 },
          { pieza: "33", x: 260.33, y: 362.4, lado: 19.44 },
          { pieza: "34", x: 282.78, y: 362.52, lado: 19.2 },
          { pieza: "35", x: 304.98, y: 362.88, lado: 19.44 },
          { pieza: "36", x: 327.31, y: 362.64, lado: 19.44 },
          { pieza: "37", x: 349.75, y: 362.76, lado: 19.68 },
          { pieza: "38", x: 371.72, y: 362.88, lado: 19.44 },
          { pieza: "55", x: 94.58, y: 415.8, lado: 19.68 },
          { pieza: "54", x: 117.26, y: 416.16, lado: 19.44 },
          { pieza: "53", x: 139.83, y: 416.16, lado: 19.44 },
          { pieza: "52", x: 161.91, y: 416.16, lado: 19.44 },
          { pieza: "51", x: 184.12, y: 416.04, lado: 19.68 },
          { pieza: "61", x: 214.6, y: 416.28, lado: 19.68 },
          { pieza: "62", x: 237.41, y: 416.52, lado: 19.68 },
          { pieza: "63", x: 259.85, y: 416.64, lado: 19.44 },
          { pieza: "64", x: 282.3, y: 416.76, lado: 19.2 },
          { pieza: "65", x: 304.5, y: 416.64, lado: 19.44 },
          { pieza: "85", x: 93.74, y: 444.96, lado: 19.44 },
          { pieza: "84", x: 116.54, y: 445.2, lado: 19.44 },
          { pieza: "83", x: 138.99, y: 445.32, lado: 19.2 },
          { pieza: "82", x: 161.43, y: 445.44, lado: 19.44 },
          { pieza: "81", x: 183.64, y: 445.32, lado: 19.68 },
          { pieza: "71", x: 214.72, y: 445.44, lado: 19.44 },
          { pieza: "72", x: 237.41, y: 445.8, lado: 19.68 },
          { pieza: "73", x: 259.85, y: 445.92, lado: 19.44 },
          { pieza: "74", x: 282.42, y: 445.92, lado: 19.44 },
          { pieza: "75", x: 304.5, y: 445.92, lado: 19.44 },
        ],
        // La caja de "CANTIDAD DE DIENTES EXISTENTES" de las referencias.
        existentes: { x: 536.6, y: 462, ancho: 29.8, tamano: 10 },
      },
    ],
  },
};
