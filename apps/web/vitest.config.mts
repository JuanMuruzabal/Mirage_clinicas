import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// T0.4 (docs/implementation-plan.md): gate de coverage 80% activo desde
// Sprint 0, no agregado como iniciativa tardía — ver TR-007 en
// docs/tradeoffs.md. El alias @/* replica el de tsconfig.json (paths)
// porque Vitest no lo lee solo.
//
// Extensión .mts (no .ts): apps/web/package.json no tiene "type": "module"
// — sin la extensión explícita, el configLoader nativo de Vite carga este
// archivo como CommonJS pese a su sintaxis ESM y tira un warning.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // TZ fijo (bug real encontrado en CI, 2026-09-06, PR #4): la app
    // entera ancla cualquier regla de fecha/hora "vigente" a
    // America/Argentina/Cordoba (CLAUDE.md, internal/clock.Today() del
    // lado del backend) — pero muchos FIXTURES de test de este lado
    // arman un turno con el constructor LOCAL de `Date`
    // (`new Date(2026, 8, 1, 9, 0)`, no `Date.UTC`) y recién después lo
    // convierten a ISO con `.toISOString()`. Ese constructor interpreta
    // los campos como hora de pared en la timezone AMBIENTE del proceso
    // que corre el test — en una máquina de desarrollo con offset UTC-3
    // sin horario de verano (p. ej. America/Buenos_Aires) el fixture da
    // el ISO correcto sin que nadie lo note; en un runner de CI (GitHub
    // Actions, UTC por default) el mismo fixture arma un instante 3
    // horas más tarde, y cualquier aserción de texto tipo "09:00–09:30"
    // pasa a ver "06:00–06:30" — así falló `turno-detalle.test.tsx` en
    // el PR #4 (fase2-03-ajustes-calendario), pese a estar en verde en
    // local. Fijar `TZ` acá hace que el constructor local de `Date` se
    // comporte igual en cualquier máquina/CI, sin reescribir cada
    // fixture existente a `Date.UTC` — mismo principio que
    // `internal/clock`/`hoyEnCordoba()` ya aplican del lado de la app,
    // ahora también del lado de los tests que la ejercitan.
    env: {
      TZ: "America/Argentina/Cordoba",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // `include` explícito (no solo `exclude`) hace que el reporte cuente
      // TODO src/, no solo los archivos que algún test llegó a importar.
      include: ["src/**/*.{ts,tsx}"],
      // Los Server Components async (page.tsx/layout.tsx) no son
      // unit-testeables de forma estándar — quedan mejor cubiertos por QA
      // end-to-end (T5.4) que por unit tests. Mismo criterio que
      // Marcuzzi_Madryn (TR-040 de ese proyecto), aplicado desde el día 1
      // acá (TR-007).
      exclude: [
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
        "src/**/*.d.ts",
        "**/*.config.*",
        "**/node_modules/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
