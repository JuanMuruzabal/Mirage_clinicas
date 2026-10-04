"""Copia a la API las páginas originales de los documentos clínicos, como
JPEG, para el PDF que la API genera en cada descarga (Fase 5.3).

El PDF lo genera la API (Go) y se dibuja sobre la página original del
Colegio, igual que la lámina de la pantalla. La API no puede leer
apps/web/public (go:embed solo ve su propio módulo), así que las páginas se
copian a apps/api/internal/documentos/originales/<id>/v<versión>/ como
pagina-<n>.jpg, donde <n> es el número de página DE LA LÁMINA (1, 2, …), no
el del PDF del Colegio: el consentimiento de ortodoncia, por ejemplo, son
las páginas 5 y 6 de su PDF y acá son pagina-1 y pagina-2.

Sale de los WebP de 2550 px de ancho que ya genera
scripts/renderizar-originales.py (apps/web/public/documentos-clinicos/
originales/<id>/v<versión>/pagina-<número del PDF>.w2550.webp), re-muestreados
a 200 dpi del tamaño de la página de la lámina (612 pt de ancho dan 1700 px;
595,3 pt, 1654) con LANCZOS, en JPEG calidad 80. 200 dpi alcanza para que el
fondo se imprima nítido y pesa menos de la mitad que los 300 dpi de la web
(el binario de la API los lleva embebidos). El PDF los lleva tal cual
(DCTDecode) y los dibuja a página completa, en puntos, sea cual sea su
resolución; un WebP o un PNG habría que decodificarlos y volverlos a
comprimir del lado de Go.

GRIS O COLOR, POR PÁGINA: casi todos los modelos del Colegio son en blanco y
negro, y un JPEG de un solo canal pesa bastante menos que uno RGB (y el
binario de la API los lleva embebidos). Una página va en escala de grises si
no tiene color: si los píxeles en los que los canales R, G y B difieren en
más de UMBRAL_DE_COLOR (lo que separa un color real del ruido de compresión
de un gris) son menos de FRACCION_DE_COLOR del total. Una página con color
de verdad —aunque sea un dibujo chico o unas letras en bordó— queda en
color: el PDF tiene que verse como el original. El color se mide sobre el
WebP de la web, antes de re-muestrear.

QUÉ PLANTILLAS: la versión VIGENTE (la última) de cada plantilla con lámina
—todo documento terminado tiene PDF: un consentimiento (para imprimir) y una
historia clínica sellada— MÁS una versión vieja con documentos ya
terminados:

  - consentimiento-tratamiento-conducto, versión 1: en la 5.1, antes de
    TR-188, el consentimiento de conducto se firmaba y se sellaba en el
    sistema, y hay documentos de esa versión sellados (en las bases de
    desarrollo y de QA) que piden su PDF sobre la página que se firmó.

UNA VERSIÓN QUE REUSA LAS PÁGINAS DE OTRA no se copia: el consentimiento de
conducto v2 sale del mismo PDF del Colegio y de la misma página que el v1
(la v2 solo cambió los campos, TR-189), así que embeberla de nuevo serían
los mismos bytes dos veces en el binario. Va en MISMAS_PAGINAS, y la API la
resuelve con la tabla mismasPaginas de internal/documentos/originales.go:
las dos tablas tienen que decir lo mismo. El script comprueba en el
manifiesto que de verdad sean el mismo archivo y las mismas páginas.

Al sumar una plantilla o una versión, este script la toma sola de su JSON.
Correrlo de nuevo REGENERA todo (borra la carpeta de destino antes, para
que no quede una página que ya no corresponde): el PDF no se guarda en ningún lado (se
genera en cada descarga), así que no hay un archivo ya entregado que deba
seguir dando los mismos bytes. Lo que sí: una versión con documentos
terminados se dibuja sobre esa misma página; no le cambies la imagen por la
de otro PDF del Colegio.

Uso (desde la raíz del repo; necesita Pillow):

    python scripts/originales-para-la-api.py
"""
import json
import os
import shutil

from PIL import Image, ImageChops

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLANTILLAS = os.path.join(RAIZ, "apps", "api", "internal", "documentos", "plantillas")
MANIFIESTO = os.path.join(RAIZ, "apps", "web", "src", "lib", "documentos-originales.json")
ORIGEN = os.path.join(RAIZ, "apps", "web", "public", "documentos-clinicos", "originales")
DESTINO = os.path.join(RAIZ, "apps", "api", "internal", "documentos", "originales")

# Versiones viejas con documentos terminados (ver arriba).
VERSIONES_VIEJAS = {("consentimiento-tratamiento-conducto", 1)}

# Versiones que se dibujan sobre las páginas de otra versión (ver arriba).
# Misma tabla que mismasPaginas en internal/documentos/originales.go.
MISMAS_PAGINAS = {
    ("consentimiento-tratamiento-conducto", 2): ("consentimiento-tratamiento-conducto", 1),
}

DPI = 200
CALIDAD = 80

