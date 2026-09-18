// Catálogo de tipografías de la página pública (Fase 4.3) — compartido
// entre los 5 temas de paletas.ts, no exclusivo de cada uno: si cada tema
// trajera sus propias fuentes, 5 temas cargarían hasta 10 pares de Google
// Fonts distintos. Acá hay 5 pares en total y cada tema ofrece 2 (ver
// TIPOGRAFIAS_POR_TEMA en index.ts) — mismo resultado para el owner
// (elegir entre opciones curadas DENTRO del tema, nunca una fuente
// propia), bundle acotado.
//
// "condensada-institucional" reusa las variables --font-big-shoulders/
// --font-public-sans que layout.tsx ya carga globalmente (Big_Shoulders +
// Public_Sans, Sistema Cascarón) — no agrega peso nuevo. Las otras 4
// cargan sus propias fuentes acá, en un archivo aparte del layout raíz:
// solo las rutas que las necesitan (/[slug], /personalizar-pagina, desde
// la Fase 4.5) las importan, aplicando `claseVariables` como className del
// contenedor — no del <html>.
import { Fraunces, Source_Sans_3, Space_Grotesk, Inter, Fredoka, Nunito_Sans, Libre_Baskerville, Karla } from "next/font/google";

const frauncesDisplay = Fraunces({ variable: "--font-tema-serif-clasica-display", subsets: ["latin"], weight: ["600", "700"] });
const sourceSansBody = Source_Sans_3({ variable: "--font-tema-serif-clasica-body", subsets: ["latin"], weight: ["400", "500"] });

const spaceGroteskDisplay = Space_Grotesk({ variable: "--font-tema-geometrica-moderna-display", subsets: ["latin"], weight: ["600", "700"] });
const interBody = Inter({ variable: "--font-tema-geometrica-moderna-body", subsets: ["latin"], weight: ["400", "500"] });

const fredokaDisplay = Fredoka({ variable: "--font-tema-redondeada-calida-display", subsets: ["latin"], weight: ["600", "700"] });
const nunitoSansBody = Nunito_Sans({ variable: "--font-tema-redondeada-calida-body", subsets: ["latin"], weight: ["400", "600"] });

const libreBaskervilleDisplay = Libre_Baskerville({ variable: "--font-tema-editorial-suave-display", subsets: ["latin"], weight: ["400", "700"] });
const karlaBody = Karla({ variable: "--font-tema-editorial-suave-body", subsets: ["latin"], weight: ["400", "500"] });

export interface Tipografia {
  id: string;
  nombre: string;
  descripcion: string;
  /** Variable CSS a usar en font-family para el título/display. */
  displayVar: string;
  /** Variable CSS a usar en font-family para el cuerpo. */
  bodyVar: string;
  /** className con las variables de next/font a aplicar en el contenedor — vacío si ya están cargadas globalmente (layout.tsx). */
  claseVariables: string;
}

export const TIPOGRAFIAS_PAGINA_PUBLICA: Tipografia[] = [
  {
    id: "condensada-institucional",
    nombre: "Condensada institucional",
    descripcion: "La misma tipografía del panel de gestión.",
    displayVar: "--font-big-shoulders",
    bodyVar: "--font-public-sans",
    claseVariables: "",
  },
  {
    id: "serif-clasica",
    nombre: "Serif clásica",
    descripcion: "Confianza tradicional.",
    displayVar: "--font-tema-serif-clasica-display",
    bodyVar: "--font-tema-serif-clasica-body",
    claseVariables: `${frauncesDisplay.variable} ${sourceSansBody.variable}`,
  },
  {
    id: "geometrica-moderna",
    nombre: "Geométrica moderna",
    descripcion: "Contemporáneo, limpio.",
    displayVar: "--font-tema-geometrica-moderna-display",
    bodyVar: "--font-tema-geometrica-moderna-body",
    claseVariables: `${spaceGroteskDisplay.variable} ${interBody.variable}`,
  },
  {
    id: "redondeada-calida",
    nombre: "Redondeada cálida",
    descripcion: "Cercano, informal-profesional.",
    displayVar: "--font-tema-redondeada-calida-display",
    bodyVar: "--font-tema-redondeada-calida-body",
    claseVariables: `${fredokaDisplay.variable} ${nunitoSansBody.variable}`,
  },
  {
    id: "editorial-suave",
    nombre: "Editorial suave",
    descripcion: "Cálido, legible.",
    displayVar: "--font-tema-editorial-suave-display",
    bodyVar: "--font-tema-editorial-suave-body",
    claseVariables: `${libreBaskervilleDisplay.variable} ${karlaBody.variable}`,
  },
];

export function tipografiaPorId(id: string): Tipografia | undefined {
  return TIPOGRAFIAS_PAGINA_PUBLICA.find((t) => t.id === id);
}
