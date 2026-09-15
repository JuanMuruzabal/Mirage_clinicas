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

> **Lo planeado cambió en un punto, y para bien.** El segundo ítem decía *"sin tiempo real todavía"*, porque el tiempo real vivía en la 3.2.8 como una decisión de transporte trabada por correr una sola instancia del backend. El cliente pidió adelantar la presencia y, al implementarla, esa decisión **no existía**: `sessions` ya tenía todo lo necesario. El popover salió con presencia real y la 3.2.8 se quedó sin su ítem más pesado. Ver la sección de la 3.2.5 más abajo.

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

En el modal de invitar, los tres roles van en una fila que scrollea en **horizontal**, con la tercera tarjeta cortada al borde: el mismo recurso que el brief pide para los tipos de consulta (*"así se ve el corte y se entiende que hay más"*). Con las tres entrando justas en una grilla, nadie busca lo que no sabe que existe — y "Administrador de página" era justamente el rol que no se veía.

Primero lo hice vertical, y estaba mal por una razón que se ve apenas se prueba: **las tarjetas son anchas y bajas**, así que el corte horizontal se comía media tarjeta y dejaba un bloque de texto suelto sin su título. Cortada al costado, en cambio, se ve el ícono y el principio del nombre — que es lo que hace entender que hay otra opción.

### Cada tarjeta detrás de su rol, y dos correcciones de mobile

**El hallazgo, reportado por el cliente: un profesional veía "Personalización de página".** La pantalla mostraba las tres tarjetas a cualquiera con la clínica cargada. El backend ya rechazaba cada acción de quien no es `admin` desde la 3.2.2, así que no había fuga de datos — pero ofrecer una puerta que del otro lado está cerrada es peor que no ofrecerla.

Ahora cada tarjeta depende de un rol, como pide el brief:

| Tarjeta | Quién la ve |
|---|---|
| Gestión de clínica | `profesional` o `recepcion` — los que trabajan con la agenda |
| Personalización de página | `admin`, el administrador de **página** |
| Colaboradores | `owner`, que es quien invita y reparte roles |

Con los tres roles —el caso del titular— se ven las tres. Y si alguien **solo** administra la página, esa tarjeta pasa a ocupar el ancho completo: una tarjeta sola en media grilla deja el otro medio vacío.

**Lo que hizo falta para eso:** `/me` devolvía **un solo rol**, el de mayor alcance. Alcanzaba mientras el frontend solo quisiera etiquetar a la persona; para decidir qué mostrar no sirve, porque "es owner" no dice si además administra la página. Ahora devuelve los tres, y el campo viejo queda como estaba.

**Y el guard en la pantalla, no solo en la tarjeta.** `/personalizar-pagina` verifica el rol y redirige: sin eso, un profesional podía abrir el editor por URL y ver la página entera antes de que ninguna acción fallara. Es exactamente el hueco que había quedado anotado al hablar del rol `admin` — *"el frontend no lo verifica; hoy no se nota porque el único admin es el titular"*. Dejó de no notarse.

**Las dos correcciones de mobile**, las dos reportadas con captura:

- El botón "Invitar colaborador" quedaba **pegado al borde derecho y encima del título**. En pantalla angosta pasa debajo de la descripción; en ancha vuelve a la fila del título.
- El popover del selector de clínica **se salía de la pantalla**: está anclado a la derecha de su botón, y al envolverse el encabezado el botón quedaba a la izquierda del todo. Ahora el selector se empuja al borde derecho con `ml-auto` cuando baja de línea, y el popover se acota a `100vw - 3rem` para un teléfono angosto.
  - **Primero lo intenté con `self-end`, y no movió nada.** En un flex con dirección `row`, `self-*` alinea en el eje **cruzado** —el vertical—, no en el horizontal; lo que empuja un ítem hacia el final de su propia línea es el margen automático. El error no se ve leyendo el código, se ve en la pantalla: la clase estaba puesta y el botón seguía a la izquierda.

La causa de fondo de las dos es la misma: un layout pensado en pantalla ancha, donde el orden y la alineación los da `justify-between`, y que al envolverse pierde las dos cosas a la vez.

### La alarma que resultó falsa, y lo que encontró de paso (2026-09-14)

**El reporte:** una clínica llamada JUAN, creada por `2213345@…` — y un colega que, al iniciar sesión con **otro** mail, *"aparece como titular de la clínica como si él la hubiera creado con los datos de mi perfil"*. Contra la base de DEV en Render, quince consultas de solo lectura.

