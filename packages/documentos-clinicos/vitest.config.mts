import { defineConfig } from "vitest/config";

// Suite propia del paquete (Fase 5.1). Sin DOM: acá no hay componentes,
// solo el motor de las plantillas.
export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/*.test.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
