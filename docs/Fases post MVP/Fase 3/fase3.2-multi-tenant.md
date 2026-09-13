# Fase 3.2 — Multi-tenant

**Estado:** en curso · ✅ **3.2.1 completa (2026-09-13)**, sigue la 3.2.2 · **Brief:** `Fase2-fix-Fase3-Multi-tenant.docx` · **Modelo de datos:** [`../../Arquitectura y base/modelo de datos/`](../../Arquitectura%20y%20base/modelo%20de%20datos/)

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

### 3.2.1 — Esquema y migración ✅

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

### 3.2.2 — Roles y permisos en el backend ✅

- Resolver los roles de la sesión actual (qué puede hacer este usuario en esta clínica).
- Middleware de autorización por rol, sobre los handlers que ya existen.
- Aislamiento por profesional en los listados: un profesional ve lo suyo, un recepcionista ve todo.
- Tests de aislamiento **entre profesionales de la misma clínica**, además de los que ya existen entre clínicas (TR-129).

**Por qué antes que la UI:** si el backend no aísla, ninguna pantalla lo va a arreglar.

### 3.2.3 — Onboarding y "¿dónde trabajás hoy?" ⏳

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

### 2026-09-13 — 3.2.1, paso 1: se van las tablas del MVP

Primera acción de la subfase, y va primero por un motivo concreto: mientras `profesionales` y `profesional_especialidades` existieran, **`profesional_id` significaba dos cosas distintas según la tabla** — en la hija apuntaba a `profesionales`, en las otras nueve a `clinics`. Borrarlas deja un único significado, y recién ahí el renombre del paso 2 es una operación mecánica en vez de una que hay que revisar caso por caso.

Antes de borrar, se caracterizaron las filas en vez de asumir:

| Qué se preguntó | Respuesta |
|---|---|
| ¿Cuándo se crearon? | 22 al 24 de agosto de 2026 — mismas fechas que las 38 huérfanas que borró TR-131 |
| ¿Son cuentas reales? | No: **las 12 con mail `@example.com`** |
| ¿Algo las referencia? | 0 turnos, 0 pacientes |
| ¿Hay un `users` con su mismo mail? | 0 |

También se descubrió por qué nunca se migraron: `MigrateProfesionalesToUsers` se invocaba **a mano** desde `cmd/migrate-usuarios`, no desde `RunMigrations`. Nadie la corrió sobre estas filas, y a esta altura esas cuentas ya estaban muertas de todos modos — el login usa `users`.

Se fue también esa herramienta, con su modelo y sus tests: ya no queda nada de dónde migrar.

**Aplicado sobre la base de desarrollo:** `afectados=13`, tablas borradas, y los datos reales intactos (39 turnos, 9 pacientes, 3 clínicas, 3 usuarios). Verificado después que **ningún `profesional_id` apunta ya a otra cosa que `clinics`**, que era la condición para seguir.

Un detalle del guardián que apareció al escribir el test: `aplicarDestructivaUnaVez` **registra la migración la primera vez que la evalúa aunque no haya nada que destruir**. Es deliberado (no re-evaluar en cada arranque), pero significa que un test sobre una base ya migrada nunca la ve correr — hay que desregistrarla después de plantar los datos, como ya hacía el test de los turnos `pendiente`.

### 2026-09-13 — 3.2.1, paso 2: el renombre

`profesional_id` → `clinic_id` en las nueve tablas que quedaban. 114 usos de `ProfesionalID` en 33 archivos Go y 188 menciones en SQL crudo, en una sola migración.

**El orden dentro de `RunMigrations` es lo único delicado.** El renombre va **antes** del `AutoMigrate`: si GORM corriera primero, vería que falta `clinic_id`, la crearía **vacía** y dejaría los datos en `profesional_id` — una columna nueva sin datos y otra vieja sin usar, en las nueve tablas a la vez. Con el renombre antes, GORM se encuentra el esquema que espera y no toca nada.

La migración es idempotente por tabla (pregunta por la columna vieja antes de tocarla), así que una base recién creada —donde el AutoMigrate ya la hace con el nombre nuevo— pasa de largo.

