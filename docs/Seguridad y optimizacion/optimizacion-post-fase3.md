# Optimización post-Fase 3 — caché, goroutines y colas en el panel

**Fecha:** 2026-09-22 · **Alcance:** `/panel` (tablero, turnos, pacientes, calendario), backend y BFF.

Ronda pedida como tal: *"quiero ver en qué partes del código puedo hacer uso de caché, memcache, goroutines y colas para mejorar la latencia"*. Este documento responde esa pregunta con mediciones, dice qué se aplicó y —igual de importante— qué **no**, y bajo qué condición valdría la pena.

La ronda anterior de este tipo es `radiografia-tecnica_1.md`, cuya sección 09 ("¿Y Redis?") cerraba con: *Redis queda reservado para el rate-limiter por IP, el día que corran más de una instancia*. Eso **sigue vigente**; lo que cambió desde entonces es que la Fase 3.2 sumó el panel multi-tenant, y ahí sí aparecieron cosas nuevas.

---

## Cómo se midió

Nada de lo que sigue sale de leer el código y suponer. El método fue:

1. **Un entorno con datos de verdad.** Se dio de alta una clínica por el flujo real (registro → perfil → clínica, igual que `scripts/qa-entorno-dev.sh`) y se sembraron **600 pacientes y 1.800 turnos** — el tamaño de una clínica real con algunos años encima. Para ver el comportamiento a escala, se llevó la tabla `turnos` a **41.875 filas**.
2. **Latencia por endpoint**, mediana y p90 de 21 a 31 corridas, contra los contenedores (`docker compose`), no contra la suite.
3. **Cuántas llamadas a la API genera UNA carga de página**, contando líneas en el log estructurado de la API (`ruta=`) entre dos marcas. Esta resultó ser la medición más reveladora.
4. **Cuánto trabajo de servidor cuesta una carga**, sumando el `duracion_ms` que la API loguea por request.
5. **Antes y después reales**: para el "antes" se guardó el trabajo con `git stash -u`, se reconstruyeron los contenedores y se midió con el mismo script; después se restauró y se repitió. (La primera vez el `stash` no se llevó los archivos nuevos —faltaba `-u`— y el "antes" salió idéntico al "después": si un antes/después da sospechosamente parecido, lo primero es verificar que se está midiendo lo que se cree.)

Todos los datos sembrados se borraron al terminar; el entorno local quedó como estaba.

---

## La respuesta corta, concepto por concepto

| Concepto | ¿Hay lugar? | Qué se hizo |
|---|---|---|
| **Caché** | **Sí, uno claro** | Memoización por request de `/me` con `cache()` de React. De 3 llamadas por página a 1. |
| **Memcache / Redis** | **No, todavía no** | Con una sola instancia agrega una dependencia de red para evitar consultas que hoy tardan 2 ms. Condición de activación escrita abajo. |
| **Goroutines** | **No donde parecía** | Paralelizar las consultas de un handler es incompatible con el harness de tests de este repo (ver "El hallazgo"). Se implementó, se midió, se revirtió. |
| **Colas** | **Sí, un caso** | El envío de mails. **No se implementó**: es lo único que no se puede medir desde acá, y esta ronda no cambió nada que no pudiera medir. Diseño y condición, abajo. |

Y un quinto que no estaba en la lista y resultó ser el de más impacto: **un índice faltante**.

---

## 1. El índice que faltaba (no es caché, y va primero)

La forma que tiene casi toda consulta del panel es *"los turnos de esta agenda, en esta ventana de tiempo"*: `clinic_id` + `atendido_por_user_id` + un rango sobre `hora_inicio`. La tabla tenía índices sueltos por cada una de esas columnas, y ninguno que sirviera a las tres juntas.

`EXPLAIN ANALYZE` sobre la consulta del tablero, antes:

```
Limit (actual time=1.120..1.123 rows=20)
  -> Sort
    -> Seq Scan on turnos (actual time=0.006..0.675 rows=1176)
         Rows Removed by Filter: 699
Execution Time: 1.163 ms
```

