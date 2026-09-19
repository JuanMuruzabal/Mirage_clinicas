"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

/**
 * useEstadoDelServidor — estado de cliente que se RESINCRONIZA cuando el
 * servidor manda datos nuevos.
 *
 * ## El bug que esto arregla (2026-09-19)
 *
 * Varias pantallas del panel hacían esto:
 *
 * ```tsx
 * const [pacientes, setPacientes] = useState(pacientesIniciales);
 * ```
 *
 * El inicializador de `useState` corre **una sola vez**. Así que cuando
 * `router.refresh()` vuelve a renderizar el Server Component y le pasa
 * props nuevas, el componente las ignora y sigue mostrando lo de antes.
 * Solo un F5 —que lo desmonta y lo vuelve a montar— actualizaba la
 * pantalla.
 *
 * Eso explicaba, con una sola causa, tres síntomas que parecían
 * distintos: resolver un conflicto no sacaba la ficha duplicada de la
 * lista, cambiar de clínica desde el header dejaba la vista de la
 * clínica anterior, y editar un turno no se veía hasta refrescar.
 *
 * ## Por qué así y no con un efecto
 *
 * Es el patrón documentado de React para ajustar estado cuando cambia
 * una prop: comparar contra lo último que se vio y corregir DURANTE el
 * render. Con `useEffect` habría un frame con los datos viejos en
 * pantalla —justo lo que se quiere evitar— y además choca con la regla
 * de lint del proyecto (`react-hooks/set-state-in-effect`).
 *
 * ## Qué se pierde, a propósito
 *
 * El estado local se descarta cuando llegan datos nuevos. En las tablas
 * con "Cargar más" eso significa volver a la primera tanda: el servidor
 * acaba de decir cuál es la verdad, y mostrar tres páginas viejas junto
 * a datos frescos sería peor. Por lo mismo NO va en un editor ni en un
 * formulario a medio llenar, donde el estado local es lo que la persona
 * está escribiendo (ver pagina-editor.tsx).
 */
export function useEstadoDelServidor<T>(
  delServidor: T,
  alResincronizar?: (nuevo: T) => void,
): [T, Dispatch<SetStateAction<T>>] {
  const [valor, setValor] = useState<T>(delServidor);
  const [ultimoVisto, setUltimoVisto] = useState<T>(delServidor);

  if (ultimoVisto !== delServidor) {
    setUltimoVisto(delServidor);
    setValor(delServidor);
    // Para los datos que viajan con el principal y tienen que resetearse
    // con él (el total de una tabla paginada, por ejemplo). Se llama
    // durante el render, igual que los setState de arriba: React
    // descarta este render y vuelve a empezar con los valores nuevos,
    // sin pintar nada intermedio.
    alResincronizar?.(delServidor);
  }

  return [valor, setValor];
}