**Los índices se renombran junto con la columna**, y no por prolijidad: los que GORM genera solo se llaman `idx_<tabla>_<campo>`, así que dejarlos con el nombre viejo habría hecho que el AutoMigrate creara un segundo índice idéntico con el nombre nuevo. Los que tienen nombre propio en el tag (`idx_paciente_dni_unico`, `sin_solapamiento_turno`, los `idx_turno_prof_*`) no hizo falta tocarlos: Postgres actualiza su definición interna al renombrar la columna.

**El contrato con el frontend no cambió.** El renombre tocó el identificador de Go y el `column:` del tag, no los tags `json:` — así que la API sigue respondiendo exactamente lo mismo. Verificado sobre el diff, y confirmado aparte: el frontend no menciona `profesionalId` en ningún lado.

**Un comentario que el `sed` volvió falso, y cómo apareció.** El renombre masivo convirtió *"la columna se llamaba `profesional_id` y guardaba un `clinics.id`"* en *"se llamaba `clinic_id` y guardaba un `clinics.id`"* — una frase que ya no dice nada. Lo mismo en `migrate_destructiva.go`, donde el comentario narra la historia de TR-037. Se corrigieron a mano después del `sed`: **un renombre automático no distingue el código del relato sobre el código**, y los comentarios que explican el pasado son justamente los que quedan mintiendo.

**Aplicado sobre la base de desarrollo:**

| | Antes | Después |
|---|---|---|
| Columnas `profesional_id` | 9 | **0** |
| Columnas `clinic_id` | 5 | **14** |
| Turnos con clínica válida | 39 / 39 | **39 / 39** |
| Pacientes con clínica válida | 9 | **9** |
| Índices `*_profesional_id` duplicados | — | **0** |

Y una prueba funcional contra los contenedores reconstruidos: `/clinicas/{slug}/tipos-consulta` devuelve los tipos de la clínica y `/clinicas/{slug}/disponibilidad` responde 200 — los dos consultan por la columna renombrada.

### 2026-09-13 — 3.2.1, paso 3: los roles pasan a ser tags

`clinic_member_roles`, con la regla de exclusión declarada en el motor:

```sql
CREATE UNIQUE INDEX idx_rol_excluyente ON clinic_member_roles (clinic_member_id)
  WHERE rol IN ('profesional', 'recepcion');
```

Un índice único **parcial**: `owner` y `admin` quedan fuera del `WHERE`, así que se suman libremente, pero nadie puede ser profesional y recepcionista a la vez. Cinco tests cubren las dos direcciones de la exclusión, la acumulación de tres roles, la idempotencia y el caso sin roles (un invitado que todavía no aceptó).

**No quedaron dos fuentes de verdad.** La columna `role` se fue en el mismo paso, y los seis lugares que la consultaban pasaron a usar el scope `db.ConRol(...)`. Dejarla "por ahora" habría sido más rápido y habría creado exactamente la clase de trampa que esta subfase vino a evitar.

**`status` suma `removed`.** La membresía no se borra nunca: la FK compuesta que viene en el paso 4 (`turnos` → `clinic_members`) bloquearía la baja de cualquier profesional con historial. Marcarla deja a la clínica sin darle acceso y al historial intacto.

Ese check hubo que escribirlo en SQL crudo: **GORM AutoMigrate crea checks nuevos pero no modifica los que ya existen**, así que cambiar el tag del modelo no alcanzaba — la base se habría quedado con el check viejo, rechazando `removed` sin que nada avisara.

#### El bug que me comí, que era uno ya documentado

La primera versión dejaba el `INSERT` que copia `role` a la tabla nueva en el bloque de `statements` de `migrate.go`. **Ese bloque corre después de las migraciones destructivas**, así que el `DROP` se ejecutó primero y el `INSERT` no encontró la columna de dónde copiar.

Resultado: **0 roles migrados, columna borrada, sin error y sin aviso.** En la base de desarrollo se llevó puestos los roles de las tres membresías.

Es exactamente el bug de orden que TR-123 y TR-132 documentan, y que el comentario de `migracionesDestructivasPosteriores` advierte dos pantallas más arriba del código que escribí. Saber la regla no alcanzó.

