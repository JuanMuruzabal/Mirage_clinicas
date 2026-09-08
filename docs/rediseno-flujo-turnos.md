# Rediseño — Flujo "Pedir turno"

Especificación de implementación. Describe el rediseño de todos los modales del flujo de reserva de turnos, manteniendo la paleta y la tipografía actuales del sitio.

Alcance: solo frontend de los modales del flujo de reserva. No cambia el modelo de datos ni los endpoints, salvo donde se indica explícitamente en "Notas para el backend".

---

## 1. Principios del rediseño

Los cambios responden a seis problemas detectados en el diseño actual:

1. **Falta de contexto.** Varias pantallas no dicen para quién es el turno ni en qué punto del flujo estás. Se agrega una barra de contexto y un indicador de paso.
2. **Estados invisibles.** No hay estado seleccionado, ni foco visible, ni error, ni vacío. Se definen todos.
3. **Opciones indistinguibles.** Íconos casi idénticos y textos sin descripción. Cada opción lleva ícono propio y una línea de apoyo.
4. **Placeholders confusos.** Campos vacíos sin ejemplo, y un `000000` gris que parece contenido ya cargado.
5. **Jerarquía plana.** Acciones secundarias (Atrás) con el mismo peso visual que la decisión principal.
6. **Controles nativos donde no corresponde.** `<select>` de horarios reemplazado por fichas tocables.

Regla general: **la paleta, la tipografía y el aire del diseño actual no cambian.** Cambia cómo se usan.

---

## 2. Tokens

```css
:root {
  /* Superficies */
  --t-modal:        #FDFCF8;  /* fondo del modal */
  --t-field:        #F3EBE2;  /* campos, tarjetas, chips */
  --t-field-hover:  #F7F1EA;  /* campo enfocado */
  --t-field-sel:    #EDE3D6;  /* tarjeta seleccionada */
  --t-field-deep:   #E6DACB;  /* círculo de ícono, badge */
  --t-overlay:      rgba(0,0,0,0.45);

  /* Texto */
  --t-ink:          #2C3A2A;  /* títulos y valores */
  --t-ink-soft:     #6E6A5E;  /* labels y descripciones */
  --t-ink-mute:     #8C8578;  /* hints, metadatos, placeholders */

  /* Marca */
  --t-green:        #3E6B4C;  /* botón principal, íconos, selección */
  --t-green-ink:    #FDFCF8;  /* texto sobre verde */
  --t-green-tint:   #EDF2ED;  /* fondo del resumen de confirmación */

  /* Líneas */
  --t-line:         #EDE4DA;  /* divisor del pie */
  --t-line-strong:  #DCCFC0;  /* borde punteado, separador interno */

  /* Error */
  --t-danger:       #A32D2D;

  /* Radios */
  --t-r-modal:      18px;
  --t-r-card:       12px;
  --t-r-field:      10px;
  --t-r-btn:        8px;
}
```

**Verificar los hex contra el sistema real antes de implementar.** Los valores de arriba están tomados de las capturas y pueden diferir en 1–2 puntos de los tokens de producción. Si ya existen variables en el proyecto, usar esas y descartar estas.

### Tipografía

| Rol | Familia | Tamaño | Peso |
|---|---|---|---|
| Título del modal | condensada de marca (la de "¿Para quién es el turno?") | 26px | 600 |
| Día grande (selector de fecha) | misma condensada | 28px | 600 |
| Cuerpo / descripción | sans del sitio | 14px | 400 |
| Label de campo | sans | 13px | 400 |
| Valor en campo | sans | 15px | 400 |
| Hint / metadato | sans | 12px | 400 |
| Dígitos del código y horarios | monoespaciada | 20–22px | 400 |

Sentence case en todo. Sin mayúsculas sostenidas, salvo el día grande del selector de fecha.

### Espaciado

- Padding del modal: `24px`
- Ancho máximo: `480px` (pantallas de elección), `520px` (formularios y selector de fecha), `500px` (búsqueda de ficha)
- Separación entre bloques: `20px`
- Separación entre campos: `12px` vertical, `16px` horizontal
- Grilla de dos columnas: `repeat(auto-fit, minmax(200px, 1fr))` — colapsa sola a una columna en móvil

