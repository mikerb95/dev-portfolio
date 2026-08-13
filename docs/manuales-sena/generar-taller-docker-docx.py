#!/usr/bin/env python3
# Genera "Taller-Docker-Linux-CodeByMike.docx" en formato APA 7 (documento de
# estudiante). El .docx no se edita a mano: se corrige aqui y se regenera, para
# que el documento entregado y su fuente no se separen.
#
#   python3 docs/manuales-sena/generar-taller-docker-docx.py
#
# Requiere python-docx. Los recuadros de figura son huecos por llenar: cada uno
# indica donde tomar la captura, que comandos ejecutar y que debe verse.
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUT = "/home/mike/dev/work/github.com/portfolio/docs/manuales-sena/Taller-Docker-Linux-CodeByMike.docx"

doc = Document()

# ---------------------------------------------------------------- estilos base
st = doc.styles["Normal"]
st.font.name = "Times New Roman"
st.font.size = Pt(12)
st.element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
pf = st.paragraph_format
pf.line_spacing_rule = WD_LINE_SPACING.DOUBLE
pf.space_after = Pt(0)
pf.space_before = Pt(0)
pf.first_line_indent = Cm(1.27)

for s in doc.sections:
    s.top_margin = s.bottom_margin = s.left_margin = s.right_margin = Cm(2.54)

# Encabezados APA en Times New Roman negro (Word los trae en azul Calibri)
for name, size, bold, italic, align in [
    ("Heading 1", 12, True, False, WD_ALIGN_PARAGRAPH.CENTER),
    ("Heading 2", 12, True, False, WD_ALIGN_PARAGRAPH.LEFT),
    ("Heading 3", 12, True, True, WD_ALIGN_PARAGRAPH.LEFT),
]:
    h = doc.styles[name]
    h.font.name = "Times New Roman"
    h.font.size = Pt(size)
    h.font.bold = bold
    h.font.italic = italic
    h.font.color.rgb = RGBColor(0, 0, 0)
    h.paragraph_format.alignment = align
    h.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
    h.paragraph_format.space_before = Pt(0)
    h.paragraph_format.space_after = Pt(0)
    h.paragraph_format.first_line_indent = Cm(0)
    h.paragraph_format.keep_with_next = True
    # Word hereda la fuente del tema (majorHAnsi, sans serif) y esa referencia
    # gana sobre w:ascii. Hay que retirarla para que el titulo salga en Times.
    rf = h.element.rPr.rFonts
    for attr in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme"):
        if rf.get(qn("w:" + attr)) is not None:
            del rf.attrib[qn("w:" + attr)]
    rf.set(qn("w:ascii"), "Times New Roman")
    rf.set(qn("w:hAnsi"), "Times New Roman")
    rf.set(qn("w:cs"), "Times New Roman")

lb = doc.styles["List Bullet"]
lb.font.name = "Times New Roman"
lb.font.size = Pt(12)


def shade(cell_or_par, hexcolor):
    el = cell_or_par._tc if hasattr(cell_or_par, "_tc") else cell_or_par._p.get_or_add_pPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear")
    sh.set(qn("w:fill"), hexcolor)
    el.append(sh)


def borders(tbl, top=True, bottom=True, inside=False, color="000000", sz=6):
    """Bordes APA: solo horizontales, nunca verticales."""
    tblPr = tbl._tbl.tblPr
    el = OxmlElement("w:tblBorders")
    conf = {
        "top": top, "bottom": bottom, "left": False, "right": False,
        "insideH": inside, "insideV": False,
    }
    for edge, on in conf.items():
        e = OxmlElement(f"w:{edge}")
        e.set(qn("w:val"), "single" if on else "none")
        e.set(qn("w:sz"), str(sz))
        e.set(qn("w:color"), color)
        el.append(e)
    tblPr.append(el)


def p(text="", *, align=None, indent=True, space_after=0, bold=False,
      italic=False, size=12, spacing=WD_LINE_SPACING.DOUBLE, font="Times New Roman"):
    par = doc.add_paragraph()
    par.paragraph_format.alignment = align if align is not None else WD_ALIGN_PARAGRAPH.LEFT
    par.paragraph_format.first_line_indent = Cm(1.27) if indent else Cm(0)
    par.paragraph_format.line_spacing_rule = spacing
    par.paragraph_format.space_after = Pt(space_after)
    if text:
        r = par.add_run(text)
        r.bold = bold
        r.italic = italic
        r.font.size = Pt(size)
        r.font.name = font
    return par


def rich(par, parts):
    """parts: lista de (texto, {'bold':..,'italic':..,'mono':..})"""
    for txt, fmt in parts:
        r = par.add_run(txt)
        r.bold = fmt.get("bold", False)
        r.italic = fmt.get("italic", False)
        if fmt.get("mono"):
            r.font.name = "Courier New"
            r.font.size = Pt(10.5)
    return par


def code(lines, comment=None):
    """Bloque de comandos: Courier New, interlineado sencillo, fondo gris."""
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    shade(cell, "F2F2F2")
    cell.paragraphs[0]._p.getparent().remove(cell.paragraphs[0]._p)
    for i, ln in enumerate(lines):
        cp = cell.add_paragraph()
        cp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
        cp.paragraph_format.first_line_indent = Cm(0)
        cp.paragraph_format.space_after = Pt(0)
        cp.paragraph_format.space_before = Pt(4 if i == 0 else 0)
        r = cp.add_run(ln)
        r.font.name = "Courier New"
        r.font.size = Pt(10)
    cell.paragraphs[-1].paragraph_format.space_after = Pt(4)
    borders(tbl, top=False, bottom=False)
    p("", space_after=0)
    return tbl


def bullets(items):
    for it in items:
        par = doc.add_paragraph(style="List Bullet")
        par.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
        par.paragraph_format.space_after = Pt(0)
        par.paragraph_format.left_indent = Cm(1.27)
        if isinstance(it, str):
            r = par.add_run(it)
            r.font.name = "Times New Roman"
            r.font.size = Pt(12)
        else:
            rich(par, it)
            for r in par.runs:
                if r.font.name != "Courier New":
                    r.font.name = "Times New Roman"
                    r.font.size = Pt(12)


TABLE_N = [0]
FIG_N = [0]


