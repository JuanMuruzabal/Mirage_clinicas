# Sumarse + Login con onboarding profesional — resumen de entrega

Cierre de la feature pedida originalmente en `docs/feature-sumarte-login.md` (el prompt inicial, no un documento vivo — sección 11 de ese prompt pedía explícitamente "al final, un resumen de qué cambió, qué variables de entorno hay que configurar, qué quedó preparado para invitaciones, y un repaso explícito de la sección 7"). Este documento, junto con `docs/tradeoffs.md` (TR-036 a TR-047) y las secciones actualizadas de `docs/dental-mirage-spec.md` (§2, §3, §7, §9.3), es la referencia viva de la feature de ahora en más. Rama `feature/sumarte-login`, no mergeada a `dev`/`main` todavía.

## 1. Qué cambió

Reemplazo completo del sumarse/login simple (email+password contra `Profesional`) por: Google OAuth (popup + Authorization Code), cuenta nativa con verificación de mail vía Resend, wizard de onboarding de 3 pasos con persistencia por paso, y un modelo de datos (`User`/`Account`/`ProfessionalProfile`/`Clinic`/`ClinicMember`/`ClinicInvitation`) que soporta tanto clínicas individuales como organizaciones multi-profesional (el segundo caso solo a nivel esquema — ver §3).

Commits (orden de los entregables de la spec §11):

1. Esquema y migraciones — `internal/db/models_auth.go`, `internal/db/migrate_data.go` + `cmd/migrate-usuarios`.
2. Capa de auth y providers — `internal/auth/session.go` (sesiones server-side), `internal/googleauth`, `internal/turnstile`, `internal/ratelimit`, reescritura de `internal/http/auth.go`/`middleware.go`.
3. Módulo de mails — `internal/mail` (Resend + `LogSender` dev + templates HTML).
4. UI de login/registro — `apps/web/src/app/ingresar`, `apps/web/src/components/auth/*`.
5. Wizard de onboarding — `apps/web/src/app/sumarse/*`.
6. Guards, rate limiting y headers — `apps/web/src/middleware.ts`, `requireSession`/`requireClinic`, límites por IP y cuenta.
7. Migración de usuarios existentes — `cmd/migrate-usuarios`, lista para correr contra producción; no hay datos reales que migrar todavía en esta rama.
8. Tests — cobertura agregada del backend 74.9% → 81.5% (gate 80%, ver commit `test(api): cierra el gate de cobertura 80% del backend`).

`Profesional` (modelo y tabla) se mantiene sin borrar a propósito hasta confirmar que `cmd/migrate-usuarios` corrió en producción (TR-039, `docs/tradeoffs.md`).

## 2. Variables de entorno a configurar

Documentadas en detalle en `apps/api/.env.example` y `apps/web/.env.example`. Resumen de lo nuevo de esta feature:

**Backend (`apps/api/.env`):**

| Variable | Obligatoria | Efecto si falta |
|---|---|---|
| `APP_BASE_URL` | Sí (para links de mail correctos) | Los links de verificación/reset quedan mal armados |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | No | Mails solo se loguean (`LogSender`), nunca se envían de verdad |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | El login con Google responde 501 (no configurado) |
| `GOOGLE_REDIRECT_URI` | No (default `postmessage`) | — |
| `TURNSTILE_SECRET_KEY` | No | CAPTCHA deshabilitado (nil-safe) |
| `HIBP_ENABLED` | No (default `false`) | Sin chequeo contra HaveIBeenPwned |
| `STORAGE_DIR` / `STORAGE_R2_*` / `STORAGE_PUBLIC_URL` | No | Storage local de disco; R2 prod no implementado (ver §4) |

**Frontend (`apps/web/.env.local`):**

| Variable | Obligatoria | Efecto si falta |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | No | El botón de Google no se renderiza |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | No | El widget de CAPTCHA no se renderiza |