---

## 3. Componentes compartidos

Implementar una vez y reutilizar en todas las pantallas.

### 3.1 Shell del modal

```
┌─────────────────────────────────────────┐
│ Título                              [×] │
│ Subtítulo de una línea                  │
│ ┌─ barra de contexto (opcional) ──────┐ │
│ └─────────────────────────────────────┘ │
│                                         │
│   … contenido …                         │
│                                         │
│ ───────────────────────────────────────  │  ← divisor
│ ← Atrás           Paso N de M  [Acción] │
└─────────────────────────────────────────┘
```

- Fondo `--t-modal`, radio `--t-r-modal`, sin sombra.
- **La [×] va adentro del modal**, arriba a la derecha, `28×28`, ícono 18px, color `--t-ink-mute`, fondo transparente. Hoy está flotando afuera en un círculo blanco: quitar ese círculo.
- El título y el subtítulo son un bloque; la [×] se alinea a la primera línea del título.

#### Estructura de 3 zonas (`docs/archivo/prompt-claude-code-fecha-horario.md`, punto 3)

Con el calendario mensual (3.8) abierto, o con la lista larga de fichas de [5b], el contenido puede superar viewports chicos — si el modal entero scrollea de un tirón, el pie ("Confirmar turno") puede quedarse fuera de pantalla sin forma de llegar a él. El modal se parte en 3 zonas verticales, nunca en una sola:

```css
.modal {
  display: flex;
  flex-direction: column;
  max-height: min(85dvh, 720px); /* dvh, no vh: la barra del navegador en mobile rompe vh */
  background: var(--t-modal);
  border-radius: var(--t-r-modal);
}
.modal__head { flex: 0 0 auto; padding: 24px 24px 0; }
.modal__body {
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 24px;
  scrollbar-width: thin;
  scrollbar-color: var(--t-line-strong) transparent;
}
.modal__foot {
  flex: 0 0 auto;
  padding: 16px 24px 24px;
  border-top: 1px solid var(--t-line); /* el ÚNICO divisor — sacarlo del pie (3.2) para no duplicar */
  background: var(--t-modal);
}
```

- Cabecera (título/subtítulo/[×]/barra de contexto) y pie SIEMPRE fijos — solo el cuerpo scrollea.
- Cuando el cuerpo tiene scroll disponible, una sombra sutil bajo la cabecera (`box-shadow: 0 1px 0 var(--t-line)`) aparece SOLO si `scrollTop > 0` — la única señal de que hay contenido arriba.
- Nada de scroll anidado: la lista de fichas de [5b] (antes con su propio `max-height`/scroll interno, ver 3.6) pasa a ser contenido normal del cuerpo — es el mismo scroll el que la resuelve.

### 3.2 Pie (footer)

- Divisor: el `border-top` de `.modal__foot` de arriba — nunca uno propio acá, dejaría dos líneas seguidas.
- Izquierda: **"Atrás" como botón de texto** con flecha `←`, `--t-ink-soft`, sin borde ni fondo. Hoy es una píldora blanca con borde grueso que compite con la decisión principal.
- Derecha: indicador de paso (12px, `--t-ink-mute`) + acción principal.
- Acción principal: fondo `--t-green`, texto `--t-green-ink`, radio `--t-r-btn`, alto `40px`, padding lateral `24px`.
- **Deshabilitada hasta que la pantalla esté completa**: `opacity: .45`, `disabled`. No ocultarla ni cambiarle el color.
- El texto del botón nombra la acción: "Continuar", "Buscar mi ficha", "Confirmar turno", "Sí, soy yo".

### 3.3 Campo de texto

```html
<label for="x">Label</label>
<input id="x" placeholder="ejemplo real">
<p class="hint">Ayuda opcional</p>
```

- Alto `44px`, fondo `--t-field`, `border: 1.5px solid transparent`, radio `--t-r-field`, padding lateral `12px`.
- **Foco:** `border-color: --t-green` y fondo `--t-field-hover`. El borde transparente en reposo evita que el layout salte.
- **Placeholder = ejemplo real** ("María", "30123456", "maria@gmail.com"), nunca el label repetido ni "e.g.".
- Hint debajo en 12px `--t-ink-mute`, solo cuando aporta ("Sin puntos ni espacios", "Ahí te llega el código").
- Textarea: mismo estilo, `rows="2"`, `resize: none`.

