# Fase 3.2 — Multi-tenant

**Estado:** en curso, arrancada el 2026-09-13 · **Brief:** `Fase2-fix-Fase3-Multi-tenant.docx` · **Modelo de datos:** [`../../Arquitectura y base/modelo de datos/`](../../Arquitectura%20y%20base/modelo%20de%20datos/)

Entregable 2 del brief: el documento que explica cómo se va aplicando la fase. Se escribe **a medida que avanza**, no al final.

---

## Qué cambia, en una frase

Hasta hoy una clínica **es** un profesional. Desde la Fase 3.2, una clínica **tiene** profesionales, y un profesional puede estar en varias clínicas.

Eso suena a un `JOIN` más y es bastante más: toca la agenda entera, el panel completo, el wizard público y la única garantía que el sistema promete a nivel motor (el no-solapamiento de turnos).

## Lo que ya estaba hecho sin saberlo

El primer hallazgo del relevamiento fue bueno: **`clinic_members` ya existe, ya es N:M y ya tiene los cuatro roles del brief.** Se creó en TR-044 como preparación y nunca se usó — hoy hay 3 usuarios, 3 clínicas y 3 membresías, una por cabeza.

Así que la relación no hay que inventarla. Lo que falta es (a) empezar a usarla, (b) que los roles sean acumulables y (c) bajar la configuración de agenda de la clínica al profesional.

## Lo que el relevamiento corrigió de la documentación

**`profesionales` no está vacía: tiene 12 filas.** CLAUDE.md y TR-131 afirmaban lo contrario. Son registros del MVP original —cuando profesional y clínica eran una sola fila, con `password_hash` propio— huérfanos desde TR-037: ninguno coincide con un `users.id` ni con un `clinics.id`.

No cambia el diseño, pero sí la migración: hay filas que borrar, y eso pasa por el guardián de TR-132. Es la tercera vez en dos semanas que una afirmación de la documentación no coincide con la base; de ahí que este relevamiento se haya hecho sobre `pg_constraint` y conteos reales, no sobre los modelos de Go.

---

## Las decisiones de diseño, y por qué

El detalle completo está en [`er-post-fase3.md`](../../Arquitectura%20y%20base/modelo%20de%20datos/er-post-fase3.md). Las cuatro que definen todo lo demás:

### El reparto no es intuitivo

> *"Los pacientes y los turnos viven dentro de la CLÍNICA, las VISTAS están ancladas al profesional."*

**Los datos del paciente son de la clínica; la configuración de la agenda es del profesional.** Un paciente atendido por dos odontólogos es *una* ficha —no dos—, pero cada odontólogo tiene sus propios tipos de consulta, su horario y sus bloqueos.

"Los pacientes de Lucía" no es una columna: es una derivación de sus turnos. Eso mantiene una sola ficha por persona (que es lo que hace funcionar la detección de conflictos de identidad de la Fase 2.4) y al mismo tiempo permite la vista aislada que pide el brief.

### El no-solapamiento pasa de garantía a bug si no se toca

Hoy el constraint es:

```sql
EXCLUDE USING gist (profesional_id WITH =, rango_horario WITH &&) WHERE (estado = 'agendado')
```

…y `profesional_id` **es la clínica**. Con un solo profesional por clínica daba igual. Con N, rechazaría que dos odontólogos atiendan a las 10:00 en sillones distintos — que es la situación normal de una clínica.

Se muda a `atendido_por_user_id`. Y de paso gana algo que el modelo viejo **no podía ni expresar**: como el constraint nuevo es por usuario y no lleva la clínica, impide que un profesional tenga turnos solapados en **dos clínicas distintas**. Una persona no puede estar en dos lugares a la vez, y ahora el motor lo sabe.

### Las reglas de roles viven en el motor, no en la aplicación

El brief pide roles acumulables ("tomar los roles como tags"), con `recepcion` excluyente respecto de `profesional`. Un índice único parcial lo expresa exactamente:

```sql
CREATE UNIQUE INDEX idx_rol_excluyente ON clinic_member_roles (clinic_member_id)
  WHERE rol IN ('profesional', 'recepcion');
```

Probado contra Postgres 16: sumar `admin` a un `profesional` pasa; sumar `recepcion` falla. Mismo criterio que el no-solapamiento — una regla que no se puede violar no se valida, se declara.

### El renombre que no hay que postergar

`profesional_id` guarda un `clinics.id` en 9 tablas. Hoy es una molestia estética porque no existe ningún profesional distinto de la clínica.

Desde esta fase existe: `turnos` va a tener `profesional_id` (= la clínica) al lado de `atendido_por_user_id` (= el profesional). Dos columnas con nombres parecidos y significados opuestos, en la tabla más tocada del sistema. Cualquiera que escriba `WHERE profesional_id = <el user>` va a obtener cero filas **sin error**.

