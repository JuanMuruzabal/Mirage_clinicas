# Fase 4 — Personalización real de la página pública

**Estado:** definición, sin implementar · **Origen:** pedido directo del cliente en conversación con el agente, 2026-09-17 — no hay brief `.docx` como en las Fases 2 y 3. Primer entregable de un revamp de frontend más amplio; el resto del revamp (UI del panel de gestión) queda para después de esto.

Este documento cierra el **qué** (alcance, modelo de contenido, modelo de datos) para poder estimar y planificar por subfases, igual criterio que `fase3.2-multi-tenant.md`. No es implementación todavía — es lo que hay que aprobar antes de tocar código.

---

## Punto de partida: qué existe hoy (relevado, no supuesto)

- **El editor (`/personalizar-pagina`, `pagina-editor.tsx`) es un shell deshabilitado.** "Guardar cambios" tiene `disabled` con el tooltip "vas a poder editar el contenido de tu página en una próxima actualización". El panel derecho son campos `readOnly` que reflejan el perfil — cero edición real.
- **El modelo `PaginaPublica` solo tiene `oculta` y `deployadaEn`.** No hay una sola columna de contenido editable en la base hoy.
- **La plantilla pública (`ClinicaPublicaTemplate`) es fija:** turno + "Sobre nosotros" (placeholder literal, sin contenido) + especialidades. Mismo componente para la previsualización del editor y la página real — ese acoplamiento conviene mantenerlo.
- **Bug heredado que esta fase debería arrastrar consigo:** la página pública y el buscador (`clinicas.go`, `getClinicaPublicaHandler`/`buscarClinicasHandler`) resuelven el profesional a mostrar con `ownerProfile()` — **solo el owner**. Desde la Fase 3.2 una clínica puede tener N profesionales, y ninguno de los dos endpoints se actualizó. Hoy una clínica con 3 odontólogos muestra la página pública como si hubiera uno. Con "bio general de la clínica" (ver más abajo) el texto deja de depender de esto, pero **especialidades** debería ser la unión de todos los profesionales activos, no solo las del owner — si no, el bug queda igual de vivo, solo que mejor disimulado.
- **`ProfessionalProfile` ya tiene `Bio *string` y `FotoURL *string`** (`models_auth.go:148-149`) — existen en el esquema desde el módulo de auth pero **no están wireados a ningún handler ni pantalla**. Son del profesional individual, no de la clínica — no sirven directo para la "bio general" que se pidió, pero confirman que el patrón (bio + foto) ya se pensó una vez.
- **Storage de fotos: interfaz lista, dev funciona, prod no existe.** `internal/storage` tiene la interfaz (`Storage.Save`) y `LocalStorage` (disco, dev) — pero **no hay implementación R2/S3**, y `render.yaml` solo reserva las env vars (TR-046, `sync: false`, nunca cargadas). Tampoco hay un endpoint HTTP que reciba un upload todavía — hay que construirlo de cero.
- **La paleta de colores es un sistema cerrado ("Sistema Cascarón", TR-010/TR-013), no un color picker libre en ningún lugar del producto hoy.** Los tokens (`salvia`, `terracota`, `grafito`, etc.) están pensados como pares fondo-claro/texto-oscuro con contraste AA verificado a mano — un color arbitrario elegido por el profesional puede romper contraste o chocar con el resto de la identidad Mirage.
- **`Clinic` ya tiene `Direccion`, `Ciudad`, `Provincia`, `Telefono`** — la dirección para el mapa no hay que inventarla, hay que decidir si se reutiliza tal cual o se permite un override en la página pública.

---

## Decisiones de alcance (cerradas en esta conversación)

