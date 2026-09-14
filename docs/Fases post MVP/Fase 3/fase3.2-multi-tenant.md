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

### 3.2.3 — Onboarding y "¿dónde trabajás hoy?" ✅

- El wizard de 2 pasos se deconstruye: crear perfil, y de ahí a elegir dónde trabajar.
- Pantalla de selección de clínica como punto de partida de toda sesión.
- Crear clínica propia vs. unirse a una existente (código de invitación).
- `users.codigo_invitacion`.

### 3.2.4 — Colaboradores ✅

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

**Quién ve todo:** ~~recepción, y quien administra la clínica (owner, admin)~~ → **solo recepción**. Ver la corrección del 2026-09-14 al final de esta bitácora: incluir a `owner` y `admin` fue una interpretación mía que contradecía el propio brief.

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

**Fecha:** 2026-09-13 · **Decisión:** `docs/Arquitectura y base/tradeoffs.md` TR-139 · **Código:** `internal/http/mis_clinicas.go`, `apps/web/src/app/clinicas/`

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

### Paso 2: la pantalla, y el wizard que se deshace

`/clinicas` pasa a ser el destino de todo: del login, del alta de cuenta, de abrir la app con sesión activa, y del botón del header. `/seleccionar-servicio` —que era ese destino desde TR-057— queda un paso más adelante, cuando ya se sabe en qué clínica se está trabajando.

**Lo que se rompió a propósito: el modal de bienvenida.** Tenía dos pasos, perfil y clínica, y no se podía salir sin completar los dos. El perfil sigue igual —sin nombre ni matrícula no hay nada que mostrarle a un paciente—; el de la clínica se fue a la pantalla nueva como **una opción más**.

El motivo no es de diseño sino de flujo: a la app también se entra porque un colega te sumó a la suya. Con el modal viejo, esa persona quedaba **encerrada creando una clínica que no quería** para poder llegar a la pantalla donde aceptar la invitación. Es un caso que no existía hasta esta fase y que la 3.2.4 vuelve corriente.

**La pantalla** sigue el mockup: "Mi clínica" arriba —o la invitación a crearla, si no tiene—, "Otras clínicas" abajo con su estado vacío, y la tarjeta para generar el código. Lo único que se apartó del mockup es el prefijo del código: dice `PR-` y no `DM-`, porque el mockup es anterior al cambio de nombre del producto.

### Paso 3: saber dónde estoy parado

Tres cambios chicos, todos del mismo problema: con N clínicas, **entrar a la equivocada y no notarlo** es el error caro de esta fase.

- `/seleccionar-servicio` muestra la clínica activa destacada, con un "Cambiar de clínica" al lado (pedido textual del brief).
- En esa pantalla el logo deja de llevar a la home pública y pasa a decir **"Clínicas"**, volviendo al selector.
- En `/clinicas` el nombre del producto queda como **texto, sin link**: "una vez iniciado sesión, para volver al home se deberá cerrar sesión" (brief). La salida al sitio público es deliberadamente cerrar sesión, que el menú de configuración ofrece.
- Las tarjetas pasan a llamarse "Gestión de clínica" y "Personalización de página", y el botón del header, "Mis clínicas" → `/clinicas`. Antes llevaba directo a `/seleccionar-servicio`, salteando la elección — y para una cuenta sin terminar, rebotaba de vuelta.

### Con esto la 3.2.3 queda completa

**1039 tests frontend** (18 nuevos entre la pantalla, sus acciones y el modal de perfil), 12 paquetes de backend en verde, gofmt + golangci-lint 0 issues, contenedores reconstruidos y esquema verificado contra la base real (`sessions.clinic_id`, `users.codigo_invitacion`, `pacientes.creado_por_user_id`, el índice único parcial y las dos FK en `SET NULL`).

Cuatro tests existentes cambiaron de expectativa a propósito, y vale dejar claro cuáles: los redirects post-auth ahora apuntan a `/clinicas`, y el logo de `/seleccionar-servicio` apunta al selector. No son ajustes para que pase la suite: son la decisión de la fase, escrita donde se verifica.

**Lo que queda declarado como pendiente:** el brief pide que al crear una clínica de tipo "organización" el camino siga en la pantalla de colaboradores. Esa pantalla es la **3.2.4**; hasta entonces los dos tipos terminan igual, en `/seleccionar-servicio`.

Sigue la **3.2.4 — colaboradores**: invitar por código o por mail, con los roles y sus reglas de exclusión. Es la que le da sentido al código que esta fase ya genera.

### Ronda de QA del 2026-09-13 — el bug del header y el rediseño de los tres formularios

Pedido del cliente sobre la entrega anterior. La fuente original es `cambios_modal.txt`, **un archivo temporal que se va a borrar**: el contenido que importaba está transcrito acá y citado en los comentarios del código que cambió, así que no queda nada colgando de él.