Un **Seq Scan**: leía la tabla entera y descartaba. Y acá está lo que importa, que no es el milisegundo — **`turnos` es de TODAS las clínicas**. Ese escaneo no crece con la clínica que mira: crece con el sistema. Una clínica chica en un servidor con cincuenta clínicas paga el volumen de las otras cuarenta y nueve.

Con `idx_turno_agenda_en_el_tiempo (clinic_id, atendido_por_user_id, hora_inicio)`:

```
Limit (actual time=0.034..0.054 rows=20)
  -> Index Scan using idx_turno_agenda_en_el_tiempo
Execution Time: 0.077 ms
```

**1,163 ms → 0,077 ms**, y deja de ser proporcional al tamaño total de la tabla. En el endpoint completo, con 41.875 turnos:

| | sin índice | con índice |
|---|---|---|
| `/panel/resumen` | 56,6 ms | **31,8 ms** |

El orden de las columnas no es arbitrario: las dos de igualdad primero y el rango al final, que es lo único que un B-tree puede recorrer ordenado. `estado` no entra — discrimina entre dos valores y engordaría cada entrada del índice para nada.

**Por qué va primero:** cachear una consulta lenta la hace lenta una vez cada tanto en lugar de siempre, pero sigue siendo lenta, y ahora además hay que invalidar el caché. Arreglar la consulta es más barato y no deja nada que mantener.

---

## 2. Caché: `/me` se pedía tres veces por página

Medido, no deducido. Una carga de `/panel` dejaba esto en el log de la API:

```
GET /me            status=200  (×3)
GET /panel/resumen status=200
```

Tres veces la misma pregunta, con el mismo token, dentro del mismo render: la piden el header del layout raíz, el layout de `/panel` y la página. Y no es solo el viaje — **todo request autenticado paga dos consultas a Postgres antes de trabajar** (`requireSession` + `requireClinic`, ya señalado en la radiografía anterior). Eran seis consultas para saber tres veces lo mismo.

La herramienta correcta acá es `cache()` de React, que memoiza **por request**:

```ts
export const getMe = cache(async function getMe(): Promise<Me | null> { … });
```

Lo que lo vuelve seguro es justamente que no es un caché entre requests: dos personas distintas, o la misma dos segundos después, no comparten nada. No hay invalidación que escribir, y no puede mostrar una sesión vieja. Un caché con TTL en el mismo lugar habría hecho exactamente eso a cambio de nada, porque el problema nunca fue pedirlo seguido, sino pedirlo tres veces en el mismo render.

El header pedía `/me` por su cuenta con `apiMe()` directo, salteando el memo: se lo pasó a `getMe()`. Ese era el tercer `/me`.

**Condición para que siga valiendo:** `cache()` memoiza solo durante el render de un Server Component. Fuera de un render no rompe, simplemente no hace nada. Todos los llamadores ya cumplían esa condición desde TR-049, por un motivo distinto (no se pueden tocar cookies durante el render).

---

## 3. Menos viajes: las pestañas se contaban de a una

`/panel/turnos` tiene cuatro pestañas con un número al lado, y las pedía con cuatro requests a `/turnos?limit=1`, leyendo el total del header `X-Total-Count`. `/panel/pacientes` hacía lo mismo con tres.

Iban en paralelo, así que en el reloj de la persona no se notaban. Pero cada una paga el viaje entero: medido, entre **7,6 y 10,4 ms** por request, de los cuales ~4 ms son el viaje HTTP (`/health`, sin sesión ni consulta, mide 3,9 ms) y ~2 ms las dos consultas del middleware. El trabajo de contar es una fracción de lo que cuesta pedirlo.

Las cuatro pestañas filtran **igual** en todo lo demás —la búsqueda, el rango de fechas, el tipo de consulta, la verificación del paciente— y se diferencian solo por `estado`/`resuelto`. Eso es literalmente lo que `COUNT(*) FILTER (WHERE …)` expresa: una pasada por las filas, cuatro acumuladores.

