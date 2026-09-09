# Cómo se arregló cada cosa, y por qué

**Dental Mirage · Guía de estudio de la auditoría de seguridad y optimización**

Este documento acompaña a `radiografia-tecnica_1.md`. La radiografía dice **qué** estaba mal y **qué** se hizo; este explica **por qué se hizo así y no de otra forma**, qué alternativa se descartó en cada caso, y qué idea general queda para aplicar en otro proyecto.

Está escrito para leerse de arriba a abajo, sin necesidad de tener el código abierto al lado.

---

## Índice

1. [Cinco ideas que se repiten en todo el informe](#cinco-ideas-que-se-repiten-en-todo-el-informe)
2. [Fase A — los arreglos que no podían esperar](#fase-a--los-arreglos-que-no-podían-esperar)
3. [Fase B — antes de sumar más funcionalidad](#fase-b--antes-de-sumar-más-funcionalidad)
4. [Los tres bugs que aparecieron *mientras* se arreglaba](#los-tres-bugs-que-aparecieron-mientras-se-arreglaba)
5. [Cómo se decidió qué NO hacer](#cómo-se-decidió-qué-no-hacer)
6. [Cómo verificar que un arreglo de verdad arregla algo](#cómo-verificar-que-un-arreglo-de-verdad-arregla-algo)

---

## Cinco ideas que se repiten en todo el informe

Si te quedás con algo de este documento, que sea esto. Cada arreglo concreto de más abajo es una aplicación de alguna de estas cinco.

### 1. Preguntá quién controla el dato

La pregunta que resuelve más problemas de seguridad que ninguna otra: **¿este valor lo puso alguien en quien confío, o lo puso el atacante?**

El hallazgo más serio de toda la auditoría fue exactamente esto (`clientIP`). El código leía un header HTTP como si fuera un dato del servidor, cuando en realidad cualquiera puede escribirlo en su request. Todo lo demás —el rate limiting, los detectores de abuso— estaba bien construido, pero apoyado sobre un dato que el atacante elegía.

Un mecanismo de defensa no es más fuerte que el dato del que depende.

### 2. Todo lo que entra necesita un techo

Si tu código lee algo cuyo tamaño lo decide otro —el body de una request, la respuesta de un servicio externo, el resultado de una consulta a la base— y no le ponés un límite, ese "otro" decide cuánta memoria usás.

Esto aparece tres veces en el informe, y las tres son la misma idea:

| Dónde | Quién decidía el tamaño | Techo puesto |
|---|---|---|
| `decodeJSON` (body entrante) | cualquiera con acceso a la API | 1 MiB |
| `/turnos`, `/pacientes` (listados) | el volumen histórico de la clínica | 50 por tanda, 200 máximo |
| `googleauth`, `turnstile` (respuestas) | Google, Cloudflare | 1 MiB |

Los tres casos tienen severidades muy distintas y eso está bien: reconocer el patrón no significa tratarlos como si fueran igual de urgentes.

### 3. Fallar cerrado, no abierto

Cuando algo sale mal, ¿el sistema queda más permisivo o más restrictivo?

- Un filtro de búsqueda que recibe un valor inválido y **devuelve todo** falla abierto: la interfaz muestra resultados que el usuario cree filtrados. Mal.
- Un secreto de producción que falta y **cae a un valor de ejemplo** falla abierto. Mal.
- Un servicio de contraseñas filtradas que no responde y **deja pasar el registro** falla abierto — pero acá está **bien**, y es una decisión consciente: bloquear todos los registros porque un servicio de terceros está caído es peor que el riesgo que evita.

O sea: la regla no es "siempre cerrado". Es *elegir* a conciencia hacia qué lado falla cada cosa, y dejarlo escrito.

### 4. Los bugs viven en las junturas

El agujero más interesante de toda esta tanda (`JWT_SECRET` en blanco, ver Fase A) no estaba en ninguna función. Estaba **entre dos funciones**, cada una razonable por su cuenta:

- `config.getEnv` decidía: "si la variable está vacía, uso el valor por defecto".
- El guard de arranque decidía: "si la variable existe, está todo bien".

Ninguna estaba mal. Juntas dejaban pasar el caso "la variable existe pero está vacía", que es justo el que el guard debía frenar.

Los tests no lo veían porque probaban cada pieza por separado: armaban la config a mano por un lado, y seteaban la variable de entorno por el otro. **Un test que prueba las dos piezas por separado no puede, por construcción, ver un bug que vive en el medio.**

### 5. El comentario que vale es el que explica lo que el código no puede decir

El código dice *qué* hace. No puede decir:

- por qué se eligió esto y no la alternativa obvia,
- qué caso raro motivó esa línea que parece de más,
- qué pasa si mañana cambia una condición del entorno.

Ejemplo real de este proyecto: `clientIP` toma el último valor de una lista. Leyendo el código, `parts[len(parts)-1]` parece arbitrario — o peor, parece un error. El comentario explica que es porque cada proxy **agrega** su IP al final, que por eso el último es el único que el cliente no puede falsificar, **y que ese razonamiento deja de valer si algún día se suma un CDN adelante**. Eso último es lo más valioso: es la trampa que le espera a la próxima persona.

---

## Fase A — los arreglos que no podían esperar

### A1. `clientIP()` confiaba en un header que escribe el cliente

**El problema.** La función leía `X-Forwarded-For` y se quedaba con el **primer** valor.

Para entender por qué eso está mal hay que saber cómo funciona ese header. Cuando una request pasa por un proxy, el proxy **agrega al final** la IP de quien le habló:

```
Cliente (9.9.9.9)  →  Proxy de Render  →  Backend
```

- Si el cliente no manda nada, el proxy escribe: `X-Forwarded-For: 9.9.9.9`
- Si el cliente manda `X-Forwarded-For: 1.2.3.4` (inventado), el proxy **agrega detrás**: `X-Forwarded-For: 1.2.3.4, 9.9.9.9`

El primer valor es lo que el cliente quiso escribir. El último es lo que el proxy **observó de verdad**. El código tomaba el primero.

**Por qué importaba tanto.** De `clientIP` dependen el rate limiter por IP y uno de los tres detectores de abuso del formulario público. Todos evadibles agregando un header falso y cambiándolo en cada request.

**El arreglo.** Tomar el último valor.

**La alternativa que se descartó, y por qué.** Podría haberse usado un header propietario del proveedor de hosting, que el proxy garantiza sobrescribir. Es igual de válido, pero ata el código a Render: mudarse a otro hosting rompería la seguridad en silencio. La convención de `X-Forwarded-For` es estándar y portátil.

**La letra chica que quedó escrita.** Esto vale con **exactamente un** proxy de confianza adelante. Si mañana se pone un CDN (Cloudflare, por ejemplo) delante de Render, hay dos proxies, y "el último" pasa a ser la IP del primer proxy — no la del cliente. Entonces todo el rate limiting agruparía a todos los usuarios en una sola IP. No es un problema de seguridad, pero rompe la funcionalidad, y sin el comentario nadie lo vería venir.

**La idea general:** identificá qué parte de una entrada la controla un tercero de confianza y cuál el usuario. Nunca las mezcles.

---

### A2. `decodeJSON` leía bodies de cualquier tamaño

**El problema.** Cualquier `POST` podía mandar un JSON de 2 GB. El servidor lo cargaba entero en memoria **antes** de validar nada — incluidos los endpoints públicos que no requieren sesión. Un ataque de denegación de servicio de una línea de `curl`.

**El arreglo.** `http.MaxBytesReader(w, r.Body, 1 MiB)`.

**Un detalle que se ve al implementarlo.** ¿Por qué `MaxBytesReader` y no simplemente cortar la lectura? Porque además de cortar, cierra la conexión si el cliente sigue mandando. Truncar la lectura sin cerrar deja al atacante ocupando una conexión indefinidamente: cambiás un ataque por otro.

**Un detalle de diseño que enseña algo.** Ponerle el límite obligó a cambiar la firma de la función de `decodeJSON(r, v)` a `decodeJSON(w, r, v)` —porque `MaxBytesReader` necesita el `ResponseWriter`— y por lo tanto a tocar **todos** los lugares que la llamaban. Eso, que parece una molestia, es en realidad la propiedad que hace que el arreglo sea confiable: el compilador garantiza que no quedó ningún call site sin actualizar. Un arreglo que hay que "acordarse de aplicar" en cada lugar nuevo no es un arreglo.

**La verificación que corresponde hacer.** No alcanza con arreglar la función: hay que confirmar que **nadie lee el body por otro camino**. Se buscó en todo el backend `io.ReadAll(r.Body)` y `json.NewDecoder(r.Body)` sueltos. Cero resultados. Sin ese chequeo, el arreglo podría estar cubriendo el 90% de las puertas.

---

### A3. El servidor no tenía timeouts de lectura

**El problema.** El código usaba `http.ListenAndServe(...)`, que arma un servidor con **todos los timeouts en cero** — o sea, infinitos.

**El ataque que eso habilita** se llama Slowloris, y es elegante en su simplicidad: abrís muchas conexiones y mandás los headers de cada request **de a un byte cada varios segundos**. Nunca terminás la request. El servidor mantiene todas esas conexiones abiertas esperando cortésmente, hasta quedarse sin recursos. No hace falta ancho de banda ni una botnet.

**Por qué el timeout que ya existía no alcanzaba.** El proyecto tenía `middleware.Timeout(30s)` de chi. Pero un middleware corre **después** de que el handler arrancó, y el handler arranca **después** de que el servidor terminó de leer los headers. Slowloris ataca la fase anterior a todo eso. Un middleware, por definición, no puede protegerla.

**Esta es la lección real del ítem:** cada defensa cubre una fase concreta del ciclo de vida de una request. Tener "un timeout" no significa estar cubierto; hay que saber *qué fase* cubre cada uno.

| Timeout | Qué acota |
|---|---|
| `ReadHeaderTimeout` (10s) | leer los headers — **el que faltaba** |
| `ReadTimeout` (15s) | leer headers + body |
| `WriteTimeout` (30s) | escribir la respuesta |
| `IdleTimeout` (60s) | conexión reusada, entre requests |
| `middleware.Timeout` (30s) | el handler procesando |

---

### A4. El secreto de producción caía a un valor público

Este es el más instructivo de los cuatro, porque se arregló dos veces.

**El problema original.** `config.Load()` hace esto:

```go
OAuthStateSecret: getEnv("JWT_SECRET", "dev-secret-cambiar-en-produccion")
```

El valor por defecto existe por una buena razón: que nadie tenga que configurar nada para levantar el proyecto localmente. Pero ese mismo comportamiento, en producción, significa que **un error de tipeo en el nombre de la variable en el dashboard de deploy hace arrancar el proceso en silencio**, firmando con un secreto que está publicado en GitHub.

**El primer arreglo:** un guard que frena el arranque fuera de `development`.

**El agujero que quedó** (encontrado en la revisión del 2026-09-09). El guard preguntaba si la variable **existía**:

```go
if _, ok := os.LookupEnv("JWT_SECRET"); !ok {   // ¿existe?
```

Pero `getEnv` cae al valor por defecto cuando la variable existe pero está **vacía o es solo espacios** (recorta el whitespace a propósito, para tolerar un secreto pegado con un salto de línea de más — otro problema real).

Resultado: **borrar el contenido del campo** en el dashboard —en vez de borrar la fila entera— pasaba el guard. Y de los dos errores humanos posibles, borrar el contenido es el más probable.

Este es el caso de la idea #4: dos funciones razonables, un hueco en el medio.

**El segundo arreglo.** Comparar el **valor resuelto**, no la existencia de la variable:

```go
if cfg.OAuthStateSecret == config.OAuthStateSecretDeDesarrollo {
```

Fijate qué elegante resulta: cubre los cuatro casos de una sola vez —ausente, vacía, con espacios, o alguien que escribió el valor de ejemplo a mano— sin enumerar ninguno. **Cuando un chequeo necesita enumerar casos, casi siempre está preguntando lo que no es.** Acá la pregunta correcta no era "¿configuraron la variable?" sino "¿el valor con el que voy a arrancar es el público?".

**Sobre el nombre `JWT_SECRET`, que confunde a todo el mundo.** En este backend **no hay ningún JWT**. Ni siquiera la librería: se eliminó como dependencia muerta. La sesión es un token opaco que se valida contra la tabla `sessions`. Esa variable firma **una sola cosa**: el parámetro `state` del login con Google, con HMAC-SHA256, para evitar CSRF en el callback de OAuth.

El nombre quedó de una versión anterior del sistema, y **no se renombra a propósito**: cambiarlo rompería los deploys que ya lo tienen configurado. Pero el identificador de Go sí se renombró a `Config.OAuthStateSecret`, y la disonancia entre los dos nombres quedó documentada en `config.go` y `.env.example`.

**La idea general:** cuando un nombre miente por razones históricas legítimas, no se puede arreglar el nombre — pero sí se puede hacer que el código nuevo diga la verdad y que la mentira esté documentada donde alguien la vaya a leer. Lo que no vale es dejar que la confusión se propague a código nuevo.

---

## Fase B — antes de sumar más funcionalidad

### B1. El índice que faltaba (el mejor negocio de todo el informe)

**El contexto.** Cada request autenticada resuelve a qué clínica pertenece el usuario. Esa consulta corría **en cada request**, y no tenía índice: la base recorría la tabla entera de miembros de clínica.

**El arreglo.** Un índice compuesto sobre `(user_id, role)`. Una hora de trabajo.

**Por qué compuesto y en ese orden.** Un índice compuesto sirve para consultas que filtran por la primera columna, o por la primera **y** la segunda — nunca por la segunda sola. La consulta real filtra por `user_id` y ordena/filtra por `role`, así que ese orden le sirve. Al revés no.

**Cómo se verificó, y por qué eso importa más que el arreglo.** Con `EXPLAIN`, que muestra el plan que la base va a usar de verdad. Es la diferencia entre "creé un índice y asumo que lo usa" y "confirmé que lo usa". Postgres puede perfectamente ignorar un índice que creaste, y no te avisa.

---

### B2. Redis para las sesiones: la respuesta fue que no

Esto entró al informe como una pregunta directa: cada request consulta la sesión en la base, ¿no convendría Redis?

**La respuesta, y el razonamiento.** No. Esa consulta busca por `token_hash`, que tiene un índice único: es una búsqueda directa, de coste prácticamente constante, sobre un dato que Postgres ya tiene en memoria por lo caliente que está. Redis ahorraría muy poco, y a cambio suma un servicio más que operar, monitorear, y que puede caerse.

**Y acá lo interesante:** al buscar la consulta cara de verdad, resultó ser otra — la de la clínica del usuario, que no usaba índice (B1). El problema existía, pero no estaba donde la intuición decía.

**La idea general, que vale para toda tu carrera:** una intuición de rendimiento es una hipótesis, no un diagnóstico. Medir primero cambia *qué* arreglás, no solo cuánto. La solución acá costó una hora en vez de sumar un servicio nuevo a la infraestructura.

Redis sigue teniendo sentido en este proyecto, pero para otra cosa (el rate limiter por IP, que hoy vive en memoria del proceso) y en otro momento (cuando haya más de una instancia del backend). Eso quedó en la Fase C.

---

### B3. Paginación: por qué "Cargar más" y no páginas numeradas

**El problema, que era peor de lo que parecía.** `/panel/turnos` no traía una lista completa por visita. Traía **cinco**: la de la pestaña activa, más las cuatro que se usaban solo para mostrar el numerito al lado de cada pestaña (`lista.length`).

Ese detalle enseña algo: el costo no estaba en el endpoint, estaba en **cómo la interfaz lo usaba**. Leyendo solo el backend no se ve.

**Decisión 1 — la paginación es opcional.** Sin el parámetro `limit`, el endpoint responde exactamente como antes. Parece pereza, y es lo contrario: el **calendario** usa ese mismo endpoint y necesita el rango de fechas **completo**. Si paginar fuera el comportamiento por defecto, el calendario empezaría a esconder turnos silenciosamente — el peor tipo de bug, porque no falla, solo miente.

**Decisión 2 — el total viaja en un header, no en el body.** Se podría haber cambiado la respuesta a `{items: [...], total: 42}`. Habría roto a todos los consumidores existentes de golpe. Mandarlo en `X-Total-Count` deja el body como estaba: quien no sabe del header sigue funcionando igual.

**Decisión 3 — el `limit` se recorta a 200 en silencio.** Si un cliente pide `limit=999999`, se le dan 200. El sentido de paginar es que **ninguna** consulta pueda pedir la tabla entera; un límite que el cliente puede desactivar no es un límite.

**Decisión 4 — "Cargar más" en vez de páginas 1 / 2 / 3.** Esta es de diseño de producto, no técnica. El profesional recorre estas tablas escaneando de arriba a abajo, y entra y sale de fichas de pacientes todo el tiempo. Con páginas numeradas, cada vuelta lo obliga a recordar en qué página estaba. Con "Cargar más", la lista solo crece — que es exactamente cómo se leía antes.

**Un detalle chico que hace la diferencia.** Al cancelar un turno, la tabla se recarga. La versión ingenua recarga la primera tanda — y si el profesional había tocado "Cargar más" tres veces, la tabla se le encoge de golpe bajo el cursor. La versión correcta recarga **la ventana que tenía cargada**. Un cambio de dos líneas que separa una interfaz que se siente sólida de una que se siente rota.

**Un efecto secundario que hubo que resolver.** Las pestañas Verificados / Sin verificar de Pacientes se filtraban **en el navegador**, sobre la lista completa. Con tandas parciales eso muestra cualquier cosa. Hubo que bajar el filtro al backend — reusando la misma subquery que `/turnos` ya usaba, **no escribiendo una segunda copia de la regla**. Dos definiciones de "paciente verificado" en el código es una que se va a desincronizar.

**La idea general:** cambiar una decisión de arquitectura (traer todo → traer de a partes) rompe supuestos en lugares que no tocaste. Buscarlos es parte del trabajo, no un imprevisto.

---

### B4. Logging estructurado, con una regla que no es obvia

**El cambio.** De texto plano a JSON con campos: `request_id`, `metodo`, `ruta`, `status`, `duracion_ms`, `clinic_id`, `user_id`. Un agregador de logs puede filtrar por eso; texto plano solo se puede leer con los ojos.

**La regla que importa más que el formato: nunca loguear la query string.**

Parece un detalle. No lo es: el endpoint "Mis turnos" recibe el DNI y el mail del paciente **como parámetros de URL**. Loguear la ruta completa habría escrito datos personales de salud en texto plano en un sistema de logs, replicado, con retención larga, accesible a más gente que la base de datos. Un problema de privacidad creado por una mejora de observabilidad.

Por eso se loguea el *patrón* de ruta (`/clinicas/{slug}/mis-turnos`), nunca la URL concreta.

**La idea general:** cada vez que agregás un lugar donde los datos se copian —logs, métricas, mensajes de error, reportes de crash— acabás de crear un lugar más donde pueden filtrarse. Preguntá siempre qué termina ahí adentro.

---

### B5. La migración que corría para siempre

**El problema.** Había un bloque de limpieza de datos (deduplicar pacientes con el mismo DNI) que corría **en cada arranque** del contenedor de migraciones. Recorría la tabla entera. Para siempre. Después de la primera vez, nunca más encontraba nada que limpiar.

**La distinción conceptual, que es lo que hay que llevarse:** hay dos clases de migración, y confundirlas sale caro.

- **De esquema** (crear una tabla, agregar una columna): idempotentes, baratas, se re-ejecutan en cada arranque sin problema. `CREATE TABLE IF NOT EXISTS`.
- **De datos** (barrer y corregir filas existentes): su costo **crece con el volumen de la base**, y solo tienen sentido una vez. Necesitan un registro de "esta ya se aplicó".

**El arreglo.** Una tabla `migraciones_una_vez` con el nombre de cada migración aplicada. Se registra **en la misma transacción** que el trabajo: o pasan las dos cosas o ninguna. Si la migración falla, no queda registrada y el próximo arranque la reintenta.

Ese detalle de la transacción compartida es todo el diseño. Si el registro se hiciera aparte, un fallo entre medio dejaría la migración marcada como aplicada sin haberlo estado.

---

## Los tres bugs que aparecieron *mientras* se arreglaba

Esta sección es, probablemente, la más útil del documento. Arreglar cosas introduce cosas. Los tres bugs siguientes los introdujo el propio trabajo de la auditoría, y los tres se detectaron **antes** de llegar a producción — por revisión de código, por CI, y por una verificación empírica que se hizo por desconfianza.

### Bug 1: el orden se invirtió al refactorizar (severidad alta)

Al mover la deduplicación de pacientes al mecanismo de "una sola vez", quedó **después** del `CREATE UNIQUE INDEX` que la necesita.

La deduplicación existe justamente para que ese índice se pueda crear. Con el orden invertido, sobre una base con duplicados reales: el índice falla → toda la transacción hace rollback → los duplicados siguen ahí → el próximo arranque falla igual. **El contenedor queda en un loop del que no se sale sin SQL a mano.**

**Por qué CI jamás lo habría detectado:** la base de test siempre nace limpia, sin duplicados — exactamente la población para la que ese código existe. El código sin tests posibles no es el que no tiene tests; es el que solo se ejercita con datos que los tests nunca tienen.

**Cómo se cerró:** un test que arma su propia base descartable, carga duplicados **antes** de migrar, y valida en los dos sentidos (falla con el orden viejo, pasa con el nuevo).

**La lección:** un refactor que "solo mueve código de lugar" puede cambiar el orden de operaciones, y el orden puede ser parte de la corrección. Mover no siempre es equivalente.

---

### Bug 2: el logger estructurado degradó todos los errores fatales a INFO (severidad baja, síntoma cero)

Este es mi favorito, porque no produce ningún síntoma visible.

En Go, `slog.SetDefault()` hace dos cosas: fija el logger por defecto **y** redirige el paquete `log` de la biblioteca estándar al mismo destino — pero **siempre a nivel INFO**.

Consecuencia: `log.Fatalf("error conectando a la base de datos")` pasaba a emitirse como `{"level":"INFO"}`. El mensaje sale, el proceso muere, todo parece normal. Pero cualquier alerta configurada sobre `level >= ERROR` **no lo ve** — que es exactamente para lo que se había migrado a logging estructurado.

Un arreglo que rompe, en silencio, la cosa que venía a mejorar.

**Cómo se encontró:** no por un test. Escribiendo un programa mínimo aparte para ver qué salía de verdad, porque el comportamiento no era obvio leyendo la documentación.

**La lección:** cuando una función de biblioteca hace más de una cosa (acá: fijar el logger *y* redirigir otro paquete), leé qué es esa segunda cosa. Y cuando el comportamiento no es obvio, un programa de diez líneas te da la respuesta real en dos minutos.

---

### Bug 3: deadlock en las migraciones (lo encontró CI)

CI se puso rojo con:

```
ERROR: deadlock detected (SQLSTATE 40P01)
DROP INDEX IF EXISTS idx_paciente_dni_unico
```

**Cómo se razonó el diagnóstico.** Las migraciones ya tomaban un *advisory lock* para serializarse entre sí. Primera pregunta: ¿puede el deadlock ser entre dos migraciones? **No, y se puede demostrar:** la segunda migración espera ese lock sin tener tomado nada más. Para que haya deadlock hacen falta dos transacciones que se esperen **mutuamente**; una que no tiene nada tomado no puede ser esperada por nadie. No hay ciclo posible.

Descartado eso, el otro lado tiene que ser una transacción **común**. Y ahí aparece: en CI, un paquete de test que ya migró y está corriendo sus tests mientras otro paquete recién arranca y migra. La migración toma locks exclusivos sobre varias tablas y después pide `pacientes`; la transacción del test ya tiene `pacientes` y pide alguna de las que la migración se quedó. Ciclo.

**Por qué esto no era "un problema de CI".** El mismo ciclo existe en producción: el contenedor de migraciones de un deploy corre mientras la instancia anterior de la API **sigue atendiendo tráfico**. CI simplemente lo hizo visible primero.

Esto pasa seguido: un test que falla "solo en CI" muchas veces está mostrando un problema real que en producción aparece más raro y más caro.

**El arreglo: reintentar.** Un deadlock es, por definición, un error para reintentar — Postgres mata una de las dos transacciones **justamente para que pueda volver a intentarlo**. Es seguro acá por dos razones concretas: toda la migración vive en **una** transacción (el rollback no deja nada a medias) y la función es idempotente.

**El detalle que enseña más de todo el ítem.** Se detecta el **código** de error (`40P01`), nunca el texto del mensaje. Los mensajes de error cambian con la versión del servidor y con el idioma configurado; los códigos son parte del contrato de SQL. Un `strings.Contains(err.Error(), "deadlock")` funciona hasta el día que alguien configura el servidor en otro idioma.

**Y cómo se testeó, que es la parte importante.** Lo único que podía fallar en silencio era el **desenvuelto del error**: entre el error de Postgres y lo que devuelve el ORM hay dos capas de envoltura. Si alguna envolviera el error de una forma que `errors.As` no atraviesa, la detección devolvería `false` siempre, el reintento nunca se dispararía, y no habría ningún síntoma hasta el próximo CI rojo.

Por eso el test **provoca un deadlock de verdad** (dos transacciones tomando dos locks en orden opuesto, con una barrera para garantizar el ciclo) en vez de fabricar un error a mano — que habría pasado sin probar nada de lo que importa.

Y una confesión útil: la **primera versión de ese test no producía el deadlock**. La barrera estaba mal armada (cada hilo consumía su propia señal), las dos transacciones pasaban de largo y el test pasaba… sin haber probado nada. Se vio fallar, se corrigió, recién ahí sirvió. **Un test que nunca viste fallar no sabés si prueba algo.**

---

## Cómo se decidió qué NO hacer

Tan importante como la lista de arreglos es la lista de cosas que se dejaron pasar a propósito.

### La refactorización de los tres archivos gigantes bajó a Fase C

`turno_publico.go` (1504 líneas), `turnos.go` (1503) y `pedir-turno-form.tsx` (1306) son incómodos de leer. Partirlos estaba en la Fase B. Se movió a la C, y el razonamiento sirve de plantilla:

- **Es el único ítem del informe que no arregla nada.** No cierra un riesgo, no destraba un límite de escala, no corrige un bug. Paga en velocidad futura de desarrollo — algo real, pero que se cobra recién cuando haya varias personas tocando esos archivos a la vez.
- **Es el más caro:** 3 a 5 días, contra horas de la mayoría de los otros.
- **Es el único que puede *introducir* problemas.** `turno_publico.go` concentra los tres detectores de abuso, la detección de conflictos de identidad y la revalidación de horario dentro de la transacción. Es el código más delicado del sistema.

Cambiar 1500 líneas del código más sensible, a cambio de cero mejora observable, mientras siguen abiertos ítems que sí atacan riesgos, es un mal negocio.

**Lo importante es que la condición para subirlo esté escrita:** cuando el archivo empiece a generar conflictos de merge reales, o cuando entre alguien nuevo al proyecto y ese archivo sea su primer obstáculo. Sin una condición concreta, "más adelante" significa "nunca", y el ítem se convierte en deuda invisible.

### Otras cosas que se dejaron como están, y por qué

- **Foreign keys en el esquema.** El aislamiento entre clínicas se verificó a mano en más de 20 puntos y está bien en todos. Las FK serían una red de seguridad adicional, no la corrección de un problema existente.
- **HaveIBeenPwned falla abierto.** Si el servicio de terceros no responde, el registro sigue. Es una decisión, no un descuido: bloquear todos los registros porque un servicio ajeno está caído es peor que el riesgo que evita.
- **Un CVE de `x/crypto` sin corregir.** No tiene fix upstream. Lo que se hizo fue confirmar con `govulncheck` que **no es alcanzable** desde este código — la diferencia entre "tenemos una vulnerabilidad" y "tenemos una dependencia que contiene una vulnerabilidad en código que nunca ejecutamos".

**La idea general:** "no arreglado" y "no evaluado" son cosas muy distintas. Un informe honesto distingue las dos, y para cada cosa no arreglada deja escrito el porqué y la condición que la reactivaría.

---

## Cómo verificar que un arreglo de verdad arregla algo

El método que se usó en toda esta tanda, resumido. Es transferible a cualquier proyecto.

### 1. Reproducir antes de arreglar

Antes de tocar el guard del secreto, se escribió un programa que lo hiciera fallar:

```
cfg resuelto = "dev-secret-cambiar-en-produccion"
AGUJERO CONFIRMADO: el guard dejó arrancar
```

Si no podés reproducir el problema, no sabés si lo arreglaste — sabés que el síntoma dejó de aparecer, que no es lo mismo.

### 2. Validar el test en los dos sentidos

Un test de regresión tiene que **fallar con el código viejo** y **pasar con el nuevo**. Si solo comprobaste lo segundo, no sabés si el test discrimina algo.

Se hizo dos veces en esta tanda: en el orden de la migración, y en el guard del secreto (4 de sus 5 casos fallan con el guard viejo). En los dos casos se revirtió temporalmente el arreglo para comprobarlo.

### 3. Verificar el mecanismo, no solo el resultado

Al crear el índice: `EXPLAIN` para confirmar que la base **lo usa de verdad**.
Al detectar deadlocks: provocar un deadlock **real** para confirmar que el error sobrevive las capas de envoltura.

En los dos casos, la versión fácil del test (existe el índice; el error tiene el código correcto) habría pasado sin probar lo que importaba.

### 4. Desconfiar de tu propia herramienta

En esta máquina, correr el linter de Go directamente sobre el directorio de trabajo da resultados **inestables** — distintos archivos marcados como mal formateados en corridas distintas, todo ruido de fines de línea (CRLF vs LF). La solución fue extraer una copia normalizada antes de correr el linter.

Y una vuelta de tuerca: esa copia **no puede vivir en el directorio temporal del sistema**, porque Go ignora los `go.mod` que encuentra ahí — y el linter entonces imprime `0 issues` junto a un error de typechecking que parece decorativo. Un "0 issues" que no significa nada.

**Una herramienta que reporta éxito no siempre corrió.** Leé la salida completa, no solo la última línea.

---

## Resumen en una página

| Arreglo | La idea de fondo |
|---|---|
| `clientIP` | Preguntá quién controla cada dato de entrada |
| Límite de body | Todo lo que entra necesita un techo |
| `ReadHeaderTimeout` | Cada defensa cubre una fase; conocé cuál |
| Guard del secreto | Preguntá por el valor resuelto, no por la existencia |
| Índice `(user_id, role)` | Medí antes de optimizar; verificá con `EXPLAIN` |
| Redis: no | Una intuición de rendimiento es una hipótesis |
| Paginación opt-in | Un cambio de arquitectura rompe supuestos ajenos |
| No loguear query strings | Cada copia de los datos es un lugar más donde filtrarse |
| Migración de una sola vez | Esquema y datos son dos clases distintas de migración |
| Reintento por deadlock | Detectá códigos de error, nunca textos |
| Refactor a Fase C | Escribí la condición que reactiva lo que postergás |

---

*Escrito el 2026-09-09, como cierre de las Fases A y B de la auditoría. Acompaña a `radiografia-tecnica_1.md` (el diagnóstico) y precede al snapshot periódico de seguridad y optimización.*