**No había ningún dato cruzado.** Son **dos clínicas distintas que se llaman igual**:

| Nombre en pantalla | slug | Titular | Creada |
|---|---|---|---|
| JUAN | `juan` | `2213345@ucc.edu.ar` | 26/08 04:47 |
| JUAN | `juan-2` | `burnert1200@gmail.com` | 26/08 20:31 |

El sufijo lo puso `uniqueSlug` al detectar que `juan` ya estaba tomado — el mecanismo funcionando exactamente como debe. La cronología del colega es la de un alta normal hecha por él mismo: cuenta 20:25 → perfil 20:26 → clínica 20:31.

Y el nombre repetido en pantalla es literal: **los dos perfiles dicen "JUAN Muruzabal"**, cargados así por la misma persona en cuentas de prueba distintas. En la base hay siete. Sumado a que ese día el colega aceptó una invitación a la clínica del otro, su selector muestra "JUAN" y "JUAN", y la pantalla de Colaboradores muestra dos filas con el mismo nombre. Indistinguibles a ojo, correctas en la base.

Los siete chequeos de integridad dieron todos vacío: sin mails repetidos, sin dos cuentas colgadas de la misma identidad de Google, sin rol `owner` en clínica ajena, sin clínica sin titular activo, sin membresías duplicadas, sin códigos de invitación repetidos.

**Lo que sí encontró: la misma matrícula nacional en cuatro cuentas.** Nada lo impedía. Se corrigió en la misma jornada — ver TR-141. El resumen: índice único parcial sobre `(matricula_tipo, matricula_numero)`, 409 con mensaje legible en los dos caminos de escritura del perfil, y la limitación de la matrícula provincial (no guardamos la provincia) escrita con su condición de cambio.

**Una conclusión que no es sobre el bug.** Lo que hizo verosímil la alarma fue la pantalla, no los datos: dos clínicas homónimas son indistinguibles en el selector, y dos personas homónimas lo son en Colaboradores. La base tenía toda la información para separarlas —slug, id, mail— y la interfaz no mostraba ninguna. **No se cambió nada por ahora**, porque en producción real dos clínicas del mismo dueño con idéntico nombre es un caso raro y las siete cuentas homónimas son de prueba; queda anotado como candidato si vuelve a aparecer.

### Limpieza de la base de DEV (2026-09-14)

La base de Render se vació de datos de usuario en la misma jornada, a pedido del cliente. **Dos tablas quedaron intactas y el motivo importa:**

- `especialidades` — catálogo semilla. Se repuebla solo, pero no hay razón para hacerlo pasar por eso.
- `migraciones_una_vez` — el registro de qué migraciones de DATOS ya corrieron (TR-123). **Borrarlo las haría correr todas de nuevo en el próximo arranque**, incluidas las destructivas. Es la tabla que parece descartable y es la única que no lo es.

Se tomó un dump completo antes de tocar nada.

### Crear una organización termina en Colaboradores (2026-09-14)

Tres cambios chicos con una sola idea atrás: **elegir "Organización" es decir "somos varios", y el paso siguiente es sumar a esos varios.**

**Fuera el aviso de "próximamente".** Al elegir Organización, el modal de alta mostraba *"Vas a poder invitar colaboradores con distintos roles desde el panel, próximamente."* Llegó en la 3.2.4 — el cartel quedó primero desactualizado y ahora, con el redirect de abajo, directamente **contradictorio**: prometía para más adelante lo que pasa a continuación.

**El formulario redirige según el tipo.** Una organización termina en `/colaboradores`; una clínica individual sigue yendo a "¿Qué necesitás hoy?", porque ahí no hay nadie a quien invitar. **Las dos ramas tienen test**: un redirect fijo a `/colaboradores` pasaría el test de la organización y mandaría también a la individual — la misma lección de las dos direcciones que ya apareció dos veces en esta fase.

**Y Colaboradores gana una salida.** Hasta ahora era un desvío desde "¿Qué necesitás hoy?", al que se llegaba y del que se volvía; desde este cambio es también un **punto de llegada**, y quien acaba de crear su clínica quedaba mirando un equipo vacío sin nada que lo llevara adelante. El botón "Ir al panel de gestión" va al final de la pantalla, después del equipo: primero lo que se vino a hacer, después la salida.

