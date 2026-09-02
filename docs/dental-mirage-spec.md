# Dental Mirage — Especificación de Producto (MVP)

> Documento organizado a partir del brief original, para ser analizado con `/proyect-planning` y `/frontend-design`.
> Imágenes de referencia en la misma carpeta (`01-home.png` a `05-editor-pagina.png`).
> Stack técnico y modo de trabajo: ver `playbook-clinica-dental.md` (mismo directorio) y el resumen aplicado en la sección 9.

---

## 1. Visión general

Dental Mirage es una plataforma para odontólogos de la provincia de Córdoba que combina dos servicios en una sola cuenta:

1. **Gestión de clínica**: turnero, pacientes, agenda.
2. **Página web propia**: sitio público personalizable donde los pacientes piden turno.

El profesional se suma, configura su cuenta, y obtiene tanto una herramienta de back-office como una landing pública deployable para su consultorio.

---

## 2. Alcance del MVP

**Incluido en esta fase:**
- Alta de profesional individual, con **login social (Google) o cuenta nativa con verificación de mail**, wizard de onboarding de 3 pasos (Cuenta → Perfil profesional → Clínica) — ver sección 3.
- Selector de servicios: Gestioná tu clínica / Personalizá tu página.
- Módulo de gestión de clínica completo: general, calendario, turnos entrantes, pacientes.
- Página pública con plantilla base (no editor visual todavía) + flujo de deploy.
- Buscador público de clínicas por nombre, profesional o especialidad.

**Incluido a nivel de modelo de datos, sin funcionalidad todavía (aditivo, no bloquea el resto):**
- Cuentas de tipo "organización": el Paso 3 del wizard ya permite elegir "organización" en vez de "clínica particular" y el modelo de datos (`Clinic`/`ClinicMember` con roles `owner`/`admin`/`profesional`/`recepcion`, `ClinicInvitation`) ya lo soporta — pero el envío/aceptación de invitaciones y el panel de gestión de miembros todavía no están construidos (el Paso 3 solo muestra un aviso de "próximamente" en ese caso).

**Explícitamente fuera de alcance / pendiente para después:**
- Envío/aceptación de invitaciones a una organización y panel de gestión de miembros (el modelo de datos ya está listo, ver arriba).
- Subdominios propios por clínica (`clinica.miragedominio.com`) — por ahora es `/clinica-x`.
- Herramienta de edición visual de la página (drag & drop) — por ahora es plantilla fija.
- Apartado "Sobre nosotros" con perfil completo del profesional/organización.
- Historia clínica adjunta y presupuesto de tratamiento — solo placeholders visuales, sin funcionalidad real.
- 2FA, subida de foto de perfil (validación por magic bytes + storage prod), CSRF por tokens dedicados — ver el repaso de seguridad en `docs/feature-sumarte-login-resumen.md`.

---

## 3. Flujo de onboarding (alta de usuario)

Reescrito por completo respecto al brief original — la versión vigente es un wizard de 3 pasos con verificación de identidad real, definido en detalle en `docs/feature-sumarte-login-resumen.md` (resumen de entrega) y `docs/tradeoffs.md` (TR-036 a TR-047). Resumen aplicado:

1. Usuario llega al **Home** (`01-home.png`), lee sobre los servicios y elige sumarse.
2. **Paso 1 — Cuenta:** con **Google** (OAuth, popup, mail ya verificado por el provider — pasa directo al Paso 2) o **nativa** (mail + contraseña, con verificación de mail vía Resend antes de poder avanzar).
3. **Paso 2 — Perfil profesional:** datos personales (nombre, apellido, teléfono, documento opcional, matrícula), especialidades desde un catálogo cerrado (no tags libres, ver TR-004), años de experiencia y bio opcionales.
4. **Paso 3 — Clínica:** nombre de la clínica y **elección de tipo — "clínica particular" u "organización"** (ambas habilitadas en la UI; organización solo deja el modelo de datos listo, sin invitaciones funcionales todavía — ver sección 2).
5. Llega a la pantalla de selección de servicios (`02-seleccion-servicios.png`): **Gestioná tu clínica** / **Personalizá tu página**.

