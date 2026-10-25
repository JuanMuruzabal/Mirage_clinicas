---
paths:
  - "apps/web/src/components/home/**"
  - "apps/web/src/app/page.tsx"
  - "apps/web/src/app/home.css"
---

# La home pública

Se carga cuando la sesión lee o edita la home (`apps/web/src/components/home/**`, `app/page.tsx`, `app/home.css`).

## La home pública (TR-181)

- **Simple y al pie, a pedido del cliente:** cinco partes que dicen una cosa cada una (qué es, la historia de Lucía en un carrusel de tres escenas, cuatro ventajas, la entrada para pacientes y el cierre). Una primera versión con siete secciones y mucho texto se descartó por "cargada": **antes de sumar una sección o un párrafo a la home, preguntate si no alcanza con un dibujo y una frase.** Secciones en `components/home/`, estilos en `app/home.css` (solo los importa `app/page.tsx`). Los anclas `#como-funciona` y `#buscar` son los destinos del header: no los renombres.
- **Los dibujos viven en `components/home/dibujos.tsx`**, en un solo estilo (línea de tinta, rellenos cálidos, un acento verde) y con objetos, no personas. Si algo se anima con CSS, la posición va en un `<g transform>` de afuera y la animación en uno de adentro: el `transform` del CSS pisa el del SVG y la pieza termina en la esquina (bug real).
- **Todo lo que la home promete tiene que existir en el producto**, y nada de cifras, testimonios o sellos que no se puedan sostener. Nada de framer-motion ni de contenido escondido hasta hidratar: `Revelar` + CSS, mismo criterio que TR-180; con "reducir movimiento", cada parte aparece con un fundido, los dibujos quedan quietos y el carrusel no avanza solo.
