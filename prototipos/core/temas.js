// Os temas do DashZon, lidos de temas/temas.json: a fonte única, a mesma do
// backend (validação e /temas.css do oficial). Aqui eles viram o formato que
// a web dos protótipos e o celular usam. Um tema novo no JSON aparece em
// todos sem mudar este arquivo.
import DADOS from "../../temas/temas.json" with { type: "json" };

// Nomes dos tokens nos protótipos e no app, a partir dos nomes do oficial.
const NOMES = {
  fundo: "page-plane", superficie: "surface-1", borda: "gridline", hover: "hover",
  texto: "text-primary", "texto-2": "text-secondary", "texto-fraco": "text-muted",
  destaque: "accent", "destaque-tinta": "accent-ink", bom: "success-text", ruim: "critical-text"
};
function tokensDoApp(t) {
  const saida = {};
  for (const [nome, oficial] of Object.entries(NOMES)) saida[`--${nome}`] = t[oficial];
  for (let i = 1; i <= 8; i++) saida[`--series-${i}`] = t[`series-${i}`];
  return saida;
}

// Cores de cada tema (dark = fundo escuro, para a barra de status no celular).
export const TOKENS = Object.fromEntries(DADOS.temas.map((t) => [t.id, tokensDoApp(t.tokens)]));
export const ESCUROS = DADOS.temas.filter((t) => t.escuro).map((t) => t.id);

// O que as telas de configuração mostram, por grupo na ordem do JSON, cada
// automático no começo do próprio grupo. `previa`: fundo, cartão, texto,
// destaque e três séries; nos automáticos, `compoe` diz de quais temas mostrar.
const previaDe = (t) => [t.tokens["page-plane"], t.tokens["surface-1"], t.tokens["text-primary"], t.tokens.accent, t.tokens["series-1"], t.tokens["series-2"], t.tokens["series-3"]];
const grupos = [...new Set([...DADOS.automaticos.filter((a) => !DADOS.temas.some((t) => t.grupo === a.grupo)).map((a) => a.grupo), ...DADOS.temas.map((t) => t.grupo)])];
export const TEMAS = grupos.flatMap((g) => [
  ...DADOS.automaticos.filter((a) => a.grupo === g).map((a) => ({
    id: a.id, grupo: a.grupo, nome: a.nome, desc: a.desc, automatico: true,
    compoe: a.estacoes ? a.estacoes.map((e) => e.tema) : [a.claro, a.escuro]
  })),
  ...DADOS.temas.filter((t) => t.grupo === g).map((t) => ({
    id: t.id, grupo: t.grupo, nome: t.nome, desc: t.desc, fase: t.fase, escuro: t.escuro, previa: previaDe(t)
  }))
]);

export const temaPorId = (id) => TEMAS.find((t) => t.id === id);

// O botão do topo gira dentro da família (o grupo): o seguinte, voltando ao primeiro.
export const PROXIMO = Object.fromEntries(DADOS.temas.map((t) => {
  const familia = DADOS.temas.filter((x) => x.grupo === t.grupo);
  return [t.id, familia[(familia.indexOf(t) + 1) % familia.length].id];
}));

// Um automático vira um tema de verdade: "sistema" segue o modo escuro do
// aparelho; "vivaldi" (as quatro estações) segue a data: vale a última
// estação cujo início ("MM-DD") já passou no ano; antes da primeira, a última.
export function estacaoDe(auto, hoje = new Date()) {
  const md = `${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const ja = auto.estacoes.filter((e) => e.desde <= md);
  return (ja.length ? ja[ja.length - 1] : auto.estacoes[auto.estacoes.length - 1]).tema;
}
export function temaEfetivo(escolha, escuroNoSistema, hoje = new Date()) {
  const auto = DADOS.automaticos.find((a) => a.id === escolha);
  if (auto?.claro) return escuroNoSistema ? auto.escuro : auto.claro;
  if (auto?.estacoes) return estacaoDe(auto, hoje);
  return TOKENS[escolha] ? escolha : (escuroNoSistema ? "escuro" : "claro");
}

// CSS dos protótipos web: um bloco por tema em :root[data-tema="<id>"], e o
// claro como padrão em :root.
export function cssDosTemas() {
  const bloco = (seletor, t) => `${seletor} { color-scheme: ${t.escuro ? "dark" : "light"}; ${Object.entries(tokensDoApp(t.tokens)).map(([k, v]) => `${k}: ${v};`).join(" ")} }`;
  const claro = DADOS.temas.find((t) => t.id === "claro") || DADOS.temas[0];
  return [bloco(":root", claro), ...DADOS.temas.map((t) => bloco(`:root[data-tema="${t.id}"]`, t))].join("\n");
}
