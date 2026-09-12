# Fase 3, bloque 0 — los tres cambios al wizard de sacar turno

**Fecha:** 2026-09-12 · **Decisiones:** `docs/Arquitectura y base/tradeoffs.md` TR-133 · **Mecanismo completo del wizard:** `docs/Fases post MVP/Fase 2/turnero_pagina/ArquitecturaPeticionesTurno.md` §1.4quater

Este documento cuenta **qué se cambió, por qué, y qué se aprendió en el camino**. El brief del cliente (`Fase2-fix-Fase3-Multi-tenant.docx`) abre con tres correcciones al wizard público antes de entrar al multi-tenant. No son "arreglitos previos": tocan exactamente el código que la Fase 3 va a extender, así que hacerlos después habría significado hacerlos dos veces.

---

## El pedido

> *"Se quita la regla de solo UN turno por DNI en la clínica, sino que se hace menos restrictivo, solo será UN turno por tipo de consulta por DNI (como ya se hacía antes), ya que en la práctica los pacientes suelen hacer varios turnos de diferentes tipos. Para ayudar a esto, una vez que se saca un turno y aparece el cartel de enviar mensaje por wsp, poner aquí otro botón que diga '¿Querés sacar turno para otro tipo?' y te lleve al último paso con tus datos ya cargados.*
>
> *Además el camino 'ya he venido anteriormente' también funciona con turnos activos y no exclusivamente con pacientes verificados."*

Tres cosas. Se ven independientes. No lo son: la segunda existe **porque** la primera se relaja, y la tercera existe porque la primera cambia qué situación es "normal".

---

## Cambio 1 — El tope vuelve a ser por DNI **y tipo de consulta**

### Qué había

En TR-109 el cliente había pedido endurecer: *"sea paciente verificado o no verificado solo puede tener un turno activo con el mismo dni, sea el tipo de consulta que sea"*. Eso se implementó como una única función, `turnoActivoPorDNI`, que reemplazaba a dos reglas más finas anteriores.

### Qué falla con eso

La regla es sencilla de explicar y sencilla de implementar, y eso la hace atractiva. Pero en uso real le pega al caso normal, no al abuso: el paciente que quiere una limpieza **y** un control de ortodoncia queda bloqueado, y su única salida es llamar por teléfono. El abuso que la regla buscaba frenar —alguien reservando el cupo de un DNI ajeno— es raro; el paciente con dos tipos de consulta es cotidiano.

**La lección general:** una regla de seguridad se evalúa por los dos lados. Cuántos ataques frena, y a cuánta gente legítima molesta. Una que frena pocos ataques y molesta a muchos usuarios no es "más segura", es peor.

### Qué se hizo

Vuelve `turnoActivoDelMismoTipo` (clínica + DNI + tipo) en los dos caminos del wizard. Las funciones de la regla universal **no se borraron**: quedaron sin call sites, anotadas con `//nolint:unused` y un comentario que explica por qué siguen ahí. Si el cliente quiere volver a endurecer, es cambiar una línea.

### La parte que había que verificar, no suponer

La pregunta obvia es: *¿relajar el tope no deja el wizard desprotegido?*

La respuesta es no, y el motivo es importante: **el tope nunca fue el mecanismo que protege la identidad**. Eso lo hace la detección de conflictos (mismo DNI + mail distinto → se crean dos fichas y queda un conflicto que el profesional resuelve a mano). Lo que pasaba es que el tope universal la tapaba: el pedido se rechazaba antes de llegar a ella.

Al sacar el tope, esa detección vuelve a actuar. Y eso se comprobó corriendo el caso, no leyendo el código: dos pedidos con el mismo DNI y mails distintos dan `201` + 2 fichas + 1 conflicto pendiente. Los otros dos detectores de abuso (mail tocando muchos DNIs, rotación por IP) nunca dependieron de esta regla.

### Un bug que apareció por el costado

Al quedar la regla universal sin uso, el linter marcó como muerta una función auxiliar: `identidadDeContactoDelTurno`. Esa función existía por un motivo concreto — cuando el turno lo sacó un **tutor**, el mail que la persona reconoce es el del tutor, no el `EmailContacto` del paciente (que en ese camino está casi siempre vacío).

O sea: el mensaje de error que quedó vigente (`errTurnoActivoConOtroMail`) estaba usando el campo equivocado. Contra un turno sacado por un tutor decía *"ya tenés un turno pendiente, con mail "* y nada más.

