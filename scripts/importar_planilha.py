#!/usr/bin/env python3
"""Importa uma planilha (Excel .xlsx ou .csv) para um módulo do DashZon.

Cada linha da planilha vira um registro. A primeira linha é o cabeçalho: cada
coluna é ligada ao campo do módulo com o mesmo nome ou id (sem diferenciar
maiúsculas, acentos e espaços; "Duração (horas)" casa com "duracao_horas" ou
"Duração (horas)"). Colunas que não batem com nenhum campo são ignoradas, com
aviso.

Os registros entram pela API do DashZon, como se fossem digitados na tela: a
mesma validação vale, e nada toca o banco diretamente.

Só usa a biblioteca padrão do Python 3.8+ (o .xlsx é lido como zip + XML).
Arquivos .xls (Excel antigo) não são lidos: salve como .xlsx ou .csv.

Exemplos:
  python scripts/importar_planilha.py exemplos/cronograma-estudos.xlsx --modulo cronograma_estudos --usuario dono
  python scripts/importar_planilha.py exemplos/cronograma-estudos.csv --modulo cronograma_estudos --usuario dono --simular

A senha vem de DASHZON_SENHA ou é perguntada (não aparece na tela).
"""
import argparse
import csv
import datetime as dt
import getpass
import http.cookiejar
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}
# Dia 0 do Excel no sistema 1900 (já descontando o 29/02/1900 que não existiu).
EPOCA_EXCEL = dt.date(1899, 12, 30)
VERDADEIROS = {"sim", "s", "x", "true", "verdadeiro", "1", "yes", "y", "ok", "feito", "concluido", "estudado", "✓", "✔"}
FALSOS = {"nao", "n", "false", "falso", "0", "no", "", "-", "pendente"}


class ErroPlanilha(Exception):
    """Problema no arquivo ou no mapeamento (mensagem para a pessoa)."""


# ------------------------------------------------------------ leitura ----

def chave(texto):
    """'Duração (horas)' -> 'duracaohoras': compara cabeçalhos sem acento/espaço."""
    t = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", t)


def _coluna(ref):
    """'AB12' -> 27 (índice da coluna, começando em 0)."""
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _texto_rico(no):
    return "".join(t.text or "" for t in no.iter(f"{{{NS['m']}}}t"))


def ler_xlsx(caminho, aba=None):
    """Linhas (listas de valores) de uma aba do .xlsx: texto, número (float) ou bool."""
    try:
        z = zipfile.ZipFile(caminho)
    except zipfile.BadZipFile:
        raise ErroPlanilha(f"{caminho} não é um .xlsx válido (arquivo .xls antigo? salve como .xlsx ou .csv)")
    with z:
        livro = ET.fromstring(z.read("xl/workbook.xml"))
        abas = [(s.get("name"), s.get(f"{{{NS['r']}}}id")) for s in livro.find("m:sheets", NS)]
        if not abas:
            raise ErroPlanilha("A planilha não tem nenhuma aba")
        if aba is None:
            nome, rid = abas[0]
        else:
            achadas = [a for a in abas if a[0] == aba] or ([abas[int(aba) - 1]] if str(aba).isdigit() and 0 < int(aba) <= len(abas) else [])
            if not achadas:
                raise ErroPlanilha(f"Aba '{aba}' não encontrada. Abas: {', '.join(a[0] for a in abas)}")
            nome, rid = achadas[0]

        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        alvo = next(r.get("Target") for r in rels.findall("pr:Relationship", NS) if r.get("Id") == rid)
        caminho_aba = alvo.lstrip("/") if alvo.startswith("/") else "xl/" + alvo

        compartilhados = []
        if "xl/sharedStrings.xml" in z.namelist():
            sst = ET.fromstring(z.read("xl/sharedStrings.xml"))
            compartilhados = [_texto_rico(si) for si in sst.findall("m:si", NS)]

        folha = ET.fromstring(z.read(caminho_aba))
        linhas = {}
        for row in folha.iter(f"{{{NS['m']}}}row"):
            num = int(row.get("r"))
            valores = {}
            for c in row.findall("m:c", NS):
                tipo = c.get("t")
                v = c.find("m:v", NS)
                if tipo == "inlineStr":
                    valor = _texto_rico(c.find("m:is", NS))
                elif v is None or v.text is None:
                    continue
                elif tipo == "s":
                    valor = compartilhados[int(v.text)]
                elif tipo == "b":
                    valor = v.text == "1"
                elif tipo in ("str", "e"):
                    valor = v.text
                else:
                    valor = float(v.text)
                valores[_coluna(c.get("r"))] = valor
            if valores:
                largura = max(valores) + 1
                linhas[num] = [valores.get(i) for i in range(largura)]
        if not linhas:
            return []
        # Linhas vazias no meio continuam no lugar (numeração igual à do Excel).
        return [linhas.get(n, []) for n in range(1, max(linhas) + 1)]


