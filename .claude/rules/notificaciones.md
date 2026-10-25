---
paths:
  - "apps/api/internal/push/**"
  - "apps/api/internal/http/notificaciones.go"
  - "apps/api/internal/http/panel_notificaciones.go"
  - "apps/api/internal/http/turno_publico.go"
  - "apps/api/internal/db/models_notificaciones.go"
  - "apps/api/cmd/vapid/**"
  - "apps/web/public/sw.js"
  - "apps/web/src/components/notificaciones/**"
  - "apps/web/src/app/notificaciones/**"
  - "apps/web/src/app/actions/notificaciones.ts"
  - "apps/web/src/lib/notificaciones.ts"
---

# Notificaciones por cuenta

Se carga cuando la sesión lee o edita la bandeja, el Web Push o la campana (API y web).

## Notificaciones por cuenta (TR-179)

Pedido directo del cliente (2026-09-26). La campana del header abre la bandeja de la CUENTA (Nuevas/Leídas); hoy avisa de turnos que entran por la página pública o por un link compartido, y da la bienvenida. Plan en `implementation-plan.md` §15. Lo que hay que saber antes de tocarla:

- **La bandeja es de la cuenta, no de la clínica** (`notificaciones.user_id`). Toda consulta por id va con `user_id = ?` y responde 404 si no es tuya — está declarada así en `TestAislamiento_LosIDsDeLaURLSeAcotan`.
- **Si sumás un camino por el que un turno entra SOLO** (sin que nadie del panel lo cargue), llamá a `crearNotificacionesDeTurnoNuevo` dentro de la transacción del turno y a `avisarPorPush` después del commit, como `turno_publico.go`. Los turnos cargados desde el panel no avisan a propósito. Y si algo borra turnos, borra también sus notificaciones: `turno_id` no tiene FK (es historial, como `conflictos_paciente`).
- **El aviso es una foto del turno al crearse** (`datos` jsonb). Lo que puede cambiar después —fecha, estado, si la persona sigue en la clínica— lo resuelve `POST /me/notificaciones/{id}/abrir`, que además deja la sesión en la clínica y, para recepción, en el foco donde el turno se ve.
- **`/me/notificaciones/contador` se sondea** (cada 60 s por pestaña visible): es un `COUNT` sobre el índice parcial `idx_notificaciones_nuevas`. No le sumes joins (TR-162).
- **Web Push está hecho con la biblioteca estándar** (`internal/push`, VAPID + `aes128gcm`, verificado contra el vector del RFC 8291). No sumes una librería de JWT para esto (TR-125). Claves: `go run ./cmd/vapid`; con una sola de las dos la API no arranca.
- **El envío va en una goroutine después del commit** y solo toca la base para borrar una suscripción vencida, con el pool. No le agregues consultas: TR-161 sigue valiendo.
- **`public/sw.js` no cachea ni intercepta pedidos** — un service worker que cachea deja a la gente en una versión vieja después de un deploy. Si hace falta offline, es otra decisión.
- **Los avisos al celular son por dispositivo**, y en iPhone solo con PRISMA instalada en la pantalla de inicio (regla de Apple).