Entran `GET /turnos/contadores` y `GET /pacientes/contadores`.

**El riesgo real de este cambio no es la performance, es la coherencia:** si el contador filtrara distinto que el listado, la pestaña diría "12" y abajo se verían 9. Por eso los filtros comunes se extrajeron a **una** función (`filtrosComunesDeTurnos`, `filtrosComunesDePacientes`) que usan los dos endpoints, y el test que lo protege no compara contra un número escrito a mano sino **contra la lista misma**:

```go
if len(lista) != contadores[pestaña] {
    t.Errorf("pestaña %q: el contador dice %d y la lista trae %d filas", …)
}
```

Verificado revirtiendo: sacándole el filtro compartido al endpoint, el test se pone en rojo con *"el contador dice 3, esperaba 2 — el filtro no se está aplicando"*.

De paso, en `/panel/pacientes` los conflictos y los tipos de consulta eran dos `await` sueltos, uno atrás del otro y atrás del bloque paralelo: tres viajes en fila para tres datos independientes. Lo único que los ponía en ese orden era el orden en que se fueron escribiendo. Entraron al mismo `Promise.all`.

### El resultado

Llamadas a la API por carga de página:

| página | antes | después |
|---|---|---|
| `/panel` | 4 | **2** |
| `/panel/turnos` | 9 | **4** |
| `/panel/pacientes` | 9 | **5** |
| `/panel/calendario` | 5 | **3** |

Y el trabajo de servidor por carga (suma de `duracion_ms` de la API):

| página | antes | después | |
|---|---|---|---|
| `/panel` | 34,0 ms | **17,2 ms** | −49% |
| `/panel/turnos` | 237,0 ms | **28,8 ms** | −88% |
| `/panel/pacientes` | 230,8 ms | **64,6 ms** | −72% |

---

## 4. Lo que NO mejoró, y hay que decirlo

**El reloj de la página, en localhost, casi no se movió** — y `/panel` incluso midió peor en una corrida (122 ms → 146 ms, dentro del ruido entre corridas).

No es una contradicción: es la explicación de por qué esto había pasado desapercibido tanto tiempo. Las llamadas duplicadas iban **en paralelo**, y sobre loopback un viaje son ~4 ms, invisibles al lado de lo que tarda Next.js en renderizar. El trabajo ahorrado es real y está medido arriba, pero se cobra en otro lado:

- **En producción no es loopback.** En Render, web y API son dos servicios separados: cada viaje es red de verdad, no memoria compartida.
- **Bajo concurrencia.** El pool tiene 20 conexiones. Nueve requests por carga de página contra cuatro es la diferencia entre aguantar dos personas o cinco antes de que alguien empiece a esperar una conexión libre.
- **A escala de datos.** Las cuatro consultas que se fueron eran cuatro recorridas de `turnos`.

Quien lea esto buscando "cuánto más rápido carga el panel" y mire solo el reloj local va a concluir que la ronda no sirvió. El número que hay que mirar es el trabajo por carga.

---

## 5. El hallazgo: goroutines y el harness de tests se pelean

`resumenPanelHandler` arma el tablero con **ocho consultas independientes, una atrás de la otra**. Era el caso de manual para `errgroup`: nada depende de nada, y el handler paga la suma de las ocho esperas.

Se implementó: dos etapas (cinco consultas en paralelo, la escritura de borradores vencidos en el medio, y tres más en paralelo después, porque esas tres leen justo lo que la escritura toca). Compiló, pasó `vet`. Y los tests explotaron:

```
driver: bad connection
context canceled
```

**`internal/testdb` le da a cada test una transacción que se revierte al terminar** — es la disciplina de testing del repo desde Sprint 0, la que permite correr contra Postgres real sin que los tests se pisen entre sí. Y una transacción vive en **una sola conexión**: no admite consultas concurrentes. El `*gorm.DB` que el handler recibe es el pool en producción y una transacción en los tests.

