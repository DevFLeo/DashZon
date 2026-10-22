// Dados de cada card do dashboard, prontos para desenhar no celular. É a
// mesma lógica do Card.jsx dos protótipos web (que copia a do oficial,
// frontend/js/dashboards.js, REGRA do CLAUDE.md): ordem dos grupos, limite de
// grupos, séries lado a lado até 2 e empilhadas acima disso, cores por
// identidade. Só o desenho é do celular. Sem React Native: testável no Node.
import { campoDe, descricao, fmtNumero, formatador, ordenar, rotuloChave, valorDe } from "@dashzon/core";

export const MAX_GRUPOS = 15;

// No celular os cards ficam empilhados na ordem da posição salva (y*12 + x),
// como no responsivo do oficial; número e meta estreitos (w <= 3) ocupam
// meia linha. O layout salvo não muda.
export function ordemDosCards(widgets) {
  return [...widgets].sort((a, b) => a.y * 12 + a.x - (b.y * 12 + b.x));
}
export const meiaLinha = (w) => w.w <= 3 && w.tipo === "kpi";

export function dadosNumero(d, modulo, moeda) {
  const cfg = d.config;
  const valor = cfg.agregacao === "contagem" ? d.total_count : cfg.agregacao === "media" ? d.total_avg : d.total_sum;
  const sinal = cfg.agregacao === "saldo" ? (valor >= 0 ? "positivo" : "negativo") : "";
  return { texto: formatador(cfg, modulo, moeda)(valor), sinal, descricao: descricao(cfg, modulo), cor: cfg.cor && !sinal ? cfg.cor : null };
}

// Meta: por mês/semana o servidor agrupa por dia e aqui somam-se só os dias
// do período atual (a mesma conta do renderMeta do oficial).
export function dadosMeta(d, modulo, moeda, hoje = new Date()) {
  const cfg = d.config;
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const hojeIso = iso(hoje);
  let inicio = null;
  let rotulo = "";
  if (cfg.periodo === "mes") { inicio = `${hojeIso.slice(0, 7)}-01`; rotulo = "deste mês"; }
  if (cfg.periodo === "semana") {
    const seg = new Date(hoje);
    seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));
    inicio = iso(seg);
    rotulo = "desta semana";
  }
  const dias = inicio ? d.result.filter((r) => r.key >= inicio && r.key <= hojeIso) : null;
  const soma = (k) => dias.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const valor = !dias ? (cfg.agregacao === "contagem" ? d.total_count : d.total_sum) : cfg.agregacao === "contagem" ? soma("count") : soma("sum");
  const fmt = formatador(cfg, modulo, moeda);
  const pct = Math.max(0, (valor / cfg.meta) * 100);
  return {
    valor: fmt(valor), meta: fmt(cfg.meta), pct, barra: Math.min(pct, 100),
    texto: cfg.meta > valor ? `Faltam ${fmt(cfg.meta - valor)} para a meta ${rotulo}` : `Meta ${rotulo} batida!`,
    porcento: `${fmtNumero(pct, 0)}%`
  };
}

export function dadosTabela(d, modulo, moeda) {
  const cfg = d.config;
  const grupo = campoDe(modulo, cfg.agrupar_por);
  const fmt = formatador(cfg, modulo, moeda);
  return {
    titulo: grupo ? grupo.nome : "Total",
    comValor: cfg.agregacao !== "contagem",
    linhas: ordenar(d.result, cfg, modulo).slice(0, 50).map((r) => ({
      chave: r.key, rotulo: rotuloChave(grupo, r.key, cfg.formato_grupo), qtd: fmtNumero(r.count, 0), valor: fmt(valorDe(cfg, r))
    }))
  };
}