def ler_csv(caminho):
    """Linhas de um .csv (separador ; , ou tab; UTF-8 ou o padrão do Excel no Windows)."""
    for codificacao in ("utf-8-sig", "cp1252"):
        try:
            with open(caminho, encoding=codificacao, newline="") as f:
                texto = f.read()
            break
        except UnicodeDecodeError:
            continue
    try:
        dialeto = csv.Sniffer().sniff(texto[:4096], delimiters=";,\t")
    except csv.Error:
        dialeto = csv.excel
    return [[(v if v.strip() != "" else None) for v in linha] for linha in csv.reader(texto.splitlines(), dialeto)]


def ler_tabela(caminho, aba=None):
    ext = os.path.splitext(caminho)[1].lower()
    if ext in (".xlsx", ".xlsm"):
        return ler_xlsx(caminho, aba)
    if ext in (".csv", ".txt"):
        return ler_csv(caminho)
    raise ErroPlanilha(f"Formato '{ext}' não suportado: use .xlsx ou .csv")


# --------------------------------------------------------- conversão ----

def _numero_texto(v):
    """1.0 -> '1'; 2.5 -> '2.5' (número do Excel que vai para um campo de texto)."""
    return str(int(v)) if isinstance(v, float) and v.is_integer() else str(v)


def converter(campo, v):
    """Valor da planilha -> valor que a API espera para o tipo do campo.

    Devolve None para célula vazia. Levanta ValueError com a explicação quando
    não dá para converter (a linha é pulada e entra no relatório).
    """
    if v is None or (isinstance(v, str) and v.strip() == ""):
        return False if campo["tipo"] == "booleano" else None
    tipo = campo["tipo"]

    if tipo == "booleano":
        if isinstance(v, bool):
            return v
        if isinstance(v, float):
            return v != 0
        k = chave(v) if v.strip() not in ("✓", "✔") else v.strip()
        if k in VERDADEIROS:
            return True
        if k in FALSOS:
            return False
        raise ValueError(f"'{v}' não é sim/não")

    if tipo == "data":
        if isinstance(v, float):
            return (EPOCA_EXCEL + dt.timedelta(days=int(v))).isoformat()
        s = v.strip()
        for formato in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y"):
            try:
                return dt.datetime.strptime(s[:10] if formato == "%Y-%m-%d" else s.split()[0], formato).date().isoformat()
            except ValueError:
                pass
        raise ValueError(f"'{v}' não é uma data (use DD/MM/AAAA ou AAAA-MM-DD)")

    if tipo == "hora":
        if isinstance(v, float):
            minutos = round((v % 1) * 24 * 60) % (24 * 60)
            return f"{minutos // 60:02d}:{minutos % 60:02d}"
        m = re.fullmatch(r"\s*(\d{1,2})\s*[:hH]\s*(\d{2})?(?::\d{2})?\s*", v)
        if not m or int(m.group(1)) > 23 or int(m.group(2) or 0) > 59:
            raise ValueError(f"'{v}' não é um horário (use HH:MM)")
        return f"{int(m.group(1)):02d}:{int(m.group(2) or 0):02d}"

    if tipo in ("numero", "moeda"):
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return v
        # "R$ 1.234,56" -> "1.234,56": a API entende o formato brasileiro.
        return re.sub(r"[^\d,.\-+eE]", "", v)

    if tipo in ("selecao", "movimento"):
        texto = _numero_texto(v).strip()
        for opcao in campo.get("opcoes", []):
            if chave(opcao) == chave(texto):
                return opcao
        raise ValueError(f"'{texto}' não está entre as opções de {campo['nome']}: {', '.join(campo.get('opcoes', []))}")

    return _numero_texto(v).strip() if isinstance(v, float) else str(v).strip()


