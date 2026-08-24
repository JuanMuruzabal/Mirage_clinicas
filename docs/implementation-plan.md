# Plan de Implementación — Dental Mirage

> Basado en `dental-mirage-spec.md`. Cubre desde el arranque del proyecto (repo vacío) hasta el cierre del MVP (spec §2), con la Fase 2 (lo explícitamente fuera de alcance de §2) resumida como backlog.
>
> Reutiliza el modo de trabajo y stack ya validados en `Marcuzzi_Madryn` (spec §9, "resuelto, no a evaluar"). Este documento no vuelve a discutir Go/chi/GORM/Next.js/Postgres/BFF/monorepo pnpm — eso ya está decidido. Lo que sí resuelve acá es lo que la spec deja abierto en su sección 7, necesario para poder planificar sin bloquearse; esas posturas están registradas como supuestos en `docs/tradeoffs.md` y deben confirmarse con el cliente antes de blindar el Sprint 2 (calendario) y el Sprint 3 (formulario público).

---

## 1. Resumen y objetivo

Producir un plan accionable, ordenado por dependencias, para construir Dental Mirage: onboarding de profesional individual → selección de servicio (gestión de clínica / página pública) → módulo de gestión de clínica (calendario sin solapamientos, turnos entrantes, pacientes) → editor/deploy de página pública con plantilla fija → buscador público de clínicas — sobre el stack y arquitectura ya fijados en la spec (sección 9).

---

## 2. Arquitectura (resumen ejecutable)

| Área | Elección para este plan | Fuente |
|---|---|---|
| Backend | Go + chi (router) + GORM, servicio independiente `apps/api` | Spec §9.1 |
| Frontend | Next.js + TypeScript + Tailwind, `apps/web` — leer el `AGENTS.md` que genera Next antes de escribir código | Spec §9.1 |
| Base de datos | PostgreSQL + extensión `btree_gist` | Spec §9.1 |
| Monorepo | `pnpm` — `apps/api`, `apps/web`, `packages/shared-types` | Spec §9.1 |
| Auth | JWT propio (bcrypt + middleware chi), cookie `httpOnly` de sesión | Spec §9.3; TR-005 (sin OAuth en MVP) |
| WhatsApp (envío inicial del formulario público) | Link `wa.me` con mensaje prellenado, generado client-side | TR-003 |
| WhatsApp/SMS (recordatorios futuros) | Interfaz dev/prod (`internal/notificaciones`), no implementada en MVP | Spec §9.4 |
| Storage / Email | Mismo patrón interfaz + dev (local/log) + prod (env var), aunque el MVP no tiene fotos ni emails transaccionales obligatorios — se deja el esqueleto listo si Sprint 4/5 lo necesita | Spec §9.4 |
| Deploy | Mismo target que Marcuzzi_Madryn (a confirmar: Vercel front + Railway/Fly.io API + Neon/Supabase Postgres) | Análogo a Marcuzzi, no fijado por la spec de Dental Mirage — confirmar en Sprint 5 |

No hay Opción A/B que evaluar acá (a diferencia de Marcuzzi): el stack ya viene fijado por decisión explícita del cliente (spec §7, punto 6, "Resuelto").

### 2.1 Modelo de datos propuesto (no está en la spec — se define acá)

La spec de Dental Mirage no trae una sección de ERD como la de Marcuzzi (§5). Se propone el siguiente modelo mínimo para MVP, a validar en T0.3:

- **`profesional`**: datos personales, `nombre_clinica`, `slug` (único, deriva la ruta pública `/clinica-x`), credenciales de auth.
- **`especialidad`**: catálogo cerrado predefinido por Mirage (TR-004). `profesional_especialidad` es la tabla puente (N:M).
- **`tipo_consulta`**: catálogo por defecto seedeado (`Consulta general`, `Urgencia`), con color asociado — editable por el profesional al crear un turno, no un campo libre (TR-001).
- **`paciente`**: datos personales + DNI, vinculado a un `profesional` (no hay pacientes compartidos entre clínicas en el MVP).
- **`turno`**: `profesional_id`, `paciente_id` (nullable hasta que se agenda), `tipo_consulta_id`, `estado` (`pendiente` / `agendado` / `cancelada`), `rango_horario` (`tstzrange`, nullable mientras está `pendiente` — recién se fija en el modal de confirmación, spec §4.3), `motivo_consulta`, `origen` (`pagina_publica` / `manual`).
- **`pagina_publica`**: 1:1 con `profesional`. `oculta` (bool, modo mantenimiento), `deployada_en` (nullable — controla si aparece en el buscador público, spec §5.2), contenido de las 3 secciones fijas (turno / sobre nosotros / especialidades, spec §5.3).

**Constraint no negociable (spec §4.3):** `EXCLUDE USING gist` sobre `(profesional_id, rango_horario)` en `turno`, activo solo para filas con `estado = 'agendado'` (las `pendiente` no tienen `rango_horario` todavía — ver TR-006). Mismo mecanismo que `TR-005`/`TR-010` de Marcuzzi_Madryn, aplicado a horas en vez de días.

---

## 3. Estructura de archivos (monorepo)

```
/apps
  /web                    # Next.js — home, onboarding, panel de gestión, editor de página, sitio público
    /src/app
      page.tsx             # Home pública (01-home.png)
      /sumarse              # Flujo de alta: datos personales, especialidades, nombre de clínica
      /seleccionar-servicio # Pantalla "Gestioná tu clínica" / "Personalizá tu página" (02)
      /ingresar              # Login
      /perfil                # "Tu perfil"
      /panel                 # Gestión de clínica (sidebar retráctil)
        /general               # Dashboard
        /calendario            # 03-calendario.png
        /turnos                # Pedidos entrantes (04)
        /pacientes             # 04-turnos-pacientes-referencia.png
        /pagina                # Editor de página (05-editor-pagina.png)
      /buscar                # Buscador público de clínicas (§6)
      /[slug]                # Página pública de una clínica (/clinica-x)
      /actions               # Server Actions ("use server")
    /src/lib
      api.ts                # server-only, cliente HTTP hacia apps/api
      session.ts             # cookie httpOnly del JWT
  /api                    # Go (chi + GORM)
    /cmd/api                # entrypoint
    /cmd/migrate            # migraciones
    /internal
      auth                   # JWT (generar/parsear), sin lógica de dominio
      clock                  # clock.Today() fijado a America/Argentina/Cordoba (UTC-3)
      config
      db                     # modelos GORM + migración + exclusion constraint + seeds
      http                   # handlers HTTP, uno por dominio (auth.go, especialidades.go,
                              # clinicas.go, ...) — sin capa de servicio separada todavía;
                              # `profesionales`/`turnos`/`pacientes`/`paginas`/`busqueda` como
                              # paquetes propios (planeados originalmente acá) resultaron
                              # innecesarios mientras la lógica de cada handler es simple y
                              # vive junto a su ruta — se separan el día que un dominio lo
                              # justifique (más de un archivo de lógica, reglas compartidas
                              # entre handlers), no antes
      notificaciones          # interfaz WhatsApp/SMS dev(log)/prod — esqueleto, no usado en MVP (§9.4)
      storage / email          # mismo patrón interfaz dev/prod que Marcuzzi, esqueleto
      testdb                  # helper de test contra Postgres real
/packages
  /shared-types            # tipos TS espejo de los structs Go (a mano, mismo trade-off que TR-001 de Marcuzzi)
/docs
  dental-mirage-spec.md
  implementation-plan.md    # este documento
  tradeoffs.md
docker-compose.yml         # Postgres local
CLAUDE.md
```

Toda tarea que agregue código nuevo debe caer dentro de esta estructura; si una tarea necesita un directorio no listado acá, se agrega a esta tabla en el mismo PR.

---

## 4. Requisitos funcionales (FR) — mapeo a la spec

| ID | Requisito | Sección spec |
|---|---|---|
| FR-1 | Onboarding: alta de profesional individual, tags de especialidades, nombre de clínica, pantalla de selección de servicio | §3 |
| FR-2 | Autenticación (registro/login del profesional) + sesión | §3, §9.3 |
| FR-3 | Shell de gestión de clínica: sidebar retráctil fijo + dashboard General | §4.1, §4.2 |
| FR-4 | Calendario/agenda con regla de no-solapamiento (constraint DB) | §4.3 |
| FR-5 | Turnos entrantes: tabs Pendientes/Confirmadas/Canceladas/Todas, buscador, cancelar/editar | §4.4 |
| FR-6 | Pacientes: tabla + detalle (info, historial, turnos activos, placeholders) | §4.5 |
| FR-7 | Editor de página: layout panel de edición + preview en vivo, barra de acciones | §5.1, §5.2 |
| FR-8 | Plantilla pública base (turno / sobre nosotros / especialidades) en `/clinica-x` + modo mantenimiento | §5.3, §5.2 |
| FR-9 | Formulario público de pedido de turno → WhatsApp + registro `pendiente` simultáneo | §4.4 |
| FR-10 | Búsqueda pública de clínicas por nombre/profesional/especialidad | §6 |
| FR-11 | No funcionales: BFF sin excepciones, `clock.Today()` AR, testing gate 80%, pase de diseño deliberado | §9.3, §9.5, §9.6, §9.7 |