def table(title, headers, rows, note=None, widths=None, fontsize=10):
    """Tabla en formato APA 7."""
    TABLE_N[0] += 1
    n = TABLE_N[0]
    t1 = p(f"Tabla {n}", indent=False, bold=True)
    t1.paragraph_format.keep_with_next = True
    t2 = p(title, indent=False, italic=True, space_after=4)
    t2.paragraph_format.keep_with_next = True

    tbl = doc.add_table(rows=1, cols=len(headers))
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = True
    hdr = tbl.rows[0].cells
    for i, h in enumerate(headers):
        hdr[i].paragraphs[0].text = ""
        r = hdr[i].paragraphs[0].add_run(h)
        r.bold = True
        r.font.size = Pt(fontsize)
        r.font.name = "Times New Roman"
        hdr[i].paragraphs[0].paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
        hdr[i].paragraphs[0].paragraph_format.first_line_indent = Cm(0)
        hdr[i].paragraphs[0].paragraph_format.space_after = Pt(2)
        hdr[i].paragraphs[0].paragraph_format.space_before = Pt(2)
    for row in rows:
        cells = tbl.add_row().cells
        for i, val in enumerate(row):
            par = cells[i].paragraphs[0]
            par.text = ""
            par.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
            par.paragraph_format.first_line_indent = Cm(0)
            par.paragraph_format.space_after = Pt(2)
            par.paragraph_format.space_before = Pt(2)
            if isinstance(val, str):
                r = par.add_run(val)
                r.font.size = Pt(fontsize)
                r.font.name = "Times New Roman"
            else:
                for txt, fmt in val:
                    r = par.add_run(txt)
                    r.bold = fmt.get("bold", False)
                    r.italic = fmt.get("italic", False)
                    r.font.size = Pt(fontsize - 0.5 if fmt.get("mono") else fontsize)
                    r.font.name = "Courier New" if fmt.get("mono") else "Times New Roman"
    borders(tbl, top=True, bottom=True, inside=False)
    # línea bajo el encabezado
    hp = tbl.rows[0].cells[0]._tc.get_or_add_tcPr()
    for c in tbl.rows[0].cells:
        tcPr = c._tc.get_or_add_tcPr()
        b = OxmlElement("w:tcBorders")
        bo = OxmlElement("w:bottom")
        bo.set(qn("w:val"), "single")
        bo.set(qn("w:sz"), "6")
        bo.set(qn("w:color"), "000000")
        b.append(bo)
        tcPr.append(b)
    if widths:
        for r_ in tbl.rows:
            for i, w in enumerate(widths):
                r_.cells[i].width = Cm(w)
    np = p("", indent=False, space_after=0)
    if note:
        np.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
        np.paragraph_format.space_before = Pt(4)
        rich(np, [("Nota. ", {"italic": True})] + note)
        for r in np.runs:
            if r.font.name != "Courier New":
                r.font.name = "Times New Roman"
            r.font.size = Pt(r.font.size or Pt(10)) if r.font.size else Pt(10)
        for r in np.runs:
            if r.font.name == "Times New Roman":
                r.font.size = Pt(10)
    p("", space_after=0)
    return tbl


def figura(titulo, donde, comandos, que_debe_verse, altura_cm=7.0):
    """Placeholder de captura en formato de figura APA 7."""
    FIG_N[0] += 1
    n = FIG_N[0]
    f1 = p(f"Figura {n}", indent=False, bold=True)
    f1.paragraph_format.keep_with_next = True
    f2 = p(titulo, indent=False, italic=True, space_after=4)
    f2.paragraph_format.keep_with_next = True

    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    shade(cell, "FAFAFA")
    cell.paragraphs[0]._p.getparent().remove(cell.paragraphs[0]._p)

    head = cell.add_paragraph()
    head.alignment = WD_ALIGN_PARAGRAPH.CENTER
    head.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    head.paragraph_format.first_line_indent = Cm(0)
    head.paragraph_format.space_before = Pt(8)
    head.paragraph_format.space_after = Pt(6)
    r = head.add_run(f"[ AQUÍ VA LA CAPTURA {n} ]")
    r.bold = True
    r.font.size = Pt(11)
    r.font.name = "Times New Roman"
    r.font.color.rgb = RGBColor(0x99, 0x00, 0x00)

    lbl = cell.add_paragraph()
    lbl.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    lbl.paragraph_format.first_line_indent = Cm(0)
    lbl.paragraph_format.space_after = Pt(2)
    rr = lbl.add_run("Donde: ")
    rr.bold = True
    rr.font.size = Pt(9.5)
    rr.font.name = "Times New Roman"
    rr = lbl.add_run(donde)
    rr.font.size = Pt(9.5)
    rr.font.name = "Times New Roman"

    lbl2 = cell.add_paragraph()
    lbl2.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    lbl2.paragraph_format.first_line_indent = Cm(0)
    lbl2.paragraph_format.space_after = Pt(2)
    rr = lbl2.add_run("Comandos a ejecutar:")
    rr.bold = True
    rr.font.size = Pt(9.5)
    rr.font.name = "Times New Roman"

    for c in comandos:
        cp = cell.add_paragraph()
        cp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
        cp.paragraph_format.first_line_indent = Cm(0)
        cp.paragraph_format.left_indent = Cm(0.6)
        cp.paragraph_format.space_after = Pt(0)
        rr = cp.add_run(c)
        rr.font.name = "Courier New"
        rr.font.size = Pt(9)

    lbl3 = cell.add_paragraph()
    lbl3.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    lbl3.paragraph_format.first_line_indent = Cm(0)
    lbl3.paragraph_format.space_before = Pt(4)
    lbl3.paragraph_format.space_after = Pt(10)
    rr = lbl3.add_run("Debe verse: ")
    rr.bold = True
    rr.font.size = Pt(9.5)
    rr.font.name = "Times New Roman"
    rr = lbl3.add_run(que_debe_verse)
    rr.font.size = Pt(9.5)
    rr.font.name = "Times New Roman"

    # El recuadro no debe partirse entre dos paginas: la evidencia se pega
    # dentro de el y una figura cortada arruina la maquetacion.
    trPr = tbl.rows[0]._tr.get_or_add_trPr()
    cant = OxmlElement("w:cantSplit")
    trPr.append(cant)
    for cp in cell.paragraphs[:-1]:
        cp.paragraph_format.keep_with_next = True

    # borde punteado para que se note que es un hueco por llenar
    tblPr = tbl._tbl.tblPr
    el = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right"):
        e = OxmlElement(f"w:{edge}")
        e.set(qn("w:val"), "dashed")
        e.set(qn("w:sz"), "8")
        e.set(qn("w:color"), "999999")
        el.append(e)
    tblPr.append(el)

    np = p("", indent=False, space_after=0)
    np.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    np.paragraph_format.space_before = Pt(4)
    rich(np, [("Nota. ", {"italic": True}),
              ("Captura tomada en Ubuntu 24.04.4 LTS con Docker Engine 29.6.2. "
               "Elaboración propia.", {})])
    for r in np.runs:
        r.font.name = "Times New Roman"
        r.font.size = Pt(10)
    p("", space_after=0)


def toc():
    par = doc.add_paragraph()
    par.paragraph_format.first_line_indent = Cm(0)
    run = par.add_run()
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = 'TOC \\o "1-3" \\h \\z \\u'
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    txt = OxmlElement("w:t")
    txt.text = "Actualice la tabla de contenido en Word: clic derecho > Actualizar campos."
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    for e in (fld, instr, sep, txt, end):
        run._r.append(e)


def page_number_header():
    hdr = doc.sections[0].header
    par = hdr.paragraphs[0]
    par.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    par.paragraph_format.first_line_indent = Cm(0)
    run = par.add_run()
    run.font.name = "Times New Roman"
    run.font.size = Pt(12)
    f1 = OxmlElement("w:fldChar"); f1.set(qn("w:fldCharType"), "begin")
    it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = "PAGE"
    f2 = OxmlElement("w:fldChar"); f2.set(qn("w:fldCharType"), "end")
    for e in (f1, it, f2):
        run._r.append(e)


page_number_header()


# ==================================================================== PORTADA
for _ in range(4):
    p("", space_after=0)
p("Instalación y uso de Docker en Linux",
  align=WD_ALIGN_PARAGRAPH.CENTER, indent=False, bold=True)
p("Taller resuelto en Ubuntu 24.04 sobre el proyecto CodeByMike",
  align=WD_ALIGN_PARAGRAPH.CENTER, indent=False, bold=True)
