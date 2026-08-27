import type { Metadata } from "next";
import { Big_Shoulders, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteHeaderVisibility } from "@/components/site-header-visibility";
import { SiteFooter } from "@/components/site-footer";
import { SiteFooterVisibility } from "@/components/site-footer-visibility";
import { PanelScrollLock } from "@/components/panel-scroll-lock";
import { PanelSidebarProvider } from "@/lib/panel-sidebar-context";

// Sistema Cascarón (docs/tradeoffs.md TR-010) — display condensada de alto
// contraste, uso restringido a títulos/cifras/rótulos (spec §9.7).
const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

// Cuerpo — legibilidad institucional, coherente con "confianza clínica"
// como historia de marca (TR-010).
const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Utilitaria — DNI, teléfono, horarios: cifras tabulares (TR-010).
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Dental Mirage",
  description:
    "Gestión de clínica y página pública para odontólogos de Córdoba: turnero, agenda y una página propia donde tus pacientes piden turno.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${bigShoulders.variable} ${publicSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* PanelSidebarProvider (TR-075 en docs/tradeoffs.md) — sin nodo
            propio en el DOM, envuelve todo el sitio para que el ícono de
            abrir/cerrar el sidebar (en el header, fuera de /panel/**) y el
            sidebar en sí (adentro de app/panel/layout.tsx) compartan
            estado sin un ancestro común más cercano que este layout. */}
        <PanelSidebarProvider>
          <PanelScrollLock />
          <SiteHeaderVisibility>
            <SiteHeader />
          </SiteHeaderVisibility>
          {children}
          <SiteFooterVisibility>
            <SiteFooter />
          </SiteFooterVisibility>
        </PanelSidebarProvider>
      </body>
    </html>
  );
}