### 3.4 Select

Mismo estilo que el campo de texto, más:

- `appearance: none` y chevron propio (`ti-chevron-down`, 16px, `--t-ink-mute`) posicionado a `12px` de la derecha, `pointer-events: none`.
- Placeholder: `<option value="">Elegí una opción</option>`. Mientras `value === ""`, el texto del select va en `--t-ink-mute`; al elegir, pasa a `--t-ink`.

### 3.5 Tarjeta de opción (elección binaria)

```
┌──────────────────────┐
│ (icono)         ✓    │
│ Título               │
│ Descripción corta    │
└──────────────────────┘
```

- Fondo `--t-field`, `border: 2px solid transparent`, radio `--t-r-card`, padding `16px`, **texto alineado a la izquierda** (hoy está centrado y deja mucho aire muerto).
- Ícono dentro de un círculo `38px` de `--t-field-deep`, ícono `20px` en `--t-green`.
- Check `ti-circle-check` arriba a la derecha, `opacity: 0` en reposo.
- **Seleccionada:** borde `--t-green`, fondo `--t-field-sel`, check visible.
- **Hover:** borde `--t-line-strong`.
- `role="button"`, `tabindex="0"`, responde a Enter y Espacio.
- Grilla `repeat(auto-fit, minmax(180px, 1fr))`, gap `12px`.

### 3.6 Fila de persona (listas de fichas)

```
┌────────────────────────────────────────┐
│ (AG)  Ana Gómez                    ✓   │
│       Hija · última visita 12 mar 2026 │
└────────────────────────────────────────┘
```

- Mismo esquema de selección que la tarjeta de opción, pero en fila y con padding `12px 14px`.
- Avatar circular `40px` con iniciales, fondo `--t-field-deep`, texto `--t-green`.
- Línea secundaria: vínculo + última visita, 13px `--t-ink-soft`.

### 3.7 Barra de contexto

Chip de ancho completo, fondo `--t-field`, radio `--t-r-field`, padding `10px 12px`, ícono a la izquierda en `--t-green`, texto 13px, y a la derecha un botón de texto "Editar" / "Cambiar" que vuelve al paso correspondiente.

**Solo puede mostrar datos que ya existen en ese punto del flujo.** No referenciar el nombre del paciente en pantallas anteriores a su carga.

### 3.8 Panel de calendario mensual

Reemplaza el `<input type="date">` nativo del selector de fecha en [6]: no se puede estilar, se monta encima del contenido con los estilos del sistema operativo del usuario y rompe la paleta con sus links azules.

- **Toggle, no popover.** El botón que lo abre ("Elegir fecha" → "Cerrar calendario", `aria-expanded`) despliega el panel DEBAJO del navegador de día, DENTRO del flujo del modal — empuja el contenido hacia abajo, nunca flota por encima. Al elegir un día, el panel se cierra solo, el navegador de día se actualiza y la selección de horario se resetea.
- **Estructura:** contenedor con fondo `--t-field`, radio `--t-r-card`, padding `12px`. Cabecera con flecha mes anterior, nombre del mes y año (14px, peso 500), flecha mes siguiente — flechas `32×32`, fondo `--t-modal`, radio 8px, con `aria-label`. Fila de iniciales de día en 11px `--t-ink-mute`, minúscula, semana empezando en domingo (`do lu ma mi ju vi sa`). Grilla de 7 columnas, gap `2px`, celdas de `38px` de alto. Pie: leyenda `● con turnos` (punto de 5px en `--t-green`) a la izquierda, botón de texto `Volver a hoy` a la derecha, separados por una línea `1px solid --t-line-strong`.
- **Estados de cada día:**

  | Estado | Tratamiento |
  |---|---|
  | Con turnos | texto `--t-ink` + punto de 4px en `--t-green` abajo, centrado |
  | Sin turnos o pasado | texto `--t-ink-mute` apagado (`#BDB3A5`), `disabled`, sin cursor pointer |
  | Hoy (no seleccionado) | `box-shadow: inset 0 0 0 1.5px #C9BDAE` |
  | Seleccionado | fondo `--t-green`, texto `--t-green-ink`, sin punto |

