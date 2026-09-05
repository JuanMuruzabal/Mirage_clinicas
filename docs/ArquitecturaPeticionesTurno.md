# Arquitectura de peticiones de turno (formulario público)

**Objetivo de este documento:** dejar registrado, en un solo lugar, todo lo que se
implementó en Fase 2.4.1 (verificación de pacientes, conflictos de identidad,
seguridad/antiabuso) tal como quedó en el código — no como se recuerda de las
idas y vueltas de la conversación — más una lista concreta de qué testear ahora,
y el plan adaptado para el camino "para otro" (Fase 2.4.2, todavía sin
implementar).

Fuente de verdad del código: `apps/api/internal/http/turno_publico.go`,
`paciente_verificado_publico.go`, `paciente_conflicto_publico.go`,
`pacientes_conflicto_panel.go`, `verificacion_turno_publico.go`, `turnos.go`
(`marcarAsistenciaHandler`), `internal/ratelimit/ratelimit.go` (topes de
intentos). Documento hermano de `docs/tradeoffs.md` (decisiones
puntuales, TR-036 en adelante) y del brief original,
`docs/FASE 2.4 - detallada y bien especificada.docx`.

---

## Parte 1 — Qué hay implementado hoy (camino "para mí")

Todo lo de esta parte aplica **solo** al camino "para mí" del wizard público
(sin `pacienteVerificadoId` de tutor, sin datos de tercero). El camino "para
otro" está sin implementar — ver Parte 3.

### 1.1 — ¿Qué es un paciente "verificado"?

Una ficha de `Paciente` es VERIFICADA si y solo si se cumple **alguna** de estas
dos condiciones (`pacienteEstaVerificado`, `paciente_verificado_publico.go`):

- Tiene al menos un `Turno` con `estado = 'agendado'`, `hora_fin < ahora` y
  `asistencia = 'asistio'` (un turno resuelto y confirmado como asistido).