Todas las tareas de la sección 5 referencian estos IDs.

---

## 5. Fase 1 — MVP (Sprints 0 a 5, ≈ 9.5–10 semanas / 1 dev full-stack)

### Sprint 0 — Setup (3–5 días)

**Estado: ✅ completado y verificado (2026-08-22)** — build, vet, `golangci-lint` (0 issues) y `go test ./internal/... -race` con **83.4%** de cobertura corriendo contra Postgres real (T0.4); `pnpm typecheck/lint/build` limpios y `vitest --coverage` en **100%** del lado web. Detalle por tarea abajo.

| ID | Tarea | Depende de | Esfuerzo | Criterio de aceptación |
|---|---|---|---|---|
| T0.1 | ✅ Monorepo: `apps/web` (Next.js) + `apps/api` (Go, chi) + `packages/shared-types` | — | 1d | `apps/web` corre con `pnpm run dev:web`; `apps/api` corre con `pnpm run dev:api`; ambos exponen healthcheck (`GET /health` en la API, `GET /api/health` en el web) |
| T0.2 | ✅ PostgreSQL local (docker-compose, `btree_gist`) + GORM conectado | T0.1 | 0.5d | `apps/api` conecta y hace ping a la DB al arrancar — verificado con `go run ./cmd/migrate` contra el Postgres de `docker compose up -d` |
| T0.3 | ✅ Esquema inicial: `profesional`, `especialidad` (+ puente), `tipo_consulta` (seed: Consulta general / Urgencia, sembrado por profesional al registrarse — TR-001), `paciente`, `turno`, `pagina_publica` (modelo §2.1) | T0.2 | 2d | Migración aplica sin error; constraint `sin_solapamiento_turno` (`EXCLUDE USING gist` sobre `profesional_id, rango_horario`, solo `estado='agendado'`) probada con un insert que solapa (falla, `internal/db/migrate_test.go`) y con turnos `pendiente`/no solapados (no fallan) |
| T0.4 | ✅ CI: lint + typecheck + build + **test+coverage con gate 80%** en ambos lados, desde el día 1 | T0.1 | 1d | `.github/workflows/ci.yml` — pipeline falla si cualquiera de los dos coverage cae de 80% — activo desde el primer PR de código de negocio, no retrofit (ver TR-007). Verificado localmente: api 83.4%, web 100% |
| T0.5 | ✅ Auth backend (registro/login profesional, JWT, bcrypt) | T0.2, T0.3 | 1.5d | Login/registro funcional, password hasheado (bcrypt), JWT emitido por `apps/api`; slug de clínica único generado al registrarse (`internal/http/auth.go`, `internal/http/auth_test.go`) |
| T0.6 | ✅ `internal/clock.Today()` fijado a `America/Argentina/Cordoba` (UTC-3), `time/tzdata` embebido | T0.1 | 0.5d | Test unitario confirma la zona horaria independientemente del contenedor de deploy (`internal/clock/clock_test.go`) |

**Riesgo específico de este sprint (mitigado):** el exclusion constraint se probó con un insert real solapado (`TestRunMigrations_RechazaSolapamientoDeTurnosAgendados`) antes de construir cualquier UI sobre él — el requisito no negociable de la spec (§4.3) queda validado desde el día 1, no diferido hasta que sea costoso de arreglar (mismo riesgo R1 que en Marcuzzi_Madryn).

### Sprint 1 — Onboarding + Auth + selección de servicio (2 semanas)

**Estado: ✅ completado y verificado (2026-08-22)** — `pnpm typecheck/lint/build` limpios, `vitest --coverage` en **94.47%** (40 tests), y flujo end-to-end probado de verdad: registro con especialidades vía API → cookie de sesión → `/seleccionar-servicio` y `/perfil` renderizando datos reales del profesional. Backend ampliado con lo que este sprint necesitaba (catálogo de especialidades + `GET /especialidades` + `PATCH /me`), re-verificado completo: 81.2% de cobertura Go, `golangci-lint` 0 issues.

| ID | Tarea | FR | Depende de | Esfuerzo | Criterio de aceptación |
|---|---|---|---|---|---|
| T1.1 | ✅ Home pública (`01-home.png`) | FR-1 | T0.1 | 2d | Landing responsive, explica los dos servicios, CTA a `/sumarse`; copy adaptado del brief al Sistema Cascarón (TR-010) |
| T1.2 | ✅ Registro/login en frontend + sesión cookie `httpOnly` | FR-2 | T0.5 | 2d | Usuario puede registrarse, loguearse, cerrar sesión; `/seleccionar-servicio` y `/perfil` redirigen (307) a `/ingresar` si no hay sesión — verificado con curl sin cookie |
| T1.3 | ✅ Flujo de alta: datos personales → tags de especialidades (catálogo cerrado, TR-004) → nombre de clínica | FR-1 | T1.2, T0.3 | 3d | Opción "organización" **omitida** del flujo (TR-009), solo "particular" habilitado; especialidades quedan asociadas al profesional (`especialidadIds` en un único `POST /auth/register`, no pasos intermedios contra el backend) |
| T1.4 | ✅ Pantalla de selección de servicios (`02-seleccion-servicios.png`) + header con acceso a "Tu perfil" (ya no solo "Cerrar sesión") | FR-1 | T1.3 | 2d | Tras completar el onboarding, el header muestra "Tu perfil"; las dos tarjetas navegan a `/panel` y `/panel/pagina` (ambas construidas recién en Sprint 2/4 — el enlace ya apunta ahí) |
| T1.5 | ✅ "Tu perfil": datos personales + especialidades editables | FR-2 | T1.4 | 1.5d | Profesional puede editar nombre/teléfono/especialidades desde `/perfil` (`PATCH /me`, reemplaza la lista entera, no acumula) — probado con curl usando una cookie de sesión real |

**Nota de arquitectura (aplicada, no solo planificada):** el catálogo de especialidades es global y se siembra una vez (`internal/db.SeedEspecialidadesCatalogo`, 10 especialidades), mientras que los tipos de consulta (T0.3) siguen siendo por profesional — dos catálogos con ciclos de vida distintos, TR-001 y TR-004 respectivamente.

### Sprint 2 — Gestión de clínica: shell + calendario (2 semanas)

**Estado: ✅ completado y verificado (2026-08-22)** — backend re-verificado completo (build + vet + `golangci-lint` 0 issues + tests → **82.4%** cobertura), frontend typecheck + lint + build limpios + **142 tests → 93.44%** cobertura. Probado end-to-end de verdad: turno creado vía API aparece en `/panel` (resumen) y en `/panel/calendario` en la posición horaria correcta con el color de su tipo de consulta (verificado con curl: bloque a `top:128px` = 10:00, `background:#E7D9BE` = cascarón/Consulta general).

| ID | Tarea | FR | Depende de | Esfuerzo | Criterio de aceptación |
|---|---|---|---|---|---|
| T2.1 | ✅ Sidebar retráctil, fijo respecto al scroll: General / Calendario / Turnos / Pacientes; footer con "Tu página" / "Tu perfil" | FR-3 | T1.4 | 2.5d | Sidebar se retrae/expande, se mantiene visible en cualquier scroll de la página (sticky bajo el header fixed); footer navega directo a `/panel/pagina` y `/perfil` |
| T2.2 | ✅ Dashboard General: turnos pendientes (→ Turnos) y confirmados (→ Calendario) | FR-3 | T2.1 | 1.5d | Ambos contadores navegan a la sección correspondiente — `GET /panel/resumen` nuevo en el backend |
| T2.3 | ✅ Calendario: toolbar prev/next/Hoy, toggle Mes/Semana/Día, grilla de horas, contenedor de **altura fija con scroll interno propio** | FR-4 | T2.1, T0.3 | 3.5d | El calendario no estira la página (`h-[600px] overflow-y-auto`); turnos se pintan con el color de su `tipo_consulta` (cascarón/urgencia, TR-001) — vista Mes simplificada (puntos de color por día, sin grilla horaria) |
| T2.4 | ✅ Modal "+ Agregar turno": paciente (desde pendientes o nuevo) → tipo de consulta → hora → confirmar | FR-4, FR-6 | T2.3, T0.3 | 3d | Confirmar crea/vincula el `paciente` y el `turno` pasa a `agendado`; si venía de un turno pendiente, ese registro se actualiza (`PATCH /turnos/{id}/agendar`, no se duplica); si es nuevo, un solo `POST /turnos` crea turno+paciente juntos |
| T2.5 | ✅ Error controlado de solapamiento en el modal (no 500) | FR-4 | T2.4, T0.3 | 1d | El exclusion constraint (23P01) se traduce a 409 + mensaje legible (`isExclusionViolation`), probado con dos turnos solapados reales contra Postgres — nunca un 500 |