# Diferencia entre canales por encima de la cual un píxel tiene color. Es
# alta a propósito: un modelo escaneado en blanco y negro tiene ruido de
# croma alrededor del texto negro (el JPEG del escaneo tiñe los bordes), que
# llega a una diferencia de ~70 en unos pocos píxeles (la página 2 de la
# historia clínica para PcD: 3809 píxeles pasan 24, solo 22 pasan 60). Un
# color real pasa de 60 en miles: el más tenue, el logo de Ortopedia, tiene
# 2593 píxeles entre 60 y 70; el violeta de Sedoanalgesia, más de 500.000.
UMBRAL_DE_COLOR = 60
# Fracción mínima de píxeles con color para que la página cuente como en
# color: uno de cada diez mil (en el WebP de 2550 px de la web, sobre el que
# se mide, unos 840 píxeles, un punto de 1 mm²). Menos que eso es ruido, no
# un dibujo.
FRACCION_DE_COLOR = 0.0001


def plantillas_a_copiar():
    versiones = {}
    for nombre in sorted(os.listdir(PLANTILLAS)):
        if not nombre.endswith(".json"):
            continue
        with open(os.path.join(PLANTILLAS, nombre), encoding="utf-8") as f:
            p = json.load(f)
        if not p.get("lamina"):
            continue
        versiones.setdefault(p["id"], {})[p["version"]] = p["lamina"]["paginas"]
    elegidas = []
    for plantilla, porVersion in sorted(versiones.items()):
        vigente = max(porVersion)
        for version in sorted(porVersion):
            if version == vigente or (plantilla, version) in VERSIONES_VIEJAS:
                elegidas.append(((plantilla, version), porVersion[version]))
    copiadas = {clave for clave, _ in elegidas}
    for (plantilla, version), origen in MISMAS_PAGINAS.items():
        if origen not in copiadas:
            raise SystemExit(f"{plantilla} v{version} usa las páginas de {origen[0]} v{origen[1]}, que no se copia")
    return [(clave, paginas) for clave, paginas in elegidas if clave not in MISMAS_PAGINAS]


def comprobar_mismas_paginas(manifiesto):
    for (plantilla, version), (origen, version_origen) in MISMAS_PAGINAS.items():
        una = manifiesto.get(f"{plantilla}@{version}")
        otra = manifiesto.get(f"{origen}@{version_origen}")
        if not una or not otra or una["archivo"] != otra["archivo"] or una["paginas"] != otra["paginas"]:
            raise SystemExit(f"{plantilla} v{version} ya no sale de las mismas páginas que {origen} v{version_origen}: sacala de MISMAS_PAGINAS (y de mismasPaginas en originales.go)")


def tiene_color(imagen):
    r, g, b = imagen.split()
    diferencia = ImageChops.lighter(
        ImageChops.lighter(ImageChops.difference(r, g), ImageChops.difference(g, b)),
        ImageChops.difference(r, b),
    )
    histograma = diferencia.histogram()
    con_color = sum(histograma[UMBRAL_DE_COLOR + 1:])
    return con_color > FRACCION_DE_COLOR * imagen.width * imagen.height


def main() -> None:
    with open(MANIFIESTO, encoding="utf-8") as f:
        manifiesto = json.load(f)
    comprobar_mismas_paginas(manifiesto)
    elegidas = plantillas_a_copiar()
    shutil.rmtree(DESTINO, ignore_errors=True)
    total = 0
    pesos = []
    for (plantilla, version), paginas_de_la_lamina in elegidas:
        entrada = manifiesto.get(f"{plantilla}@{version}")
        if not entrada:
            raise SystemExit(f"{plantilla} v{version}: no está en el manifiesto — corré antes scripts/renderizar-originales.py")
        paginas = entrada["paginas"]
        if len(paginas) != len(paginas_de_la_lamina):
            raise SystemExit(f"{plantilla} v{version}: la lámina tiene {len(paginas_de_la_lamina)} página(s) y el original {len(paginas)}")
        salida = os.path.join(DESTINO, plantilla, f"v{version}")
        os.makedirs(salida, exist_ok=True)
        for indice, (pagina, medidas) in enumerate(zip(paginas, paginas_de_la_lamina), start=1):
            destino = os.path.join(salida, f"pagina-{indice}.jpg")
            origen = os.path.join(ORIGEN, plantilla, f"v{version}", f"pagina-{pagina['numero']}.w{pagina['ancho']}.webp")
            imagen = Image.open(origen).convert("RGB")
            color = tiene_color(imagen)
            if not color:
                imagen = imagen.convert("L")
            # El tamaño sale de la página de la lámina, en puntos (1/72 de
            # pulgada): DPI en los dos ejes, sea cual sea el WebP de origen.
            tamano = (round(medidas["ancho"] * DPI / 72), round(medidas["alto"] * DPI / 72))
            imagen = imagen.resize(tamano, Image.Resampling.LANCZOS)
            # Sin progresivo ni optimización: un JPEG base, el más simple
            # de leer para cualquier lector de PDF.
            imagen.save(destino, "JPEG", quality=CALIDAD, progressive=False, optimize=False)
            peso = os.path.getsize(destino)
            total += peso
            pesos.append(peso)
            print(f"{plantilla} v{version} página {indice}: {'color' if color else 'gris '} {tamano[0]}×{tamano[1]} {peso / 1024:7.1f} KiB  {os.path.relpath(destino, RAIZ)}")
    print(f"total embebido: {total / 1024 / 1024:.2f} MiB en {len(pesos)} páginas (de {min(pesos) / 1024:.1f} a {max(pesos) / 1024:.1f} KiB)")


if __name__ == "__main__":
    main()