**Va a "¿Qué necesitás hoy?", no directo a `/panel`** (corregido por el cliente en la misma jornada). La primera versión apuntaba al panel y por eso llevaba candado por rol: a alguien que solo administra la página pública, la agenda no le sirve. Apuntando a `/seleccionar-servicio` el candado sobra — **esa pantalla ya decide por su cuenta qué tarjetas mostrarle a cada uno**, y es la única que sirve para todos los roles por igual. El destino correcto se llevó puesta la regla que hacía falta para el destino equivocado.

Color: el mismo verde (`salvia-oscuro` sobre `marfil`) que el resto de los botones de acción de la app. La primera versión lo hizo secundario —borde sobre fondo claro— y quedaba como un enlace más, no como la salida de la pantalla.

## 3.2.5 — Panel del profesional (2026-09-14, TR-142)

Tres piezas: el selector de clínica en el topbar, el popover de colaboradores **con presencia real**, y los tipos de consulta compartidos entre colegas.

### La presencia llegó tres subfases antes, y sin infraestructura

El plan la ponía en la **3.2.8** y la trataba como *"una decisión de transporte"* trabada por correr una sola instancia del backend. El cliente pidió adelantarla; al implementarla, **la decisión no existía**.

`sessions` ya guarda `last_seen_at`, y desde la 3.2.3 también `clinic_id`. "Quién está en esta clínica ahora" es esta query:

```sql
SELECT user_id, MAX(last_seen_at) FROM sessions
WHERE clinic_id = ? AND revoked_at IS NULL AND expires_at > now()
GROUP BY user_id
```

Sin WebSocket, sin SSE, sin tabla nueva. Y el bloqueo que la postergaba **desaparece**: lo que hace difícil el tiempo real es que el estado viva en la memoria de un proceso, y acá vive en Postgres — igual que la sesión y el rate-limiting. Funciona con N instancias sin sticky sessions.

Cuatro decisiones que hacen que el dato signifique algo:

| Decisión | Por qué |
|---|---|
| El latido y la lectura son **una sola llamada** | Preguntar *es* avisar. Y el latido va **antes** de leer: si no, el panel se ve a sí mismo ausente hasta el ciclo siguiente |
| Saltea el throttle de 5 min de `TouchSession` | Ese existe para que no haya un UPDATE por clic; acá el ritmo lo fija el endpoint — una escritura por minuto y por panel abierto |
| El umbral es de **5 minutos** | Lo impone el modelo: `last_seen_at` se reescribe cada 5 min como mucho, así que menos marcaría ausente a quien está trabajando |
| Los dos números los **sirve el backend** | El intervalo del latido y el umbral son la misma decisión mirada de dos lados; en dos archivos se desincronizan |

Lo que **no** es, dicho: instantánea. Quien cierra la pestaña sigue en línea hasta que vence el umbral. Para "¿quién está atendiendo hoy?" alcanza.

Y el corte que la hace verdadera: **una sesión parada en otra clínica no es presencia en esta**, ni una revocada, ni una vencida. Sin eso, alguien atendiendo en su otra clínica aparecería trabajando acá. Los tres casos tienen test.

### Los tipos de consulta se copian

Incluir el de un colega **crea una fila nueva**. La regla estaba escrita en el modelo desde la 3.2.1 y acá se implementa: un tipo lleva duración, color y preferencia horaria, y con una fila común, que alguien acortara "Conducto" de 60 a 45 minutos **le movería los huecos del día a todos los demás**. Eso no se nota mirando la pantalla; se nota cuando se superpone un turno.

El fuzzy matching sobre el nombre **avisa, no bloquea**: normaliza (sin acentos, sin mayúsculas, sin puntuación) y compara por distancia de edición con umbral 0.8 — pasa "conducto"/"conductos", corta en "control"/"consulta". Se testea en las dos direcciones, porque un umbral que junta todo avisaría siempre, y avisar siempre es no avisar.

**De paso cerró un hueco abierto desde la 3.2.1:** `GET /tipos-consulta` filtraba solo por clínica aunque la columna `user_id` ya existía — con dos odontólogos, cada uno veía en su configuración de agenda los tipos del otro **y podía editárselos**. Y el seed les pone dueño: los creaba sin `user_id`, así que una clínica recién creada tenía dos tipos de nadie, que habrían quedado invisibles para su propio titular apenas el listado pasó a filtrar por profesional. Ese bug no existía antes de este cambio: lo habría creado él.

### El topbar

El selector de clínica es **el mismo componente** de "¿Qué necesitás hoy?" con una variante compacta — lo que cambia es la caja, no lo que hace. Y el header pide las clínicas y el equipo **solo dentro de `/panel`**: es uno solo para toda la app, y sin acotarlo serían dos llamadas a la API por página en todo el sitio. La ruta la pone el middleware en `x-pathname`, que es la única forma de decidirlo del lado del servidor sin romper el patrón BFF.

