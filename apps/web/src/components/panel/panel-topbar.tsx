"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { usePanelSidebar } from "@/lib/panel-sidebar-context";
import { datosDelTopbarAction, type DatosDelTopbar } from "@/app/actions/topbar-panel";
import { isPanelRoute } from "@/lib/site-routes";
import { SelectorClinica } from "@/app/seleccionar-servicio/selector-clinica";
import { EquipoPopover } from "@/components/panel/equipo-popover";

// El topbar de /panel: en qué clínica estás parado (izquierda) y quién
// trabaja acá (derecha) — Fase 3.2.5, mockup `panel-profesional.html`.
//
// LOS DATOS SE PIDEN DESDE EL CLIENTE, y no es una preferencia: el header
// vive en el layout RAÍZ, y un layout no se vuelve a renderizar en una
// navegación del cliente. Resolviéndolo del lado del servidor, quien
// entraba a /clinicas y navegaba a /panel se quedaba con el render de
// /clinicas —donde el topbar no pide nada— y no veía nada. `usePathname`
// sí es reactivo: entrar y salir del panel se nota.
//
// Un contexto y no dos componentes que pidan por su cuenta, porque los
// dos controles viven en PUNTAS OPUESTAS del header: sin esto serían dos
// veces las mismas tres llamadas a la API.

interface ValorTopbar {
  datos: DatosDelTopbar | null;
  /** Volver a pedir. Lo usa el selector después de cambiar de clínica:
   *  sin redirect no hay navegación que dispare nada, y el header
   *  seguiría mostrando la clínica anterior. */
  refrescar: () => void;
}

const ContextoTopbar = createContext<ValorTopbar>({ datos: null, refrescar: () => {} });

export function PanelTopbarProvider({ children, habilitado }: { children: ReactNode; habilitado: boolean }) {
  const pathname = usePathname();
  const enPanel = habilitado && isPanelRoute(pathname);
  const [cache, setCache] = useState<DatosDelTopbar | null>(null);
  // Un contador para volver a pedir sin que cambie la ruta.
  const [pedido, setPedido] = useState(0);

  useEffect(() => {
    if (!enPanel) return;
    let vivo = true;
    void datosDelTopbarAction().then((nuevos) => {
      if (vivo) setCache(nuevos);
    });
    return () => {
      vivo = false;
    };
    // `pathname` y no solo `enPanel`: moverse entre pantallas del panel
    // vuelve a pedir, que es lo que refresca el equipo después de invitar
    // a alguien o de cambiarle el rol.
  }, [enPanel, pathname, pedido]);

  const refrescar = useCallback(() => setPedido((n) => n + 1), []);

  // Derivado y no un estado más: fuera del panel no hay nada que mostrar,
  // y calcularlo evita un `setState` de más en cada navegación.
  //
  // El cache SOBREVIVE a salir del panel, a propósito: limpiarlo haría
  // parpadear los dos controles en cada navegación de adentro del panel,
  // que es el caso mil veces más frecuente. El costo es que al volver a
  // entrar se ve por una vuelta de API la clínica de la visita anterior;
  // la respuesta que llega lo corrige.
  return (
    <ContextoTopbar.Provider value={{ datos: enPanel ? cache : null, refrescar }}>{children}</ContextoTopbar.Provider>
  );
}

// useTopbarDelPanel — los datos, y solo dentro del panel.
//
// El chequeo de ruta se repite acá además de en el provider a propósito:
// estos dos controles son EXCLUSIVOS del header de /panel, y que aparezcan
// en otra pantalla sería una fuga. Con la comprobación en un solo lado,
// cualquiera que los monte en otro lugar los vería igual.
function useTopbarDelPanel(): DatosDelTopbar | null {
  const pathname = usePathname();
  const { datos } = useContext(ContextoTopbar);
  return isPanelRoute(pathname) ? datos : null;
}

// SelectorClinicaDelPanel — el mismo control de "¿Qué necesitás hoy?",
// en su variante compacta.
//
// En MOBILE es el elemento principal del renglón, no un extra (corrección
// del 2026-09-14, con captura): la primera versión lo escondía en pantalla
// angosta, y ahí el header quedaba con la hamburguesa y nada más. El
// renglón es hamburguesa · selector (ocupando lo que sobra) · avatar.
export function SelectorClinicaDelPanel() {
  const datos = useTopbarDelPanel();
  const { refrescar } = useContext(ContextoTopbar);
  // Con el menú lateral desplegado en mobile, este control queda DEBAJO
  // del drawer: abrirlo desde acá dejaría un popover tapado, o tapando el
  // menú (corrección del 2026-09-14). Mientras el drawer esté abierto, el
  // header no despliega nada.
  const sidebar = usePanelSidebar();
  if (!datos || !datos.nombreClinicaActual || datos.clinicas.length === 0) return null;

  return (
    <>
      {/* El separador es de escritorio: en mobile el selector ya está
          separado de la hamburguesa por su propio borde. */}
      <span aria-hidden="true" className="hidden h-6 w-px flex-shrink-0 bg-linea md:block" />
      <div className="min-w-0 flex-1 md:flex-none">
        <SelectorClinica
          clinicas={datos.clinicas}
          nombreActual={datos.nombreClinicaActual}
          variante="compacto"
          alineacion="izquierda"
          // Cambiar de clínica desde el panel deja al profesional EN el
          // panel de la otra clínica. Mandarlo a "¿Qué necesitás hoy?"
          // sería hacerle perder el lugar por una acción que no lo pidió.
          quedarseAca
          onCambiada={refrescar}
          bloqueado={sidebar.open}
        />
      </div>
    </>
  );
}

// EquipoDelPanel — quién trabaja en esta clínica y quién está ahora. Al
// otro extremo que el selector a propósito: uno dice dónde estás, el otro
// con quién.
export function EquipoDelPanel() {
  const datos = useTopbarDelPanel();
  const sidebar = usePanelSidebar();
  if (!datos?.equipo) return null;
  return <EquipoPopover equipo={datos.equipo} bloqueado={sidebar.open} />;
}
