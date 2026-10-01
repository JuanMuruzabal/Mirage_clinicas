"""Dibuja una lámina compuesta sobre las páginas del modelo original, para
verificar a ojo que cada dato cae en su renglón (Fase 5.2, TR-189).

El texto de cada zona va en azul (rojo si no entra), el recuadro de cada
zona en rojo tenue y el lugar de cada firma en verde. La lámina compuesta
sale de `packages/documentos-clinicos/scripts/lamina-de-prueba.ts`.

Uso (necesita PyMuPDF y Pillow; en Windows usa Arial, que tiene los mismos
anchos que la Helvetica con la que se compone):

    python scripts/dibujar-lamina.py <lamina.json> "<PDF del Colegio>" <páginas, ej. 1,2> [carpeta de salida]
"""
import json
import os
import sys

import pymupdf
from PIL import Image, ImageDraw, ImageFont

ESCALA = 2.0
FUENTES = [r"C:\Windows\Fonts\arial.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "/Library/Fonts/Arial.ttf"]


def fuente(tamano: float):
    for ruta in FUENTES:
        if os.path.exists(ruta):
            return ImageFont.truetype(ruta, max(1, round(tamano * ESCALA)))
    return ImageFont.load_default()


def main() -> None:
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    datos = json.load(open(sys.argv[1], encoding="utf-8"))
    pdf = pymupdf.open(sys.argv[2])
    paginas = [int(n) for n in sys.argv[3].split(",")]
    salida = sys.argv[4] if len(sys.argv) > 4 else "."
    lamina = datos["lamina"]
    for i, numero in enumerate(paginas, start=1):
        pix = pdf[numero - 1].get_pixmap(matrix=pymupdf.Matrix(ESCALA, ESCALA), alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        d = ImageDraw.Draw(img, "RGBA")
        for zona in (z for z in lamina["zonas"] if z["pagina"] == i):
            base = zona.get("tamano", 10)
            alto = (zona.get("lineas", 1) - 1) * zona.get("interlineado", base * 1.2) + base * 1.05
            x, y = zona["x"] - 1, zona["y"] - base * 0.8
            d.rectangle([x * ESCALA, y * ESCALA, (x + zona["ancho"] + 2) * ESCALA, (y + alto) * ESCALA], outline=(220, 40, 40, 110), width=1)
        for z in (z for z in datos["compuesta"] if z["pagina"] == i):
            color = (200, 30, 30, 255) if z["desborda"] else (20, 60, 200, 255)
            for linea in z["lineas"]:
                d.text((linea["x"] * ESCALA, linea["y"] * ESCALA), linea["texto"], font=fuente(z["tamano"]), fill=color, anchor="ls")
        for f in (f for f in lamina["firmas"] if f["pagina"] == i):
            d.rectangle([f["x"] * ESCALA, (f["y"] - f["alto"]) * ESCALA, (f["x"] + f["ancho"]) * ESCALA, f["y"] * ESCALA], outline=(20, 150, 60, 200), width=2)
            d.text((f["x"] * ESCALA + 4, (f["y"] - f["alto"]) * ESCALA + 4), f["rol"], font=fuente(9), fill=(20, 150, 60, 255))
        ruta = os.path.join(salida, f"{datos['plantilla']}-p{i}.png")
        img.save(ruta)
        print(ruta)


if __name__ == "__main__":
    main()