- **La disponibilidad se pinta ANTES de que el usuario toque el día.** El backend expone esto en un endpoint propio (no reutiliza el de un solo día): `GET /clinicas/{slug}/disponibilidad-mes?tipoConsultaId=&mes=YYYY-MM` → `{ "dias": ["2026-09-07", ...] }`, un array de fechas del mes visible con al menos un horario libre. Al cambiar de mes con las flechas, se pide el mes nuevo — nunca una llamada por día.
- **Navegación por teclado:** flechas mueven el foco entre días (roving tabindex, no depende del orden natural de Tab), Enter y Espacio seleccionan (nativo, son `<button>`), Escape cierra el panel y devuelve el foco al botón que lo abrió.

---

## 4. Mapa de flujos

```
[1] ¿Para quién es el turno?
      │
      ├── Para mí ──────────► [2] ¿Ya te atendiste?
      │                            ├── Primera vez ──► [3a] Tus datos ──► [4] Código ──► [6] Día y hora ──► fin
      │                            └── Ya vine ──────► [3b] Buscar ficha (DNI + email)
      │                                                     └► [4] Código ──► [5a] ¿Sos vos? ──► [6] ──► fin
      │
      └── Para otro ───────► [2] ¿Ya te atendiste?
                                   ├── Primera vez ──► [3c] Tus datos (quien reserva)
                                   │                        └► [4] Código ──► [3d] Datos del paciente ──► [6] ──► fin
                                   └── Ya vine ──────► [3e] Buscar por email
                                                            └► [4] Código ──► [5b] ¿Para quién? (lista) ──► [6] ──► fin
```

El **código de verificación siempre va antes** de mostrar cualquier ficha. Ninguna pantalla previa a [4] muestra datos de paciente.

Indicador de paso: la rama "para mí" tiene 4 pasos, la rama "para otro" tiene 5. El componente recibe `paso` y `total` por props.

---

## 5. Pantallas

### [1] ¿Para quién es el turno?

- Título: `¿Para quién es el turno?`
- Subtítulo: `Podés reservar a tu nombre o a nombre de otra persona.`
- Dos tarjetas de opción (3.5):
  - `ti-user` — **Para mí** — `Usamos tus datos guardados`
  - `ti-users` — **Para otra persona** — `Vas a cargar sus datos`
- Pie: sin "Atrás" (es el primer paso), paso 1, botón "Continuar".

Cambios respecto del actual: los dos íconos eran casi iguales (silueta vs. silueta con pin) y no diferenciaban nada. Una silueta contra dos siluetas se lee de inmediato. "Para otro" pasa a "Para otra persona".

### [2] ¿Ya te atendiste con nosotros?

- Título: `¿Ya te atendiste con nosotros?` — en voseo, no "¿Ya te has atendido?".
- Subtítulo: `Si ya viniste, buscamos tu ficha y salteás varios pasos.`
- Dos tarjetas de opción:
  - `ti-user-plus` — **Es mi primera vez** — `Creamos tu ficha ahora`
  - `ti-user-check` — **Ya vine antes** — `Buscamos tus datos`
- Pie: "Atrás", paso 2, "Continuar".

"Ya he venido anteriormente" se acorta a "Ya vine antes" para emparejar el largo de las dos etiquetas.

### [3a] Tus datos — para mí, primera vez

- Título: `Tus datos`
- Subtítulo: `Los usamos para confirmarte el turno y avisarte si hay cambios.`
- Campos, en grilla de dos columnas:

| Campo | Placeholder | Hint |
|---|---|---|
| Nombre | `María` | — |
| Apellido | `Gómez` | — |
| DNI | `30123456` | `Sin puntos ni espacios` |
| Teléfono | (según país) | `Te escribimos por WhatsApp` |
| Email (ancho completo) | `maria@gmail.com` | — |
| Motivo de consulta (textarea, ancho completo) | `Contanos brevemente qué te trae` | — |

- El label de motivo lleva "Opcional" alineado a la derecha, en `--t-ink-mute`, no entre paréntesis pegado al texto.

