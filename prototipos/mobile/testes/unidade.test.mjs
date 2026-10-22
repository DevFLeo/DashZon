// Testes de unidade do app (Node, sem celular nem navegador):
//   npm run teste:unidade
// Cobrem o que não depende de tela: formatos, dados dos cards, temas e cores.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { criarCores, temaEfetivo, TOKENS, TEMAS, PROXIMO } from "@dashzon/core";
import { horaTexto, lerHora, normalizarServidor, numeroParaTela, paraIso, paraTela } from "../src/formatos.js";
import { MAX_GRUPOS, dadosCalendario, dadosGrafico, dadosMeta, dadosNumero, dadosPizza, dadosTabela, meiaLinha, ordemDosCards } from "../src/graficos.js";

// Um módulo no formato da API (/api/modulos), como o Lançamentos do template.
const MODULO = {
  slug: "lancamentos",
  schema: {
    campos: [
      { id: "descricao", nome: "Descrição", tipo: "texto" },
      { id: "tipo", nome: "Tipo", tipo: "movimento" },
      { id: "valor", nome: "Valor", tipo: "moeda" },
      { id: "categoria", nome: "Categoria", tipo: "selecao", opcoes: ["Moradia", "Alimentação", "Transporte"] },
      { id: "data", nome: "Data", tipo: "data" },
      { id: "pago", nome: "Pago", tipo: "booleano" }
    ]
  }
};
const tema = TOKENS.claro;
const CORES = { ...criarCores((n) => tema[n]), serie: (i) => tema[`--series-${(i % 8) + 1}`] };
const limpar = (t) => t.replace(/ /g, " ");

describe("formatos", () => {
  test("datas entre a tela (DD/MM/AAAA) e o servidor (AAAA-MM-DD)", () => {
    assert.equal(paraTela("2026-10-22"), "22/10/2026");
    assert.equal(paraTela("2026-10-22T10:00:00Z"), "22/10/2026");
    assert.equal(paraTela(null), "");
    assert.equal(paraIso("22/10/2026"), "2026-10-22");
    assert.equal(paraIso("2/3/2026"), "2026-03-02");
    assert.equal(paraIso("2026-10-22"), "2026-10-22", "já no formato do servidor: passa como está");
  });
  test("número na tela com vírgula", () => {
    assert.equal(numeroParaTela(123.45), "123,45");
    assert.equal(numeroParaTela(0), "0");
    assert.equal(numeroParaTela(null), "");
  });
  test("endereço do servidor", () => {
    assert.equal(normalizarServidor("dashzon.duckdns.org"), "https://dashzon.duckdns.org");
    assert.equal(normalizarServidor(" https://x.org/ "), "https://x.org");
    assert.equal(normalizarServidor("http://192.168.0.10:4567"), "http://192.168.0.10:4567");
    assert.equal(normalizarServidor(""), "");
  });
  test("hora do lembrete", () => {
    assert.deepEqual(lerHora("20:00"), { hora: 20, minuto: 0 });
    assert.deepEqual(lerHora("8:5"), { hora: 8, minuto: 5 });
    assert.deepEqual(lerHora("20h"), { hora: 20, minuto: 0 });
    assert.equal(lerHora("24:00"), null);
    assert.equal(lerHora("12:60"), null);
    assert.equal(lerHora("abc"), null);
    assert.equal(horaTexto({ hora: 8, minuto: 5 }), "08:05");
  });
});

