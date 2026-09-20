"use client";

import { useEffect, useState, useTransition } from "react";
import {
  elegirVistaAction,
  opcionesDeAgendaAction,
  type OpcionesDeAgenda,
} from "@/app/actions/topbar-panel";
import { CarruselDeProfesionales } from "./zona-profesional";

/**
 * SelectorDeAgenda — "¿a quién se le carga esto?" dentro de un formulario
 * del panel (QA de la Fase 3.2.6).
 *
 * El pedido: *"faltan, para agregar turno o agregar horario reservado
 * (solo en el atajo al lado de agregar turno), elegir el profesional a
 * quien se le cargará"*.
 *
 * Hasta acá recepción tenía que pararse primero en la agenda de alguien y
 * recién después abrir el formulario; parada en la vista general, el
 * backend le rechazaba el alta pidiéndole justamente eso. Preguntárselo
 * EN el formulario es lo mismo sin el rodeo — y sin moverle la pantalla
 * de atrás mientras lo está llenando, que es lo que haría el selector de
 * vista del encabezado.
 *
 * NO ofrece una opción general: un turno entra en UNA agenda. El carrusel
 * la tiene porque en "Compartir link" sí significa algo ("que elija el
 * paciente"), pero acá sería una pregunta sin respuesta posible.
 *
 * Para un profesional el control muestra una sola opción —él mismo— y no
 * se puede mover. Se dibuja igual: que la pantalla diga en qué agenda va
 * a entrar el turno no sobra por ser obvio, y el día que esa persona
 * también haga recepción, el control ya está donde tiene que estar.
 */
export function SelectorDeAgenda({
  valor,
  onElegir,
  etiqueta = "¿A quién se le carga?",
}: {
  /** `null` mientras no se sabe todavía quién es esta sesión. */
  valor: string | null;
  onElegir: (userId: string | null) => void;
  etiqueta?: string;
}) {
  const [opciones, setOpciones] = useState<OpcionesDeAgenda | null>(null);

  useEffect(() => {
    let vivo = true;
    opcionesDeAgendaAction().then((datos) => {
      if (!vivo) return;
      setOpciones(datos);
      // El default es la agenda propia; recepción no tiene una y arranca
      // sin elegir, que es exactamente lo que hay que preguntarle.
      if (datos.miUserId) onElegir(datos.miUserId);
    });
    return () => {
      vivo = false;
    };
    // Solo al montar: `onElegir` cambia de identidad en cada render del
    // padre y volver a pedir las opciones por eso reescribiría la
    // elección de la persona con el default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CarruselDeProfesionales
      profesionales={opciones?.profesionales ?? []}
      valorId={valor}
      onElegir={onElegir}
      etiqueta={etiqueta}
      conVistaGeneral={false}
      // Con una sola agenda el carrusel no se mueve, y el texto de la
      // opción general nunca se llega a mostrar. Igual hace falta algo
      // legible mientras las opciones no llegaron.
      etiquetaGeneral="Elegí un profesional"
      detalleGeneral="El turno entra en su agenda"
      guardando={opciones === null}
    />
  );
}

/**
 * SelectorDeVistaDeRecepcion — el carrusel arriba de "Configuración de
 * calendario" (QA de la Fase 3.2.6: *"en la configuración de calendario
 * aparecerá arriba del todo el selector carrusel"*).
 *
 * A diferencia de `SelectorDeAgenda`, este SÍ mueve el foco de la sesión,
 * y tiene que hacerlo: lo que la configuración muestra —horario de
 * atención, horarios reservados, tipos de consulta— se lee con los scopes
 * de `visibilidad.go`, que responden al profesional en foco. Elegir acá
 * sin mover el foco mostraría la configuración de otro.
 *
 * El efecto lateral es que la pantalla de atrás también cambia de
 * profesional. Es coherente: al cerrar el modal, lo que se ve es la
 * agenda que se acaba de configurar.
 *
 * Sin opción general: configurar "la agenda de toda la clínica" no
 * significa nada — el horario de atención es de cada profesional desde la
 * 3.2.5.
 *
 * Para quien no es recepción no se dibuja nada: tiene una sola agenda y
 * un control de una opción que no cambia nada sería ruido en un modal que
 * ya es largo.
 */
export function SelectorDeVistaDeRecepcion({
  onCambio,
}: {
  onCambio: () => void;
}) {
  const [opciones, setOpciones] = useState<OpcionesDeAgenda | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    opcionesDeAgendaAction().then((datos) => {
      if (!vivo) return;
      setOpciones(datos);
      setFoco(datos.focoActual);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (!opciones?.puedeElegirOtros) return null;

  return (
    <div className="border-b border-linea bg-hueso px-6 py-4">
      <CarruselDeProfesionales
        profesionales={opciones.profesionales}
        valorId={foco}
        onElegir={(userId) =>
          iniciar(async () => {
            await elegirVistaAction(userId ?? "");
            setFoco(userId);
            // Y volver a leer lo que el modal muestra: es la
            // configuración de otra persona.
            onCambio();
          })
        }
        etiqueta="Configurando la agenda de"
        conVistaGeneral={false}
        etiquetaGeneral="Elegí un profesional"
        detalleGeneral="Cada uno tiene su propio horario de atención"
        guardando={guardando}
      />
    </div>
  );
}