#### Campo de teléfono con selector de país

Un solo control visual: contenedor con el estilo de campo, y adentro `select` + separador `1px × 22px` en `--t-line-strong` + `input`.

- El `select` muestra `AR +54`, `UY +598`, `CL +56`, `PY +595`, `BO +591`, `BR +55`, `ES +34`, `US +1`. Código ISO **y** prefijo: solo el número o solo la bandera obliga a pensar.
- Default `AR +54`.
- Al cambiar el país, el **placeholder del input cambia al formato local** de ese país (`data-ex` en cada option) y se limpia el valor.
- El foco en cualquiera de las dos partes ilumina el contenedor entero, para que se lea como un campo único.

### [3b] Buscar ficha — para mí, ya vine antes

- Título: `Buscamos tu ficha` (no "Contanos con qué datos te registraste").
- Subtítulo: `Con tu DNI y el mail que usaste la última vez.`
- Campos en dos columnas: DNI (hint `Sin puntos ni espacios`) y Email (hint `Ahí te llega el código`).
- Botón principal: **`Buscar mi ficha`**, no "Continuar" — acá se dispara una búsqueda que puede fallar.

**Estado sin resultados:** mensaje en el modal, no un alert. `No encontramos una ficha con esos datos.` + dos salidas: revisar los datos, y **`Registrarme como paciente nuevo`** que empalma con [3a]. Sin esa segunda salida el usuario queda trabado.

### [3c] Tus datos — para otro, primera vez

Esta pantalla va **antes** de los datos del paciente, porque el código de verificación se manda al mail de quien reserva.

- Título: `Primero, tus datos`
- Subtítulo: `Te contactamos a vos por cualquier cambio en el turno.`
- Barra de contexto: `Reservás para otra persona · primera vez en la clínica` + "Cambiar". **No nombrar al paciente: todavía no se cargó.**
- Campos: Tu nombre completo (`Lucía Gómez`) · Sos su… (select) · Tu teléfono (con selector de país) · Tu email (hint `Acá te mandamos el código de confirmación`).
- Vínculos del select: Madre o padre · Hijo o hija · Pareja · Familiar · Tutor o tutora legal · Otro vínculo.
  - Si elige **"Otro vínculo"**, aparece un campo `Especificá el vínculo` (placeholder `Vecina, cuidadora…`).
- Checkbox marcado por defecto: `Quiero recibir el recordatorio del turno por WhatsApp a este número.` (`accent-color: --t-green`).
- **Aviso de lo que viene**, arriba del pie, con `ti-arrow-narrow-right`: `Después te pedimos los datos de la persona que se atiende.` Sin esto, el usuario que entró a sacar turno para su madre no entiende por qué le piden sus propios datos.
- Pie: paso 3 de 5.

### [3d] Datos del paciente — para otro, primera vez

Misma estructura que [3a], con estas diferencias:

- Título: `Datos de la persona que se atiende`
- Barra de contexto: ahora sí puede decir `Reservás vos, Lucía Gómez · madre` con "Editar".
- Sin campo de teléfono ni email propios del paciente (el contacto es el de quien reserva), salvo que el negocio lo requiera.
- Si el vínculo elegido en [3c] fue "Madre o padre" o "Tutor o tutora legal", **agregar campo de fecha de nacimiento** y evaluar si la clínica necesita documentación adicional para menores.

### [4] Código de verificación

- Título: `Confirmanos que sos vos`
- Subtítulo: `Mandamos un código de 6 dígitos a <b>mail@ejemplo.com</b>` (una sola frase; el segundo renglón del diseño actual sobra).
- Debajo, botón de texto **`Cambiar email`**. Es el error más común de esta pantalla y hoy no tiene salida.

#### Input de código

**Seis casillas separadas**, no un campo único. El `000000` gris del diseño actual se lee como contenido ya cargado y no muestra cuántos dígitos faltan.

- Cada casilla: `56px` de alto, ancho flexible, `text-align: center`, fuente monoespaciada 22px, mismo fondo y foco que un campo normal. Gap `10px`.
- `inputmode="numeric"`, `maxlength="1"`, `aria-label="Dígito N"`.
- Comportamiento obligatorio:
  - avance automático al escribir un dígito;
  - `Backspace` en casilla vacía vuelve a la anterior y la borra;
  - flechas izquierda y derecha navegan;
  - **pegar el código completo llena las seis casillas** (interceptar `paste`, limpiar no-dígitos, tomar los primeros 6);
  - filtrar cualquier caracter que no sea dígito.