El wizard persiste el progreso en cada paso — cerrar sesión y volver retoma exactamente en el paso pendiente, sin perder los datos ya cargados.

**Nota de diseño:** una vez completado este flujo, la cuenta ya está "sumada". En la pantalla de selección de servicios, el header ya no debería mostrar solo "Cerrar sesión" — debe incluir un acceso a **Tu perfil** (a futuro, "Tu organización" cuando se habilite ese modo).

---

## 4. Módulo: Gestión de clínica

### 4.1 Estructura general
- Sidebar lateral **desplegable/retráctil**, fijo respecto al scroll de la página (acompaña al usuario sin importar cuánto scrollee).
- Secciones: General (dashboard), Calendario, Turnos, Pacientes.
- Al pie del sidebar: en vez de nombre de cuenta + cerrar sesión, mostrar pestañas **"Tu página"** y **"Tu perfil"**, cada una navegando directo a esa sección.

### 4.2 Apartado General (dashboard)
- Vista resumida y visual de:
  - **Turnos pendientes** → al tocar, lleva al apartado de Turnos (pedidos entrantes desde la página).
  - **Turnos confirmados** → al tocar, lleva al Calendario.

### 4.3 Calendario (`03-calendario.png`)
- Debe ser **lo más simple e intuitivo posible**.
- Referencia de librería: similar a **FullCalendar** o **react-big-calendar** — toolbar con prev/next/Hoy, toggle Mes/Semana/Día, grilla de horas a la izquierda.
- **Clave:** el calendario vive en un contenedor de **altura fija** y hace **scroll interno propio**, no estira la página.
- Los turnos se muestran en distintos colores según tipo de consulta (por ahora "consulta general" = color "cascarón"; se necesita al menos un segundo tipo de consulta con otro color para probar la diferenciación visual — **pendiente de definir con el profesional/producto**).
- Al tocar una casilla de consulta ya agendada: se ve hora, paciente adjunto y tipo de consulta.
- Botón superior "+ Nueva sesión" → renombrar a **"+ Agregar turno"**. Abre un modal/dropbox (fondo con blur) con el siguiente flujo:
  1. **Paciente**: dos caminos posibles —
     - Seleccionar desde turnos pendientes (ya vienen con datos cargados desde la página pública).
     - Crear paciente nuevo directamente ahí, completando datos adicionales (para consultas que no llegaron por la página, ej. contacto directo).
  2. **Tipo de consulta**: "consulta general" por defecto, editable por el profesional.
  3. **Hora de la consulta.**
  4. **Confirmar.**
- Al confirmar:
  - Si venía de turnos pendientes → el turno pasa de "pendiente" a "agendado" en el calendario, y se crea/vincula su entrada en Pacientes.
  - Si era un paciente nuevo → se crea la entrada en Pacientes en el mismo momento.
- **Regla de negocio no negociable:** dos turnos de un mismo profesional no pueden solaparse en horario. Esto se garantiza a nivel de base de datos (Postgres, `btree_gist` + `EXCLUDE USING gist`), no solo con validación en el backend — ver sección 9.2. Cualquier intento de agendar un turno solapado debe fallar de forma predecible y mostrarse como error de validación en el modal, no como error 500.

### 4.4 Turnos (pedidos entrantes)
- Lista todos los turnos a confirmar que llegan **desde la página pública deployada** del profesional.
- **Flujo de origen:** el cliente final entra a la página del profesional → "Pedir turno" → completa un formulario (nombre, apellido, DNI, teléfono, mail, motivo de consulta, etc.) → se envía **por WhatsApp** con esos datos → simultáneamente se genera el registro en este apartado de Turnos.
- Manejo similar al de reservas pendientes de un proyecto de referencia del cliente (alojamientos, ver `04-turnos-pacientes-referencia.png`): tabs Pendientes / Confirmadas / Canceladas / Todas, buscador por nombre/DNI/email, y acciones de Cancelar / Editar.
- Al confirmar un turno desde acá, se abre el **mismo modal de "+ Agregar turno"** del calendario, pero con el paciente ya precargado.