**La lección:** "función sin usar" no siempre significa "borrala". A veces significa "el que la usaba se fue y su reemplazo se olvidó de llamarla". Antes de borrar, hay que preguntarse qué problema resolvía. Acá la respuesta llevó directo a un bug de verdad.

Se arregló, y para probar que el test servía se hizo un **control negativo**: revertir el arreglo a mano y confirmar que el test falla con el mensaje vacío. Un test que nunca se vio fallar no prueba nada.

---

## Cambio 2 — El botón "¿Querés sacar turno para otro tipo?"

### El choque

El botón es trivial de dibujar: volver al paso "turno" sin limpiar los datos personales. El problema está abajo.

La prueba de mail del wizard (`VerificacionTurnoPublico.TokenHash`) es **de un solo uso a propósito**. Se diseñó así en E5.6: el turno la consume dentro de la misma transacción que lo crea, para que nadie pueda pedir turnos en serie con una sola verificación.

Entonces el segundo turno moría con *"verificá tu mail"*, justo después de haber verificado el mail. El pedido del cliente y una decisión de seguridad anterior se contradicen de frente.

### Las dos salidas, y por qué se eligió una

**Salida A — hacer el token multiuso dentro de su ventana.** Una línea menos de código: sacarle el `UsedAt`. Pero cambia la naturaleza de la cosa: de "prueba de un pedido" pasa a "credencial reusable", y desaparece el registro de cuántas veces se usó cada verificación.

**Salida B — reemitir.** Marcar usada la fila vieja y crear una nueva **heredando el `ExpiresAt` original**.

Se eligió B, y la herencia del vencimiento es toda la decisión. Si el token nuevo arrancara 30 minutos de cero, cada turno estiraría la ventana y un mail verificado podría seguir sacando turnos indefinidamente. Heredando, **la ventana total es exactamente la de antes**, sin importar cuántas veces se reemita. Pasada la media hora hay que volver a pedir el código, igual que siempre. Y queda una fila por uso: el rastro auditable se mantiene.

```go
// consumirYReemitirVerificacionTurnoPublico, resumido
vt.UsedAt = &now                          // la vieja queda consumida
if !vt.ExpiresAt.After(now) { return "" } // ya venció: no se reemite nada
tx.Create(&db.VerificacionTurnoPublico{
    // ...
    ExpiresAt: vt.ExpiresAt,              // ← hereda, no reinicia
})
```

El token nuevo viaja en `solicitarTurnoPublicoResponse.verificacionToken` (opcional) y **el frontend solo muestra el botón si lo recibió**. Si el token venció justo ahí, el campo viene vacío y el botón no aparece: mejor no ofrecerlo que ofrecerlo y que falle al tocarlo.

### El bug que encontró un test, no una lectura

La primera versión de `repetirParaOtroTipo()` limpiaba todo lo del turno: tipo, fecha y hora. Suena correcto — "es lo que viene a cambiar". El test nuevo explotó con:

```
RangeError: Invalid time value
 ❯ diaGrande src/components/public/pedir-turno/pantalla-dia-hora.tsx:30
```

`PantallaDiaHora` formatea el día elegido apenas entra en pantalla, y con `fecha = ""` eso es una fecha inválida. Un caso que ningún camino anterior producía, porque a ese paso siempre se llegaba con una fecha puesta.

La versión final:

- el **tipo** salta al primero distinto del recién sacado (con un solo tipo en el catálogo queda el mismo, y el backend rechaza el duplicado con su mensaje de siempre);
- el **horario** se limpia y se vuelve a pedir la disponibilidad — el turno recién creado acaba de ocupar uno de los slots que están en pantalla;
- la **fecha** se conserva: además de evitar el crash, es lo amable — lo más probable es que quiera el mismo día.

**La lección:** "limpiar el estado" no es automáticamente lo seguro. Un componente puede tener precondiciones que nunca se rompieron porque ningún camino las rompía; abrir un camino nuevo las expone.

---

## Cambio 3 — "Ya he venido antes" con turno activo

### Por qué el cambio 1 lo hace necesario

Hasta acá, la tarjeta de "sos vos" solo aparecía para una ficha **verificada** — `pacienteEstaVerificado`: alta manual del profesional, o turno resuelto **y** asistido.