- La ficha la creó el profesional a mano (`Paciente.Origen = 'manual'` — "+
  Agregar paciente" o "Agregar turno" con paciente nuevo desde el panel). El
  profesional ya vio a esa persona en persona, no hace falta esperar un turno
  resuelto.

Esto se calcula al vuelo con una query cada vez — **nunca es una columna
guardada aparte** (mismo criterio que "resuelto" en el resto del sistema,
TR-074). No hay forma de que quede desincronizado.

### 1.2 — Detección de conflictos de identidad

Ocurre cuando llega un turno nuevo con un DNI que **ya existe** en la base para
esa clínica, pero con un mail distinto al que la ficha existente tiene
registrado (`crearPacientePublicoConDeteccionDeConflicto`,
`paciente_conflicto_publico.go`). Dos casos:

**Caso A — la ficha existente YA está verificada.**
El conflicto se marca de inmediato: se crea una ficha nueva y separada
(`en_conflicto = true`) para el mail nuevo, se vincula el turno a esa ficha
nueva (el turno se crea igual, nunca se rechaza), y se deja un
`ConflictoPaciente` visible ya mismo en `/panel/pacientes`. Motivo: "se
registró con un mail distinto al de la ficha ya verificada con este DNI".

**Caso B — ninguna de las dos fichas está verificada todavía.**
Se crea igual la ficha separada (`en_conflicto = true`) y el turno se vincula
a ella, pero **no se deja ningún `ConflictoPaciente` todavía** — "no sabemos
con certeza quién es el impostor acá" cuando ninguna de las dos demostró nada.
Las dos fichas quedan separadas y calladas, cada una con su propio turno,
hasta que:

- **Cualquiera de las dos se verifica** (se marca "asistió" en alguno de sus
  turnos) → en ese momento (`generarConflictosRetroactivosPorDNI`,
  `paciente_conflicto_publico.go`) se busca a la "hermana" (misma clínica,
  mismo DNI, ficha distinta) y se genera un `ConflictoPaciente`
  **PENDIENTE** (`Resuelto: false`), exactamente igual que el Caso A —
  **nunca se auto-resuelve**. Corrección de QA sobre un diseño anterior de
  esta sesión que sí lo hacía solo: "esto no se tiene que auto solucionar,
  se debe marcar al profesional para que lo resuelva manualmente" — ver la
  sección 1.12 más abajo para el bug real que motivó el cambio. Esto pasa **sin
  importar si la hermana ya está resuelta (pasó su hora) o todavía no** — lo
  único que lo frena es que la hermana YA esté verificada por su cuenta (dos
  identidades confirmadas compitiendo por el mismo DNI es una anomalía real,
  se deja para revisión manual directa, sin ticket).
- **Se marca "ausente" en el primer turno de una ficha no verificada** → esa
  ficha se borra directo (`borrarPacienteNoVerificadoSiSinHistorialReal`,
  `turnos.go`), sin pasar por el mecanismo de conflicto — nunca demostró nada,
  no hay nada que discutir. El turno en sí no se borra (queda con
  `paciente_id = NULL`, historial preservado).

**Mientras un `ConflictoPaciente` siga pendiente** (`Resuelto: false`),
`marcarAsistenciaHandler` (`turnos.go`) **bloquea con 409** marcar
asistencia/ausencia en **cualquier turno de las dos fichas involucradas** —
tanto la verificada como la que está en duda. Mensaje: "hay un conflicto de
identidad sin resolver con este paciente — resolvelo desde Pacientes antes de
marcar asistencia". Ver la sección 1.12 para el porqué.

**Única excepción al bloqueo de arriba — ver 1.3bis:** el turno puntual que
ORIGINÓ el conflicto (`ConflictoPaciente.TurnoEnConflictoID`) sí admite marcar
asistencia/ausencia, y hacerlo resuelve el conflicto ahí mismo — es la
confirmación presencial de que esa persona existe de verdad.

### 1.3 — Resolución manual de un conflicto (`/panel/pacientes`)

Dos salidas, ambas vía `POST /pacientes/conflictos/{id}/resolver`
(`resolverConflictoPacienteHandler`, `pacientes_conflicto_panel.go`) — es el
**único** lugar donde un conflicto se resuelve de verdad, sea que haya nacido
por el Caso A o por el Caso B:

**`esVerificado: true`** ("el mail es de la persona verificada" / "son la
misma persona, sacó 2 turnos por error con 2 mails"):
- El mail y el teléfono de la ficha en conflicto se migran a la ficha que
  prevalece como alternativos (`PacienteEmailAlternativo`/
  `PacienteTelefonoAlternativo`) — desde ahí el paciente puede volver a pedir
  turno con cualquiera de los dos mails.
- **Todos** los turnos de la ficha en conflicto se resuelven contra la que
  prevalece (no solo el que originó el conflicto — pudo acumular más de uno
  mientras nadie lo resolvía), con dos criterios distintos según su estado:
  - **Vigente** (a futuro): si es del **mismo tipo de consulta** que uno que
    la ficha verificada ya tiene vigente, se **cancela** (nunca se borra un
    turno, queda como registro histórico); si es de **otro tipo**, se
    **migra** (`paciente_id` pasa a apuntar a la ficha que prevalece).
  - **Ya resuelto** (pasó su horario): se **elimina directamente** — nunca
    se migra. "Por temas lógicos nunca asistió a este" bajo la identidad
    que se está descartando; migrarlo ensuciaría el historial real de quien
    prevalece con una consulta a la que nunca fue. Única excepción a "nunca
    se borra un turno" fuera de los detectores de abuso de
    `turno_publico.go` (1.5/1.6).
- La ficha en conflicto se borra — ya cumplió su propósito y no le queda
  ningún turno propio.

**`esVerificado: false`** ("el mail NO es del paciente verificado" / "son
personas distintas"):
- **Todos** los turnos de la ficha en conflicto (vigentes Y ya resueltos, sin
  distinción) se **cancelan** y se desvinculan (nunca se borran) — a
  diferencia del caso de arriba, acá no es un error propio sino un mail
  ajeno/ilegítimo, tiene sentido conservar el registro cancelado como rastro.
- El mail de la ficha en conflicto queda **bloqueado 7 días**
  (`EmailBloqueadoTurnoPublico`) — no puede volver a pedir turno con ese mail
  en esta clínica durante ese tiempo.
- La ficha en conflicto se borra.

En los dos casos, justo antes de borrar la ficha, una red de seguridad
desvincula (`paciente_id = NULL`) cualquier turno que por algún otro motivo
siguiera apuntando a ella — nunca dejar un `paciente_id` colgando hacia una
fila que ya no existe.

### 1.3bis — Resolución automática al marcar asistencia del turno disputado (TR-107)

Corrección de QA sobre 1.12/TR-106: el bloqueo general de asistencia
mientras haya un conflicto pendiente sigue valiendo para **todos los demás
turnos** de las dos fichas — pero el turno puntual que originó el conflicto
(`TurnoEnConflictoID`) es una excepción deliberada: es justo la confirmación
presencial que hace falta para saber quién es real. A diferencia del bug de
TR-106 (que trataba a cualquiera de las dos fichas como ganadora según cuál
se verificara), acá la dirección es **fija y asimétrica** — nunca puede
terminar borrando a la ficha que ya estaba verificada de antes:

- **Se marca "asistió"** → se resuelve el conflicto exactamente como
  `esVerificado: true` en 1.3 (`resolverConflictoComoVerdadero`, extraída y
  compartida con el botón manual del panel: migración estándar,
  mail/teléfono a alternativos, resto de los turnos migrados o cancelados
  por `migrarOCancelarTurnosDePerdedor`) — la ficha en conflicto demostró
  ser real, se fusiona con la verificada. El turno disputado en sí es un
  caso especial: aunque ya está RESUELTO (pasó su hora, por eso se pudo
  marcar asistencia), no cae en la regla general de "turno resuelto del
  perdedor se borra" de 1.3 — se migra directo al paciente verificado
  ANTES de correr esa regla, para no perder la asistencia real recién
  confirmada.
- **Se marca "ausente"** → se resuelve como `esVerificado: false` en 1.3
  (`resolverConflictoComoFalso`, misma función compartida) pero con
  `bloquearMail=false` — se borra la ficha en conflicto y se cierra el
  ticket, **sin bloquear el mail**. Un ausente no prueba fraude, solo
  prueba que no vino esa vez — "puede que sea verdaderamente" quien dice
  ser (ej. un tutor real que no pudo llegar). Distinto del
  `esVerificado: false` manual de 1.3, que sí bloquea 7 días — ahí la
  decisión de "no es la misma persona" la toma un profesional mirando el
  caso, acá el sistema no tiene esa certeza, así que no aplica el castigo.
  El turno disputado en sí queda excluido del cancelado masivo que aplica
  al resto de los turnos de la ficha — se desvincula (`paciente_id = NULL`)
  pero mantiene `estado = 'agendado'` y `asistencia = 'ausente'`, historial
  real de un turno agendado al que no se asistió, no un turno dado de baja.

Si el conflicto ya se había resuelto a mano desde el panel antes de que
llegue la fecha del turno, esta excepción no aplica — el `ConflictoPaciente`
ya no está pendiente, así que el turno se marca con el flujo normal, sin
nada especial.

**Implementado y testeado** (`marcarAsistenciaHandler`, turnos.go):
`TestMarcarAsistencia_AsistioEnTurnoDisputadoResuelveConflictoComoVerdadero`,
`TestMarcarAsistencia_AusenteEnTurnoDisputadoBorraFichaSinBloquearMail`,
`TestMarcarAsistencia_ConflictoYaResueltoNoAplicaCarveOut` — ver también
`TestMarcarAsistencia_ConflictoExistenteBloqueaAsistencia` (el bloqueo
general sobre cualquier OTRO turno de las dos fichas sigue vigente sin
cambios).

**Bug real corregido (TR-110, 2026-09-05) — el nombre de la ficha en
conflicto sobrevivía a la resolución.** `Turno.NombreContacto`/
`ApellidoContacto` es un snapshot propio (tomado al sacar el turno, nunca
un join en vivo contra `Paciente`) — `resolverConflictoComoVerdadero`/
`migrarOCancelarTurnosDePerdedor` reasignaban `paciente_id` al ganador
pero nunca ese snapshot, así que una tarjeta de turno podía seguir
mostrando el nombre tipeado en el pedido que disparó el conflicto (ej.
"Juan IGNACIO Muruzabal") después de resolverlo a favor del verificado
("Juan Muruzabal"). Aplica igual a las dos vías de resolución de esta
sección — el botón manual del panel (1.3) y el carve-out de asistencia de
acá arriba (1.3bis), porque las dos comparten `resolverConflictoComoVerdadero`.
Fix: cada turno que pasa a la ficha que prevalece ahora también pisa
`NombreContacto`/`ApellidoContacto` con el nombre canónico de esa ficha.
Test: `TestResolverConflictoPaciente_EsVerificadoUsaNombreCanonico`.

### 1.3ter — Cartel de confirmación de asistencia en tiempo real (TR-107, frontend)

Pedido textual del cliente: apenas se cumple la hora de fin de un turno
(pasa a "resuelto" sin asistencia marcada todavía), aparece un cartel
**bloqueante** (fondo con blur, no se puede cerrar sin responder) con los
datos del paciente y el turno, y dos acciones — ASISTIÓ / NO ASISTIÓ —
cada una detrás de un botón que hay que **mantener apretado 10 segundos**
(con una animación de llenado visible) antes de confirmar, para que nunca
sea una reacción espontánea — la marca es irreversible (TR-092).

Deliberadamente en **tiempo real** (no "la próxima vez que entrás al
calendario") — pedido explícito: pasa una sola vez por turno, y cuanto
antes se resuelva, antes se dispara — si corresponde — la resolución
automática de un conflicto pendiente (1.3bis). Implica que el panel
necesita un mecanismo que sepa, en todo momento mientras el profesional
tiene la app abierta, cuál es el próximo turno sin marcar que está por
resolverse, y dispare el cartel exactamente en ese instante — sin
necesidad de que el profesional esté mirando esa pantalla en particular
(el cartel se antepone a cualquier vista del panel).

**Implementado y testeado** (`components/panel/asistencia-cartel-global.tsx`,
montado una sola vez en `app/panel/layout.tsx` — no dentro de una página
puntual, para que aparezca sin importar en qué pantalla del panel esté el
profesional):

- **Corrección de QA (TR-108) — única forma de marcar asistencia**:
  pedido textual del cliente, "vamos a quitar todos los otros botones
  para poner ausente o presente fuera de esto" — `TurnoDetalle`
  (calendario) y la pestaña "Resueltos" de `/panel/turnos` (`TurnosTable`)
  perdieron sus botones Asistió/Ausente, quedan de solo lectura. El
  cartel es ahora el único lugar de todo el panel donde se marca
  asistencia.
- **Sondeo**: pide `turnosPendientesAsistenciaAction()` →
  `GET /turnos/pendientes-asistencia` (`turnos_pendientes_asistencia.go`)
  al montar y cada 30s. **Sin ningún tope de fecha** (corrección de QA,
  TR-108, sobre un primer diseño acotado a "hoy"): pedido textual del
  cliente, "el cartel siempre debe aparecer si tengo un turno resuelto, y
  no lo puedo quitar aunque cierre la app, siempre que vuelva es lo
  primero que debo ver... si hay más de uno se deben acumular hasta
  marcarlos todos" — el backend ya devuelve `vencidos` filtrado (resuelto,
  sin `asistencia`) y ordenado (más antiguo primero), sin importar la
  antigüedad; el cliente ya no filtra ni ordena nada.
- **Timer preciso**: el mismo endpoint devuelve `proximoVencimiento` (la
  hora de fin del turno vigente más próximo a resolverse) — el cliente
  programa un `setTimeout` exacto para ese instante, así el cartel
  aparece apenas se cumple la hora, sin esperar hasta el próximo sondeo
  periódico de 30s.
- **Cola**: si hay más de un turno resuelto sin marcar a la vez, se
  muestra uno por vez (el que ya viene primero en `vencidos`) — al
  resolver uno, se vuelve a sondear (por si el backend acaba de cerrar un
  `ConflictoPaciente`, 1.3bis, que cambia qué corresponde mostrar
  después) y aparece el siguiente si queda alguno.
- **Incerrable de verdad**: sin botón "×", sin cierre al tocar el fondo,
  sin manejo de tecla Escape — la única forma de que desaparezca es
  completar uno de los dos botones.
- **Mantener apretado 10 segundos**: `setInterval` de 50ms actualizando
  un ancho de 0 a 100% (no `requestAnimationFrame` — resultado visual
  equivalente, pero determinista bajo fake timers en los tests). Soltar
  antes de los 10 segundos reinicia el progreso a cero sin confirmar
  nada; con teclado, mantener apretado Espacio/Enter hace lo mismo
  (`onKeyDown`/`onKeyUp`, no solo eventos de puntero).
- Tests: `components/panel/asistencia-cartel-global.test.tsx` (8 casos —
  nada que mostrar sin turnos pendientes, muestra el primero de la cola
  tal como la manda el backend, sin forma de cerrar, soltar antes de
  tiempo no confirma, 10 segundos completos sí confirma con el valor
  correcto para ambos botones, soltar y volver a apretar reinicia el
  progreso, el timer preciso del próximo vencimiento dispara un nuevo
  sondeo); `turnos_pendientes_asistencia_test.go` (6 casos, backend —
  vacío sin turnos, incluye vencidos sin importar la fecha, no incluye ya
  marcados, ordena del más antiguo al más nuevo, próximo vencimiento del
  turno vigente más próximo, scoping por profesional).

### 1.3quater — Referencia visual de asistencia + aviso global de conflictos (TR-108)

Tres pedidos textuales del cliente, todos sobre "ya que estamos, no hay
referencia visual de esto":

- **Ficha de paciente, historial de turnos** (`paciente-turnos-table.tsx`):
  etiqueta Asistió/Ausente junto a "Resuelto" en la columna Estado.
- **Calendario, semana/día** (`calendar-grid.tsx`): contorno verde
  (`border-salvia-oscuro`) si asistió, rojo (`border-terracota-oscuro`)
  si ausente, en la tarjeta del turno resuelto. **Calendario, mes**
  (`calendar-month-grid.tsx`): mismo criterio adaptado al punto de 1.5px
  de esa vista — un anillo (`ring-2`) alrededor en vez de un borde de
  tarjeta.
- **Aviso global de conflictos** (`NotificacionesConflictoGlobal`,
  montado en `app/panel/layout.tsx` arriba del todo, ver
  `docs/foto1.png`): "si estoy afuera de la sección pacientes mostrar las
  notificaciones de conflicto... si es conflicto de pacientes que diga
  tenés un conflicto con los pacientes y me envíe al apartado paciente,
  si es conflicto con turno de calendario al calendario". Nuevo endpoint
  `GET /panel/notificaciones` (`panel_notificaciones.go`) — dos
  contadores independientes:
  - `conflictosPacientes`: mismo criterio que `listConflictosPacienteHandler`
    (`ConflictoPaciente.Resuelto = false`).
  - `conflictosCalendario`: turno vigente que se superpone con un
    horario reservado vigente (TR-090 — un conflicto cuyo turno ya pasó
    deja de contar). Reusa `bloqueosDelDia`/`intervaloMinutos.solapaCon`
    de `disponibilidad.go` (las mismas funciones que ya usa
    `calcularDisponibilidad`) en vez de reimplementar en Go el cálculo
    de clustering visual del calendario (`segmentosParaVisualizar`, del
    lado del front) — ese cálculo está pensado para renderizar
    (posiciones, agrupación de "Ver eventos"), acá solo hace falta
    contar superposiciones.

  Cada aviso se oculta en la pantalla que ya tiene el suyo propio más
  específico (`ConflictosPacienteBanner` en /panel/pacientes, el banner
  de conflicto del calendario en /panel/calendario, TR-095) — nunca se
  duplica el mismo aviso dos veces en la misma pantalla.
- **Botón "¿Qué es un paciente verificado?"** en `/panel/pacientes`
  (`QueEsVerificadoBoton`) — modal puramente informativo, mismo criterio
  de "verificado" que `EstadoVerificadoBadge`/`pacienteEstaVerificado`
  (1.1).

**Implementado y testeado**: `paciente-turnos-table.test.tsx`,
`calendar-grid.test.tsx`, `calendar-month-grid.test.tsx`,
`notificaciones-conflicto-global.test.tsx` (7 casos),
`que-es-verificado-boton.test.tsx` (4 casos),
`panel_notificaciones_test.go` (5 casos backend).

### 1.4 — Tope de turnos duplicados del mismo tipo de consulta

Para una ficha **verificada**, la regla no cambió: no puede tener más de
**1 turno vigente** del mismo tipo de consulta — el segundo pedido se
rechaza con 409 y el mensaje incluye la fecha del que ya tiene agendado
(`turnoVigenteDeTipo`).

Para una ficha **no verificada**, la regla se reemplazó por una más
estricta (TR-107, 2026-09-05) — ver 1.4bis. La vieja regla ("hasta 3
turnos vigentes del mismo DNI+tipo, el 4to rechaza",
`contarTurnosVigentesPorDNIYTipo`/`limiteTurnosSinVerificarPorDNIYTipo`)
**queda en el código, sin borrarse, pero es inalcanzable en la práctica**:
la regla nueva de 1.4bis topea en 1, así que nunca se llega ni al 2do
turno como para que la vieja de 3 tuviera oportunidad de disparar. Se
deja de fondo por pedido explícito, no por descuido.

### 1.4bis — Tope de 1 turno activo por DNI, universal (TR-107, endurecido en TR-109)

Pedido textual del cliente, revisión sobre el diseño de 1.4: "es muy
específico que un atacante sepa que tal DNI va a asistir a la clínica y
reservarlo de antemano" — en vez de tolerar varios turnos sin verificar
por el mismo DNI y tratar de detectar el patrón de abuso después (como
hacía el tope de 3), se ataca la raíz.

**Corrección de QA (TR-109) — la regla se volvió universal.** El diseño
original de TR-107 tenía DOS reglas separadas (mismo tipo / otro tipo),
y la de "otro tipo" exceptuaba a las fichas YA VERIFICADAS. El cliente
pidió eliminar esa distinción: "sea paciente verificado o no verificado
solo puede tener un turno activo con el mismo dni, sea el tipo de
consulta que sea... esto simplifica aún más la lógica de conflictos".
Ahora es UNA sola función, `turnoActivoPorDNI` — sin filtrar por tipo de
consulta NI por si la ficha está verificada:

> Si el DNI ya tiene CUALQUIER turno vigente (estado agendado, hora de
> fin todavía no pasó), el pedido se rechaza — sea el mismo tipo de
> consulta o cualquier otro, sea la ficha existente verificada o no, sea
> el mismo mail que ya lo reservó o uno distinto. Sin excepciones.

Mensaje único: "ya tenés un turno pendiente, con mail {censurado
parcial, ej. `muru...@gmail.com`}. No podés sacar otro turno — por
cualquier consulta o modificación, contactate con la clínica." (mismo
criterio de censura que la tarjeta de "ya he venido antes",
`dniCensurado`/`nombreConIniciales` en `paciente_verificado_publico.go`
— decisión consciente de exponer un dato de contacto ajeno a quien solo
conoce el DNI: es la señal que le permite a la persona real notar que
alguien está usando su documento). El frontend (`pedir-turno-form.tsx`)
detecta este mensaje puntual y suma un botón "Escribir por WhatsApp" al
teléfono de la clínica — el mismo que ya existía para el chequeo viejo
de "turno duplicado del mismo tipo" (`errTurnoPublicoDuplicado`, ahora
inalcanzable), solo se actualizó la condición que lo muestra.

Se chequea en los dos caminos del formulario público:

- **"Primera vez"** (sin `pacienteVerificadoId`): ANTES de resolver o
  crear cualquier ficha — mismo motivo que el detector de mail-abuso de
  1.5, nunca dejar una ficha huérfana sin turno si el pedido se rechaza.
- **"Ya he venido antes"** (con `pacienteVerificadoId`): justo después
  de resolver la ficha elegida — recién ahí se conoce el DNI, esa ficha
  ya existe de antes así que no hay riesgo de huérfanos.

Las dos reglas viejas de TR-107 (`turnoActivoDelMismoTipo`/
`turnoActivoDeOtroTipo`, con su excepción de verificado) y el chequeo de
"ya tenés turno de este tipo" para verificados
(`turnoVigenteDeTipo`/`errTurnoPublicoDuplicado`, más abajo en el
código) quedan sin tocar, ahora inalcanzables en la práctica — la regla
nueva es un superconjunto estricto, cualquier caso que las disparaba a
ellas ya dispara la nueva primero. Mismo criterio de siempre: "no
descartar nada de lo ya establecido".

Efecto práctico: mientras un DNI tenga CUALQUIER turno vigente sin
resolver, NADIE puede sacarle un turno nuevo — ni el mismo mail, ni uno
distinto, sea cual sea el tipo de consulta, esté o no verificada la
ficha existente. Recién cuando ese turno se resuelve (pasa su horario)
el DNI vuelve a estar disponible para un pedido nuevo — ahí sí entra en
juego 1.2 normalmente (Caso A si la ficha original ya quedó verificada,
Caso B si no,
`TestSolicitarTurnoPublico_TurnoResueltoLiberaElTopeDeUnoPorDNI`,
`TestSolicitarTurnoPublico_MismoDNIMailDistintoCreaFichaSeparadaSinConflictoSiNadieVerificado`
y `TestSolicitarTurnoPublico_MismoDNIMismoMailReusaPaciente`) —
incluido el caso de una ficha YA verificada
(`TestSolicitarTurnoPublico_VerificadoConOtroTipoActivoTambienRechaza`,
`TestSolicitarTurnoPublico_VerificadoConTurnoActivoRechazaOtroPedidoDelMismoTipo`,
`TestSolicitarTurnoPublico_PacienteVerificadoIdConTurnoActivoPropioRechaza`).

**Qué NO reemplaza:** el tope de mail con muchos DNIs (1.5, un mail
tocando MUCHOS DNIs distintos) y la rotación por IP (1.6) siguen
totalmente vigentes — cubren un eje distinto (cuántos DNIs distintos toca
un mail/IP, no cuántos turnos tiene UN DNI) que esta regla nueva no
resuelve.

### 1.4ter — "Mis turnos" (consulta pública sin verificación, TR-109)

Pedido textual del cliente: "agregar un botón debajo de sacar turno de la
página que sea MIS TURNOS, que pida dni y mail, si coincide con un turno
activo mostrarlo en forma de tarjeta". `GET /clinicas/{slug}/mis-turnos?dni=&email=`
(`mis_turnos_publico.go`) — a diferencia de "ya he venido antes"
(1.3/pacienteVerificadoPublicoHandler), que exige el código de
"Confirmanos que sos vos", acá el cliente pidió DNI+mail directo, sin
ese paso. Gracias a 1.4bis (a lo sumo 1 turno vigente por DNI), la
respuesta nunca es una lista.

Mitigación de abuso, ya que no hay código de verificación de por medio:
rate limit por IP+clínica (`RateLimitScopeMisTurnosConsulta`, 20/hora).
El mail tiene que coincidir EXACTO con el de ese turno — si no coincide,
la respuesta es la misma que "no existe ningún turno" (nunca se revela
que el DNI tiene algo a quien no demostró conocer el mail correcto,
mismo espíritu que el resto de las censuras de este documento). La
tarjeta que arma el frontend (`components/public/mis-turnos-button.tsx`)
muestra tipo de consulta, fecha, hora y nombre — nada más sensible.

### 1.4quater — Mail de confirmación al sacar un turno (TR-109)

Pedido textual del cliente: "cada vez que se saque un turno, enviar una
notificación por mail, al mail con el que se hizo el turno". Nuevo
método `SendTurnoConfirmadoEmail` en la interfaz `mail.Sender`
(implementado en `LogSender`/`ResendSender`, mismo patrón dev/prod de
siempre — spec §9.4) + plantilla `templates/turno_confirmado.html`. Se
dispara DESPUÉS de que la transacción de creación del turno ya comiteó
— un mail que falla nunca tumba el request que lo generó, y no se manda
nada si el pedido termina rechazado por cualquiera de las reglas de
arriba.

### 1.5 — Seguridad: mail con muchos DNIs distintos

`limiteDNIsDistintosPorMail = 2` (bajado de 5 tras probarlo en esta sesión —
5 era demasiado permisivo). Si el mismo mail ya tiene **2 DNIs distintos con
turno vigente** y llega un **3er DNI nuevo**, ese pedido:

- **No llega a crear nada** — ni ficha de paciente ni turno (el chequeo corre
  ANTES de resolver la ficha, para no dejar una ficha huérfana sin turno).
- Borra de verdad (no cancela) los turnos que ya existían de ese mail, y las
  fichas de paciente que se quedan sin ningún turno como resultado (si no
  están verificadas).
- Bloquea el mail 3 días (`EmailBloqueadoTurnoPublico`) y la IP del pedido 24
  horas (`IPBloqueadaTurnoPublico`) — "este tipo de infractor bloquea la IP
  para que no vulnere con el otro tipo de caminos".
- Queda todo registrado en `AuditoriaBloqueoTurnoPublico`, visible en
  `/panel/seguridad`.

Solo cuentan turnos **VIGENTES** (`estado='agendado' AND hora_fin>=ahora`) —
un turno cancelado ya pasó por contacto real con el consultorio y no cuenta
para el tope.

**Alcance explícito:** solo aplica al camino "para mí". Un tutor legítimo con
varios hijos (mismo mail, DNIs distintos) es exactamente el patrón que este
chequeo NO debe tocar — ver Parte 3.

### 1.6 — Seguridad: rotación de mail+DNI por IP

Cubre el caso que el tope de arriba no ve: un atacante que nunca repite ni
mail ni DNI (cada pedido "parece" una persona nueva legítima). Si desde la
misma IP, en los últimos **30 minutos**, hay **4 o más mails distintos Y 4 o
más DNIs distintos** (`limiteDistintosPorIPParaRotacion = 4`,
`ventanaRotacionPorIP`), el pedido que completa el patrón:

- No llega a crearse (el chequeo corre antes de crear el turno de este
  pedido).
- Borra de verdad los turnos ANTERIORES de esa misma IP (aunque cada uno
  aislado pareciera legítimo, en conjunto ya formaban el patrón).
- Bloquea la IP 24 horas.
- Auditoría con `Motivo = "ip_rotacion"`, sin mail asociado (hay varios
  distintos, no hay uno solo del que tener certeza).

Los dos conteos (mails y DNIs) son **independientes** — hace falta que
**ambos** superen el límite. Contar pares `(mail, DNI)` combinados sería un
error: el detector de mail-abuso de arriba ya genera "pares distintos" cada
vez que solo cambia el DNI, así que un conteo combinado dispararía este
detector antes de tiempo con el mismo mail reusado.

### 1.7 — Rate limits y bloqueos: cuándo se aplica cada uno y por cuánto tiempo

Esto es lo que se prestaba a confusión en las pruebas manuales — hay varios
límites distintos apilados en el mismo par de endpoints
(`enviarVerificacionTurnoPublicoHandler`/`confirmarVerificacionTurnoPublicoHandler`,
`verificacion_turno_publico.go`), más los bloqueos que salen de los
detectores de abuso (1.5/1.6) y de resolver un conflicto (1.3). Los límites
de intentos de la primera tabla no aparecen en `/panel/seguridad` — son
puramente transitorios (en memoria o en una tabla interna de rate-limit); los
bloqueos persistentes de la segunda tabla sí se ven ahí.

**Límites de intentos** (`internal/ratelimit/ratelimit.go`) — todos dan 429
("demasiados intentos...", o "esperá un momento antes de pedir otro código"
para el cooldown puntual):

| Acción | Alcance | Tope | Ventana |
|---|---|---|---|
| Enviar código | por mail + clínica | 5 | 1 hora |
| Enviar código | cooldown entre dos códigos del mismo mail | 1 | 60 segundos |
| Enviar código | por IP + clínica | 20 | 1 hora |
| Confirmar código | por mail + clínica | 8 | 15 minutos |
| Confirmar código | por IP + clínica | 30 | 1 hora |

**Ojo con cómo "vencen" estas ventanas**: no son una cuenta regresiva desde
el momento del pedido — se truncan a un límite de reloj fijo (`time.Truncate`):
la de 1 hora resetea en el minuto 0 de cada hora UTC, la de 15 minutos en
cada cuarto de hora, la de 60 segundos en cada minuto. En la práctica esto
significa que el tiempo real de espera puede ser bastante menos (o un poco
más) que el nominal, según en qué punto del reloj se pidió. El límite por
**cuenta** (mail+clínica) y el de **IP+clínica** son independientes — agotar
uno no toca el otro.

**Bloqueos persistentes** (quedan en la base, visibles y desbloqueables desde
`/panel/seguridad` — ver 1.10):

| Motivo | Qué bloquea | Duración |
|---|---|---|
| Mail con más de `limiteDNIsDistintosPorMail` DNIs distintos (1.5) | Mail (3 días) + IP del pedido (24hs) | 3 días / 24hs |
| Rotación de mail+DNI por IP (1.6) | Solo la IP | 24hs |
| Resolver un conflicto como "no es la misma persona" (1.3) | Solo el mail de la ficha rechazada | 7 días |

Los bloqueos por abuso (1.5/1.6) usan una IP más corta a propósito — es una
señal más débil (compartida por CGNAT/wifi, spoofeable vía
`X-Forwarded-For`, ver el comentario grande sobre `clientIP` en `auth.go`) —
si le pega a alguien que no era, que dure poco. El bloqueo de mail por
conflicto (7 días) es más largo porque nace de una decisión humana del
profesional, no de un detector automático — hay mucha más certeza detrás.

**Duración de los tokens del wizard** ("Confirmanos que sos vos",
`verificacion_turno_publico.go`):

| Token | Duración |
|---|---|
| Código de 6 dígitos (`turnoVerifCodigoTTL`) | 15 minutos |
| Prueba de verificación ya confirmada, para pedir el turno (`turnoVerifPruebaTTL`) | 30 minutos |

El código en sí dura poco (se escribe a mano mientras se mira la pantalla);
el token de prueba (una vez confirmado el código) dura más porque después
todavía falta elegir tipo de consulta → fecha → horario antes de mandar el
pedido final.

### 1.8 — CAPTCHA

`enviarVerificacionTurnoPublicoHandler` (primer paso de "Confirmanos que sos
vos") exige resolver el mismo Cloudflare Turnstile que ya protege
registro/reset de contraseña. Sin `TURNSTILE_SECRET_KEY` configurada (local,
o si nunca se cargó en producción) el chequeo siempre pasa — **verificar que
esté cargada en Render de verdad**, porque sin CAPTCHA los detectores de
arriba pasan de ser una segunda capa a ser la única línea de defensa.

### 1.9 — Modo simulado (solo local, sin `RESEND_API_KEY`)

`AuthDeps.SimularBloqueosSeguridad` (mismo criterio que
`AutoVerifyEmail`/`ExponerCodigoVerificacion` — se apaga solo apenas se
configure Resend). Con esto prendido:

- El **borrado de turnos pasa de verdad** en los 3 detectores — corrección de
  QA sobre el diseño inicial ("para ver que sí funciona").
- Lo único que se saltea es el **bloqueo persistente** de mail/IP — así se
  puede seguir probando sin esperar 3 días/24hs.
- El tope de DNI+tipo (que no borra ni bloquea nada en modo real tampoco) deja
  pasar el turno igual y solo registra auditoría.
- Todo queda en `AuditoriaBloqueoTurnoPublico` con `Simulado = true`, visible
  con una marca en `/panel/seguridad`.

### 1.10 — Auditoría y recuperación (`/panel/seguridad`)

Lista mails/IPs bloqueados vigentes (con botón "Desbloquear" para un falso
positivo) y el historial completo de `AuditoriaBloqueoTurnoPublico` (qué se
borró, por qué motivo, cuántos turnos, si fue simulado). Los turnos borrados
en sí **no se pueden recuperar** — desbloquear solo levanta el bloqueo futuro.

### 1.11 — Bug de migración corregido (2026-09-04, TR-105)

Una migración de arrastre (`runMigrationsLocked`, de antes de que existiera
`en_conflicto`) fusionaba en silencio, **en cada reinicio/deploy del
contenedor**, cualquier par de fichas separadas a propósito por un conflicto
sin resolver — deshaciendo todo el mecanismo de 1.2. Corregido acotando esa
migración a `WHERE NOT en_conflicto`. Ver TR-105 en `docs/tradeoffs.md` para
el registro completo — **cualquier migración nueva con SQL crudo que mute datos** (no solo
esquema) tiene que revisarse cada vez que cambie un invariante del modelo,
porque corre para siempre, no una sola vez.

### 1.12 — Bug de auto-resolución de conflictos corregido (2026-09-04, TR-106)

La primera versión de esta misma Fase 2.4.1 (implementada y corregida dentro
de esta misma sesión, nunca llegó a producción) auto-resolvía el conflicto
retroactivo del Caso B apenas se verificaba una de las dos fichas — sin
esperar a que el profesional lo revisara. Encontramos un escenario real donde
eso es peligroso:

1. Ficha "Real" ya verificada. Llega un turno nuevo con el mismo DNI, mail
   distinto → Caso A: conflicto creado de inmediato, pendiente.
2. El profesional no lo resuelve todavía.
3. Pasa el tiempo. El turno de la ficha "en conflicto" también se resuelve, y
   el profesional — sin saber que hay un conflicto pendiente — le marca
   "asistió" también a **ese**.
4. Con el diseño viejo, este paso disparaba el mecanismo de nuevo — y como la
   ficha "en conflicto" era la que ACABABA de verificarse, el código la
   tomaba como ganadora y **borraba a "Real"** (la que en realidad tenía la
   verificación original), migrando los datos del impostor por encima. Sin
   revisión humana, y decidiendo al revés de lo esperable.

La corrección tiene dos partes, y la segunda depende de la primera para ser
segura:

- `generarConflictosRetroactivosPorDNI` (antes `resolverConflictosRetroactivosPorDNI`,
  y el ahora eliminado `autoResolverConflictosAlVerificar`) dejó de
  migrar/cancelar/borrar nada — solo crea el `ConflictoPaciente` pendiente
  (ver 1.2/1.3).
- `marcarAsistenciaHandler` bloquea con 409 marcar asistencia/ausencia en
  cualquier turno de una ficha que participe de un conflicto pendiente (ver
  1.2). Esto es lo que vuelve **imposible** repetir el escenario de arriba:
  para cuando el profesional intenta el paso 3, el sistema ya le avisa que
  hay que resolver el conflicto primero — nunca llega a haber una segunda
  verificación "sorpresa" sobre un ticket que ya existía. De paso tapa otro
  agujero relacionado: marcar "ausente" en la ficha en conflicto (sin este
  bloqueo) la hubiera borrado sola (`borrarPacienteNoVerificadoSiSinHistorialReal`),
  dejando el ticket pendiente apuntando a una ficha que ya no existe.

Efecto secundario, también corregido: como la resolución real ahora SIEMPRE
pasa por `resolverConflictoPacienteHandler` (nunca por un camino automático),
un turno ya RESUELTO de la ficha que pierde — que antes solo se tocaba si
`migrarOCancelarTurnosDePerdedor` lo veía vigente — podía quedar huérfano
(`paciente_id` apuntando a una fila recién borrada). Corregido: se elimina
directo si `esVerificado: true` (nunca asistió bajo esa identidad, migrarlo
ensuciaría el historial real), o se cancela+desvincula igual que uno vigente
si `esVerificado: false` (ver 1.3).

### 1.13 — Persistencia del progreso del wizard en el navegador (TR-111, frontend)

Pedido textual del cliente (2026-09-05), pensado para mobile: "si esta
ventana se cierra o se reinicia... al poner Pedir turno, [debería] llevarlo
al paso del wizard en el que estaba" — tocar afuera del modal sin querer, o
que el navegador recicle la pestaña, desmonta `PedirTurnoForm` por completo
(`PedirTurnoButton` lo renderiza condicionalmente dentro de `{abierto && ...}`)
y con eso se pierde todo el estado de React — nombre/DNI/mail tipeados,
el código de verificación ya solicitado, todo.

`pedir-turno-form.tsx` ahora persiste el progreso en `localStorage` (clave
`dental-mirage:pedir-turno:{slug}` — separado por clínica, un mismo
navegador puede estar pidiendo turno en dos clínicas distintas sin que se
mezclen) en cada cambio relevante: paso actual, flujo, datos de contacto,
DNI/mail del camino "ya he venido antes", el token/mail de verificación ya
confirmados, la tarjeta de paciente verificado si ya se mostró, y la
selección de tipo de consulta/fecha/hora. **Se excluye a propósito** el
código de 6 dígitos tipeado y el token de Turnstile — ninguno de los dos
sirve restaurado (de un solo uso o efímero). Esto NO es la cookie de
sesión de `lib/session.ts` (esa sigue sin tocar localStorage, spec §9.3)
— es el progreso de un formulario público que el paciente ya le mandó al
backend en cada paso, no una credencial.

Ventana de 30 minutos desde el último cambio (`turnoVerifPruebaTTL`, ver
1.7) — pasado ese tiempo el token de verificación ya venció de todos
modos, así que un progreso más viejo se descarta y el wizard arranca de
cero en "¿Para quién es el turno?". Se borra también al confirmar el
turno con éxito (nada que resumir) y se ignora silenciosamente cualquier
dato corrupto o de otra versión (nunca rompe el wizard, en el peor caso
arranca de cero). El tipo de consulta restaurado se re-valida contra la
lista fresca al recargar (por si el profesional lo borró mientras
tanto) — si ya no existe, cae al primero disponible en vez de dejar el
`<select>` apuntando a un id fantasma.

**Implementado y testeado** (`pedir-turno-form.test.tsx`, describe
"persistencia del progreso"): retoma "Confirmanos que sos vos" con el
mail ya cargado, retoma "turno" con tipo/fecha ya elegidos, no mezcla
progreso entre dos slugs distintos, borra el progreso al confirmar con
éxito, ignora un progreso vencido (30+ min) y datos corruptos.

---

## Parte 2 — Qué testear ahora

Lista concreta, en orden sugerido. Todo esto es sobre el camino "para mí" —
"para otro" todavía no existe (Parte 3).

**Identidad y conflictos**

1. Primera vez, sin conflicto: pedir turno nuevo, DNI nunca visto → ficha
   nueva, sin `en_conflicto`, sin ticket.
2. Mismo DNI, mismo mail, segunda vez → reusa la misma ficha (sync silencioso,
   sin conflicto).
3. Mismo DNI, mail distinto, **ninguna verificada** → 2 fichas separadas
   (`SELECT * FROM pacientes WHERE dni = '...'` debería dar 2 filas), **sin**
   `ConflictoPaciente` todavía.
4. Sobre el caso 3: marcar "asistió" en el turno de UNA de las dos → debería
   aparecer un `ConflictoPaciente` **PENDIENTE** (`Resuelto = false`) en
   `/panel/pacientes` — la ficha "hermana" y su turno **no se tocan
   todavía** (siguen `agendado`, sin borrarse ni migrarse).
5. Con el conflicto del caso 4 (o del caso 6) todavía pendiente, intentar
   marcar asistencia/ausencia en **cualquier** turno de las 2 fichas
   involucradas — la verificada también — debe **rechazar con 409** ("hay un
   conflicto de identidad sin resolver con este paciente...").
6. Mismo DNI, mail distinto, la ficha existente **ya está verificada** → el
   conflicto debe aparecer YA MISMO en `/panel/pacientes` (no esperar a
   nada), `Resuelto = false`.
7. Sobre el conflicto pendiente del caso 4 o 6, resolver como "es la misma
   persona" → confirmar migración de mail/teléfono a alternativos, el turno
   vigente cancelado o migrado según si choca con un turno vigente del mismo
   tipo, y — si la ficha que pierde tiene además un turno **ya resuelto** —
   ese turno debe **eliminarse directamente** (`SELECT` por su id debería dar
   0 filas), nunca migrarse ni quedar huérfano.
8. Mismo escenario que el 7, pero resolver como "no es la misma persona" →
   turno vigente cancelado y desvinculado, mail bloqueado 7 días (probar que
   un pedido nuevo con ese mail rebota), y el turno **ya resuelto** de esa
   ficha también debe quedar **cancelado y desvinculado** (no eliminado, a
   diferencia del caso 7).
9. Caso 3, pero en vez de verificar se marca "ausente" en el primer turno de
   una de las dos → esa ficha debería desaparecer sola, sin pasar por
   conflicto, y la otra debería seguir intacta.
10. Reiniciar/reconstruir el contenedor de la API con un conflicto
    **pendiente** (de cualquiera de los 2 casos, antes de resolverlo a mano)
    → el ticket debe seguir `Resuelto = false` y las dos fichas separadas
    después del reinicio — regresión del bug de 1.10, y confirma de paso que
    nada se auto-resuelve solo con el paso del tiempo o un redeploy.

**Topes de turnos duplicados**

11. Ficha verificada: pedir un 2do turno del mismo tipo de consulta → 409 con
    la fecha del que ya tiene.
12. Ficha no verificada: pedir 4 turnos del mismo DNI+tipo (variando el mail)
    → los primeros 3 pasan, el 4to rechaza con 409.

**Camino "ya he venido antes"**

13. Con una ficha realmente verificada: pedir código al mail real → tarjeta
    con datos censurados → turno se crea vinculado a esa ficha, con los datos
    reales (no los que "escribiría" un impostor).
14. Con un DNI que existe pero NO está verificado: debería rechazar con 404
    ("no encontramos un paciente verificado con esos datos") — nunca debería
    dejar pasar a alguien no verificado por esta puerta.

**Seguridad / abuso**

15. Mismo mail, 2 DNIs distintos vigentes, pedir un 3ro → rechazo, borrado
    real de los 2 anteriores, mail bloqueado 3 días, IP bloqueada 24hs,
    auditoría con `TurnosBorrados = 2`.
16. Repetir el caso 15 pero cancelando uno de los 2 turnos antes del 3er
    pedido → el 3ro debería pasar (el cancelado no cuenta).
17. Rotación por IP: 4 pedidos con mail Y DNI siempre nuevos, 5to dispara
    bloqueo de IP + borrado de los 4 anteriores.
18. Modo simulado (local, sin `RESEND_API_KEY`): repetir 15 y 17 → confirmar
    que el borrado pasa igual, pero el mail/IP quedan libres para seguir
    probando, y `/panel/seguridad` marca esas filas como "Simulado".
19. Si `TURNSTILE_SECRET_KEY` está configurada: confirmar que sin resolver el
    challenge, `POST /verificacion-email` rechaza.

**Multi-clínica** (fix ya aplicado, confirmar en frío)

20. Dos clínicas distintas, misma IP: agotar el cupo de "enviar código" en la
    Clínica A → confirmar que la Clínica B sigue con su cupo intacto desde
    esa misma IP.

**Tope de 1 turno activo por DNI, universal, y resolución vía asistencia (1.3bis/1.4bis, TR-107, endurecido en TR-109)**

**Ítems 21-24: implementados y cubiertos por test automatizado (backend), no
hace falta repetirlos a mano — se dejan igual para referencia rápida.**

21. DNI con un turno vigente de tipo "General" → pedir OTRO turno del
    MISMO tipo con un mail distinto → debe rechazar mostrando el mail
    (censurado) del que ya lo tiene. Sin excepción por verificación. ✅
    `TestSolicitarTurnoPublico_SegundoMailMismoTipoRechazaSiPrimeroNoVerificado`,
    `TestSolicitarTurnoPublico_TopeDeUnoActivoPorDNIRechazaDesdeElSegundo`,
    `TestSolicitarTurnoPublico_VerificadoConTurnoActivoRechazaOtroPedidoDelMismoTipo`.
22. Mismo DNI del caso 21, pedir un turno de OTRO tipo (ej. "Urgencia") —
    con CUALQUIER mail (el mismo que ya tiene el turno de "General", u
    otro distinto) y sin importar si esa ficha ya está verificada — debe
    rechazar con el mensaje universal ("ya tenés un turno pendiente...").
    Corrección de QA (TR-109) sobre el diseño anterior: ya NO hay
    excepción para el mismo mail ni para fichas verificadas — "aunque
    esté verificado". ✅
    `TestSolicitarTurnoPublico_VerificadoConOtroTipoActivoTambienRechaza`,
    `TestSolicitarTurnoPublico_PacienteVerificadoIdConTurnoActivoPropioRechaza`.
    El mismo mail solo puede reutilizar la ficha (o cualquier mail pedir
    otro tipo) una vez que el primer turno ya no está vigente (pasó su
    hora) — `TestSolicitarTurnoPublico_MismoDNIMismoMailReusaPaciente`
    simula esa ventana a mano.
23. (Reemplazado por TR-109 — la excepción de "ficha verificada" del
    caso 22 se eliminó del todo, no hace falta un caso aparte.)
24. Turno vigente del caso 21 se resuelve (pasa su hora) sin marcar
    asistencia todavía → un pedido nuevo con el mismo DNI (mismo o distinto
    tipo) ya NO debería rechazar por 1.4bis (el turno dejó de estar
    "activo") — cae en el flujo normal de 1.2 (Caso A o B según
    corresponda). ✅ `TestSolicitarTurnoPublico_TurnoResueltoLiberaElTopeDeUnoPorDNI`,
    `TestSolicitarTurnoPublico_MismoDNIMailDistintoCreaFichaSeparadaSinConflictoSiNadieVerificado`.

**Ítems 25-29: implementados y cubiertos por test automatizado
(25-28 backend, 29 frontend — ver 1.3ter).**

25. Con un conflicto pendiente (Caso A o B), marcar "asistió" en el turno
    puntual que lo originó (`TurnoEnConflictoID`) → debe resolver el
    conflicto como "es la misma persona" (migración estándar), sin pasar
    por el 409 general. ✅ `TestMarcarAsistencia_AsistioEnTurnoDisputadoResuelveConflictoComoVerdadero`.
26. Mismo escenario que 25, pero marcar "ausente" → la ficha en conflicto
    debe borrarse, el ticket debe quedar `Resuelto = true`, y el mail de
    esa ficha **NO** debe terminar bloqueado (confirmar que un pedido nuevo
    con ese mail no rebota). ✅ `TestMarcarAsistencia_AusenteEnTurnoDisputadoBorraFichaSinBloquearMail`.
27. Con el MISMO conflicto ya resuelto a mano desde el panel, intentar
    marcar asistencia/ausencia en el turno que lo había originado → debe
    seguir el flujo normal (sin efecto especial, la excepción de 1.3bis ya
    no aplica). ✅ `TestMarcarAsistencia_ConflictoYaResueltoNoAplicaCarveOut`.
28. Marcar asistencia/ausencia en cualquier OTRO turno de las dos fichas
    (no el `TurnoEnConflictoID`) mientras el conflicto sigue pendiente →
    debe seguir rechazando con 409, sin excepción. ✅
    `TestMarcarAsistencia_ConflictoExistenteBloqueaAsistencia`.
29. (Frontend) Turno llega a su hora de fin con la app abierta en cualquier
    pantalla del panel → el cartel de confirmación debe aparecer en el
    momento, bloqueando el resto de la pantalla, sin poder cerrarse sin
    responder. Confirmar que el botón exige mantener apretado ~10 segundos
    (con la animación de llenado) antes de registrar la respuesta. ✅
    `components/panel/asistencia-cartel-global.test.tsx` (8 casos, ver
    1.3ter) — probado con temporizadores simulados, falta una pasada
    manual en el navegador real antes del QA del cliente (agitar/soltar
    con mouse y touch de verdad, ver que el blur y el layout se vean
    bien).

**Única fuente de marcado + referencia visual + aviso global (1.3quater, TR-108)**

30. Cerrar la app (o no abrirla) mientras un turno resuelve, sin marcar —
    esperar más de un sondeo (30s+) y volver a abrir cualquier pantalla del
    panel → el cartel debe aparecer de inmediato con ESE turno, sin importar
    cuánto tiempo pasó. Con varios turnos acumulados sin marcar de días
    distintos, deben aparecer uno por uno hasta marcarlos todos. ✅
    `TestTurnosPendientesAsistencia_IncluyeVencidosSinImportarLaFecha`,
    `TestTurnosPendientesAsistencia_OrdenaDelMasAntiguoAlMasNuevo`.
31. Confirmar que `TurnoDetalle` (calendario) y la pestaña "Resueltos" de
    `/panel/turnos` YA NO ofrecen ningún botón para marcar asistencia — solo
    muestran la etiqueta si ya está marcada, o "Pendiente de confirmar en el
    cartel de asistencia" si no. (Pantalla, manual) Un turno resuelto y
    asistido se ve con contorno verde en el calendario (semana/día/mes); uno
    ausente, contorno rojo. La ficha del paciente muestra Asistió/Ausente en
    su historial de turnos.
32. (Pantalla, manual) Con un conflicto de pacientes pendiente, navegar a
    cualquier pantalla que NO sea /panel/pacientes → debe verse el aviso
    arriba del todo (zona marcada en `docs/foto1.png`), tocarlo lleva a
    /panel/pacientes. Mismo caso con un conflicto de calendario → lleva a
    /panel/calendario. Estando YA en la pantalla correspondiente, ese aviso
    puntual no debe repetirse (la pantalla ya tiene el suyo propio). El
    botón "¿Qué es un paciente verificado?" en /panel/pacientes abre una
    explicación clara, sin tocar ningún dato.

---

## Parte 3 — Plan para el camino "para otro" (Fase 2.4.2, sin implementar)

Parte del sketch original (`docs/FASE 2.4 - detallada y bien especificada.docx`,
también resumido en el plan de sesión previo) adaptado con todo lo que se
afinó en 2.4.1 desde entonces. **No se toca código todavía** — esto es
diseño para revisar antes de arrancar.

### 3.1 — Qué cambia respecto de "para mí"

La diferencia de fondo: en "para otro", la **identidad que se verifica por
mail no es la del paciente** (un chico, alguien que no tiene o no controla su
propio mail) **sino la del tutor**. El paciente sigue siendo el dueño del
turno (mismo DNI, mismo historial de asistencia para calcular si está
"verificado"), pero el mail de contacto en el turno es el del tutor.

### 3.2 — Modelo de datos

`Paciente` suma columnas nullable, solo completadas cuando la ficha se cargó
por "para otro":

- `TutorRelacion` (string acotado — select: familiar/amigo/otro, no texto
  libre, pide el documento original)
- `TutorNombre`, `TutorDNI`, `TutorTelefono`, `TutorEmail`

Se descarta una tabla `Tutor` aparte — un tutor nunca se referencia desde más
de un lugar en este alcance, mismo criterio de simplicidad que el resto del
esquema.

### 3.3 — Verificación de mail

Reusa tal cual `enviarVerificacionTurnoPublicoHandler`/
`confirmarVerificacionTurnoPublicoHandler` (E5.6/TR-103) — el mail que se
verifica es `TutorEmail`, no el mail del paciente. Sin cambios de código en
ese mecanismo, solo cambia QUIÉN es el mail que se le pasa.

**Decisión tomada — el tope de 5 códigos/hora por mail (1.7) se deja tal
cual, sin exceptuar ni ajustar para "para otro".** Cada `POST /turnos`
consume su propio token (`consumirVerificacionTurnoPublico` lo marca usado
al crear el turno) — un tutor sacando turno para varios hijos en la misma
sesión necesita un código nuevo por cada uno, así que el tope de 5/hora
limita en la práctica cuántos hijos puede cargar de una sentada. Se decide
dejarlo así por ahora: familias de hasta ~5 chicos entran cómodas en una
sola sesión (el caso típico), y tocar `consumirVerificacionTurnoPublico`
para que un token sirva para más de un turno significa tocar el mecanismo
más sensible del wizard público, compartido con "para mí" — el mismo
criterio que ya se aplicó con los umbrales de abuso (1.5/1.6): no ajustar
por una hipótesis, esperar a que el uso real de "para otro" muestre si esto
es un problema de verdad. Si lo fuera, la solución correcta sería que un
token ya confirmado sirva para más de un turno dentro de su ventana de 30
minutos (mismo mail) — no subir el tope de 5/hora, que debilitaría la
protección antispam para los dos caminos por igual.

### 3.4 — Detección de conflicto (adaptación de 1.2)

La lógica de `crearPacientePublicoConDeteccionDeConflicto` se reusa casi
tal cual, pero la comparación "¿el mail nuevo coincide con el que ya está
archivado?" (`pacienteRespondeAlMail`) tiene que poder comparar contra
`TutorEmail` cuando el conflicto nace del lado de un tutor — necesita una
variante o un parámetro que le diga contra qué campo comparar. Casos:

- **Tutor nuevo, DNI de paciente ya existe con OTRO tutor archivado, ninguno
  verificado todavía** → mismo criterio que el Caso B de 1.2: fichas
  separadas, conflicto silencioso hasta que alguna se verifique.
- **Tutor nuevo, la ficha existente YA está verificada** (con OTRO tutor, o
  incluso si el paciente ya viene solo con su propio mail) → conflicto
  inmediato, mismo criterio que el Caso A de 1.2.
- **El paciente cargado antes "para otro" ahora quiere sacar turno "para sí
  mismo"** (ya tiene mail propio) → reusa el camino 1.2 completo de "para mí"
  una vez que tiene su propio mail/teléfono cargado — no hace falta lógica
  nueva para este caso, es exactamente el mismo mecanismo.

### 3.5 — "Ya he venido antes" para "para otro"

A diferencia de 1.2/`pacienteVerificadoPublicoHandler` (siempre UNA tarjeta,
por DNI), acá el "match" es **por mail del tutor**, y puede devolver **una
LISTA de tarjetas** — un tutor puede tener más de un hijo verificado a su
cargo. El endpoint necesita una variante que busque por `TutorEmail` (+
alternativos) en vez de por DNI, y devuelva N fichas censuradas en vez de una
sola.

### 3.6 — Topes y seguridad (adaptación de 1.4/1.5/1.6)

Este es el punto que motivó la pregunta — "un tutor puede sacar varios turnos
para alguien más":

| Mecanismo | ¿Aplica igual a "para otro"? | Ajuste necesario |
|---|---|---|
| Tope 1 turno/tipo (ficha verificada) | **Sí, sin cambios** — es por ficha de paciente, no por quién lo reservó. | Ninguno. |
| Tope 3 turnos/DNI+tipo (no verificado) | **Sí, sin cambios** — mismo criterio: un "hijo" no verificado tampoco debería acumular turnos sin límite del mismo tipo. | Ninguno. |
| Mail con muchos DNIs distintos (tope 2) | **No puede aplicar igual** — el mail del tutor con varios DNIs de hijos es exactamente el uso legítimo. | **Exceptuar del todo el camino "para otro" de este chequeo** (no solo subir el número — un tutor real no tiene un tope natural bajo, y cualquier número fijo terminaría siendo o muy laxo para abuso o muy estricto para una familia numerosa real). |
| Rotación por IP (mail+DNI juntos) | **Sí, sin cambios, y sigue siendo la protección correcta** — un tutor real REUSA el mismo mail; el detector solo dispara cuando mail Y DNI rotan juntos, así que un tutor legítimo nunca lo activa. | Ninguno — este es justamente el mecanismo que cubre el hueco que deja el anterior. |
| CAPTCHA / verificación por mail | Sí, sin cambios (recae sobre el mail del tutor). | Ninguno. |

Conclusión: **no hace falta inventar un mecanismo nuevo de seguridad para
"para otro"** — alcanza con exceptuar el detector de "mail con muchos DNIs" y
dejar que el resto (tope por DNI+tipo, rotación por IP, CAPTCHA) siga
cubriendo exactamente lo mismo que hoy. Esto respeta el criterio ya acordado
de no sumar más mecanismos de detección de los necesarios.

### 3.7 — Impacto en lo demás

- **Modo simulado**: sin cambios estructurales — sigue siendo
  `AuthDeps.SimularBloqueosSeguridad`, aplica igual una vez que el detector de
  rotación por IP se ejercite con datos de tutor.
- **Auditoría**: sin cambios de esquema — `AuditoriaBloqueoTurnoPublico` ya
  guarda mail/IP/DNIs genéricos, sirve igual si el mail bloqueado resulta ser
  el de un tutor.
- **Migraciones**: recordar la lección de 1.10 — cualquier migración con SQL
  crudo que toque `pacientes` tiene que seguir excluyendo `en_conflicto`, y
  ahora también tiene que ser consciente de que una ficha puede tener
  columnas de tutor pobladas sin que eso cambie su identidad propia (DNI,
  verificación).
- **`marcarAsistenciaHandler`** (auto-borrado de no verificados en "ausente")
  — sin cambios: sigue siendo sobre la ficha del paciente, sin importar quién
  la reservó.

### 3.7bis — Panel: columnas y ficha con tutor (pedido del cliente, 2026-09-05, TR-110)

Detalle de UI que faltaba en el sketch original — cómo se ve todo esto del
lado del profesional, no solo el modelo de datos/backend de 3.1-3.7:

- **Turnos** — columna nueva "Sacado por otro" (Sí/No): `Sí` cuando el turno
  se originó por el camino "para otro" del wizard público (se puede derivar
  de si `Turno` tiene datos de tutor asociados en el momento de sacarse —
  a definir el campo exacto cuando se diseñe el modelo de `Turno` para este
  camino, sección todavía pendiente de este plan), `No` en cualquier otro
  caso (incluido "para mí" y alta manual del panel).
- **Pacientes** — columna nueva "Tutor" con el nombre del tutor
  (`TutorNombre`) cuando la ficha lo tiene cargado; `"—"` si la ficha se
  originó "para mí" (sin datos de tutor).
- **Ficha de paciente con tutor** — la sección de datos de contacto
  (`PacienteDatos`) se separa en DOS cuadros distintos en vez de uno: datos
  del paciente (igual que hoy) y datos del tutor (`TutorRelacion`,
  `TutorNombre`, `TutorDNI`, `TutorTelefono`, `TutorEmail`) — nunca
  mezclados en la misma tarjeta, para que quede claro a simple vista cuál
  dato es de quién.
- **Alta directa de paciente** — tanto el botón "+ Agregar paciente" de
  `/panel/pacientes` (TR-102) como el alta de paciente nuevo dentro de
  "Agregar turno" del calendario suman una opción "Con tutor" que
  **reemplaza** el formulario actual (que hoy asume siempre un paciente
  particular con sus propios datos de contacto) por uno con los dos
  bloques de arriba — paciente + tutor — cuando se elige esa opción.

Sin implementar todavía, igual que el resto de la Parte 3 — queda acá para
no perderlo cuando se apruebe arrancar 2.4.2.

### 3.8 — Orden de implementación sugerido

1. Columnas de tutor en `Paciente` + migración (aditiva, sin riesgo).
2. `enviarVerificacionTurnoPublicoHandler`/confirmar: sin cambios de código,
   solo pasarle `TutorEmail` desde el frontend en vez del mail del paciente.
3. Variante de `pacienteRespondeAlMail` parametrizable por campo (Email vs
   TutorEmail) — reusar en `crearPacientePublicoConDeteccionDeConflicto`.
4. Endpoint "ya he venido antes" para tutor (lista de tarjetas por
   `TutorEmail`).
5. Exceptuar "para otro" del detector de mail-abuso (1.5) en
   `solicitarTurnoPublicoHandler`.
6. Frontend: paso "¿para quién es el turno?" al principio del wizard +
   formulario de datos de tutor + selector de tarjeta múltiple.
7. Panel: columna "Sacado por otro" en Turnos, columna "Tutor" en
   Pacientes, ficha con los 2 cuadros separados, opción "Con tutor" en los
   dos botones de alta directa de paciente (ver 3.7bis).
8. Tests: mínimo un test por fila de la tabla de 3.6 confirmando que el
   detector se comporta como corresponde (exceptuado o sin cambios), más los
   casos de conflicto cruzado de 3.4, más los del panel (columnas/ficha) del
   punto 7.

Este plan no arranca solo — necesita brief/aprobación explícita del cliente
antes de tocar código, mismo criterio que el resto de Fase 2.4 (TR-083).
