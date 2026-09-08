---
description: Rediseña el flujo de "Sumarse" y "Login" con Google OAuth, verificación de mail vía Resend y onboarding en 3 pasos (Cuenta → Perfil profesional → Tu clínica)
argument-hint: [ruta opcional al repo de referencia Alojamientos Madryn]
---

# Feature: Sumarse + Login con onboarding profesional

> **Completar antes de ejecutar** (reemplazar los valores entre `<>`):
> - Repo de referencia visual: `<ruta/al/repo/alojamientos-madryn>`
> - Si ya hay librería de auth definida, indicarla acá: `<NextAuth v5 / Better Auth / Supabase Auth / Lucia / propia>`. Si no, proponer una en el plan y esperar aprobación.

---

## 0. Antes de escribir una sola línea de código

No implementes nada todavía. Primero:

1. **Mapear lo existente.** Recorré el proyecto y listame:
   - Dónde vive hoy el flujo de "sumarse" y de "login" (rutas, componentes, server actions/endpoints).
   - Cómo se persiste hoy la sesión y el usuario.
   - El esquema actual de base de datos relacionado a usuario / especialidad / clínica.
   - Qué librerías de UI, formularios y validación ya están instaladas (no agregues dependencias que dupliquen algo existente).
2. **Estudiar la referencia.** Leé el frontend de **Alojamientos Madryn** y extraé el sistema de diseño del flujo de auth y onboarding: layout de la pantalla (split screen / card centrada / hero lateral), tipografías y escalas, espaciados, radios, sombras, estilo de inputs y de estados de error, botones sociales, stepper/indicador de progreso, transiciones entre pasos, comportamiento en mobile. Documentá esos hallazgos en una lista corta antes de proponer nada.
3. **Entregar un plan** con: decisiones de arquitectura, migraciones de base de datos, archivos nuevos y modificados, y estrategia de migración de los usuarios que ya existen. **Esperá mi aprobación antes de implementar.**

---

## 1. Objetivo

Reemplazar el "sumarse" y "login" simple actual por un flujo completo de alta con onboarding en tres pasos, visualmente alineado a Alojamientos Madryn, y con un modelo de datos que soporte clínicas individuales y organizaciones con múltiples colaboradores.

## 2. Autenticación

- **Google OAuth**: botón "Continuar con Google" tanto para crear cuenta como para iniciar sesión. El mismo botón resuelve ambos casos (si el mail no existe, crea la cuenta; si existe y ya está vinculada, entra).
- **Cuenta nativa** (email + contraseña):
  - Validación de fuerza de contraseña en cliente y servidor. Hash con la librería estándar del stack (argon2/bcrypt), nunca en texto plano.
  - Al registrarse se crea el usuario en estado **no verificado** y se envía mail de confirmación con **Resend**.
  - Token de verificación de un solo uso, aleatorio y hasheado en base de datos, con expiración de 24 h.
  - Página de "revisá tu correo" con opción de reenviar (rate limit: máximo 1 reenvío cada 60 s, 5 por hora por cuenta).
  - Ruta de confirmación que valida el token, marca el mail como verificado, invalida el token y deja la sesión iniciada.
- **Vinculación de cuentas**: si alguien se registró con mail y después entra con Google usando el mismo mail (ya verificado), vincular ambos providers al mismo usuario en lugar de crear un duplicado. Si el mail nativo todavía no está verificado, pedir verificación antes de vincular.
- **Recuperar contraseña** con el mismo mecanismo de token + Resend.
- Manejo explícito de errores de OAuth (cancelado, mail sin permiso, provider caído) con mensajes en español.

## 3. Modelo de datos

Diseñá las migraciones respetando lo que ya existe. Entidades mínimas:

- **User**: id, email, emailVerifiedAt, passwordHash (nullable), createdAt, onboardingStep / onboardingCompletedAt.
- **Account** (providers OAuth): userId, provider, providerAccountId, tokens. Unique por (provider, providerAccountId).
- **VerificationToken**: identifier, tokenHash, type (`email_verify` | `password_reset`), expiresAt, usedAt.
- **ProfessionalProfile**: userId (1:1), nombre, apellido, teléfono (con código de país), documento, matrícula profesional (nacional y/o provincial), especialidad(es) — pasar de una sola especialidad a **relación múltiple**, migrando el dato actual —, años de experiencia, bio corta, foto de perfil, idiomas de atención.
- **Clinic**: id, nombre, tipo (`individual` | `organizacion`), dirección, ciudad, provincia, teléfono de contacto, ownerId, createdAt.
- **ClinicMember**: clinicId, userId, role (`owner` | `admin` | `profesional` | `recepcion`), status (`active` | `invited`), joinedAt. Al crear la clínica, el usuario queda como `owner` activo.
- **ClinicInvitation** (solo tabla + tipos, sin UI todavía): clinicId, email, role, tokenHash, expiresAt, acceptedAt, invitedByUserId.

Roles definidos como enum/tipo compartido y consumidos desde una única fuente de verdad, para que el módulo de invitaciones futuro no requiera refactor.