describe("temas e cores", () => {
  test("todo tema tem os tokens que o app usa", () => {
    const usados = ["fundo", "superficie", "borda", "hover", "texto", "texto-2", "texto-fraco", "destaque", "destaque-tinta", "bom", "ruim"];
    for (const id of Object.keys(TOKENS)) {
      for (const t of usados) assert.match(TOKENS[id][`--${t}`], /^#[0-9a-f]{6}$/i, `${id} --${t}`);
      for (let i = 1; i <= 8; i++) assert.ok(TOKENS[id][`--series-${i}`], `${id} --series-${i}`);
    }
  });
  test("os temas da tela são os da conta, e o botão gira na família", () => {
    assert.deepEqual(TEMAS.map((t) => t.id), ["sistema", "claro", "suave", "escuro", "floresta_dia", "floresta_tarde", "floresta_noite"]);
    assert.equal(PROXIMO.floresta_noite, "floresta_dia");
    assert.equal(PROXIMO.escuro, "claro");
  });
  test("'sistema' segue o aparelho", () => {
    assert.equal(temaEfetivo("sistema", true), "escuro");
    assert.equal(temaEfetivo("sistema", false), "claro");
    assert.equal(temaEfetivo("floresta_tarde", true), "floresta_tarde");
    assert.equal(temaEfetivo("inexistente", false), "claro");
  });
  test("entrada e saída: série 1 e série 8 do tema; cor escolhida vence", () => {
    const mov = MODULO.schema.campos[1];
    assert.equal(CORES.corDe({}, mov, "entrada"), tema["--series-1"]);
    assert.equal(CORES.corDe({}, mov, "saida"), tema["--series-8"]);
    assert.equal(CORES.corDe({ cores: { saida: "#123456" } }, mov, "saida"), "#123456");
    assert.equal(CORES.corUnica({ cor: "#abcdef" }), "#abcdef");
  });
});

describe("cards do dashboard", () => {
  test("ordem pela posição salva (y*12 + x) e meia linha só para número estreito", () => {
    const w = [{ id: 1, x: 6, y: 0, w: 3, tipo: "kpi" }, { id: 2, x: 0, y: 2, w: 12, tipo: "bar" }, { id: 3, x: 0, y: 0, w: 3, tipo: "kpi" }];
    assert.deepEqual(ordemDosCards(w).map((x) => x.id), [3, 1, 2]);
    assert.equal(meiaLinha(w[0]), true);
    assert.equal(meiaLinha({ w: 3, tipo: "pie" }), false);
  });
  test("número e saldo com sinal", () => {
    const d = { config: { agregacao: "saldo", campo: "valor" }, total_sum: -50, total_count: 2 };
    const n = dadosNumero(d, MODULO, "BRL");
    assert.equal(n.sinal, "negativo");
    assert.equal(limpar(n.texto), "-R$ 50,00");
  });
  test("barras: séries na ordem das opções, lado a lado até 2", () => {
    const d = {
      config: { agregacao: "soma", campo: "valor", agrupar_por: "categoria", serie_por: "tipo" }, total_count: 3,
      series_keys: ["saida", "entrada"],
      result: [
        { key: "Transporte", count: 1, sum: 30, series: { saida: { count: 1, sum: 30 } } },
        { key: "Moradia", count: 2, sum: 100, series: { entrada: { count: 1, sum: 60 }, saida: { count: 1, sum: 40 } } }
      ]
    };
    const g = dadosGrafico({ tipo: "bar", titulo: "x" }, d, MODULO, "BRL", CORES);
    assert.deepEqual(g.series.map((s) => s.rotulo), ["Entrada", "Saída"], "Entrada antes de Saída");
    assert.deepEqual(g.rotulos, ["Moradia", "Transporte"], "grupos na ordem das opções do campo");
    assert.equal(g.empilhar, false);
    assert.deepEqual(g.series[1].valores, [40, 30]);
    assert.equal(g.maximo, 60);
  });
  test("barras: mais de 2 séries empilham; no máximo 15 grupos", () => {
    const result = Array.from({ length: 20 }, (_, i) => ({ key: `g${i}`, count: 1, sum: i, series: { a: { count: 1, sum: 1 }, b: { count: 1, sum: 2 }, c: { count: 1, sum: 3 } } }));
    const mod = { schema: { campos: [{ id: "g", nome: "G", tipo: "texto" }, { id: "s", nome: "S", tipo: "selecao", opcoes: ["a", "b", "c"] }, { id: "v", nome: "V", tipo: "numero" }] } };
    const g = dadosGrafico({ tipo: "bar", titulo: "x" }, { config: { agregacao: "soma", campo: "v", agrupar_por: "g", serie_por: "s" }, total_count: 20, series_keys: ["a", "b", "c"], result }, mod, "BRL", CORES);
    assert.equal(g.empilhar, true);
    assert.equal(g.rotulos.length, MAX_GRUPOS);
    assert.equal(g.maximo, 6, "empilhado: o máximo é a soma das séries");
  });
  test("linha nunca empilha", () => {
    const d = { config: { agregacao: "contagem", agrupar_por: "data", formato_grupo: "mes" }, total_count: 2, result: [{ key: "2026-09", count: 1 }, { key: "2026-10", count: 1 }] };
    const g = dadosGrafico({ tipo: "line", titulo: "x" }, d, MODULO, "BRL", CORES);
    assert.equal(g.linha, true);
    assert.equal(g.empilhar, false);
    assert.deepEqual(g.rotulos, ["set/26", "out/26"]);
  });
  test("tabela e rosca", () => {
    const d = { config: { agregacao: "soma", campo: "valor", agrupar_por: "categoria" }, total_count: 3, result: [{ key: "Moradia", count: 2, sum: 75 }, { key: "Alimentação", count: 1, sum: 25 }, { key: "Transporte", count: 0, sum: 0 }] };
    const t = dadosTabela(d, MODULO, "BRL");
    assert.equal(t.titulo, "Categoria");
    assert.equal(limpar(t.linhas[0].valor), "R$ 75,00");
    const p = dadosPizza(d, MODULO, "BRL", CORES);
    assert.equal(p.fatias.length, 2, "fatia zerada sai");
    assert.equal(p.fatias.reduce((s, f) => s + f.fracao, 0), 1);
    assert.equal(p.fatias[0].fracao, 0.75);
  });
  test("meta do mês soma só os dias do mês atual", () => {
    const hoje = new Date(2026, 9, 22);
    const d = { config: { agregacao: "soma", campo: "valor", meta: 100, periodo: "mes" }, total_sum: 999, total_count: 3,
      result: [{ key: "2026-09-30", sum: 50, count: 1 }, { key: "2026-10-01", sum: 30, count: 1 }, { key: "2026-10-22", sum: 20, count: 1 }] };
    const m = dadosMeta(d, MODULO, "BRL", hoje);
    assert.equal(Math.round(m.pct), 50);
    assert.match(limpar(m.texto), /Faltam R\$ 50,00 para a meta deste mês/);
  });
  test("calendário: sequências e melhor dia", () => {
    const hoje = new Date(2026, 9, 22, 12);
    const d = { config: { agregacao: "soma", campo: "valor" }, result: [{ key: "2026-10-20", sum: 1 }, { key: "2026-10-21", sum: 3 }, { key: "2026-10-15", sum: 2 }] };
    const c = dadosCalendario(d, MODULO, "BRL", 8, hoje);
    assert.equal(c.atual, 2, "hoje ainda zerado conta até ontem");
    assert.equal(c.maior, 2);
    assert.equal(c.ativos, 3);
    assert.equal(c.melhor.data, "2026-10-21");
    assert.equal(c.dias.at(-1).data, "2026-10-22");
    assert.equal(c.dias.length % 7, 5, "a semana atual vai até hoje (quinta)");
  });
});