1. **Editor visual con grilla de posiciones predefinidas** — ni un formulario puro (muy limitado) ni un canvas libre tipo drag & drop sin restricciones (lo que el spec original descartó a propósito, TR original de "editor visual drag & drop" fuera de alcance). Un término medio: el profesional arrastra y reordena **módulos** dentro de **slots de grilla fijos**, no posiciones libres en píxeles. Esto acota qué se puede romper y hace que la previsualización por dispositivo (mobile/tablet/desktop) sea predecible — cada breakpoint reordena los mismos módulos con una regla fija, no un layout arbitrario por pantalla.
2. **Bio de la clínica, no por profesional.** "Sobre nosotros" es un texto institucional único, cargado por quien tiene el rol `admin` de la clínica. No se lista un profesional por tarjeta.
3. **Contenido editable en esta primera vuelta:** texto (bio), fotos (perfil/portada), personalización visual (color de acento + orden de secciones), datos de contacto adicionales (redes sociales, dirección con mapa, horarios visibles), y módulos adicionales de identidad combinando colores/componentes/imágenes.
4. **Entregable de esta ronda: solo esta definición.** Implementación en una conversación aparte, ya con esto aprobado.
5. **Individualización visual: temas prediseñados, con ajuste fino permitido dentro de cada uno.** No es un color de acento suelto ni marca 100% libre — Mirage arma varios "temas" completos (paleta + tipografía + texturas/fondos, cada uno coherente y verificado en contraste), el owner elige uno como base y **puede después afinar detalles específicos dentro de ese tema**: una variante de color dentro del rango que el tema permite, o una tipografía distinta entre las que ese tema provee. Nunca un hex libre ni una fuente subida por el owner — el "touch propio" vive dentro de opciones ya curadas, no fuera de ellas.
6. **Estadísticas: solo datos que el sistema puede probar, nada de rating/reseñas todavía.** Mirage no tiene un sistema de reseñas de pacientes — mostrar una calificación o un número de reseñas sin ningún mecanismo real detrás sería inventar contenido, lo mismo que el proyecto evita en el resto del producto (ver el placeholder honesto de "Sobre nosotros" antes de esta fase). Un módulo de "estadísticas" v1 solo puede mostrar valores derivados de datos reales de la base (ej. pacientes atendidos, turnos realizados). Un sistema real de reseñas queda **fuera de esta vertical**, como iniciativa aparte a futuro.

---

## El modelo: temas + módulos sobre una grilla fija

Dos capas separadas, cada una con su propio límite de libertad:

- **El tema** decide la identidad visual completa de la página: paleta, tipografía, texturas/fondos. Es lo que separa a una clínica de la landing de Mirage y de las demás clínicas.
- **Los módulos** deciden el contenido: qué secciones existen, en qué orden, con qué texto/fotos/datos adentro. Se acomodan sobre una grilla de posiciones fijas, no en píxeles libres.

### Temas: paquetes completos, con ajuste fino adentro

Mirage diseña un catálogo cerrado de temas (propuesta inicial: 4-6) — cada uno una combinación ya resuelta de paleta + tipografía + texturas, verificada en contraste AA como el resto del producto. El owner elige un tema como base para toda la página.

Dentro del tema elegido, dos ajustes finos quedan a su criterio — **nunca un valor libre, siempre una elección entre opciones que ese tema ya trae resueltas**:
- **Variante de color**: cada tema define un rango acotado de variantes (ej. 3-4 combinaciones de acento dentro de su propia paleta), no un color picker.
- **Tipografía**: cada tema provee 2-3 pares de fuentes (display + cuerpo) entre las que elegir, no una fuente subida por el owner.

Esto es lo que separa esta propuesta de "marca libre": el "toque propio" que pediste vive **dentro** de las opciones curadas, nunca las reemplaza — así ninguna clínica puede terminar con un contraste roto o una combinación que se vea poco profesional.

### Módulos v1 (propuesta, a confirmar)

| Módulo | Editable | Instancias | Fijo/opcional |
|---|---|---|---|
| **Portada** (hero: foto de portada + nombre de clínica) | foto | Única | Fijo, siempre primero |
| **Pedí tu turno** (CTA existente, wizard) | — (contenido funcional, no de diseño) | Única | Fijo, no se puede ocultar ni mover fuera de una posición temprana |
| **Sobre nosotros** (bio institucional) | texto | Única | Opcional, oculto si no tiene texto cargado |
| **Texto libre** (sección de texto adicional, con título propio — ej. "Nuestra filosofía", "Financiación") | texto, título | Múltiples | Opcional |
| **Especialidades** | — (se deriva de los profesionales activos, corrige el bug de arriba) | Única | Opcional, oculto si no hay especialidades |
| **Foto** (una imagen destacada, con subtipo de formato: retrato/vertical, banner horizontal, franja ancho completo) | foto, subtipo de formato | Múltiples | Opcional |
| **Galería** (grilla de varias fotos juntas) | fotos (con un tope, a definir) | Única | Opcional |
| **Estadísticas** (valores reales del sistema — ver más abajo, sin rating/reseñas) | qué estadísticas mostrar, de una lista cerrada | Única | Opcional |
| **Contacto** (dirección + mapa embebido, teléfono, redes sociales) | dirección (override u origen de `Clinic`), redes | Única | Opcional |
| **Horarios visibles** | — (¿derivado del horario de atención real ya cargado, o texto libre? — ver preguntas abiertas) | Única | Opcional |