p("", space_after=0)
p("Michael David Rodríguez Beltran", align=WD_ALIGN_PARAGRAPH.CENTER, indent=False)
p("Servicio Nacional de Aprendizaje (SENA), Centro de Servicios Financieros",
  align=WD_ALIGN_PARAGRAPH.CENTER, indent=False)
p("Análisis y Desarrollo de Software, Ficha 3114731",
  align=WD_ALIGN_PARAGRAPH.CENTER, indent=False)
p("Instructora: [NOMBRE DE LA DOCENTE]", align=WD_ALIGN_PARAGRAPH.CENTER, indent=False)
p("[FECHA DE ENTREGA]", align=WD_ALIGN_PARAGRAPH.CENTER, indent=False)
doc.add_page_break()

# ============================================================ TABLA CONTENIDO
p("Tabla de Contenido", align=WD_ALIGN_PARAGRAPH.CENTER, indent=False, bold=True)
toc()
doc.add_page_break()

# =================================================================== RESUMEN
p("Resumen", align=WD_ALIGN_PARAGRAPH.CENTER, indent=False, bold=True)
p("Este informe recoge el taller de Docker resuelto en un computador con Ubuntu 24.04 "
  "y no en Windows con Docker Desktop, que es el entorno de la guía. Explico qué pasos "
  "de la guía no aplican en Linux y por qué, y dejo una tabla que empareja cada pantalla "
  "de Docker Desktop con el comando que hace lo mismo en la terminal. Los seis ejercicios "
  "de la página 27 los desarrollé sobre mi propio proyecto, CodeByMike, que ya usa Docker "
  "para levantar sus bases de datos de desarrollo, en lugar de la aplicación de ejemplo "
  "Dino Run. Los temas que evalúa la guía siguen siendo los mismos: imagen, contenedor, "
  "Dockerfile, puertos, variables de entorno, bind mount, persistencia, logs y Compose.",
  indent=False)
p("", space_after=0)
par = p("", indent=False)
rich(par, [("Palabras clave: ", {"italic": True}),
           ("Docker, contenedores, Linux, Docker Compose, bind mount", {})])
doc.add_page_break()

# ============================================================== INTRODUCCION
doc.add_heading("Introducción", level=1)
p("Docker sirve para empaquetar una aplicación con todo lo que necesita para correr y "
  "ejecutarla como un proceso aislado, al que se le llama contenedor. La diferencia con "
  "una máquina virtual es que el contenedor no trae un sistema operativo completo: usa el "
  "núcleo del computador donde corre y solo ejecuta lo suyo. Por eso arranca rápido y "
  "pesa mucho menos (Docker Inc., 2026a).")
p("La guía del curso enseña todo esto en Windows, con Docker Desktop, WSL 2 y el "
  "asistente Gordon. Mi computador tiene Ubuntu 24.04 y ahí buena parte de esa "
  "instalación no se puede hacer. No porque sea difícil, sino porque el problema que esos "
  "pasos resuelven no existe en Linux.")
p("Para no entregar un trabajo incompleto, lo que hice fue ir paso por paso de la guía y "
  "responder dos cosas: si el paso aplica en Linux, cómo se hace; y si no aplica, por qué "
  "no. Los ejercicios prácticos los desarrollé sobre mi proyecto de portafolio, que ya "
  "tenía Docker configurado desde antes del curso. Es una aplicación web hecha con Astro "
  "y con base de datos Turso, y usa contenedores para levantar las bases de datos "
  "mientras programo.")
doc.add_page_break()

# ======================================================== 1. MI EQUIPO
doc.add_heading("Por Qué Mi Instalación Se Ve Distinta a la de la Guía", level=1)
p("Docker nació en Linux. El motor se apoya en dos cosas del núcleo de Linux: los "
  "namespaces, que hacen que un proceso solo vea lo que le corresponde, y los cgroups, "
  "que le limitan cuánta memoria y cuánto procesador puede gastar (Docker Inc., 2026a). "
  "Entonces, para correr contenedores de Linux hace falta un núcleo de Linux.")
p("Ahí es donde entra WSL 2. Windows no tiene ese núcleo, así que instala una máquina "
  "virtual pequeña con un Linux real adentro, y sobre esa máquina Docker Desktop levanta "
  "el motor (Docker Inc., 2026b). Esto me parece lo más importante de toda la adaptación: "
  "cuando alguien sigue la guía en Windows, la aplicación tampoco está corriendo en "
  "Windows. Está corriendo en un Linux escondido dentro de WSL 2. Docker Desktop es la "
  "capa que hace que uno no se dé cuenta.")
p("En mi caso el núcleo ya es el del sistema, así que no hay nada que instalar por "
  "debajo. No hay WSL, no hay que habilitar virtualización en la BIOS y no hay máquina "
  "virtual intermedia. Docker queda como un servicio del sistema y se maneja desde la "
  "terminal. En la Tabla 1 dejo la comparación completa.")

table(
    "Comparación entre lo que pide la guía y lo que hice en Linux",
    ["Paso de la guía", "Qué pasa en mi equipo", "Con qué lo reemplacé"],
    [
        ["Instalar Docker Desktop (sección 4)",
         "En Linux, Docker Desktop es opcional. Solo agrega una interfaz gráfica y una máquina virtual que no necesito. Uso Docker Engine directo.",
         "docker --version y docker info mostrando el motor"],
        ["Instalar WSL 2 (sección 5.1)",
         "No existe en Linux. El núcleo ya es el del sistema.",
         "uname -r, que muestra el núcleo que comparten los contenedores"],
        ["Habilitar virtualización en BIOS (sección 5.2)",
         "No se necesita. Los contenedores no son máquinas virtuales, son procesos aislados.",
         "docker info, donde aparecen apparmor, seccomp y cgroupns"],
        ["Esperar el estado Engine running (sección 5.3)",
         "El motor es un servicio de systemd, no una aplicación que uno abre.",
         "systemctl is-active docker y systemctl is-enabled docker"],
        ["Pantallas Builds, Images, Containers, Logs y Bind mounts",
         "No tengo interfaz gráfica, pero cada pantalla tiene su comando.",
         "Tabla 2, con la lista completa"],
        ["Usar Gordon",
         "Gordon viene con Docker Desktop, así que no lo tengo.",
         "Los comandos que Gordon ejecuta por dentro. La misma guía los menciona"],
        ["Archivo iniciar_juego.bat",
         "Es un archivo de Windows.",
         "Los scripts npm run db:up y npm run db:seed de mi proyecto"],
    ],
    note=[("Elaboración propia a partir de la guía del SENA.", {})],
    widths=[4.6, 6.2, 5.2],
)

p("Todo lo que aparece en este informe lo corrí en un computador con Ubuntu 24.04.4 LTS, "
  "núcleo 7.0.0-28-generic, Docker Engine 29.6.2 y Docker Compose v5.3.1.")

# ============================================ 2. INSTALACION
doc.add_heading("Dejar Docker Funcionando en Ubuntu", level=1)
p("Esta parte reemplaza las secciones 4, 5 y 15.1 de la guía.")

doc.add_heading("Instalación", level=2)
p("Ubuntu trae Docker en sus repositorios, pero casi siempre es una versión vieja y "
  "además no incluye Compose v2. Por eso se instala desde el repositorio oficial de "
  "Docker (Docker Inc., 2026c). Estos son los comandos:")