### 4.5 Pacientes
- Vista de tabla (mismo formato de referencia que Turnos, `04-turnos-pacientes-referencia.png`).
- Se crea automáticamente una entrada cuando un turno pendiente se agenda en el calendario.
- Al hacer click en un paciente, se despliega:
  - Información personal.
  - Historial de turnos.
  - Turnos activos.
  - Adjunto de historia clínica *(placeholder visual únicamente — sin implementación en el MVP)*.
  - Adjunto de presupuesto de tratamiento *(placeholder visual únicamente — sin implementación en el MVP)*.

---

## 5. Módulo: Edición y deploy de página

- Cada profesional (u organización, a futuro) tiene una página asociada.
- **MVP:** ruta `/clinica-x` dentro del dominio de Mirage.
- **Futuro:** subdominio propio por clínica.
- Se accede desde "Personalizá tu página" en la pantalla de selección de servicios (`02-seleccion-servicios.png`).

### 5.1 Layout del editor (`05-editor-pagina.png`)
- **Derecha:** panel de edición (sidebar desplegable, igual criterio que el de gestión de clínica).
- **Izquierda:** previsualización en vivo.
- La herramienta de edición en sí (personalización real de contenido/diseño) **queda para desarrollo posterior** — en esta fase se define solo el layout y la estructura.

### 5.2 Barra superior de acciones
- **Ver página**: abre la página pública tal como está.
- **Guardar cambios.**
- **Ocultar**: pone la página en modo "en mantenimiento" para los visitantes.
- **Deployar** (solo visible la primera vez): publica la página. Importante para que el buscador público de clínicas (sección 6) no muestre páginas vacías o incompletas.

### 5.3 Plantilla base (fase de prueba, sin editor de diseño aún)
Debe incluir, como estructura fija:
- Sección para sacar/pedir turno.
- Sección "Sobre nosotros" (perfil del profesional/organización — el contenido detallado de esta sección queda pendiente para después).
- Sección de especialidades.

---

## 6. Home general y búsqueda pública

- Apartado de búsqueda de clínicas dentro del sistema Mirage, disponible para clientes finales.
- Búsqueda por:
  - Nombre de la clínica.
  - Nombre del profesional.
  - Especialidad.

---

## 7. Preguntas abiertas / decisiones pendientes

Estos puntos aparecían implícitos o sin resolver en el brief original y conviene definirlos antes de planificar sprints:

1. **Tipos de consulta y colores**: se necesita al menos un segundo tipo de consulta (además de "general") para validar la diferenciación de colores en el calendario. ¿Cuáles son los tipos de consulta reales a soportar en el MVP?
2. **Validación de datos del formulario público** (DNI, teléfono, mail): ¿hay reglas de formato/obligatoriedad ya definidas?
3. **Integración con WhatsApp**: ¿es un link `wa.me` con mensaje prellenado, o una integración con API de WhatsApp Business? Esto cambia bastante el alcance técnico.
4. **Especialidades**: ¿es una lista cerrada predefinida por Mirage, o el profesional puede crear tags libres?
~~5. **Autenticación**~~ — **Resuelto.** Google OAuth + cuenta nativa con verificación de mail, sesiones server-side (no JWT stateless), rate limiting, CAPTCHA y el resto del checklist de seguridad no negociable. Ver sección 3 (flujo), `docs/tradeoffs.md` TR-036 a TR-047, y el repaso punto por punto de seguridad en `docs/feature-sumarte-login-resumen.md`.
~~6. Stack técnico~~ — **Resuelto.** Ver sección 9: se reutiliza tal cual el playbook de Turismo Marcuzzi (`playbook-clinica-dental.md`).