Tres cosas salieron de ahí:

1. **El traslado y el borrado viven en el mismo `Aplicar`**, en ese orden. Ahora es imposible equivocar la secuencia, y además es atómico: misma transacción, o se hace todo o no pasa nada.
2. **Una red de seguridad en `statements`:** cualquier miembro sin ningún rol que sea el dueño de su clínica recupera `owner`. Una clínica sin owner no tiene arreglo desde la aplicación — es justo el rol que `requireClinic` necesita para dejarte entrar al panel.
3. **Un test que lo habría atajado.** No verifica que la columna desaparezca (eso lo hacía pasar la versión rota) sino que sus valores lleguen a la tabla nueva. Usa `recepcion` a propósito: con `owner` la red de seguridad repondría el rol y **enmascararía la pérdida**. Confirmado con control negativo — quitando el traslado, el test falla diciendo `rol migrado = "owner", esperaba "recepcion"`.

**Aplicado sobre la base de desarrollo:** 3 membresías, 3 roles `owner` recuperados, columna `role` borrada, check de `status` aceptando `removed`, índice de exclusión creado. Contenedores reconstruidos, `web:200 api:200`.

### 2026-09-13 - 3.2.1, paso 4: el profesional que atiende, y el EXCLUDE mudado

El paso que toca el requisito no negociable de la spec 4.3.

**`turnos.atendido_por_user_id`**, mas `user_id` en `tipos_consulta`, `horarios_atencion` y `bloqueos_horario`. Todas las filas existentes se asignaron al `owner` de su clinica - que hasta hoy era su unico profesional, asi que el estado queda identico a antes, solo que ahora escrito en la fila en vez de implicito.

**La FK compuesta:**

```sql
FOREIGN KEY (clinic_id, atendido_por_user_id) REFERENCES clinic_members (clinic_id, user_id)
```

No alcanza con que el usuario exista: tiene que ser miembro de **esa** clinica. Es lo que impide, por ejemplo, que un recepcionista con dos clinicas abiertas le cargue por error un turno de una a un profesional de la otra.

**Y el `EXCLUDE` se mudo**, con el `DROP` explicito antes del `ADD`: tienen el mismo nombre, asi que sin el drop el `ADD` se habria salteado en silencio por el `EXCEPTION duplicate_object` y la base se habria quedado con la regla vieja **sin que nada avisara**.

#### El agujero que encontro el test del requisito no negociable

Al mudar la constraint, `TestRunMigrations_RechazaSolapamientoDeTurnosAgendados` empezo a fallar: dos turnos solapados se creaban sin problema.

El motivo es una propiedad de SQL facil de pasar por alto: el constraint compara `atendido_por_user_id WITH =`, y **dos NULL nunca son iguales**. Un turno agendado sin profesional quedaba *fuera* del no-solapamiento - se podian apilar todos los que se quisieran en el mismo horario.

Lo cierra `chk_turno_agendado_profesional`: todo turno `agendado` tiene que decir quien lo atiende. No lo encontro una lectura del codigo sino el test de la regla que el proyecto promete desde el dia uno.

#### Lo que quedo probado

| Test | Que asegura |
|---|---|
| `...RechazaSolapamientoDeTurnosAgendados` | La regla de siempre, ahora por profesional |
| `...TurnoAgendadoExigeProfesional` | Sin profesional no hay turno agendado - si no, el EXCLUDE no aplica |
| `...TurnoDeOtraClinicaNoSeAsignaAlProfesional` | La FK compuesta muerde |
| `...DosProfesionalesAtiendenALaMismaHora` | **El caso que la constraint vieja rechazaba** y que la Fase 3 vuelve normal |

#### Los fixtures de test, y por que no se tocaron 60 call sites

Los helpers que insertan turnos pasaron a resolver el owner de la clinica por dentro (`ownerDePrueba`), asi que los ~60 lugares que los llaman no cambiaron. Dos tests si se ajustaron a mano, y por un motivo que vale anotar: **insertan turnos de clinicas inexistentes a proposito**, para probar que las foreign keys muerden. Como una clinica que no existe no tiene profesional, ahora saltaba primero el check nuevo y el test dejaba de probar lo suyo. Se pasaron a estado `cancelada` -que no exige profesional- y cada uno volvio a aislar exactamente la constraint que le interesa.