**Nota de bloqueo (resuelta con un supuesto, no bloqueó el sprint):** T2.3 dependía de que los "tipos de consulta reales" (spec §7, pregunta 1) estén confirmados; el seed de T0.3 (Consulta general / Urgencia, TR-001) alcanzó para construir y probar la diferenciación de color de verdad — un ajuste de datos, no de código, si el cliente confirma otros tipos.

**Decisión de arquitectura tomada durante la ejecución (no en tradeoffs.md, es implementación directa del plan, no una alternativa pesada):** `internal/http/turnos.go` no separa una capa de servicio/dominio (`internal/turnos` que el §3 original preveía) — la lógica de agendar/crear turno vive junto al handler, mismo criterio que `auth.go`/`especialidades.go`. Se separa el día que un dominio lo justifique (más de un archivo de lógica compartida entre handlers), no antes — ver nota en la sección 3 (estructura de archivos).

### Sprint 3 — Turnos entrantes + Pacientes + formulario público (2 semanas)

**Estado: ✅ completado y verificado (2026-08-23)** — backend: `gofmt`/`go build`/`go vet` limpios, `golangci-lint` 0 issues, tests → **82.4%** cobertura (incluye `GET /clinicas/{slug}`, `POST /clinicas/{slug}/turnos`, `PATCH /turnos/{id}/cancelar`, `PATCH /turnos/{id}`, `GET /pacientes`, `GET /pacientes/{id}`). Frontend: typecheck + lint limpios, build OK (rutas nuevas `/[slug]`, `/panel/turnos`, `/panel/pacientes`, `/panel/pacientes/[id]` compiladas), **173 tests → 90.86%** cobertura. Probado end-to-end de verdad contra los dos servidores corriendo: registro → `PATCH /me` con teléfono → `GET /clinicas/{slug}` público devuelve el teléfono → `POST /clinicas/{slug}/turnos` sin auth crea el turno `pendiente` → aparece en `/panel/turnos?estado=pendiente` → `PATCH /turnos/{id}/agendar` lo confirma y crea el `paciente` → el paciente aparece en `/panel/pacientes` y su detalle (`/panel/pacientes/{id}`) muestra el turno en "Turnos activos" con motivo y fecha correctos; verificado con curl en cada paso, no solo "compila".

| ID | Tarea | FR | Depende de | Esfuerzo | Criterio de aceptación |
|---|---|---|---|---|---|
| T3.1 | ✅ Formulario público de pedido de turno (nombre, apellido, DNI, teléfono, mail, motivo) + validaciones (TR-002) | FR-9 | T4.4* (ruta pública) — reordenado: usa un stub de página pública hasta que T4.x exista, ver nota | 2.5d | Formulario rechaza DNI/teléfono/mail con formato inválido antes de enviar |
| T3.2 | ✅ Envío a WhatsApp (`wa.me` con mensaje prellenado, TR-003) + creación simultánea de `turno` en estado `pendiente` | FR-9 | T3.1, T0.3 | 2d | Al enviar, se abre WhatsApp (web o app) con los datos del formulario y, en paralelo, el turno aparece en `/panel/turnos` (Pendientes) |
| T3.3 | ✅ Vista Turnos: tabs Pendientes/Confirmadas/Canceladas/Todas, buscador por nombre/DNI/email, Cancelar/Editar | FR-5 | T3.2, T2.1 | 3d | Mismo formato de tabla que la referencia (`04-turnos-pacientes-referencia.png`) |
| T3.4 | ✅ Confirmar un turno desde Turnos abre el modal "+ Agregar turno" (T2.4) con el paciente precargado | FR-5 | T3.3, T2.4 | 1d | El modal reutilizado no duplica lógica: mismo componente que T2.4 (`AgregarTurnoModal` con prop `turnoPendienteInicial`) |
| T3.5 | ✅ Pacientes: tabla (mismo formato de referencia) | FR-6 | T2.4 | 2d | Se lista cada `paciente` creado por T2.4/T3.4 |
| T3.6 | ✅ Detalle de paciente: info personal, historial de turnos, turnos activos, placeholders visuales de historia clínica y presupuesto (sin funcionalidad) | FR-6 | T3.5 | 2d | Los dos placeholders son puramente visuales — no aceptan upload ni persisten nada, explícito en el spec §2/§4.5 |

**Nota de resolución de la dependencia T3.1/T4.3:** se construyó el stub de `/[slug]` previsto en la nota original (Server Component mínimo: nombre de clínica, especialidades, `PedirTurnoForm`) — la plantilla pública completa de 3 secciones ("Sobre nosotros", etc.) sigue siendo trabajo de T4.3, que ahora solo tiene que sumar contenido a una ruta que ya existe y ya sirve el formulario real, no crearla de cero.

**Decisión de diseño tomada durante la ejecución (aplicación directa de TR-010, no una alternativa nueva):** la vista Turnos y el detalle de paciente muestran el estado del turno con la variante de estado de `QuadrantMark` (1 cuadrante lleno = pendiente, 4 llenos = agendado, tachado diagonal = cancelada) + rótulo de texto neutro, **no** con una pastilla de color usando `cascaron`/`urgencia` — esos tokens siguen reservados exclusivamente al bloque de `tipo_consulta` del calendario (TR-010 ya lo dejaba dicho explícitamente: "no debe... reutilizarse para otra cosa"). Es la primera vez que se implementa la variante de `QuadrantMark` que TR-010 ya preveía para tablas.

> Nota de dependencia: T3.1/T3.2 requieren que exista *alguna* ruta pública de la clínica para alojar el formulario. Se construye como parte de Sprint 4 (T4.3/T4.4); en la práctica Sprint 3 y el arranque de Sprint 4 (T4.3) se desarrollan en paralelo o T4.3 se adelanta antes de T3.1 si hay un solo dev. Se deja así (en vez de forzar un orden estrictamente secuencial) porque ninguna de las dos tareas bloquea de verdad a la otra a nivel de datos — el modelo `turno`/`pagina_publica` ya existe desde T0.3.

**Ajustes post-entrega pedidos por el cliente (2026-08-23), ✅ implementados y verificados:**
- Editar un turno ya no es uniforme por estado: `pendiente` sigue editando todos los datos de contacto (`PATCH /turnos/{id}`, sin cambios); `agendado` solo permite reprogramar el horario, nunca los datos de contacto — endpoint nuevo `PATCH /turnos/{id}/hora` (`reprogramarTurnoHandler`), mismo exclusion constraint que agendar por primera vez (T2.5). `EditarTurnoModal` elige el formulario correcto según `turno.estado`.
- Cancelar ya no es uniforme: un turno `pendiente` se cancela directo, sin pedir confirmación (todavía no era un compromiso real con el paciente); uno `agendado` pide una confirmación extra deliberada — `CancelarTurnoModal` nuevo, no el `confirm()` nativo del navegador.
- Ficha de paciente editable: `PATCH /pacientes/{id}` nuevo (`editarPacienteHandler`) corrige DNI, teléfono y email de la ficha real del paciente (no solo el snapshot de contacto de un turno puntual) — botón "Editar datos" en `/panel/pacientes/{id}`.
- Modal "+ Agregar turno" suma un tercer camino, "Paciente conocido": elegir de la lista de pacientes ya cargados (`GET /pacientes`) para agendarle un turno sin volver a tipear sus datos — `POST /turnos` acepta un `pacienteId` opcional que vincula en vez de crear una ficha duplicada (`crearTurnoAgendadoConPaciente` ampliado, con el sentinel `errPacienteNoEncontrado` para no vincular un paciente ajeno). Las tres pestañas ahora muestran un renglón explicando a qué se refiere cada una y de dónde sale la lista.
- Calendario: la vista inicial al entrar es "Hoy" (día), no semana; el toolbar respeta el mismo orden progresivo (día → semana → mes). Un turno cuya hora de fin ya pasó ("resuelto") se pinta en gris tanto en la grilla como en la vista Mes, y el panel de detalle (`TurnoDetalle`) muestra una etiqueta "Resuelto"; los turnos cancelados nunca llegan al calendario (ya filtraba por `estado=agendado`, sin cambios). `TurnoDetalle` suma "Ver turno →" (arriba, al lado del título — manda a la fila de ese turno en la vista Turnos, donde sí se puede editar/cancelar) y "Ver paciente →" (a su ficha completa).
- Bug visual resuelto: el header ahora mide su propia altura real con `ResizeObserver` y la expone como `--header-height` en vez de depender solo del valor fijo de `globals.css` — eliminaba un hueco visible entre el header y el contenido de abajo (más notorio en el borde duro del sidebar de `/panel`). Cumple lo que la spec §9.7 ya pedía ("altura medida dinámicamente") y no se había implementado hasta ahora.
- Verificación: backend `gofmt`/`build`/`vet` limpios, `golangci-lint` 0 issues, tests → **81.7%** cobertura total. Frontend typecheck + lint limpios, **217 tests → 91.75%** cobertura, build OK. Probado end-to-end contra los dos servidores corriendo: crear turno manual → editar contacto de un turno agendado falla 409 → reprogramar hora funciona → vincular un segundo turno al mismo paciente por `pacienteId` no duplica la ficha (`GET /pacientes` sigue devolviendo 1) → editar DNI/teléfono/email del paciente se refleja en `/panel/pacientes` y en su detalle.