---

## 9. Stack técnico y modo de trabajo

Se reutiliza sin cambios el modo de trabajo ya validado en Turismo Marcuzzi (documentado en detalle en `playbook-clinica-dental.md`, mismo directorio). No es "a evaluar": es la base decidida para arrancar. Resumen aplicado a Dental Mirage:

### 9.1 Stack
- **Backend:** Go + chi + GORM, servicio independiente (`apps/api`).
- **Frontend:** Next.js + TypeScript + Tailwind (`apps/web`) — leer el `AGENTS.md` que genera cada versión de Next antes de escribir código, por posibles breaking changes.
- **DB:** PostgreSQL + `btree_gist`.
- **Monorepo:** `pnpm` (no `npm`) — `apps/api`, `apps/web`, `packages/shared-types`.
- Requiere Docker corriendo (`docker compose up -d`) para Postgres local.

### 9.2 Decisión central de dominio: turnos sin solapamiento
El mismo mecanismo que evitaba dobles reservas de alojamiento en Turismo Marcuzzi aplica directo a la agenda de turnos: constraint `EXCLUDE USING gist` en Postgres sobre el rango horario por profesional. **No es una validación de app, es un constraint de base de datos** — ver sección 4.3.

### 9.3 Arquitectura: BFF, sin excepciones
El navegador nunca llama directo a la API Go. Todo pasa por Server Actions / Route Handlers de Next.js. El cliente HTTP (`lib/api.ts`) es `server-only`, sin prefijo `NEXT_PUBLIC_`. El token de sesión (opaco, validado server-side contra Postgres — ya no JWT stateless, ver TR-037 en `docs/tradeoffs.md`) va en cookie `httpOnly`, nunca en `localStorage`. Cualquier pantalla nueva extiende `lib/api.ts` y se llama desde Server Component/Action — nunca un `fetch` nuevo desde Client Component.

### 9.4 Integraciones externas: interfaz dev/prod
Mismo patrón para cada dependencia externa — storage de archivos, emails, CAPTCHA, OAuth y, en este dominio, **notificaciones/recordatorios de turno por WhatsApp o SMS** (relevante directo para la sección 4.4): interfaz en Go, implementación dev (no-op/log) e implementación prod activada por env var, inyectada desde `main.go`. Esto no resuelve todavía la pregunta abierta #3 (wa.me vs API de WhatsApp Business) — solo define cómo se va a integrar la respuesta, sea cual sea.

### 9.5 Timezone y reglas "vigente"
Cualquier regla del tipo "solo podés X si tenés un turno confirmado/atendido" pasa por un helper `clock.Today()` fijado a Argentina (UTC-3), nunca `time.Now()` directo.

### 9.6 Testing (gate real)
- Backend: tests contra Postgres real (no mocks), cada uno en su propia transacción revertida, `TEST_DATABASE_URL` debe terminar en `_test`.
- Frontend: Vitest + Testing Library + jsdom, todo mockeado a nivel `fetch`/Server Actions.
- **Gate: 80% de cobertura mínimo en ambos lados**, CI falla si no se cumple.

### 9.7 Diseño frontend
Pase de diseño deliberado antes de escribir CSS (paleta con hex concretos, tipografía de display + body + utilitaria, un elemento "firma"). Robar el lenguaje estructural de bungie.net (paneles de bordes duros, tipografía condensada, alto contraste, motion contenido) traducido a un tono de confianza clínica y limpieza — no el look "gamer" literal. Mobile-first, header fijo con altura medida dinámicamente si hay banners condicionales.

### 9.8 Flujo de ramas
`main` (prod) ← solo merge cuando el usuario lo pide explícitamente ("mergeá") · `dev` (integración, push libre) ← `feature/`/`fix/` para trabajo grande, cambios chicos van directo a `dev`. Secuencia de merge a `main` siempre vía `git merge --ff-only`.