Las opciones eran tres, y ninguna buena:

1. **Paralelizar igual y dejar los tests como están** → el camino de producción queda sin testear. No.
2. **Paralelizar solo si no es una transacción** → el camino de producción queda sin testear *y* además hay dos comportamientos distintos. Peor.
3. **Cambiar el harness** para que cada test tenga su propia base en vez de una transacción → se pierde el rollback, los tests dejan de ser independientes, y toda la suite se vuelve más lenta y más frágil. A cambio de unos pocos ms en un handler.

Se revirtió. **No hay goroutines nuevas en el backend** — tampoco había ninguna antes: `go func(` no aparece en todo `internal/`.

Lo interesante es lo que quedó en su lugar. La pregunta no era *"¿cómo hago estas cuatro consultas a la vez?"* sino *"¿por qué son cuatro?"*, y para los contadores la respuesta fue que podían ser una. **Bajar de cuatro viajes a uno es más rápido que hacer los cuatro a la vez, y además se puede testear.** Paralelizar es lo que queda cuando el trabajo no se puede juntar.

**Si alguna vez se quiere paralelismo intra-request**, el costo real no es escribir el `errgroup`: es rediseñar `internal/testdb`. Esa es la decisión, y es bastante más grande de lo que aparenta desde el handler.

---

## 6. Colas: el envío de mails, y por qué no se tocó todavía

Es el único lugar del sistema donde una cola es la herramienta correcta. Hay **12 puntos** donde un handler manda un mail —verificación de cuenta, recuperación de contraseña, bienvenida, código del wizard público, confirmación de turno, invitación a colaborar— y los 12 lo hacen **adentro del request**, de forma sincrónica.

En desarrollo no se nota: `LogSender` escribe una línea y vuelve. En producción es una llamada HTTPS a Resend, y la persona que se acaba de registrar espera a que termine.

El dato que lo hace fácil: **esos envíos ya son best-effort**. El código los llama con `_ = sender.Send…` y el comentario de `enviarInvitacion` lo dice: *"Nunca devuelve error: un envío que falla nunca tumba el request que lo dispara"*. Mandarlos a un worker no pierde ningún manejo de errores que hoy exista.

El detalle que no es obvio, y que sería el bug si alguien lo hace apurado: **hoy reciben `r.Context()`**, que se cancela cuando la respuesta se escribe. Un `go func` ingenuo haría que el envío se cancele solo, casi siempre, y en silencio. El worker necesita su propio contexto, con su propio timeout.

**No se implementó, y el motivo es de método:** es lo único de esta ronda que no se puede medir desde acá. Cuánto se gana depende de cuánto tarda Resend en producción, y este entorno no tiene Resend. Todo lo demás en este documento se cambió después de medirlo; esto habría sido tocar la ruta de registro a ciegas.

**Condición de activación,** concreta: mirar `duracion_ms` de `POST /auth/register` y `POST /clinicas/{slug}/turnos` en un deploy real con Resend configurado. Si el p90 de esos endpoints es sensiblemente peor que el de sus vecinos que no mandan mail, ahí está la respuesta y el trabajo se justifica solo.

**Y cuando se haga, que sea una cola en Postgres, no un canal en memoria.** El patrón ya existe en el repo y está documentado (TR-142, la presencia de colaboradores): *estado en Postgres, no en memoria del proceso, porque es lo que deja escalar a N instancias*. Un canal en memoria pierde los mails pendientes en cada deploy —y en Render los deploys son frecuentes—; una tabla `mails_pendientes` con un worker que la drena sobrevive al reinicio y además permite reintentos.

---

## 7. Memcache / Redis: sigue sin ser el momento

La radiografía anterior ya había llegado a esta conclusión, y la medición de ahora la confirma. El costo que un caché de sesión evitaría son las dos consultas de `requireSession` + `requireClinic`: medido, **~2 ms** (la diferencia entre `/health`, 3,9 ms sin auth, y `/me`, 5,8 ms).