**Segunda ronda de ajustes post-entrega (2026-08-23), ✅ implementados y verificados:**
- Pestaña "Resueltos" en la vista Turnos: separa, dentro de lo que antes era una sola bolsa "Confirmadas", los turnos `agendado` cuya hora de fin ya pasó — no es un estado nuevo en la base, `GET /turnos` suma un parámetro `resuelto=true|false` que solo tiene efecto junto a `estado=agendado`; sin ese parámetro (como sigue pidiendo el calendario) `estado=agendado` trae pasados y futuros juntos, sin cambio de comportamiento ahí. Usa `clock.Now()` (nunca `time.Now()` directo, regla del `CLAUDE.md`) para la comparación.
- Motivo de consulta: ahora se puede completar/corregir al agendar un turno pendiente (`PATCH /turnos/{id}/agendar` suma `motivo`) y al reprogramar uno confirmado (`PATCH /turnos/{id}/hora` suma `motivo`) — en el modal "+ Agregar turno" pasa a vivir como un único campo en el paso "detalle" (compartido por los tres caminos, precargado con lo que ya se sabía) en vez de solo en el paso de "Paciente nuevo"; en `EditarTurnoModal`, el formulario de un turno confirmado (`EditarHoraForm`) ahora también trae un campo de motivo.
- Bug corregido: cambiar de pestaña (o buscar) en la vista Turnos después de cancelar/editar un turno no actualizaba la tabla hasta hacer un refresh manual — la navegación entre pestañas es client-side (Next.js no desmonta `TurnosTable` solo porque cambió un prop), y su `useState(turnosIniciales)` solo tomaba el valor inicial una vez. Se resolvió con un `key={`${tab}-${q}`}` en `<TurnosTable>` desde `page.tsx`, que fuerza a React a remontar el componente (y reinicializar su estado) en cada cambio real de filtro — patrón estándar de React para este caso, no un parche puntual.
- Verificación: backend `gofmt`/`build`/`vet` limpios, `golangci-lint` 0 issues, tests → **81.9%** cobertura total (suma `TestListTurnos_FiltraPorResuelto`, `TestAgendarTurno_ActualizaMotivo`, motivo en `TestReprogramarTurno_Exitoso`). Frontend typecheck + lint limpios, **220 tests → 91.97%** cobertura, build OK. Probado end-to-end contra los dos servidores corriendo: un turno pasado y uno futuro se separan correctamente entre `?estado=agendado` (Confirmadas) y `?estado=resuelto` (Resueltos), `?estado=agendado` sin el parámetro sigue trayendo ambos; reprogramar un turno confirmado con un motivo nuevo lo actualiza; confirmar un turno pendiente (que llegó sin motivo, vía formulario público) agregándole uno funciona y se refleja en la tabla.

**Tercera ronda de ajustes post-entrega (2026-08-23), ✅ implementados y verificados:**
- No se puede crear un turno en el pasado (`POST /turnos`, `PATCH /turnos/{id}/agendar`) ni reprogramar uno existente a una fecha pasada (`PATCH /turnos/{id}/hora`) — validado contra `clock.Now()`. Excepción explícita en reprogramar: si el horario nuevo es idéntico al que ya tenía (turno `resuelto` al que solo se le corrige el motivo), no se rechaza — sin esta excepción un turno ya resuelto quedaría imposible de tocar nunca más. El frontend (`AgregarTurnoModal`, `EditarTurnoModal`) repite la misma validación con un mensaje en español antes de mandar la request, con `min` en el date picker como ayuda nativa adicional (con `noValidate` en el formulario, para que el mensaje propio se muestre en vez del bloqueo silencioso del navegador).
- Ficha de paciente: "Turnos activos" e "Historial de turnos" pasan de una lista simple a una tabla (mismo formato que Turnos/Pacientes) — nuevo componente `PacienteTurnosTable`, reutilizado en ambas secciones. Diferencia el tipo de consulta de dos formas a la vez, como se pidió explícitamente: un punto de color al principio de cada fila (mismo color que usa el calendario para ese tipo) + una columna de texto con el nombre — nunca solo el color, para que sea legible incluso sin distinguir tonos. `ESTADO_LABEL`/`ESTADO_CLASS`/`ORIGEN_LABEL`/`formatFechaHora` se extrajeron de `turnos-table.tsx` a `lib/turno-format.ts` para no duplicarlos entre las dos tablas.
- Verificación: backend `gofmt`/`build`/`vet` limpios, `golangci-lint` 0 issues, tests → **82.1%** cobertura total (suma `TestCrearTurnoManual_FechaPasadaFalla`, `TestAgendarTurno_FechaPasadaFalla`, `TestReprogramarTurno_MoverAFechaPasadaFalla`, `TestReprogramarTurno_MotivoDeUnResueltoSinCambiarHorario`). Frontend typecheck + lint limpios, **228 tests → 92.35%** cobertura, build OK. Probado end-to-end contra los dos servidores corriendo: crear un turno con horario 2020 falla 400; reprogramar un turno futuro real a un horario 2020 falla 400; la ficha de un paciente con un turno confirmado muestra la tabla con el punto de color en el hex real del tipo de consulta sembrado (`#E7D9BE`) + columna "Tipo de consulta" + "Confirmado", y la sección sin turnos muestra el mensaje vacío en vez de una tabla vacía.

**Restyle cálido del panel de gestión (2026-08-23), pedido explícito del cliente antes de arrancar Sprint 4, ✅ implementado y verificado — ver TR-013 en `docs/tradeoffs.md` para la paleta completa, los valores de radius/sombra y el razonamiento de contraste:**
- Cambio de piel puro (color/forma/sombra), sin tocar layout, estructura de componentes ni copys — alcance acotado a `app/panel/**` y `components/panel/**` (General, Calendario, Turnos, Pacientes, sidebar, topbar dentro de `/panel`). La home pública, el onboarding y el resto del Sistema Cascarón (TR-010) quedan sin tocar — verificado archivo por archivo, no solo de palabra.
- Paleta nueva (hueso/marfil/salvia/terracota/grafito/arena, cada acento con variante `-claro`/`-oscuro`) agregada como tokens nuevos en `globals.css`, sin reemplazar los de TR-010. Radius subido (`rounded-card` 18px, `rounded-field` 12px, `rounded-full` en botones/chips/avatares) y bordes duros reemplazados por `border-[0.5px] border-arena` + `shadow-soft`. Textura de fondo (SVG de cruces suaves) solo en `app/panel/layout.tsx`, nunca dentro de una card.
- Verificación: pipeline completo (`typecheck:web` + `lint:web` + `test:coverage:web` + `build:web`) limpio, **238 tests → 92.43%** cobertura. Contraste AA revisado a mano (fórmula WCAG) para cada combinación fondo/texto nueva — encontró y corrigió un problema real durante la verificación: el tono medio de salvia/terracota como relleno sólido con texto marfil encima daba ~3.1–3.6:1 (no llega a 4.5:1), corregido a la variante `-oscuro` en los ~14 botones/pills afectados antes de cerrar. Probado end-to-end contra los dos servidores: la piel nueva aparece en las cuatro pantallas de `/panel` (incluidos avatares con iniciales y el chip de tipo de consulta), y está ausente en la home pública y en `/buscar` (mismo `HeaderFrame`, acotado por pathname).

