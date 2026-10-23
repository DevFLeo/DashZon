// @dashzon/core: a lógica do DashZon sem HTML nem CSS, para a web (React,
// Next) e o celular (React Native). As fórmulas dos cards copiam as do
// frontend oficial (frontend/js/dashboards.js e util.js), que continua sendo a
// referência (REGRA do CLAUDE.md): aqui elas só mudam de lugar.

// --- API (o backend Ruby) -----------------------------------------------------
// `base`: "" na web (mesma origem, pelo proxy) ou o endereço do servidor no
// celular (ex.: "https://dashzon.duckdns.org"). `credenciais`: "same-origin"
// na web; "include" no app nativo, que guarda o cookie da sessão sozinho.
// `tempoLimite` (ms, opcional): desiste do pedido; no celular um servidor
// fora do alcance deixava o app carregando para sempre (visto no emulador).
export function criarApi(base = "", credenciais = "same-origin", tempoLimite = 0) {
  async function api(metodo, caminho, corpo) {
    const controle = tempoLimite ? new AbortController() : null;
    const timer = controle ? setTimeout(() => controle.abort(), tempoLimite) : null;
    let r;
    try {
      r = await fetch(`${base}${caminho}`, {
        method: metodo,
        credentials: credenciais,
        headers: corpo ? { "Content-Type": "application/json" } : {},
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: controle?.signal
      });
    } catch (e) {
      throw new Error(controle?.signal.aborted ? "O servidor não respondeu a tempo." : `Sem conexão com o servidor (${e.message}).`);
    } finally {
      clearTimeout(timer);
    }
    let dados = null;
    try { dados = await r.json(); } catch (_) { /* corpo vazio */ }
    if (!r.ok) {
      const erro = new Error(dados?.error || `Erro ${r.status}`);
      erro.status = r.status;
      throw erro;
    }
    return dados;
  }
  return {
    get: (c) => api("GET", c),
    post: (c, b) => api("POST", c, b),
    put: (c, b) => api("PUT", c, b),
    patch: (c, b) => api("PATCH", c, b),
    del: (c) => api("DELETE", c)
  };
}

// A da web: mesma origem.
export const Api = criarApi();

// --- formatação --------------------------------------------------------------
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const fmtNumero = (v, casas = 2) => (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: casas });
export const fmtMoeda = (v, moeda = "BRL") => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: moeda });
export const fmtData = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");

export const campoDe = (modulo, id) => (modulo && id ? modulo.schema.campos.find((c) => c.id === id) : null);

export function rotuloChave(campo, chave, formato) {
  if (chave === "(vazio)") return "(vazio)";
  if (!campo) return chave;
  if (formato === "mes") {
    const [a, m] = String(chave).split("-");
    return m ? `${MESES[Number(m) - 1]}/${a.slice(2)}` : chave;
  }
  if (campo.tipo === "booleano") return chave === "true" ? "Sim" : "Não";
  if (campo.tipo === "movimento") return chave === "entrada" ? "Entrada" : "Saída";
  return chave;
}

export function fmtValor(campo, v, moeda) {
  if (campo.tipo === "booleano") return v ? "Sim" : "Não";
  if (v === null || v === undefined || v === "") return "—";
  if (campo.tipo === "moeda") return fmtMoeda(v, moeda);
  if (campo.tipo === "numero") return fmtNumero(v);
  if (campo.tipo === "data") return fmtData(v);
  if (campo.tipo === "movimento") return v === "entrada" ? "Entrada" : "Saída";
  return String(v);
}

// --- medida, ordem e descrição (mesma fórmula do oficial) --------------------
export function valorDe(cfg, alvo) {
  if (!alvo) return 0;
  if (cfg.agregacao === "contagem") return alvo.count;
  if (cfg.agregacao === "media") return alvo.avg ?? (alvo.count ? alvo.sum / alvo.count : 0);
  return alvo.sum;
}

export function formatador(cfg, modulo, moeda) {
  if (cfg.agregacao === "contagem") return (v) => fmtNumero(v, 0);
  return campoDe(modulo, cfg.campo)?.tipo === "moeda" ? (v) => fmtMoeda(v, moeda) : (v) => fmtNumero(v);
}