def mapear_colunas(cabecalho, campos):
    """Índice da coluna -> campo. Devolve (mapa, colunas ignoradas)."""
    por_chave = {}
    for c in campos:
        por_chave.setdefault(chave(c["id"]), c)
        por_chave.setdefault(chave(c["nome"]), c)
    mapa, ignoradas, usados = {}, [], set()
    for i, titulo in enumerate(cabecalho):
        if titulo is None or str(titulo).strip() == "":
            continue
        c = por_chave.get(chave(titulo))
        if c and c["id"] not in usados:
            mapa[i] = c
            usados.add(c["id"])
        else:
            ignoradas.append(str(titulo))
    return mapa, ignoradas


def montar_registros(linhas, campos, linha_cabecalho=1):
    """[(número da linha no arquivo, registro)], [(número, erro)], colunas ignoradas."""
    if len(linhas) < linha_cabecalho:
        raise ErroPlanilha("A planilha está vazia")
    cabecalho = linhas[linha_cabecalho - 1]
    mapa, ignoradas = mapear_colunas(cabecalho, campos)
    if not mapa:
        nomes = ", ".join(c["nome"] for c in campos)
        raise ErroPlanilha(f"Nenhuma coluna do cabeçalho bate com os campos do módulo ({nomes})")
    faltando = [c["nome"] for c in campos if c.get("obrigatorio") and c["id"] not in {x["id"] for x in mapa.values()}
                and c.get("padrao") in (None, "")]
    if faltando:
        raise ErroPlanilha(f"Faltam colunas obrigatórias: {', '.join(faltando)}")

    registros, erros = [], []
    for n, linha in enumerate(linhas[linha_cabecalho:], start=linha_cabecalho + 1):
        celulas = {i: (linha[i] if i < len(linha) else None) for i in mapa}
        if all(v is None or (isinstance(v, str) and not v.strip()) for v in celulas.values()):
            continue  # linha em branco
        registro, problemas = {}, []
        for i, campo in mapa.items():
            try:
                valor = converter(campo, celulas[i])
            except ValueError as e:
                problemas.append(str(e))
                continue
            # Vazio fica de fora: a API aplica o padrão do campo (ex.: $hoje).
            if valor is not None:
                registro[campo["id"]] = valor
        if problemas:
            erros.append((n, "; ".join(problemas)))
        else:
            registros.append((n, registro))
    return registros, erros, ignoradas


# ----------------------------------------------------------------- API ----