## 4. Flujo de "Sumarse" (wizard de 3 pasos)

Stepper visible y persistente en los tres pasos, con estados completado / actual / pendiente, siguiendo el lenguaje visual de Madryn.

**Paso 1 — Crear cuenta**
Google o email + contraseña. Con email, el paso no se da por cerrado hasta que el mail esté verificado. Con Google, se considera verificado y pasa directo al paso 2.

**Paso 2 — Perfil profesional**
Formulario con todos los campos de `ProfessionalProfile`. Obligatorios: nombre, apellido, teléfono, al menos una especialidad y matrícula. El resto opcional pero visible. Selector de especialidades con búsqueda y multiselección. Input de teléfono con selector de país (default Argentina).

**Paso 3 — Tu clínica**
Primero la elección de tipo, presentada como dos **cards seleccionables** grandes (no un `<select>`), cada una con ícono, título y descripción:
- *Clínica individual* — "Trabajás solo/a. Vos gestionás tu agenda y tus pacientes."
- *Organización* — "Varios profesionales. Vas a poder invitar colaboradores con distintos roles."

Según la elección se muestran los campos de la clínica. En "Organización", agregar un aviso informativo de que la invitación de colaboradores estará disponible desde el panel (sin implementar el envío ahora).

**Persistencia y navegación**
- Cada paso guarda al avanzar; si el usuario cierra el navegador vuelve exactamente al paso donde estaba.
- Se puede volver atrás y editar sin perder datos.
- Middleware/guard: usuario autenticado con onboarding incompleto → redirige al paso pendiente. Onboarding completo → no puede volver al wizard.
- Al terminar el paso 3, redirigir al dashboard con un estado de bienvenida.

## 5. Login

Pantalla separada, mismo layout base que "Sumarse": Google + email/contraseña, link a recuperar contraseña y a crear cuenta. Si el usuario existe pero no verificó el mail, mostrar el estado correspondiente con acción de reenvío en lugar de un error genérico.

## 6. Emails (Resend)

- Cliente de Resend centralizado en un módulo, con `from`, dominio y API key por variables de entorno.
- Plantillas: verificación de cuenta, recuperación de contraseña, bienvenida al completar el onboarding. Estilo consistente con la marca del proyecto de clínicas.
- Los envíos nunca deben tumbar el request: si Resend falla, loguear y devolver un estado manejable en UI.
- Documentar en el README las variables nuevas y agregarlas a `.env.example`.

## 7. Seguridad (no negociable)

Todo lo de esta sección se implementa sí o sí. Si algo entra en conflicto con la comodidad de la UX, avisame en el plan en vez de resolverlo por tu cuenta.

**Sesiones**
- Cookies `httpOnly`, `Secure`, `SameSite=Lax`, `path=/`. Nunca guardar tokens de sesión en `localStorage`.
- Rotar el identificador de sesión al iniciar sesión y al verificar el mail (previene session fixation).
- Expiración absoluta (30 días) e inactividad (7 días). Logout invalida la sesión **en el servidor**, no solo borra la cookie.
- Cambio de contraseña o reset → invalidar todas las demás sesiones activas del usuario.

**Contraseñas**
- Hash con **argon2id** (o bcrypt cost ≥ 12 si argon2 no está disponible), parámetros definidos en un módulo central.
- Mínimo 12 caracteres, sin reglas de composición arbitrarias, sin límite máximo bajo (aceptar hasta 128).
- Chequear contra contraseñas filtradas usando la API de HaveIBeenPwned con k-anonymity (solo se envía el prefijo del hash, nunca la contraseña).
- Comparaciones en tiempo constante.

**Tokens (verificación e invitaciones)**
- 32 bytes de CSPRNG, codificados en base64url. En base de datos se guarda **solo el hash** (SHA-256), nunca el token en claro.
- Un solo uso, expiración corta (24 h verificación, 1 h reset), comparación en tiempo constante, invalidación de tokens previos al emitir uno nuevo.
- Nunca loguear tokens, contraseñas, cookies ni access tokens de OAuth.

**OAuth**
- Parámetro `state` firmado y verificado, `nonce`, y **PKCE**. Validar el `redirect_uri` contra allowlist.
- No confiar en el `email_verified` del provider sin chequearlo explícitamente antes de vincular cuentas.

**Rate limiting y abuso**
- Límites por IP **y** por cuenta en: login, registro, reenvío de verificación, reset de contraseña, y el endpoint de confirmación de token.
- Backoff progresivo tras intentos fallidos de login; bloqueo temporal (no permanente, para evitar DoS contra usuarios legítimos).
- CAPTCHA (Cloudflare Turnstile o hCaptcha) en registro y reset de contraseña.

**Prevención de enumeración de usuarios**
- Registro, login y reset devuelven respuestas y tiempos indistinguibles exista o no el mail. El mensaje al pedir reset es siempre "si el mail está registrado, te enviamos las instrucciones".
- La única excepción admitida es el estado "mail no verificado" tras un login con credenciales correctas.

