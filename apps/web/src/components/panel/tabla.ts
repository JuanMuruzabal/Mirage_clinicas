// El sistema común de las tablas del panel (correcciones generales, ítem 9,
// 2026-10-12). Pedido de la persona: "la mayoría presentan tipografías
// distintas, diferentes tamaños de letra y opacidad... las secciones de las
// columnas deben estar en un solo renglón... la tabla tiene un scrollbar
// para ver el contenido completo".
//
// Una tabla del panel se arma con estas clases y no con clases sueltas:
//
// - La caja (`CLASE_CAJA_TABLA`) es de vidrio, el mismo de las tarjetas de
//   General (`.vidrio` en globals.css, 2026-10-17: translúcido, con el
//   borde iluminado, el brillo y las esquinas grandes), con más cuerpo
//   (`.vidrio-tabla`, blanco al 66 %) porque son muchos renglones de texto
//   chico. Scrollea en los dos ejes. En una pantalla del panel la caja es
//   `<CajaDeTabla llenaLaPantalla>`: crece hasta el espacio libre de la
//   pantalla, sin bajar de cuatro filas en el celular ni de 20 rem en la
//   computadora (lib/alto-de-filas.ts). En un diálogo el alto lo pone quien
//   la usa: `max-h-[…] max-md:max-h-[var(--alto-mobile,…)]`. Una tabla
//   sin filas muestra su aviso en la misma caja (`CLASE_CAJA_VACIA`), y una
//   tabla adentro de un diálogo, sobre blanco, va en la caja opaca de antes
//   (`CLASE_CAJA_TABLA_EN_DIALOGO`): ahí el vidrio no tiene nada detrás y
//   solo sumaría un desenfoque.
// - En el celular la tabla va COMPLETA, con todas sus columnas en el orden
//   de la computadora, y scrollea de costado adentro de su caja (la barra es
//   la `.scroll-discreto`, que se ve). Nada de esconder columnas ni de
//   apilarlas debajo del nombre: por eso ahí las celdas no se parten
//   (`whitespace-nowrap`) y la tabla toma el ancho que necesita.
// - En la computadora, en cambio, la tabla ENTRA ENTERA, sin scroll de
//   costado (desde ~1280 px de ventana): las celdas pueden partir renglón
//   (`md:whitespace-normal`) y el navegador reparte el ancho. Una celda
//   solo parte renglón si no entra; lo que no se puede partir (la fecha y
//   la hora, el DNI, el folio, la huella, un estado) va en piezas que no
//   se cortan (`whitespace-nowrap` en un `<span>` o `<p>` adentro de la
//   celda, no en la celda: ahí lo pisaría `md:whitespace-normal`). Entre
//   `md` y `2xl` el padding horizontal baja a 8 px: con el menú lateral, la
//   tabla de Turnos de la vista general (nueve columnas, varias con la
//   cabecera como lo más ancho) no entraba a 1280 px. Esa tabla, además, va
//   compacta en esa franja (sin el avatar, con la fecha apilada y el mail
//   cortado a 9 rem: ver `turnos-table.tsx`). Una celda con un `pl-*` propio
//   lo repite con `md:` y `2xl:`, o el padding de acá se lo pisa.
// - La cabecera (`CLASE_CABECERA`) es igual en todas: un renglón, 12 px en
//   mayúsculas, `grafito/75` sobre la capa clara de `.panel-th-sticky`
//   (blanca y opaca sobre el vidrio, para que las filas que pasan por
//   debajo no se mezclen; `hueso` en un diálogo), y una línea
//   inferior que acompaña el scroll. La columna fija del celular es la
//   misma capa clara.
// - Las celdas: 14 px, `grafito` para el dato y `grafito/75` para lo
//   secundario (4,5:1 como mínimo, la regla del repo; sobre el vidrio da
//   más de 5:1 en el tramo más oscuro del fondo, también con el velo del
//   hover). La monoespaciada
//   (`CLASE_MONO`) solo para lo que se compara cifra por cifra: el DNI, el
//   teléfono, el folio, la fecha y la hora, la huella y la IP.
// - Texto a la izquierda; un número que se suma o compara, a la derecha
//   (`text-right` en la cabecera y en la celda); las acciones, a la
//   derecha y al ancho justo (`CLASE_COLUMNA_ACCIONES`).

export const CLASE_CAJA_TABLA = "panel-table-scroll vidrio vidrio-tabla overflow-auto";
export const CLASE_CAJA_TABLA_EN_DIALOGO = "panel-table-scroll overflow-auto rounded-card border border-linea bg-marfil shadow-soft";
export const CLASE_CAJA_VACIA = "vidrio vidrio-tabla";

export const CLASE_TABLA = "w-full border-collapse text-left text-sm";

export const CLASE_CABECERA =
  "panel-th-sticky whitespace-nowrap px-3 py-2.5 md:px-2 2xl:px-3 text-left align-middle text-xs font-semibold tracking-wide text-grafito/75 uppercase";

// Separadores sutiles entre filas, la última sin línea (la cierra el borde
// de la caja). Una fila que lleva a algún lado se ilumina con el velo. El
// separador es grafito translúcido y no `arena`: el gris opaco desaparecía
// sobre el vidrio, y sobre blanco los dos se ven igual.
export const CLASE_FILA = "border-b border-grafito/10 last:border-b-0";
export const CLASE_FILA_CLICABLE = `${CLASE_FILA} cursor-pointer hover:bg-velo`;

export const CLASE_CELDA = "whitespace-nowrap px-3 py-3 md:px-2 2xl:px-3 align-middle text-sm text-grafito md:whitespace-normal";
export const CLASE_CELDA_SECUNDARIA = "whitespace-nowrap px-3 py-3 md:px-2 2xl:px-3 align-middle text-sm text-grafito/75 md:whitespace-normal";

// Lo que va anidado debajo de una fila (el detalle desplegado de un turno,
// los anexos debajo de su historia): la segunda capa del vidrio, un poco
// más clara que el cuerpo (antes era `hueso`, un gris opaco que sobre el
// vidrio se veía como una franja pegada).
export const CLASE_FONDO_ANIDADO = "bg-marfil/45";

// El segundo renglón adentro de una celda (el DNI debajo del nombre, la
// fecha del último documento).
export const CLASE_TEXTO_SECUNDARIO = "text-xs text-grafito/75";

export const CLASE_MONO = "font-[family-name:var(--font-mono)] tabular-nums";
// Lo que se compara carácter por carácter y no es una cifra para leer —la
// huella, la IP—: la monoespaciada de verdad (2026-10-17: `CLASE_MONO`
// pasó a ser Figtree con cifras tabulares).
export const CLASE_CODIGO = "font-[family-name:var(--font-codigo)]";

// Una columna de acciones o de un control chico: al ancho de lo que lleva,
// sin llevarse el espacio que sobra, y alineada a la derecha.
export const CLASE_COLUMNA_ACCIONES = "w-px text-right";

// La columna que nombra la fila queda fija a la izquierda en el celular,
// mientras el resto scrollea de costado (`.tabla-columna-fija` en
// globals.css). Solo en Turnos y Pacientes, donde la primera columna es la
// persona y la tabla es larga: va en la cabecera y en cada celda de esa
// columna.
export const CLASE_COLUMNA_FIJA = "tabla-columna-fija";
