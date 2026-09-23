# Prisma Engine: plan para llevar la personalización de página al siguiente nivel

**Estado:** propuesta v2.2, sin implementar · **Fecha:** 2026-09-21 · **Alcance:** solo la vertical de personalización de la página pública (`/personalizar-pagina` + `ClinicaPublicaTemplate` + `GET/PATCH /panel/pagina`). Nada del panel de gestión, turnero ni ficha clínica.

**Nombre:** en la documentación, el conjunto de catálogo de módulos + temas + efectos + plantillas + editor + renderizado se llama **Prisma Engine**. En el código vive en un solo lugar (ver PE-1).

Leer antes: `docs/Fases post MVP/Fase 4/fase4-personalizar-pagina.md` (las decisiones de producto siguen vigentes salvo donde este documento las reabre) y `tradeoffs.md` TR-150 a TR-155.

**Cambios de la v2 (definidos por Kevin el 21/09):** Equipo como módulo opcional con selección de profesionales y estilos; Horarios muestra solo el horario de la clínica; Guardar = borrador y Publicar = Deployar; se suma una capa de **efectos y animaciones** (PE-4 y PE-5).

**Cambios de la v2.1 (21/09):** la base de los efectos pasa a ser **Motion** con componentes de Magic UI, Motion Primitives y Animate UI (todos MIT); React Bits queda como fuente secundaria y Aceternity afuera. Fondos animados solo tranquilos. Páginas nunca publicadas: "Página en preparación" (decidido).

**Cambios de la v2.2 (21/09, decididos por Kevin):**

- **Horarios = el edificio.** El horario de la página es el de la puerta del consultorio, no una suma ni un promedio de las agendas de los profesionales (PE-6).
- **Equipo: foto, nombre y descripción; la matrícula nunca.** El profesional carga en su perfil foto, nombre, descripción y matrícula, pero la página pública solo puede mostrar los tres primeros. La matrícula no aparece en ningún módulo ni sale del endpoint público (PE-6).
- **El profesional da su aval** para aparecer en la página de cada clínica donde trabaja, y el admin elige entre todos los profesionales: algunos específicos o todos los que dieron su aval (PE-6).
- **Esqueleto contra los flashes:** al guardar se genera un esqueleto de la página personalizada, y es lo primero que se ve al cargar, hasta que el motor de efectos toma el control (PE-4 y PE-8). **Preventivo, sin medir: ver la v2.3 y la pregunta 10.**
- **PE-8 entra al corte de demo y pasa al segundo lugar del orden**, con el comportamiento final definido: borrador, Publicar, historial y control de edición simultánea.
- Correcciones de la revisión contra el código (21/09): el repo tiene `zod` 3.x (no 4) y ya trae `framer-motion`; la `Bio` del profesional ya se edita en `/perfil` (solo falta la foto); y sacar módulos a un paquete del monorepo exige tocar el Dockerfile, la cobertura de CI y Tailwind (PE-1).

**Cambios de la v2.3 (21/09, Kevin):**

- **Convención:** lo marcado **[SUJETO A REVISIÓN]** es una propuesta que Kevin aceptó el 21/09 y que su compañero puede cambiar al revisar la implementación. Se implementa así, pero no está cerrada; si se cambia, se actualiza el documento y la marca.
- **Aval apagado por defecto** y **modo "Todos" automático** (aparecen todos los que tengan el aval en positivo): confirmados **[SUJETO A REVISIÓN]**.
- **Foto de perfil opcional.** Sin foto, el profesional se dibuja con un ícono por defecto, y el editor advierte de cada profesional sin foto que se intenta agregar **[SUJETO A REVISIÓN]**.
- **Sin aviso por mail** cuando falta un aval: el admin ve "Falta su aval" y el profesional lo ve en su `/perfil` **[SUJETO A REVISIÓN]**.
- **El esqueleto pasa a ser preventivo y no está comprometido.** Nadie midió todavía si hay un pantallazo en blanco; se propuso por las dudas. Antes de construirlo se mide, y se evalúan alternativas más baratas (pregunta 10). Hasta entonces las secciones marcadas "preventivo" no bloquean ningún PR.

---

## Punto de partida (relevado del código, no supuesto)

Lo que la Fase 4 dejó es una base sana: un borrador único que alimenta editor y página real (TR-151), validación seria en el backend (TR-152), container queries para la vista previa, contraste medido por test. Lo que le falta para ser un "motor" y no una pantalla:

1. **Sumar un módulo cuesta cinco archivos en dos lenguajes.** El tipo vive en `lib/pagina-publica/modulos.ts` (tipos y defaults), `components/editor-pagina/editor-de-modulo.tsx` (un `switch` con el formulario), `components/public/modulos-publicos.tsx` (otro `switch` con el render), `internal/http/pagina_publica.go` (`tiposModuloValidos` + `validarModulos`, un tercer `switch`) y el CHECK de la base. El catálogo de temas también está duplicado TS/Go a mano (TR-150).
2. **El "tema" es solo color y tipografía.** Todas las secciones usan la misma tarjeta (`CLASE_TARJETA`), la portada tiene un solo layout y el menú es siempre de pastillas.
3. **Cada módulo tiene una sola forma de dibujarse.** No hay variantes.
4. **Siete módulos, ninguno "del rubro".** Tipos de consulta, equipo (`ProfessionalProfile.Bio` ya se edita en `/perfil` y `FotoURL` existe sin pantalla, ninguno de los dos llega a la página pública) y horarios no se muestran.
5. **La página es estática.** No hay ningún movimiento: ni entradas, ni hover, ni fondos vivos.
6. **No hay plantillas ni presets.** Toda página arranca en "Sobre nosotros + Especialidades" con el fondo celeste.
7. **Guardar es publicar.** `GET /clinicas/{slug}` nunca se bloquea por falta de deploy: todo `PATCH` exitoso cambia la página pública al instante. "Deployar" solo escribe `deployada_en` y afecta al buscador. No hay borrador en el servidor ni historial.
8. **La clínica no tiene horario del edificio.** Desde la Fase 3.2.1 (TR-137) toda fila de `horarios_atencion` lleva `UserID`: el horario es siempre de un profesional, y no hay ningún dato que diga cuándo abre el consultorio. Mostrarlo requiere un dato nuevo (ver PE-6).
9. **Sin SEO.** No hay descripción editable, imagen para compartir ni datos estructurados.

