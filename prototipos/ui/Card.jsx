"use client";
// Um card do dashboard, desenhado a partir de GET /api/widgets/:id/data.
// Mesmos tipos do oficial: número (com ou sem meta), barras, linha, pizza,
// tabela e calendário.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { Api, campoDe, corDe, corUnica, cssVar, descricao, fmtData, fmtNumero, formatador, ordenar, rotuloChave, valorDe } from "./logica.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend);
const MAX_GRUPOS = 15;

function Numero({ d, modulo, moeda }) {
  const cfg = d.config;
  const valor = cfg.agregacao === "contagem" ? d.total_count : cfg.agregacao === "media" ? d.total_avg : d.total_sum;
  const sinal = cfg.agregacao === "saldo" ? (valor >= 0 ? "positivo" : "negativo") : "";
  return (
    <>
      <div className={`card-numero ${sinal}`} style={cfg.cor && !sinal ? { color: cfg.cor } : undefined}>{formatador(cfg, modulo, moeda)(valor)}</div>
      <div className="card-sub">{descricao(cfg, modulo)}</div>
    </>
  );
}

function Meta({ d, modulo, moeda }) {
  const cfg = d.config;
  const hoje = new Date().toISOString().slice(0, 10);
  let inicio = null;
  let rotulo = "";
  if (cfg.periodo === "mes") { inicio = `${hoje.slice(0, 7)}-01`; rotulo = "deste mês"; }
  if (cfg.periodo === "semana") {
    const seg = new Date();
    seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));
    inicio = seg.toISOString().slice(0, 10);
    rotulo = "desta semana";
  }
  const dias = inicio ? d.result.filter((r) => r.key >= inicio && r.key <= hoje) : null;
  const soma = (k) => dias.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const valor = !dias ? (cfg.agregacao === "contagem" ? d.total_count : d.total_sum) : cfg.agregacao === "contagem" ? soma("count") : soma("sum");
  const fmt = formatador(cfg, modulo, moeda);
  const pct = Math.max(0, (valor / cfg.meta) * 100);
  const cor = corUnica(cfg);
  return (
    <div className="card-meta">
      <div><span className="card-numero" style={{ color: cor }}>{fmt(valor)}</span> <span className="card-sub">de {fmt(cfg.meta)}</span></div>
      <div className="meta-barra" role="progressbar" aria-valuenow={Math.round(Math.min(pct, 100))} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${Math.min(pct, 100)}%`, background: cor }} />
      </div>
      <div className="card-sub">{cfg.meta > valor ? <>Faltam <strong>{fmt(cfg.meta - valor)}</strong> para a meta {rotulo}</> : `Meta ${rotulo} batida!`} · {fmtNumero(pct, 0)}%</div>
    </div>
  );
}

function Tabela({ d, modulo, moeda }) {
  const cfg = d.config;
  const grupo = campoDe(modulo, cfg.agrupar_por);
  const fmt = formatador(cfg, modulo, moeda);
  const linhas = ordenar(d.result, cfg, modulo).slice(0, 50);
  if (!d.total_count) return <div className="card-sub">Sem dados</div>;
  return (
    <table className="tabela">
      <thead><tr><th>{grupo ? grupo.nome : "Total"}</th><th className="num">Qtd.</th>{cfg.agregacao !== "contagem" && <th className="num">Valor</th>}</tr></thead>
      <tbody>
        {linhas.map((r) => (
          <tr key={r.key}>
            <td>{rotuloChave(grupo, r.key, cfg.formato_grupo)}</td>
            <td className="num">{fmtNumero(r.count, 0)}</td>
            {cfg.agregacao !== "contagem" && <td className="num">{fmt(valorDe(cfg, r))}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Grafico({ w, d, modulo, moeda }) {
  const cfg = d.config;
  const fmt = formatador(cfg, modulo, moeda);
  const grupo = campoDe(modulo, cfg.agrupar_por);
  const serie = campoDe(modulo, cfg.serie_por);
  const linhas = ordenar(d.result, cfg, modulo).slice(0, MAX_GRUPOS);
  if (!d.total_count) return <div className="card-sub">Sem dados</div>;
  const labels = linhas.map((r) => rotuloChave(grupo, r.key, cfg.formato_grupo));
  const linha = w.tipo === "line";
  const estilo = (cor) => (linha
    ? { borderColor: cor, backgroundColor: cor, borderWidth: 2.5, cubicInterpolationMode: "monotone", pointRadius: 3 }
    : { backgroundColor: cor, borderRadius: 6, maxBarThickness: 36 });
  // Séries na ordem das opções do campo (como o oficial: Entrada antes de Saída).
  const ordemSerie = serie ? (serie.tipo === "movimento" ? ["entrada", "saida"] : serie.tipo === "booleano" ? ["true", "false"] : serie.opcoes || []) : [];
  const chaves = [...(d.series_keys || [])].sort((a, b) => (ordemSerie.indexOf(a) + 1 || 999) - (ordemSerie.indexOf(b) + 1 || 999));
  const datasets = serie
    ? chaves.map((k, i) => ({ label: rotuloChave(serie, k), data: linhas.map((r) => valorDe(cfg, r.series?.[k])), ...estilo(corDe(cfg, serie, k, i)) }))
    : [{ label: w.titulo, data: linhas.map((r) => valorDe(cfg, r)),
        ...estilo(!linha && grupo && grupo.tipo !== "data" && (cfg.paleta || Object.keys(cfg.cores || {}).length)
          ? linhas.map((r, i) => corDe(cfg, grupo, r.key, i)) : corUnica(cfg)) }];
  const empilhar = !linha && serie && d.series_keys.length > 2;
  const muted = cssVar("--texto-fraco");
  const opcoes = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: datasets.length > 1, position: "bottom", labels: { usePointStyle: true, boxWidth: 8, color: cssVar("--texto-2") } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } }
    },
    scales: {
      x: { stacked: empilhar, grid: { display: false }, ticks: { color: muted } },
      y: { stacked: empilhar, beginAtZero: true, grid: { color: cssVar("--borda") }, border: { display: false }, ticks: { color: muted } }
    }
  };
  const Tipo = linha ? Line : Bar;
  return <div className="card-grafico"><Tipo data={{ labels, datasets }} options={opcoes} /></div>;
}

function Pizza({ w, d, modulo, moeda }) {
  const cfg = d.config;
  const fmt = formatador(cfg, modulo, moeda);
  const grupo = campoDe(modulo, cfg.agrupar_por);
  const linhas = ordenar(d.result, cfg, modulo).filter((r) => valorDe(cfg, r) > 0).slice(0, MAX_GRUPOS);
  if (!linhas.length) return <div className="card-sub">Sem dados</div>;
  const escolhidas = cfg.paleta || Object.keys(cfg.cores || {}).length;
  const cores = linhas.map((r, i) => (escolhidas ? corDe(cfg, grupo, r.key, i) : cssVar(`--series-${(i % 8) + 1}`)));
  return (
    <div className="card-grafico pizza">
      <Doughnut
        data={{ labels: linhas.map((r) => rotuloChave(grupo, r.key, cfg.formato_grupo)),
          datasets: [{ data: linhas.map((r) => valorDe(cfg, r)), backgroundColor: cores, borderColor: cssVar("--superficie"), borderWidth: 2 }] }}
        options={{ responsive: true, maintainAspectRatio: false, cutout: "62%",
          plugins: { legend: { position: "right", labels: { usePointStyle: true, boxWidth: 8, color: cssVar("--texto-2") } },
            tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${fmt(ctx.parsed)}` } } } }}
      />
      <div className="pizza-centro"><strong>{linhas.length}</strong><span>{grupo?.nome}</span></div>
    </div>
  );
}