**Cuarta ronda de ajustes post-entrega — pulido del restyle cálido (2026-08-23), pedido explícito del cliente tras confirmar el restyle ("quedo bien, solo algunas aclaraciones"), ✅ implementados y verificados:**
- Encabezado (`<thead>`) de las tablas de Turnos/Pacientes/`PacienteTurnosTable`: pasa de `bg-hueso` a `bg-marfil` — se camuflaba contra el fondo con textura del panel. Efecto hover de botones/filas: `hover:bg-hueso` → `hover:bg-arena` en 7 archivos, mismo motivo (contraste insuficiente contra `bg-marfil`).
- Filas de Pacientes y Turnos, clickeables de punta a punta. Pacientes: nuevo componente `ClickableTableRow` (navega al `href` salvo que el click haya sido sobre un `<a>`/`<button>` propio de la fila, vía `.closest()` — mantiene el link "Ver ficha →" funcional por teclado/lector de pantalla). Turnos: patrón de acordeón en vez de navegación — clickear la fila (o el chevron a la derecha) despliega un panel debajo con Confirmar/Editar/Cancelar, que antes vivían siempre visibles en una columna aparte; nuevo prop `abrirId` en `TurnosTable` para desplegar una fila específica al entrar (deep-link, ver debajo).
- `PacienteTurnosTable` pasa a Client Component con filtros por tipo de consulta (`<select>`) y rango de fecha (`Desde`/`Hasta`), aplicados en memoria sobre los turnos ya traídos con la ficha (sin otro viaje al backend — la lista ya es acotada a un paciente). Mensaje distinto si el filtro no deja ningún turno vs. si la sección está vacía de por sí; botón "Limpiar filtros" solo visible con algún filtro activo.
- `TurnoDetalle` (popup del calendario): la hora pasa al tope del panel en tamaño grande (antes texto chico junto con la fecha); "Ver turno"/"Ver paciente" pasan de links de texto a pills con borde, mismo tratamiento que el resto de los CTAs secundarios del panel. "Ver turno" ahora suma `&turno={id}` a la URL — `app/panel/turnos/page.tsx` lo lee y lo pasa como `abrirId` a `TurnosTable`, así la fila llega ya desplegada en vez de obligar a buscarla de nuevo.
- Dashboard General: la tarjeta que antes decía "Agenda" arriba del número (ambiguo respecto de qué contaba) ahora dice "Turnos próximos" tanto arriba como en el link de abajo ("Ver calendario"). Acompaña un cambio de backend: `GET /panel/resumen` ya no cuenta turnos `agendado` resueltos (hora de fin pasada) como "confirmados/próximos" — mismo criterio que la pestaña "Resueltos" de la vista Turnos.
- `/seleccionar-servicio` (pantalla post-login) migrada a la identidad cálida del panel (TR-013) — no la tenía, seguía con el Sistema Cascarón (TR-010). El componente compartido `NavCard` (uso real: solo esta pantalla, pese a un comentario desactualizado que lo daba por compartido con el Home) se restyleó directo. `HeaderFrame` suma `/seleccionar-servicio` a su chequeo `enPanel` para que el topbar sea consistente. Sin la textura de fondo (esa sigue acotada a las 4 pantallas de gestión de verdad, ver `panel/layout.tsx`).
- Verificación: backend `gofmt`/`build`/`vet` limpios, `golangci-lint` 0 issues, tests verdes (incluida `TestResumenPanel_NoCuentaTurnosResueltosComoConfirmados`, nueva). Frontend `typecheck`/`lint` limpios, **247 tests → 92.26%** cobertura, `build` OK. Probado end-to-end contra los dos servidores corriendo: `POST /auth/register` + `POST /turnos` (agendado a futuro) + `GET /panel/resumen` confirma `turnosConfirmados: 1`; `GET /turnos?estado=agendado&resuelto=true` da `[]` (nada resuelto todavía, coherente); `/panel/turnos?turno=...`, `/seleccionar-servicio` y `/panel/pacientes/does-not-exist` devuelven 307 (redirect a `/ingresar` sin sesión) en vez de 500, confirmando que ninguna ruta tocada rompe en el servidor.

**Identidad cálida extendida a todo el sitio (2026-08-23), pedido explícito del cliente antes de arrancar Sprint 4, ✅ implementado y verificado — ver TR-015 en `docs/tradeoffs.md` para el detalle completo de alcance y las decisiones de contraste:**
- La piel cálida de TR-013 (antes acotada a `/panel/**`) pasa a ser el default de todo el sitio: `/buscar`, `/ingresar`, `/sumarse`, `/perfil`, `/[slug]` restyleados por completo (mismo criterio que TR-013 — tokens, radius, bordes, sombra). `HeaderFrame` simplifica su condición de piel a `!hasHero` (antes una lista de rutas) para que cualquier ruta nueva la herede sin tener que acordarse de sumarla. `SiteFooter` pasa de `ink`/`porcelain` a `grafito`/`marfil`. El botón "Sumate" del header (único botón real ahí) pasa a pill `salvia-oscuro`, en toda página.
- Home pública, alcance acotado por pedido explícito ("el home solo cambiar las tarjetas y botones"): las dos secciones con foto de fondo y toda su tipografía quedan sin tocar; solo cambian `InfoCard`, `ExpandableCard` y los dos botones reales de la página.
- Verificación: frontend `typecheck`/`lint` limpios, **247 tests → 92.26%** cobertura, `build` OK. Contraste AA revisado a mano para cada combinación nueva — encontró y corrigió un problema real: el hover de los links del footer nuevo (`salvia` tono medio sobre `grafito`) daba ~3.6:1, corregido a `salvia-claro` (~10.6:1) antes de cerrar, mismo criterio de TR-013 ("el tono medio nunca lleva texto"). Probado end-to-end contra los dos servidores corriendo: `/`, `/buscar`, `/ingresar`, `/sumarse` devuelven 200; `/perfil` sin sesión devuelve 307; la clínica pública de prueba (`/clinica-e2e-1787527557`, creada en la ronda anterior) devuelve 200 con las clases nuevas (`bg-salvia-oscuro`, `rounded-full`, `rounded-field`) presentes en el HTML servido; confirmado con curl que la home sigue sirviendo `text-porcelain` en sus dos secciones con foto mientras sus tarjetas y botones ya sirven `bg-marfil`/`bg-salvia-oscuro`.

### Sprint 4 — Página pública + deploy + búsqueda (2 semanas)

**Estado: ✅ completado y verificado (2026-08-23)** — backend: `gofmt`/`go build`/`go vet` limpios, `golangci-lint` 0 issues, tests verdes (nuevos: `pagina_publica_test.go` completo + `clinicas_test.go` extendido con el filtro de deploy y el campo `oculta`), **81.3%** cobertura total. Frontend: `typecheck`/`lint` limpios, **270 tests → 92.48%** cobertura, `build` OK (`/panel/pagina` y `/[slug]` compilan). Probado end-to-end de verdad contra los dos servidores corriendo: registro → `GET /panel/pagina` crea la fila sola con default `{oculta:false}` → `/clinica-x` previsualizable YA (antes de deployar) → buscador vacío hasta `PATCH /panel/pagina/deployar` → aparece después → deployar de nuevo no pisa la fecha (idempotente) → `PATCH /panel/pagina/ocultar` refleja `oculta:true` en `GET /clinicas/{slug}` y el buscador NO lo saca (ocultar ≠ des-deployar) → `/clinica-x` sirve la pantalla de mantenimiento con `oculta:true` → al des-ocultar, sirve la plantilla completa con "Pedí tu turno"/"Sobre nosotros" (y "Especialidades" condicional, verificado ausente sin especialidades cargadas) → `/panel/pagina` sin sesión redirige 307.

| ID | Tarea | FR | Depende de | Esfuerzo | Criterio de aceptación |
|---|---|---|---|---|---|
| T4.1 | ✅ Layout del editor de página: panel de edición a la derecha (sidebar desplegable) + preview en vivo a la izquierda (`05-editor-pagina.png`) | FR-7 | T2.1 | 2.5d | Layout y estructura presentes; la edición real de contenido queda fuera de alcance (spec §5.1) — el panel puede mostrar los campos como no-editables o deshabilitados por ahora |
| T4.2 | ✅ Barra superior de acciones: Ver página / Guardar cambios / Ocultar / Deployar (solo visible la primera vez) | FR-7, FR-8 | T4.1, T0.3 | 2d | "Ocultar" pone `pagina_publica.oculta = true`; "Deployar" setea `deployada_en` la primera vez y desaparece de la barra después |
| T4.3 | ✅ Plantilla pública base en `/[slug]`: sección de turno (formulario de T3.1/T3.2), "Sobre nosotros" (placeholder), especialidades (desde el profesional) | FR-8 | T0.3, T1.3 | 2.5d | Página renderiza las 3 secciones fijas; slug único derivado del nombre de clínica |
| T4.4 | ✅ Modo mantenimiento cuando `oculta = true` | FR-8 | T4.3, T4.2 | 0.5d | Visitante ve una pantalla de "en mantenimiento" en vez del contenido |
| T4.5 | ✅ Cerrado — filtro `deployada_en` no nulo sumado (era el único resto desde el adelanto a Sprint 1, 2026-08-22) | FR-10 | T4.2, T4.3 | 2.5d → 0.5d restante | `GET /clinicas` + `/buscar` + sección de búsqueda en el Home ya funcionan de verdad (búsqueda real contra la base) — ver TR-012 en docs/tradeoffs.md. `WHERE` vía `JOIN paginas_publicas ... AND deployada_en IS NOT NULL` en `buscarClinicasHandler` |