#### El bug: "Mis clínicas" adentro de /clinicas

El header ofrecía ir a la pantalla en la que la persona ya estaba parada. **Solo pasaba sin ninguna clínica cargada**, y ese "solo" es la explicación: el botón se muestra cuando la ruta no cuenta como "de herramienta", y esa condición exige **onboarding completo**. Sin clínica, el onboarding está incompleto — así que la misma pantalla cambiaba de header según el estado de la cuenta.

Arreglado con dos reglas explícitas en vez de una derivada: nunca ofrecer `/clinicas` estando en `/clinicas`, y mostrar ahí el menú de configuración con cualquier sesión — es el único acceso a "Cerrar sesión", que en esa pantalla no es un detalle: el brief hace de cerrar sesión la forma deliberada de volver al sitio público, porque el nombre del producto deja de ser un link.

#### Pantalla de registro

- **El stepper** pasa a círculos unidos por una línea, con la etiqueta debajo y el activo relleno con el verde de la marca. Lo que había era una fila de mayúsculas con letter-spacing ancho y un guión suelto entre paso y paso, que el cliente marcó como ilegible. No era una impresión: en un stepper lo que tiene que leerse de un vistazo es **cuántos pasos hay y en cuál estoy**, y eso se ve en la forma, no en el texto.
- **La contraseña gana un ojo y una barra de fuerza** que reemplaza al texto fijo "Mínimo 12 caracteres" — *"el requisito se comunica mejor mostrando progreso que con una regla estática"*. Mientras falta largo, el texto dice cuántos caracteres faltan: la regla sigue estando, pero como avance. Y el nivel más bajo se mantiene hasta llegar al mínimo aunque la clave tenga de todo, porque una barra llena justo antes de un error sería mentir.
- **El repetir muestra un tilde verde cuando coinciden**, así el error no aparece recién al enviar.
- **Íconos a la izquierda de cada campo** e inputs a 10px: *"los inputs muy redondeados hacen que el formulario parezca de juguete"*.
- **Lo que se apartó del pedido:** "los botones sociales van en dos columnas". Hoy el único proveedor implementado es **Google** (spec §9), y media fila vacía al lado de un botón solo se ve peor que un botón de ancho completo. Lo que sí se rehizo es el divisor: la etiqueta pasa a ser un chip sobre la línea en vez de texto colgando. Cuando exista un segundo proveedor, ahí va la grilla de dos columnas.

#### Modal de perfil

- **Encabezado y pie fijos, con "Continuar" siempre visible.** Antes había que scrollear hasta el fondo para encontrarlo. El botón vive **fuera del `<form>`** y se asocia con el atributo `form=`: es la única forma de tener un pie fijo sin sacar el formulario de su contenedor scrolleable. Hay un test que lo verifica, porque si esa asociación se rompe el modal queda sin forma de enviarse y no lo nota nadie hasta probarlo a mano.
- **El país deja de ser un campo de texto editable** y pasa a ser un select pegado al teléfono dentro del mismo borde: nadie puede borrar el "+54" ni escribir cualquier cosa. **Prefijo y número se siguen guardando por separado** en la base — cambia el control, no el modelo.
- **Dos grupos con título** ("Datos personales" / "Datos profesionales") y **520px de ancho** en vez de ~900: nueve campos sueltos en una columna ancha son una lista; en dos bloques cortos son dos tareas.
- **"(opcional)" sale del label** y pasa a ser un chip gris, y **las especialidades elegidas quedan como chips con X adentro del campo de búsqueda**: el campo pasa a mostrar el estado, no solo a filtrar.

#### Modal de crear clínica

- **Mismo encabezado y pie fijos**, con scroll solo en el cuerpo y una scrollbar fina de 6px — la nativa gris rompía el borde redondeado. El color pedido era `#E6E1D4`; se usó el token `--color-arena` (`#e7dfd1`), que es el gris cálido que el proyecto ya tiene y queda a un punto: un hex suelto habría sido un color nuevo en la paleta para nada.
- **Los cuatro campos opcionales se pliegan** en "Ubicación y contacto", así el modal entra sin scroll y lo obligatorio queda en primer plano.
- **La tarjeta elegida se marca con el verde de la marca, fondo menta y un tilde**, no con un borde negro grueso: *"el negro no existe en ningún otro lado de PRISMA, por eso saltaba"*. El ícono va arriba a la izquierda y el círculo de selección arriba a la derecha, para que se lea como un radio button aunque sea una tarjeta.
- **Provincia pasa a select de 24 valores, y va antes que ciudad.** Campo libre ensucia la base con "Cordoba", "CBA", "córdoba" — y esa columna es la que filtra el **buscador público de clínicas**, donde tres grafías de lo mismo son tres lugares distintos.
- **El botón nunca está deshabilitado.** Antes, sin tipo elegido, quedaba gris sin decir por qué: *"un botón gris sin explicación deja al usuario adivinando qué falta"*. Ahora se puede tocar siempre y el error aparece debajo del campo que falta.
- El teléfono usa el mismo control unificado, con una diferencia de modelo: la clínica guarda **una sola columna** de teléfono, así que prefijo y número se unen al enviar.