- **Error:** línea reservada debajo, 12px `--t-danger`: `El código no coincide. Revisalo e intentá de nuevo.` Limpia las casillas y devuelve el foco a la primera. La línea ocupa espacio siempre (`visibility`, no `display`) para que el layout no salte.

#### Reenviar

`Reenviar código en 0:30`, deshabilitado, con cuenta regresiva. Al llegar a cero pasa a `Reenviar código` en `--t-green` y habilitado. Evita el doble envío y protege el endpoint.

#### Bloque de desarrollo

Solo bajo `NODE_ENV !== 'production'` (o el flag equivalente).

- Borde `1px dashed --t-line-strong`, radio `--t-r-field`, badge `solo dev` y el código en monoespaciada, más un botón `Autocompletar`.
- **Cuando no se renderiza no debe dejar hueco**: el bloque entero se monta o no se monta, no se oculta con visibilidad.

### [5a] ¿Sos vos? — resultado único

Llega **después** de validar el código, así que la identidad ya está probada.

- Título: `¿Sos vos?` · Subtítulo: `Encontramos esta ficha con tus datos.`
- Una fila de persona (3.6) con **datos completos**: nombre y apellido, DNI sin enmascarar, última visita. El enmascarado (`Juan M.`, `44***992`) tiene sentido antes de verificar; después, esconderle a alguien su propio nombre solo genera dudas.
- **Viene preseleccionada.** Con un único resultado y la identidad verificada, obligar a tocar la tarjeta y después el botón son dos pasos para una decisión ya tomada.
- Pie: `No soy yo` (texto, vuelve a [3b] con los campos cargados) y `Sí, soy yo`.
- No mostrar "te mandamos el código a…": ya pasó.

*Opcional a evaluar:* con DNI + email + código validado, esta pantalla es casi redundante. Se puede reemplazar por un saludo en [6] (`Hola Juan, elegí día y horario`) con un "no soy yo" discreto, y ahorrar un paso.

### [5b] ¿Para quién es el turno? — lista de fichas

Rama "para otro / ya vine antes". La búsqueda es **solo por email**, porque una misma persona puede tener varios pacientes asociados.

- [3e] previa: título `¿Con qué mail reservaste antes?`, subtítulo `Buscamos las fichas asociadas a esa dirección.`, un solo campo, botón `Buscar`.
- Tras el código, esta pantalla: título `¿Para quién es el turno?`, subtítulo `Estas son las personas de tu cuenta.`
- Una fila de persona (3.6) por ficha. **Ninguna preseleccionada**: acá sí hay una decisión real.
- La ficha propia del titular aparece en la lista con un badge `vos` (fondo `--t-field-deep`, 11px). Cubre al que entró por "para otro" pero el turno era para él.
- Última fila, con `border: 2px dashed --t-line-strong` y fondo transparente: `ti-plus` — **Otra persona** — `Cargamos sus datos ahora`. Al elegirla, el siguiente paso es [3d].

#### Scroll de la lista

**Superado por la estructura de 3 zonas de 3.1** (`docs/archivo/prompt-claude-code-fecha-horario.md`, punto 3 — esta lista larga fue justo el caso que motivó extender el scroll a los 3 zonas de TODOS los modales, no solo este). La lista ya no tiene su propio `max-height`/scroll interno: es contenido normal dentro de `.modal__body`, que scrollea solo. Un segundo scroll acá adentro sería scroll anidado — lo que esta sección originalmente pedía evitar, ahora resuelto un nivel más arriba.

### [6] Día y horario

La pantalla más importante del flujo. Reemplaza el `<input type="date">` + `<select>` de horarios — y, desde la segunda vuelta (`docs/archivo/prompt-claude-code-fecha-horario.md`), el propio `<input type="date">` del selector de fecha por un calendario mensual propio (3.8), más los horarios agrupados por franja para los días con muchos turnos.