**Aplicado sobre la base de desarrollo:**

| | |
|---|---|
| Turnos con profesional | **39 / 39** |
| Tipos de consulta con dueno | **7 / 7** |
| Horarios de atencion con dueno | **3 / 3** |
| Horarios reservados con dueno | **2 / 2** |
| `EXCLUDE` | `(atendido_por_user_id WITH =, rango_horario WITH &&) WHERE estado = 'agendado'` |

Contenedores reconstruidos: `web:200 api:200`, y `/disponibilidad` respondiendo 200.

---

Con esto **la 3.2.1 queda completa**: el modelo soporta N profesionales por clinica y N clinicas por profesional, sin que nada haya cambiado desde la UI. Sigue la 3.2.2, roles y permisos en el backend.

## 3.2.2 — Roles y permisos en el backend

**Fecha:** 2026-09-13 · **Decisión:** `docs/Arquitectura y base/tradeoffs.md` TR-138 · **Código:** `internal/http/middleware.go`, `internal/http/visibilidad.go`

### Pasos 1 y 2: quién entra, y a qué

**El bug que nadie había notado, porque hasta ahora no existían los colaboradores.**

`requireClinic` resolvía la clínica buscando la membresía con rol **owner**. Tenía sentido cuando cada usuario tenía exactamente una clínica y era su dueño. Pero un profesional invitado a una clínica ajena tiene membresía activa y **nunca va a ser su dueño**: el panel entero le respondía 403. No podía ver ni su propia agenda.

Con el multi-tenant eso pasa de detalle a bloqueo total. Ahora vale cualquier membresía **activa**, y los roles quedan en el contexto para que las reglas de autorización decidan sobre ellos.

Verificado con control negativo: con el `requireClinic` viejo, el test del colaborador falla con `403 completá el alta de tu clínica`.

**Qué clínica, cuando hay varias.** Por ahora la más antigua, de forma determinista. La elección explícita llega en la 3.2.3 ("¿dónde trabajás hoy?"), que la va a guardar en la sesión; hasta entonces no cambia nada para quien tiene una sola, que es el caso de todos.

**Una membresía activa sin roles no entra.** No debería existir, pero si existiera dejaría a la persona adentro del panel sin que ninguna regla pueda decidir nada sobre ella. Se trata como onboarding incompleto.

### El titular tenía menos roles de los que el brief le da

El brief es explícito: *"la tarjeta del titular... por default siempre tiene el rol de profesional y con el rol de administrador de página"*. El onboarding le asignaba solo `owner`.

Mientras nada exigiera roles, daba igual. Apenas la página de la clínica empezó a pedir `admin`, **el titular se habría quedado afuera de su propia web**. Ahora el alta asigna los tres, y una migración se los repone a los owners que ya existían — sin ella, los tres titulares de la base de desarrollo habrían perdido el acceso en el mismo deploy que introdujo la regla.

`owner` no es "un nivel más alto" de los otros dos: es lo que habilita a invitar colaboradores y repartir roles. Son tags, como pide el brief.

### Lo que quedó protegido

| Ruta | Quién |
|---|---|
| `/panel/pagina*` | `admin` — *"la tarjeta administrador de página solo la puede ver los que tienen rol de administrador de página"* |
| El resto del panel | Cualquier miembro activo con al menos un rol |

El 403 de `requireRol` dice **qué hace falta**, no qué tiene la persona: informar los roles propios no le aporta nada a quien ya los conoce, y le confirma a quien no debería estar ahí cómo está armado el modelo de permisos.

### Un test que pasaba por la razón equivocada

El primero que escribí para "un admin sí puede administrar la página" verificaba `!= 403`. La ruta que usé no existía, así que devolvía **404** y el test pasaba igual, sin haber probado nada.

Se vio porque su par —el que espera 403 para el profesional— falló con "status = 404, esperaba 403". Los dos pasan ahora exigiendo **200 explícito**. Una aserción negativa (`!= algo`) es verdadera por demasiados motivos; en un test de permisos eso es justo lo que no se puede permitir.