**Verificado:** 1060 tests frontend (25 nuevos), gates de cobertura en verde, lint 0 errores, build OK, contenedor reconstruido.

### Segunda vuelta de QA del 2026-09-13 — lo que quedó mal de la primera

Revisión con capturas sobre lo recién entregado. Las imágenes también eran temporales, así que lo que valía está descrito acá.

- **El stepper estaba corrido a la izquierda.** El primer paso no era `flex-1` y los demás sí, así que las columnas medían distinto y el conjunto quedaba descentrado respecto a la tarjeta. Ahora todas las columnas son iguales y cada círculo lleva una línea a **cada** lado, invisible en los extremos: así el último no arrastra una línea hacia la nada y el grupo queda centrado sin depender de cuántos pasos haya.
- **El tilde de "coinciden" parecía un segundo botón de ver la contraseña.** Estaba adentro del campo, pegado al ojo — dos íconos juntos en el mismo lugar se leen como dos controles. Pasó a ser una línea verde **debajo** del campo: dice lo mismo y no compite con el único control real.
- **Había un modal rectangular asomando por detrás del de crear clínica.** Era mío: el formulario pasó a traer su propio `ModalShell` en la vuelta anterior, y quedó además envuelto en el `AuthShell` viejo. Dos tarjetas y dos capas de fondo oscuro superpuestas. Es el riesgo de mover el "marco" adentro del componente y no revisar quién lo estaba envolviendo antes.
- **El nombre de la clínica y los campos opcionales aparecen recién con el tipo elegido.** El orden de la pantalla pasa a ser el de la decisión: primero qué clase de clínica es, después sus datos.
- **El login recibe el mismo tratamiento que el alta**: ícono adentro del campo de mail y ojo para ver la contraseña. Lo que **no** lleva es la barra de fuerza: al ingresar, la clave ya existe y juzgarla no aporta nada.

#### Las casillas del código, una sola vez para toda la app

Pedido aparte del cliente: *"el modal de introducir código en sumate y login reutilizar el que se usa en el wizard de sacar turno, para mantener consistencia"*.

Es la misma acción —copiar seis dígitos de un mail— en tres pantallas, y se veía de dos formas distintas según por dónde hubiera entrado la persona: seis casillas en el wizard público, y en el alta un campo único con placeholder `000000`, que se lee como contenido ya cargado y no muestra cuántos dígitos faltan.

Las casillas salieron del wizard a `components/auth/casillas-codigo.tsx`. Lo que se unifica no es solo el aspecto: **el pegado del código entero, el borrado que vuelve a la casilla anterior, las flechas y el limpiado tras un intento fallido** son cuatro comportamientos que existían una sola vez y ahora valen para las tres pantallas. El "Autocompletar" del bloque solo-dev del wizard sigue funcionando, como una prop del componente nuevo.

Los 69 tests del wizard pasaron **sin tocarlos**, que era la condición para dar la extracción por buena: si hubiera hecho falta editarlos, el componente no sería el mismo.

**Verificado:** 1061 tests frontend, cobertura y lint en verde, build OK, contenedor reconstruido (`/sumarse` y `/ingresar` responden 200).

### No todo el que entra a la app atiende pacientes

Pedido del cliente, y el más de fondo de las tres rondas: el alta de perfil pedía **matrícula obligatoria**, y eso alcanza mientras la única forma de entrar sea "soy odontólogo y quiero mi clínica". Deja de alcanzar en la subfase siguiente:

> *"cuando uno envíe la invitación por mail a un futuro colaborador, si este colaborador no tiene cuenta, se le pedirá crear una, y no necesariamente el recepcionista tiene una matrícula de profesional, como el que se encarga de editar la página."*

El perfil suma entonces un tipo: **Profesional** o **Actividades de la clínica**. Con el segundo no se piden matrícula ni especialidades — ni se guardan si un cliente las manda igual, porque son los datos con los que después la página pública decide qué mostrar.

**El default es `profesional` cuando el campo no viene.** Todas las filas que ya existen son de odontólogos y todos los tests anteriores se escribieron sin el campo: sin ese default, el cambio habría roto las dos cosas a la vez y por el mismo motivo equivocado.

#### Y si esa persona después quiere su propia clínica

El caso lo marcó el cliente apenas visto lo anterior: *"si estos usuarios se registraron sin ser profesional... y quieren poner su propia clínica, deberán completar otra vez el modal, solo con la parte de profesional faltante."*

