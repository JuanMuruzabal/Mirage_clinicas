"""Mide los recuadros de las piezas de un odontograma del Colegio, para
escribir la lámina de una plantilla que lo tiene (Fase 5.5).

En los modelos del Colegio el odontograma es una imagen escaneada embebida
en la página. Este script la encuentra, detecta por píxeles el recuadro
exterior de cada pieza y lo asigna a su número FDI según el orden de las
filas del papel. Imprime cada recuadro en puntos del PDF (esquina superior
izquierda y lado, con el origen arriba a la izquierda), listo para pegar en
`lamina.odontogramas[].piezas` de la plantilla.

Cómo detecta: pasa la imagen a blanco y negro (umbral de Otsu, así no
depende de lo claro u oscuro del escaneo), engorda un píxel lo oscuro para
cerrar los cortes del trazo, y busca las manchas conexas. Un recuadro es
una mancha casi cuadrada (el marco, el cuadrado de adentro y las diagonales
quedan unidos); los números son manchas chicas y las barras que separan las
arcadas, manchas largas. Se quedan las cuadradas de un tamaño parecido a la
mediana, se agrupan en filas por su altura y cada fila se ordena de
izquierda a derecha.

Las filas del papel se describen de arriba abajo, separadas por `;`; cada
una es una lista de tramos `desde-hasta` separados por coma, en el orden en
que aparecen de izquierda a derecha. El valor por defecto es el de la
historia clínica general:

    18-11,21-28;48-41,31-38;55-51,61-65;85-81,71-75

Si no encuentra exactamente un recuadro por pieza —o una fila no tiene los
que dice el papel— avisa y sale con error: no imprime una lista a medias.

Uso (necesita PyMuPDF y Pillow; los PDF no se versionan, el repo es público):

    python scripts/medir-odontograma.py "<PDF del Colegio>" <página> [--filas "<filas>"] [--imagen <n>]

`--imagen` elige la imagen de la página (0, 1, …, en el orden de PyMuPDF)
cuando hay más de una; si no se dice, la más grande.
"""
import argparse
import io
import statistics
import sys
from collections import deque

import pymupdf
from PIL import Image, ImageFilter

FILAS_DE_LA_GENERAL = "18-11,21-28;48-41,31-38;55-51,61-65;85-81,71-75"

# Un recuadro es casi cuadrado: el escaneo lo deforma un poco, nunca tanto.
PROPORCION_MAXIMA = 1.3
# Lo que se aparta de la mediana de los cuadrados más que esto no es un
# recuadro de pieza (un número redondo, una mancha del escaneo).
DESVIO_DE_TAMANO = 0.25
# Más chico que esto (en píxeles) es ruido o un dígito.
LADO_MINIMO_PX = 12


def expandir_tramo(tramo: str) -> list[str]:
    desde, hasta = (int(n) for n in tramo.split("-"))
    paso = 1 if hasta >= desde else -1
    return [str(n) for n in range(desde, hasta + paso, paso)]


def leer_filas(texto: str) -> list[list[str]]:
    filas = [[p for tramo in fila.split(",") for p in expandir_tramo(tramo.strip())] for fila in texto.split(";")]
    todas = [p for fila in filas for p in fila]
    if len(set(todas)) != len(todas):
        raise SystemExit("las filas repiten una pieza")
    return filas


def elegir_imagen(pagina, indice):
    imagenes = pagina.get_image_info(xrefs=True)
    if not imagenes:
        raise SystemExit("la página no tiene imágenes")
    if indice is not None:
        return imagenes[indice]
    return max(imagenes, key=lambda i: i["width"] * i["height"])


def umbral_de_otsu(gris: Image.Image) -> int:
    histograma = gris.histogram()
    total = sum(histograma)
    suma_total = sum(i * h for i, h in enumerate(histograma))
    mejor, umbral = -1.0, 128
    fondo = suma_fondo = 0
    for t, h in enumerate(histograma):
        fondo += h
        if fondo == 0 or fondo == total:
            continue
        suma_fondo += t * h
        media_fondo = suma_fondo / fondo
        media_frente = (suma_total - suma_fondo) / (total - fondo)
        varianza = fondo * (total - fondo) * (media_fondo - media_frente) ** 2
        if varianza > mejor:
            mejor, umbral = varianza, t
    return umbral


