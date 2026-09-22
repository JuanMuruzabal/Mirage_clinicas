import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Suite propia del paquete (PE-1): todavía no está sumada al gate de 80% de
// apps/web (vitest.config.mts de ahí solo mira su propio src/), ver la nota
// de cobertura en el plan (docs/Fases post MVP/Prisma Engine/plan-prisma-engine.md,
// PE-1 "Infraestructura del paquete"). Sumarla al gate combinado queda para
// el PR de infraestructura (Dockerfile/CI) de este mismo PE-1.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "**/*.config.*"],
    },
  },
});