Una clínica sin un titular con matrícula no tiene de dónde salir, así que "Crear mi clínica" pide primero los datos que faltan, **encadenado en la misma pantalla**: modal de datos profesionales → modal de la clínica, sin recargar `/clinicas` en el medio. Para eso la acción del perfil acepta no redirigir.

El backend rechaza el alta de clínica de un perfil que no es profesional (403). No es redundante con la pantalla: es lo que hace que la regla valga aunque alguien le pegue directo a la API.

**Un efecto que vale anotar:** con ese guard, el titular de una clínica es *siempre* profesional, así que los tres roles que el brief le da (`owner` + `admin` + `profesional`) siguen siendo coherentes por construcción. Sin él habría hecho falta decidir qué roles darle a un titular que no atiende.

#### El bug que se comió el formulario en silencio

Al cambiar de "Profesional" a "Actividades", el formulario **dejaba de enviarse y no decía por qué**: sin error visible, sin llamada al backend, nada.

La causa: react-hook-form **no limpia el valor de un campo que se desmonta** (`shouldUnregister` es `false` por default). El select de matrícula quedaba registrado con `""`, y el `z.enum(["nacional","provincial"])` lo rechazaba — con el error apuntando a un campo **que ya no estaba en pantalla**, así que no había dónde mostrarlo.

Es la peor forma de un bug de validación: el formulario no se envía y la interfaz no tiene nada que decir. El esquema ahora acepta `""` explícitamente y se normaliza a "ausente" en un solo lugar, la acción por la que pasan las dos pantallas que editan el perfil.

**Verificado:** 12 paquetes de backend en verde (5 tests nuevos), 1067 tests frontend (6 nuevos), cobertura y lint en verde, build OK, contenedores reconstruidos y la columna con su check verificada contra la base real.

### Tercera vuelta: el mismo pedido, el otro camino

**Completar los datos profesionales también al ENTRAR a una clínica.** El caso lo planteó el cliente completo: *"en una clínica lo invitaron como recepcionista y se registró con esto, pero en otra clínica lo hacen con el rol de profesional"*. Antes de entrar a esa segunda, hay que pedirle la matrícula.

Los dos caminos —armar la clínica propia y entrar a una donde el rol es `profesional`— **necesitan exactamente lo mismo**, así que comparten el modal: `TarjetaClinica` dejó de resolver la entrada por su cuenta y avisa al padre, que es el único que sabe si antes hay que interponer algo. Donde el rol es `recepcion` no se pide nada: ahí la matrícula no hace falta.

El backend lo verifica en `PUT /me/clinica-activa`, no solo la pantalla. Sin eso, entrar con rol de profesional sin matrícula sería cuestión de saltear el frontend — y esa persona tendría agenda propia sin matrícula ni especialidades, que es justo lo que la página pública muestra de quien atiende.

**Ubicación y contacto pasan a ser obligatorios para crear la clínica.** Nacieron opcionales cuando la página pública todavía no existía; hoy son los datos que esa página le muestra al paciente y por los que el buscador encuentra a la clínica. Una clínica sin dirección ni teléfono existe en la base pero no sirve para lo que la app promete.

Como consecuencia, **la sección dejó de estar plegada**: esconder detrás de un acordeón cuatro campos que hay que completar sí o sí es hacer que el formulario parezca más corto de lo que es, y que un error aparezca dentro de una sección cerrada. Lo que la ronda anterior plegó por ser opcional, esta lo despliega por dejar de serlo.

#### El ojo duplicado, que no era lo que yo creí

Reportado dos veces, y la primera lo arreglé mal. Lo atribuí al tilde de "coinciden" y lo moví abajo del campo; el duplicado siguió apareciendo en el login, donde ese tilde ni existe.

El segundo ícono era el control **nativo de Edge** (`::-ms-reveal`), que aparece solo cuando el campo tiene contenido y foco — por eso se veía en el campo recién tipeado y no en el otro, y por eso me mandó a buscar donde no era. Se oculta por CSS y queda el nuestro, que es el que sabe del estado del formulario y se ve igual en todos los navegadores.

**La lección no es sobre el navegador:** tenía dos elementos sospechosos en el mismo lugar —mi ícono y uno del sistema— y elegí el que yo había escrito sin comprobar cuál era cuál. Bastaba abrir el inspector una vez.

### Anotado para la 3.2.4

Pedido del cliente mientras cerrábamos esto, para tenerlo presente al empezar:

> *"las clínicas a las que me han invitado o yo haya pasado el código, se verán en 'otras clínicas' como estado **pendiente a confirmar** (por el mismo usuario)."*