---

## Decisiones que ordenan el plan

- **Se mantiene "editor de configuración, no lienzo en blanco"** (decisión congelada de Prisma y de la Fase 4). Todo lo que suma este plan es poder *dentro* de opciones curadas: más módulos, más variantes, más tokens, efectos de un catálogo, nunca píxeles libres, hex libre ni parámetros de animación libres.
- **Un módulo es un paquete autocontenido** (esquema, defaults, formulario, render, variantes, efectos que admite). El backend no conoce módulos por nombre: valida contra un esquema generado.
- **Las plantillas son datos, no código.** Sumar una plantilla no toca componentes.
- **El contenido de ejemplo nunca se publica sin querer.**
- **Guardar y Publicar son dos acciones distintas** (Kevin, 21/09). Guardar persiste el estado de diseño como borrador, invisible para el público. Publicar es lo mismo que Deployar: pone el borrador en la página pública y da de alta la clínica en el buscador. Desaparece el botón "Deployar".
- **Horarios de la página = horario del edificio** (Kevin, 21/09): cuándo está abierta la puerta del consultorio. No se deriva de las agendas de los profesionales ni las restringe; es un dato nuevo de la clínica.
- **Equipo es un módulo opcional** (Kevin, 21/09): no viene en la página por defecto, el admin elige qué profesionales aparecen y con qué estilo.
- **Lo que un profesional carga en su perfil y lo que la página puede mostrar son dos conjuntos distintos** (Kevin, 21/09). Carga foto, nombre, descripción y matrícula; la página muestra como máximo foto, nombre y descripción. La matrícula no tiene slot en ningún módulo y el endpoint público no la devuelve.
- **Aparecer en la página es un aval del profesional, no una decisión del admin** (Kevin, 21/09). Sin aval no se puede seleccionar. Retirarlo lo saca de la página al instante, sin que nadie tenga que volver a publicar.
- **Esqueleto como mejora preventiva** (Kevin, 21/09): la idea es que una página personalizada no muestre un pantallazo en blanco antes de cargar. **Todavía no se sabe si el problema existe**, así que es una propuesta a evaluar y no una regla (pregunta 10).
- **Efectos: movimiento con reglas.** Un efecto nunca oculta contenido si no hay JavaScript, respeta `prefers-reduced-motion`, no rompe el contraste y no rompe el modal del turno (ver PE-4).

---

## Los PRs

Cada PR es mergeable solo, deja el CI verde con el gate de 80% y no cambia el aspecto de ninguna página existente salvo que lo diga. Tamaños: S (1-2 días), M (3-5), L (una semana o más), pensados para part-time. `[D]` entra en el corte de demo, `[V]` puede esperar.

### PE-1 · Núcleo del motor: registro único de módulos y catálogo compartido · L · `[D]`

**Qué:** refactor sin cambio visible. Crea `packages/prisma-engine` (paquete del monorepo, igual que `shared-types`) con:

- `modulos/<tipo>/`: por cada módulo, `schema.ts` (zod: forma de la config, topes, defaults), `editor.tsx`, `render.tsx` y `meta.ts` (nombre, descripción, repetible, tope, ancho, variantes y **slots animables**, estos dos vacíos hasta PE-3/PE-4).
- `registro.ts`: el único lugar que lista los módulos. `editor-de-modulo.tsx` y `modulos-publicos.tsx` pasan a ser un lookup en el registro, sin `switch`.
- `catalogo/temas.json`: fuente única de temas, variantes y tipografías.
- `pnpm engine:generar`: exporta **JSON Schema** de cada módulo y copia esquemas + catálogo a `apps/api/internal/prismaengine/` (el `go:embed` no puede leer fuera del módulo Go). **Hoy el repo está en `zod` 3.24 y solo un archivo del frontend lo importa:** subir a zod 4 (JSON Schema nativo) sale barato, y la alternativa es sumar `zod-to-json-schema`. Se decide en este PR.
- En Go, `validarModulos` y `temaEsValido` validan contra ese JSON embebido (`santhosh-tekuri/jsonschema`). Se borra `tiposModuloValidos` escrito a mano.
- **Versión de esquema:** `paginas_publicas.schema_version` y un `migrar(config, desde, hasta)` por módulo que se aplica al leer. Permite cambiar la forma de una config en los PRs siguientes sin migraciones SQL sobre jsonb.

**Infraestructura del paquete** (`shared-types` es solo tipos; este es el primer paquete con React y clases de Tailwind, y hoy nada de eso está preparado):