def manchas(oscuro: Image.Image) -> list[tuple[int, int, int, int]]:
    """Las cajas (x0, y0, x1, y1) de las manchas conexas (vecindad de 8)."""
    ancho, alto = oscuro.size
    pixeles = bytearray(oscuro.tobytes())
    cajas = []
    for inicio in range(ancho * alto):
        if not pixeles[inicio]:
            continue
        pixeles[inicio] = 0
        cola = deque([inicio])
        x0 = x1 = inicio % ancho
        y0 = y1 = inicio // ancho
        while cola:
            i = cola.popleft()
            x, y = i % ancho, i // ancho
            x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
            for dy in (-1, 0, 1):
                ny = y + dy
                if ny < 0 or ny >= alto:
                    continue
                for dx in (-1, 0, 1):
                    nx = x + dx
                    if 0 <= nx < ancho and pixeles[ny * ancho + nx]:
                        pixeles[ny * ancho + nx] = 0
                        cola.append(ny * ancho + nx)
        cajas.append((x0, y0, x1 + 1, y1 + 1))
    return cajas


def recuadros(imagen: Image.Image) -> list[tuple[float, float, float]]:
    """Los recuadros de las piezas, en píxeles: (centro x, centro y, lado)."""
    gris = imagen.convert("L")
    umbral = umbral_de_otsu(gris)
    # Engordar lo oscuro un píxel cierra los cortes del trazo escaneado.
    oscuro = gris.point(lambda v: 255 if v <= umbral else 0).filter(ImageFilter.MaxFilter(3))
    cuadradas = []
    for x0, y0, x1, y1 in manchas(oscuro):
        w, h = x1 - x0, y1 - y0
        if min(w, h) >= LADO_MINIMO_PX and max(w, h) / min(w, h) <= PROPORCION_MAXIMA:
            # El engorde agregó un píxel de cada lado.
            cuadradas.append(((x0 + x1) / 2, (y0 + y1) / 2, (w + h) / 2 - 2))
    if not cuadradas:
        return []
    mediana = statistics.median(lado for _, _, lado in cuadradas)
    return [r for r in cuadradas if abs(r[2] - mediana) <= DESVIO_DE_TAMANO * mediana]


def agrupar_en_filas(cajas):
    """De arriba abajo; una fila nueva cuando el centro baja más de medio lado."""
    ordenadas = sorted(cajas, key=lambda r: r[1])
    filas: list[list] = []
    for r in ordenadas:
        if filas and r[1] - filas[-1][-1][1] <= r[2] / 2:
            filas[-1].append(r)
        else:
            filas.append([r])
    return [sorted(f, key=lambda r: r[0]) for f in filas]


def main() -> None:
    argumentos = argparse.ArgumentParser(description="Mide los recuadros de un odontograma del Colegio.")
    argumentos.add_argument("pdf")
    argumentos.add_argument("pagina", type=int)
    argumentos.add_argument("--filas", default=FILAS_DE_LA_GENERAL)
    argumentos.add_argument("--imagen", type=int)
    a = argumentos.parse_args()

    filas_del_papel = leer_filas(a.filas)
    esperadas = sum(len(f) for f in filas_del_papel)
    pdf = pymupdf.open(a.pdf)
    pagina = pdf[a.pagina - 1]
    info = elegir_imagen(pagina, a.imagen)
    escala_x, sesgo_1, sesgo_2, escala_y, origen_x, origen_y = info["transform"]
    if abs(sesgo_1) > 1e-6 or abs(sesgo_2) > 1e-6 or escala_x <= 0 or escala_y <= 0:
        raise SystemExit("la imagen está rotada o espejada: este script solo mide imágenes derechas")
    imagen = Image.open(io.BytesIO(pymupdf.Pixmap(pdf, info["xref"]).tobytes("png")))
    pt_x = escala_x / imagen.width
    pt_y = escala_y / imagen.height

    encontrados = recuadros(imagen)
    filas = agrupar_en_filas(encontrados)
    print(f"# imagen {imagen.width}×{imagen.height} px en ({origen_x:.2f}, {origen_y:.2f}) pt, {pt_x:.4f} pt/px", file=sys.stderr)
    print(f"# recuadros: {len(encontrados)} (se esperan {esperadas}); por fila: {[len(f) for f in filas]}", file=sys.stderr)
    if len(encontrados) != esperadas or [len(f) for f in filas] != [len(f) for f in filas_del_papel]:
        raise SystemExit(f"no encontré exactamente un recuadro por pieza: hay {len(encontrados)} en filas de {[len(f) for f in filas]}, el papel dice {[len(f) for f in filas_del_papel]}")

    lados = []
    for fila, piezas in zip(filas, filas_del_papel):
        for (cx, cy, lado_px), pieza in zip(fila, piezas):
            lado = lado_px * (pt_x + pt_y) / 2
            x = origen_x + cx * pt_x - lado / 2
            y = origen_y + cy * pt_y - lado / 2
            lados.append(lado)
            print(f'{{ pieza: "{pieza}", x: {x:.2f}, y: {y:.2f}, lado: {lado:.2f} }},')
    print(f"# lado: mediana {statistics.median(lados):.2f} pt (de {min(lados):.2f} a {max(lados):.2f})", file=sys.stderr)


if __name__ == "__main__":
    main()
