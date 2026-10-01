"""Renderiza las páginas de los modelos del Colegio como imágenes, para
mostrarlas tal cual en "Así es el documento" (Fase 5.1).

Los PDF originales NO están en el repo (es público): se bajan de
https://colodontcba.org.ar/informacion-general/modelo-historia-clinica/ y
se dejan en una carpeta local. Lo que sí se versiona es lo que sale de acá:
cada página en dos anchos (WebP sin pérdida, así el texto queda nítido) y
un manifiesto con sus medidas que lee la web. El ancho de 2550 px es el de
la impresión: una hoja carta a 300 dpi (TR-188, los consentimientos se
imprimen para firmarlos a mano).

Uso (desde la raíz del repo; necesita PyMuPDF y Pillow):

    python scripts/renderizar-originales.py "<carpeta con los PDF>"

Cuando se suma una plantilla nueva, se agrega su entrada en ORIGINALES y
se vuelve a correr. Las imágenes van por VERSIÓN de plantilla
(originales/<id>/v<versión>/): un documento sellado se dibuja siempre sobre
la página que se firmó, aunque después el Colegio publique otro modelo y la
plantilla pase a la versión siguiente (TR-187). Una versión que ya tiene
documentos no se vuelve a renderizar con otro PDF.
"""
import json
import os
import sys

import pymupdf
from PIL import Image

# (plantilla, versión) → (archivo del Colegio, páginas a mostrar, empezando en 1)
ORIGINALES = {
    ("consentimiento-tratamiento-conducto", 1): ("Consentimiento-Informado-de-Tratamiento-de-Conducto.pdf", [1]),
    # La versión 2 (5.2) usa el mismo PDF: cambian los datos que se completan
    # a mano, no el modelo.
    ("consentimiento-tratamiento-conducto", 2): ("Consentimiento-Informado-de-Tratamiento-de-Conducto.pdf", [1]),
    # Fase 5.2: los demás consentimientos. El de ortodoncia viene adentro de
    # la historia clínica de ortodoncia (sus páginas 5 y 6).
    ("consentimiento-extraccion", 1): ("Consentimiento-Informado-de-Extraccion.pdf", [1, 2]),
    ("consentimiento-biopsia", 1): ("Consentimiento-Informado-Biopsia.pdf", [1, 2]),
    ("consentimiento-implantes", 1): ("Consentimiento-Informado-de-Implantes.pdf", [1, 2]),
    ("consentimiento-periodoncia", 1): ("Consentimiento-Informado-de-Periodoncia.pdf", [1, 2, 3]),
    ("consentimiento-protesis-completa", 1): ("Consentimiento-Informado-de-Protesis-Completa.pdf", [1, 2]),
    ("consentimiento-protesis-fija", 1): ("Consentimiento-Informado-de-Protesis-Fija.pdf", [1, 2]),
    ("consentimiento-protesis-removible", 1): ("Consentimiento-Informado-de-Protesis-Parcial-Removible.pdf", [1, 2]),
    ("consentimiento-ortodoncia", 1): ("Historia-Clinica-para-Modulo-de-Ortodoncia.pdf", [5, 6]),
    ("consentimiento-ortopedia", 1): ("CONSENTIMIENTO-INFORMADO-ORTOPEDIA-VERSION-TERMINADA.pdf", [1, 2]),
    ("consentimiento-odontopediatria", 1): ("Consentimiento-Informado-de-Odontopediatría.pdf", [1, 2]),
    ("consentimiento-discapacidad", 1): ("Consentimiento-informado-para-discapacidad.pdf", [1, 2]),
    ("consentimiento-sedoanalgesia", 1): ("Consentimiento-sedoanalgesia-1.pdf", [1, 2, 3, 4]),
    ("consentimiento-toma-de-imagenes", 1): ("CONSENTIMIENTO-INFORMADO-TOMA-DE-IMAGENES-60-anos-1.pdf", [1, 2]),
}

ANCHOS = (800, 1600, 2550)
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "apps", "web", "public", "documentos-clinicos", "originales")
MANIFIESTO = os.path.join(RAIZ, "apps", "web", "src", "lib", "documentos-originales.json")


def main(carpeta: str) -> None:
    manifiesto = {}
    for (plantilla, version), (archivo, paginas) in ORIGINALES.items():
        pdf = pymupdf.open(os.path.join(carpeta, archivo))
        salida = os.path.join(DESTINO, plantilla, f"v{version}")
        os.makedirs(salida, exist_ok=True)
        entradas = []
        for numero in paginas:
            pagina = pdf[numero - 1]
            alto = None
            for ancho in ANCHOS:
                escala = ancho / pagina.rect.width
                pix = pagina.get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=False)
                imagen = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                imagen.save(os.path.join(salida, f"pagina-{numero}.w{ancho}.webp"), "WEBP", lossless=True, method=6)
                if ancho == max(ANCHOS):
                    alto = pix.height
            entradas.append({"numero": numero, "ancho": max(ANCHOS), "alto": alto})
        manifiesto[f"{plantilla}@{version}"] = {"archivo": archivo, "paginas": entradas}
        print(f"{plantilla} v{version}: {len(paginas)} página(s)")
    with open(MANIFIESTO, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifiesto, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1])