- **Dockerfile y `render.yaml`:** el build copia únicamente `packages/shared-types`; hay que sumar el paquete nuevo.
- **`transpilePackages`** en `next.config.ts` y un **`@source`** de Tailwind 4 para que escanee las clases del paquete.
- **Cobertura:** CI corre `test:coverage` solo sobre `@dental-mirage/web`. Sin un job propio (o un `include` explícito), el código movido al paquete deja de contar para el gate de 80%.
- **Saltos de línea:** con `core.autocrlf=true` y sin `.gitattributes`, lo generado en Windows difiere de lo generado en Linux. `engine:generar` escribe con LF y la carpeta lleva su `.gitattributes`.

**CI:** corre `engine:generar` y falla si el resultado difiere de lo commiteado.

**Criterio de aceptación:** un módulo de prueba (se borra antes del merge) se suma tocando solo su carpeta + regenerar. El HTML de `/{slug}` de la clínica de QA es idéntico antes y después (snapshot server-side).

**Por qué primero:** el plan suma unas 25 variantes, 6 módulos y un catálogo de efectos. Sin esto son decenas de puntos de edición en dos lenguajes, cada uno una oportunidad de que editor, plantilla y backend describan páginas distintas.

---

### PE-2 · Tokens de diseño: el tema deja de ser solo color · M · `[D]`

Un tema pasa a ser un conjunto de tokens, todos como custom properties `--pp-*` (el mecanismo ya existe en `aplicar.ts`):

| Token | Opciones curadas | Hoy |
|---|---|---|
| Paleta | fondo, superficie, acento, acento suave, texto, borde (derivados con `color-mix`) | fondo + 3 de acento |
| Forma | recta · suave · redonda | fijo `rounded-card` |
| Densidad | compacta · cómoda · amplia | fijo |
| Superficie | plana · con borde · elevada · sin tarjeta | fijo marfil con borde |
| Fondo de página | liso · degradé suave · textura sutil (SVG propios, inline) | liso |
| Botones | pastilla · redondeado · recto; relleno o contorno | pastilla |
| Menú | pastillas · subrayado · barra fija arriba | pastillas |

- Cada tema trae sus valores por defecto; el admin afina eligiendo entre opciones.
- `CLASE_TARJETA` y los estilos fijos de `modulos-publicos.tsx` pasan a leer tokens.
- Temas nuevos (por ejemplo uno oscuro y uno editorial), cantidad a decidir al diseñar.
- `temas.test.ts` mide AA para cada combinación paleta × superficie.
- Pestaña "Diseño" reorganizada en grupos (Colores, Tipografía, Forma y espacio, Fondo).
- **Sin tema elegido no cambia nada** (TR-151).

---

### PE-3 · Variantes por módulo y opciones de sección · M · `[D]`

Cada módulo declara 2 a 4 variantes de layout:

- **Portada:** centrada (hoy) · dividida (foto a un lado, nombre y turno al otro) · foto de fondo completa con velo · mínima sin foto.
- **Sobre nosotros / Texto libre:** centrado · texto + foto al costado · dos columnas.
- **Especialidades:** chips (hoy) · tarjetas con ícono · lista.
- **Galería:** grilla (hoy) · mosaico · carrusel.
- **Estadísticas:** tarjetas (hoy) · franja grande de números.
- **Contacto:** tarjeta (hoy) · dividido mapa + datos.

Opciones comunes de sección: **fondo de sección** (normal · acento suave · contraste), **título público propio** (`tituloPublico`, separado de la etiqueta del editor; cierra lo pendiente de TR-155) y **alineación**.

Editor: selector de variante con miniaturas SVG esquemáticas.

---

### PE-4 · Motor de efectos: infraestructura y efectos livianos · L · `[D]`

La capa nueva de movimiento. El motor de animación es **Motion** (motion.dev, MIT). **El repo ya trae `framer-motion` ^13** (lo usan `scroll-reveal.tsx` y `expandable-card.tsx`): se reutiliza esa dependencia o se migran esos imports, pero no se instala una segunda copia. Los componentes se toman de bibliotecas "copiar y pegar" (ver **Fuentes de efectos** abajo): se copian al repo, no se instalan como paquete, se adaptan a los tokens del tema y se registran en un catálogo de efectos.

**El modelo:**

- **Efecto** = una entrada del catálogo `packages/prisma-engine/efectos/<id>/` con: a qué **objetivos** aplica, qué **disparador** usa, 2 o 3 **intensidades** curadas (sutil · media · marcada) y su implementación. El admin nunca toca duraciones, curvas ni números: elige efecto + intensidad.
- **Objetivos:** botón · imagen · texto (títulos y párrafos) · casilla de texto / tarjeta · número · sección entera · fondo de sección · fondo de página.
- **Disparadores:** al entrar en pantalla · al pasar el mouse (con equivalente al tocar en móvil) · al hacer clic · continuo.
- **Slots animables:** cada módulo declara en su `meta.ts` qué partes admiten efectos (por ejemplo Portada: título, botón de turno, foto, fondo). La config del módulo guarda `efectos: { [slot]: { id, intensidad } }`, validado por el esquema de PE-1. Así un efecto de imagen no se puede poner sobre un botón.
- **Nivel de página:** un "estilo de movimiento" global (quieto · sereno · dinámico) que pone defaults para todos los slots; el admin puede pisarlos por sección. Es lo que hace que la mayoría no tenga que tocar nada.

