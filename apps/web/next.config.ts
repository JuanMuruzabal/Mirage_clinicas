import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empaqueta un server.js standalone — la imagen Docker de producción
  // (Sprint 5, T5.5) copia esta carpeta en vez de todo node_modules del
  // monorepo. Mismo patrón que Marcuzzi_Madryn.
  output: "standalone",
};

export default nextConfig;