**Decisiones tomadas durante la ejecución (aplicación directa de la spec y del alcance ya acotado en `CLAUDE.md`, no alternativas nuevas):**
- `PaginaPublica` (1:1 con `Profesional`, existe desde T0.3) no se crea al registrarse — se crea perezosamente (get-or-create) la primera vez que hace falta, en `GET/PATCH /panel/pagina/*`, para no tocar el flujo de registro por una feature que llega dos sprints después. Una página pública sin fila todavía se comporta como "no oculta" (el default de la columna).
- `GET /clinicas/{slug}` (la URL propia de cada clínica) nunca se bloquea por falta de deploy — solo por `oculta`. "Ver página" desde el editor tiene que poder previsualizar la página ANTES del primer deploy; lo que sí depende de `deployada_en` es únicamente el buscador (`GET /clinicas`, T4.5), que es donde la spec pide evitar páginas vacías/incompletas.
- "Guardar cambios" (barra de T4.2) y los campos del panel de edición (T4.1) están deshabilitados a propósito, sin backend detrás — la personalización real de contenido/diseño es trabajo posterior explícito (spec §5.1) y está fuera de alcance del MVP salvo pedido explícito (`CLAUDE.md`). El panel refleja de solo lectura los datos que ya existen en "Tu perfil" (nombre de clínica, teléfono, especialidades) más un textarea placeholder de "Sobre nosotros".
- La previsualización en vivo del editor y la página pública real comparten un único componente (`ClinicaPublicaTemplate`) — nunca se desincronizan a propósito, en vez de mantener dos plantillas por separado.

**Corrección post-entrega (2026-08-23), pedido explícito del cliente, ✅ implementada y verificada — ver TR-017 en `docs/tradeoffs.md`:** la primera versión de T4.1 montó el editor en `/panel/pagina`, dentro del layout de gestión de clínica (heredaba su sidebar de navegación y su textura de fondo). Se corrige: el editor pasa a `/personalizar-pagina`, una ruta de nivel superior hermana de `/panel`, no una sub-ruta — con guard de sesión propio, sin el sidebar de clínica, más ancho disponible (panel de edición `w-72`→`w-80`, previsualización `min-h-[600px]`→`min-h-[640px]`). "Tu página" (sidebar de `/panel`) y la tarjeta "Personalizá tu página" (`/seleccionar-servicio`) apuntan a la nueva ruta. `PaginaEditor` se mudó de `components/panel/` a `components/`. Verificación: pipeline completo (`typecheck`/`lint`/`test:coverage`/`build`) limpio, **270 tests → 92.48%** cobertura (sin cambios de cantidad, los tests se movieron con sus componentes). Probado end-to-end: `/personalizar-pagina` sin sesión redirige 307; la vieja `/panel/pagina` ya no existe (404); `/seleccionar-servicio` sigue sirviendo.

**Segunda ronda de correcciones post-entrega (2026-08-23), pedido explícito del cliente, ✅ implementada y verificada — ver TR-018 y TR-019 en `docs/tradeoffs.md`:**
- `ClinicaPublicaTemplate` (T4.3) suma un fondo celeste propio (`#e7f2f7`, distinto de la identidad cálida del resto del producto) y su propio "header básico" con anclas a cada sección (Pedí tu turno/Sobre nosotros/Especialidades) — la misma previsualización en vivo del editor ya lo muestra, comparten componente.
- La página pública de una clínica (`/{slug}`) deja de mostrar el header/footer globales de Mirage — nuevo `isClinicaPublicaRoute` en `lib/site-routes.ts` + `SiteHeaderVisibility` (mismo patrón que `SiteFooterVisibility` ya existente). Primer paso hacia el subdominio propio que ya preveía la spec §5 (Fase 2, no implementado todavía — esto es la aproximación visual sin anticipar la infraestructura real).
- `/buscar` pasa de una lista vertical de tarjetas a una grilla de tarjetas cuadradas horizontal (`grid-cols-2 sm:grid-cols-3 md:grid-cols-4`, `aspect-square`).
- Header logueado: "Volver al inicio" (nuevo, solo visible en `/seleccionar-servicio`, detrás del wordmark) + "Gestionar tu clínica"/"Editar tu página" centrados de verdad (posición absoluta, no flexbox — el balance por `flex-1` no daba un centrado estable) + "Tu perfil" al costado derecho + "Cerrar sesión" mudado del header a la propia página `/perfil`.
- Verificación: frontend `typecheck`/`lint` limpios, **298 tests → 92.6%** cobertura, `build` OK (`/[slug]` sin `<header>`/`<footer>` en el HTML servido, confirmado con curl; Home sigue con ambos). Probado end-to-end contra los dos servidores corriendo: registro + cookie de sesión simulada vía curl confirma que "Volver al inicio" aparece solo en `/seleccionar-servicio` y desaparece en `/panel`; "Cerrar sesión" aparece en `/perfil` y no en el header; la previsualización de `/personalizar-pagina` ya muestra el fondo celeste nuevo.

### Sprint 5 — Pulido, QA y salida a producción (1–1.5 semanas)

| ID | Tarea | FR | Depende de | Esfuerzo | Criterio de aceptación |
|---|---|---|---|---|---|
| T5.1 | ✅ Pase de diseño frontend deliberado (paleta hex, tipografía display/body/utilitaria, elemento firma) vía `/frontend-design` — **adelantado a fase de planificación** (TR-010), no esperado hasta Sprint 5, para que Sprint 1 ya arranque con tokens reales en vez de placeholders. Esta tarea en Sprint 5 pasa a ser *aplicar/pulir* el sistema ya definido sobre las pantallas construidas, no definirlo desde cero | FR-11 | T1.1–T4.5 | 1d (reducido de 2d — el sistema ya existe) | Paleta y tipografía documentadas y aplicadas consistentemente en todas las pantallas; lenguaje estructural tipo bungie.net traducido a tono clínico (spec §9.7), no look "gamer" literal — ver TR-010 en `docs/tradeoffs.md` |
| T5.2 | Pase mobile-first + accesibilidad (contraste, alt text, navegación por teclado) + header fijo con altura dinámica si hay banners | FR-11 | T5.1 | 2d | Auditoría axe/Lighthouse sin errores críticos en mobile |
| T5.3 | Verificación final de coverage ≥ 80% ambos lados (ya gateado desde T0.4, esto es cierre, no descubrimiento) | FR-11 | Sprints 0–4 | 0.5d | `go tool cover` y el reporte de Vitest reportan ≥ 80% |
| T5.4 | QA end-to-end: onboarding → agenda → turno público → WhatsApp → confirmación → deploy → búsqueda | FR-1–FR-10 | Sprints 1–4 | 2d | Checklist de flujos críticos pasa sin bugs bloqueantes, incluida la prueba manual de dos turnos agendados solapados (debe fallar controladamente) |
| T5.5 | ✅ Infraestructura de CI/deploy lista (Dockerfiles, `render.yaml`, deploy automático en push a `dev`) — **adelantada fuera de orden** (pedido explícito del cliente, 2026-08-24, antes de T5.2-T5.4); blueprint aplicado en Render y secrets cargados, job `deploy` activo | FR-11 | T5.4 | 1.5d | Sitio accesible en dominio final; healthcheck de `apps/api`/`apps/web` verde |