code([
    "# quitar los paquetes viejos que trae la distribución",
    "sudo apt remove docker docker-engine docker.io containerd runc",
    "",
    "# agregar la llave y el repositorio oficial",
    "sudo apt update && sudo apt install -y ca-certificates curl",
    "sudo install -m 0755 -d /etc/apt/keyrings",
    "sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \\",
    "     -o /etc/apt/keyrings/docker.asc",
    "sudo chmod a+r /etc/apt/keyrings/docker.asc",
    'echo "deb [arch=$(dpkg --print-architecture) \\',
    'signed-by=/etc/apt/keyrings/docker.asc] \\',
    'https://download.docker.com/linux/ubuntu \\',
    '$(. /etc/os-release && echo $VERSION_CODENAME) stable" \\',
    "  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null",
    "",
    "# instalar el motor, el cliente y los complementos",
    "sudo apt update",
    "sudo apt install -y docker-ce docker-ce-cli containerd.io \\",
    "     docker-buildx-plugin docker-compose-plugin",
])
p("Lo de la llave GPG no es puro trámite. Sirve para que apt verifique que los paquetes "
  "vienen firmados por Docker y no los cambió alguien en el camino.")

doc.add_heading("Los Dos Pasos que Sí Son Propios de Linux", level=2)
p("Después de instalar quedan dos ajustes. Estos son el equivalente de esperar a que "
  "Docker Desktop diga Running.")
p("El primero es dejar el servicio andando y que arranque solo con el computador. Vale la "
  "pena separar las dos cosas, porque no son lo mismo: active quiere decir que está "
  "corriendo ahorita, y enabled quiere decir que vuelve a arrancar cuando reinicie el "
  "equipo. En las evidencias muestro las dos.")
code([
    "sudo systemctl enable --now docker",
    "systemctl is-active docker      # -> active",
    "systemctl is-enabled docker     # -> enabled",
])
p("El segundo es poder usar Docker sin escribir sudo cada vez. El demonio atiende en un "
  "socket, /var/run/docker.sock, que pertenece al grupo docker. Si mi usuario no está en "
  "ese grupo, todos los comandos piden contraseña.")
code([
    "sudo usermod -aG docker $USER",
    "newgrp docker            # o cerrar sesión y volver a entrar",
    "id -nG | tr ' ' '\\n' | grep -x docker    # -> docker",
])
p("Sobre esto hay algo que aprendí leyendo la documentación y que me parece importante "
  "anotar: estar en el grupo docker es casi lo mismo que ser administrador del equipo. "
  "Quien pueda hablarle al socket puede montar todo el disco dentro de un contenedor y "
  "hacer lo que quiera. No es un error de configuración, es como está hecho Docker. Si "
  "uno necesita algo más cerrado existe el modo rootless, que corre el motor con el "
  "usuario normal (Docker Inc., 2026j). En Windows uno nunca ve este detalle porque "
  "Docker Desktop lo tapa.")

figura(
    "Versiones instaladas y estado del servicio",
    "Terminal, en cualquier carpeta.",
    ["docker --version",
     "docker compose version",
     "systemctl is-active docker",
     "systemctl is-enabled docker",
     "uname -r"],
    "Las cinco salidas seguidas en la misma terminal. Esta captura reemplaza la del "
    "panel de Docker Desktop con el letrero Engine running.",
)

figura(
    "Docker funcionando sin sudo",
    "Terminal, en cualquier carpeta.",
    ["id -nG | tr ' ' '\\n' | grep -x docker",
     "docker ps"],
    "La palabra docker como respuesta del primer comando y enseguida la lista de "
    "contenedores, sin haber escrito sudo.",
)

doc.add_heading("Comprobar que el Motor Responde", level=2)
p("Los cuatro comandos que pide la sección 5.3 de la guía funcionan igual en Linux, "
  "porque son del cliente y no de la interfaz gráfica:")
code(["docker --version",
      "docker compose version",
      "docker info",
      "docker run hello-world"])
p("Aparte de esos revisé un par de cosas que solo tienen sentido en Linux:")
code(["uname -r",
      "systemctl status docker --no-pager | head -12",
      "docker info --format 'Motor: {{.ServerVersion}} | Datos: {{.DockerRootDir}}'",
      "docker info --format 'Seguridad: {{.SecurityOptions}}'"])
p("Ahí me encontré un detalle curioso. Al correr docker context ls me aparecen dos "
  "contextos: default, que es el que uso, y desktop-linux, que quedó de una prueba vieja "
  "de Docker Desktop. Vale la pena mirarlo antes de empezar, porque si uno está en el "
  "contexto equivocado los contenedores parecen desaparecer y en realidad están en el "
  "otro motor.")

figura(
    "Salida de docker info",
    "Terminal, en cualquier carpeta.",
    ["docker info | head -40",
     "docker context ls"],
    "El bloque Server con la versión del motor y la carpeta de datos, y en Security "
    "Options los valores apparmor, seccomp y cgroupns, que son los mecanismos de "
    "aislamiento del núcleo. Esta captura hace las veces de la de virtualización "
    "habilitada en BIOS que pide la sección 5.2.",
)

doc.add_heading("Cada Pantalla de Docker Desktop y su Comando", level=2)
p("Esta tabla es la que más me sirvió mientras hacía el taller, porque con ella pude "
  "seguir la guía sin saltarme nada. En varios casos el comando muestra más información "
  "que la pantalla.")

table(
    "Equivalencia entre las pantallas de Docker Desktop y los comandos",
    ["Pantalla en Docker Desktop", "Comando en Linux"],
    [
        ["Panel principal, Engine running", [("systemctl is-active docker", {"mono": True})]],
        ["Images", [("docker images", {"mono": True})]],
        ["Containers", [("docker ps -a", {"mono": True})]],
        ["Builds", [("docker buildx history ls", {"mono": True})]],
        ["Builds, pestaña Logs", [("docker buildx history logs <ID>", {"mono": True})]],
        ["Builds, pestaña Source", [("docker buildx history inspect <ID>", {"mono": True})]],
        ["Containers, pestaña Logs", [("docker logs <nombre>", {"mono": True})]],
        ["Containers, pestaña Inspect", [("docker inspect <nombre>", {"mono": True})]],
        ["Containers, pestaña Files", [("docker exec -it <nombre> sh", {"mono": True})]],
        ["Containers, pestaña Stats", [("docker stats", {"mono": True})]],
        ["Containers, pestaña Bind mounts", [("docker inspect --format '{{json .Mounts}}' <nombre>", {"mono": True})]],
        ["Volumes", [("docker volume ls", {"mono": True})]],
        ["Capas de una imagen", [("docker history <imagen>", {"mono": True})]],
        ["Grupo de un proyecto de Compose", [("docker compose ps", {"mono": True})]],
    ],
    note=[("Elaboración propia. Probé todos los comandos en Docker Engine 29.6.2.", {})],
    widths=[7.0, 9.0],
)

# ================================================ 3. QUE APP USE
doc.add_heading("Qué Aplicación Usé en Lugar de Dino Run", level=1)
p("La guía usa Dino Run porque necesita alguna aplicación para meter en un contenedor. Yo "
  "aproveché mi proyecto de portafolio, CodeByMike, que ya venía usando Docker antes del "
  "curso. Eso me obligó a explicar algo que al principio pensé que era una falla del "
  "proyecto y resultó ser una decisión: mi aplicación no se despliega en contenedores. La "
  "publica Vercel. Si la metiera en un contenedor para producción perdería los "
  "despliegues de prueba por cada cambio y la reversión automática, y no ganaría nada.")