### Con esto la 3.2.5 queda completa

Un profesional entra al panel, ve en el topbar en qué clínica está parado y puede cambiarse sin salir; ve quién más de su equipo está trabajando en ese momento; y arma su lista de tipos de consulta copiando los que su colega ya tiene configurados, sin pisarle la agenda a nadie.

**Verificado:** 11 tests de backend y 19 de frontend nuevos (1118 en total), 12 paquetes en verde, `gofmt` + `golangci-lint` 0 issues, cobertura 80,4% backend y 82,1% frontend, contenedores reconstruidos.

**Lo que esta subfase le sacó a otra:** la 3.2.8 ya no incluye el tiempo real. Lo que le queda —latencia y cierre— sigue igual, y las condiciones de activación de Redis para el rate-limiter, el pool de conexiones y PgBouncer (§12.3 del plan) tampoco se movieron: la presencia no agrega estado compartido en memoria, que era el motivo por el que se iban a decidir juntas.

**Lo que queda pendiente, declarado:** la presencia no distingue *"tiene el panel abierto"* de *"estuvo activo hace cuatro minutos"* — con el umbral de 5 minutos, las dos cosas se ven igual. Alcanza para la pregunta del brief (*"¿quién está atendiendo hoy?"*) y no alcanzaría para un indicador de escritura en vivo, que hoy no existe en ninguna pantalla. Si alguna vez hiciera falta, ahí sí entra un transporte con conexión.

Sigue la **3.2.6 — vista del recepcionista**: la subfase más grande, con los cuatro módulos del panel en vista general y por profesional. Es la primera que va a consumir de verdad el aislamiento de la 3.2.2 en la dirección contraria — hasta ahora todo fue *"cada uno ve lo suyo"*, y ahí aparece el rol que ve todo.

### Ronda de QA de la 3.2.5 (2026-09-14)

**El selector de clínica no aparecía, y el motivo era mío.** Lo dibujaba solo si encontraba una clínica con `activa: true` en la lista de `/me/clinicas`, y ese flag vale `true` **únicamente cuando la sesión eligió esa clínica a mano** (`sessions.clinic_id`). Quien entró al panel por el fallback de `membresiaDeLaSesion` —"la más antigua", porque nunca tocó una clínica en `/clinicas`— tiene todas en `false`: el selector no se dibujaba nunca, sin error ni aviso.

La clínica correcta la dice `/me`, que resuelve ese fallback y es justamente lo que el panel está usando. Ahora el header saca de ahí el nombre del botón **y** marca la lista contra ese id, así el tilde y el título dicen lo mismo. Quedó con test: ninguna clínica marcada, y el selector igual aparece.

Es un caso que no se ve leyendo el código —el flag existe y parece la fuente natural— y aparece apenas alguien usa la app sin elegir clínica, que es el camino más común de todos.

**La separación entre las tarjetas de rol parecía inconsistente** (reportado con captura: el hueco a la izquierda de "Recepcionista" era la mitad del de su derecha). Lo que variaba no era la separación sino **el ancho de las tarjetas**: `TarjetaOpcion` es un `<button>`, y un botón encoge a su contenido aunque su contenedor reserve más ancho. "Recepcionista / Maneja los turnos de toda la clínica" entra en una línea y quedaba más angosta que su contenedor del 62%; "Administrador de página", con dos líneas, lo llenaba entero. El sobrante de la primera se leía como espacio entre las dos. Un `w-full` en el botón, y las tres miden lo mismo.

Vale para todas las pantallas que usan esa tarjeta, no solo para el modal de invitar: el alta de clínica (individual / organización) tenía el mismo desajuste, más difícil de notar porque ahí son dos y están en una grilla.

**Las tarjetas de `/clinicas` no tenían animación** y las de "¿Qué necesitás hoy?" sí. Son pantallas consecutivas en el recorrido de toda sesión, así que el salto se notaba como un cambio de estilo. Ahora entran con el mismo `ScrollReveal` —fade y desplazamiento—, escalonadas de a 60 ms y respetando `prefers-reduced-motion`. El `h-full` va en el `ScrollReveal`, que pasó a ser la celda de la grilla: sin eso, las tarjetas dejaban de tener todas el mismo alto.

### El topbar del panel, reescrito: un layout raíz no se re-renderiza (2026-09-14)