**Efectos de este PR (livianos: CSS o Motion, sin WebGL).** Selección inicial a confirmar mirando los catálogos al implementar (los nombres son de referencia, existen equivalentes en varias bibliotecas):

- Entradas de sección y de texto: aparición con desenfoque, deslizamiento, revelado al hacer scroll.
- Texto: brillo que recorre (tipo *Shiny Text*), degradé animado, conteo animado para Estadísticas (tipo *Count Up*).
- Botones: borde con estrella que gira (tipo *Star Border*), atracción magnética, chispas al clic (tipo *Click Spark*).
- Imágenes y tarjetas: inclinación 3D al pasar el mouse (tipo *Tilted Card*), reflejo (tipo *Glare Hover*), foco que sigue al cursor (tipo *Spotlight Card*).

**Reglas no negociables** (van con test donde se pueda):

1. **Sin JavaScript el contenido se ve.** *(Preventivo, en evaluación: el mecanismo del esqueleto que sigue no está comprometido; ver pregunta 10.)* El HTML del servidor siempre trae el contenido real, visible. Si se implementa el esqueleto, un script en línea mínimo, con el nonce de la CSP, marca `<html class="pp-js">` antes del primer pintado y recién ahí el contenido queda oculto detrás del esqueleto hasta que el motor hidrata. Sin JS la clase nunca se agrega. **Salvavidas en CSS puro:** una animación con retardo (unos 3 s) libera el contenido aunque el JS falle, así que un error de hidratación nunca deja una página en blanco. Sin el esqueleto la regla se reduce a la primera frase: ningún efecto puede dejar contenido oculto desde el servidor.
2. **`prefers-reduced-motion`**: todos los efectos se apagan o quedan en una versión estática. Test por efecto.
3. **El modal del turno no se rompe.** Un ancestro con `transform`, `filter`, `perspective` o `will-change: transform` se convierte en el bloque contenedor de sus hijos `position: fixed`, igual que el `container-type` de TR-151: el wizard quedaría recortado. Los efectos se aplican solo a slots **hoja** (el botón, la imagen), nunca a un contenedor que envuelva la sección de turno. El registro lo impide: la sección "turno" no expone el slot "sección entera".
4. **Solo se carga lo que se usa.** Cada efecto es un `import()` dinámico; una página con dos efectos no descarga el catálogo entero. Presupuesto de JS por página medido en CI.
5. **Colores de los tokens.** Un efecto con color (chispas, brillo, borde) lo toma del tema, nunca de un valor propio.

**Editor:** selector de efecto por slot con vista previa en vivo y un botón "Reproducir" que vuelve a disparar las entradas en la vista previa.

**Fuentes de efectos (revisado el 21/09, no es asesoramiento legal):**

| Biblioteca | Licencia | Depende de | Uso en Prisma |
|---|---|---|---|
| **Motion** (motion.dev) | MIT | nada | Motor de animación base de todo el catálogo |
| **Magic UI** (magicui.design) | MIT | Motion, Tailwind | Fuente principal: textos animados, botones, fondos de patrón suaves |
| **Motion Primitives** | MIT | Motion, Tailwind | Fuente principal: entradas, revelados, inclinación, carruseles |
| **Animate UI** | MIT | Motion, Tailwind | Fuente principal: microinteracciones de botones y casillas |
| **React Bits** | MIT + Commons Clause | GSAP, Motion, ogl, three | Secundaria: solo componentes que no usen GSAP, y sin redistribuirlos |
| **Aceternity UI** | Licencia propia | Motion | **Afuera:** prohíbe crear "themes, templates, or derivative products" para vender y redistribuir las fuentes, que es justo lo que hace un generador de páginas |

- Las tres principales son MIT, sin cláusulas extra, construidas sobre Motion y Tailwind como nuestro stack. Un solo motor de animación para todo el catálogo mantiene el peso bajo y el comportamiento parejo.
- **React Bits** es MIT + Commons Clause: se pueden usar sus componentes para dibujar las páginas, pero no venderlos, sublicenciarlos ni redistribuirlos. Consecuencia: nada de "exportar el código de tu página" ni publicar el catálogo como paquete.
- **GSAP queda afuera** en cualquier fuente: su licencia gratuita (de Webflow) prohíbe usarlo en herramientas que permiten construir animaciones visuales sin código que compitan con Webflow, y un editor con selector de animaciones cae cerca de esa definición.
- Cada archivo copiado lleva en la cabecera su fuente y su licencia. Antes de sumar una dependencia nueva se revisa su licencia.

---

### PE-5 · Fondos tranquilos y texto avanzado · M · `[D]` parcial

**Criterio (Kevin, 21/09):** son páginas de clínicas, así que el movimiento acompaña y no llama la atención. Un visitante que llega preocupado por un dolor no tiene que encontrarse con una página que parpadea.

**Fondos que entran al catálogo** (todos lentos, de poco contraste y con los colores del tema):

- Degradé que "respira" (cambia de tono muy despacio).
- Malla de degradé suave (manchas de color que se desplazan lento).
- Aurora desaturada y lenta.
- Patrón de puntos o grilla con pulso sutil.
- Partículas escasas y lentas, tipo polvo en suspensión.
- Ondas suaves en la parte baja de una sección.

**Fuera del catálogo a propósito:** hiperespacio, rayos, destellos, glitch, plasma, distorsiones, luces estroboscópicas, fondos que reaccionan fuerte al cursor, y cualquier efecto 3D intenso.

**Reglas propias:**

