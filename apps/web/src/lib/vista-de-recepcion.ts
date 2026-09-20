import "server-only";
import type { VistaActual } from "@dental-mirage/shared-types";
import { apiEquipo, apiVistaActual } from "@/lib/api";
import type { OpcionProfesional } from "@/components/panel/zona-profesional";

/**
 * Lo que cada pantalla del panel necesita para dibujar el selector de
 * vista de recepción (Fase 3.2.6).
 *
 * Vive acá y no en cada página porque son cuatro pantallas que necesitan
 * exactamente lo mismo, y porque la pregunta "¿esta sesión puede cambiar
 * de vista?" tiene una sola respuesta correcta: la que da el backend. El
 * frontend solo decide si DIBUJA el control — el permiso lo impone
 * `PUT /me/vista` con un 403.
 */
export interface DatosDeLaVista {
  /** Vacío para quien no es recepción: el control no se dibuja. */
  profesionales: OpcionProfesional[];
  vista: VistaActual | null;
  esRecepcion: boolean;
}

const SIN_VISTA: DatosDeLaVista = { profesionales: [], vista: null, esRecepcion: false };

export async function datosDeLaVista(token: string | undefined, roles: string[]): Promise<DatosDeLaVista> {
  // Solo recepción tiene vistas ajenas que mirar. Para el resto ni
  // siquiera se piden los datos: el aislamiento de la 3.2.2 es
  // justamente que esa pregunta no exista.
  if (!token || !roles.includes("recepcion")) return SIN_VISTA;

  const [equipoResult, vistaResult] = await Promise.all([apiEquipo(token), apiVistaActual(token)]);

  const profesionales = (equipoResult.ok ? equipoResult.data.miembros : [])
    // Solo los que atienden: la vista de un administrador de página o de
    // otro recepcionista no existe, y el backend la rechaza con un 409.
    .filter((m) => m.roles.includes("profesional"))
    .map((m) => ({
      userId: m.userId,
      // La especialidad nombra mejor que el rol — es lo que distingue a
      // dos odontólogos entre sí. Sin perfil cargado se cae a algo
      // genérico antes que dejar la línea vacía.
      detalle: m.especialidad || "Profesional de la clínica",
      nombre: m.nombre,
    }));

  return {
    profesionales,
    vista: vistaResult.ok ? vistaResult.data : null,
    esRecepcion: true,
  };
}