El selector de clínica y el popover de colaboradores **no aparecían**. Reportado dos veces, y las dos causas eran distintas — la segunda invalidó el diseño entero, no un detalle.

**Primera causa: el flag equivocado.** El selector se dibujaba solo si encontraba una clínica con `activa: true` en `/me/clinicas`, y ese flag vale `true` **únicamente cuando la sesión eligió esa clínica a mano** (`sessions.clinic_id`). Quien entró por el fallback de `membresiaDeLaSesion` —"la más antigua"— tiene todas en `false`. Verificado contra la base local con una sesión de prueba: `/me` devolvía la clínica correcta y `/me/clinicas` las dos en `activa: false`.

**Segunda causa, la de fondo: el header vive en el layout RAÍZ, y un layout no se vuelve a renderizar en una navegación del cliente.** Los datos se pedían en `SiteHeader`, un Server Component de ese layout, que decidía si estaba en `/panel` leyendo un `x-pathname` puesto por el middleware. Funcionaba solo recargando la página parado en `/panel`: quien entraba a `/clinicas` y navegaba al panel —el camino normal, porque `/clinicas` es el punto de partida de toda sesión desde la 3.2.3— se quedaba con el render de `/clinicas`, donde el topbar no pide nada.

Eso no se arregla con una condición mejor. El dato depende de la ruta, y **la ruta solo es reactiva en el cliente**:

- `datosDelTopbarAction` (Server Action) trae `/me` + `/me/clinicas` + `/equipo` en paralelo, y resuelve ahí mismo cuál es la activa contra el id que devuelve `/me`. Sigue sin romperse el BFF: el navegador llama a la acción, no a la API.
- `PanelTopbarProvider` usa `usePathname`, que **sí** se entera de entrar y salir del panel, y comparte el resultado por contexto. Un contexto y no dos componentes independientes porque los dos controles viven en puntas opuestas del header: sin eso serían dos veces las mismas tres llamadas.
- El `x-pathname` del middleware se sacó: quedó sin uso, y dejarlo sugeriría un mecanismo que ya no existe.

**Lo que se pierde y se acepta:** los dos controles aparecen una vuelta de API después de que pinta el panel, en vez de venir con el HTML. A cambio funcionan en los dos caminos de entrada, que es la diferencia entre verse y no verse.

**El test que faltaba** es el que reproduce el camino real: montado fuera del panel no pide nada, y al cambiar la ruta a `/panel` —sin recargar— los dos controles aparecen. La primera versión tenía tests de las dos direcciones de "¿está en el panel?", pero ninguno navegaba: probaban el render inicial, que era justo el caso que sí funcionaba.

### Segunda ronda del topbar, y los tipos adentro del alta (2026-09-14)

**Cambiar de clínica desde el topbar ya no saca del panel.** Antes redirigía a "¿Qué necesitás hoy?", que era el comportamiento correcto para el selector de *esa* pantalla y el equivocado acá: **sacar a alguien de donde está trabajando por una acción que no lo pidió**. Ahora `entrarEnClinicaAction` acepta no redirigir; el selector del panel la usa así, pide los datos del topbar de nuevo y llama a `router.refresh()` para que el contenido también sea de la otra clínica. Los dos controles **se actualizan en vez de desaparecer**, que es lo que el cliente pidió textualmente.

**Los dos controles son exclusivos del header de `/panel`,** y el chequeo de ruta se repite en ellos además de en el provider. Es deliberado: con la comprobación en un solo lado, cualquiera que los monte en otra pantalla los vería igual.

**El header en mobile se rompía.** La primera versión escondía el selector en pantalla angosta —pensando que el renglón ya estaba ocupado— y el resultado era un header con la hamburguesa y nada más. El orden correcto, según la captura del cliente, es **hamburguesa · selector ocupando lo que sobra · avatar**: el selector pasa a ser el elemento principal de ese renglón, y el control de colaboradores se reduce a los avatares, sin el texto ni el chevron. Con nadie en línea se muestra un círculo con "0", porque si no en mobile el botón no tendría nada que tocar.

**Los tipos de un colega se mudaron ADENTRO del alta**, y dejaron de llamarse así: en el modal de "+ Agregar tipo" hay ahora una fila de **"Tipos de consulta ya creados"**. Elegir uno **rellena el formulario** —nombre y color, que es lo que conviene que la clínica comparta— y la duración, el tiempo post-consulta y la preferencia horaria se configuran ahí mismo antes de guardar.