**Ronda de CI/deploy (2026-08-24), rama `feature/ci-deployment`, pedido explícito del cliente, ✅ implementada y verificada — ver TR-020 en `docs/tradeoffs.md`:**
- Seis recursos en `render.yaml` (antes tres en Marcuzzi_Madryn): `dental-mirage-db`/`-api`/`-web` (prod, rama `main`) y sus tres equivalentes `-dev` (rama `dev`), cada trío con su propia base de datos, nunca compartida.
- `apps/api/Dockerfile` y `apps/web/Dockerfile` nuevos (build en dos etapas, mismo patrón que Marcuzzi_Madryn pero sin el manejo de `NEXT_PUBLIC_*`/uploads que Dental Mirage no tiene) — `.dockerignore` en la raíz y en `apps/api/`. `docker-compose.yml` extendido con `migrate`/`api`/`web` (antes solo Postgres).
- `.github/workflows/ci.yml`: corre también en push directo a `dev` (antes solo `main`); el job `deploy` se separa en `deploy-prod`/`deploy-dev`, cada uno disparando su propio par de Deploy Hooks (`RENDER_DEPLOY_HOOK_API`/`_WEB` vs. `_API_DEV`/`_WEB_DEV`) según la rama.
- Storage de fotos (perfil de profesional, fotos de página pública — todavía sin construir): env vars de R2 reservados en `render.yaml` (`sync: false`) con la convención de key multi-tenant ya decidida (`paginas/{profesionalId}/...`, `perfiles/{profesionalId}/...`) para cuando la feature exista.
- Verificación: los dos Dockerfiles se buildearon de verdad (`docker build`) y se corrió el stack completo (`docker compose up --build`) contra el código real — health check de la API, página `/buscar` sirviendo vía SSR contra el `api` interno por la red de Docker, y un registro real (`POST /auth/register`) contra el Postgres containerizado, los tres verdes. YAML de los tres archivos (`render.yaml`, `docker-compose.yml`, `ci.yml`) validado con un parser real (`js-yaml`), no solo a ojo.

**Corrección post-entrega, mismo día (2026-08-24), pedido explícito del cliente — ver TR-021 en `docs/tradeoffs.md`:** el plan free de Render solo permite una base Postgres por cuenta — los 6 recursos de arriba no eran viables sin pagar. `render.yaml` vuelve a 3 recursos (`dental-mirage-db`/`-api`/`-web`, sin sufijo); `ci.yml` colapsa `deploy-prod`/`deploy-dev` a un solo job `deploy`, disparado por push a **`dev`** (no `main` — `main` sigue corriendo tests/build en cada push, sin disparar redeploy). El patrón de dos entornos separados queda documentado (comentario en `render.yaml` + TR-020/TR-021) para retomarlo cuando haya presupuesto para una segunda base.

**Segunda corrección post-entrega, mismo día (2026-08-24), pedido explícito del cliente — ver TR-022 en `docs/tradeoffs.md`:** el blueprint (`render.yaml`) todavía no está aplicado en Render — no existen `RENDER_DEPLOY_HOOK_API`/`_WEB` como secrets del repo, así que el job `deploy` fallaba en rojo en cada push a `dev` sin que hubiera nada roto en el código. El job se saca por completo de `ci.yml` (no solo se retarget) hasta terminar de configurar Render; queda un comentario en su lugar explicando qué falta y el texto del job recuperable del historial de git.

**Job `deploy` repuesto, mismo día (2026-08-24), pedido explícito del cliente ("ya configuré render, con los deploy keys en secrets en actions, reponé el job deploy") — ver TR-022 en `docs/tradeoffs.md`:** blueprint aplicado en el dashboard de Render, `RENDER_DEPLOY_HOOK_API`/`RENDER_DEPLOY_HOOK_WEB` cargados como secrets del repo. `ci.yml` recupera el job `deploy` (texto idéntico al que tenía antes de sacarse, apuntando a `dev`, gateado por los cuatro jobs de test/build). Verificado con `js-yaml`: 5 jobs (`web`/`api`/`test-api`/`test-web`/`deploy`), condición `if` y `needs` del job `deploy` correctos. T5.5 cierra ✅.

**Corrección mobile post-deploy (2026-08-24), pedido explícito del cliente ("el forntend se ve horrible en mobile"... "aplicar la misma solucion que alojamientos madryn... con una barra desplegable"... "los modulos se ven contraidos contra la pagina... deslizar con el dedo") — adelanta parte de T5.2, ver TR-023 en `docs/tradeoffs.md`:**
- Header: nuevo `site-header-chrome.tsx` (Client Component) — debajo de `md`, la fila superior queda solo con el logo + botón de hamburguesa; el resto de la navegación se mueve a un `<nav>` desplegable, mismo patrón que `site-header.tsx` de Alojamientos Madryn. `HeaderFrame` suma `forceSolid` para que el dropdown se lea bien sobre la foto transparente del Home.
- Sidebar de `/panel`: riel de íconos angosto (`w-16`) siempre debajo de `md`, sin importar el toggle manual — antes `w-60` fijo se comía la mayor parte de un viewport angosto.
- Calendario: contenedor con `overflow-auto` (antes solo `-y`); columnas de la vista Semana/Día con piso de `140px` (antes `minmax(0, 1fr)`, se aplastaban a nada); vista Mes con `min-w-[490px]`.
- Editor de página (`/personalizar-pagina`): previsualización + panel de edición pasan de una fila fija a `flex-col lg:flex-row` — se apilan en mobile en vez de competir por el mismo ancho angosto.
- Verificación: pipeline completo (`typecheck`/`lint`/`test:coverage`/`build`) limpio, **307 tests → 92.7%** cobertura (test nuevo `site-header-chrome.test.tsx` + un caso nuevo en `header-frame.test.tsx` para `forceSolid`).

**Corrección de criterio, rama `fix/mobile` (2026-08-24), pedido explícito del cliente ("no quiero que las tablas ni el calendario se compriman... quiero que mantengan su layout original de escritorio... scroll horizontal", acotado a "el apartado de gestión de clínica... no toques el resto de la app por ahora") — ver TR-024 en `docs/tradeoffs.md`:** primera vez que el proyecto usa una rama dedicada por área para trabajo mobile en vez de commitear directo a `dev` — el cliente pidió que todo ajuste mobile futuro pase por `fix/mobile` y se mergee a `dev` desde ahí.
- Alcance estrictamente `/panel/**` — sidebar (riel de íconos) y header (menú desplegable) de TR-023 quedan intactos, confirmados explícitamente por el cliente. `/personalizar-pagina` tampoco se toca (es un área separada desde TR-017).
- `calendar-grid.tsx`: el `minmax(140px, 1fr)` incondicional de TR-023 (que técnicamente podía alterar desktop en un viewport angosto, ~1366px) se corrige con una variable CSS (`--panel-dia-min-w`, `globals.css`, solo activa debajo de 768px) — arriba de eso es matemáticamente idéntico al original `minmax(0, 1fr)`, cero cambio de escritorio a ningún ancho.
- Tablas (`TurnosTable`, Pacientes, `PacienteTurnosTable`): sin cambios de layout — ya tenían `overflow-auto` + `min-w` fijo desde que se construyeron, exactamente el patrón pedido. Se les suma `WebkitOverflowScrolling: "touch"` (igual que al calendario) para el gesto táctil en iOS.
- Verificación: pipeline completo limpio, 307 tests → 92.7% cobertura (sin tests nuevos, cambios puros de CSS/estilo inline).

**Segunda vuelta, rama `fix/mobile` (2026-08-24), pedido explícito del cliente tras probar el deploy real ("el sidebar... sigue sin poder desplegarse con la flechita", "el calendario sigue estando apelmazado... quiero el mismo layout de escritorio") — ver TR-025 en `docs/tradeoffs.md`:**
- Sidebar: revertido íntegro a su comportamiento pre-TR-023 (toggle único vía `collapsed`, sin variante `md:`, botón siempre visible) — el cliente prefiere el control manual de siempre sobre el riel forzado angosto en mobile.
- `calendar-grid.tsx`: el piso de ancho pasa de columna-por-columna (no hacía nada en vista Día, la que se ve por defecto) a una vez por contenedor completo (`--panel-calendar-min-w`, 720px para Día / 200px×N para Semana), consumido solo debajo de 768px.
- Verificación: pipeline completo limpio, 307 tests → 92.73% cobertura (sin tests nuevos).

**Tercera vuelta, rama `fix/mobile` (2026-08-24), pedido explícito y detallado del cliente (estructura fija header/sidebar/página, un área de contenido con su propio scroll, `min-width` + `clamp()`/`vw` en vez de un ancho fijo enorme, sin tocar el meta viewport) — ver TR-026 en `docs/tradeoffs.md`:**
- `app/panel/layout.tsx`: raíz a `100dvh` + `overflow-hidden` (mobile-only); `<main>` pasa a ser el único elemento que scrollea verticalmente. El sidebar, al quedar fuera de esa área, queda visualmente fijo.
- `calendar-view.tsx`/`turnos-table.tsx`/`pacientes/page.tsx`/`paciente-turnos-table.tsx`: pierden su recorte/scroll vertical propio en mobile (ese scroll ahora lo da `<main>`), conservan su scroll horizontal sin cambios.
- `calendar-grid.tsx`: vuelve al piso de ancho por columna (no por todo el contenedor, como en la segunda vuelta) — con `clamp()`+`vw` en vez de un px fijo. La vista Día ahora llena el 100% del ancho sin piso, que es lo pedido ("que se estire y llene la pantalla").
- Los cinco `h1` y el padding raíz de cada página de `/panel` pasan a `clamp()`+`vw` en mobile.
- Verificación: pipeline completo limpio, 307 tests → 92.7% cobertura (sin tests nuevos); CSS de producción inspeccionado para confirmar que Tailwind generó el bloque `max-md:` esperado.

