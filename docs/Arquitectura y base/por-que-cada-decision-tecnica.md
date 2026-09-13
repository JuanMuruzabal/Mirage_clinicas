# Por qué cada decisión técnica

**PRISMA · El fundamento del stack, y qué lo haría cambiar**

`dental-mirage-spec.md` §9.1 fija el stack como "decidido, no a evaluar" — y tiene razón para arrancar rápido, pero deja un hueco: **el porqué nunca se escribió**. Este documento lo cubre.

Cada sección tiene la misma forma: qué se eligió, contra qué se lo comparó, **por qué gana en ESTE proyecto** (no en abstracto), qué se sacrifica, y **la condición concreta que haría cambiar la decisión**. Esa última parte es la que importa dentro de un año: sin ella, una decisión correcta hoy se convierte en dogma mañana.

`tradeoffs.md` registra decisiones **de producto y de feature** (TR-001 en adelante). Este documento es sobre las decisiones **de plataforma**, que están debajo de todas ellas y casi nunca se revisan.

---

## Índice

1. [PostgreSQL, y no MySQL/InnoDB](#1-postgresql-y-no-mysqlinnodb)
2. [Go, y no Node/Python en el backend](#2-go-y-no-nodepython-en-el-backend)
3. [GORM, y no SQL a mano ni sqlc](#3-gorm-y-no-sql-a-mano-ni-sqlc)
4. [Next.js con BFF, y no una SPA contra la API](#4-nextjs-con-bff-y-no-una-spa-contra-la-api)
5. [Render, y no Cloudflare / Fly / Kubernetes](#5-render-y-no-cloudflare--fly--kubernetes)
6. [Docker en los tres entornos](#6-docker-en-los-tres-entornos)
7. [Monorepo con pnpm](#7-monorepo-con-pnpm)
8. [Tests contra Postgres real, y no mocks](#8-tests-contra-postgres-real-y-no-mocks)
9. [Sesiones en base, y no JWT ni Redis](#9-sesiones-en-base-y-no-jwt-ni-redis)
10. [Resumen: qué activaría cada cambio](#10-resumen-qué-activaría-cada-cambio)

---

## 1. PostgreSQL, y no MySQL/InnoDB

**La razón NO es la velocidad.** Conviene sacarlo del medio primero: para el patrón de carga de este sistema —muchas lecturas chicas, escrituras esporádicas, tablas de miles de filas, no de millones— MySQL con InnoDB y Postgres rinden parecido. Elegir por "cuál es más rápido" a esta escala es elegir por una diferencia que no se va a medir.

Tampoco es cierto, dicho con precisión, que InnoDB "no tenga WAL": tiene su propio redo log (`ib_logfile`) que cumple la misma función de durabilidad. Los dos motores escriben primero al log y después a las páginas de datos.

**La razón real es que tres mecanismos centrales de este sistema no existen en MySQL.** No "son más difíciles": no existen, y habría que emularlos en la aplicación — que es exactamente donde no queremos que vivan.

### 1.1 El exclusion constraint

La regla no negociable del producto es que dos turnos del mismo profesional no pueden solaparse. En Postgres eso es una línea de esquema:

```sql
ALTER TABLE turnos ADD CONSTRAINT sin_solapamiento_turno
  EXCLUDE USING gist (
    profesional_id WITH =,
    rango_horario  WITH &&      -- && = "los rangos se intersectan"
  ) WHERE (estado = 'agendado');
```

La base **rechaza** el solapamiento. No hay forma de insertarlo: ni desde el panel, ni desde el formulario público, ni desde una consulta a mano, ni desde un bug futuro, ni desde dos requests simultáneas que pasen la validación al mismo tiempo.

MySQL no tiene tipos de rango, ni índices GiST, ni exclusion constraints. La alternativa sería:

1. Consultar si hay solapamiento.
2. Insertar si no lo hay.

Entre 1 y 2 hay una ventana. Cerrarla exige `SELECT ... FOR UPDATE` sobre un rango, elegir bien el nivel de aislamiento, y **acordarse de hacerlo en cada camino de escritura**. Hoy son al menos tres: el modal del panel, el wizard público y la reprogramación. Mañana serán más.

> La diferencia de fondo: en Postgres la garantía **es del esquema**; en MySQL sería **de la disciplina de quien escribe el código**. Para la regla central de un sistema de turnos, esa distinción es la decisión entera.

### 1.2 Índices únicos parciales

Este proyecto usa tres, y uno resuelve una regla que de otro modo sería lógica de aplicación:

```sql
CREATE UNIQUE INDEX idx_paciente_dni_unico
  ON pacientes (profesional_id, dni) WHERE NOT en_conflicto;
```

Dice exactamente la regla de negocio: *el DNI es único por clínica, salvo mientras hay un conflicto de identidad sin resolver*. La detección de conflictos (dos personas reclamando el mismo DNI) **necesita** que dos fichas convivan temporalmente; un índice único completo lo rechazaría de plano.

MySQL no tiene índices parciales. Las salidas serían una columna calculada con un truco de NULLs, o mover la unicidad a la aplicación. Las dos son peores que una línea de esquema que dice la verdad.

### 1.3 DDL transaccional — y esto ya nos salvó

En Postgres, un `ALTER TABLE` vive dentro de una transacción: si algo falla después, **se deshace**. En MySQL, casi todo el DDL hace *commit implícito*: no hay rollback posible.

No es teórico. El 2026-09-09 un deploy a Render falló a mitad de la migración: la limpieza de filas legacy ya había borrado 10 filas cuando la creación de las foreign keys encontró datos inconsistentes y abortó.

- **Con Postgres:** rollback. Las 10 filas volvieron. La base quedó exactamente como estaba y el deploy simplemente no avanzó.
- **Con MySQL:** las 10 filas estarían borradas, el esquema a medio migrar, y sin registro de hasta dónde llegó.

Todo el diseño de migraciones de este proyecto —una transacción, advisory lock, guardián de operaciones destructivas— **depende de que el DDL sea transaccional**. Ver `docs/Seguridad y optimizacion/radiografia-tecnica_1.md` §17.

### 1.4 Sobre "InnoDB es más permisivo con los conflictos"

Vale desarmar la comparación, porque la intuición apunta a algo real pero lo nombra mal.

Lo que sí difiere es el **modelo de bloqueo**: InnoDB usa por defecto `REPEATABLE READ` con *gap locks*, que bloquean rangos de índice y hacen que dos transacciones se estorben más seguido. Postgres usa `READ COMMITTED` con MVCC y sin gap locks: dos escrituras que no tocan la misma fila casi nunca se pelean.

O sea que la comparación va **al revés** de la intuición: para escrituras concurrentes sobre filas distintas —el caso de dos pacientes reservando turnos al mismo tiempo— Postgres es el más permisivo de los dos.

Lo que Postgres **sí** hace es abortar la transacción entera ante cualquier error, incluido un deadlock (SQLSTATE `40P01`). Eso se siente más estricto, y lo es. Pero es el mismo comportamiento que hace que el rollback de §1.3 funcione. Se convive con él reintentando, que es lo que hace `RunMigrations` (TR-123): un deadlock es, por definición, un error para reintentar.

### Qué se sacrifica

Menos hosting compartido barato ofrece Postgres que MySQL, y hay menos gente que lo administró alguna vez. Con un servicio administrado (Render, Neon, Supabase) eso deja de importar.

### Qué cambiaría la decisión

Prácticamente nada realista: las tres cosas de arriba son estructurales. El único escenario sería que el producto perdiera la regla de no-solapamiento y la detección de conflictos — o sea, que fuera otro producto.

---

## 2. Go, y no Node/Python en el backend

**Un binario estático, sin runtime.** El `Dockerfile` compila con `CGO_ENABLED=0` y copia el binario a una imagen `alpine` con nada más que certificados:

```dockerfile
FROM golang:1.26-alpine AS build
RUN CGO_ENABLED=0 go build -o /out/api ./cmd/api
FROM alpine:3.20 AS runtime
RUN apk add --no-cache ca-certificates
COPY --from=build /out/api /app/api
```

Consecuencias concretas, no de folleto:

- **No hay `node_modules` ni intérprete en producción.** La superficie de ataque del contenedor es el binario y poco más — no un árbol de miles de paquetes con sus vulnerabilidades transitivas.
- **Arranca en milisegundos.** En el plan free de Render los servicios se duermen por inactividad; el primer request después de dormir paga el arranque completo. Un binario estático despierta mucho más rápido que un runtime que tiene que cargar dependencias.
- **`govulncheck` analiza alcanzabilidad**, no solo versiones. Puede decir "esta CVE está en una dependencia pero tu código nunca llega a esa función". Eso permitió cerrar la auditoría con **0 vulnerabilidades alcanzables** teniendo una CVE sin fix upstream (TR-128). Con un escáner que solo compara versiones, esa alarma no se puede accionar.
- **El compilador atrapa lo que en un lenguaje dinámico atrapa el runtime.** Concreto de este proyecto: cambiar la firma de `decodeJSON` para sumarle el límite de tamaño (TR-126) **obligó** a tocar todos los call sites. Un límite que hay que "acordarse de aplicar" en cada handler nuevo no es un límite.

**Contra Node:** el frontend ya es Next.js, así que un backend en Node permitiría compartir tipos sin `packages/shared-types`. Se descartó por lo de arriba, y porque el manejo de concurrencia del cálculo de disponibilidad y de las transacciones es más directo con goroutines y un `database/sql` sincrónico que con async/await sobre un pool.

**Contra Python:** más rápido de escribir al principio, y la diferencia se paga después — sin tipos en tiempo de compilación, un refactor del tamaño del de auth (TR-037, que reemplazó JWT por sesiones server-side) se hace a fuerza de tests y grep.

### Qué se sacrifica

Más verbosidad, y una biblioteca estándar deliberadamente austera: cosas que en otros ecosistemas son una línea acá son diez. El manejo de errores explícito (`if err != nil`) es ruidoso.

### Qué cambiaría la decisión

Si el producto virara a algo dominado por procesamiento de datos o machine learning, donde el ecosistema de Python es decisivo. Nada de eso está en el horizonte.

---

## 3. GORM, y no SQL a mano ni sqlc

**GORM para el 90% que es CRUD aburrido, SQL crudo donde importa.** El proyecto no es dogmático: la parte más delicada —el exclusion constraint, los índices parciales, la deduplicación, el cálculo de disponibilidad— está escrita en SQL directo dentro de `migrate.go` y de los handlers, porque son cosas que un ORM no expresa bien.

- **Contra SQL a mano en todo:** el CRUD de pacientes/turnos/tipos de consulta no gana nada escrito a mano, y se pierde el `AutoMigrate`, que mantiene el esquema sincronizado con los structs sin escribir cada `ALTER TABLE`.
- **Contra sqlc (SQL que genera Go tipado):** es probablemente la mejor alternativa, y sería una buena elección para un proyecto nuevo. Se descartó por continuidad con Marcuzzi_Madryn, donde GORM ya estaba validado en producción.

### Qué se sacrifica

Lo pagamos ya, y está documentado: **GORM nunca borra columnas**, solo agrega — de ahí los `DROP COLUMN` explícitos que después hubo que meter detrás del guardián de migraciones destructivas (TR-132). Y `AutoMigrate` no cambia una primary key existente, lo que obligó a recrear `horarios_atencion` a mano.

También hay que saber en qué momento GORM aplica un check constraint de un struct tag: el bug del `DELETE FROM turnos WHERE estado = 'pendiente'` mal ubicado salió justamente de ahí (§16.1 del informe).

### Qué cambiaría la decisión

Si `AutoMigrate` deja de alcanzar y las migraciones crudas empiezan a ser la mayoría, conviene migrar a un esquema versionado real (golang-migrate, Atlas) y a sqlc para las consultas. **La señal concreta:** cuando el bloque de `statements` de `migrate.go` sea más largo que el `AutoMigrate`.

---

## 4. Next.js con BFF, y no una SPA contra la API

**El navegador nunca habla con la API Go.** `lib/api.ts` es `server-only`, sin prefijo `NEXT_PUBLIC_` — ni siquiera podría empaquetarse en el bundle del cliente. Todo pasa por Server Actions o Route Handlers.

Es una decisión de **seguridad** antes que de arquitectura:

- El token de sesión vive en una cookie `httpOnly`. Un XSS no puede leerlo, porque JavaScript no tiene acceso.
- La URL de la API y cualquier credencial nunca llegan al navegador.
- **La superficie pública es la que el frontend expone, no la API entera.** Con una SPA, todo endpoint que el frontend usa queda accesible desde afuera, con la autorización como única defensa.

**Contra una SPA (React/Vite) + API pública:** más simple de razonar y despliega estático. Pero obliga a poner el token en algún lado accesible por JS (`localStorage` es peor; una cookie sin `httpOnly` también), y a exponer la API entera a internet.

### Qué se sacrifica

Cada pantalla nueva necesita una Server Action; no se puede hacer `fetch` desde un Client Component. Es fricción real y deliberada — el patrón se rompe la primera vez que alguien "solo por esta vez" llama directo.

Y hay un costo que no estaba escrito acá hasta que se cobró solo (Fase 3.1.1, TR-134): **si el navegador nunca habla con la API, la API tampoco sabe quién es el navegador.** Todo pedido le llega con la IP del proceso web. Eso no rompe nada visible —las pantallas andan igual— pero deja ciego a todo lo que decide *por IP*: el rate-limiting de auth contaba los intentos de todos juntos, y el detector de rotación del wizard público veía a todos los pacientes como un solo atacante rotando identidades. Llegó a borrar turnos reales antes de que se notara.

La lección es más general que el bug: **un patrón que interpone una capa no solo mueve el tráfico, mueve la identidad de quien lo origina.** Cualquier control que dependa de "de dónde viene esto" hay que revisarlo al adoptar el patrón, no cuando falle. El arreglo fue que el BFF propague la IP con un secreto compartido, y no es gratis: suma una variable de entorno a mantener en dos servicios.

### Qué cambiaría la decisión

Si hubiera que exponer una API pública para terceros (una app móvil nativa, integraciones). Ahí la API deja de ser interna y el BFF pasa a ser un consumidor más, no la única puerta.

---

## 5. Render, y no Cloudflare / Fly / Kubernetes

**Render por una razón que suena poco técnica y es la correcta: es el que exige menos operación para un proyecto sin clientes todavía.** Un blueprint (`render.yaml`) versionado, deploy automático por push, Postgres administrado, HTTPS y dominio incluidos. Cero servidores que parchear.

### Contra Cloudflare (Workers + D1/Hyperdrive)

Es más rápido en el borde y tiene mejor observabilidad en el plan gratuito. **No sirve acá por una incompatibilidad de fondo:** Workers corre en un runtime de V8 aislado, no contenedores — no puede ejecutar un binario de Go. Habría que reescribir el backend en JavaScript o compilar a WASM, y con WASM el driver de Postgres y las goroutines dejan de comportarse igual.

Y D1 es SQLite: **no tiene exclusion constraints ni índices GiST**, o sea que rompe la sección 1 entera.

### Contra Fly.io

Sí corre contenedores y tiene mejor red global. Es una alternativa real, y probablemente la primera a considerar si Render deja de alcanzar. Se descartó por continuidad con Marcuzzi_Madryn y porque Postgres en Fly se administra más a mano.

### Contra Kubernetes

**Es la respuesta correcta a un problema que este proyecto todavía no tiene.** Kubernetes resuelve orquestar muchos servicios, escalado horizontal automático, despliegues progresivos y auto-reparación. Hoy hay **dos servicios y una base**, y el sistema corre en **una sola instancia**.

Adoptarlo ahora significaría administrar un cluster, su red, sus secretos y sus actualizaciones — trabajo de operación permanente a cambio de capacidades que no se usan. El costo no es el día que se instala: es todos los días después.

> **La señal para reconsiderarlo** no es "creció el tráfico": es **necesitar más de una instancia del backend**. Ese mismo umbral activa otros tres ítems pendientes de la auditoría (migrar el rate-limiter por IP a Redis, dimensionar el pool de conexiones, PgBouncer). Cuando aparezca, se revisan los cuatro juntos, no de a uno.

### Los dos servicios son públicos, y eso tiene consecuencias

En el blueprint, tanto `web` como `api` son `type: web`: los dos tienen URL propia en internet. Es lo natural en Render —los servicios privados son una feature de planes pagos— y no es un descuido, pero **cambia cómo hay que escribir el backend**: la API no puede confiar en nada que le llegue por el solo hecho de llegar, ni siquiera de "su propio" frontend.

Se cobró en la Fase 3.1.1 (TR-134). Para que el BFF pudiera decirle a la API cuál es la IP real del visitante, no alcanzaba con una cabecera: cualquiera puede pegarle a la URL pública y mandar la cabecera que quiera. Hizo falta un secreto compartido y una comparación en tiempo constante para algo que, con la API en una red privada, habría sido un dato más.

**La alternativa —API como servicio privado— es la solución más limpia** y quedó anotada: elimina la necesidad del secreto y reduce la superficie a un solo servicio expuesto. Se descartó porque exige plan pago y deja la API sin URL para debug. Es la primera mejora de topología a hacer cuando se pague un plan, antes que cualquier otra.

Mismo razonamiento, otra cara: como `APP_ENV` vale `development` incluso en Render (un solo entorno mientras dure el plan free, TR-021), **ningún guard de seguridad puede basarse en esa variable**. Por eso las comodidades de desarrollo se atan a que `APP_BASE_URL` apunte a localhost (TR-135), que es la única señal que no puede mentir sobre si la aplicación está expuesta.

### Qué se sacrifica hoy, y hay que tenerlo presente

- **El plan free de Postgres se borra solo a los 30 días.** Es deliberado mientras no haya clínicas reales, y hay que subir de plan **antes** del primer profesional — no después.
- **Observabilidad pobre.** Los logs del plan free son básicos y no hay métricas ni alertas. Por eso importa el logging estructurado en JSON (TR-124): el día que se enchufe un agregador, los logs ya tienen `request_id`, `clinic_id`, status y latencia.
- **Los servicios se duermen por inactividad**, y el primer request después paga el arranque.

### Qué cambiaría la decisión

Primero **el primer cliente que paga**: ahí hay que subir de plan y armar backups, se use Render o no —y con el plan pago, pasar la API a servicio privado—. Después, **más de una instancia**: ese es el momento de mirar Fly, Kubernetes gestionado, o el plan pago de Render con escalado.

---

## 6. Docker en los tres entornos

Local (`docker compose`), CI y producción corren **las mismas imágenes**, con **Postgres 16** en los tres. No es purismo: es lo que hace que un bug se reproduzca donde se lo puede investigar.

Vale la pena porque este sistema depende de detalles específicos del motor —`btree_gist`, tipos de rango, índices parciales, códigos SQLSTATE— que con SQLite en tests y Postgres en producción simplemente no se pueden probar.

Y ya evitó incidentes reales: la subida a Go 1.26 (TR-128) se verificó con un `docker compose build` de verdad, porque `go.mod` y el `Dockerfile` fijan la versión por separado y **desincronizarlos es el error clásico de ese cambio**.

### Qué se sacrifica

Builds más lentos y la necesidad de tener Docker corriendo para desarrollar.

---

## 7. Monorepo con pnpm

Backend, frontend y tipos compartidos en un repo, con `packages/shared-types` como contrato entre Go y TypeScript.

**Por qué importa acá:** cuando cambia la forma de un `Turno`, el frontend deja de compilar. Con dos repos, ese desajuste se descubre en runtime, en producción, o —peor— no se descubre y algo se muestra mal.

**pnpm y no npm** por el enlazado de dependencias entre paquetes del workspace (`workspace:*`) y por no duplicar `node_modules`. El `Dockerfile` del frontend usa la raíz del repo como contexto justamente porque el build depende de ese paquete compartido.

### Qué cambiaría la decisión

Cuando haya equipos distintos con ciclos de release independientes. Con un desarrollador, el monorepo es puro beneficio.

---

## 8. Tests contra Postgres real, y no mocks

Cada test corre contra un Postgres de verdad, en su propia transacción revertida.

**No es purismo, es necesidad:** la garantía central del producto es un exclusion constraint del motor. Un mock de la capa de datos **no puede** probarlo — devolvería lo que el mock decida. Lo mismo vale para los índices parciales, el comportamiento de los deadlocks y el rollback de DDL.

El costo es una suite más lenta (unos 40 segundos, y creció con las foreign keys) y la necesidad de tener Postgres levantado. A cambio, los tests fallan por los motivos por los que fallaría producción — y de hecho encontraron varios bugs reales de concurrencia y de orden de migraciones que un mock habría tapado.

Con red de seguridad: `TEST_DATABASE_URL` **tiene que terminar en `_test`**, verificado en código, para que nunca sea posible correr la suite contra la base de desarrollo o producción.

---

## 9. Sesiones en base, y no JWT ni Redis

**Contra JWT stateless:** un JWT robado sigue siendo válido hasta que expira, y no hay forma de cortarlo. Con una fila en `sessions`, **un logout revoca de verdad** — y se pueden revocar todas las sesiones de un usuario tras un cambio de contraseña. Para un sistema con datos de salud, poder cortar el acceso ya emitido no es opcional (TR-037).

**Contra Redis para cachear la sesión:** se evaluó y se descartó **midiendo**. La consulta busca por `token_hash`, que tiene índice único: una búsqueda directa sobre un dato que Postgres mantiene caliente. Redis ahorraría muy poco y sumaría un servicio que operar, monitorear y que puede caerse, más un problema de invalidación que hoy no existe.

> Y lo más útil que salió de medir: **la consulta cara era otra**. `requireClinic` resuelve la clínica del usuario en cada request y no usaba índice. Se arregló con un índice compuesto, en una hora, sin sumar infraestructura (TR-127).

Redis vuelve a la mesa para el rate-limiter por IP, que hoy vive en memoria del proceso — y solo cuando haya más de una instancia.

---

## 10. Resumen: qué activaría cada cambio

| Decisión | Se revisa cuando… |
|---|---|
| PostgreSQL | Nunca, de forma realista: tres mecanismos centrales no existen en MySQL |
| Go | El producto vire a procesamiento de datos / ML |
| GORM | El bloque de SQL crudo de `migrate.go` supere al `AutoMigrate` |
| Next.js + BFF | Haya que exponer una API pública (app nativa, integraciones) |
| Render | **Primer cliente que paga** → subir plan + backups + **API a servicio privado**. **Más de una instancia** → mirar Fly / Kubernetes |
| Kubernetes | Haga falta más de una instancia del backend. Se revisa junto con Redis, pool y PgBouncer |
| Docker | Nunca; el costo es bajo y el beneficio de paridad, alto |
| Monorepo | Equipos separados con releases independientes |
| Postgres en tests | Nunca mientras la regla central sea un constraint del motor |
| Sesiones en base | Nunca; Redis vuelve solo para el rate-limiter por IP |

**Lo urgente hoy no es ninguna de estas decisiones**, sino una consecuencia de la última: no hay sistema de backups y el plan free de Postgres se borra solo a los 30 días. Ver `docs/Seguridad y optimizacion/snapshot-2026-09-09.md`.

---

*Escrito el 2026-09-09. `dental-mirage-spec.md` §9.1 fija el stack; `tradeoffs.md` registra las decisiones de producto y feature; este documento cubre las decisiones de plataforma, que están debajo de todas ellas. Actualizar cuando alguna de las condiciones de la tabla de arriba se cumpla — y dejar escrito qué se decidió entonces.*