p("Entonces, ¿dónde uso Docker? En dos cosas, y las dos me sirvieron para el taller:")
bullets([
    [("El archivo ", {}), ("compose.yaml", {"mono": True}),
     (" levanta dos servidores de base de datos libSQL, que es el mismo motor que uso en "
      "producción. Antes hacía las pruebas contra un archivo local y no era lo mismo: los "
      "errores de concurrencia y de claves repetidas solo aparecen contra el servidor de "
      "verdad.", {})],
    [("El archivo ", {}), (".devcontainer/Dockerfile", {"mono": True}),
     (" fija la versión de Node en 22.12 y trae el navegador de las pruebas "
      "automatizadas. Esto salió de un problema real: si la terminal abre con Node 20, el "
      "comando de compilación falla. Dentro del contenedor eso ya no pasa.", {})],
])
p("La Tabla 3 muestra que los conceptos son los mismos, solo cambia la aplicación.")

table(
    "Los mismos conceptos en la aplicación de la guía y en la mía",
    ["Concepto", "En Dino Run", "En mi proyecto"],
    [
        ["Imagen", "sena-docker-flask-app-app", "libsql-server y la imagen del entorno de desarrollo"],
        ["Contenedor", "dino-game", "codebymike-libsql-main y codebymike-libsql-demo"],
        ["Dockerfile", "Python 3.12 con Flask", "Node 22.12 con Chromium"],
        ["Puerto publicado", "5000:5000", "127.0.0.1:8080:8080 y 127.0.0.1:8081:8080"],
        ["Guardar los datos", "bind mount ./data:/app/data", "un volumen de Docker, y en el ejercicio 5 lo cambio a bind mount"],
        ["Variables de entorno", "DATABASE_PATH y SECRET_KEY", "SQLD_NODE y SQLD_DB_PATH"],
        ["Compose", "un servicio", "dos servicios que comparten configuración"],
    ],
    note=[("Elaboración propia.", {})],
    widths=[3.2, 5.4, 7.4],
)

# ================================================== 4. EJERCICIOS
doc.add_heading("Los Seis Ejercicios", level=1)
p("Son los de la sección 16 de la guía, página 27. Todos los comandos los corrí parado en "
  "la carpeta de mi proyecto.")

# ---- Ejercicio 1
doc.add_heading("Ejercicio 1. Comprobar que el Motor Sirve", level=2)
par = p("")
rich(par, [("Lo que pide: ", {"italic": True}),
           ("comprobar que el motor funciona y puede ejecutar imágenes.", {})])
p("Sin interfaz gráfica el ciclo es el mismo: bajar una imagen, crear el contenedor y "
  "correrlo.")
code(["docker run hello-world",
      "docker images | head",
      "docker ps -a | head"])
p("Algo que no tenía claro antes y me quedó claro con esto: docker run no es un solo "
  "paso. Busca la imagen en el disco, si no la encuentra la descarga, crea el contenedor "
  "y lo arranca. Por eso la guía usa hello-world como prueba, porque con un comando se "
  "ven las cuatro cosas.")
p("El problema de hello-world es que se muere de una y no queda nada que mirar. Para que "
  "la evidencia quedara más completa levanté también un servidor web con un puerto "
  "publicado:")
code(["docker run -d --name prueba-sena -p 8085:80 nginx",
      "curl -s -o /dev/null -w 'HTTP %{http_code}\\n' http://localhost:8085",
      "docker ps --filter name=prueba-sena",
      "docker logs prueba-sena",
      "docker rm -f prueba-sena"])

figura(
    "La imagen de prueba hello-world",
    "Terminal, en cualquier carpeta.",
    ["docker run hello-world"],
    "El mensaje Hello from Docker! con la explicación de los cuatro pasos. Si la "
    "imagen no estaba descargada también salen las líneas de descarga, y eso hace mejor "
    "la evidencia.",
)

figura(
    "Un contenedor con puerto publicado",
    "Terminal, en cualquier carpeta.",
    ["docker run -d --name prueba-sena -p 8085:80 nginx",
     "curl -s -o /dev/null -w 'HTTP %{http_code}\\n' http://localhost:8085",
     "docker ps --filter name=prueba-sena"],
    "El identificador largo del contenedor, la respuesta HTTP 200 y la fila del "
    "contenedor con el puerto 0.0.0.0:8085->80/tcp. Es lo mismo que darle clic al enlace "
    "del puerto en la pantalla Containers.",
)

# ---- Ejercicio 2
doc.add_heading("Ejercicio 2. Construir la Imagen y Revisarla", level=2)
par = p("")
rich(par, [("Lo que pide: ", {"italic": True}),
           ("construir la aplicación y entender el resultado desde Images y Builds.", {})])
p("Construí el Dockerfile del entorno de desarrollo de mi proyecto:")
code(["docker build -t codebymike-dev:sena .devcontainer/"])
p("Para revisarlo después usé estos comandos, que muestran lo mismo que las pantallas "
  "Builds e Images:")
code(["# lo que en Docker Desktop es la pantalla Builds",
      "docker buildx history ls",
      "docker buildx history logs <BUILD_ID>",
      "",
      "# lo que es la pantalla Images",
      "docker images codebymike-dev",
      "",
      "# las capas de la imagen, con el peso de cada una",
      "docker history codebymike-dev:sena --format 'table {{.Size}}\\t{{.CreatedBy}}'"])
p("La parte que más me gustó de este ejercicio fue la caché. La guía explica en la "
  "sección 6.2 por qué se copia primero requirements.txt y después el código, y uno lo "
  "lee y dice bueno. Pero al correr el mismo build dos veces se ve solo: la segunda vez "
  "todos los pasos salen marcados como CACHED y termina en menos de un segundo.")
code(["docker build -t codebymike-dev:sena .devcontainer/   # ahora sale todo CACHED"])
p("Comparando mi Dockerfile con el de Dino Run encontré que hacen casi lo mismo pero con "
  "otras herramientas. Los dos parten de una imagen oficial, instalan dependencias, "
  "copian lo que hace falta, bajan los permisos con USER y definen la carpeta de trabajo. "
  "Hay dos diferencias que sí vale la pena mencionar:")
bullets([
    "Mi imagen base va fijada con un digest, que es una huella del contenido, en vez de "
     "una etiqueta como python:3.12-slim. Una etiqueta puede cambiar mañana y apuntar a "
     "otra imagen; el digest no cambia nunca. Es más incómodo de escribir pero es la "
     "única forma de que la construcción sea igual dentro de seis meses.",
    "Yo uso una instrucción ENV dentro del Dockerfile para la ruta de los navegadores, "
     "mientras que la guía prefiere poner las variables en compose.yaml. Las dos formas "
     "son válidas y la diferencia es cuándo cambia el valor: si es igual siempre, va en "
     "la imagen; si cambia según dónde se ejecute, va en Compose.",
])
p("Del .dockerignore aprendí algo que la guía menciona de pasada. Uno cree que es para "
  "que el build sea más rápido, y sí, pero lo importante es otra cosa: si un archivo con "
  "contraseñas entra al contexto puede quedarse guardado en una capa de la imagen aunque "
  "el Dockerfile nunca lo copie. Por eso en el mío excluyo .env, la carpeta .git, "
  "node_modules y los documentos en PDF y Word que tengo dentro del repositorio.")