class Cliente:
    """Sessão HTTP com cookie, no mesmo formato JSON que a tela usa."""

    def __init__(self, base):
        self.base = base.rstrip("/")
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def pedir(self, metodo, caminho, corpo=None):
        dados = json.dumps(corpo).encode("utf-8") if corpo is not None else (b"{}" if metodo != "GET" else None)
        req = urllib.request.Request(self.base + caminho, data=dados, method=metodo,
                                     headers={"Content-Type": "application/json", "Accept": "application/json"})
        try:
            with self.http.open(req, timeout=60) as r:
                return r.status, json.loads(r.read().decode("utf-8") or "null")
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read().decode("utf-8"))
            except ValueError:
                return e.code, {"error": f"HTTP {e.code}"}
        except urllib.error.URLError as e:
            raise ErroPlanilha(f"Não consegui falar com o DashZon em {self.base} ({e.reason}). Ele está no ar?")

    def entrar(self, usuario, senha):
        st, r = self.pedir("POST", "/api/login", {"usuario": usuario, "senha": senha})
        if st != 200:
            raise ErroPlanilha(f"Login recusado: {r.get('error', st)}")
        if r.get("usuario", {}).get("deve_trocar_senha"):
            raise ErroPlanilha("Este usuário está com senha temporária: entre pela tela e crie a senha antes.")

    def modulo(self, slug):
        st, r = self.pedir("GET", f"/api/modulos/{urllib.parse.quote(slug)}")
        if st != 200:
            _, mods = self.pedir("GET", "/api/modulos")
            lista = ", ".join(m["slug"] for m in mods) if isinstance(mods, list) else "?"
            raise ErroPlanilha(f"Módulo '{slug}' não encontrado. Módulos: {lista}")
        return r


# ------------------------------------------------------------- comando ----

def main(argv=None):
    p = argparse.ArgumentParser(description="Importa uma planilha (.xlsx ou .csv) para um módulo do DashZon.")
    p.add_argument("arquivo", help="planilha .xlsx ou .csv (primeira linha = cabeçalho)")
    p.add_argument("--modulo", required=True, help="identificador do módulo (ex.: cronograma_estudos)")
    p.add_argument("--url", default=os.environ.get("DASHZON_URL", "http://127.0.0.1:4567"), help="endereço do DashZon")
    p.add_argument("--usuario", default=os.environ.get("DASHZON_USUARIO"), help="login (ou DASHZON_USUARIO)")
    p.add_argument("--aba", help="nome ou número da aba do .xlsx (padrão: a primeira)")
    p.add_argument("--linha-cabecalho", type=int, default=1, help="linha do cabeçalho (padrão: 1)")
    p.add_argument("--simular", action="store_true", help="só lê e confere, sem gravar nada")
    a = p.parse_args(argv)

    try:
        if not os.path.exists(a.arquivo):
            raise ErroPlanilha(f"Arquivo não encontrado: {a.arquivo}")
        if not a.usuario:
            raise ErroPlanilha("Informe o login com --usuario (ou DASHZON_USUARIO)")
        senha = os.environ.get("DASHZON_SENHA") or getpass.getpass(f"Senha de {a.usuario}: ")

        cli = Cliente(a.url)
        cli.entrar(a.usuario, senha)
        modulo = cli.modulo(a.modulo)
        campos = modulo["schema"]["campos"]
        linhas = ler_tabela(a.arquivo, a.aba)
        registros, erros, ignoradas = montar_registros(linhas, campos, a.linha_cabecalho)

        print(f"Módulo: {modulo['nome']} · {len(registros)} linha(s) prontas, {len(erros)} com problema")
        if ignoradas:
            print(f"Colunas ignoradas (não são campos do módulo): {', '.join(ignoradas)}")

        if a.simular:
            for n, r in registros[:5]:
                print(f"  linha {n}: {json.dumps(r, ensure_ascii=False)}")
            if len(registros) > 5:
                print(f"  ... e mais {len(registros) - 5}")
        else:
            gravados = 0
            for n, r in registros:
                st, resp = cli.pedir("POST", f"/api/modulos/{a.modulo}/registros", r)
                if st == 201:
                    gravados += 1
                else:
                    erros.append((n, resp.get("error", f"HTTP {st}") if isinstance(resp, dict) else f"HTTP {st}"))
            print(f"Importados: {gravados}")

        sys.stdout.flush()  # o resumo sai antes da lista de erros (stderr)
        for n, msg in sorted(erros):
            print(f"  linha {n}: {msg}", file=sys.stderr)
        return 1 if erros else 0
    except ErroPlanilha as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