- **Techo de movimiento en el catálogo, no en el editor:** cada fondo tiene una velocidad y un contraste máximos definidos por Mirage. La intensidad "marcada" de un fondo sigue siendo tranquila.
- **Sin destellos:** nada que cambie de brillo más de tres veces por segundo (WCAG 2.3.1). Test sobre cada fondo.
- **Preferir CSS, SVG o canvas 2D.** Casi todos estos fondos se hacen sin WebGL, que pesa más y gasta batería. Si alguno necesita WebGL, rige **un solo fondo WebGL por página** (misma regla que el sistema visual de Mirage-Web).
- Se pausa fuera de pantalla (`IntersectionObserver`) y cuando la pestaña no está visible.
- **Versión quieta** con `prefers-reduced-motion` y en celulares de gama baja: el mismo degradé, sin movimiento. Criterio de detección a definir al implementar.
- **Contraste sobre fondo vivo:** una sección con fondo animado exige superficie con tarjeta o velo; el test de contraste mide contra el color más claro y el más oscuro que el fondo puede producir.

**Texto avanzado** (también con criterio tranquilo): aparición por palabras, texto que rota entre dos o tres frases ("Odontología general · Ortodoncia · Implantes"), resaltado que se dibuja debajo de una palabra. Fuera: texto que se "descifra", glitch, letras que explotan.

---

### PE-6 · Biblioteca de módulos v2: los módulos del rubro · L · `[D]` parcial

Módulos nuevos, todos nacidos con variantes y slots animables.

**Equipo** `[D]` (opcional, no viene en la página por defecto):

**Qué carga el profesional y qué muestra la página:**

| Dato | Lo carga en su perfil | Puede aparecer en la página |
|---|---|---|
| Foto | el campo existe; la carga queda fuera de PE-6 | sí, si ya tiene foto |
| Nombre | sí (ya existe) | sí |
| Descripción | sí (hoy es la "Bio corta" de `/perfil`) | sí |
| Matrícula | sí (ya existe) | **no**, ni en el editor ni en el endpoint público |

- **La carga de foto de perfil queda fuera de PE-6.** El campo `FotoURL` ya existe; el módulo usa la URL si hay una y muestra un ícono por defecto si no la hay. La pantalla de perfil no agrega subida de fotos en este par.
- **Aval de cada profesional.** En `/perfil`, una sección "Aparecer en la página pública" lista las clínicas donde trabaja, con un interruptor por clínica. Se guarda en `clinic_members` (`aval_pagina_publica`, por defecto **apagado**, más `aval_pagina_en`), porque un profesional puede aceptar aparecer en una clínica y no en otra. Es un consentimiento activo: nadie aparece hasta que lo prende. **[SUJETO A REVISIÓN]** (apagado por defecto, confirmado por Kevin el 21/09).
- **El admin elige entre todos los profesionales.** El módulo se agrega desde el catálogo y tiene dos modos:
  - **Todos:** aparecen automáticamente **todos los profesionales activos cuyo aval está en positivo**, ordenados por nombre. Es una consulta viva, no una lista guardada: quien se suma y da su aval aparece solo, y quien lo retira desaparece solo. **[SUJETO A REVISIÓN]**
  - **Selección:** el admin marca cuáles y en qué orden. La lista muestra a **todos** los profesionales activos de la clínica; los que no dieron su aval salen deshabilitados con "Falta su aval". Sin ese aval no se pueden seleccionar.
  - **Advertencia por falta de foto (ambos modos, no bloqueante).** En Selección, al marcar a un profesional sin foto el editor avisa en el momento ("Dr./Dra. X no tiene foto: se mostrará un ícono por defecto"). En modo Todos, o al Guardar y Publicar, el aviso lista **a todos** los profesionales que van a aparecer sin foto. Es una advertencia: no impide agregarlos ni publicar. Quien tiene aval pero no foto queda igual en la página, con el ícono. **[SUJETO A REVISIÓN]**
- Repetible con tope bajo (por ejemplo 3), para poder separar "Odontología" y "Ortodoncia": cada instancia tiene su propio modo y selección.
- **Estilos:** solo foto · foto con descripción · carrusel con nombre · carrusel sin nombre (nombre al pasar el mouse o tocar) · avatares circulares en fila · tarjeta que se da vuelta (foto adelante, descripción atrás). Interruptores por módulo: mostrar nombre y mostrar descripción. **Especialidades y "Pedir turno con…" quedan fuera del primer corte:** son datos que el brief no incluyó, y el segundo depende de que el wizard admita preseleccionar profesional.
- **Backend:** en modo Selección la config guarda IDs de usuario; el `PATCH` valida que sean miembros activos **y con aval**. El endpoint público **no devuelve IDs**: resuelve a nombre, foto y descripción, y **no incluye la matrícula ni ningún dato fuera de esos tres**. Aplica dos filtros al leer: miembro activo y aval vigente.
- **El aval se evalúa al leer, no al publicar.** La versión publicada (PE-8) guarda IDs, no datos, así que si un profesional retira su aval deja de aparecer en el instante, sin depender de que el admin vuelva a publicar. El editor avisa "X retiró su aval" sobre el borrador, y en modo Todos con cero avales el módulo no se dibuja en la página pública.
- **Si alguien deja la clínica** desaparece del módulo sin romper la página.

**Horarios** `[D]` (el horario del edificio, no el de los profesionales):

