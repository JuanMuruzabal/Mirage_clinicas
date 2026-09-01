# Ítems extra de F2.3 — brief del cliente

Transcripción a Markdown de `docs/FASE-2.3-extra.docx` (el cliente lo dejó en
formato Word; este archivo es la versión versionable/legible en diffs, igual
criterio que `docs/fase2-dental-mirage.md` con el brief original de Fase 2).
El `.docx` queda también en el repo como fuente original, sin tocar.

El cliente perdió el hilo de la numeración de ítems al escribir este
documento — la segmentación en 5 ítems de abajo (para que cada uno tenga su
propia rama y ronda de QA, TR-083) es una propuesta armada al leer el texto
completo, agrupando por área de la app afectada. Confirmar con el cliente si
coincide con lo que tenía en mente antes de abrir la primera rama.

Referencias visuales que trae el documento: una captura del filtro actual de
Pacientes (`Todos los tipos` / `Desde` / `Hasta`, el que el Ítem 3 pide
imitar), una captura del header actual de `/panel/calendario` (título, gear,
botones `+ Reservar horario`/`+ Agregar turno`, selector Día/Semana/Mes — el
lugar exacto donde va el mensaje de conflicto del Ítem 2), y una captura de
la tarjeta "Turnos próximos" tal como existe hoy (eyebrow, número grande,
"Ver calendario →") — la base visual que el Ítem 1 extiende con un cuerpo de
información rápida.

---

## Texto completo del brief (sin editar, tal como lo escribió el cliente)