"Texto libre" y "Foto" son los únicos módulos de **múltiples instancias** — el owner puede agregar varios (ej. tres fotos banner intercaladas con secciones de texto) dentro de los slots que la grilla habilita para ese tipo, con un tope razonable a definir (evita una página infinita).

### Estadísticas: solo lo que el sistema puede probar

Nada de rating ni cantidad de reseñas — Mirage no tiene un sistema de reseñas de pacientes hoy, y mostrar un número sin ningún mecanismo real detrás sería inventar contenido. Candidatas reales, derivables de datos que ya existen:

- **Pacientes atendidos**: conteo de pacientes con al menos un turno marcado `asistió` en esa clínica — dato ya existe (asistencia se marca desde la Fase 2.3.4, ver CLAUDE.md), solo falta el query de agregación.
- **Turnos realizados**: mismo criterio, conteo total en vez de pacientes únicos.
- **Años en Mirage**: derivado de `Clinic.CreatedAt` — más simbólico que útil, a confirmar si suma.

El owner elige cuáles de estas mostrar (checkbox sobre una lista cerrada), nunca carga un número a mano. Un sistema real de reseñas de pacientes (con verificación contra turnos reales y moderación) queda como iniciativa aparte, fuera de esta vertical.

### Por qué grilla y no free-form

Con posiciones predefinidas por breakpoint, la previsualización mobile/tablet/desktop dentro del propio editor puede mostrarse con confianza — no hay combinación de módulos que produzca un layout roto, porque el sistema define cómo se acomoda cada tamaño de pantalla, no el profesional. Esto es lo que pediste explícitamente al elegir esta opción ("facilitar el testing de cómo se ve en múltiples dispositivos") y es coherente con que el resto del producto ya usa un sistema de diseño cerrado, no libre.

---

## Modelo de datos propuesto (a nivel de diseño, no de migración final)

La configuración de contenido/diseño es **de la página**, no de la clínica ni del profesional — separación que ya existe entre `Clinic` (identidad/datos de negocio) y `PaginaPublica` (qué se muestra/publica). Se extiende `PaginaPublica` y se suma una tabla de módulos:

```
paginas_publicas
  + bio               text, nullable
  + tema              varchar — uno del catálogo cerrado de temas (ej. 'clinico' | 'calido' | 'moderno' | ...)
  + tema_variante      varchar — variante de color DENTRO del tema elegido
  + tema_tipografia    varchar — par de fuentes DENTRO del tema elegido
  + foto_portada_url  varchar, nullable
  + redes_sociales    jsonb   — { instagram?, facebook?, whatsapp? ... }
  + mostrar_mapa      bool, default false
  + direccion_override varchar, nullable — si no está, usa la de Clinic

pagina_publica_modulos
  id             uuid PK
  pagina_publica_id  FK -> paginas_publicas
  tipo           varchar  — 'portada' | 'sobre_nosotros' | 'texto_libre' | 'especialidades' | 'foto' | 'galeria' | 'estadisticas' | 'contacto' | 'horarios' | 'turno'
  orden          int
  visible        bool
  config         jsonb  — específico de cada tipo:
                     'texto_libre' → { titulo, texto }
                     'foto'        → { fotoUrl, subtipo: 'retrato'|'banner'|'franja' }
                     'galeria'     → { fotoUrls: [...] }
                     'estadisticas'→ { mostrar: ['pacientes_atendidos', 'turnos_realizados', ...] } — nunca un valor numérico cargado a mano, se calcula en el momento de servir la página
```

