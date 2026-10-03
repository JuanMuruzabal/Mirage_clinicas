"""Dibuja una lámina compuesta sobre las páginas del modelo original, para
verificar a ojo que cada dato cae en su renglón (Fase 5.2, TR-189).

El texto de cada zona va en azul (rojo si no entra), el recuadro de cada
zona en rojo tenue y el lugar de cada firma en verde. Las figuras del
odontograma (Fase 5.5) van con sus colores, y el recuadro medido de cada
pieza en gris. La lámina compuesta sale de
`packages/documentos-clinicos/scripts/lamina-de-prueba.ts`.

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


# Los mismos colores que las figuras del paquete (odontograma.ts).
COLORES = {"rojo": (0xD0, 0x20, 0x2E), "azul": (0x1F, 0x4F, 0xBF), "tinta": (0x16, 0x18, 0x1D)}


def punto(p):
    return (p[0] * ESCALA, p[1] * ESCALA)


def dibujar_linea_discontinua(d, desde, hasta, color, grosor):
    (x0, y0), (x1, y1) = punto(desde), punto(hasta)
    largo = max(((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5, 1e-6)
    tramo = 3 * ESCALA
    t = 0.0
    while t < largo:
        a, b = t / largo, min(t + tramo, largo) / largo
        d.line([(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a), (x0 + (x1 - x0) * b, y0 + (y1 - y0) * b)], fill=color, width=grosor)
        t += 2 * tramo


def dibujar_figura(d, f):
    if f["tipo"] == "poligono":
        d.polygon([punto(p) for p in f["puntos"]], fill=COLORES[f["relleno"]] + (200,))
        return
    color = COLORES[f["color"]] + (255,)
    if f["tipo"] == "texto":
        d.text(punto((f["x"], f["y"])), f["texto"], font=fuente(f["tamano"]), fill=color, anchor="ls")
        return
    grosor = max(1, round(f["grosor"] * ESCALA))
    if f["tipo"] == "contorno":
        d.polygon([punto(p) for p in f["puntos"]], outline=color, width=grosor)
    elif f["tipo"] == "circulo":
        (cx, cy), r = punto(f["centro"]), f["radio"] * ESCALA
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=grosor)
    elif f.get("discontinua"):
        dibujar_linea_discontinua(d, f["desde"], f["hasta"], color, grosor)
    else:
        d.line([punto(f["desde"]), punto(f["hasta"])], fill=color, width=grosor)


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
        for o in (o for o in lamina.get("odontogramas", []) if o["pagina"] == i):
            for r in o["piezas"]:
                d.rectangle([r["x"] * ESCALA, r["y"] * ESCALA, (r["x"] + r["lado"]) * ESCALA, (r["y"] + r["lado"]) * ESCALA], outline=(120, 120, 120, 160), width=1)
        for f in (f for f in datos.get("figuras", []) if f["pagina"] == i):
            dibujar_figura(d, f)
        for f in (f for f in lamina["firmas"] if f["pagina"] == i):
            d.rectangle([f["x"] * ESCALA, (f["y"] - f["alto"]) * ESCALA, (f["x"] + f["ancho"]) * ESCALA, f["y"] * ESCALA], outline=(20, 150, 60, 200), width=2)
            d.text((f["x"] * ESCALA + 4, (f["y"] - f["alto"]) * ESCALA + 4), f["rol"], font=fuente(9), fill=(20, 150, 60, 255))
        ruta = os.path.join(salida, f"{datos['plantilla']}-p{i}.png")
        img.save(ruta)
        print(ruta)


if __name__ == "__main__":
    main()