```
┌─────────────────────────────────────────┐
│ Elegí día y horario                 [×] │
│                                         │
│ Tipo de consulta                        │
│ [ Consulta general — 30 min        ▾ ]  │
│                                         │
│ Día                    📅 Elegir fecha  │
│ ┌─────────────────────────────────────┐ │
│ │ [<]        HOY            [>]       │ │
│ │        domingo 6 de septiembre      │ │
│ └─────────────────────────────────────┘ │
│ ┌─ 3.8, si "Elegir fecha" está abierto ┐│
│ │        ‹   septiembre de 2026    ›  ││
│ │  do lu ma mi ju vi sa                ││
│ │  ...grilla de 7 columnas...          ││
│ │  ● con turnos          Volver a hoy  ││
│ └───────────────────────────────────────┘│
│                                         │
│ Horarios disponibles          8 turnos  │
│ [Mañana (3)] [Tarde (5)]                │
│ [<] [ 09:00 ][ 09:30 ][ 10:00 ]…   [>] │
│                                         │
│ ✓ Hoy a las 09:30 hs                    │
│ ───────────────────────────────────────  │
│ ← Atrás              [ Confirmar turno ]│
└─────────────────────────────────────────┘
```

#### Tipo de consulta

Select (3.4) que **incluye la duración** en cada opción (`Consulta general — 30 min`), tomada del backend por tipo de consulta — nunca hardcodeada ni asumida constante. Al cambiarlo, **recargar la tira de horarios**: una consulta de 45 min no tiene los mismos slots disponibles que una de 20.

#### Navegador de día

- Contenedor con fondo `--t-field`, radio `--t-r-card`, padding `8px`.
- Flechas: botones `40×52`, fondo `--t-modal`, radio 8px, `aria-label="Día anterior" / "Día siguiente"`.
- Centro: **día en la condensada a 28px, en mayúsculas**, y debajo la fecha completa en 12px `--t-ink-soft`.
  - Día 0 → `HOY`
  - Día 1 → `MAÑANA`
  - Resto → `MARTES 8`
  - Segunda línea siempre: `martes 8 de septiembre`
- La flecha izquierda se atenúa (`opacity: .35`) y se deshabilita en el día de hoy.
- Al costado del label "Día", botón de texto **toggle** (`ti-calendar`): `Elegir fecha` / `Cerrar calendario`, `aria-expanded`. Al abrirlo despliega el panel 3.8 DEBAJO del navegador de día, empujando el contenido — nunca un date picker nativo ni un popover flotante (ver el porqué en 3.8). Es la salida para fechas lejanas; la mayoría resuelve con las flechas.

#### Horarios, agrupados por franja

Un día con 60+ turnos es inusable como una sola tira horizontal (obligaría a apretar la flecha veinte veces). Por eso, antes de la tira:

- **Chips de franja** (`Mañana (12)`, `Tarde (28)`, `Noche (9)`): `32px` de alto, radio `999px`, padding lateral `14px`. Activo: fondo `--t-green`, texto `--t-green-ink`. Inactivo: fondo `--t-field`, texto `--t-ink-soft`.
- Cortes: mañana `< 12:00`, tarde `12:00–17:59`, noche `≥ 18:00`.
- **Una franja sin turnos no muestra su chip.** Si solo hay una franja con turnos ese día, no se muestra ningún chip — la tira sola alcanza.
- La tira muestra solo la franja activa. Al cambiar de día, si la franja activa quedó vacía, se salta a la primera que tenga turnos.

Debajo de los chips (o directo, si no hay más de una franja):

- Fichas tocables, no un select. `96px × 60px`, fondo `--t-field`, radio `--t-r-card`, hora en monoespaciada 20px.
- Seleccionada: fondo `--t-green`, texto `--t-green-ink`.
- Tira horizontal con `overflow-x: auto`, `scroll-behavior: smooth`, `overscroll-behavior-x: contain` (para que el gesto lateral no arrastre el scroll vertical del cuerpo del modal), scrollbar oculta, y flechas laterales `34×60` que desplazan `220px`. Las flechas se atenúan en los extremos.
- A la derecha del label, contador: `8 turnos`. Sigue mostrando el **total del día**, no el de la franja activa — dice de un vistazo si el día está casi lleno.