`tipo` con múltiples instancias (`texto_libre`, `foto`) simplemente tiene más de una fila en `pagina_publica_modulos` con el mismo `pagina_publica_id`.

`GET /clinicas/{slug}` (público) y `GET/PATCH /panel/pagina` (editor) devuelven/reciben esta estructura completa en vez de los dos campos actuales.

---

## Fotos: el bloqueo real antes de salir a producción

El profesional puede subir fotos en dev (disco local) hoy mismo si se construye el endpoint — pero **en producción no hay dónde guardarlas** hasta que exista la implementación R2 (TR-046, pendiente desde antes de esta fase). Dos caminos, a decidir antes de implementar:

- **(a) Resolver R2 como prerequisito de esta fase** — más trabajo antes de arrancar el editor en sí, pero la feature de fotos sale completa la primera vez.
- **(b) Implementar el editor completo ahora, dejar "fotos" deshabilitado/oculto en producción hasta que R2 esté listo** (funciona en dev de punta a punta) — permite avanzar con el resto (bio, color, módulos sin foto) sin bloquearse.

---

## Fuera de alcance de esta primera vuelta

- Editor completamente libre (posiciones/tamaños en píxeles).
- Marca 100% libre (logo, colores hex, tipografías propias) — la individualización pasa por temas curados con ajuste fino adentro, no por diseño sin límites.
- Rating y reseñas de pacientes en cualquier forma (ni real ni de texto libre a mano) — ver la sección de Estadísticas. Un sistema real de reseñas queda como iniciativa aparte.
- Bio o foto por profesional individual en la página pública (la Fase 3.2 dejó esa función wireada solo para "quién atiende" en el panel, no para la vidriera pública — sigue así).
- Galería sin límite de fotos.
- Analítica de visitas a la página.
- Subdominio propio (sigue como "Futuro" en spec §5).
- Nuevos módulos más allá de la tabla de arriba (video, mapa interactivo con más que un embed simple, blog, etc.) — se suman en una vuelta posterior si hacen falta.

---

## Preguntas abiertas para cerrar antes de implementar

Estas son de detalle de implementación, no de producto — propongo un default en cada una; basta confirmar o corregir:

1. **Grilla:** ¿cuántas columnas por breakpoint? Propuesta: 1 columna en mobile (apilado, como hoy), 2 en tablet/desktop para módulos opcionales (portada y turno siempre a ancho completo).
2. **Catálogo de temas:** ¿cuántos temas v1, y quién los diseña? Propuesta: 4-6, diseñados por Mirage como parte de la implementación (no es algo que se le pida al cliente) — cada uno con 3-4 variantes de color y 2-3 pares de tipografía adentro.
3. **Horarios visibles:** ¿derivado en vivo del horario de atención real cargado en la agenda (consistente con "disponibilidad real" que ya rige el resto del producto), o un texto libre que el profesional edita a mano y puede desincronizarse? Propuesta: derivado, mismo criterio que el resto del sistema.
4. **Redes sociales:** ¿qué plataformas soportamos v1? Propuesta: Instagram, Facebook, WhatsApp (ya existe el teléfono para esto, redundante a confirmar si suma valor).
5. **Tope de fotos:** en galería, propuesta 6-8; en módulos "Foto" sueltos (múltiples instancias), propuesta un tope total por página (ej. 10 entre todos los módulos de foto) para no volver la página interminable.
6. **Estadísticas v1 exactas:** ¿alcanza con "pacientes atendidos" y "turnos realizados", o hace falta algo más específico del negocio? "Años en Mirage" queda a confirmar si suma valor real.
7. **Librería de drag & drop para el editor:** decisión técnica, no de producto — se resuelve al implementar (ej. `dnd-kit`, ya usado en proyectos similares del mismo patrón de trabajo).

---

## Próximo paso

Con esto aprobado (con o sin cambios), la implementación se divide en subfases como el resto del proyecto: modelo de datos + migración → endpoints backend (`GET/PATCH /panel/pagina`, upload de fotos, fix del bug owner-only) → editor con grilla en el frontend → renderizado dinámico de `ClinicaPublicaTemplate` a partir de los módulos persistidos. Se estima y planifica recién ahí, no antes.
