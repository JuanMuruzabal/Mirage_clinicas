import { SLOTS_IMAGEN, SLOTS_TARJETA } from "../../efectos/slots";

// Los efectos se aplican a tarjetas y fotos individuales, nunca al carrusel.
export const SLOTS_EQUIPO = [...SLOTS_TARJETA, ...SLOTS_IMAGEN];