El problema de la versión anterior no era dónde vivía el botón: era que **copiaba los tiempos del otro y recién después te dejaba editarlos, en otra pantalla**. Con el alta de siempre, el tipo nace propio sin que nadie tenga que garantizarlo, y por eso el endpoint `POST /tipos-consulta/de-colegas/{id}/incluir` **se eliminó**: la copia dejó de necesitar un camino propio en la API. Queda solo el listado, que es la sugerencia.

**Cuatro ajustes finos sobre lo anterior**, todos reportados mirando la pantalla:

- **El bloque "Tipos de consulta ya creados" se leía como una nota al pie.** El rótulo pasa a verde (`salvia-oscuro`) y la explicación a grafito pleno: en gris al 45% y al 60% quedaba como letra chica, y es la **primera decisión del formulario** — de dónde partir.
- **El avatar de colaboradores quedaba pegado a la píldora de la clínica.** En mobile el selector se estira para ocupar el renglón, y `justify-between` no deja aire cuando un elemento ya llenó su lado. El contenedor del header en el panel suma un `gap-3`, que actúa de piso.
- **Con el menú lateral de mobile desplegado, los dos controles no se despliegan.** Quedan debajo del drawer: abrirlos dejaría un popover tapado, o tapando el menú. Los botones pasan a `disabled` mientras el drawer está abierto, y tiene test.

### Dos provisorios que caducaron sin que nadie los mirara (2026-09-14)

Los encontró el cliente probando con un colega de verdad. **Los dos comparten una causa de forma:** eran simplificaciones correctas cuando una clínica tenía exactamente un profesional —su dueño— y dejaron de serlo **apenas la 3.2.4 permitió invitar a un segundo**. Ninguna se nota mirando la pantalla propia; se notan en la del otro.

#### El grave: el turno del colega se lo llevaba el titular

Un profesional invitado cargaba un turno y el turno **se le asignaba al titular**. Le aparecía en la agenda al titular y no en la suya — y el paciente detrás también, porque "los pacientes de X" se derivan de sus turnos.

El código lo decía con todas las letras:

```go
// Fase 3.2.1: quién atiende. Hasta que el modal deje elegir
// profesional (Fase 3.2.6) es el owner de la clínica.
atiende, err := db.OwnerDeLaClinica(gdb, profesionalID)
```

**Era verdad en la 3.2.1 y dejó de serlo en la 3.2.4**, sin que el comentario ni el código cambiaran. Y no es un detalle de UI pendiente: es **exactamente la fuga que el aislamiento de la 3.2.2 existe para impedir**, entrando por la puerta de al lado — no por una query que filtra mal, sino por el dato que esas queries leen. `soloMisTurnos` y `soloMisPacientes` funcionaban perfecto; lo que estaba mal era `atendido_por_user_id`.

La regla ahora: **si quien carga el turno es `profesional` de esta clínica, el turno es suyo.** Si no atiende —recepción cargando para el equipo— sigue cayendo al owner hasta la 3.2.6, que trae el selector de profesional en el modal. La diferencia es que el provisorio cubre solo al caso que no tiene respuesta mejor, en vez de a todos.

#### El otro: el invitado no podía entrar hasta crear una clínica que no quería

Un profesional invitado veía una pantalla en blanco y volvía a `/clinicas`. Solo podía entrar **después de crear su propia clínica**.

`onboardingCompletado` salía de `onboarding_step == "completo"`, y ese paso se marca **únicamente al crear una clínica propia**. Pero la 3.2.3 decidió que crear clínica dejaba de ser obligatorio —*"a la app también se entra porque un colega te sumó a la suya"*— y **el paso nunca se actualizó para eso**. El invitado quedaba en `clinica` para siempre y el guard del frontend lo rebotaba.

Se **deriva** en vez de arreglar la columna con una migración: la pregunta que hace el frontend es *"¿puede usar la app?"*, y eso es tener perfil y una clínica activa — lo que `/me` ya resuelve con la misma lógica que `requireClinic`. La columna sigue existiendo para saber en qué paso retomar el wizard, que es otra pregunta.

#### Lo que esto deja como lección

**Un provisorio con fecha de vencimiento escrita en un comentario no vence solo.** Los dos decían en qué subfase dejarían de servir, y las dos subfases pasaron sin que nadie volviera. Los tests nuevos los reproducen: con los arreglos revertidos, el del turno falla en las **dos direcciones** —el colega ve 0 turnos propios y el titular ve 1 que no es suyo— y el del onboarding falla al pedir `/me`.

