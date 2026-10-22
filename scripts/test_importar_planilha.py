"""Testes do importador de planilhas (só biblioteca padrão).

  python -m unittest discover -s scripts -p "test_*.py"
"""
import os
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)  # o Python "embeddable" não põe a pasta do script no path
import importar_planilha as ip  # noqa: E402

EXEMPLOS = os.path.join(AQUI, "..", "exemplos")
CAMPOS = [  # mesmo schema do módulo "demandas" (template gestao-demandas)
    {"id": "titulo_processo", "nome": "Título / Objeto", "tipo": "texto", "obrigatorio": True},
    {"id": "status_tramitacao", "nome": "Status da Tramitação", "tipo": "selecao", "obrigatorio": True,
     "opcoes": ["Aguardando Triagem", "Em Análise", "Análise Externa (Outras Secretarias)", "Deferido / Concluído", "Indeferido / Arquivado"]},
    {"id": "prioridade", "nome": "Prioridade", "tipo": "selecao", "obrigatorio": True,
     "opcoes": ["Baixa", "Média", "Alta", "Urgente (Prazo Legal / Judicial)"]},
    {"id": "divisao_responsavel", "nome": "Divisão Responsável", "tipo": "selecao", "obrigatorio": True,
     "opcoes": ["DCAD - Divisão de Cadastro (Dados)", "DTAD - Divisão de Tecnologia e Dados",
                "DASI - Divisão de Articulação com Secretarias", "DGEO - Gabinete do Diretor"]},
    {"id": "servidor_responsavel", "nome": "Servidor Responsável", "tipo": "selecao",
     "opcoes": ["Diretor(a) do DGEO", "Gerente da DCAD", "Gerente da DTAD", "Gerente da DASI", "Técnico Designado"]},
    {"id": "data_limite", "nome": "Prazo Legal (Vencimento)", "tipo": "data"},
    {"id": "orcamento_estimado", "nome": "Dotação / Custo Estimado", "tipo": "moeda"},
    {"id": "processo_sei", "nome": "Nº Processo SEI", "tipo": "texto"},
    {"id": "descricao_demanda", "nome": "Descrição do Pedido / Justificativa", "tipo": "texto_longo", "obrigatorio": True},
]
PRIMEIRA = {"titulo_processo": "Atualizar cadastro de escolas no mapa", "status_tramitacao": "Em Análise", "prioridade": "Alta",
            "divisao_responsavel": "DCAD - Divisão de Cadastro (Dados)", "servidor_responsavel": "Gerente da DCAD",
            "data_limite": "2026-10-15", "processo_sei": "6016.2026/0001001-1",
            "descricao_demanda": "Conferir endereços e coordenadas das unidades escolares."}


class ConversaoTest(unittest.TestCase):
    def campo(self, tipo, **extra):
        return {"id": "x", "nome": "X", "tipo": tipo, **extra}

    def test_data(self):
        c = self.campo("data")
        self.assertEqual(ip.converter(c, 46307.0), "2026-10-12")  # número de série do Excel
        self.assertEqual(ip.converter(c, "12/10/2026"), "2026-10-12")
        self.assertEqual(ip.converter(c, "2026-10-12"), "2026-10-12")
        self.assertEqual(ip.converter(c, "12/10/2026 08:00"), "2026-10-12")
        self.assertIsNone(ip.converter(c, ""))
        with self.assertRaises(ValueError):
            ip.converter(c, "31/02/2026")

    def test_hora(self):
        c = self.campo("hora")
        self.assertEqual(ip.converter(c, 0.8125), "19:30")  # fração do dia (célula de hora)
        self.assertEqual(ip.converter(c, 46307.5), "12:00")  # data e hora juntas: só a hora
        self.assertEqual(ip.converter(c, "8:05"), "08:05")
        self.assertEqual(ip.converter(c, "19h30"), "19:30")
        self.assertEqual(ip.converter(c, "7h"), "07:00")
        self.assertEqual(ip.converter(c, "08:30:00"), "08:30")
        for ruim in ("25:00", "10:75", "manhã"):
            with self.assertRaises(ValueError):
                ip.converter(c, ruim)

    def test_booleano(self):
        c = self.campo("booleano")
        for v in ("Sim", "SIM", "x", "✓", "verdadeiro", True, 1.0, "Concluído"):
            self.assertIs(ip.converter(c, v), True, v)
        for v in ("Não", "nao", "", None, False, 0.0, "pendente"):
            self.assertIs(ip.converter(c, v), False, v)
        with self.assertRaises(ValueError):
            ip.converter(c, "talvez")

    def test_numero_e_moeda(self):
        self.assertEqual(ip.converter(self.campo("numero"), 2.5), 2.5)
        self.assertEqual(ip.converter(self.campo("numero"), "1,5"), "1,5")  # a API entende o formato brasileiro
        self.assertEqual(ip.converter(self.campo("moeda"), "R$ 1.234,56"), "1.234,56")

    def test_selecao_sem_diferenciar_acento_e_maiusculas(self):
        c = self.campo("selecao", opcoes=["Matemática", "Português"])
        self.assertEqual(ip.converter(c, "matematica"), "Matemática")
        self.assertEqual(ip.converter(c, " PORTUGUÊS "), "Português")
        with self.assertRaises(ValueError):
            ip.converter(c, "Química")

    def test_texto_com_numero_do_excel(self):
        self.assertEqual(ip.converter(self.campo("texto"), 12.0), "12")


