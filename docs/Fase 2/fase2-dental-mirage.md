# Fase 2 — Dental Mirage

## Contexto

Damos por concluida la fase MVP del proyecto y comenzamos el desarrollo especializado.

## Objetivo de la fase

Refinar calendario: poder compartir calendario, que los pacientes puedan sacar su turno seleccionando. Configuración de calendario para que el profesional pueda setear horarios de atención y horas no disponibles.

---

## 1. Calendario mobile — vista semana: encabezados que acompañan el scroll

- Primero en el calendario en la versión mobile, en el apartado semana que tanto los días como las horas acompañen al usuario cuando se desplaza por el calendario, puede llegar a ser molesto moverse y perder noción de dónde está posicionado el usuario.
- Es decir que si yo me muevo horizontalmente por el calendario, al costado los horarios me van siguiendo, y verticalmente los días.
- Para cualquier otro ángulo de movimiento este seguimiento se debe ajustar en dónde estoy posicionado, así la información es coherente.

---

## 2. Opción de pantalla grande en mobile para el calendario

- Dar una opción en mobile donde la vista del apartado calendario sea horizontal, para que el usuario pueda ver más cómodamente este apartado, simulando una versión de escritorio pero mobile.

---

## 3. Opción ajustes de calendario

El profesional puede manejar los horarios de su calendario de tal manera que pueda:

- Poner el horario de atención general, cosa que en el calendario muestre de tal horario a tal horario.
- Tiempo entre turnos, cosa que el profesional pueda guardar horas o tiempo entre turno y turno.
- Agregar tipo de consultas y modificar su duración.
- Poder editar en los diferentes días de la semana tiempos en los que no se puede pedir turno, es decir tener más control en los tiempos de los días individuales, y también de los días, etc.

**Referencia:** tomando de inspiración cómo lo hace la aplicación de Ulifeon.

**Previsualización:**

- Mostrar una previsualización de cómo quedaría el calendario con los ajustes que hace el cliente.
- Es decir, para englobar: el usuario puede hacer ajustes globales de calendario, como lo es el horario de atención que no suele variar semana a semana, tiempos de los tipo de consulta, etc.
- Pero puede tener imprevistos en tal semana, etc. Entonces mostrará una previsualización de cómo va quedando el calendario, y yo puedo ir pasando de semana en semana e ir poniendo mi configuración.
- Lo mismo con los meses: yo puedo ir directamente al día de tal mes o la semana de tal mes.

---

## 4. Selección de horario por parte del paciente

Ahora los pacientes pueden seleccionar su horario, tanto en página como en la función siguiente que será la 5.

Cada paciente cuando quiera sacar turno, por ejemplo desde la página, tendrá que pasar por varios pasos:

### Paso 1 — ¿Para quién es el turno?

- Primero se le pedirá al cliente si el turno es para él o para otra persona.
- 2 opciones bien claras, una al lado de la otra, tanto con un ícono de persona individual, y otro ícono de una persona más grande y otra más chica.
- El paciente escoge una, se cierra verticalmente este apartado y se abre otro verticalmente.
- Siempre en la nueva pestaña con una opción para retroceder y volver a la anterior.

### Paso 2 — ¿Paciente nuevo o ya registrado?

- En la próxima pestaña dirá: ya eres paciente o este es mi primer turno, con el mismo formato de lo anterior.
- Se cual seleccione, se cerrará verticalmente esta pestaña y entramos a la sección de pedir turno.

### Paso 3 — Camino de paciente nuevo

- Al paciente nuevo elegirá su tipo de consulta, y le mostrará los horarios disponibles del profesional.
- Primero verá el calendario del profesional semanalmente, arrancando del día presente, y puede ver los demás días para ver la agenda del profesional.
- Una vez escoja el día, ese calendario se transformará en la vista de día del día seleccionado. Es decir, primero una visualización general de los horarios del profesional, luego elige el día que le parezca y le mostrará bien claro para ese día los horarios disponibles que concuerden con la agenda del profesional.
- Y una visualización del calendario del profesional en ese día, no mostrando datos de otros pacientes, sino mostrando como horario no disponible.
- Como en mobile el espacio de la pantalla es reducido, mostrará un botón de ver agenda, donde el paciente podrá ver bien y luego cerrarlo para seguir completando datos.
- Luego completará sus datos y mandará el turno.
- El profesional ya lo recibirá en su casilla de pendientes ya con el horario y lo confirmará.
- En caso de que el DNI esté ya registrado en un paciente, cargar el turno para el paciente ya registrado.

### Paso 4 — Camino de paciente ya registrado

- El segundo camino, de paciente ya registrado: el mismo procedimiento.

---

## 5. Compartir calendario

- En el apartado calendario dar otra opción bien visible debajo de calendario que se llama "compartir calendario", que utilizará el mismo proceso del paso 4 para pedir turno.
- La idea es que el profesional no necesariamente deba compartir/usar la página para que el cliente saque turno como se hace en la página, sino que pueda compartir un link de duración 1h antes de que se venza y haga el mismo proceso.
- **En mobile:** cuando le dé a compartir, que aparezca la opción estándar de "compartir en:" y le dé las opciones: WhatsApp, mail, etc.
- **En escritorio:** aparecerá, una vez dado click, compartir por WhatsApp (que abrirá WhatsApp Web), mail, o copiar el link.

---

## Metodología de trabajo

- Implementar esta nueva fase 1 por 1.
- Yo le haré QA a cada una y, cuando te diga, pasaremos a la siguiente fase.
- Trabajaremos en una rama `/features-fase2`.
- No hará ningún commit ni push hasta que yo apruebe el QA.
- Una vez aprobada cada fase, hará commit a la rama `/feature` y mediante un PR hará merge a `dev`.
