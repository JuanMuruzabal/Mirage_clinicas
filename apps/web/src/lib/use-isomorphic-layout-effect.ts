"use client";

import { useEffect, useLayoutEffect } from "react";

// `useLayoutEffect` no server-side (React tira un warning: "does nothing on
// the server") — patrón isomorphic estándar (mismo que usan Redux/Framer
// Motion): `useEffect` en el server (donde no hace nada, no importa), el
// layout effect síncrono de verdad en el cliente — corre ANTES de que el
// navegador pinte el siguiente frame, así cualquier ajuste que haga no se
// llega a ver como un parpadeo. Compartido entre `panel-shell.tsx` (reflow
// forzado al cambiar de ruta, TR-031) y `panel-sidebar.tsx` (arrancar
// colapsado en mobile, TR-034).
export const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
