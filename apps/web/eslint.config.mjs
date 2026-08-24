import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Reporte HTML generado por `vitest run --coverage` — no es código
    // fuente, ya está en .gitignore.
    "coverage/**",
  ]),
]);

export default eslintConfig;