**Aplicado sobre la base de desarrollo:** los 3 titulares pasaron de `owner` a `admin+owner+profesional`. 12 paquetes en verde, gofmt + golangci-lint 0 issues.

### Paso 3: el aislamiento entre colegas

El brief lo pide en mayúsculas: *"CADA COMPONENTE DEL PANEL DE CADA PROFESIONAL, ES AISLADO DEL RESTO DE PROFESIONALES"*.

Los tests de aislamiento que ya existían (TR-129) son entre **clínicas distintas**. Entre colegas de la misma clínica no había ninguno, porque hasta esta fase no había colegas.

**Quién ve todo:** recepción, por definición del brief, y quien administra la clínica (owner, admin), que necesitan la vista completa para reasignar turnos y resolver conflictos.

**Por qué vive en un scope y no en cada handler.** Son 17 queries de turnos y 8 de pacientes filtrando por clínica. Repetir la condición en cada una garantiza que alguna quede sin ella, y **una fuga de aislamiento no se nota mirando la pantalla**: los datos aparecen, simplemente son de más gente de la que corresponde. Concentrarlo en `soloMisTurnos` / `soloMisPacientes` (`internal/http/visibilidad.go`) deja un solo lugar que auditar, y un solo lugar que cambiar cuando la 3.2.6 sume la vista del recepcionista por profesional.

**Los pacientes son de la clínica, no del profesional** (TR-137), así que "los pacientes de Lucía" no es una columna: son los que tienen algún turno con ella. Eso mantiene una sola ficha por persona —de lo que depende la detección de conflictos de identidad de la Fase 2.4— y a la vez permite la vista aislada.

**La ficha de un paciente ajeno devuelve 404, no 403.** Que exista no es información que ese profesional deba tener.

#### El control negativo, y el primer intento que no probaba nada

Para verificar que los tests detectan una fuga, se rompió el aislamiento a propósito. El primer intento —hacer que `veTodaLaClinica` devolviera `true` siempre— dejó un import sin usar, **el paquete no compiló y los tests no corrieron**: la salida vacía parecía un "pasa igual" y era un "no se ejecutó nada".

El segundo intento sumó `RoleProfesional` a la lista de quienes ven todo, que compila y reproduce exactamente la fuga. Ahí sí aparecieron los dos fallos esperados, y el body del 200 mostró lo que se filtraría: la ficha completa del paciente de un colega, con su historial de turnos.

**La lección es sobre el control negativo en sí:** si al romper el código la salida queda vacía, lo primero que hay que descartar es que el test no haya corrido. Un control negativo que no falla no prueba que el test sirva; puede estar probando que no compila.

**Aplicado:** 12 paquetes en verde, gofmt + golangci-lint 0 issues, contenedores reconstruidos (web:200 api:200).

### Con esto la 3.2.2 queda completa

Lo que cambió, en una línea: **el backend ya sabe quién es cada quien dentro de una clínica, y qué puede ver.** Un colaborador invitado entra al panel; el titular tiene los tres roles que el brief le da; la página de la clínica es de quien la administra; y un profesional ve sus turnos y sus pacientes, no los de sus colegas.

Nada de esto se ve todavía desde la UI, por el mismo motivo que la 3.2.1: no hay pantalla que muestre un colaborador porque todavía no se puede invitar a ninguno. Eso llega en la 3.2.4. Lo que sí queda es que **cuando lleguen, el backend ya los aísla** — y no al revés, que es el orden en que estos errores se vuelven filtraciones de datos de pacientes.

**8 tests nuevos** (`middleware_permisos_test.go`, `visibilidad_test.go`), 12 paquetes en verde. Sigue la **3.2.3 — onboarding y "¿dónde trabajás hoy?"**, que es la primera de la fase que se ve en pantalla.

## 3.2.3 — Onboarding y "¿dónde trabajás hoy?"

**Fecha:** 2026-09-13 · **Código:** `internal/http/mis_clinicas.go`, `internal/db/codigo_invitacion.go`

La primera subfase de la 3.2 que se ve en pantalla. El brief la define en una línea: *"al iniciar sesión o abrir la aplicación con una sesión activa siempre me llevará a este apartado, este siempre será el inicio de partida."*