Cambiar 2 ms de Postgres —que ya está ahí, con su pool y sus índices— por un salto de red a otro servicio, más una política de invalidación al cambiar de rol o de clínica, más una dependencia que puede estar caída, es un mal negocio con una sola instancia. Y la parte más cara de ese costo —pedir `/me` tres veces— se resolvió gratis con memoización por request.

**Redis sigue reservado para lo mismo que decía la radiografía:** el rate-limiter por IP, que es la única pieza que hoy vive en memoria de un proceso, **el día que corra más de una instancia**. Ese día también hay que revisar el pool (20 conexiones por instancia contra el límite de ~100 de Postgres).

---

## Lo que cambió, en archivos

**Backend**
- `internal/db/models.go` — `idx_turno_agenda_en_el_tiempo`, vía tags de GORM (lo crea el AutoMigrate; verificado dropeando el índice y corriendo la migración).
- `internal/http/turnos_contadores.go` (nuevo) + `filtrosComunesDeTurnos`/`filtroDePestaña` extraídos de `listTurnosHandler`.
- `internal/http/pacientes_contadores.go` (nuevo) + `filtrosComunesDePacientes` extraído de `listPacientesHandler`.
- Tests: `turnos_contadores_test.go`, `pacientes_contadores_test.go` — cada contador contra su lista, más el filtro de búsqueda.

**Frontend**
- `lib/session.ts` — `getMe` memoizado con `cache()`.
- `components/site-header.tsx` — pasa por `getMe()` en vez de `apiMe()`.
- `lib/api.ts` — `apiContadoresDeTurnos`, `apiContadoresDePacientes`.
- `app/panel/turnos/page.tsx`, `app/panel/pacientes/page.tsx` — un contador en vez de cuatro/tres; conflictos y tipos entran al `Promise.all`.
- `packages/shared-types` — `ContadoresDeTurnos`, `ContadoresDePacientes` (a mano, como manda el repo).

**Verificación:** `go build`/`vet`/`test ./internal/...` y `-race` en verde · `gofmt`/`golangci-lint` sobre copia sin CRLF, 0 issues · web 1.413 tests / 114 archivos, cobertura sobre el gate · `typecheck`, `lint` (0 errores) y `build:web` OK · `TestAislamiento_NingunaConsultaDelPanelSinAcotar` en verde con los dos endpoints nuevos.

---

## Cómo volver a medir

Para la próxima ronda, el método que sirvió:

```bash
# Cuántas llamadas genera una carga de página
N0=$(docker compose logs api | wc -l)
curl -s -o /dev/null -H "Cookie: dm_session=$TOKEN" "http://localhost:3000/panel/turnos?cb=$RANDOM"
docker compose logs api | tail -n +$((N0+1)) | grep -oE 'ruta=[^ ]+' | sort | uniq -c | sort -rn

# Cuánto trabajo de servidor cuesta
docker compose logs api | tail -n +$((N0+1)) | grep -oE 'duracion_ms=[0-9]+'
```

Las dos preguntas que más rindieron no fueron "¿qué endpoint es lento?" sino **"¿cuántas veces se pide lo mismo?"** y **"¿por qué son tantas consultas?"**. Ninguna de las dos se ve leyendo un handler: se ven mirando el log de una carga de página entera.

---

# Segunda parte — concurrencia: varias clínicas, varios empleados a la vez

**Fecha:** 2026-09-23. La primera parte midió **una** persona usando el panel. Esta pregunta es distinta y no se responde con los mismos números: *"¿qué pasa con varias clínicas trabajando concurrentemente con varios empleados?"*

## El cambio de pregunta

Con una persona, lo que importa es cuánto tarda una carga de página. Con N personas, lo que importa es **cuánto cuesta cada una por minuto sin hacer nada**, porque eso es lo que se multiplica. Y el panel, en reposo, no está quieto: sondea.