Se renombra a `clinic_id` antes de agregar la columna nueva, no después.

---

## Plan por subfases

Cada una es implementable, testeable y mergeable por su cuenta. El orden no es negociable: las de abajo dependen de las de arriba.

### 3.2.1 — Esquema y migración

El cambio de modelo completo, sin tocar una sola pantalla.

- Renombre `profesional_id` → `clinic_id` en las 9 tablas, con sus constraints.
- `clinic_member_roles` + el índice de exclusión. Migración de la columna `role` actual.
- `clinic_members.status` suma `removed`.
- `turnos.atendido_por_user_id` + FK compuesta a `clinic_members(clinic_id, user_id)`.
- `user_id` en `tipos_consulta`, `horarios_atencion`, `bloqueos_horario`.
- El `EXCLUDE` se muda a `atendido_por_user_id`.
- Baja de `profesionales` (12 filas) y `profesional_especialidades`, por TR-132.
- Migración de datos: los 39 turnos, 7 tipos y 3 horarios existentes se asignan al `owner` de cada clínica, que hoy es su único profesional.

**Termina cuando:** la suite entera pasa sin cambios de comportamiento. Nadie nota nada desde la UI. Es el mejor momento para equivocarse.

### 3.2.2 — Roles y permisos en el backend

- Resolver los roles de la sesión actual (qué puede hacer este usuario en esta clínica).
- Middleware de autorización por rol, sobre los handlers que ya existen.
- Aislamiento por profesional en los listados: un profesional ve lo suyo, un recepcionista ve todo.
- Tests de aislamiento **entre profesionales de la misma clínica**, además de los que ya existen entre clínicas (TR-129).

**Por qué antes que la UI:** si el backend no aísla, ninguna pantalla lo va a arreglar.

### 3.2.3 — Onboarding y "¿dónde trabajás hoy?"

- El wizard de 2 pasos se deconstruye: crear perfil, y de ahí a elegir dónde trabajar.
- Pantalla de selección de clínica como punto de partida de toda sesión.
- Crear clínica propia vs. unirse a una existente (código de invitación).
- `users.codigo_invitacion`.

### 3.2.4 — Colaboradores

- Tarjeta nueva en "seleccionar servicio".
- Invitar por código (inmediato) o por mail (queda `invited` hasta aceptar).
- Asignación de roles con las reglas de exclusión.
- Los avisos que pide el brief: ya es miembro, ya tiene invitación pendiente.

### 3.2.5 — Panel del profesional

- Selector de clínica en el header, como atajo para cambiar de clínica.
- Componente de colaboradores (sin tiempo real todavía: lista y estado).
- Tipos de consulta compartidos entre colegas, con fuzzy matching sobre el nombre.

### 3.2.6 — Vista del recepcionista

La subfase más grande: cuatro módulos del panel con vista general + por profesional.

- General: estado de cada profesional.
- Calendario: columna por profesional en vista Día, selector con "Vista general" primero.
- Turnos: alcance "Toda la clínica" con columna Profesional, contadores recalculados por alcance.
- Pacientes: columna de profesionales (avatares apilados), filtrado por profesional.
- Elegir profesional **antes** de cargar turno u horario reservado.
- Marcar asistencia anticipada (20 min antes del turno).

### 3.2.7 — Wizard público con selección de profesional

- Bloque de profesionales entre tipo de consulta y día.
- Filtrado por quién ofrece ese tipo de consulta.
- Indicador de proximidad ("Más próximo") con el primer hueco de cada uno.
- Día y horarios ocultos hasta elegir profesional.
- Disponibilidad calculada contra la agenda **del profesional elegido**.

### 3.2.8 — Tiempo real y cierre

- Presencia de colaboradores activos (requisito no funcional).
- Optimización de latencia.
- Snapshot y documentación de cierre.

**Nota sobre el tiempo real:** no es una tabla, es una decisión de transporte (WebSocket / SSE / polling) que interactúa con el hecho de que hoy corre **una sola instancia** del backend — el mismo umbral que tiene anotados otros tres ítems de la auditoría (Redis para el rate-limiter, pool de conexiones, PgBouncer). Conviene decidirlo junto con ellos y no antes.

---

## Bitácora

### 2026-09-13 — Relevamiento y diseño

Hecho: inventario del esquema real (31 tablas, 33 FKs, conteos de filas), diagrama ER pre-Fase 3, modelo post-Fase 3 con las cuatro decisiones, y este plan.

Verificado contra Postgres 16, no solo diseñado:
- El índice único parcial expresa la exclusión de roles del brief (probado en las dos direcciones).
- `idx_clinic_member` ya es único sobre `(clinic_id, user_id)`, que es lo que Postgres exige para aceptar la FK compuesta.

Encontrado: `profesionales` tiene 12 filas huérfanas, no cero como decía la documentación.

Sin tocar código todavía. Siguiente: 3.2.1.