#### Estado sin turnos

Dentro del área de la tira, centrado: `No hay turnos este día.` + botón de texto `Ir al próximo disponible`, que busca hacia adelante el primer día con slots y salta. Es el punto donde más gente abandona.

#### Resumen

Al elegir horario, bloque con fondo `--t-green-tint`, radio `--t-r-field`, `ti-circle-check` en `--t-green`: `Hoy a las 09:30 hs`. La última acción del flujo no debería ser a ciegas.

---

## 6. Accesibilidad

- Todas las tarjetas y filas seleccionables: `role="button"`, `tabindex="0"`, manejo de `Enter` y `Espacio`.
- Foco visible en todo control: borde `--t-green` o anillo equivalente. Nunca `outline: none` sin reemplazo.
- Cada `input` con su `<label for>`. Los que no tienen label visible (dígitos del código, select de país) llevan `aria-label`.
- La [×] y las flechas llevan `aria-label`; los íconos decorativos, `aria-hidden="true"`.
- Contraste: `--t-ink-mute` sobre `--t-field` es el par más justo del sistema; no usarlo para texto por debajo de 12px.
- Foco atrapado dentro del modal mientras está abierto; `Esc` cierra; al cerrar, el foco vuelve al botón que lo abrió.
- Respetar `prefers-reduced-motion` en el scroll suave de la tira de horarios.

---

## 7. Copy — reglas

- **Voseo argentino y consistente en todo el flujo.** Si una pantalla dice "podés", ninguna otra puede decir "has". Corregir "¿Ya te has atendido con nosotros?" → "¿Ya te atendiste con nosotros?".
- Sentence case. Sin signos de exclamación en copy de sistema.
- Los botones nombran la acción concreta: "Buscar mi ficha", "Confirmar turno", "Sí, soy yo". Nunca "Aceptar" o "Enviar".
- Los subtítulos explican **para qué** se pide algo, no qué es: "Te contactamos a vos por cualquier cambio", no "Los de la persona que reserva el turno".
- Errores: qué pasó y qué hacer, en una frase, sin "Error:" ni disculpas.
- Los hints van solo donde previenen un error real. No poner uno debajo de cada campo por simetría.

---

## 8. Notas para el backend

No son cambios de frontend, pero condicionan el diseño:

1. **La respuesta de búsqueda de ficha no debe incluir datos completos antes de validar el código.** Enviar solo lo mínimo para mostrar la tarjeta.
2. **No revelar si un mail está registrado.** La respuesta a [3e] debería ser siempre la misma ("si ese mail está registrado, te llega un código"), para que el flujo no sirva para averiguar quién es paciente de la clínica.
3. **Rate limit** en búsqueda de fichas y en envío de código, por IP y por mail.
4. **El código de verificación no debe viajar en la respuesta de la API en producción**, aunque no se muestre en pantalla.
5. **Revalidar el slot al confirmar**, no solo al listar. Dos personas pueden elegir el mismo horario al mismo tiempo; si se cayó, volver a [6] con el mensaje `Ese horario se acaba de ocupar. Elegí otro.` y la lista ya actualizada.
6. La duración por tipo de consulta debe venir del backend junto con los slots disponibles para esa duración.
7. **Un endpoint aparte para "qué días de un mes tienen disponibilidad"** (3.8, `GET /disponibilidad-mes?tipoConsultaId=&mes=YYYY-MM` → `{ dias: [...] }`), distinto del de un día concreto — el panel de calendario necesita pintar 30 días de una sola llamada, no una por día.

---

## 9. Orden sugerido de implementación

1. Tokens y componentes compartidos (3.1 a 3.7). Todo lo demás depende de esto.
2. Pantallas de elección [1] y [2] — las más simples, sirven para validar tarjetas y pie.
3. Formularios [3a] [3c] [3d] y el campo de teléfono con selector de país.
4. Código de verificación [4], con su comportamiento de teclado y pegado.
5. Búsqueda de ficha [3b] [3e] y resultados [5a] [5b], incluido el scroll de la lista.
6. Día y horario [6], la más compleja.
7. Pasada final de accesibilidad y revisión de copy en todo el flujo.
