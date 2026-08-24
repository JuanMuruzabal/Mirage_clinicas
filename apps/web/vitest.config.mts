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