### La agenda también era de la clínica, no de cada uno (2026-09-14)

Arreglar a quién se le asigna un turno dejaba el aislamiento **a medias**: los turnos dejaban de cruzarse, pero los huecos donde entran seguían saliendo de datos mezclados. Barrido completo de lo que quedaba.

**Las columnas estaban desde la 3.2.1; los handlers nunca las usaron.** `horarios_atencion.user_id` y `bloqueos_horario.user_id` se agregaron con el resto del esquema multi-tenant y ninguna consulta las escribió ni las leyó — exactamente el mismo caso que `tipos_consulta`, corregido horas antes en esta misma subfase. Tres tablas, el mismo olvido.

| Qué estaba mal | Qué pasaba con dos profesionales |
|---|---|
| Horario de atención filtrado solo por clínica | El `PUT` encontraba la fila `general` del colega y **la pisaba**: guardar el propio le cambiaba el horario al otro |
| Horarios reservados filtrados solo por clínica | El almuerzo de uno aparecía en el calendario del otro |
| `calcularDisponibilidad` contaba los turnos de **toda la clínica** | El turno del colega a las 10 bloqueaba las 10 propias |

**El tercero es el que más dice.** Es el mismo bug que la 3.2.1 sacó del exclusion constraint al mudarlo de la clínica a `atendido_por_user_id` —*"sobre la clínica rechazaría dos turnos simultáneos en sillones distintos: pasa de garantía a bug"*— **reaparecido un nivel más arriba**: el motor ya los dejaba convivir, pero la pantalla no los ofrecía. La corrección de abajo no arrastró a la de arriba.

**Y había una regla vieja escrita en el motor.** El índice `idx_horario_atencion_general_unico` imponía *una fila general por CLÍNICA*. No era una red de seguridad: era la regla de cuando había un solo profesional. El segundo que guardaba su horario se llevaba un **500 crudo** por querer decir a qué hora abre. Ahora es por `(clinic_id, user_id)`, con `COALESCE` para que las filas anteriores a la 3.2.1 —que tienen `user_id` nulo— no se multipliquen: en un índice único dos NULL nunca son iguales.

`calcularDisponibilidad` pasa a recibir el profesional además de la clínica. Sus seis llamadores lo resuelven donde corresponde: el panel con quien pregunta, autoreservar con el dueño del turno que mueve, y el wizard público con el owner —**el mismo** al que después le asigna el turno, que es lo que importa: ofrecer los horarios de uno y agendar con otro sería peor que cualquiera de los dos bugs.

**Lo que esto deja como método:** cuando una columna nueva del esquema no se usa en ningún handler, no está "pendiente de cablear" — está creando la ilusión de que la regla existe. Las tres tablas tenían la columna desde la 3.2.1 y las tres se comportaban como antes de la 3.2.1.

### El barrido completo de gestión de clínica (2026-09-14)

Pedido del cliente, textual: *"TODA la lógica que se maneja en gestión de clínica debería ser individual para cada profesional"*. Inventario de **todas** las consultas del panel filtradas solo por clínica, y cierre una por una.

#### Lo que estaba abierto, y qué permitía

| Dónde | Qué se podía hacer con el turno/dato de un colega |
|---|---|
| Detalle, cancelar, reprogramar, marcar asistencia | **Cancelarlo de verdad.** Con solo tener el id — y marcar asistencia es irreversible (TR-092) |
| Pendientes de asistencia | Los del colega aparecían en el listado que invita a cerrarlos |
| Editar / borrar tipo de consulta | **Borrárselo.** El listado ya mostraba solo los propios; la escritura por id seguía abierta |
| Conflictos de paciente (listar y resolver) | Resolver el conflicto de identidad de un paciente ajeno |
| Tarjetas de "General" | Contaban conflictos y turnos del colega — incluidos "conflictos" entre el turno de uno y el horario reservado del otro, que no existen |
| Enlace para compartir | Los turnos que entraban por él iban al **owner**, no a quien lo generó |

Lo de los tipos y el cancelar no son hipótesis: revirtiendo los arreglos, los tests devuelven `200` con `"estado":"cancelada"` y un `204` seguido de *"el tipo del colega desapareció: record not found"*.

#### Dos scopes nuevos, y por qué de esa forma