figura(
    "Primera construcción de la imagen",
    "Terminal, en la carpeta del proyecto.",
    ["docker build -t codebymike-dev:sena .devcontainer/"],
    "Los pasos numerados, la descarga de la imagen base y el tiempo total al final. "
    "Equivale a la pantalla Builds con el estado Completed.",
)

figura(
    "La segunda construcción usa la caché",
    "Terminal, justo después de la captura anterior.",
    ["docker build -t codebymike-dev:sena .devcontainer/"],
    "Todos los pasos con la palabra CACHED y un tiempo total de menos de un segundo. "
    "Es la prueba de que las capas se reutilizan.",
)

figura(
    "Historial de construcciones, imagen y capas",
    "Terminal, en la carpeta del proyecto.",
    ["docker buildx history ls",
     "docker images codebymike-dev",
     "docker history codebymike-dev:sena --format 'table {{.Size}}\\t{{.CreatedBy}}'"],
    "El registro de la construcción con su duración, la fila de la imagen con etiqueta "
    "y tamaño, y el desglose de capas donde se ve cuánto pesa cada instrucción.",
)

# ---- Ejercicio 3
doc.add_heading("Ejercicio 3. Levantar Todo con Docker Compose", level=2)
par = p("")
rich(par, [("Lo que pide: ", {"italic": True}),
           ("ejecutar la aplicación con Compose y entrar desde el navegador sin tener que "
            "configurar cada opción a mano.", {})])
p("En mi proyecto esto está metido en un script de npm, que viene siendo lo mismo que el "
  "iniciar_juego.bat de la guía pero para Linux:")
code(["npm run db:up      # levanta los contenedores y espera a que respondan",
      "docker compose ps"])
p("El comando que corre por debajo es este:")
code(["docker compose up -d",
      "docker compose ps --format 'table {{.Name}}\\t{{.Status}}\\t{{.Ports}}'"])
p("Y para comprobar por el puerto, que es el equivalente de darle clic a 5000:5000:")
code(["curl -s -o /dev/null -w 'principal HTTP %{http_code}\\n' http://127.0.0.1:8080/health",
      "curl -s -o /dev/null -w 'demo HTTP %{http_code}\\n' http://127.0.0.1:8081/health"])
p("Después levanto la aplicación apuntando a esas bases:")
code(["npm run db:seed",
      "npm run dev:carga    # abre en http://localhost:4400"])
p("Mi compose.yaml tiene tres cosas que el de la guía no, y las entendí mejor haciendo "
  "esta comparación. La primera es que los dos servicios comparten un bloque de "
  "configuración escrito una sola vez, usando lo que en YAML se llama un ancla; como la "
  "guía tiene un solo servicio, nunca se topa con ese problema. La segunda es que mis "
  "puertos están escritos como 127.0.0.1:8080:8080 y no como 8080:8080. La diferencia es "
  "grande: la forma corta, en Linux, deja el servicio abierto a toda la red local, "
  "mientras que la mía solo lo deja disponible en mi propio computador. La tercera es que "
  "el contenedor arranca con casi todos los permisos del núcleo quitados y solo con "
  "cuatro habilitados, que fueron los que necesitó la base de datos para poder iniciar.")

figura(
    "Los servicios levantados y respondiendo",
    "Terminal, en la carpeta del proyecto.",
    ["docker compose ps --format 'table {{.Name}}\\t{{.Status}}\\t{{.Ports}}'",
     "curl -s -o /dev/null -w 'principal HTTP %{http_code}\\n' http://127.0.0.1:8080/health",
     "curl -s -o /dev/null -w 'demo HTTP %{http_code}\\n' http://127.0.0.1:8081/health"],
    "Los dos contenedores en estado Up con sus puertos, y debajo las dos respuestas "
    "HTTP 200. Es la pantalla Containers con el grupo de Compose desplegado.",
)

figura(
    "La aplicación abierta en el navegador",
    "Navegador, en http://localhost:4400, después de correr npm run dev:carga.",
    ["npm run db:seed",
     "npm run dev:carga"],
    "Una página que muestre datos que vienen de la base de datos, para que se note que "
    "la aplicación sí está usando los contenedores. Es el equivalente de la captura de "
    "Dino Run funcionando.",
)

# ---- Ejercicio 4
doc.add_heading("Ejercicio 4. Las Variables de Entorno y la Clave Secreta", level=2)
par = p("")
rich(par, [("Lo que pide: ", {"italic": True}),
           ("separar las variables normales de las secretas y comprobar que la variable "
            "existe sin mostrar su valor.", {})])
p("Las variables que reciben mis contenedores se ven así:")
code(["docker inspect codebymike-libsql-main \\",
      "  --format '{{range .Config.Env}}{{println .}}{{end}}'",
      "",
      "# SQLD_NODE=primary",
      "# SQLD_DB_PATH=/var/lib/sqld/main.db"])
p("SQLD_DB_PATH es lo mismo que DATABASE_PATH en Dino Run: le dice al programa dónde "
  "escribir. Lo que hay que cuidar es que esa ruta coincida con la del montaje. Si uno "
  "cambia una y olvida la otra, el programa escribe en un lugar que no se está guardando "
  "y los datos se pierden apenas se recrea el contenedor.")
p("Del lado de mi aplicación las variables se dividen en tres grupos, que es justo lo que "
  "pide el ejercicio. Las normales, como la dirección de la base de datos local, se "
  "pueden mostrar sin problema. Las opcionales, como las de notificaciones, se pueden "
  "dejar vacías y la aplicación sigue funcionando, solo que no envía nada. Y las "
  "secretas, como la clave de cifrado, viven en un archivo .env que está excluido tanto "
  "del repositorio como del contexto de construcción.")
p("Para la evidencia hay que comprobar que la variable existe sin dejar ver el valor. La "
  "forma que encontré es cortar todo lo que va después del signo igual:")
code(["# muestra solo los nombres, sin los valores",
      "docker inspect codebymike-libsql-main \\",
      "  --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1",
      "",
      "# confirma que la clave existe, sin imprimirla",
      "grep -c '^ENCRYPTION_KEY=' .env          # -> 1"])
p("Una cosa que me llamó la atención revisando la guía: en la sección 7 el compose.yaml "
  "de ejemplo trae la clave escrita completa dentro del archivo, y después, en la sección "
  "12, la misma guía dice que eso no se debe hacer y recomienda traerla desde un archivo "
  ".env. Supongo que en el ejemplo la dejaron así para que se entienda, pero es el error "
  "más fácil de cometer, así que lo anoto.")

figura(
    "Variables de entorno sin mostrar los valores secretos",
    "Terminal, en la carpeta del proyecto.",
    ["docker inspect codebymike-libsql-main \\",
     "  --format '{{range .Config.Env}}{{println .}}{{end}}'",
     "",
     "docker inspect codebymike-libsql-main \\",
     "  --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1",
     "",
     "grep -c '^ENCRYPTION_KEY=' .env"],
    "Primero las variables del contenedor con sus valores, que no son secretos; "
    "después la misma consulta cortada a solo los nombres; y por último el conteo que "
    "prueba que la clave existe sin mostrarla. Antes de tomar la captura hay que "
    "revisar que no haya quedado ninguna clave visible más arriba en la terminal.",
)