export function descricao(cfg, modulo) {
  const medida = { contagem: "registros", soma: `soma de ${campoDe(modulo, cfg.campo)?.nome}`,
    media: `média de ${campoDe(modulo, cfg.campo)?.nome}`, saldo: "entradas − saídas" }[cfg.agregacao];
  const filtros = Object.entries(cfg.filtro || {}).map(([k, v]) => {
    const c = campoDe(modulo, k);
    return `${c ? c.nome : k}: ${c ? rotuloChave(c, v) : v}`;
  });
  return [medida, ...filtros].join(" · ");
}

const opcoes = (campo) => (campo.tipo === "movimento" ? ["entrada", "saida"] : campo.tipo === "booleano" ? ["true", "false"] : campo.opcoes || []);

// --- formulário de registro (igual a util.js do oficial) ---------------------
export const NUMERICOS = ["numero", "moeda"];
export const SERIES = ["selecao", "movimento", "booleano"];

// Opções de um campo com o rótulo de tela: [{v, l}].
export const opcoesDe = (campo) => opcoes(campo).map((v) => ({ v, l: rotuloChave(campo, v) }));

export function hojeISO(deltaDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deltaDias);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Valor padrão do schema: "$hoje", "$hoje+7", "$hoje-1" viram a data.
export function resolverToken(v) {
  if (typeof v !== "string") return v;
  const m = v.match(/^\$hoje([+-]\d+)?$/);
  return m ? hojeISO(Number(m[1] || 0)) : v;
}

export function ordenar(linhas, cfg, modulo) {
  const campo = campoDe(modulo, cfg.agrupar_por);
  if (cfg.formato_grupo === "mes" || !campo) return linhas;
  const ops = opcoes(campo);
  if (ops.length) {
    const pos = (k) => { const i = ops.indexOf(k); return i < 0 ? 999 : i; };
    return [...linhas].sort((a, b) => pos(a.key) - pos(b.key));
  }
  return [...linhas].sort((a, b) => valorDe(cfg, b) - valorDe(cfg, a));
}

// --- cores (tema + escolhas do editor de card) --------------------------------
const PALETAS = {
  oceano: ["#0b6e99", "#14b8c4", "#2dd4a7", "#0e4d64", "#5eb1ef", "#1f9e89", "#93d5f1", "#3a5a98"],
  por_do_sol: ["#ff6b4a", "#ffb347", "#e8487b", "#ffd166", "#c2408f", "#ff8c61", "#8f3b76", "#f9a03f"],
  floresta: ["#2d6a4f", "#74a942", "#b5c99a", "#1b4332", "#95d5b2", "#6f4e37", "#40916c", "#d4a373"],
  neon: ["#00e5c7", "#ff3d9a", "#ffe14d", "#2fb8ff", "#a259ff", "#ff6a3d", "#39ff88", "#ff4d4d"],
  pastel: ["#8fb8ff", "#ffa8a8", "#a7e3a1", "#ffd59e", "#c3b4ff", "#93e4ee", "#f6e58d", "#f5b7e8"],
  terra: ["#9c4f2e", "#d08c45", "#7d8a4e", "#c8553d", "#5e3a2b", "#e3b26b", "#4f6d4a", "#a67c52"],
  galaxia: ["#6c3ce0", "#3f8efc", "#25c3e8", "#b04bdf", "#4b5bd6", "#53e0c3", "#ef6ad1", "#8a7bff"]
};

// As cores do tema vêm de fora: na web, das variáveis CSS (--series-1...);
// no celular, do objeto do tema. `lerToken("--series-3")` devolve a cor.
export function criarCores(lerToken) {
  function corDe(cfg, campo, chave, i = 0) {
    if (cfg?.cores?.[chave]) return cfg.cores[chave];
    const pos = campo ? opcoes(campo).indexOf(chave) : -1;
    const paleta = cfg?.paleta && PALETAS[cfg.paleta];
    if (paleta) return paleta[(pos >= 0 ? pos : i) % paleta.length];
    if (campo?.tipo === "movimento") return lerToken(chave === "saida" ? "--series-8" : "--series-1");
    return pos >= 0 && pos < 8 ? lerToken(`--series-${pos + 1}`) : lerToken(`--series-${(i % 8) + 1}`);
  }
  const corUnica = (cfg) => cfg?.cor || (cfg?.paleta && PALETAS[cfg.paleta]?.[0]) || lerToken("--series-1");
  return { corDe, corUnica };
}