**Autorización**
- Cada server action / endpoint valida **sesión + permiso sobre el recurso**, nunca solo sesión. Prohibido confiar en IDs que vengan del cliente sin verificar pertenencia (IDOR).
- Helper único tipo `requireClinicMember(clinicId, rolesPermitidos)` reutilizado en todos lados, para que el módulo de invitaciones futuro herede el mismo control.
- La validación con schema corre **siempre en el servidor**, aunque ya haya corrido en el cliente.

**Protección de la app**
- Protección CSRF en todas las rutas que mutan estado.
- Validar `callbackUrl` / `next` contra allowlist de rutas internas para evitar open redirect.
- Headers: CSP sin `unsafe-inline` donde sea viable, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`.
- Foto de perfil: validar tipo por *magic bytes* (no por extensión ni Content-Type), límite de tamaño, re-encodear la imagen y limpiar EXIF, servir desde storage con URLs firmadas.
- Secretos solo en variables de entorno del servidor. Nada de claves en el bundle del cliente ni prefijadas como públicas por error.
- Errores hacia el usuario genéricos; stack traces y detalles de base de datos solo al log del servidor.

**Datos personales**
- Matrícula, documento y teléfono son datos personales bajo la Ley 25.326 (Argentina): recolectar solo lo necesario, checkbox explícito de aceptación de términos y política de privacidad al crear la cuenta (con fecha y versión guardadas), y prever borrado de cuenta.
- Cambio de mail requiere verificar la dirección nueva **y** notificar a la anterior.
- Log de auditoría de eventos sensibles (login, login fallido, cambio de contraseña, cambio de mail, creación de clínica, cambios de rol) con userId, IP, user-agent y timestamp — sin datos sensibles ni secretos.

**Dependencias**
- No agregar librerías de auth o cripto artesanales. Usar las implementaciones estándar del ecosistema y correr `npm audit` al final.

## 8. Frontend

- Reutilizar el `AuthLayout` / shell derivado de Madryn para login, registro, wizard, verificación y recuperación.
- Formularios con la librería de forms + validación por schema ya presente en el proyecto (o `react-hook-form` + `zod` si no hay), con el **mismo schema compartido entre cliente y servidor**.
- Estados obligatorios en cada pantalla: loading, error de campo, error global, éxito, y disabled del submit mientras se envía.
- Mobile first, navegable por teclado, labels asociados, `aria-invalid` y errores anunciados. Foco al primer campo con error.
- Textos de UI en español rioplatense, tuteo, sin jerga técnica.

## 9. Fuera de alcance

No implementar: envío y aceptación de invitaciones, panel de gestión de miembros, permisos por rol en el resto de la app, 2FA. Solo dejar el esquema y los tipos listos.

## 10. Criterios de aceptación

- [ ] Alta con Google en menos de 3 clics hasta el paso 2.
- [ ] Alta nativa envía mail por Resend; el link verifica, inicia sesión y avanza al paso 2.
- [ ] Token vencido, ya usado o inválido muestra pantalla de error con opción de reenviar.
- [ ] Mismo mail por Google y por registro nativo termina en un único usuario con dos providers.
- [ ] El wizard retoma en el paso correcto tras cerrar y reabrir sesión.
- [ ] La especialidad única existente quedó migrada a la relación múltiple sin pérdida de datos.
- [ ] Crear clínica genera el `ClinicMember` con rol `owner`.
- [ ] Usuarios ya registrados antes de esta feature entran sin romperse y son enviados a completar los pasos faltantes.
- [ ] Login, registro y wizard son coherentes visualmente con Madryn en desktop y mobile.
- [ ] Tests: unitarios de los schemas de validación y de la lógica de tokens; e2e del happy path de registro nativo y del de Google mockeado.

**Seguridad**
- [ ] Un token de verificación usado dos veces falla la segunda vez.
- [ ] Cambiar la contraseña cierra las sesiones abiertas en otros dispositivos.
- [ ] Pedir reset con un mail inexistente responde igual (y en tiempo similar) que con uno existente.
- [ ] Un usuario autenticado no puede leer ni modificar datos de una clínica de la que no es miembro (test explícito de IDOR).
- [ ] Superar el límite de intentos de login devuelve 429 y no filtra si el mail existe.
- [ ] Ningún token, contraseña ni secreto aparece en los logs ni en el bundle del cliente.
- [ ] `callbackUrl` apuntando a un dominio externo es rechazado.

## 11. Entregables

Implementá por commits chicos y ordenados: (1) esquema y migraciones, (2) capa de auth y providers, (3) módulo de mails, (4) UI de login/registro, (5) wizard de onboarding, (6) guards, rate limiting y headers de seguridad, (7) migración de usuarios existentes, (8) tests. Al final, un resumen de qué cambió, qué variables de entorno hay que configurar, qué quedó preparado para invitaciones, y un repaso explícito de la sección 7 marcando qué quedó implementado y qué quedó pendiente con su justificación.