| Qué se sondea | Cada | Por empleado |
|---|---|---|
| `/panel/notificaciones` (el aviso de conflictos) | **2 s** | **30 req/min** |
| `/turnos/pendientes-asistencia` (el cartel de asistencia) | 30 s | 2 req/min |
| `/equipo/presencia` | 60 s | 1 req/min |

El primero es el 91% del tráfico en reposo. Todo lo demás de esta sección sale de mirarlo.

## El hallazgo: el cortocircuito estaba después del trabajo

`contarTurnosEnConflictoConBloqueos` hacía, en este orden:

1. Cargar **todos los turnos futuros** de la clínica (filas completas, no un conteo).
2. Cargar los horarios reservados y las excepciones.
3. Si no hay ni horarios reservados ni excepciones → **devolver 0**.

El paso 3 existía, y el comentario del frontend ya lo daba por hecho (*"sin horarios reservados no mira un solo turno"*). Pero corría **después** del paso 1, así que no cortaba nada: una clínica que nunca reservó un horario igual hidrataba en memoria todos sus turnos futuros, treinta veces por minuto y por empleado, para devolver un cero que ya se sabía.

Medido, con la respuesta en `0` y sin un solo horario reservado:

| turnos futuros | antes |
|---|---|
| 376 | 9,3 ms |
| 2.976 | **65,8 ms** |

Invertir el orden —las reglas primero, los turnos solo si hay contra qué compararlos— deja ese caso en **8,9 ms y plano**: deja de depender de cuántos turnos haya.

Para el caso en que **sí** hay horarios reservados, donde los turnos hacen falta de verdad, dos cosas más:

- **Traer solo las tres columnas que el bucle mira.** `db.Turno` tiene 28, incluidos los datos de contacto y el motivo (texto libre). Para decidir si un turno choca alcanzan `hora_inicio`, `hora_fin` y `atendido_por_user_id`.
- **Armar las reglas de cada agenda una vez, no por turno.** El bucle copiaba tres slices en cada iteración: unas nueve mil asignaciones con tres mil turnos. Las agendas de una clínica son pocas y los turnos son muchos — el trabajo va del lado chico.

Con horarios reservados presentes y 2.976 turnos: **59,0 ms → 21,5 ms**, con la respuesta idéntica (35 conflictos, mismo profesional, misma fecha).

## Lo que eso significa en capacidad

Medido con un generador de carga en Go (N conexiones concurrentes reales):

| concurrencia | antes | después |
|---|---|---|
| 1 | 45,6 ms · 21,7 req/s | **20,3 ms · 48,8 req/s** |
| 10 | 322,5 ms · 31,0 req/s | **96,7 ms · 98,5 req/s** |
| 25 | 667,8 ms · 37,8 req/s | **220,5 ms · 110,2 req/s** |
| 50 | 1.340,8 ms · 39,3 req/s | **426,4 ms · 118,0 req/s** |

El techo del endpoint pasa de **~39 req/s a ~110 req/s**: casi **3× la capacidad** en el endpoint que genera nueve de cada diez requests del panel en reposo. En empleados simultáneos —a 0,5 req/s cada uno— es pasar de unos 78 a unos 220 antes de que este endpoint sature.

## Dónde está el límite ahora, y dónde NO está

Con 50 conexiones concurrentes sostenidas:

- **La API quema 530% de CPU** (5,3 de 8 núcleos). Postgres, 150%.
- **De 21 conexiones abiertas, 18-19 están ociosas** y solo 1-3 activas en cualquier momento.

O sea: **el cuello es el proceso Go, no la base.** Importa decirlo porque la reacción intuitiva sería subir el pool de conexiones, y eso no cambiaría nada — las conexiones ya sobran. Lo que hay que bajar es el trabajo por request, que es lo que se hizo.

Sigue valiendo lo de §12.3: dimensionar el pool es una conversación para cuando haya **más de una instancia**, y ahí el número a cuidar es la suma de los pools contra el límite de Postgres, no el de uno.

