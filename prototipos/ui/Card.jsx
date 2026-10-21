"use client";
// Um card do dashboard, desenhado a partir de GET /api/widgets/:id/data.
// Mesmos tipos do oficial: número (com ou sem meta), barras, linha, pizza,
// tabela e calendário.
import { useEffect, useState } from "react";
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

function Calendario({ d, modulo, moeda }) {
  const cfg = d.config;
  const fmt = formatador(cfg, modulo, moeda);
  const valores = new Map(d.result.map((r) => [r.key, valorDe(cfg, r)]));
  const semanas = 26;
  const hoje = new Date();
  const dia = new Date(hoje);
  dia.setDate(hoje.getDate() - hoje.getDay() - (semanas - 1) * 7);
  const dias = [];
  for (; dia <= hoje; dia.setDate(dia.getDate() + 1)) {
    const iso = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, "0")}-${String(dia.getDate()).padStart(2, "0")}`;
    dias.push({ iso, v: valores.get(iso) || 0 });
  }
  const max = Math.max(0, ...dias.map((x) => x.v));
  const nivel = (v) => (v <= 0 || !max ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const ativos = dias.filter((x) => x.v > 0).length;
  return (
    <div className="calendario" style={{ "--cal-cor": corUnica(cfg) }}>
      <div className="cal-grade">
        {dias.map((x) => <span key={x.iso} className="cal-dia" data-nivel={nivel(x.v)} title={`${x.v > 0 ? fmt(x.v) : "Nada"} em ${fmtData(x.iso)}`} />)}
      </div>
      <div className="card-sub">{fmt(dias.reduce((t, x) => t + x.v, 0))} em {ativos} dia{ativos === 1 ? "" : "s"}</div>
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