- **Qué representa:** cuándo está abierta la puerta del consultorio. **No es la suma ni la unión de las agendas** de los profesionales, y no las limita: un profesional puede tener agenda fuera de ese horario y el sistema no lo impide ni lo avisa. Son dos datos distintos a propósito.
- **Dato nuevo:** `horarios_clinica` (clinic_id, día de semana, hasta dos franjas por día, cerrado) + una nota corta opcional ("Feriados cerrado"). Es de la clínica y no de la página, porque lo reusa el SEO (PE-9).
- **No toca la agenda:** los turnos siguen saliendo de los horarios de cada profesional (`horarios_atencion`, con `UserID`).
- Se edita desde el propio módulo (escribe en un endpoint de la clínica, solo `admin`). **El texto del editor lo dice:** "Este es el horario del consultorio. Los turnos se ofrecen según la agenda de cada profesional."
- **Estilos:** tabla semanal · lista compacta · tarjeta junto a Contacto · indicador "Abierto ahora / Cerrado".
- **"Abierto ahora"** habla del edificio, no de si hay turnos libres. Se calcula con la zona fija de `internal/clock` (Córdoba) en el servidor, y en el cliente con `useAhora` (`lib/reloj.ts`), no con `Date.now()` en un `useState`: con `Date.now()` el HTML del servidor y el del cliente difieren y la hidratación falla, el mismo problema que ya resolvió la 3.2.7e.

**Servicios / tratamientos** `[D]`: sale de los `TipoConsulta` activos (nombre, duración). El admin elige cuáles y en qué orden. Cada tarjeta puede abrir el wizard con ese tipo preseleccionado.

**De contenido, cargado por el admin:**

- **Preguntas frecuentes:** acordeón con tope.
- **Obras sociales y prepagas:** lista elegida de un catálogo curado + "Consultá por otras". Es texto de la página, no un modelo de cobertura.
- **Llamado a la acción:** banda con texto corto y un botón (turno, WhatsApp o teléfono).
- **Video:** embed de YouTube o Vimeo, sumando esos orígenes a `frame-src` con origen + path exacto y test, como TR-154.

**Fuera a propósito:** testimonios y reseñas (no hay mecanismo que las respalde), blog, formularios libres.

Puede partirse en dos PRs (Equipo + Horarios + Servicios / el resto) si queda grande.

---

### PE-7 · Plantillas por especialidad y presets · M · `[D]`

- **Plantilla:** configuración completa en `packages/prisma-engine/plantillas/*.json` (tema + tokens + módulos con variantes + efectos + textos de ejemplo). Inicial: odontología, kinesiología y nutrición × 2 estilos. Validadas en CI contra los esquemas de PE-1.
- **Preset de estilo:** tema + tokens + estilo de movimiento con nombre ("Clínico sereno", "Cálido dinámico"), aplicable sin tocar los módulos.
- **Preset de sección:** una sección prearmada que se agrega desde el catálogo.
- **Galería de plantillas** en el editor: aparece la primera vez y después desde un botón, con vista previa real antes de aplicar.
- **Aplicar:** *solo el diseño* (conserva textos y fotos) o *reemplazar todo* (con confirmación; con PE-8 queda como borrador, así que nunca pisa lo publicado).
- **Textos de ejemplo marcados:** el editor los muestra atenuados y Publicar avisa cuáles quedan sin cambiar.
- **Sin fotos de stock de personas** en las plantillas: ilustraciones y fondos propios.

---

### PE-8 · Borrador, Publicar = Deployar e historial · L · `[D]`

Kevin pidió que este PR muestre el comportamiento que quede mejor, así que pasa al corte de demo y al **segundo lugar del orden** (ver más abajo): todo lo que se construya después (temas, variantes, efectos, módulos) queda como borrador hasta que alguien publique, y nunca cambia una página en vivo por accidente.

**El comportamiento final:**

- **Guardar** persiste el diseño completo como borrador del servidor (la tabla viva de hoy pasa a ser el borrador). El público no lo ve. Además hay una copia local automática en el navegador para no perder cambios si se cierra la pestaña.
- **Publicar** (reemplaza a "Deployar"): copia el borrador a una versión nueva en `pagina_publica_versiones` (número, contenido jsonb, publicada_en, autor; más el esqueleto solo si se decide construirlo), la página pública pasa a servir esa versión y, la primera vez, se da de alta en el buscador (`deployada_en`). Antes de confirmar, Publicar muestra un resumen: qué cambió respecto de lo publicado y qué textos de ejemplo siguen sin tocar (PE-7).
- **"Hay cambios sin publicar"** visible en el editor, comparando borrador contra la última versión publicada.
- **Ver página** desde el editor muestra el borrador. **Link de vista previa firmado** (mismo mecanismo que el calendario compartido de la Fase 2, con vencimiento) para mostrárselo a alguien antes de publicar.
- **Historial:** versiones publicadas con fecha y autor. "Restaurar" copia una versión al borrador y nunca publica directo.
- **Deshacer / rehacer** en el editor (pila de estados en memoria).
- **Ocultar** sigue como está (modo mantenimiento).
- **Edición simultánea:** el rol `admin` es delegable, así que dos personas pueden abrir el editor a la vez. El borrador lleva un número de revisión y el `PATCH` lo exige: si otra persona guardó antes, responde **409** con quién y cuándo, y el editor ofrece recargar o quedarse con la copia local. Sin esto, el último en guardar pisa al otro en silencio.
- **Migración:** las páginas con `deployada_en` generan su versión 1 publicada con el contenido actual (nada cambia para sus visitantes). Las que nunca se deployaron quedan sin versión publicada y muestran "Página en preparación" hasta el primer Publicar (decidido por Kevin, 21/09).
- **Las versiones guardan IDs, no datos derivados** (por ejemplo los profesionales de Equipo): así el aval de PE-6 se evalúa siempre al leer.