## Lo que se revisó y está bien

Anotado para no volver a mirarlo:

- **Índices en las tablas calientes.** `bloqueos_horario`, `horarios_atencion`, `tipos_consulta`, `conflictos_paciente`, `pacientes_en_mi_lista` y `clinic_members` tienen todas su índice por `clinic_id` (o uno compuesto que empieza por ahí). El único que faltaba era el de `turnos`, y es el de la primera parte.
- **`sessions` figura con 99,4% de escaneos secuenciales**, y no es un problema: tiene su índice único sobre `token_hash`, y con 73 filas el planificador acierta al ignorarlo. Se corrige solo cuando la tabla crezca. Buen recordatorio de que `pg_stat_user_tables` se lee junto con el tamaño de la tabla, nunca sola.
- **Los otros dos sondeos aguantan de sobra**: `/turnos/pendientes-asistencia` 353 req/s y `/equipo/presencia` 255 req/s a concurrencia 50 — este último a pesar de que **escribe** en cada GET (el latido de presencia, TR-142).
- **Las escrituras no se pelean.** Varias personas dando de alta turnos a la vez en la misma clínica: **386 altas/s** a concurrencia 15, mediana 22 ms, cero errores. El `EXCLUDE` de no-solapamiento no serializa nada mientras los turnos no se pisen de verdad, que es exactamente lo que tiene que hacer.
- **Los endpoints de lectura del panel**, a concurrencia 25: `/me` 796 req/s, `/turnos/contadores` 655, `/panel/resumen` 280, `/pacientes` 277, `/turnos` 238. Ninguno cerca de ser el límite.

## Lo que queda, y es una decisión de producto

**El intervalo de 2 segundos.** Después de este arreglo el sondeo cuesta entre 8,9 ms (sin horarios reservados) y 21,5 ms (con ellos): 30 sondeos por minuto son ~0,3 a 0,65 segundos de CPU por empleado por minuto, alrededor del 1% de un núcleo cada uno. Con 50 empleados simultáneos es medio núcleo dedicado a preguntar, casi siempre en vano, si algo cambió. Antes del arreglo esos mismos 50 empleados pedían más de un núcleo y medio.

No se tocó, **a propósito**: el intervalo corto es lo que el cliente pidió en la QA de la 3.2.6 (el aviso tiene que reaccionar, no desaparecer), y cambiarlo es cambiar cómo se siente el producto, no cómo está escrito. Queda como decisión, con el número al lado:

| intervalo | por empleado | 50 empleados |
|---|---|---|
| 2 s (hoy) | 30 req/min | ~0,5 núcleo |
| 5 s | 12 req/min | ~0,2 núcleo |
| 10 s | 6 req/min | ~0,1 núcleo |

**Y si algún día hace falta bajarlo sin perder reacción**, el camino que encaja con este repo no es un caché en memoria —se pierde en cada deploy y no sirve con varias instancias— sino el patrón que ya usa la presencia: **un contador de versión por clínica en Postgres**, que cualquier escritura de turno o de horario incrementa. El sondeo lee una fila por índice (microsegundos) y solo recalcula cuando ese número cambió. Es bastante más que cambiar una constante, y por eso queda escrito acá en vez de hecho a las apuradas.

## Cómo se midió esta parte

El generador de carga son ~60 líneas de Go que abren N conexiones persistentes contra una ruta y reportan mediana, p95 y req/s. Dos advertencias que costaron tiempo:

- **`curl` con `xargs -P` en Git Bash no mide concurrencia.** El costo de levantar procesos domina, el pool de Postgres nunca pasó de 3 conexiones y la latencia salía plana a cualquier concurrencia. Parecía que el sistema escalaba perfecto; lo que no escalaba era el cliente.
- **Git Bash reescribe rutas**: `/panel/notificaciones` como argumento se convirtió en `C:/Program Files/Git/panel/notificaciones`, y todas las mediciones daban error. Con `MSYS_NO_PATHCONV=1` se arregla.
