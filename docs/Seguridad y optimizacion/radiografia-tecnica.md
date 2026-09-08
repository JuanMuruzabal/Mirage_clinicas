# Radiografía técnica del sistema

**Dental Mirage · Auditoría interna de ingeniería — v2, pasada completa por módulo**

Complejidad, seguridad, rendimiento y qué hay que resolver antes de pasar de "una clínica probando" a "N profesionales, N clínicas, tráfico real". Segunda pasada, esta vez módulo por módulo, sin dejar nada sin mirar: los 12 paquetes de `apps/api` completos (49 archivos de producción) y los archivos más grandes/sensibles de `apps/web`. Corrige un error de la v1 (headers de seguridad) y suma el hallazgo más serio de toda la revisión.

- **Alcance:** apps/api (Go, 12 paquetes / 49 archivos) + apps/web (Next.js)
- **Fecha:** 2026-09-08
- **Método:** lectura completa de cada módulo + grep dirigido — sin herramientas de SAST automatizadas, no reemplaza un pentest

## Índice

1. [Autenticación y sesiones](#01-autenticación-y-sesiones)
2. [El formulario público](#02-el-formulario-público--el-código-más-denso-del-sistema)
3. [CRUD del panel autenticado](#03-crud-del-panel-autenticado)
4. [Esquema y migraciones](#04-esquema-y-migraciones)
5. [Infraestructura y dependencias externas](#05-infraestructura-y-dependencias-externas)
6. [Frontend](#06-frontend)
7. [Complejidad de código](#07-complejidad-de-código)
8. [Optimización](#08-optimización)
9. [¿Y Redis?](#09-y-redis)
10. [Antes de N profesionales, N clínicas](#10-antes-de-n-profesionales-n-clínicas)
11. [Plan de acción](#11-plan-de-acción)

---

## 🔴 Hallazgo #1 — el más serio de toda la revisión

### `clientIP()` confía en X-Forwarded-For sin validar — de esa función depende casi toda la capa anti-abuso

`X-Forwarded-For` es un header que **cualquier cliente puede escribir directamente** en su propia request — no es exclusivo de un proxy confiable. `clientIP()` toma el primer valor tal cual llega y lo usa, sin verificar que la conexión real venga de un proxy de confianza (Render/Cloudflare) que lo haya sobreescrito antes.

De esa única función dependen: el `IPLimiter` completo (rate-limit de login/registro/reset), y los **tres detectores de abuso del formulario público** — tope de turnos sin verificar por DNI+tipo, bloqueo de mail con muchos DNIs, y el detector de "rotación por IP" que es la pieza más sofisticada de todo el sistema anti-fraude. Un atacante que sepa esto puede mandar un header falso y (a) evadir por completo la detección de rotación variando la IP declarada en cada request, o (b) **usar la IP de una persona real** para hacer que el sistema la bloquee a ella en vez de a sí mismo.

**Lo notable: el propio equipo ya lo sabe.** Hay un comentario real en el código reconociendo el riesgo exacto — pero la mitigación que se aplicó (separar el cupo por clínica) resuelve solo que el daño no cruce de una clínica a otra, no el problema de fondo.

> `apps/api/internal/http/auth.go:145-157` (`clientIP`) · usado en `turno_publico.go`, `verificacion_turno_publico.go`, `mis_turnos_publico.go`, `auth.go` — el comentario que reconoce el riesgo está en `verificacion_turno_publico.go:122-126`

---

## Veredicto

Tras la pasada completa se sostiene lo de la v1 — la arquitectura de fondo es sólida y está escrita con un nivel de cuidado genuinamente alto (cada decisión de negocio viene con su "por qué" y el escenario de ataque que previene). Argon2id bien parametrizado, SQL parametrizado en el 100% de los casos revisados, aislamiento entre clínicas consistente en cada uno de los ~20 puntos donde lo verifiqué a mano, CSP con nonce por request correctamente resuelta (esto lo tenía mal en la v1 — ver la corrección más abajo).

Pero esta pasada más profunda encontró algo que la primera no: un problema de fondo en la señal que sostiene toda la capa anti-abuso (arriba), más un patrón que se repite en los dos lados del stack — el mismo cuidado en la lógica de negocio no se extendió todavía a los límites de recursos (tamaño de body, timeouts de conexión, paginación) que importan cuando el tráfico deja de ser de prueba.

| Bloqueante real | Alto impacto | A vigilar | Ya está bien |
|---|---|---|---|
| 1 | 7 | 6 | 12 |

> **Corrección sobre la v1 de este informe:** dije que faltaban headers de seguridad HTTP en el frontend porque busqué solo en `next.config.ts`. Están, y están bien hechos — en `apps/web/src/middleware.ts`: CSP con nonce por request (resolviendo un bug real de hidratación de RSC que tuvieron en producción), HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors. Ver sección 06.

---

## 01. Autenticación y sesiones

`internal/auth`, `internal/security`, `internal/http/auth.go` (1084 líneas, leído completo) — el módulo más sensible del sistema, y el que está mejor escrito.

**✅ Ya está bien — argon2id + migración transparente desde bcrypt.** Parámetros conservadores (m=19MiB, t=2, p=1 — el mínimo aceptable de OWASP, documentado como "ajustar según el hosting real"), comparación en tiempo constante, rehash perezoso al login exitoso. `internal/security/password.go`.

**✅ Ya está bien — anti-enumeración cuidada, con sus excepciones documentadas.** Mensajes genéricos en registro/reset por default; las únicas dos veces que se revela más (mail ya existente y verificado; login con mail sin verificar) están explícitamente confirmadas con el cliente como decisión de producto, no un descuido — TR-062.

**✅ Ya está bien — backoff progresivo + rate-limit por cuenta Y por IP en login.** 2^N segundos de backoff tras fallos consecutivos, límite duro por cuenta en Postgres, límite por IP en memoria — la combinación cubre tanto "un atacante contra una cuenta" como "un atacante rotando cuentas desde la misma IP".

**✅ Ya está bien — HaveIBeenPwned con k-anonymity real, fail-open documentado.** Solo manda 5 caracteres del hash SHA-1 (nunca la contraseña ni el hash completo), y si el servicio de terceros falla, no bloquea el registro — decisión consciente, no un bug. `internal/security/pwned.go`.

**✅ Ya está bien — OAuth de Google: state firmado con HMAC + comparación en tiempo constante.** Nonce de 16 bytes CSPRNG, TTL de 10 minutos autocontenido en el propio state, `subtle.ConstantTimeCompare` para la firma. `oauthstate.go`.

**🟠 Alto — el secret que firma el state de OAuth cae a un valor hardcodeado si falta la env var.** `JWT_SECRET` (nombre heredado, hoy solo firma el `state` de OAuth) tiene como fallback el string literal `"dev-secret-cambiar-en-produccion"`, público en el repo. Si por un typo en el nombre de la variable en Render el arranque no la recibe, el backend arranca igual, en silencio, firmando states con un secret que cualquiera puede leer en GitHub — en vez de fallar el arranque. Un secret crítico debería frenar el proceso si falta, no degradar a un valor conocido.
> `apps/api/internal/config/config.go:66`

**🟡 A vigilar — cada request autenticado paga 2 consultas a Postgres antes de cualquier trabajo real.** Detallado en la sección 08 (Optimización) — `requireSession` + `requireClinic` encadenados, y la segunda query no usa bien su único índice.

## 02. El formulario público — el código más denso del sistema

`internal/http/turno_publico.go`, 1.504 líneas, leído completo — sin autenticación, es la superficie más expuesta de toda la API. Es también, con diferencia, el código con el modelado de amenazas más sofisticado de todo el proyecto: cada regla de negocio documenta qué ataque previene y qué falso positivo evita gatillar.

**✅ Ya está bien — 4 capas de detección de abuso, cada una resolviendo el hueco que deja la anterior.** Tope de 1 turno activo por DNI (regla universal) → tope de turnos sin verificar por DNI+tipo → mail con más de 2 DNIs distintos → rotación por IP (mails Y DNIs distintos, ambos, para no confundir con el detector de mail). Cada límite tiene su número justificado con el caso legítimo que no debe romper (dos convivientes, una familia numerosa con el mismo tutor).

**✅ Ya está bien — IDOR real, ya encontrado y cerrado por el propio equipo.** El endpoint que emite la "tarjeta clickeable" de `pacienteVerificadoId` exigía responder al mail — pero al **consumir** ese ID en el pedido final no se repetía el chequeo. Un ID ajeno (UUID v4, no adivinable, pero persistido en localStorage hasta 30 min) alcanzaba para reservar a nombre de cualquier paciente ya verificado de la clínica. Corregido: se revalida `pacienteRespondeAlMail`/`pacienteTieneTutorConMail` también al consumir.

**✅ Ya está bien — revalidación de horario dentro de la misma transacción.** El exclusion constraint de Postgres es la garantía final, pero antes de llegar ahí se vuelve a calcular disponibilidad real dentro de la transacción — convierte una carrera en un mensaje legible ("elegí otro horario") en vez de un 500 crudo.

**🔴 Bloqueante — los 4 detectores de arriba dependen enteramente de `clientIP()`.** Es el mismo hallazgo #1, en el lugar exacto donde más pesa: toda esta arquitectura de detección tan bien pensada pierde su señal más fuerte (la IP) si no se valida de dónde viene el header.

**🟠 Alto — `decodeJSON` no limita el tamaño del body, en el único endpoint sin sesión que acepta POST público.** Ni acá ni en ningún otro handler hay un `http.MaxBytesReader`. Un POST con un body de varios MB/GB en el campo `motivo` (o cualquier campo string) se decodifica completo en memoria antes de validar nada — DoS trivial contra el endpoint público, sin necesitar credenciales.
> `apps/api/internal/http/router.go:131-134` (`decodeJSON`) — afecta a todos los POST/PATCH del backend, no solo a este archivo

## 03. CRUD del panel autenticado

`turnos.go` (1.503 líneas), `pacientes.go`, `pacientes_conflicto_panel.go`, `tipos_consulta.go`, `onboarding.go`, `seguridad_turno_publico.go` — leídos completos o con cada lookup por id verificado a mano. Es la superficie donde más me preocupaba encontrar un bug de aislamiento entre clínicas.

**✅ Ya está bien — la más importante de esta sección: aislamiento entre clínicas consistente en cada punto verificado.** Revisé cada `Where("id = ?", ...)`/`First(&x, "id = ?")` de todo `internal/http` (más de 20 sitios): en cada handler que resuelve un registro directo desde un id del request, el filtro `profesional_id`/`clinic_id` siempre está. Los pocos casos sin ese filtro explícito navegan desde un registro **padre** ya resuelto con el filtro correcto (ej. `turno.PacienteID` tras haber traído `turno` por `id + profesional_id`) — seguro por construcción, no por descuido. También confirmé, contando handlers vs. llamadas a `profesionalIDFromRequest`, que ningún handler autenticado se salta la resolución del tenant.

**✅ Ya está bien — sin FK a nivel de base, pero con topes explícitos y batch queries, no N+1.** `crearOBuscarPacientePorDNI` corrige activamente un bug real reportado por el cliente (el turno mostraba datos tipeados en vez de los reales de la ficha ya existente). `tutoresPorPaciente`/`alternativosDeContactoPorPaciente` traen todo en una query con `JOIN`, nunca una consulta por fila.

**🟠 Alto — sin ninguna foreign key real en todo el esquema.** Ningún `ProfesionalID`/`PacienteID`/`ClinicID`/`TipoConsultaID` tiene un `REFERENCES` a nivel de Postgres — son columnas `uuid` sueltas con índice, nunca una constraint real. Hoy la integridad referencial (y el aislamiento entre clínicas) depende **100% de que el código nunca tenga un bug** — lo cual, por ahora, es cierto (ver el hallazgo de arriba), pero es un colchón que no existe. No hace falta renunciar al criterio de "nunca borrar turnos" para tener esto: `ON DELETE SET NULL`/`RESTRICT` logran lo mismo con una red de seguridad real debajo.
> `apps/api/internal/db/models.go` — ningún `gorm:"foreignKey:..."` salvo la relación many2many de especialidades

**🟠 Alto — sin paginación en /turnos ni /pacientes, confirmado en el código.** `listTurnosHandler`: la query completa con todos sus filtros (`estado`/`q`/`desde`/`hasta`/`tipoConsultaId`/`verificacion`) termina en `.Find(&turnos)` sin `Limit`. El calendario (frontend) sí acota por rango de fechas visible — este hallazgo es específico de la vista de **lista** de Turnos y de Pacientes.
> `apps/api/internal/http/turnos.go:216-220`

## 04. Esquema y migraciones

`internal/db/migrate.go` (419 líneas, leído completo) — probablemente el archivo con la disciplina más alta de todo el proyecto: cada migración cruda documenta qué corrige y por qué, con un advisory lock genuinamente bien razonado para las corridas paralelas de test.

**✅ Ya está bien — exclusion constraint + advisory lock para migraciones concurrentes.** `EXCLUDE USING gist` para el no-solapamiento (la regla no negociable del proyecto) a nivel de base, no solo de aplicación. El `pg_advisory_xact_lock` serializa `RunMigrations` entre paquetes de test corriendo en paralelo — encontrado y corregido tras un bug real de CI, no especulativo.

**✅ Ya está bien — índices únicos parciales bien pensados.** `(profesional_id, dni) WHERE NOT en_conflicto`, `(clinic_id) WHERE alcance = 'general'` — resuelven exactamente la regla de negocio ("único salvo mientras hay un conflicto sin resolver") sin necesitar lógica extra en la aplicación.

**🟡 A vigilar — el bloque de deduplicación de pacientes escanea toda la tabla en cada arranque, para siempre.** Un `GROUP BY profesional_id, dni HAVING COUNT(*) > 1` sobre toda la tabla `pacientes`, sin ningún guard de "ya se hizo, no repetir" — corre en cada `RunMigrations` (cada deploy/reinicio del contenedor `migrate`), para siempre. Con pocos pacientes es instantáneo; con miles/millones (N clínicas, años de historial) se vuelve una operación de arranque cada vez más lenta sin necesidad, porque después de la primera vez nunca vuelve a encontrar nada. Conviene convertirlo en una migración versionada de una sola vez.
> `apps/api/internal/db/migrate.go:241-261`

**🟡 A vigilar — el patrón "DROP COLUMN sin migrar datos" es aceptable hoy solo porque no hay producción real.** Varias migraciones (columnas Tutor* de Paciente, TutorDNI, el DELETE de turnos `pendiente`) son destructivas, justificadas explícitamente con "sin pérdida de datos real, no hay producción todavía". Es la decisión correcta **ahora** — pero es un hábito que hay que cortar activamente el día que exista un solo cliente con datos reales pagando: a partir de ahí, ninguna migración destructiva debería aplicarse sin una migración de datos previa y, idealmente, un snapshot.

## 05. Infraestructura y dependencias externas

`internal/ratelimit`, `internal/mail`, `internal/turnstile`, `internal/googleauth`, `internal/storage`, `internal/clock`, `router.go` — todos leídos completos.

**✅ Ya está bien — patrón dev/prod nil-safe, consistente en las 5 dependencias externas.** Turnstile, Google, Pwned, Mail, Storage: todas con una interfaz + implementación no-op de desarrollo, activadas por env var, nunca un `nil` sin manejar. `internal/clock` fija `America/Argentina/Cordoba` con `time/tzdata` embebido — funciona aunque el contenedor de deploy no tenga la base de zonas horarias instalada.

**✅ Ya está bien — protección explícita contra path traversal en el storage local.** `filepath.Base(filename)` antes de escribir a disco — la única superficie de archivos del backend. (Nota aparte, no un hallazgo: esta feature de foto de perfil está fuera de alcance del MVP — cuando se active, va a necesitar límite de tamaño y validación real de MIME type, ninguno de los dos existe todavía porque no hace falta hoy.)

**✅ Ya está bien — `middleware.Timeout(30s)` + `middleware.Recoverer` en el router.** Corrige algo que había reportado mal en la v1: sí hay un timeout de procesamiento (cancela el contexto de la request a los 30s), y un panic en cualquier handler no tumba el proceso completo, solo esa request.

**🟠 Alto — ese timeout protege el procesamiento, no la conexión: sigue faltando ReadHeaderTimeout.** `middleware.Timeout` corre **después** de que el handler ya arrancó — no protege contra un cliente que manda los headers de la request muy lentamente (Slowloris ataca justo esa fase). Eso sigue necesitando un `http.Server{}` explícito con `ReadHeaderTimeout`/`ReadTimeout`, en vez de `http.ListenAndServe` directo.
> `apps/api/cmd/api/main.go:49`

**🟡 A vigilar — logging casi inexistente fuera de las queries lentas de GORM.** GORM sí loguea queries >200ms — pero eso es logging de infraestructura de datos, no de aplicación. Solo 2 archivos de `internal/http` usan `log.*`; sin request-id/clinic_id/latencia por endpoint, diagnosticar un incidente puntual entre N clínicas es mucho más lento de lo necesario.

## 06. Frontend

`middleware.ts`, `lib/session.ts`, `lib/api.ts`, `next.config.ts` completos; componentes grandes del panel revisados por muestreo.

**✅ Ya está bien — corrige la v1 de este informe: CSP con nonce por request, HSTS, X-Content-Type-Options, Referrer-Policy.** Todo en `middleware.ts`, cubriendo la app entera. El nonce dinámico en `script-src` (en vez de `unsafe-inline`) resuelve un bug real que tuvieron en producción — sin nonce, la CSP bloqueaba los `<script>` inline que el propio App Router de Next.js inyecta para hidratar, rompiendo toda la app. `connect-src`/`frame-src` acotados a los 2 orígenes externos reales (Google, Turnstile) — todo lo demás pasa por Server Actions same-origin.

**✅ Ya está bien — cleanup correcto en efectos async del calendario.** Patrón `let activo = true; ...; return () => { activo = false }` antes de cada `setState` post-fetch — evita el warning/leak clásico de actualizar estado de un componente ya desmontado. El calendario acota sus queries al rango de fechas visible, no trae todo el historial (a diferencia de la vista de lista de Turnos, sección 03).

**🟠 Alto — el fetch del BFF hacia la API Go no tiene timeout.** `request()` en `lib/api.ts` no usa `AbortSignal.timeout(...)`. Si el backend se cuelga o responde muy lento — incluido el propio escenario de saturación que describe la sección 08 — cada Server Action/Server Component que dependa de él queda esperando sin un corte propio, en vez de fallar rápido y liberar el recurso.
> `apps/web/src/lib/api.ts:50-60`

**🟡 A vigilar — `cache: "no-store"` universal: correcto para datos de sesión, desperdicia catálogos casi estáticos.** Toda llamada al backend pasa `cache: "no-store"`, incluidos endpoints como el catálogo global de especialidades, que cambia rarísima vez. Es la opción segura por default (nunca sirve datos de otro usuario por error), pero hay margen real de cache con revalidación por tiempo en los pocos endpoints verdaderamente públicos/estáticos.

## 07. Complejidad de código

El mismo patrón en los dos lados del stack: la lógica en sí está muy bien razonada, pero varios archivos/componentes ya pasaron el punto de "se puede tener completo en la cabeza".

| Archivo | Líneas | Qué mezcla |
|---|---|---|
| `turno_publico.go` | 1.504 | Un único handler de **655 líneas** (`solicitarTurnoPublicoHandler`) con validación + 4 detectores de abuso + verificación de identidad + conflictos + persistencia + mail. |
| `turnos.go` | 1.503 | CRUD completo de turnos, reprogramación, cancelación, autoreservar, limpieza de pacientes huérfanos. |
| `auth.go` | 1.084 | Registro, login, Google OAuth, reset de password, verificación de mail — cada uno con su propio rate-limit. |
| `pedir-turno-form.tsx` | 1.306 | El wizard público completo del lado del cliente — todos los pasos, los 4 flujos (primera vez/verificado × para mí/para otro) y el camino por enlace, en un solo componente. |
| `configuracion-calendario-modal.tsx` | 879 | Horario de atención + reglas generales/específicas + tipos de consulta, las 3 secciones del modal de configuración. |
| `calendar-view.tsx` / `calendar-grid.tsx` | 855 / 830 | Estado del calendario + geometría de columnas/scroll — candidatos naturales a separar contenedor de presentación. |

El comentario inline en todos estos archivos es excelente y realmente mitiga el riesgo de perderse — pero no reemplaza poder auditar una función de punta a punta sin scrollear 20 pantallas. Recomendación concreta para el backend: seguir el patrón que ya usaron para separar `paciente_conflicto_publico.go` del resto, aplicado a los otros dos archivos gigantes.

## 08. Optimización

**✅ Ya está bien — índices pensados para los patrones de consulta reales.** Compuestos para los 3 detectores de abuso, único en `token_hash` de sesión, el parcial de DNI ya mencionado. El cálculo de disponibilidad trae horarios/bloqueos/turnos en un puñado de queries y resuelve el resto en memoria — sin N+1.

**🟠 Alto — cada request autenticado paga dos consultas a Postgres antes de cualquier trabajo real.** `requireSession` (por `token_hash`, índice único, rápida) + `requireClinic` (`ClinicMember` por `user_id`+`role`) — dos *round-trips* secuenciales en cada carga de página del panel Y en cada llamada de Server Action. La segunda es el problema real: el único índice de `ClinicMember` es compuesto `(clinic_id, user_id)`, pero la consulta filtra por `user_id` solo — no es la columna líder del índice, así que Postgres probablemente no lo usa bien. Con pocas filas no se nota; con miles de clínicas, se vuelve un *sequential scan* silencioso en cada request.
> `apps/api/internal/http/middleware.go` — `requireSession`+`requireClinic`; índice en `models_auth.go`, `ClinicMember`

**🟠 Alto — sin paginación en los listados principales** (repetido de la sección 03, es la misma causa raíz).

**🟡 A vigilar — pool de conexiones fijo por instancia.** `SetMaxOpenConns(20)` — correcto para una instancia; al sumar instancias, la suma se acerca rápido al límite por defecto de Postgres (~100).

## 09. ¿Y Redis?

Repregunta del cliente sobre la v1: la preocupación real no era escalar a varias instancias, sino el costo de pegarle a Postgres en cada request solo para autenticar. Con la sección 08 ya confirmado eso — acá la respuesta completa.

| | |
|---|---|
| **Sesiones (validar token) → Postgres alcanza** | Índice único sobre `token_hash`: la búsqueda es O(1), no un table scan. El costo real es la latencia de red del round-trip, no la query en sí. |
| **Resolver la clínica (ClinicMember) → esta es la que pesa** | Filtra por una columna que no es la líder de su único índice — la candidata real a cachear (con invalidación al cambiar de rol/clínica) o a resolver con un índice dedicado `(user_id, role)`, mucho más barato que meter Redis solo para esto. |
| **Rate-limit por IP → acá sí, el día que escalen** | Es la única pieza que vive en memoria de un solo proceso y deja de funcionar bien con más de una instancia — `INCR`+`EXPIRE` atómico de Redis es la herramienta estándar. |
| **Lo que NO arregla clientIP()** | Redis no resuelve el hallazgo #1 — eso es un problema de validar el origen del header, no de dónde se guarda el contador. |

**Conclusión, actualizada:** un índice nuevo `(user_id, role)` en `ClinicMember` es la mejora de más impacto por menos esfuerzo de todo este informe — resuelve la query que hoy paga cada request sin sumar ninguna infraestructura. Redis sigue reservado para el rate-limiter por IP, específicamente el día que corran más de una instancia — no antes, y no como solución al costo de autenticar cada request (eso se arregla con el índice).

## 10. Antes de N profesionales, N clínicas

- **Arreglar clientIP()** antes que cualquier otra cosa de esta lista — valida el origen real de `X-Forwarded-For` (o usá el header específico que exponga Render/Cloudflare para la IP real) antes de confiar en él para rate-limit o detección de abuso.
- **Sumar el índice `(user_id, role)` a ClinicMember** — barato, y es lo que paga cada request autenticado hoy.
- **Foreign keys reales** como red de seguridad adicional al aislamiento por código, que hoy es consistente pero no está garantizado por la base.
- **Paginación real** en los listados de turnos/pacientes.
- **Límite de tamaño de body** (`http.MaxBytesReader`) + `ReadHeaderTimeout` en el servidor — cierran juntos la superficie de DoS más barata contra el endpoint público.
- **Rate-limit distribuido (Redis)** el día que escalen a más de una instancia — no antes.
- **Tests de aislamiento cross-tenant** en CI — la disciplina manual es consistente hoy, pero no hay nada automatizado que la sostenga cuando más gente toque el repo.
- **Cortar el hábito de migraciones destructivas sin backup** apenas exista el primer cliente con datos reales.
- **Backups automáticos de Postgres** — infraestructura (Render), fuera del alcance del código; confirmarlo aparte.

## 11. Plan de acción

Reordenado desde la v1: el hallazgo crítico ahora encabeza la Fase A.

### Fase A — Antes de cualquier otra cosa (esta semana)

1. **Arreglar clientIP()** — validar que `X-Forwarded-For` venga de un proxy confiable, o cambiar a un header específico y garantizado del proveedor de hosting. *(medio día, con testing cuidadoso)*
2. **Límite de tamaño de body** en `decodeJSON` (`http.MaxBytesReader`). *(1-2 horas)*
3. **ReadHeaderTimeout/ReadTimeout** en un `http.Server{}` explícito, en vez de `ListenAndServe` directo. *(15-30 min)*
4. **Fail-fast si falta JWT_SECRET en producción** — nunca degradar al valor hardcodeado. *(30 min)*

### Fase B — Antes de sumar mucha más funcionalidad (próximas 1-2 semanas)

1. **Índice `(user_id, role)` en ClinicMember** — el de mejor relación impacto/esfuerzo de todo el informe. *(1 hora + migración)*
2. **Paginación real** en `/turnos` y `/pacientes` (backend + frontend). *(2-3 días)*
3. **Timeout en el fetch del BFF** (`lib/api.ts`) hacia la API Go. *(1 hora)*
4. **Logging estructurado mínimo** (request-id, clinic_id, status, latencia). *(1 día)*
5. **Partir turno_publico.go, turnos.go y pedir-turno-form.tsx** por sub-responsabilidad, refactor puro apoyado en los tests existentes. *(3-5 días)*
6. **Tests de aislamiento cross-tenant** en CI. *(1-2 días)*
7. **Migrar la deduplicación de pacientes** a una migración versionada de una sola vez. *(medio día)*

### Fase C — Al escalar horizontalmente o sumar clientes reales (cuando el tráfico/riesgo lo justifique)

1. **Foreign keys reales** en el esquema, como red de seguridad adicional.
2. **Migrar el IPLimiter a Redis** — recién con más de una instancia del backend.
3. **Ajustar el pool de conexiones / sumar PgBouncer** según cuántas instancias corran.
4. **Cortar de raíz las migraciones destructivas sin backup** apenas exista el primer cliente pagando.

---

*Método: lectura completa de los 12 paquetes de `apps/api` (49 archivos de producción) y de los archivos más grandes/sensibles de `apps/web`, más grep dirigido para confirmar patrones (aislamiento por tenant, uso de `clientIP`, filtros de paginación) en el resto. No reemplaza un pentest ni una herramienta de SAST automatizada.*
