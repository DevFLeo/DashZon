#!/usr/bin/env python3
"""Gera as planilhas de exemplo do Cronograma de estudos:

  exemplos/cronograma-estudos.xlsx  (Excel: data e horário em células de data/hora)
  exemplos/cronograma-estudos.csv   (como o Excel brasileiro salva: ; e DD/MM/AAAA)

As duas têm as mesmas linhas e o cabeçalho com os nomes dos campos do módulo
"Cronograma de estudos" (template cronograma-estudos). Para importar:

  python scripts/importar_planilha.py exemplos/cronograma-estudos.xlsx --modulo cronograma_estudos --usuario SEU_LOGIN

Só biblioteca padrão. Rode de novo depois de mudar LINHAS.
"""
import csv
import datetime as dt
import os
import zipfile
from xml.sax.saxutils import escape

PASTA = os.path.dirname(os.path.abspath(__file__))
CABECALHO = ["Data", "Horário", "Matéria", "Assunto", "Atividade", "Duração (horas)", "Estudado", "Anotações"]
INICIO = dt.date(2026, 10, 12)  # uma segunda-feira

# (dia a partir do INÍCIO, horário, matéria, assunto, atividade, horas, estudado, anotações)
LINHAS = [
    (0, "19:00", "Matemática", "Conjuntos e intervalos", "Videoaula", 1.5, True, ""),
    (0, "20:45", "Português", "Classes de palavras", "Leitura", 1.0, True, ""),
    (1, "19:00", "Programação", "Variáveis e tipos", "Exercícios", 2.0, True, "Lista 1 completa"),
    (2, "19:00", "Inglês", "Simple past", "Exercícios", 1.0, False, "Remarcar"),
    (2, "20:15", "Física", "Grandezas e unidades", "Resumo", 1.0, True, ""),
    (3, "19:30", "Matemática", "Funções do 1º grau", "Exercícios", 2.0, True, ""),
    (4, "19:00", "História", "Brasil Colônia", "Leitura", 1.5, False, ""),
    (5, "09:00", "Química", "Modelos atômicos", "Videoaula", 1.5, False, ""),
    (5, "10:45", "Biologia", "Citologia", "Resumo", 1.0, False, ""),
    (7, "19:00", "Programação", "Funções", "Videoaula", 1.5, False, ""),
    (8, "19:00", "Português", "Concordância verbal", "Exercícios", 1.0, False, ""),
    (9, "19:30", "Geografia", "Clima e vegetação", "Leitura", 1.0, False, ""),
    (10, "19:00", "Matemática", "Revisão: funções", "Revisão", 2.0, False, ""),
    (12, "09:00", "Outra", "Simulado geral", "Simulado", 4.0, False, "Cronometrar"),
]


def linhas_completas():
    for dia, hora, *resto in LINHAS:
        yield (INICIO + dt.timedelta(days=dia), hora, *resto)


# ----------------------------------------------------------------- CSV ----

def gerar_csv(caminho):
    # utf-8-sig: o Excel no Windows reconhece os acentos ao abrir com dois cliques.
    with open(caminho, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(CABECALHO)
        for data, hora, materia, assunto, atividade, horas, estudado, notas in linhas_completas():
            w.writerow([data.strftime("%d/%m/%Y"), hora, materia, assunto, atividade,
                        f"{horas:g}".replace(".", ","), "Sim" if estudado else "Não", notas])


# ---------------------------------------------------------------- XLSX ----

def _col(i):
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def _celula(ref, valor, estilo=0):
    s = f' s="{estilo}"' if estilo else ""
    if isinstance(valor, bool):
        return f'<c r="{ref}" t="b"{s}><v>{int(valor)}</v></c>'
    if isinstance(valor, (int, float)):
        return f'<c r="{ref}"{s}><v>{valor!r}</v></c>'
    if valor in (None, ""):
        return ""
    return f'<c r="{ref}" t="inlineStr"{s}><is><t xml:space="preserve">{escape(str(valor))}</t></is></c>'


def gerar_xlsx(caminho):
    # Estilos: 1 = cabeçalho em negrito, 2 = data DD/MM/AAAA, 3 = hora HH:MM, 4 = número com 1 casa.
    estilos = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="0.0"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>"""

    linhas_xml = ['<row r="1">' + "".join(_celula(f"{_col(i)}1", t, 1) for i, t in enumerate(CABECALHO)) + "</row>"]
    for n, (data, hora, materia, assunto, atividade, horas, estudado, notas) in enumerate(linhas_completas(), start=2):
        h, m = map(int, hora.split(":"))
        valores = [((data - dt.date(1899, 12, 30)).days, 2), ((h * 60 + m) / 1440, 3), (materia, 0), (assunto, 0),
                   (atividade, 0), (horas, 4), (estudado, 0), (notas, 0)]
        linhas_xml.append(f'<row r="{n}">' + "".join(_celula(f"{_col(i)}{n}", v, e) for i, (v, e) in enumerate(valores)) + "</row>")

    larguras = [12, 9, 14, 28, 12, 16, 13, 22]
    cols = "".join(f'<col min="{i + 1}" max="{i + 1}" width="{w}" customWidth="1"/>' for i, w in enumerate(larguras))
    folha = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
             '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
             f"<cols>{cols}</cols><sheetData>{''.join(linhas_xml)}</sheetData>"
             f'<autoFilter ref="A1:{_col(len(CABECALHO) - 1)}{len(LINHAS) + 1}"/></worksheet>')

    arquivos = {
        "[Content_Types].xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>""",
        "_rels/.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""",
        "xl/workbook.xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Cronograma" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Cronograma!$A$1:$H$%d</definedName></definedNames>
</workbook>""" % (len(LINHAS) + 1),
        "xl/_rels/workbook.xml.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>""",
        "xl/styles.xml": estilos,
        "xl/worksheets/sheet1.xml": folha,
    }
    # Data fixa nas entradas do zip: gerar de novo sem mudar nada dá o mesmo arquivo.
    with zipfile.ZipFile(caminho, "w", zipfile.ZIP_DEFLATED) as z:
        for nome, conteudo in arquivos.items():
            info = zipfile.ZipInfo(nome, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, conteudo.encode("utf-8"))


if __name__ == "__main__":
    gerar_xlsx(os.path.join(PASTA, "cronograma-estudos.xlsx"))
    gerar_csv(os.path.join(PASTA, "cronograma-estudos.csv"))
    print("Gerados: exemplos/cronograma-estudos.xlsx e exemplos/cronograma-estudos.csv")