Con el tope universal puesto, alguien con un turno activo no podía sacar otro, así que la situación "tengo turno pero todavía no me atendí y quiero otro" simplemente no existía. Al relajar el tope, pasa a ser el caso normal: sacás tu primer turno y diez minutos después volvés por otro tipo. No estás verificado —no te atendiste todavía— así que tenías que retipear todo.

`pacienteReconocibleEnElWizard` = verificado **o** con un turno `agendado` cuya `hora_fin >= now()`.

### Por qué está bien que el criterio sea más flojo

Es deliberado, y vale entender la distinción porque es fácil confundirla con un agujero:

- **Reconocer** en el wizard no da acceso a nada. La tarjeta muestra nombre, apellido y DNI **censurados** (`nombreConIniciales`/`dniCensurado`), exactamente igual que antes, y el resto del flujo sigue pidiendo el código al mail.
- **Verificar** sí habilita cosas: saltear pasos, pesar en la resolución de conflictos. Ese criterio **no se tocó**.

Son dos preguntas distintas que antes compartían una función. Ahora no.

---

## El cuarto cambio, que nadie pidió

`GET /clinicas/{slug}/mis-turnos` devolvía **un** turno. Con un solo turno activo posible por DNI eso era una simplificación razonable. Con varios posibles, pasa a ser una mentira: el paciente con tres turnos ve uno.

Devuelve una lista, filtrando turno por turno con el mismo criterio de identidad de antes (`mailIdentificaAlTurno`: el mail propio, o el del tutor si `EsParaOtro`). Sigue respondiendo **404** cuando ninguno matchea — no un `200` con lista vacía, que le confirmaría a quien prueba mails al azar que ese DNI existe en la clínica.

**La lección:** relajar una regla de negocio propaga. Vale recorrer qué otras partes del sistema asumían la regla vieja como invariante. Esta la asumía en su tipo de retorno.

---

## Verificación

| Qué | Resultado |
|---|---|
| `go build ./...` + `go vet ./...` | limpio |
| `go test ./internal/...` | 12 paquetes en verde |
| `gofmt -l` + `golangci-lint run ./...` (copia sin CRLF) | 0 issues |
| `pnpm typecheck:web` | limpio |
| `pnpm lint:web` | 0 errores, 3 warnings preexistentes (`react-hooks/incompatible-library` en los forms de onboarding) |
| `pnpm test:coverage:web` | 1008/1008 · statements 82.97% · branches 81.05% · functions 81.73% · lines 84.4% (gate: 80%) |

**Tests nuevos:**

- `TestSolicitarTurnoPublico_ReemiteLaPruebaDeMailParaElSiguienteTurno`
- `TestSolicitarTurnoPublico_YaVineAntesPuedeSacarOtroTipo`
- `TestSolicitarTurnoPublico_ParaOtroPuedeSacarOtroTipoEnLaMismaFicha`
- `TestSolicitarTurnoPublico_OtroMailConElMismoDNIAbreConflictoNoSeBloquea`
- `TestSolicitarTurnoPublico_ElMensajeDeTurnoActivoMuestraElMailDelTutor` (con control negativo)
- `TestPacienteVerificadoPublico_SinVerificarPeroConTurnoActivoTambienApareceLaTarjeta`
- `TestPacienteVerificadoPublico_SinVerificarYSinTurnoActivoSigueSinAparecer`
- Frontend: "con el token reemitido, ofrece sacar otro turno y vuelve al último paso con los datos cargados" y "sin token reemitido, no ofrece sacar otro turno"

**Un test ajeno que estaba podrido:** `agregar-horario-atencion-modal.test.tsx` tenía fechas hardcodeadas (`"2026-09-10"`) que ya habían quedado en el pasado. Se verificó con `git stash` que el fallo era **previo** a este trabajo antes de tocarlo, y se reemplazaron por fechas relativas (`enDias(10)`). Un test con una fecha fija adentro tiene fecha de vencimiento.

---

## Qué queda para el resto de la Fase 3

El multi-tenant propiamente dicho: 1 clínica → N profesionales con vistas aisladas, 1 profesional → N clínicas, roles (administrador, recepcionista), onboarding "¿dónde trabajás hoy?", gestión de colaboradores, y la elección de profesional dentro del wizard público. Plan en `docs/Arquitectura y base/implementation-plan.md` §13.1.

Dos entregables de documentación comprometidos en el brief, además del código: los diagramas ER **antes** y **después** en `docs/Arquitectura y base/modelo de datos/`, y el documento explicativo del cambio de modelo acá mismo.