O sea que "Otras clínicas" no va a listar solo membresías activas: va a mostrar también las **invitaciones sin aceptar**, con su propio estado y su acción de confirmar. El modelo ya lo soporta —`clinic_members.status` admite `invited`— y `GET /me/clinicas` hoy filtra por `status = 'active'`: ese filtro es el que va a cambiar, junto con la tarjeta.

**Verificado:** 12 paquetes de backend en verde (1 test nuevo, el del recepcionista invitado a atender en otra clínica), 1070 tests frontend, cobertura y lint en verde, build OK, contenedores reconstruidos.

## 3.2.4 — Colaboradores

**Fecha:** 2026-09-14 · **Código:** `internal/http/equipo.go`, `internal/http/invitaciones_recibidas.go` · **Mockups:** `colaboradores.html`, `clinica-inicio.html`

La subfase que estrena todo lo anterior: los roles de la 3.2.2, el código de invitación de la 3.2.3 y el perfil sin matrícula que esa misma ronda de QA hizo posible.

### Paso 1: una sola mecánica para los dos caminos

El brief pide dos formas de sumar a alguien —código de perfil o mail— y las describe distintas: *"si es por token/código de perfil se añadirá al instante ya que se supone que el otro usuario lo compartió; si es por mail, quedará en estado pendiente hasta que el otro profesional acepte"*.

**Las dos terminan igual: pendientes de confirmar.** Lo corrigió el propio cliente al pedir que *"las clínicas a las que me han invitado o yo haya pasado el código"* se vean como pendientes. Y es lo correcto de fondo: **compartir un código es ofrecerse, no aceptar**. Nadie queda adentro de una clínica —viendo agendas y datos de pacientes— sin haber dicho que sí desde su propia pantalla.

Lo que el código sí resuelve, y el mail no: **identifica a una persona, no a una dirección**. La invitación por código saca el mail del perfil de quien lo generó, así que por ese camino un error de tipeo en la dirección no existe.

### Por qué `clinic_invitations` y no una membresía "invitada"

El modelo tenía las dos piezas desde el auth original: `clinic_members.status` admite `invited`, y existe una tabla `clinic_invitations` sin usar. La decisión la fuerza un caso del brief: **se puede invitar a un mail que todavía no tiene cuenta**, y `clinic_members.user_id` es NOT NULL.

Una invitación se dirige a una **dirección**; una membresía, a una **persona que ya existe**. Por eso las invitaciones se buscan por mail: quien se registra después con esa dirección se las encuentra esperando, sin ningún paso extra ni token que copiar.

### Las decisiones chicas, y su motivo

- **Ver el equipo lo puede cualquier miembro; invitar y quitar, solo el titular.** Saber con quién se trabaja no es un permiso especial —y la 3.2.5 va a mostrar esta misma lista en el header del panel—, pero repartir accesos sí: *"el creador: el responsable de asignar roles e invitar a sus colegas"*.
- **Un código vencido responde lo mismo que uno inexistente.** Decir "existió pero venció" le confirmaría a quien prueba códigos al azar que acertó uno.
- **Aceptar la invitación de otro da 404.** El id de una invitación no es secreto: viaja en la pantalla de quien invitó. Sin verificar que el mail de la invitación sea el de quien responde, cualquiera con sesión se metería en una clínica ajena. Hay un test que lo intenta.
- **Reenviar renueva el vencimiento.** Si no, una invitación de hace ocho días se reenviaría vencida: un mail que no sirve para nada.
- **Quitar a alguien marca la membresía, no la borra** (TR-137), y **al titular no se lo puede quitar**: sin él la clínica queda sin nadie que pueda invitar ni repartir roles, y de ese estado no se vuelve.
- **Volver a sumar a quien se fue reactiva la membresía marcada**, no crea una segunda — el índice único `(clinic_id, user_id)` la rechazaría, y con razón: es la misma relación, no una nueva. Tiene test propio porque es el camino que nadie prueba a mano.
- **Aceptar como profesional exige matrícula**, igual que crear la clínica propia o entrar a atender (3.2.3). Es la tercera puerta de la misma regla, y ahora las tres tienen su guard.
- **El rol excluyente lo sigue impidiendo el motor**: si alguien ya es `recepcion` en esa clínica, aceptar como `profesional` choca contra el índice único parcial de la 3.2.1. El handler traduce ese 23505 a algo que se entienda.

**Verificado:** 10 tests nuevos, 12 paquetes en verde, gofmt + golangci-lint 0 issues.

### Paso 2: la pantalla del equipo

`/colaboradores` es un área propia, como `/personalizar-pagina`: no vive bajo `/panel/**` porque no es una herramienta de la agenda sino de la clínica. Es la tercera tarjeta de "¿Qué necesitás hoy?", y **solo la ve el titular** — mostrársela al resto sería ofrecer una pantalla que el backend les va a negar.