- **`soloMisConflictos` se deriva del turno**, no de una columna nueva. `conflictos_paciente` no tiene `user_id`, y un conflicto **siempre** nace de un turno, que ya sabe quién atiende. Derivarlo evita migrar las filas existentes y no puede desincronizarse de su origen.
- **`enlaces_turno` sí necesitó columna.** Un enlace no cuelga de ningún turno previo — los **crea** — así que no hay de dónde derivar el dueño. Y el dueño importa más acá que en otras tablas: el enlace decide a qué agenda entran los turnos que salgan de él. La tercera pestaña de "+ Agregar turno" existe para llenar la agenda de quien la abre; mandar esos turnos al owner haría que compartir el link le cargara trabajo a otro.

#### Lo que queda clínica-wide, a propósito

No todo lo del panel es individual, y conviene que esté dicho: los **bloqueos de mail e IP** del formulario público (`seguridad_turno_publico.go`) protegen la página de la clínica, que es una sola. La **unicidad de DNI por clínica** (TR-100) también: una persona tiene una ficha, la atienda quien la atienda.

#### La corrección incómoda

`CLAUDE.md` afirmaba que los scopes cubrían *"17 queries de turnos y 8 de pacientes"*. **Los reales eran 1 y 3.** Ese número se escribió describiendo la intención y nadie lo volvió a medir — y es lo que me hizo dar por cubierto el aislamiento de turnos al responder que "los pacientes sí, los turnos también".

Los de ahora están contados, no estimados: **6 turnos · 3 pacientes · 8 agenda · 3 conflictos · 3 tipos**. Si alguien agrega una query, que actualice el número contando, no recordando.

### El barrido riguroso, y por qué hicieron falta cuatro rondas (2026-09-14)

Cuatro rondas para cerrar el aislamiento. Cada una encontró lo que la anterior no había mirado. Vale la pena dejar escrito **por qué**, porque la causa no fue el código.

#### Lo que faltaba en esta última pasada

| Dónde | Qué permitía |
|---|---|
| Las **7 consultas** del resumen de "General" | Cada tarjeta contaba lo de toda la clínica. Es la primera pantalla del panel |
| Autoreservar | **Mover de día** los turnos de un colega, en lote |
| Cancelación masiva de turnos sin verificar | **Limpiarle la agenda entera** a un colega, de un botón |
| "Próximo vencimiento" del cartel de asistencia | El del colega |

Las dos de en medio son escrituras **en lote**, que es lo peor: nadie revisa uno por uno lo que mandó.

#### Por qué se me pasaron

No fue que la regla no estuviera escrita. Estaba en `CLAUDE.md` desde la 3.2.2, en mayúsculas. Fueron tres cosas, y ninguna es "me olvidé":

1. **Busqué por patrón en vez de por ruta.** Mis greps buscaban `clinic_id = ?` al principio de un `Where`. Autoreservar usa `id IN ? AND clinic_id = ?` y la cancelación masiva parte el `Where` en varias líneas: no aparecían. **El inventario correcto empieza por las 38 rutas del panel, no por una cadena de texto.**
2. **Mis propias verificaciones tenían el mismo defecto que el código.** El primer script de auditoría miraba 3 líneas hacia atrás buscando `Scopes(...)`; varias cadenas de GORM lo tienen en la línea **siguiente**. Daba por acotadas consultas que no lo estaban, y por sin acotar otras que sí.
3. **La documentación afirmaba una cobertura que nadie midió.** *"17 queries de turnos y 8 de pacientes"* — eran 1 y 3. Ese número me hizo dar por hecho el trabajo al responder que el aislamiento estaba resuelto.

#### El arreglo de fondo: la regla se verifica, no se recuerda

`TestAislamiento_NingunaConsultaDelPanelSinAcotar` lee el código de los 14 archivos del panel y **falla** si aparece una consulta que filtra por clínica sin acotar por profesional. Para agregar una nueva hay dos caminos, los dos legítimos: acotarla con un scope, o sumarla a la lista `clinicaWide` del test **con el motivo**. Lo que deja de ser posible es no elegir.

Verificado que sirve: quitándole el scope a `listTurnosHandler`, el test falla nombrando archivo, línea y consulta.

Es el mismo criterio que el proyecto ya usa en la base (spec §4.3): **una regla que no se puede violar no se valida, se declara**. Acá no se puede declarar en el motor, así que se declara en un test que lee el código.

#### El estado, medido

**39 consultas acotadas** por profesional. **18 clínica-wide a propósito**, cada una con su motivo escrito en el test: la ficha del paciente y su DNI (el paciente es de la clínica), el token de un enlace (es la autorización), los bloqueos de mail/IP del formulario público, la página pública y el catálogo de especialidades. **Cero sin justificar.**