### 9.9 Documentación como fuente de verdad
Antes de tocar un módulo nuevo, leer:
- `docs/dental-mirage-spec.md` — este documento.
- `docs/implementation-plan.md` — plan fase por fase (a crear).
- `docs/tradeoffs.md` — decisiones de arquitectura con alternativas descartadas, formato `TR-NNN` (a crear).
- `CLAUDE.md` en la raíz — mapa rápido que apunta a los tres anteriores, sin detalle propio (a crear).

### 9.10 Modo de trabajo
Verificar contra el pipeline completo antes de cada commit (lint + typecheck + build + test+coverage en ambos lados). Ante un bug reportado, pedir el error exacto en vez de adivinar. Corrección de negocio explícita del cliente > preferencia técnica propia — se implementa y se documenta el motivo en `tradeoffs.md`. Anticipar consecuencias obvias de una feature (ej. limpieza de turnos pendientes vencidos) cuando ya existe un patrón análogo en el código para copiar.

---

## 10. Referencias visuales

| Archivo | Contenido |
|---|---|
| `01-home.png` | Home pública de Dental Mirage |
| `02-seleccion-servicios.png` | Pantalla "¿Qué necesitás hoy?" (selección de servicio) |
| `03-calendario.png` | Referencia de calendario/turnero |
| `04-turnos-pacientes-referencia.png` | Referencia de formato tabla (proyecto Marcuzzi_Madryn) para Turnos y Pacientes |
| `05-editor-pagina.png` | Layout del editor de página (previsualización + panel de edición) |

---

## 11. Fase 2 — Calendario avanzado y autogestión de turnos

Con el MVP (secciones 2 a 6) dado por concluido, arranca la Fase 2 sobre el brief del cliente en `docs/fase2-dental-mirage.md`, extendido después con un brief post-QA de 5 ítems más en `docs/fase2.3-extra-dental-mirage.md` (ver ítem 6 más abajo). Plan fase por fase, decisiones de arquitectura y preguntas abiertas: `docs/implementation-plan.md` §11 y `docs/tradeoffs.md` TR-078 a TR-099. Resumen de alcance:

1. **Calendario mobile, vista Semana:** la columna de horas y la fila de días acompañan el scroll en cualquier dirección (horizontal/vertical/diagonal), sin perder de vista dónde está posicionado el usuario.
2. ~~**Vista "pantalla grande" del calendario en mobile**~~ — **descartada por completo** (2026-08-29): falló en el iPhone real del cliente en dos intentos seguidos, revertida sin dejar código a medio construir. Ver TR-085 en `docs/tradeoffs.md`.
3. **Ajustes de calendario:** el profesional configura horario de atención general, tiempo post-consulta **por tipo de consulta** (no un buffer único de clínica — TR-084), y gestiona sus tipos de consulta (nombre/color/duración/tiempo post-consulta/cantidad de sesiones, con CRUD completo) y horarios reservados generales/específicos por día/rango, con motivo opcional — **sin previsualización en vivo** (descartada explícitamente por el cliente a favor de velocidad de uso, TR-084). Implementado y en QA con el cliente; el modal de "Agregar turno"/"Editar turno" ya ofrece horarios realmente disponibles calculados contra horario de atención + horarios reservados + turnos ya agendados, en vez de un campo de hora libre (TR-086). Horarios reservados que se solapan entre sí (o con un turno ya agendado) se agrupan en una única tarjeta "Ver eventos →" con la lista completa al tocarla (TR-089/090) — un turno en conflicto que ya pasó deja de marcarse como urgente y pasa a "resuelto" (TR-090). No se puede crear un horario reservado en el pasado (TR-091); un específico ya vencido se puede eliminar directo desde el calendario, y hay un acceso rápido "+ Reservar horario" en la pantalla principal para dar de alta uno sin entrar a Configuración (TR-091). Un turno resuelto admite marcar si el paciente asistió o estuvo ausente — de forma **irreversible**, con aviso de confirmación (TR-092).
4. **Selección de horario por el paciente:** el formulario público de pedido de turno (spec §4.4) se extiende a un wizard de varios pasos (¿para quién es? → ¿nuevo o ya registrado? → tipo de consulta → horario disponible → datos de contacto) — el turno sigue llegando `pendiente` a la bandeja del profesional (sin cambios en esa regla), ahora con el horario ya propuesto por el paciente. El horario elegido se reserva por 10 minutos apenas se selecciona (confirmado explícitamente por el cliente, TR-080) — otro paciente no puede pedir ese mismo horario mientras el primero completa el formulario. **Sin implementar todavía** — ver el ítem 6 más abajo, que revisa esta descripción antes de que se construya.
5. **Compartir calendario:** un link efímero (1h) que dispara el mismo wizard del ítem 4, sin depender de que el paciente entre por la página pública de la clínica. **Sin implementar todavía.**
6. **Ítems extra de F2.3 (brief post-QA, 2026-09-06):** brief completo en `docs/fase2.3-extra-dental-mirage.md`, plan en `docs/implementation-plan.md` §11.5. Orden de implementación confirmado por el cliente: 2.3.1 → 2.3.2 → 2.3.5 → 2.3.3 → 2.3.4. **2.3.1 implementado y mergeado a `dev`** (TR-094, PR #5): rediseño completo del dashboard "Turnero" — 6 tarjetas (turnos de hoy/próximos/horarios reservados con cuerpo scrolleable y deep-link real al calendario/turno exacto, total confirmados, resueltos, y una nueva "Estadística" con turnos asistidos/ausentes acumulados). **2.3.2 implementado, en QA con el cliente** (TR-095 a TR-099): banner de conflicto en el calendario ("Tenés X turnos en conflicto, tocá para ver"), más tres funciones nuevas pedidas por el cliente durante esa misma QA y fuera del brief original — Autoreservar turnos (reprograma automáticamente turnos en conflicto al próximo horario libre), excepciones de horario de atención visualizadas en el calendario (mismo mecanismo que horarios reservados) y Preferencia de atención por tipo de consulta (ventana horaria que acota la disponibilidad real de un tipo). Los ítems 2.3.3 a 2.3.5 siguen sin implementar: en Turnos, motivo/mail largos pasan a un botón "Ver motivo"/"Ver mail" y se agrega "Ver paciente" + filtro rápido HOY/SEMANA/MES; y el cambio de fondo, que **revisa el ítem 4 de arriba antes de que se construya**: el formulario público deja de crear un turno `pendiente` sin horario — pasa a pedir tipo de consulta + horario disponible en el momento (reusando el cálculo de TR-086) y crea el turno ya `agendado`, de punta a punta. Esto obliga a sacar el estado `pendiente` del todo (Turnos, calendario) y a agregar unicidad de DNI por clínica en `Paciente` (hoy no existe ningún constraint).

**Depende de** (sin cambios de esquema sobre lo existente, todo aditivo — ver `docs/tradeoffs.md` TR-078/TR-080/TR-084/TR-092): `HorarioAtencion`/`BloqueoHorario`/`ReservaTemporal` (tablas nuevas), `TipoConsulta.DuracionMinutos`/`.TiempoPostConsultaMinutos`/`.CantidadSesiones` (campos nuevos, por tipo de consulta — no un buffer único a nivel `Clinic`), `Turno.Asistencia` (columna nueva, nil hasta que se marca desde un turno resuelto, irreversible una vez seteada — TR-092). El exclusion constraint de no-solapamiento (§9.2) no cambia. El significado de `pendiente`/`agendado` (§4.3/§4.4) **si** cambia a partir del ítem 6: el brief post-QA elimina `pendiente` del todo — ver `docs/implementation-plan.md` §11.5 antes de tocar el ítem 4 o el formulario público.