// Barras e linha. `cores` = { corDe, corUnica } do tema (criarCores).
export function dadosGrafico(w, d, modulo, moeda, cores) {
  const cfg = d.config;
  const fmt = formatador(cfg, modulo, moeda);
  const grupo = campoDe(modulo, cfg.agrupar_por);
  const serie = campoDe(modulo, cfg.serie_por);
  const linhas = ordenar(d.result, cfg, modulo).slice(0, MAX_GRUPOS);
  const linha = w.tipo === "line";
  // Séries na ordem das opções do campo (Entrada antes de Saída), como no oficial.
  const ordemSerie = serie ? (serie.tipo === "movimento" ? ["entrada", "saida"] : serie.tipo === "booleano" ? ["true", "false"] : serie.opcoes || []) : [];
  const chaves = [...(d.series_keys || [])].sort((a, b) => (ordemSerie.indexOf(a) + 1 || 999) - (ordemSerie.indexOf(b) + 1 || 999));
  const porGrupo = !linha && grupo && grupo.tipo !== "data" && (cfg.paleta || Object.keys(cfg.cores || {}).length);
  const series = serie
    ? chaves.map((k, i) => ({ rotulo: rotuloChave(serie, k), cor: cores.corDe(cfg, serie, k, i), valores: linhas.map((r) => valorDe(cfg, r.series?.[k])) }))
    : [{ rotulo: w.titulo, cor: cores.corUnica(cfg), valores: linhas.map((r) => valorDe(cfg, r)),
        coresPorGrupo: porGrupo ? linhas.map((r, i) => cores.corDe(cfg, grupo, r.key, i)) : null }];
  const empilhar = !linha && !!serie && (d.series_keys || []).length > 2;
  const totais = linhas.map((_, i) => series.reduce((t, s) => t + (s.valores[i] || 0), 0));
  const maximo = Math.max(0, ...(empilhar ? totais : series.flatMap((s) => s.valores)));
  return {
    vazio: !d.total_count, linha, empilhar, fmt, maximo, series,
    rotulos: linhas.map((r) => rotuloChave(grupo, r.key, cfg.formato_grupo))
  };
}

export function dadosPizza(d, modulo, moeda, cores) {
  const cfg = d.config;
  const fmt = formatador(cfg, modulo, moeda);
  const grupo = campoDe(modulo, cfg.agrupar_por);
  const linhas = ordenar(d.result, cfg, modulo).filter((r) => valorDe(cfg, r) > 0).slice(0, MAX_GRUPOS);
  const escolhidas = cfg.paleta || Object.keys(cfg.cores || {}).length;
  const total = linhas.reduce((t, r) => t + valorDe(cfg, r), 0);
  return {
    grupo: grupo?.nome || "", total,
    fatias: linhas.map((r, i) => ({
      rotulo: rotuloChave(grupo, r.key, cfg.formato_grupo), valor: valorDe(cfg, r), texto: fmt(valorDe(cfg, r)),
      fracao: total ? valorDe(cfg, r) / total : 0,
      cor: escolhidas ? cores.corDe(cfg, grupo, r.key, i) : cores.serie(i)
    }))
  };
}

// Calendário (o mesmo do protótipo web): semanas que cabem, 4 níveis,
// meses, sequência atual e maior, melhor dia.
export function dadosCalendario(d, modulo, moeda, semanas, hoje = new Date()) {
  const cfg = d.config;
  const fmt = formatador(cfg, modulo, moeda);
  const valores = new Map(d.result.map((r) => [r.key, valorDe(cfg, r)]));
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const fim = new Date(hoje);
  fim.setHours(12, 0, 0, 0);
  const dia = new Date(fim);
  dia.setDate(fim.getDate() - fim.getDay() - (semanas - 1) * 7);
  const dias = [];
  for (; dia <= fim; dia.setDate(dia.getDate() + 1)) dias.push({ data: iso(dia), sem: dia.getDay(), v: valores.get(iso(dia)) || 0 });
  const max = Math.max(0, ...dias.map((x) => x.v));
  const nivel = (v) => (v <= 0 || !max ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  let atual = 0;
  for (let i = dias.length - 1 - (dias.at(-1)?.v > 0 ? 0 : 1); i >= 0 && dias[i].v > 0; i--) atual++;
  let maior = 0;
  let corrente = 0;
  dias.forEach((x) => { corrente = x.v > 0 ? corrente + 1 : 0; maior = Math.max(maior, corrente); });
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const meses = [];
  let anterior = -1;
  dias.forEach((x, i) => {
    if (x.sem !== 0) return;
    const mes = Number(x.data.slice(5, 7)) - 1;
    if (mes !== anterior && i > 0) meses.push({ coluna: Math.floor(i / 7), nome: MESES[mes] });
    anterior = mes;
  });
  const melhor = dias.reduce((m, x) => (x.v > (m?.v || 0) ? x : m), null);
  return {
    dias: dias.map((x) => ({ ...x, nivel: nivel(x.v), texto: x.v > 0 ? fmt(x.v) : "Nada" })), meses, atual, maior,
    ativos: dias.filter((x) => x.v > 0).length, total: fmt(dias.reduce((t, x) => t + x.v, 0)),
    melhor: melhor ? { data: melhor.data, texto: fmt(melhor.v) } : null
  };
}
