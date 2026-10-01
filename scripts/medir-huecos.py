"""Mide los huecos de un modelo del Colegio, para escribir la lámina de una
plantilla nueva (Fase 5.2, TR-189).

Un hueco es un tramo de guiones bajos, puntos suspensivos o puntos (tres o
más seguidos), o una línea dibujada. Por cada uno imprime la página, la
línea de base (b), la x inicial y final, y el texto que tiene antes y
después en su renglón, para saber qué dato va ahí. También lista las
casillas dibujadas (rectángulos chicos).

La zona de la lámina sale de acá con la convención de las plantillas: x un
punto después de donde empieza el hueco, y = línea de base − 1,2, y un
ancho un par de puntos menor que el hueco. Después se verifica a ojo con
`dibujar-lamina.py`.

Uso (necesita PyMuPDF; los PDF no se versionan, el repo es público):

    python scripts/medir-huecos.py "<PDF del Colegio>" [páginas, ej. 5,6]
"""
import sys

import pymupdf

RELLENO = set("_….")


def huecos_de_pagina(pagina):
    salida = []
    for bloque in pagina.get_text("rawdict")["blocks"]:
        for linea in bloque.get("lines", []):
            chars = [c for s in linea["spans"] for c in s["chars"]]
            i = 0
            while i < len(chars):
                if chars[i]["c"] not in RELLENO:
                    i += 1
                    continue
                j = i
                while j < len(chars) and (chars[j]["c"] in RELLENO or (chars[j]["c"] == " " and j + 1 < len(chars) and chars[j + 1]["c"] in RELLENO)):
                    j += 1
                tramo = "".join(c["c"] for c in chars[i:j] if c["c"] != " ")
                if sum(3 if c == "…" else 1 for c in tramo) >= 3:
                    antes = "".join(c["c"] for c in chars[max(0, i - 40):i]).strip()
                    despues = "".join(c["c"] for c in chars[j:j + 25]).strip()
                    x0, x1, base = chars[i]["bbox"][0], chars[j - 1]["bbox"][2], chars[i]["origin"][1]
                    salida.append((base, f"hueco   b{base:.1f} x{x0:.1f}-{x1:.1f} (ancho {x1 - x0:.1f})  «{antes}» ▢ «{despues}»"))
                i = j
    for d in pagina.get_drawings():
        for item in d["items"]:
            if item[0] == "l":
                p1, p2 = item[1], item[2]
                if abs(p1.y - p2.y) < 0.8 and abs(p2.x - p1.x) > 8:
                    salida.append((p1.y, f"línea   y{p1.y:.1f} x{min(p1.x, p2.x):.1f}-{max(p1.x, p2.x):.1f}"))
            elif item[0] == "re":
                r = item[1]
                if r.height < 1.6 and r.width > 8:
                    salida.append((r.y0, f"línea   y{r.y0:.1f} x{r.x0:.1f}-{r.x1:.1f}"))
                elif 4 < r.width < 20 and 4 < r.height < 20:
                    salida.append((r.y0, f"casilla x{r.x0:.1f}-{r.x1:.1f} y{r.y0:.1f}-{r.y1:.1f}"))
    return [t for _, t in sorted(salida, key=lambda e: e[0])]


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    pdf = pymupdf.open(sys.argv[1])
    paginas = [int(n) for n in sys.argv[2].split(",")] if len(sys.argv) > 2 else range(1, pdf.page_count + 1)
    for numero in paginas:
        pagina = pdf[numero - 1]
        print(f"\n## Página {numero} ({pagina.rect.width:.1f} × {pagina.rect.height:.1f} pt)")
        for linea in huecos_de_pagina(pagina):
            print(linea)


if __name__ == "__main__":
    main()
