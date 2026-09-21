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
      // El default es la agenda propia y, para recepción, la del
      // profesional en el que ya está parada: si vino mirando a alguien,
      // lo más probable es que le esté cargando el turno a esa persona.
      // Solo desde la vista general arranca sin elegir, que es
      // exactamente el caso en el que hay que preguntar.
      const inicial = datos.miUserId ?? datos.focoActual;
      if (inicial) onElegir(inicial);
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
  hayCambiosSinGuardar,
}: {
  onCambio: () => void;
  /** Si hay edición a medio hacer, se pregunta antes de cambiar: pasar de
   *  profesional vuelve a leer TODO, y lo tipeado se pierde. */
  hayCambiosSinGuardar?: () => boolean;
}) {
  const [opciones, setOpciones] = useState<OpcionesDeAgenda | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  // El cambio que está esperando confirmación. `undefined` = no hay
  // ninguno pendiente (y no `null`, que es un userId válido: la opción
  // general — acá no se usa, pero el tipo del carrusel la admite).
  const [aConfirmar, setAConfirmar] = useState<string | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let vivo = true;
    opcionesDeAgendaAction().then((datos) => {
      if (!vivo) return;
      setOpciones(datos);

      // SIEMPRE ARRANCA CON UN PROFESIONAL (QA de la 3.2.6, pedido
      // textual: *"el selector de configuración de calendario sí o sí
      // debe arrancar con un profesional"*).
      //
      // No es una comodidad. Sin nadie elegido, recepción estaba
      // configurando "la clínica", que no existe: los horarios reservados
      // que guardaba nacían sin dueño —y una fila sin dueño la ve TODA la
      // agenda, porque son las filas anteriores a la 3.2.1— y los tipos
      // de consulta quedaban a su nombre, que no atiende a nadie. Por eso
      // se le filtraban a los demás profesionales.
      //
      // El backend ahora rechaza las dos cosas con un 409, así que esto
      // no es lo que protege nada: es para que nadie llegue a ver ese
      // error haciendo lo normal.
      //
      // Solo si este control se va a dibujar. Para quien no es recepción
      // no hay nada que elegir, y mover el foco igual sería una escritura
      // invisible que además le hace releer el modal entero.
      if (!datos.puedeElegirOtros) return;
      const inicial =
        datos.focoActual ?? datos.profesionales[0]?.userId ?? null;
      setFoco(inicial);
      if (inicial && inicial !== datos.focoActual) {
        iniciar(async () => {
          await elegirVistaAction(inicial);
          onCambio();
        });
      }
    });
    return () => {
      vivo = false;
    };
    // Solo al montar: `onCambio` cambia de identidad en cada render del
    // padre, y volver a correr esto reelegiría el primer profesional
    // encima de lo que la persona acaba de elegir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!opciones?.puedeElegirOtros) return null;

  function cambiarA(userId: string | null) {
    iniciar(async () => {
      await elegirVistaAction(userId ?? "");
      setFoco(userId);
      setAConfirmar(undefined);
      // Y volver a leer lo que el modal muestra: es la configuración de
      // otra persona.
      onCambio();
    });
  }

  return (
    <div className="border-b border-linea bg-hueso px-6 py-4">
      <CarruselDeProfesionales
        profesionales={opciones.profesionales}
        valorId={foco}
        onElegir={(userId) => {
          // AVISO ANTES DE CAMBIAR (QA de la 3.2.6). Cambiar de
          // profesional vuelve a leer la configuración entera, así que lo
          // que esté tipeado y sin guardar se pierde. Se pregunta solo
          // cuando de verdad hay algo que perder: un cartel que aparece
          // siempre se aprende a ignorar.
          if (hayCambiosSinGuardar?.()) {
            setAConfirmar(userId);
            return;
          }
          cambiarA(userId);
        }}
        etiqueta="Configurando la agenda de"
        conVistaGeneral={false}
        etiquetaGeneral="Elegí un profesional"
        detalleGeneral="Cada uno tiene su propio horario de atención"
        guardando={guardando}
      />

      {aConfirmar !== undefined && (
        <div
          role="alertdialog"
          aria-label="Cambios sin guardar"
          className="mt-3 flex flex-col gap-2 rounded-field border border-arena bg-marfil p-3"
        >
          <p className="text-sm text-grafito">
            Tenés cambios sin guardar en el horario de atención. Si cambiás de
            profesional se van a perder.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={guardando}
              onClick={() => cambiarA(aConfirmar)}
              className="rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              Cambiar igual
            </button>
            <button
              type="button"
              onClick={() => setAConfirmar(undefined)}
              className="rounded-full border-[0.5px] border-arena bg-marfil px-4 py-2 text-sm font-semibold text-grafito hover:border-salvia hover:text-salvia-oscuro"
            >
              Seguir acá
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