**El esqueleto — preventivo, sin comprometer** (propuesto por Kevin el 21/09 "por las dudas", no medido): cada página personalizada tendría un esqueleto que es lo primero que se ve al cargar o recargar. **No se construye hasta medir y evaluar las alternativas de la pregunta 10**; lo que sigue es el diseño por si se decide hacerlo.

- **Qué es:** un descriptor, no HTML: una lista de bloques `{ tipo, variante, alto: s | m | l }` más los tokens de fondo y superficie del tema. Cada módulo lo declara en su `meta.ts` (PE-1), y `esqueletoDe(config)` lo arma.
- **Cuándo se genera:** al **Guardar**, en la Server Action del editor (donde vive el registro de módulos), y se guarda junto al borrador. **Publicar** lo copia a la versión. La página pública solo usa el esqueleto de la versión publicada.
- **Validación:** el backend Go lo valida con el mismo JSON Schema de PE-1 (tipos y alturas de un conjunto cerrado, cantidad acotada) y **nunca lo renderiza como HTML**: lo dibuja un componente propio. Un cliente no puede colar marcado a través de este campo.
- **Cómo se ve:** bloques planos con el color de superficie del tema, alturas reservadas para no desplazar el layout al cargar, y como mucho un "respirar" lento de opacidad (2 s o más). **Sin barrido de brillo**: coherente con el criterio de PE-5 y con WCAG 2.3.1. Con `prefers-reduced-motion` queda quieto.
- **Cómo se entrega:** es el primer bloque del stream (`loading.tsx` o el `fallback` de un `Suspense`) y se mantiene sobre el contenido, oculto, hasta que el motor hidrata. El mecanismo exacto, con su salvavidas en CSS, está en la regla 1 de PE-4.
- **Es aproximado a propósito:** si el contenido real cambia de alto respecto del esqueleto hay un pequeño salto al liberar. Se regenera en cada Guardar, así que solo se desactualiza entre un cambio de contenido y el siguiente guardado.
- **Tests:** sin JS el contenido se ve completo; el salvavidas libera la página; el esqueleto de cada módulo tiene su snapshot; ninguna página publicada queda con un esqueleto que no coincida con el esquema.

Depende solo de PE-1 (registro y esquemas). El esqueleto es opcional y no bloquea a PE-4: si no se construye, los efectos siguen la primera frase de su regla 1.

---

### PE-9 · SEO, compartir y rendimiento · M · `[V]`

> **Implementado (2026-09-23, `feature/pe-9-seo-rendimiento`, TR-165).** Todo lo de la lista, con dos precisiones: la imagen para compartir no lleva la foto de portada (next/og no lee WebP), y el presupuesto de Lighthouse se mide sobre páginas de demostración armadas con plantillas (`PRISMA_DEMO_PLANTILLAS=1`), no sobre una clínica real. Al medir apareció que la página pública precargaba las fuentes de todos los temas; se corrigió en este mismo PR. La Fase 4.6 (R2) quedó afuera: depende de una cuenta externa.

- Pestaña "Buscadores y redes": título y descripción (defaults de nombre, especialidades y ciudad).
- **Imagen para compartir** con `next/og`, en los colores y tipografía del tema. Es lo que aparece al pasar el link por WhatsApp.
- **JSON-LD** schema.org (`Dentist` / `MedicalClinic` / `Physiotherapy`) con dirección, teléfono y `openingHours` desde `horarios_clinica`.
- `sitemap.xml` con las páginas publicadas.
- **Imágenes:** 2 o 3 tamaños + webp al subir, `srcset` en la plantilla.
- **Presupuesto de rendimiento** en CI (Lighthouse sobre una página de plantilla con efectos): con PE-4/PE-5 es fácil hacer una página linda y lenta.

---

## Orden, paralelismo y corte de demo

```
PE-1 ─► PE-8 ─► PE-2 ─► PE-3 ─► PE-4 ─► PE-5
                                  │
                                  └─► PE-6 ─► PE-7 ─► PE-9
```

- **PE-8 va segundo** (los números son identificadores, no el orden): cambia la semántica de "guardar" en producción y es la base sobre la que se cachearía el HTML publicado (pregunta 10). Los PRs siguientes ya nacen sobre el modelo de borrador y publicación.
- Los efectos (PE-4) van antes de los módulos nuevos (PE-6) para que Equipo, Horarios y Servicios nazcan con sus slots animables, y antes de las plantillas (PE-7) porque una plantilla incluye su estilo de movimiento.
- **Corte de demo `[D]`:** PE-1 a PE-8 (PE-5 al menos un fondo; PE-6 al menos Equipo, Horarios y Servicios).
- **`[V]`:** solo PE-9.
- **Dependencia externa:** Fase 4.6 (storage R2). Sin ella no se suben fotos en producción, pero Equipo **no depende de ella**: sin foto se dibuja el ícono por defecto.

---

## Preguntas abiertas (con propuesta)

