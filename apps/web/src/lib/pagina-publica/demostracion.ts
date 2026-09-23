// Páginas de demostración (PE-9): una página pública armada con una
// plantilla del catálogo (PE-7) y datos de ejemplo, SIN pasar por la API.
//
// Existen para el presupuesto de rendimiento de CI (Lighthouse, ver
// lighthouserc.json): medir la página real necesitaría levantar Postgres, la
// API y una clínica publicada, y lo que se quiere medir es el costo de la
// PLANTILLA — efectos, fondos, tipografías —, que es lo que PE-4/PE-5
// pueden volver lento sin que nadie lo note.
//
// Apagadas salvo con PRISMA_DEMO_PLANTILLAS=1, que solo pone el job de CI:
// en producción la variable no existe y `demo-...` es un slug como cualquier
// otro (el de una clínica real, si alguna se llamara así).
import type { ClinicaPublica } from "@dental-mirage/shared-types";
import { plantillaPorId, type RubroPlantilla } from "@dental-mirage/prisma-engine";

export const PREFIJO_DEMOSTRACION = "demo-";

const ESPECIALIDADES: Record<RubroPlantilla, string[]> = {
  odontologia: ["Odontología general", "Ortodoncia", "Implantes"],
  kinesiologia: ["Kinesiología", "Rehabilitación deportiva"],
  nutricion: ["Nutrición", "Alimentación deportiva"],
};

const FRANJAS = [
  { desde: "09:00", hasta: "13:00" },
  { desde: "16:00", hasta: "20:00" },
];

export function clinicaDeDemostracion(slug: string): ClinicaPublica | null {
  if (process.env.PRISMA_DEMO_PLANTILLAS !== "1" || !slug.startsWith(PREFIJO_DEMOSTRACION)) return null;
  const plantilla = plantillaPorId(slug.slice(PREFIJO_DEMOSTRACION.length));
  if (!plantilla) return null;

  return {
    slug,
    nombreClinica: "Clínica de demostración",
    profesionalNombre: "Dra. Ana Demo",
    telefono: "+5493510000000",
    telefonoClinica: "+5493510000000",
    especialidades: ESPECIALIDADES[plantilla.rubro],
    oculta: false,
    enPreparacion: false,
    bio: plantilla.bio,
    tema: plantilla.tema,
    temaVariante: plantilla.temaVariante,
    temaTipografia: plantilla.temaTipografia,
    fotoPortadaUrl: null,
    redesSociales: plantilla.redes,
    mostrarMapa: plantilla.mostrarMapa,
    direccion: "Av. Colón 1240",
    ciudad: "Córdoba",
    provincia: "Córdoba",
    nombreSobrePortada: plantilla.nombreSobrePortada,
    nombreColor: plantilla.nombreColor,
    temaTokens: { ...plantilla.temaTokens, movimiento: plantilla.estiloMovimiento },
    modulos: plantilla.modulos.map((m, orden) => ({
      tipo: m.tipo,
      orden,
      visible: m.visible,
      config: m.config,
      datosVista:
        m.tipo === "equipo"
          ? {
              equipo: [
                { nombre: "Dra. Ana Demo", fotoUrl: null, descripcion: "Directora de la clínica." },
                { nombre: "Dr. Juan Ejemplo", fotoUrl: null, descripcion: null },
              ],
            }
          : undefined,
    })),
    estadisticas: { pacientes_atendidos: 1250, turnos_realizados: 4800 },
    personalizada: true,
    horariosClinica: {
      dias: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana: diaSemana as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        cerrado: diaSemana === 0 || diaSemana === 6,
        franjas: diaSemana === 0 || diaSemana === 6 ? [] : FRANJAS,
      })),
      nota: "Feriados cerrado.",
      abiertoAhora: false,
    },
    servicios: [
      { nombre: "Consulta general", duracionMinima: 30, duracionMaxima: 30 },
      { nombre: "Limpieza", duracionMinima: 45, duracionMaxima: 60 },
    ],
  };
}