class LeituraTest(unittest.TestCase):
    def test_xlsx_de_exemplo(self):
        linhas = ip.ler_tabela(os.path.join(EXEMPLOS, "demandas-dgeo.xlsx"))
        self.assertEqual(linhas[0][:3], ["Título / Objeto", "Status da Tramitação", "Prioridade"])
        registros, erros, ignoradas = ip.montar_registros(linhas, CAMPOS)
        self.assertEqual((len(registros), erros, ignoradas), (8, [], []))
        self.assertEqual(registros[0], (2, PRIMEIRA))
        self.assertEqual(registros[3][1]["orcamento_estimado"], 18500.0)

    def test_csv_de_exemplo_da_o_mesmo_que_o_xlsx(self):
        xlsx, _, _ = ip.montar_registros(ip.ler_tabela(os.path.join(EXEMPLOS, "demandas-dgeo.xlsx")), CAMPOS)
        csv_, erros, _ = ip.montar_registros(ip.ler_tabela(os.path.join(EXEMPLOS, "demandas-dgeo.csv")), CAMPOS)
        self.assertEqual(erros, [])
        # O CSV traz o custo como texto ("18500,00"); o resto é igual.
        valor = lambda v: v if isinstance(v, float) else float(v.replace(".", "").replace(",", "."))
        normal = lambda regs: [(n, {**r, **({"orcamento_estimado": valor(r["orcamento_estimado"])} if "orcamento_estimado" in r else {})})
                               for n, r in regs]
        self.assertEqual(normal(csv_), normal(xlsx))

    def test_csv_com_virgula_cp1252_linhas_vazias_e_erros(self):
        conteudo = ("Título / Objeto,Prioridade,Status da Tramitação,Divisão Responsável,Descrição do Pedido / Justificativa,Prazo Legal (Vencimento),Coluna extra\n"
                    "Mapa de escolas,alta,em analise,DCAD - Divisão de Cadastro (Dados),Atualizar,01/11/2026,a\n,,,,,,\n"
                    "Sem prioridade,,Em Análise,DTAD - Divisão de Tecnologia e Dados,X,02/11/2026,b\n"
                    "Data errada,Baixa,Em Análise,DTAD - Divisão de Tecnologia e Dados,X,31/02/2026,c\n")
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="cp1252", newline="") as f:
            f.write(conteudo)
        try:
            registros, erros, ignoradas = ip.montar_registros(ip.ler_tabela(f.name), CAMPOS)
        finally:
            os.unlink(f.name)
        self.assertEqual(ignoradas, ["Coluna extra"])
        # Seleção sem diferenciar acento e maiúsculas ("em analise" -> "Em Análise").
        # "Sem prioridade" passa aqui e é recusada pela API (campo obrigatório).
        self.assertEqual(registros, [
            (2, {"titulo_processo": "Mapa de escolas", "prioridade": "Alta", "status_tramitacao": "Em Análise",
                 "divisao_responsavel": "DCAD - Divisão de Cadastro (Dados)", "descricao_demanda": "Atualizar", "data_limite": "2026-11-01"}),
            (4, {"titulo_processo": "Sem prioridade", "status_tramitacao": "Em Análise",
                 "divisao_responsavel": "DTAD - Divisão de Tecnologia e Dados", "descricao_demanda": "X", "data_limite": "2026-11-02"})])
        self.assertEqual([n for n, _ in erros], [5])  # data que não existe; a linha 3 (vazia) é pulada

    def test_falta_coluna_obrigatoria(self):
        with self.assertRaisesRegex(ip.ErroPlanilha, "Prioridade"):
            ip.montar_registros([["Título / Objeto"], ["a"]], CAMPOS)

    def test_nenhuma_coluna_reconhecida(self):
        with self.assertRaisesRegex(ip.ErroPlanilha, "Nenhuma coluna"):
            ip.montar_registros([["foo", "bar"], [1, 2]], CAMPOS)

    def test_formato_nao_suportado(self):
        with self.assertRaisesRegex(ip.ErroPlanilha, "não suportado"):
            ip.ler_tabela("planilha.ods")

    def test_xls_antigo_com_extensao_xlsx(self):
        with tempfile.NamedTemporaryFile("wb", suffix=".xlsx", delete=False) as f:
            f.write(b"\xd0\xcf\x11\xe0 nao e zip")
        try:
            with self.assertRaisesRegex(ip.ErroPlanilha, "xlsx válido"):
                ip.ler_tabela(f.name)
        finally:
            os.unlink(f.name)


if __name__ == "__main__":
    unittest.main()