# ---- Ejercicio 5
doc.add_heading("Ejercicio 5. Que los Datos No Se Pierdan", level=2)
par = p("")
rich(par, [("Lo que pide: ", {"italic": True}),
           ("guardar los datos con el bind mount de compose.yaml, reiniciar el contenedor "
            "y comprobar que siguen ahí.", {})])
p("Mi proyecto no usa bind mount sino un volumen de Docker, que para bases de datos "
  "funciona mejor porque Docker se encarga de los permisos y los archivos no quedan "
  "regados en la carpeta del proyecto. Para el ejercicio armé un archivo aparte que "
  "cambia solo esa parte, sin dañar la configuración normal:")
code(["services:",
      "  libsql-main:",
      "    volumes:",
      "      - ./.data/libsql-main:/var/lib/sqld"])
p("Y lo levanté combinando los dos archivos:")
code(["# antes: montaje tipo volume",
      "docker inspect codebymike-libsql-main \\",
      "  --format '{{range .Mounts}}{{.Type}} {{.Source}}{{println}}{{end}}'",
      "",
      "docker compose -f compose.yaml \\",
      "  -f docs/manuales-sena/compose.sena-bind.yaml up -d",
      "",
      "# después: montaje tipo bind, apuntando a mi carpeta",
      "docker inspect codebymike-libsql-main \\",
      "  --format '{{range .Mounts}}{{.Type}} {{.Source}}{{println}}{{end}}'",
      "",
      "ls -la .data/libsql-main"])
p("La prueba de que los datos aguantan es la misma que propone la guía con el récord del "
  "juego: guardar algo, reiniciar y volver a mirar. En mi caso inserté una fila en una "
  "tabla de prueba, reinicié el contenedor y la volví a consultar. Antes del reinicio "
  "tenía una fila y después del reinicio seguía teniendo esa misma fila, con el texto "
  "intacto.")
code(["docker compose restart libsql-main",
      "du -sh .data/libsql-main"])
p("Para volver a como estaba antes:")
code(["docker compose up -d --force-recreate"])
p("Aquí me pasó el único problema que no esperaba. Cuando quise borrar la carpeta .data "
  "para dejar todo limpio, me salió Permission denied, y eso que era una carpeta dentro "
  "de mi propio proyecto. Lo que ocurre es que los archivos los creó el usuario que corre "
  "adentro del contenedor, que tiene otro número de usuario, y desde afuera yo no soy "
  "dueño de esos archivos. La solución fue borrarlos desde un contenedor:")
code(['docker run --rm -v "$PWD/.data:/x" alpine rm -rf /x/libsql-main'])
p("Estuve leyendo y esto en Windows no pasa, porque el acceso a los archivos va por una "
  "capa intermedia que empareja los permisos. Me sirvió para entender por qué en Linux se "
  "prefieren los volúmenes de Docker para las bases de datos y los bind mounts se dejan "
  "más que todo para el código mientras uno programa.")

figura(
    "El montaje cambia de volumen a bind mount",
    "Terminal, en la carpeta del proyecto.",
    ["docker inspect codebymike-libsql-main \\",
     "  --format '{{range .Mounts}}{{.Type}} {{.Source}}{{println}}{{end}}'",
     "",
     "docker compose -f compose.yaml \\",
     "  -f docs/manuales-sena/compose.sena-bind.yaml up -d",
     "",
     "docker inspect codebymike-libsql-main \\",
     "  --format '{{range .Mounts}}{{.Type}} {{.Source}}{{println}}{{end}}'",
     "",
     "ls -la .data/libsql-main"],
    "Las dos consultas una debajo de la otra: la primera dice volume y una ruta larga "
    "de Docker, la segunda dice bind y la ruta de mi proyecto. Al final el listado de la "
    "carpeta que apareció. Es la pestaña Bind mounts de Docker Desktop.",
)

figura(
    "Los datos siguen ahí después de reiniciar",
    "Terminal, en la carpeta del proyecto.",
    ["# insertar una fila, reiniciar y volver a consultar",
     "docker compose restart libsql-main",
     "du -sh .data/libsql-main"],
    "La consulta antes del reinicio, el reinicio del contenedor y la consulta después, "
    "con el mismo dato. Esta es la captura que corresponde al récord que se conserva en "
    "el ejemplo de la guía.",
)

# ---- Ejercicio 6
doc.add_heading("Ejercicio 6. El Puerto Ocupado", level=2)
par = p("")
rich(par, [("Lo que pide: ", {"italic": True}),
           ("diagnosticar un puerto ocupado y cambiar el puerto del computador en "
            "compose.yaml.", {})])
p("Este error no toca esperarlo, se puede provocar. Como mi base de datos ya tiene tomado "
  "el 8080, pedí ese mismo puerto para otro contenedor:")
code(["docker run -d --name choque -p 127.0.0.1:8080:80 nginx"])
p("Y salió el mensaje de la guía:")
code(["Error response from daemon: failed to set up container networking:",
      "driver failed programming external connectivity on endpoint choque:",
      "Bind for 127.0.0.1:8080 failed: port is already allocated"])
p("Para saber quién lo tiene ocupado hay dos comandos, y me parece importante mostrar los "
  "dos:")
code(["# si el que lo ocupa es un contenedor",
      "docker ps --filter publish=8080 --format '{{.Names}} -> {{.Ports}}'",
      "",
      "# si el que lo ocupa es un programa del computador",
      "ss -ltnp | grep :8080"])
p("El segundo es una ventaja de estar en Linux. Cuando el puerto lo tiene un programa "
  "instalado en el equipo y no un contenedor, Docker Desktop no lo puede ver y uno se "
  "queda sin saber qué pasa.")
p("La solución es la que dice la guía, cambiar el puerto del lado izquierdo:")
code(["docker rm -f choque",
      "docker run -d --name choque -p 127.0.0.1:8086:80 nginx",
      "curl -s -o /dev/null -w 'HTTP %{http_code}\\n' http://127.0.0.1:8086",
      "docker rm -f choque"])
p("Y en Compose sería cambiar 8080:8080 por 8085:8080, igual que la guía cambia 5000:5000 "
  "por 5001:5000. El número de la derecha lo manda la aplicación, uno no lo puede "
  "escoger, y el de la izquierda es el que uno elige. Por eso siempre se mueve el "
  "izquierdo, y por eso EXPOSE no publica nada: solo deja anotado cuál es el puerto de "
  "adentro.")

figura(
    "Puerto ocupado, diagnóstico y solución",
    "Terminal, en la carpeta del proyecto.",
    ["docker run -d --name choque -p 127.0.0.1:8080:80 nginx",
     "docker ps --filter publish=8080 --format '{{.Names}} -> {{.Ports}}'",
     "ss -ltnp | grep :8080",
     "docker rm -f choque",
     "docker run -d --name choque -p 127.0.0.1:8086:80 nginx",
     "curl -s -o /dev/null -w 'HTTP %{http_code}\\n' http://127.0.0.1:8086",
     "docker rm -f choque"],
    "Todo seguido: el mensaje port is already allocated, el contenedor que tenía "
    "ocupado el puerto, la comprobación a nivel del sistema y el mismo contenedor "
    "funcionando en el otro puerto con respuesta HTTP 200.",
)

# ================================================ 5. ACTIVIDADES
doc.add_heading("Las Preguntas de la Sección 17", level=1)

