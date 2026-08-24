import "server-only";

// Usado por el Route Handler de /api/health (T0.1: "ambos exponen
// healthcheck"). Separado en su propia función testeable en vez de
// escribirlo directo en route.ts, que no es unit-testeable (Route Handlers
// async quedan fuera del alcance de coverage, ver vitest.config.mts).
export function getHealthStatus(): { status: "ok"; app: string } {
  return { status: "ok", app: "dental-mirage-web" };
}
