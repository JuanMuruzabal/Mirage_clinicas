import type { MetadataRoute } from "next";

// El manifiesto de la app (TR-179). Es lo que deja "agregar PRISMA a la
// pantalla de inicio" con su nombre y su ícono — y en iPhone, lo que
// habilita los avisos: Apple solo deja recibirlos a una web instalada así.
// Arranca en /clinicas, el punto de partida de toda sesión (Fase 3.2.3).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PRISMA",
    short_name: "PRISMA",
    description: "Turnos, agenda y pacientes de tu clínica.",
    lang: "es-AR",
    start_url: "/clinicas",
    scope: "/",
    display: "standalone",
    background_color: "#f6f2ea",
    theme_color: "#2c4a5e",
    icons: [
      { src: "/icons/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
