import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empaqueta un server.js standalone — la imagen Docker de producción
  // (Sprint 5, T5.5) copia esta carpeta en vez de todo node_modules del
  // monorepo. Mismo patrón que Marcuzzi_Madryn.
  output: "standalone",
  // @dental-mirage/prisma-engine (PE-1) es un paquete del monorepo sin build
  // propio: ships TS/TSX de src/ directo, igual que @dental-mirage/shared-types
  // — pero ESE no necesitaba esto porque no trae JSX. Sin transpilePackages
  // Next no compila el código de fuera de apps/web y el import revienta.
  transpilePackages: ["@dental-mirage/prisma-engine"],
  experimental: {
    // Server Actions rechaza por default cualquier body de más de 1 MB — y la
    // foto de la página pública (subirFotoPaginaPublicaAction, Fase 4.4)
    // pasa por una: el backend acepta hasta 5 MiB. 6 MB deja lugar para lo
    // que suma el multipart (bordes y cabeceras de cada parte).
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
