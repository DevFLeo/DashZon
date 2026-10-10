// Utilitários compartilhados: formatação por tipo de campo, cores dos
// gráficos (lidas dos tokens CSS, para respeitar tema claro/escuro), modais,
// avisos e datas relativas dos templates ($hoje, $hoje-30...).
const Util = (() => {
  let moeda = "BRL";
  const SIMBOLOS = { BRL: "R$", USD: "US$", EUR: "€" };
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  const NUMERICOS = ["numero", "moeda"];
  const DIMENSOES = ["selecao", "movimento", "booleano", "texto", "data"];
  const SERIES = ["selecao", "movimento", "booleano"];

  function setMoeda(m) { moeda = m || "BRL"; }

  function fmtNumero(v, casas = 2) {
    const n = Number(v) || 0;
    return n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
  }

  // Para eixos de gráfico: "R$ 7 mil", "1,2 mi".
  function fmtCompacto(v, comMoeda) {
    const n = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v) || 0);
    return comMoeda ? `${SIMBOLOS[moeda] || moeda} ${n}` : n;
  }

  function fmtMoeda(v) {
    const n = Number(v) || 0;
    return `${SIMBOLOS[moeda] || moeda} ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // "2026-09-23" -> "23/09/2026" sem passar por Date (evita cair no dia
  // anterior por causa do fuso).
  function fmtData(iso) {
    if (!iso) return "—";
    const [a, m, d] = String(iso).slice(0, 10).split("-");
    return d ? `${d}/${m}/${a}` : iso;
  }

  function fmtMes(chave) {
    const [a, m] = String(chave).split("-");
    const i = Number(m) - 1;
    return MESES[i] ? `${MESES[i]}/${a.slice(2)}` : chave;
  }

  function opcoesDe(campo) {
    if (campo.tipo === "movimento") return [{ v: "entrada", l: "Entrada" }, { v: "saida", l: "Saída" }];
    if (campo.tipo === "booleano") return [{ v: "true", l: "Sim" }, { v: "false", l: "Não" }];
    return (campo.opcoes || []).map((o) => ({ v: o, l: o }));
  }

  function fmtValor(campo, v) {
    if (campo.tipo === "booleano") return v ? "Sim" : "Não";
    if (v === null || v === undefined || v === "") return "—";
    switch (campo.tipo) {
      case "moeda": return fmtMoeda(v);
      case "numero": return fmtNumero(v);
      case "data": return fmtData(v);
      case "hora": return String(v).slice(0, 5);
      case "movimento": return v === "entrada" ? "Entrada" : "Saída";
      default: return String(v);
    }
  }

  // Rótulo de uma chave de agrupamento devolvida pelo motor C++.
  function rotuloChave(campo, chave, formato) {
    if (chave === "(vazio)") return "(vazio)";
    if (!campo) return chave;
    if (formato === "mes") return fmtMes(chave);
    if (campo.tipo === "booleano") return chave === "true" ? "Sim" : "Não";
    if (campo.tipo === "movimento") return chave === "entrada" ? "Entrada" : "Saída";
    return chave;
  }

  function hojeISO(deltaDias = 0) {
    const d = new Date();
    d.setDate(d.getDate() + deltaDias);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function resolverToken(v) {
    if (typeof v !== "string") return v;
    const m = v.match(/^\$hoje([+-]\d+)?$/);
    return m ? hojeISO(Number(m[1] || 0)) : v;
  }

  function cssVar(nome) {
    return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  }

  // Cor de uma série pela identidade (posição da opção no schema), nunca pelo
  // ranking. Entrada/saída usam o par divergente azul/vermelho. Da 9ª opção
  // em diante não se inventa cor nova: usa o cinza de "outros".
  function corSerie(campo, chave) {
    if (campo && campo.tipo === "movimento") return cssVar(chave === "saida" ? "--series-8" : "--series-1");
    if (campo && campo.tipo === "booleano") return cssVar(chave === "true" ? "--series-1" : "--series-2");
    const i = campo ? (campo.opcoes || []).indexOf(chave) : -1;
    return i >= 0 && i < 8 ? cssVar(`--series-${i + 1}`) : cssVar("--text-muted");
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function debounce(fn, espera) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), espera);
    };
  }

  function abrirModal(id) { document.getElementById(id).classList.add("open"); }
  function fecharModal(id) { document.getElementById(id).classList.remove("open"); }

  let toastTimer;
  function aviso(msg, tipo = "info") {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.className = `toast toast-${tipo}`;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
  }

  function lerArquivo(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
      r.readAsText(file, "utf-8");
    });
  }

  // Mensagem depois de instalar um template. Módulos de mesmo nome não são
  // duplicados: o backend reaproveita o existente e avisa quais foram.
  function resumoInstalacao(res) {
    const novos = res.modulos.length - (res.reaproveitados || []).length;
    const partes = [];
    if (novos > 0) partes.push(`${novos} módulo(s) novo(s)`);
    if (res.reaproveitados?.length) partes.push(`reaproveitado(s): ${res.reaproveitados.join(", ")}`);
    if (res.widgets_pulados) partes.push(`${res.widgets_pulados} card(s) pulado(s) por não caberem no módulo atual`);
    return `Instalado. ${partes.join(" · ")}`;
  }

  function storage(chave, valor) {
    try {
      if (valor === undefined) return localStorage.getItem(chave);
      localStorage.setItem(chave, valor);
    } catch (_) { /* navegação privada ou storage bloqueado */ }
    return null;
  }

  return {
    NUMERICOS, DIMENSOES, SERIES,
    setMoeda, fmtNumero, fmtMoeda, fmtCompacto, fmtData, fmtMes, fmtValor, rotuloChave, opcoesDe,
    hojeISO, resolverToken, cssVar, corSerie, escapeHtml, debounce,
    abrirModal, fecharModal, aviso, lerArquivo, storage, resumoInstalacao
  };
})();
