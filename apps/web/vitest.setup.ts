import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// El paquete real "server-only" tira un error SIEMPRE que se lo importa —
// su comportamiento de "no-op del lado del servidor" depende de que el
// bundler de Next.js lo intercepte según el target (cliente vs. servidor).
// Vitest no pasa por ese bundler, así que cualquier archivo que importe
// "server-only" revienta sin este mock. Un entorno de test de Node ya "es"
// el servidor en este sentido, así que no-opearlo acá es fiel a la
// intención real del paquete, no un parche (mismo mock que Marcuzzi_Madryn).
vi.mock("server-only", () => ({}));

// jsdom no implementa IntersectionObserver ni matchMedia — framer-motion
// los usa para whileInView (ScrollReveal) y useReducedMotion
// respectivamente. Sin esto, cualquier componente que renderice un
// <motion.*> revienta con "IntersectionObserver is not defined" o
// "matchMedia is not a function" apenas monta (mismo mock que
// Marcuzzi_Madryn, vitest.setup.ts de ese proyecto).
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);

// jsdom tampoco implementa ResizeObserver — HeaderFrame lo usa para medir
// su altura real y sincronizar --header-height (evita el hueco visible
// entre el header y el contenido, p. ej. el sidebar de /panel).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
