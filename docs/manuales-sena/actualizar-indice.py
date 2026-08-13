#!/usr/bin/env python3
"""Calcula las paginas del indice del taller y regenera el .docx con ellas.

El indice del documento no es un campo de Word: es texto con el numero de
pagina escrito. Asi se ve igual en Word, en LibreOffice y en el PDF, sin que
nadie tenga que acordarse de actualizar campos.

El precio es que los numeros hay que calcularlos, y para eso toca convertir el
documento a PDF y buscar en que pagina cae cada titulo. Eso es lo que hace este
script:

    1. genera el .docx
    2. lo pasa a PDF con LibreOffice
    3. busca cada titulo y anota su pagina en indice-paginas.json
    4. vuelve a generar el .docx, ahora con los numeros
    5. repite si al agregar los numeros la paginacion se corrio

    python3 docs/manuales-sena/actualizar-indice.py
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
GENERADOR = AQUI / "generar-taller-docker-docx.py"
DOCX = AQUI / "Taller-Docker-Linux-CodeByMike.docx"
JSON = AQUI / "indice-paginas.json"

soffice = shutil.which("soffice") or shutil.which("libreoffice")
if not soffice:
    sys.exit("Hace falta LibreOffice para medir las paginas.")


def generar():
    subprocess.run([sys.executable, str(GENERADOR)], check=True,
                   stdout=subprocess.DEVNULL)


def titulos_del_docx():
    """Los encabezados en el orden en que aparecen, con su nivel."""
    from docx import Document

    doc = Document(DOCX)
    out = []
    for p in doc.paragraphs:
        m = re.fullmatch(r"Heading (\d)", p.style.name)
        if m and p.text.strip():
            out.append((p.text.strip(), int(m.group(1))))
    return out


def paginas_del_pdf(titulos):
    """En que pagina del PDF cae cada titulo.

    Se salta la pagina del indice, porque ahi los titulos aparecen otra vez y
    darian siempre esa pagina.
    """
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([soffice, "--headless", "--convert-to", "pdf",
                        "--outdir", tmp, str(DOCX)],
                       check=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=300)
        pdf = next(Path(tmp).glob("*.pdf"))
        info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True,
                              text=True).stdout
        total = int(re.search(r"Pages:\s+(\d+)", info).group(1))

        texto = {}
        for pg in range(1, total + 1):
            texto[pg] = subprocess.run(
                ["pdftotext", "-f", str(pg), "-l", str(pg), str(pdf), "-"],
                capture_output=True, text=True).stdout

        pagina_indice = next(
            (pg for pg, t in texto.items() if "Tabla de Contenido" in t), 2)

        encontrado, desde = {}, 1
        for titulo, _ in titulos:
            # Se busca hacia adelante: los titulos van en orden, y asi un
            # titulo que se repite en el cuerpo no roba la pagina del otro.
            for pg in range(desde, total + 1):
                if pg == pagina_indice:
                    continue
                if titulo in re.sub(r"\s+", " ", texto[pg]):
                    encontrado[titulo] = pg
                    desde = pg
                    break
        return encontrado, total


def main():
    generar()
    titulos = titulos_del_docx()

    previo = None
    for intento in range(1, 4):
        paginas, total = paginas_del_pdf(titulos)
        faltan = [t for t, _ in titulos if t not in paginas]
        if faltan:
            print("No se ubicaron estos titulos:", faltan)

        if paginas == previo:
            print(f"Indice estable en el intento {intento}. "
                  f"{len(paginas)} entradas, {total} paginas.")
            return
        JSON.write_text(json.dumps(paginas, ensure_ascii=False, indent=2),
                        encoding="utf-8")
        generar()
        previo = paginas

    print("El indice no se estabilizo en tres intentos. "
          "Revisar si algun titulo queda justo en un cambio de pagina.")


if __name__ == "__main__":
    main()
