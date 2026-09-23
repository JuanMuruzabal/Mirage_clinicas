// Catálogo curado inicial para Argentina, con opciones habituales en Córdoba.
// El catálogo indica qué puede seleccionar la clínica; no afirma que acepte
// ninguna cobertura hasta que el administrador la marque expresamente.
export const CATALOGO_COBERTURAS = [
  { id: "apross", nombre: "APROSS" },
  { id: "pami", nombre: "PAMI" },
  { id: "osecac", nombre: "OSECAC" },
  { id: "osde", nombre: "OSDE" },
  { id: "swiss-medical", nombre: "Swiss Medical" },
  { id: "sancor-salud", nombre: "Sancor Salud" },
  { id: "galeno", nombre: "Galeno" },
  { id: "prevencion-salud", nombre: "Prevención Salud" },
  { id: "medife", nombre: "Medifé" },
  { id: "federada-salud", nombre: "Federada Salud" },
  { id: "jerarquicos-salud", nombre: "Jerárquicos Salud" },
  { id: "avalian", nombre: "Avalian" },
] as const;

export const IDS_COBERTURAS = CATALOGO_COBERTURAS.map(({ id }) => id) as [string, ...string[]];
export const NOMBRE_COBERTURA = Object.fromEntries(CATALOGO_COBERTURAS.map(({ id, nombre }) => [id, nombre])) as Record<string, string>;