Ninguna es obligatoria para levantar el proyecto en dev — todo el diseño es nil-safe por dependencia (mismo patrón dev/prod de siempre, spec §9.4 de CLAUDE.md): sin configurar nada, el flujo nativo (registro/login/reset por mail) funciona completo con mails yendo al log.

## 3. Qué quedó preparado para invitaciones (fuera de alcance del MVP, spec §9)

No se implementó envío/aceptación de invitaciones, panel de gestión de miembros, permisos por rol en el resto de la app, ni 2FA — por diseño, la spec pide dejar **solo el esquema y los tipos listos**:

- `ClinicMember` ya soporta más de un usuario por `Clinic` con `Role` (`owner`/`admin`/`profesional`/`recepcion`) y `Status` (`active`/`invited`) — el tipo `union` de roles ya está en `packages/shared-types`.
- `ClinicInvitation` existe como tabla completa (token, email invitado, rol, expiración) pero sin ningún endpoint que la lea o escriba.
- `requireClinic` middleware resuelve la `Clinic` del usuario buscando su fila `ClinicMember{Role: owner}` — cuando exista el módulo de invitaciones, el mismo middleware sirve de base para "cualquier miembro, no solo el owner", solo hay que ampliar el filtro de rol.
- El wizard (Paso 3) ya distingue `individual` vs `organizacion` en la UI, con un aviso informativo de "función disponible próximamente" en el segundo caso — no bloquea el alta, solo no lleva a ningún flujo de invitación real todavía.

## 4. Repaso explícito de la sección 7 (seguridad, no negociable)