1. ~~Consentimiento en Equipo~~ **Decidido (21/09):** el profesional da su aval por clínica, apagado por defecto, y sin aval no se puede seleccionar (PE-6). **[SUJETO A REVISIÓN]**
2. ~~Páginas nunca deployadas (PE-8)~~ **Decidido (21/09):** muestran "Página en preparación" hasta el primer Publicar.
3. ~~Guardado automático~~ **Decidido en la v2.2:** copia local en el navegador, sin tocar el servidor (PE-8).
4. **Catálogo de efectos v1:** propuesta de 12 a 15 efectos entre PE-4 y PE-5 (5 o 6 de ellos fondos), elegidos de Magic UI, Motion Primitives y Animate UI al implementar, con React Bits solo donde no haya equivalente y no use GSAP.
5. **Cantidad de temas y plantillas v1:** propuesta 6 o 7 temas y 6 plantillas, diseñadas por Mirage con mockups HTML en `docs/` antes de pasarlas a JSON.
6. **Validación en Go vía JSON Schema (PE-1):** propuesta JSON Schema embebido en vez de generar código Go.
7. ~~Aval y avisos~~ **Decidido (21/09):** sin notificación por mail en la primera versión; el admin ve "Falta su aval" y el profesional ve su sección en `/perfil`. Un aviso por mail es un agregado posterior. **[SUJETO A REVISIÓN]**
8. ~~Modo "Todos" en Equipo~~ **Decidido (21/09):** muestra automáticamente a todos los que tengan el aval en positivo; si el admin quiere revisar cada alta, usa el modo Selección. **[SUJETO A REVISIÓN]**
9. **Foto de perfil (PE-6):** la carga sigue fuera de alcance; Equipo muestra las fotos existentes y usa un ícono por defecto cuando no hay foto.
10. **Pantallazo en blanco al cargar (esqueleto): ¿es un problema real?** Kevin lo propuso como mejora preventiva; **no está medido**. Propuesta: medir primero y elegir la solución más barata que cubra lo que se mida.
    - **Qué habría que medir:** tiempo hasta el primer byte de `/{slug}` con el servicio despierto y después de un rato sin tráfico, y qué se ve en cada caso (DevTools, pestaña Rendimiento, con la red limitada). Los tres servicios de Render están en plan `free`, que se duerme sin tráfico, y hoy la página se renderiza completa en cada visita (`cache: "no-store"`) con dos saltos: web a API y API a base.
    - **Hay tres momentos distintos en los que se puede ver blanco**, y el esqueleto guardado solo actúa sobre uno: (A) *antes del primer byte*, si el servicio está dormido o la API tarda: el navegador no tiene nada que pintar, y ningún esqueleto generado por ese mismo servidor puede aparecer; (B) *entre el primer byte y la hidratación*: hoy no hay blanco, porque el HTML del servidor ya trae el contenido, y solo lo introduciría un esqueleto que oculte el contenido real; (C) *fuentes*: usan `next/font` autoalojado, con texto visible mientras cargan, así que no es causa.
    - **Alternativas, de menor a mayor costo:**
      1. **Entradas de efectos en CSS puro.** El estado inicial del efecto vive en el CSS y no en JS, y la Portada nunca anima al cargar. Elimina (B) sin esqueleto y sin depender de la hidratación. Costo: nulo, es una regla de PE-4.
      2. **`loading.tsx` genérico + fondo del tema en el primer HTML.** Hoy no hay ningún `loading.tsx`. Cubre el caso "web despierta, API lenta" y da respuesta inmediata al navegar desde el buscador. No puede ser específico de cada página, porque para conocerla haría falta la misma llamada lenta. Costo: S.
      3. **Caché del HTML publicado** (revalidación con etiqueta al Publicar, al cambiar un aval y al ocultar). La versión publicada de PE-8 es inmutable, así que se cachea sin problema; cubre (A) cuando solo la API es lenta, y las visitas repetidas. Costo: M, por la matriz de invalidación (el aval retirado debe reflejarse ya, con un tiempo de vida corto como respaldo).
      4. **Que el servicio no se duerma** (plan pago del servicio web, o un CDN con caché por delante). Es lo único que arregla (A) de verdad. No es código, es una decisión de infraestructura y de costo, del mismo tipo que la del Postgres que se borra a los 30 días.
      5. **Esqueleto guardado al guardar** (lo propuesto). Solo suma si puede leerse sin pasar por la llamada lenta; con la página cacheada no hace falta, y sin caché el esqueleto tampoco está disponible. Su único nicho real es una visita recurrente desde el mismo navegador. Costo: M, más el mecanismo de ocultar y liberar del punto 1 de PE-4.
    - **Propuesta:** no construir el esqueleto todavía. Medir; si el blanco aparece, aplicar 1 y 2 (baratas) dentro de PE-4 y PE-8, y decidir 3 y 4 según lo que se mida. El esqueleto queda como último recurso. **[SUJETO A REVISIÓN]**

---

## Fuentes consultadas para licencias (21/09/2026)

- React Bits, licencia MIT + Commons Clause: https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md
- GSAP Standard License ("Prohibited Uses"): https://gsap.com/community/standard-license/
- Dependencias de React Bits (gsap, motion, ogl, three): https://github.com/DavidHDev/react-bits/blob/main/package.json
- Magic UI, licencia MIT: https://github.com/magicuidesign/magicui/blob/main/LICENSE.md
- Motion Primitives, MIT: https://github.com/ibelick/motion-primitives
- Animate UI, MIT: https://github.com/imskyleen/animate-ui
- Aceternity UI, licencia: https://ui.aceternity.com/licence