// Calendário: um quadradinho por dia, como o de contribuições do GitHub.
// Os números são os do oficial (renderCalendario em frontend/js/dashboards.js):
// valor do dia por valorDe, 4 níveis por valor/máximo, semanas em colunas com
// as mais recentes à direita (só as que cabem na largura) e as sequências.
// O que muda é a apresentação: meses e dias da semana, hoje marcado, dica na
// hora, teclado (setas, Home, End) e o resumo do período.
const MESES_CAL = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SEMANA_CAL = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const ROTULO_CAL = 30; // coluna dos dias da semana
const VAO_CAL = 4;

// Largura do elemento, atualizada quando o card muda de tamanho.
function useLargura(ref) {
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.floor(e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return largura;
}

const isoCal = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const dataLonga = (iso) => { const [a, m, d] = iso.split("-"); return `${Number(d)} de ${MESES_CAL[Number(m) - 1]} de ${a}`; };

function Calendario({ d, modulo, moeda }) {
  const cfg = d.config;
  const fmt = formatador(cfg, modulo, moeda);
  const ref = useRef(null);
  const largura = useLargura(ref);
  // Células maiores em card largo; no celular, menores para caber mais semanas.
  const cel = largura >= 760 ? 14 : 13;
  const semanas = Math.max(8, Math.min(53, Math.floor((largura - ROTULO_CAL + VAO_CAL) / (cel + VAO_CAL))));

  const cal = useMemo(() => {
    const valores = new Map(d.result.map((r) => [r.key, valorDe(cfg, r)]));
    const hoje = new Date();
    hoje.setHours(12, 0, 0, 0);
    const dia = new Date(hoje);
    dia.setDate(hoje.getDate() - hoje.getDay() - (semanas - 1) * 7);
    const dias = [];
    for (; dia <= hoje; dia.setDate(dia.getDate() + 1)) dias.push({ data: isoCal(dia), sem: dia.getDay(), v: valores.get(isoCal(dia)) || 0 });
    const max = Math.max(0, ...dias.map((x) => x.v));
    const nivel = (v) => (v <= 0 || !max ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
    // Sequências: dias seguidos com valor (hoje ainda zerado conta até ontem).
    let atual = 0;
    for (let i = dias.length - 1 - (dias.at(-1)?.v > 0 ? 0 : 1); i >= 0 && dias[i].v > 0; i--) atual++;
    let maior = 0;
    let corrente = 0;
    dias.forEach((x) => { corrente = x.v > 0 ? corrente + 1 : 0; maior = Math.max(maior, corrente); });
    const melhor = dias.reduce((m, x) => (x.v > (m?.v || 0) ? x : m), null);
    // Rótulo do mês na primeira semana (domingo) em que ele aparece.
    const meses = [];
    let anterior = -1;
    dias.forEach((x, i) => {
      if (x.sem !== 0) return;
      const mes = Number(x.data.slice(5, 7)) - 1;
      if (mes !== anterior && i > 0) meses.push({ col: Math.floor(i / 7), nome: MESES_CAL[mes] });
      anterior = mes;
    });
    return {
      dias: dias.map((x) => ({ ...x, nivel: nivel(x.v) })), meses, atual, maior, melhor,
      ativos: dias.filter((x) => x.v > 0).length, total: dias.reduce((t, x) => t + x.v, 0)
    };
  }, [d, cfg, semanas]);

  const ultimo = cal.dias.length - 1;
  // Dia que recebe o Tab (pela data, porque o número de semanas muda com a
  // largura). Começa em hoje.
  const [dataFoco, setDataFoco] = useState(null);
  const achado = cal.dias.findIndex((x) => x.data === dataFoco);
  const foco = achado >= 0 ? achado : ultimo;
  const [dica, setDica] = useState(null);

  const rotulo = (x) => `${x.v > 0 ? fmt(x.v) : "Nada registrado"}, ${SEMANA_CAL[x.sem]}, ${dataLonga(x.data)}`;
  // Perto das bordas a dica encosta no lado de dentro, para não sair do card.
  const mostrar = (i, el) => {
    const x = el.offsetLeft + cel / 2;
    const lado = x < 60 ? "esq" : x > el.offsetParent.clientWidth - 60 ? "dir" : "";
    setDica({ i, x, y: el.offsetTop, lado });
  };

  // Teclado: as linhas são os dias da semana e as colunas, as semanas.
  function tecla(e) {
    const passo = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key];
    let novo = passo === undefined ? null : foco + passo;
    if (e.key === "Home") novo = 0;
    if (e.key === "End") novo = ultimo;
    if (novo === null) return;
    e.preventDefault();
    novo = Math.max(0, Math.min(ultimo, novo));
    setDataFoco(cal.dias[novo].data);
    e.currentTarget.querySelector(`[data-i="${novo}"]`)?.focus();
  }

  const resumo = cal.ativos
    ? `${fmt(cal.total)} em ${cal.ativos} dia${cal.ativos === 1 ? "" : "s"} nas últimas ${semanas} semanas`
    : `Nada registrado nas últimas ${semanas} semanas`;

  return (
    <div className="calendario" ref={ref} style={{ "--cal-cor": corUnica(cfg), "--cel": `${cel}px` }}>
      {largura > 0 && (
        <>
          <div className="cal-area">
            <div className="cal-grade" role="grid" aria-label={`Calendário: ${resumo}`}
              onKeyDown={tecla} style={{ gridTemplateColumns: `${ROTULO_CAL - VAO_CAL}px repeat(${semanas}, var(--cel))` }}>
              {cal.meses.map((m) => <span key={`${m.col}-${m.nome}`} className="cal-mes" aria-hidden="true" style={{ gridColumn: m.col + 2 }}>{m.nome}</span>)}
              {[1, 3, 5].map((s) => <span key={s} className="cal-sem" aria-hidden="true" style={{ gridRow: s + 2 }}>{SEMANA_CAL[s].slice(0, 3)}</span>)}
              {/* Uma linha por dia da semana (display: contents): a posição vem do grid-column/row. */}
              {[0, 1, 2, 3, 4, 5, 6].map((s) => (
                <div key={s} role="row" className="cal-linha">
                  {cal.dias.map((x, i) => (x.sem !== s ? null : (
                    <span key={x.data} role="gridcell" data-i={i} className="cal-dia" data-nivel={x.nivel} data-hoje={i === ultimo || undefined}
                      tabIndex={i === foco ? 0 : -1} aria-label={rotulo(x)} aria-current={i === ultimo ? "date" : undefined}
                      style={{ gridColumn: Math.floor(i / 7) + 2, gridRow: s + 2 }}
                      onMouseEnter={(e) => mostrar(i, e.currentTarget)} onMouseLeave={() => setDica(null)}
                      onFocus={(e) => { setDataFoco(x.data); mostrar(i, e.currentTarget); }} onBlur={() => setDica(null)} />
                  )))}
                </div>
              ))}
            </div>
            {dica && (
              <div className={`cal-dica ${dica.lado}`} role="presentation" style={{ left: dica.x, top: dica.y }}>
                <strong>{cal.dias[dica.i].v > 0 ? fmt(cal.dias[dica.i].v) : "Nada"}</strong>
                <span>{SEMANA_CAL[cal.dias[dica.i].sem].slice(0, 3)}, {fmtData(cal.dias[dica.i].data)}</span>
              </div>
            )}
          </div>
          <div className="cal-rodape">
            <dl className="cal-numeros">
              <div><dt>Total</dt><dd>{fmt(cal.total)}</dd></div>
              <div><dt>Dias ativos</dt><dd>{cal.ativos}</dd></div>
              <div><dt>Sequência atual</dt><dd>{cal.atual} {cal.atual === 1 ? "dia" : "dias"}</dd></div>
              <div><dt>Maior sequência</dt><dd>{cal.maior} {cal.maior === 1 ? "dia" : "dias"}</dd></div>
              {cal.melhor && <div><dt>Melhor dia</dt><dd>{fmt(cal.melhor.v)} <small>{fmtData(cal.melhor.data).slice(0, 5)}</small></dd></div>}
            </dl>
            <span className="cal-escala" aria-hidden="true">
              Menos {[0, 1, 2, 3, 4].map((n) => <span key={n} className="cal-dia" data-nivel={n} />)} Mais
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// Busca os dados do card e escolhe o desenho pelo tipo.
export function Card({ widget, modulo, moeda, tema }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let vivo = true;
    Api.get(`/api/widgets/${widget.id}/data`).then((x) => vivo && setD(x)).catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [widget.id]);

  let corpo = <div className="card-sub">Carregando…</div>;
  if (erro) corpo = <div className="card-erro">{erro}</div>;
  else if (d) {
    const props = { w: widget, d, modulo, moeda };
    corpo = widget.tipo === "kpi" ? (d.config.meta ? <Meta {...props} /> : <Numero {...props} />)
      : widget.tipo === "table" ? <Tabela {...props} />
        : widget.tipo === "pie" ? <Pizza key={tema} {...props} />
          : widget.tipo === "calendario" ? <Calendario {...props} />
            : <Grafico key={tema} {...props} />;
  }
  // No celular a grade vira 2 colunas (só CSS, como o responsivo.js do
  // oficial): a ordem sai da posição salva (y*12 + x) e card estreito
  // (w <= 3) ocupa meia linha. O layout salvo não muda.
  return (
    <section className={`card ${widget.w <= 3 ? "cel-meia" : ""}`}
      style={{ gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}`, "--ordem": widget.y * 12 + widget.x, "--gs-h": widget.h }}>
      <h3 className="card-titulo">{widget.titulo}</h3>
      <div className="card-corpo">{corpo}</div>
    </section>
  );
}