doc.add_heading("Qué Significa Empaquetar una Aplicación", level=2)
p("Empaquetar es entregar el programa junto con todo lo que necesita para funcionar: el "
  "lenguaje, las librerías, la configuración y el comando con el que arranca. Todo en una "
  "sola pieza, para que no dependa de cómo esté configurado el computador donde va a "
  "correr.")
p("El caso de que algo funcione en un equipo y falle en otro me pasó con este mismo "
  "proyecto, y es justo el ejemplo con el que abre la guía. Mi terminal a veces abre con "
  "Node 20 y el proyecto necesita 22.12 o más nuevo. Mismo repositorio, mismo comando, y "
  "en un computador compila y en otro no. Antes lo resolvía cambiando la versión a mano "
  "cada vez, hasta que armé el archivo del entorno de desarrollo y el problema "
  "desapareció.")

doc.add_heading("Diferencia entre Imagen, Contenedor y Dockerfile", level=2)
p("La forma en que me quedó claro fue pensándolo como una receta. El Dockerfile es la "
  "receta escrita: un archivo de texto con los pasos. La imagen es el plato ya preparado, "
  "que no cambia y se puede guardar. Y el contenedor es cuando uno se sienta a comerlo, o "
  "sea la ejecución.")
p("De una misma imagen pueden salir varios contenedores. En mi proyecto se ve directo: "
  "los dos contenedores de base de datos usan exactamente la misma imagen, pero uno tiene "
  "los datos reales de desarrollo y el otro los de la demostración, y cada uno escucha en "
  "un puerto distinto. Eso aparece en la salida de docker ps.")

doc.add_heading("Sobre las Pantallas y las Capas", level=2)
p("Las capas y la caché las trabajé en el ejercicio 2, el bind mount en el ejercicio 5 y "
  "Compose en el ejercicio 3. La actividad que propone cambiar algo y volver a construir "
  "la hice cambiando la versión del navegador en el Dockerfile: al reconstruir se ve que "
  "los pasos de antes de esa línea siguen saliendo como CACHED y los de después se "
  "vuelven a ejecutar. La imagen base no se descarga otra vez.")

# ==================================================== 6. EVIDENCIAS
doc.add_heading("Qué Captura Corresponde a Cada Criterio", level=1)
p("Armé esta tabla para revisar que no me estuviera quedando faltando ninguna evidencia "
  "de las que pide la sección 19.")

table(
    "Las capturas y el criterio que le corresponde a cada una",
    ["Figura", "Qué muestra", "Criterio de la guía"],
    [
        ["1 y 2", "Docker instalado, activo y funcionando sin sudo",
         "Instala Docker y se orienta en su entorno"],
        ["3", "docker info con los mecanismos de aislamiento",
         "Entiende los componentes del motor"],
        ["4 y 5", "hello-world y un contenedor con puerto publicado",
         "Ejecuta imágenes y comprueba que el motor sirve"],
        ["6, 7 y 8", "Construcción de la imagen, la caché y las capas",
         "Construye la imagen y analiza el proceso"],
        ["9 y 10", "Compose levantado y la aplicación en el navegador",
         "Ejecuta y comprueba el proyecto por el puerto publicado"],
        ["11", "Variables comprobadas sin mostrar los valores secretos",
         "Distingue variables normales y sensibles, y entrega evidencias sin exponer información"],
        ["12 y 13", "El cambio de montaje y los datos después de reiniciar",
         "Configura y verifica la persistencia"],
        ["14", "Puerto ocupado, diagnóstico y solución",
         "Interpreta errores y los corrige"],
    ],
    note=[("Elaboración propia a partir de la sección 19 de la guía.", {})],
    widths=[1.8, 6.2, 8.0],
)
p("Antes de entregar hay que revisar que en ninguna captura se alcance a leer una clave. "
  "La misma guía lo pide en los criterios de evaluación.")

# ==================================================== 7. CONCLUSIONES
doc.add_heading("Conclusiones", level=1)
p("Hacer el taller en Linux no me quitó contenido, me cambió el punto de vista. Los temas "
  "de la guía los trabajé todos: imagen, contenedor, Dockerfile, contexto de "
  "construcción, puertos, variables de entorno, montajes, persistencia, logs y Compose. "
  "Lo que cambió fue que en vez de darle clic a una pantalla tuve que escribir el comando.")
p("Manejar el motor directo me mostró cosas que la interfaz gráfica esconde y que creo "
  "que vale la pena saber: que Docker es un servicio del sistema y no un programa que uno "
  "abre, que estar en el grupo docker es casi ser administrador, que los archivos de un "
  "bind mount quedan con el usuario del contenedor, y que un puerto ocupado se puede "
  "diagnosticar a nivel de todo el sistema y no solo entre contenedores.")
p("También me sirvió comparar el ejemplo de la guía con mi proyecto, porque me obligó a "
  "explicar decisiones que ya estaban tomadas y que nunca había puesto por escrito: por "
  "qué fijo las imágenes con un digest, por qué publico los puertos solo en mi "
  "computador, y por qué mi aplicación usa Docker para desarrollar pero no para "
  "publicarse. Esa última fue la que más me costó justificar y creo que es la que más "
  "aprendí, porque saber dónde no usar una herramienta también es parte de saber usarla.")
doc.add_page_break()

# ==================================================== REFERENCIAS
doc.add_heading("Referencias", level=1)
refs = [
    "Docker Inc. (2026a). Docker overview. Docker Docs. "
    "https://docs.docker.com/get-started/docker-overview/",
    "Docker Inc. (2026b). Docker Desktop WSL 2 backend on Windows. Docker Docs. "
    "https://docs.docker.com/desktop/features/wsl/",
    "Docker Inc. (2026c). Install Docker Engine on Ubuntu. Docker Docs. "
    "https://docs.docker.com/engine/install/ubuntu/",
    "Docker Inc. (2026d). Post-installation steps for Linux. Docker Docs. "
    "https://docs.docker.com/engine/install/linux-postinstall/",
    "Docker Inc. (2026e). Dockerfile reference. Docker Docs. "
    "https://docs.docker.com/reference/dockerfile/",
    "Docker Inc. (2026f). Build context. Docker Docs. "
    "https://docs.docker.com/build/concepts/context/",
    "Docker Inc. (2026g). Bind mounts. Docker Docs. "
    "https://docs.docker.com/engine/storage/bind-mounts/",
    "Docker Inc. (2026h). Environment variables in Compose. Docker Docs. "
    "https://docs.docker.com/compose/how-tos/environment-variables/",
    "Docker Inc. (2026i). Publishing and exposing ports. Docker Docs. "
    "https://docs.docker.com/get-started/docker-concepts/running-containers/publishing-ports/",
    "Docker Inc. (2026j). Run the Docker daemon as a non-root user (rootless mode). "
    "Docker Docs. https://docs.docker.com/engine/security/rootless/",
    "Servicio Nacional de Aprendizaje. (2026). Instalación y uso de Docker [Guía de "
    "aprendizaje]. Formación en Ambientes Virtuales de Aprendizaje.",
]
for r in sorted(refs):
    par = doc.add_paragraph()
    par.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
    par.paragraph_format.first_line_indent = Cm(-1.27)
    par.paragraph_format.left_indent = Cm(1.27)
    par.paragraph_format.space_after = Pt(0)
    run = par.add_run(r)
    run.font.name = "Times New Roman"
    run.font.size = Pt(12)

doc.save(OUT)
print("OK ->", OUT)
print("Figuras:", FIG_N[0], "| Tablas:", TABLE_N[0])