El orden de las secciones lo pide el brief —*"primero el creador, luego recepcionistas, y al final las tarjetas de los colegas"*— y no es estético: es el orden en que alguien busca a una persona cuando entra acá. Primero se ubica a sí mismo, después a quien atiende el teléfono, después al resto.

**El modal de invitar tiene dos pasos, y el rol va primero.** El rol es lo que decide qué va a poder ver esa persona, así que se elige antes de nombrarla; al revés, termina siendo un detalle que se completa apurado sobre el final.

La pantalla de éxito dice algo que el brief original no habría necesitado: *"hasta que confirme desde su pantalla de clínicas, no ve nada de la tuya"*. Con el código sumando al instante, invitar era un hecho consumado; ahora es un pedido, y la pantalla tiene que decirlo o quien invita se queda esperando que aparezca alguien que todavía no aceptó.

### Paso 3: el otro lado, la confirmación

En "Otras clínicas" las invitaciones sin responder van **primero**: son lo único de esa pantalla que espera una decisión. Se ven distintas a propósito —borde punteado, etiqueta "Pendiente a confirmar", sin "Entrar"— porque todavía no llevan a ningún lado.

**Aceptar una invitación de profesional es la tercera puerta de la misma regla de la 3.2.3.** Sin matrícula no se entra a atender: ni creando la clínica propia, ni entrando a una donde ya sos profesional, ni aceptando una invitación. Las tres comparten el mismo modal encadenado y las tres tienen su guard en el backend. Una invitación de recepción no pide nada: ahí no se atiende a nadie.

### El invitado que todavía no tiene cuenta

Es el caso que decidió el modelo, y no necesitó código propio: la invitación se guarda contra una **dirección de mail**, así que quien se registra después con esa misma dirección se la encuentra esperando en su pantalla de clínicas. Sin token que copiar, sin link de un solo uso, sin un estado intermedio que mantener.

Ese camino es también el que la ronda de QA de la 3.2.3 dejó listo: esa persona puede crear su perfil **sin matrícula** —*"no necesariamente el recepcionista tiene una matrícula de profesional"*— porque el alta dejó de asumir que todos atienden pacientes. Las dos decisiones se tomaron con una semana de diferencia y encajan sin costura.

### Con esto la 3.2.4 queda completa

Una clínica puede armar su equipo: invitar por código o por mail, ver quién está y quién falta confirmar, reenviar, cancelar y quitar. Y del otro lado, cualquiera puede ver qué clínicas lo invitaron y decidir.

**Verificado:** 14 tests de backend y 19 de frontend nuevos (1089 en total), 12 paquetes en verde, gofmt + golangci-lint 0 issues, cobertura y lint del frontend en verde, contenedores reconstruidos.

#### Los cuatro tests que agregó el gate de cobertura

La primera corrida de CI falló por cobertura: 79,5% en `internal/http`, con `cancelarInvitacionHandler` en **9%** y `reenviarInvitacionHandler` en **7%**. No era ruido del gate — eran dos endpoints **sin ningún test de backend**: los había probado solo del lado de la pantalla, con la acción mockeada.

Un endpoint que solo prueba el frontend con un mock no está probado: el mock devuelve lo que uno le dice, así que verifica el botón, no el handler. Los tests nuevos cubren reenviar (y que **renueve el vencimiento**, si no se reenviaría un mail ya vencido), cancelar (y que libere el "ya tiene una invitación pendiente"), que ninguna de las dos cosas se pueda hacer sobre la invitación **de otra clínica**, y los rechazos de forma al invitar.

**Lo que queda pendiente de esta subfase, declarado:** el brief pide que al crear una clínica de tipo "organización" el alta siga directo en esta pantalla. Hoy los dos tipos terminan en `/seleccionar-servicio`, desde donde la tarjeta de colaboradores está a un click. Y el rol `admin` (administrador de página) se puede asignar por la API pero el modal todavía ofrece solo Profesional y Recepcionista, que son los dos que el mockup muestra.

Sigue la **3.2.5 — panel del profesional**: el selector de clínica en el header y el componente de colaboradores, que va a reusar esta misma lista.

## Corrección del 2026-09-14 — quién ve toda la clínica

Salió de una pregunta del cliente sobre el rol `admin`, y terminó en un bug de aislamiento que llevaba dos subfases adentro.

**De dónde salía `admin`.** El rol existe en el brief —*"Administrador de la página: acceso a la página web y sus herramientas"*— y como constante es anterior a la Fase 3: viene del modelo de auth original (`0b5a9aa`, agosto), con el check `IN ('owner','admin','profesional','recepcion')`. Eso no estaba en discusión.

**Lo que sí era mío: que `admin` y `owner` vieran todos los turnos.** Lo escribí en la 3.2.2 apoyándome en una línea de las Aclaraciones del brief:

> *"Un administrador (ver más adelante en roles) tendrá la capacidad de acceder a cada una de las vistas de cada profesional y reasignación de turnos ENTRE profesionales si se da el caso."*

La propia línea dice **"(ver más adelante en roles)"**, y más adelante el administrador es **de la página**. Estiré esa palabra hasta un rol que significa otra cosa — y el cliente lo marcó con precisión: *"el admin NO puede ver todos los turnos porque es PROFESIONAL"*, y *"administrador de la página se refiere a la parte de personalizar página, no administrador de la clínica"*.

**Qué rompía.** El titular es `owner` + `admin` + `profesional`, así que veía **todos los turnos y pacientes de su clínica**. Es exactamente lo que el requisito en mayúsculas del mismo brief prohíbe: *"CADA COMPONENTE DEL PANEL DE CADA PROFESIONAL, ES AISLADO DEL RESTO DE PROFESIONALES"*. Hoy `veTodaLaClinica` es solo `recepcion`.

**Cómo se coló, que es la parte que vale.** Los tests de aislamiento de la 3.2.2 probaban **una sola dirección**: que un colega no viera lo del titular. Esa es justo la dirección que el bug no rompía. La inversa —que el titular no vea lo del colega— no tenía test, así que el error pasó CI, la revisión y dos subfases sin que nada lo marcara.

Es la segunda vez en esta fase que una regla de aislamiento se cumple "a medias" sin que la suite lo note: la primera fue en la 3.2.3, cuando ningún test verificaba que un profesional **sí viera lo propio**. Las dos veces el patrón fue el mismo — probar una dirección de una regla que tiene dos.

**Efecto lateral en los fixtures.** Cuatro tests creaban fichas directo en la base, sin turno, y las leían como titular. Sin `veTodaLaClinica` abierto, esas fichas no son de nadie: ahora llevan `creado_por_user_id`, que es la forma real de que exista una ficha sin turno (alta a mano desde el panel).

**Verificado:** 1 test nuevo que fija la dirección que faltaba, 12 paquetes en verde, cobertura 80,3%.

## Ronda del 2026-09-14 — el rol delegable, y el contraste

### `admin` pasa a ser invitable y delegable

Hasta acá el rol existía en el modelo y solo lo tenía el titular. Ahora aparece como tercera opción al invitar —se puede sumar a alguien **solo** para que maneje la web de la clínica— y se puede dar o quitar a quien ya está en el equipo, desde "Cambiar rol".

**Se manda el juego COMPLETO de roles, no un agregado.** Con roles excluyentes entre sí, "sumale profesional" a alguien que es recepción no tiene una respuesta obvia —¿reemplaza, falla, convive?— y las tres son defendibles. Elegir qué queda no deja lugar a la duda: es exactamente lo que va a quedar.

Dos cosas que el endpoint no deja hacer, con su motivo:

- **`owner` no se reparte.** Se es dueño de la clínica por haberla creado, no porque alguien lo asigne; traspasarla es otra operación y todavía no existe.
- **Pasar a alguien a `profesional` exige que tenga matrícula.** Es la **cuarta** puerta de la misma regla —crear la clínica propia, entrar a atender, aceptar una invitación de profesional, y ahora recibir el rol—. Un rol que deja a alguien atendiendo sin matrícula ni especialidades es justo lo que la página pública muestra de quien atiende.

### El rediseño de la pantalla

Sobre un pedido con valores concretos. Lo que resolvió, en orden de importancia:

**El contraste entre capas era el problema de fondo.** Fondo, tarjeta y bordes se diferenciaban en dos o tres puntos de luminosidad, así que no se leía dónde terminaba cada elemento. Se resolvió con los **bordes** —un gris cálido más marcado, `--color-linea`, a 1px— y con los avatares en verde sólido en vez de verde pálido sobre blanco. El fondo de página más oscuro que pedía el rediseño se probó y se descartó en la vuelta siguiente: el borde alcanza, y un fondo distinto por pantalla rompía la continuidad.

**Cada tipo de tag tiene su color.** Eran todos del mismo gris, así que la fila de roles se leía como un bloque indistinto y había que leer palabra por palabra para saber quién es quién. El color se asigna por **nombre**, con un mapa, nunca por posición. "Sos vos" va en neutro: es una aclaración, no un rol, y no debe competir con los reales.

**Las acciones pasan a un menú de tres puntos.** Con tres opciones sueltas al pie, la tarjeta tenía más botones que datos. Adentro de un menú, la tarjeta vuelve a ser lo que es —una persona— y las acciones quedan a un click. Cierra al hacer click afuera y con Escape.