### Paso 1: la clínica deja de deducirse y pasa a elegirse

Hasta acá, "en qué clínica estoy" lo resolvía un `ORDER BY created_at` — la membresía activa más antigua (3.2.2). Con una clínica por persona daba igual. Con dos, equivocarse significa ver, y cargar, los pacientes de otro lugar.

**La elección vive en la SESIÓN** (`sessions.clinic_id`), no en el usuario. Dos sesiones abiertas —la del consultorio y la del celular— pueden estar en clínicas distintas sin pisarse, que es exactamente lo que hace alguien que atiende en dos lugares el mismo día.

**Y no se cree por sí sola.** `membresiaDeLaSesion` busca la clínica elegida *junto con* la membresía activa: si a la persona la sacaron del equipo después de elegirla, la consulta no encuentra nada y cae al criterio viejo. Sin eso, bastaría con elegir una clínica antes de que te saquen para seguir viendo sus pacientes hasta cerrar sesión. Hay un test que lo prueba.

`/me` devuelve ahora la clínica **activa** y no la propia. Era lo mismo mientras cada persona tenía una sola y era su dueña; con el multi-tenant, el header del panel habría seguido mostrando la clínica propia mientras la persona trabajaba en la de un colega.

### El código de invitación, y por qué vive en el usuario

El mockup lo muestra como `DM-XXXX-XXXX`; acá es **`PR-`**, porque el mockup es anterior al cambio de nombre del producto.

La dirección del pedido es lo que decide dónde vive: acá **el profesional se ofrece** y la clínica lo carga (3.2.4), al revés que una invitación por mail, donde la clínica convoca. Por eso es una columna de `users` y no una fila de invitación.

Tres decisiones chicas, cada una por un motivo concreto:

- **Alfabeto sin I, O, 0 ni 1.** El código se dicta por teléfono y se vuelve a tipear del otro lado; O/0 e I/1/l son la forma más probable de que un código válido sea rechazado. (El módulo no introduce sesgo: 256 es múltiplo exacto de 32.)
- **Uno solo vigente por persona.** "Generar otro" invalida el anterior — es justamente lo que se espera cuando el primero se compartió por donde no debía.
- **Vence a las 24 horas**, y uno vencido no se muestra: mostrarlo invita a compartir algo que del otro lado no va a funcionar.

### El agujero que dejó la 3.2.2, encontrado por un test

El test que verifica que el panel sigue la elección de clínica cargaba un paciente y lo buscaba en el listado. **No aparecía.**

No era el cambio nuevo: era `soloMisPacientes` (3.2.2). "Mis pacientes" se derivaba SOLO de los turnos, y una ficha recién cargada con "+ Agregar paciente" todavía no tiene ninguno. Un profesional invitado cargaba a una persona y **la ficha desaparecía de su listado en el mismo instante**, sin ningún error: para él, el alta simplemente no había funcionado. Y el caso no es rebuscado — cargar la ficha primero y dar el turno después es el orden de cualquiera que tiene al paciente en el mostrador.

Se arregla con `pacientes.creado_por_user_id`, que **no** convierte al profesional en dueño del paciente (siguen siendo de la clínica, TR-137): solo dice quién cargó la ficha, para que el scope la incluya antes de que exista el primer turno.

Lo que enseña es sobre el alcance de la verificación de la 3.2.2, no sobre el scope: aquellos tests probaban que un profesional no ve lo ajeno, y ninguno probaba que **sí ve lo propio**. Una regla de aislamiento se puede cumplir al 100% dejando a todos sin ver nada.

**Verificado con control negativo:** volviendo el scope a la versión de la 3.2.2 —que compila— los dos tests fallan con el mensaje correcto; el de la fuga sigue pasando, así que el arreglo no abrió el aislamiento.

**Aplicado:** 12 paquetes en verde, gofmt + golangci-lint 0 issues. Un test existente cambió de expectativa a propósito: crear una segunda clínica propia ahora responde **409** en vez de 403, porque el rechazo dejó de ser "estás en el paso equivocado del wizard" y pasó a ser "ese recurso ya existe".

