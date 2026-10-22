#!/usr/bin/env python3
"""Gera as planilhas de exemplo da Gestão de Demandas do DGEO:

  exemplos/demandas-dgeo.xlsx  (Excel: prazo em célula de data, custo em número)
  exemplos/demandas-dgeo.csv   (como o Excel brasileiro salva: ; e DD/MM/AAAA)

As duas têm as mesmas linhas e o cabeçalho com os nomes dos campos do módulo
"Gestão de Demandas - DGEO" (template gestao-demandas). Para importar:

  python scripts/importar_planilha.py exemplos/demandas-dgeo.xlsx --modulo demandas --usuario SEU_LOGIN

Só biblioteca padrão. Rode de novo depois de mudar LINHAS.
"""
import csv
import datetime as dt
import os
import zipfile
from xml.sax.saxutils import escape

PASTA = os.path.dirname(os.path.abspath(__file__))
CABECALHO = ["Título / Objeto", "Status da Tramitação", "Prioridade", "Divisão Responsável", "Servidor Responsável",
             "Prazo Legal (Vencimento)", "Dotação / Custo Estimado", "Nº Processo SEI", "Descrição do Pedido / Justificativa"]
INICIO = dt.date(2026, 10, 12)  # uma segunda-feira

DCAD = "DCAD - Divisão de Cadastro (Dados)"
DTAD = "DTAD - Divisão de Tecnologia e Dados"
DASI = "DASI - Divisão de Articulação com Secretarias"
GAB = "DGEO - Gabinete do Diretor"

# (título, status, prioridade, divisão, servidor, dia do prazo a partir do INÍCIO, custo, nº SEI, descrição)
LINHAS = [
    ("Atualizar cadastro de escolas no mapa", "Em Análise", "Alta", DCAD, "Gerente da DCAD", 3, 0, "6016.2026/0001001-1", "Conferir endereços e coordenadas das unidades escolares."),
    ("Base de matrículas georreferenciada", "Aguardando Triagem", "Média", DTAD, "Gerente da DTAD", 10, 0, "", "Cruzar matrículas com setores censitários."),
    ("Ofício da SEMSA sobre área de risco", "Análise Externa (Outras Secretarias)", "Urgente (Prazo Legal / Judicial)", DASI, "Gerente da DASI", 1, 0, "6016.2026/0001002-0", "Responder ofício com mapa das escolas em área de risco."),
    ("Licença de software de geoprocessamento", "Em Análise", "Alta", DTAD, "Gerente da DTAD", 20, 18500.0, "6016.2026/0001003-8", "Renovação anual das licenças."),
    ("Relatório anual de cobertura escolar", "Deferido / Concluído", "Média", GAB, "Diretor(a) do DGEO", -5, 0, "", "Entregue à SUPLAN."),
    ("Pedido de mapa para audiência pública", "Indeferido / Arquivado", "Baixa", DASI, "Técnico Designado", -12, 0, "", "Pedido duplicado; arquivado."),
    ("Correção de limites de bairros", "Aguardando Triagem", "Baixa", DCAD, "Técnico Designado", 30, 0, "", "Divergência entre bases municipais."),
    ("Demanda judicial: transporte escolar", "Em Análise", "Urgente (Prazo Legal / Judicial)", GAB, "Diretor(a) do DGEO", -1, 0, "6016.2026/0001004-6", "Prazo judicial para informar rotas."),
]


def linhas_completas():
    for titulo, status, prioridade, divisao, servidor, dia, custo, sei, descricao in LINHAS:
        yield (titulo, status, prioridade, divisao, servidor, INICIO + dt.timedelta(days=dia), custo, sei, descricao)


# ----------------------------------------------------------------- CSV ----

def gerar_csv(caminho):
    # utf-8-sig: o Excel no Windows reconhece os acentos ao abrir com dois cliques.
    with open(caminho, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(CABECALHO)
        for titulo, status, prioridade, divisao, servidor, prazo, custo, sei, descricao in linhas_completas():
            w.writerow([titulo, status, prioridade, divisao, servidor, prazo.strftime("%d/%m/%Y"),
                        f"{custo:.2f}".replace(".", ",") if custo else "", sei, descricao])


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
    # Estilos: 1 = cabeçalho em negrito, 2 = data DD/MM/AAAA, 3 = hora HH:MM, 4 = número com 2 casas.
    estilos = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="0.00"/></numFmts>
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
    for n, (titulo, status, prioridade, divisao, servidor, prazo, custo, sei, descricao) in enumerate(linhas_completas(), start=2):
        valores = [(titulo, 0), (status, 0), (prioridade, 0), (divisao, 0), (servidor, 0),
                   ((prazo - dt.date(1899, 12, 30)).days, 2), (custo or None, 4), (sei, 0), (descricao, 0)]
        linhas_xml.append(f'<row r="{n}">' + "".join(_celula(f"{_col(i)}{n}", v, e) for i, (v, e) in enumerate(valores)) + "</row>")

    larguras = [38, 30, 28, 40, 24, 14, 14, 22, 50]
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
<sheets><sheet name="Demandas" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Demandas!$A$1:$I$%d</definedName></definedNames>
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
    gerar_xlsx(os.path.join(PASTA, "demandas-dgeo.xlsx"))
    gerar_csv(os.path.join(PASTA, "demandas-dgeo.csv"))
    print("Gerados: exemplos/demandas-dgeo.xlsx e exemplos/demandas-dgeo.csv")