**El botón de invitar sube al encabezado**, en la misma fila que el título: en una fila propia dejaba una banda vacía antes de la primera tarjeta. El contenido se acota a 880px centrados, porque estirado al ancho del viewport las tarjetas quedaban perdidas a la izquierda. Y los estados vacíos pasan de cajas de cien píxeles con una frase centrada a una línea con su atajo a la derecha.

### Las píldoras de los formularios, en todo el proyecto

Pedido aparte, y del mismo tipo: *"las píldoras donde el cliente completa los datos"* **se camuflan con el fondo blanco**.

La causa medida: los campos tenían borde de **0,5px en `arena`** (#e7dfd1) sobre `marfil` (#fffdf9) — tres puntos de luminosidad de diferencia, a medio píxel de grosor. Un campo así no se lee como un hueco donde escribir sino como un renglón.

Pasan a **1px en `--color-linea`** (#dbd3c2) con relleno `hueso` en vez de blanco: el campo contrasta con la tarjeta que lo contiene. Aplica a todo el alta —perfil, clínica, registro, login, el control de teléfono, el buscador de especialidades y las casillas del código—, no solo a esta pantalla.

**Verificado:** 5 tests de backend nuevos (el cambio de roles y sus cuatro rechazos), 4 de frontend, 1093 en total, 12 paquetes en verde, cobertura y lint en verde, build OK, contenedores reconstruidos.

### Segunda vuelta del rediseño — el inicio de una clínica

Tres correcciones sobre Colaboradores y el rediseño de "¿Qué necesitás hoy?".

**Las correcciones.** Las tres pantallas con tarjetas —"¿Dónde trabajás hoy?", "¿Qué necesitás hoy?" y Colaboradores— pasan a compartir el fondo `hueso`, así que moverse entre ellas no se siente como cambiar de aplicación. El fondo más oscuro que pedían los dos rediseños se probó y se descartó: lo que separa una tarjeta de su fondo es el **borde de 1px en `linea`**, que ya se había sumado por otro motivo, y con eso el contraste alcanza sin romper la continuidad entre pantallas. El token `hueso-hondo` quedó sin uso y se borró en vez de dejarlo dando vueltas. El botón "Invitar colaborador" se alinea con el **título** y no con el bloque entero del encabezado: con breadcrumb, título y descripción en una sola columna, quedaba a la altura del breadcrumb, que es lo más chico de los tres. Y las píldoras de estado vacío pasan a blanco.

**"¿Qué necesitás hoy?" tenía dos problemas distintos**, y los dos eran de jerarquía:

- **Las tres tarjetas eran del mismo tamaño.** La acción principal no se distinguía, y la tercera quedaba sola dejando media pantalla vacía. Ahora "Gestión de clínica" ocupa las dos columnas **con otra composición**: horizontal, con el texto a la izquierda y un botón sólido a la derecha. Que sea otra composición y no la misma tarjeta estirada es el punto: una tarjeta estirada sin cambiar de forma no justifica su ancho, y queda peor que antes de agrandarla.
- **"Estás en [píldora] Cambiar de clínica" eran tres tratamientos visuales para una sola idea**, apretados abajo del saludo. Pasa a ser un control único a la derecha del título —punto verde, "ESTÁS EN", el nombre de la clínica y un chevron— que abre la lista de clínicas con su rol, la actual marcada, y un enlace a la pantalla completa. Además llena el costado derecho del encabezado, que estaba vacío.

El selector hace algo que la línea anterior no podía: **cambiar de clínica sin salir de la pantalla**. Antes "Cambiar de clínica" era un link a `/clinicas`; ahora se elige del popover y se entra directo.

**Verificado:** 6 tests nuevos, 1099 en total, cobertura y lint en verde, build OK, contenedor reconstruido.

#### Y la coherencia entre las tres pantallas

La vuelta terminó puliendo lo que el rediseño había separado sin querer. "¿Qué necesitás hoy?" venía con **1180px de ancho** y `/clinicas` con 896: dos pantallas consecutivas del mismo flujo, con el título en la misma posición pero el contenido de anchos distintos. Se nota al pasar de una a la otra, y se lee como un cambio de aplicación más que de sección. Las dos quedan en `max-w-4xl`, con el mismo `gap` entre tarjetas y el mismo tratamiento de borde.

Es la contracara de pedir rediseños por pantalla: cada uno resuelve bien lo suyo —el ancho de 1180px tenía sentido para tres tarjetas— y ninguno mira a la pantalla de al lado. **La coherencia entre pantallas no la puede dar un rediseño de una sola.**

En el modal de invitar, las tres tarjetas de rol entran en un contenedor recortado **a la mitad de la tercera**: el mismo recurso que el brief pide para los tipos de consulta (*"así se ve el corte y se entiende que hay más abajo"*). Con las tres entrando justas, nadie scrollea para buscar lo que no sabe que existe — y "Administrador de página" era justamente el rol que no se veía.