| Punto de la spec | Estado | Detalle / justificación |
|---|---|---|
| Cookies `httpOnly`, `Secure`, `SameSite=Lax` | ✅ Implementado | `apps/web/src/lib/session.ts` — `secure` condicionado a `NODE_ENV=production` (permite `http://localhost` en dev) |
| Rotar sesión al login y al verificar mail | ✅ Implementado | Login: sesión siempre nueva. Verificar mail: `auth.RotateSession` revoca la sesión previa si el caller ya traía una |
| Expiración absoluta (30d) e inactividad (7d) | ✅ Implementado | `internal/auth/session.go` — `SessionAbsoluteTTL`/`SessionInactivityTTL` |
| Logout invalida en el servidor | ✅ Implementado | `auth.RevokeSession`, verificado con test (reusar la cookie vieja da 401) |
| Cambio/reset de password invalida otras sesiones | ✅ Implementado | `auth.RevokeAllUserSessions` dentro de la misma transacción del reset |
| argon2id, parámetros en módulo central | ✅ Implementado | `internal/security/password.go`, `DefaultArgon2Params`. Compatibilidad retroactiva con bcrypt legacy (usuarios migrados), con rehash perezoso al loguearse con éxito |
| Password 12–128 caracteres, sin reglas de composición | ✅ Implementado | `validPassword` en `auth.go` |
| HaveIBeenPwned con k-anonymity | ✅ Implementado | `internal/security/pwned.go` — fail-open (nunca bloquea el flujo por un error de red de HIBP), deshabilitado por default en dev (`HIBP_ENABLED=false`) |
| Comparaciones en tiempo constante | ✅ Implementado | `security.ConstantTimeEquals`, `subtle.ConstantTimeCompare` en `verifyArgon2` |
| Tokens: 32 bytes CSPRNG, solo hash SHA-256 en DB | ✅ Implementado | `internal/security/token.go` |
| Un solo uso, expiración corta, invalidar tokens previos | ✅ Implementado | 24h verificación / 1h reset; `createAndSendVerificationToken` invalida tokens sin usar antes de emitir uno nuevo |
| Nunca loguear tokens/passwords/cookies/OAuth tokens | ✅ Implementado | Los logs de request (chi middleware) no incluyen body; el `LogSender` de dev loguea la URL completa del link (incluye el token) **a propósito, solo en dev**, para poder verificar sin mandar mail real — nunca corre en producción con `RESEND_API_KEY` configurada |
| `state` firmado y verificado | ✅ Implementado | `internal/http/oauthstate.go` — HMAC-SHA256, TTL 10 min |
| `nonce` | ❌ No implementado | El flujo elegido (Authorization Code server-to-server, no Implicit/id_token) no recibe un `id_token` del navegador que necesite `nonce` para replay-protection — el código de autorización se canjea directo backend-a-backend con Google, que ya lo ata al `client_id`+`redirect_uri`. `nonce` es la mitigación estándar para el flujo Implicit; no aplica a este flujo tal como está armado |
| PKCE | ❌ No implementado (decisión explícita, aprobada en el plan) | El cliente OAuth es confidencial (el `client_secret` nunca sale del backend Go) — PKCE existe para proteger clients públicos (SPA/mobile) que no pueden guardar un secret. Con `state` firmado + secret confidencial, la protección equivalente ya está cubierta |
| Validar `redirect_uri` contra allowlist | ✅ Implementado (trivialmente) | `GOOGLE_REDIRECT_URI` es un único valor fijo (`postmessage`) configurado del lado del servidor, no algo que el cliente pueda variar por request |
| No confiar en `email_verified` del provider sin chequeo | ✅ Implementado | `google()` handler rechaza explícitamente si `!info.EmailVerified` |
| Rate limiting por IP y por cuenta (login/registro/reenvío/reset/confirmación) | ✅ Implementado | `internal/ratelimit` — límites separados para cada scope, `AccountLimiter` (Postgres) + `IPLimiter` (memoria) |
| Backoff progresivo en login, bloqueo temporal | ✅ Implementado | `ratelimit.LoginBackoff` + ventanas fijas con expiración (nunca permanente) |
| CAPTCHA en registro y reset | ✅ Implementado | Cloudflare Turnstile, nil-disabled sin `TURNSTILE_SECRET_KEY` |
| Anti-enumeración (registro/login/reset) | ✅ Implementado | Mismo mensaje/status exista o no la cuenta; registro nunca crea sesión para un mail ajeno (anti-secuestro de cuenta); única excepción admitida por la spec: "mail no verificado" tras credenciales correctas |
| Autorización: sesión + permiso sobre el recurso, nunca solo sesión | ✅ Implementado | `requireClinic` resuelve el `ClinicID` del propio caller vía su `ClinicMember` — ningún handler de dominio acepta un `clinicId`/`profesionalId` que venga del cliente |
| Helper único `requireClinicMember` reutilizado | ⚠️ Parcial | Se implementó como middleware (`requireClinic`) en vez de un helper de función invocado por handler — mismo efecto (todos los endpoints de dominio pasan por él), pero hoy solo filtra `Role: owner` (única membresía que existe en el MVP). Ampliarlo a roles arbitrarios es el punto de extensión para invitaciones (§3) |
| Validación de schema siempre en el servidor | ✅ Implementado | Los schemas zod del frontend son "defensa en profundidad"; Go es la fuente de verdad final en cada handler |
| CSRF en rutas que mutan estado | ⚠️ Parcial | No hay tokens CSRF explícitos. Mitigación real: (1) `SameSite=Lax` en la cookie de sesión, (2) arquitectura BFF (spec §9.3 CLAUDE.md) — el navegador nunca llama a `apps/api` directo, todo pasa por Server Actions same-origin de Next.js, que ya exigen un header `Origin`/`Referer` propio verificado por el framework. No es un token CSRF dedicado; es la combinación estándar que se usa en Marcuzzi_Madryn |
| Validar `callbackUrl`/`next` contra allowlist | N/D — no aplica | Esta feature no construyó ningún flujo con `callbackUrl`/`next` controlado por el cliente (los redirects post-login/post-registro los decide el servidor según `onboardingStep`, nunca un query param). No hay superficie de open redirect que mitigar |
| Headers: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors` | ✅ Implementado | `apps/web/src/middleware.ts` |
| Foto de perfil: magic bytes, límite tamaño, re-encode, EXIF, URLs firmadas | ❌ No implementado (gap documentado, TR-046) | Existe `internal/storage` (interfaz + disco local) pero **no hay endpoint de subida** todavía — la foto es un campo opcional del Paso 2 que hoy no tiene UI de carga. Se prioriza porque no bloquea el resto del onboarding (spec lo permite: "no bloquea el resto") |
| Secretos solo en env vars del servidor | ✅ Implementado | Ningún secret con prefijo `NEXT_PUBLIC_`; `GOOGLE_CLIENT_SECRET`/`RESEND_API_KEY`/`TURNSTILE_SECRET_KEY` solo en `apps/api` |
| Errores genéricos al usuario, detalle solo en logs | ✅ Implementado | `writeError` nunca expone mensaje de Postgres/Go crudo al cliente |
| Datos personales — Ley 25.326: mínimo necesario, checkbox de términos con fecha/versión | ✅ Implementado | `User.TermsAcceptedAt`/`TermsVersion` |
| Prever borrado de cuenta | ⚠️ Parcial | `User.DeletedAt` (soft-delete de GORM) ya está en el esquema — no existe endpoint ni UI para que un usuario lo dispare. "Prever" se interpreta como dejar el mecanismo listo, no construir el flujo completo (no está en el wizard ni en los criterios de aceptación de la spec) |
| Cambio de mail: verificar la nueva y notificar la vieja | N/D — no aplica | No existe una feature de "cambiar mi email" en este MVP (no está en el wizard, `/perfil` no expone ese campo como editable) — no hay nada que asegurar todavía. El `VerificationTokenEmailVerify` existente serviría de base cuando se construya |
| Log de auditoría de eventos sensibles | ✅ Implementado (en este cierre) | `internal/http/audit.go` + `db.AuditEvent` — cablea `register`/`login`/`login_failed`/`email_verified`/`password_changed`/`logout`/`clinic_created`. El modelo ya traía también `email_changed`/`role_changed`, sin cablear porque esas features no existen todavía (ver dos filas arriba) |
| No librerías de auth/cripto artesanales, correr `npm audit`/`pnpm audit` | ✅ Implementado | Todo el hashing/tokens usa `golang.org/x/crypto` (stdlib extendida), nunca una implementación propia. `pnpm audit` corrido sobre el monorepo al cierre de este resumen: sin vulnerabilidades conocidas |

### Gaps reales a decisión del usuario (no silenciados)

De la tabla anterior, esto es lo que un despliegue a producción **no debería asumir como resuelto** sin decisión explícita:

1. **Foto de perfil** — no hay endpoint de subida ni validación de magic bytes/EXIF (TR-046). Si se necesita antes de lanzar, es trabajo nuevo, no un ajuste menor.
2. **CSRF** — la mitigación es SameSite+BFF, no tokens dedicados. Aceptable si se mantiene la garantía "el navegador nunca llama a la API Go directo"; se vuelve insuficiente el día que se agregue cualquier endpoint que rompa esa invariante.
3. **Helper `requireClinicMember`** — hoy `requireClinic` solo reconoce el rol `owner` (única membresía real en el MVP); ampliarlo a roles arbitrarios es trabajo pendiente para cuando exista el módulo de invitaciones.

## 5. Criterios de aceptación de la spec (§10) — estado

Todos los ítems funcionales y de seguridad de la sección 10 están cubiertos por tests automatizados (backend Go contra Postgres real, frontend Vitest) excepto los dos ítems e2e explícitos ("e2e del happy path de registro nativo y del de Google mockeado") — esos quedan como QA manual, igual que toda ruta bajo `src/app/**/page.tsx` (Server Components, excluidos del gate de cobertura por convención del proyecto).
