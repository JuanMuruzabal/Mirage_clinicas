import type { EstadisticaId, RedSocial, SubtipoFoto } from "./tipos";

// Espejo de los topes de apps/api/internal/http/pagina_publica.go — si se
// cambian allá hay que cambiarlos acá (el backend rechaza lo que se pase,
// así que un desfase se ve como un error al guardar, no como datos rotos).
// PE-1 los deja compartidos vía JSON Schema (`pnpm engine:generar`); hasta
// que esa generación exista, siguen siendo dos fuentes escritas a mano.
export const TOPE_FOTOS_GALERIA = 8;
export const TOPE_FOTOS_SUELTAS = 10;
export const MAX_LARGO_BIO = 2000;
export const MAX_LARGO_TITULO_TEXTO = 80;
export const MAX_LARGO_TEXTO_LIBRE = 2000;
export const MAX_LARGO_RED = 100;
export const MAX_LARGO_NOMBRE_MODULO = 60;
// El texto alternativo de una foto (PP-4, H13): una o dos frases alcanzan
// para contar qué se ve; más que eso ya es un párrafo que el lector de
// pantalla lee de corrido. Espejo de maxLargoAltFoto (pagina_publica.go),
// que valida el de la portada — el de los módulos lo valida el esquema.
export const MAX_LARGO_ALT_FOTO = 150;

export const ESTADISTICAS: { id: EstadisticaId; etiqueta: string; descripcion: string }[] = [
  { id: "pacientes_atendidos", etiqueta: "Pacientes atendidos", descripcion: "Personas con al menos un turno al que asistieron." },
  { id: "turnos_realizados", etiqueta: "Turnos realizados", descripcion: "Turnos marcados como asistidos." },
];

export const REDES_SOCIALES: { id: RedSocial; etiqueta: string; placeholder: string }[] = [
  { id: "instagram", etiqueta: "Instagram", placeholder: "@tuclinica" },
  { id: "facebook", etiqueta: "Facebook", placeholder: "tuclinica" },
  { id: "whatsapp", etiqueta: "WhatsApp", placeholder: "+54 9 351 1234567" },
];

export const SUBTIPOS_FOTO: { id: SubtipoFoto; etiqueta: string; descripcion: string }[] = [
  { id: "banner", etiqueta: "Banner", descripcion: "Horizontal, del ancho de la sección." },
  { id: "retrato", etiqueta: "Retrato", descripcion: "Vertical, más angosta." },
  { id: "franja", etiqueta: "Franja", descripcion: "Muy ancha y baja, de borde a borde." },
];