> Este documento va con el objetivo de actualizar demás partes de la
> herramienta de gestión, y agregar algunos otros apartados en el
> calendario.
>
> Arrancamos con el apartado general, primeramente quitar el apartado de
> turnos pendientes (ya que se descarta este tipo de turno totalmente, más
> de esto adelante). Vamos a reestructurar cómo se ven las tarjetas y cómo
> va a desencadenar su interacción.
>
> Primeramente, en general por ahora solo va a tener un subtítulo, y será
> TURNERO, y abajo se verán las siguientes tarjetas: 1- turnos de hoy, 2-
> turnos próximos, 3- horarios reservados, 4- total de turnos, 5- turnos
> resueltos.
>
> Para las tarjetas 1-, 2-, 3-, las tarjetas se verán de esta forma:
> cabecera (con el título, el número/total y "Ver calendario →", igual que
> hoy) + cuerpo con información (una lista tipo "10:00 a 18:00 — nombre",
> repetida). El cuerpo no debe ser gris, debe ser medio transparente, mismo
> efecto que las tarjetas de la página principal.
>
> Este es el ejemplo para la tarjeta de turnos de hoy (1-): se le agrega un
> cuerpo con información rápida para ver antes de recurrir al calendario;
> si la lista se hace muy larga, poder scrollear para abajo dentro del
> cuerpo de la tarjeta; al tocar un nombre específico dentro de la tarjeta
> me redirecciona al turno del paciente específico en la vista de hoy de
> ese calendario; tocar "Ver calendario" en esta tarjeta me lleva a la
> vista de hoy del calendario.
>
> Para la tarjeta turnos próximos (2-): mostrar los turnos próximos
> excluyendo los del día de hoy, mismo tipo de tarjeta pero antes del
> horario mostrar los días próximos; misma funcionalidad al tocar un
> nombre o alguna fila del cuerpo: lleva al turno específico en la vista
> semana; tocar "Ver calendario" lleva a la vista semana.
>
> La tarjeta de horarios reservados (3-) también sigue el mismo formato:
> mostrará el total y abajo en el cuerpo el día y la hora, y en este caso
> el motivo; tocar algún elemento del cuerpo lleva a este en el calendario
> en la vista semanal; acá el botón de la cabecera dice "Ver horarios
> reservados" y lleva a la Configuración del calendario para verlos.
>
> 4- solo mostrará la cantidad de turnos totales confirmados.
>
> 5- turnos resueltos: lo mismo, mostrará la cantidad de turnos resueltos
> (sin poner asistió/ausente todavía), pondrá fecha, hora y el nombre.
>
> Un pequeño agregado en el apartado del calendario: cuando hay un turno
> en conflicto, mostrar un mensaje "Tienes X turnos en conflictos, toca
> para ver". Este mensaje se ubicará en el espacio entre el componente
> donde se elige día/semana/mes y el calendario. El mensaje aparecerá
> cuando se crea un horario reservado (específico o general) que afecte un
> turno y haya conflicto; aparecerá lentamente desde el componente de
> arriba, desplazando el calendario un poco hacia abajo; al tocar "toca
> para ver" abrirá el "Ver eventos" de la tarjeta de solapamiento en
> conflicto; desaparecerá cuando ya no haya conflictos. Si hay varias
> tarjetas de solapamiento con conflictos (ej.: 2 horarios específicos que
> afectan 2 turnos distintos en 2 fechas distintas → 2 tarjetas de
> solapamiento con conflicto), el mensaje dirá "Tienes 2 turnos en
> conflictos, toca para ver"; al tocar, abre primero el "Ver eventos" del
> turno en conflicto más próximo; si ese se soluciona, el mensaje pasa a
> "Tienes 1 turno en conflictos, toca para ver", así hasta que no haya más
> y el mensaje deje de aparecer.
>
> Otro cambio: si el motivo de una reserva de horario (general o
> específica) es muy largo, reemplazarlo por un botón "Ver motivo" —
> aplicar esto también en la tarjeta 3- si es el caso.
>
> Ahora la sección de Turnos: eliminamos el apartado "turnos pendientes" y
> el estado `pendiente` en su totalidad. Ahora, al entrar al apartado de
> Turnos, si o sí debe autoseleccionarse la pestaña "Confirmado" como
> primera vista. Al tocar un turno, dar la opción "Ver paciente" (misma
> funcionalidad que el botón "Ver paciente" que aparece en la tarjeta del
> calendario). El motivo de la consulta no debe aparecer visible en la
> fila — ahora es un botón "Ver motivo" que al tocarlo muestra el motivo
> en pantalla, con blur atrás (mismo patrón que los demás botones de este
> tipo) — motivos largos rompían la fila y la vista. (El motivo solo es
> editable si el turno es de origen manual.)
>
> Aplicar los mismos filtros de búsqueda de esta pestaña que ya tiene la
> ficha del paciente. Pero antes del "Desde / Hasta", agregar la opción
> HOY / SEMANA / MES, donde aparecerán los turnos de ese día, esa semana o
> ese mes — agregar esto también en "Turnos activos" de la ficha del
> paciente.
>
> Para el apartado Pacientes: si el mail supera 30 caracteres (donde dice
> la info del mail), mostrar un botón "Ver mail" con la misma
> funcionalidad que "Ver motivo".
>
> **MÁS IMPORTANTE**, para respaldar la lógica de quitar el estado
> `pendiente` de los turnos: desde la página web, el formulario para sacar
> turno cambia de lógica totalmente — esto sienta las bases para que el
> desarrollo de Fase 2.4 sea más fácil. Reemplazar completamente el
> formulario actual por un flujo similar al que tiene el profesional para
> "agregar turno para paciente nuevo": primero completa sus datos, luego
> elige el tipo de consulta, y para una fecha determinada le aparece el
> horario disponible según la agenda del profesional (mismos cálculos que
> ya se hacen). Al completar, el paciente queda automáticamente cargado al
> calendario, aparece en Turnos y se crea su registro de paciente. **MUY
> IMPORTANTE: no puede haber pacientes con DNI iguales** — si se vuelve a
> registrar un turno desde la página con un DNI ya existente en el
> sistema, ese turno se asigna al paciente con ese DNI.
>
> También arreglar un bug en el calendario: al ir a dar turno por
> "paciente conocido", volver atrás, e ir a "turno con paciente nuevo", se
> precargan los datos del paciente conocido — "turno con paciente nuevo"
> tiene que dar el mensaje de error si se quiere añadir un paciente con el
> mismo DNI.
>
> Añadir un botón para únicamente añadir pacientes en el apartado
> Pacientes.
>
> ESTE DOCUMENTO SON ÍTEMS EXTRA A LA FASE 2.3. Perdí cómo era la
> numeración que teníamos, así que para el pull request, una vez aprobado
> por QA, en todos los ítems del 1 al 5 hacer el PR con el título 2.3.N.
> Antes de empezar con los ítems, actualizar documentos con toda la
> información dada.

---

## Segmentación propuesta en 5 ítems (para ramas + QA por ítem, TR-083)

| Ítem | Nombre corto | Área |
|---|---|---|
| Extra 2.3.1 | Rediseño del Turnero (tarjetas del dashboard) | `apps/web/src/app/panel/page.tsx` y componentes del dashboard general |
| Extra 2.3.2 | Banner de conflicto en el calendario | `calendar-view.tsx` / `calendar-grid.tsx` |
| Extra 2.3.3 | Turnos: quitar `pendiente`, "Ver paciente"/"Ver motivo", filtro HOY/SEMANA/MES | `turnos-table.tsx`, `paciente-turnos-table.tsx`, backend (estado `pendiente`) |
| Extra 2.3.4 | Pacientes: "Ver mail" para direcciones largas | tabla de Pacientes |
| Extra 2.3.5 | Formulario público de turno reescrito + DNI único + fix de bug + botón "agregar paciente" | `pedir-turno-form.tsx`, backend de turno público, `agregar-turno-modal.tsx`, sección Pacientes |

Ver `docs/implementation-plan.md` §11.5 para el detalle de tareas y
criterios de aceptación de cada ítem.