**Cierre de Fase 1 = MVP según spec §2 ("Incluido en esta fase").**

---

## 6. Backlog (Fase 2 — spec §2 "explícitamente fuera de alcance")

Resumen de alto nivel, a re-planificar cuando arranque:

- Cuentas de tipo "organización" (varios profesionales bajo una cuenta) — impacta el modelo de datos de `profesional`/`pagina_publica` (hoy 1:1), no es solo UI.
- Subdominios propios por clínica (`clinica.miragedominio.com`) en vez de `/clinica-x`.
- Editor visual drag & drop de la página pública (hoy solo layout + plantilla fija).
- Sección "Sobre nosotros" con perfil completo (hoy placeholder).
- Historia clínica adjunta y presupuesto de tratamiento con funcionalidad real (hoy placeholders visuales).
- Recordatorios de turno automatizados por WhatsApp/SMS (interfaz ya dejada lista en `internal/notificaciones`, spec §9.4) — distinto del envío inicial por `wa.me` (TR-003), que ya está en el MVP.
- Posible integración con WhatsApp Business API si el `wa.me` del MVP resulta insuficiente (spec §7, pregunta 3).
- CAPTCHA/anti-spam en el formulario público (TR-008).
- Login social (Google) si se confirma que hace falta (TR-005).

---

## 7. Camino crítico (MVP)

```
T0.1 → T0.2 → T0.3 → T0.5 (auth) → T1.2 → T1.3 → T1.4
                 └→ T2.1 → T2.3 → T2.4 → T2.5 (constraint validada en UI)
                              └→ T3.2 → T3.3 → T3.4
        T0.3 → T4.3 → T4.2 → T4.4 → T4.5 → T5.4 → T5.5
```

Setup y auth (Sprint 0–1) bloquean todo lo demás. La cadena `esquema+constraint → calendario → modal de turno → solapamiento controlado` determina cuándo el requisito no negociable de la spec (§4.3) queda realmente probado en UI, no solo en DB. La cadena de página pública (`plantilla → deploy → búsqueda`) puede avanzar en paralelo con Sprint 2/3 si hay más de un desarrollador — solo comparte el modelo de datos de T0.3, no código.

---

## 8. Riesgos y mitigaciones

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R1 | Doble agenda de un mismo profesional por condición de carrera | Alto — el mismo requisito "no negociable" de la spec §4.3 | Exclusion constraint a nivel DB (T0.3) validada con un insert solapado real antes de construir el modal sobre ella (T2.5) |
| R2 | Decisiones de spec §7 sin confirmar (tipos de consulta, validaciones, alcance de WhatsApp, especialidades, auth) frenan o revierten trabajo ya hecho | Medio-Alto | Posturas asumidas registradas en `docs/tradeoffs.md` (TR-001 a TR-009) antes de Sprint 1; cualquier respuesta distinta del cliente dispara una revisión de este plan, no un parche a mitad de sprint |
| R3 | Formulario público de turno (T3.1) sin CAPTCHA (TR-008) recibe spam, generando `turno`s pendientes falsos que ensucian el panel del profesional | Medio | Backlog: sumar `turnstile.Verifier` con el mismo patrón dev/prod de spec §9.4 en cuanto se confirme que es un problema real; mientras tanto, Turnos (T3.3) permite cancelar en lote |
| R4 | `wa.me` (TR-003) depende de que el visitante tenga WhatsApp instalado/accesible; no hay confirmación de entrega ni reintento | Medio | El registro del `turno` pendiente (T3.2) no depende de que el link de WhatsApp se abra con éxito — persiste igual en el panel, así que el profesional nunca pierde el pedido aunque el link falle en el dispositivo del visitante |
| R5 | Un solo desarrollador full-stack es punto único de fallo, agravado por manejar dos lenguajes (TS + Go) | Medio-Alto | Mismo mitigante que Marcuzzi_Madryn: backend Go detrás de paquetes por dominio (`turnos`, `pacientes`, `paginas`), frontend en Next.js estándar — más barato sumar una segunda persona a mitad de proyecto |
| R6 | Comparar "turno vigente"/fechas contra la hora del servidor con timezone mal configurado corre las reglas de agenda | Medio | Mitigado en Sprint 0: `internal/clock.Today()` (T0.6) fijado a `America/Argentina/Cordoba`, nunca `time.Now()` directo — mismo patrón que R8 de Marcuzzi_Madryn |
| R7 | Gate de coverage 80% (T0.4) activo desde el Sprint 0 puede frenar el ritmo de las primeras tareas de scaffolding, que tienen poca lógica testeable | Bajo | Igual que TR-039/040 de Marcuzzi: excluir de la base de cálculo `page.tsx`/`layout.tsx` (Server Components async no testeables) desde el día 1, no como parche posterior |
| R8 | `packages/shared-types` (TS) no se genera automáticamente desde los structs de Go — puede desincronizarse | Medio | Revisar `shared-types` en cada PR que cambie contratos de API en `apps/api`, mismo criterio que Marcuzzi_Madryn |

---

## 9. Decisiones asumidas para poder planificar

Este plan no espera confirmación del cliente para tener una fecha de referencia, pero toma postura sobre las preguntas abiertas de la spec §7. El detalle de cada una (alternativas descartadas, qué se sacrifica) está en `docs/tradeoffs.md`:

- TR-001: Tipos de consulta como catálogo fijo por profesional (seed: Consulta general / Urgencia), no tags libres — responde spec §7.1.
- TR-002: Validaciones concretas de DNI/teléfono/mail en el formulario público — responde spec §7.2.
- TR-003: Envío del formulario público vía link `wa.me` (no WhatsApp Business API) — responde spec §7.3.
- TR-004: Especialidades como catálogo cerrado predefinido por Mirage, no tags libres — responde spec §7.4.
- TR-005: Autenticación email+password propia (JWT), sin login social en el MVP — responde spec §7.5.
- TR-006: El exclusion constraint de turnos aplica solo a `estado='agendado'`; los `pendiente` no tienen `rango_horario` fijo todavía.
- TR-007: Gate de coverage 80% activo desde Sprint 0 (CI), no agregado como iniciativa tardía — lección aplicada de la experiencia de Marcuzzi_Madryn.
- TR-008: Sin CAPTCHA/Turnstile en el formulario público del MVP — riesgo aceptado y registrado (R3).
- TR-009: La opción "organización" se **omite** del flujo de onboarding en el MVP (no se muestra deshabilitada).
- TR-010: Identidad visual — Sistema Cascarón (paleta de 6 tokens, tipografía Big Shoulders/Public Sans/IBM Plex Mono, marca de cuadrante como elemento firma). Resuelve T5.1 por adelantado.
- TR-011: Catálogo de especialidades visible acotado a "Odontología general" — el resto de TR-004 sigue sembrado pero oculto (`Especialidad.Activa`), hasta que el cliente confirme el resto de la lista.
- TR-012: Buscador público de clínicas (T4.5) adelantado a Sprint 1, sin el filtro `deployada_en` todavía — toda clínica registrada aparece hasta que exista el toggle de deploy (T4.2).

Si el cliente responde distinto a alguna de estas, el sprint afectado (ver columna "Depende de" en la sección 5) debe re-estimarse antes de arrancarlo, no a mitad de sprint.

---

## 10. Criterios de salida de este plan

- [x] Componentes de arquitectura documentados (sección 2, incluido el modelo de datos propuesto que la spec no trae).
- [x] Sección de estructura de archivos antes de las tareas (sección 3).
- [x] Todas las tareas de la Fase 1 aparecen dentro de la estructura de archivos.
- [x] Todos los FR (sección 4) están mapeados a al menos una tarea.
- [x] Todas las tareas tienen criterio de aceptación.
- [x] Dependencias forman un grafo acíclico (columna "Depende de"; verificado manualmente, sin ciclos — la única dependencia cruzada de sprint, T3.1/T3.2 vs. T4.3, queda documentada explícitamente como no bloqueante en la nota de la sección 5).
- [x] Estimaciones de esfuerzo por tarea (días, 1 dev full-stack senior).
- [x] Camino crítico identificado (sección 7).
- [x] Riesgos evaluados con mitigación (sección 8).
- [x] Sprints de ~2 semanas balanceados: ningún sprint supera ~15 días-persona de esfuerzo sumado.

---

*Documento vivo — actualizar cuando el cliente confirme o corrija alguna de las decisiones asumidas en la sección 9, o cuando `/frontend-design` (T5.1) fije la paleta/tipografía definitivas.*
