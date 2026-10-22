// Teste de ponta a ponta do app de celular, na versão web (React Native Web),
// num Chromium headless com tela de celular. Parâmetros em parametros.mjs.
//   npx expo export --platform web
//   npm run teste:web
// Só roda numa instância NÃO configurada (faz o setup ela mesma): nunca
// encosta no banco real. Para zerar a de teste: testes/rodar-testes.ps1.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PARAMETROS as P } from "./parametros.mjs";
import { servir } from "./servir-web.mjs";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(P.saida, { recursive: true });
if (!P.navegador) { console.log("ERRO: nenhum Chromium encontrado (Edge ou Chrome). Defina NAVEGADOR."); process.exit(2); }

// 1. Instância de teste: precisa estar no ar e NÃO configurada.
let status;
try { status = await (await fetch(`${P.api}/api/status`)).json(); } catch (e) { console.log(`ERRO: nada respondendo em ${P.api} (${e.message}).`); process.exit(2); }
if (status.configured !== false) {
  console.log(`ERRO: a instância em ${P.api} já está configurada. Use uma instância de teste zerada (testes/rodar-testes.ps1 faz isso).`);
  process.exit(2);
}
const setup = await fetch(`${P.api}/api/setup`, { method: "POST", headers: { "Content-Type": "application/json", Origin: P.api },
  body: JSON.stringify({ usuario: P.usuario, senha: P.senha, nome: "Admin Teste", templates: P.templates }) });
if (!setup.ok) { console.log(`ERRO no setup: ${await setup.text()}`); process.exit(2); }

// 2. App web + navegador.
const app = await servir();
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "dz-mobile-"));
// Se sobrou um navegador de uma rodada anterior nessa porta, espera ele fechar.
for (let i = 0; i < 25; i++) { try { await fetch(`http://127.0.0.1:${P.portaCdp}/json/version`); await espera(200); } catch { break; } }
const nav = spawn(P.navegador, ["--headless=new", `--remote-debugging-port=${P.portaCdp}`, `--user-data-dir=${perfil}`, "--no-first-run", "--disable-gpu", "about:blank"]);
// Espera o DevTools do navegador NOVO (o de uma rodada anterior pode estar
// fechando) e usa a página dele; sem página, abre uma.
let pagina;
for (let i = 0; i < 75 && !pagina; i++) {
  try {
    const alvos = await (await fetch(`http://127.0.0.1:${P.portaCdp}/json`)).json();
    pagina = alvos.find((a) => a.type === "page") || await (await fetch(`http://127.0.0.1:${P.portaCdp}/json/new?about:blank`, { method: "PUT" })).json();
  } catch { await espera(200); }
}
if (!pagina?.webSocketDebuggerUrl) { console.log(`ERRO: o navegador não abriu o DevTools na porta ${P.portaCdp}.`); process.exit(2); }
const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pend = new Map();
const errosJs = [];
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pend.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id) { pend.get(m.id)?.(m); pend.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") errosJs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errosJs.push(m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300));
});
await cdp("Runtime.enable");
await cdp("Page.enable");
async function tela({ largura, altura }) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: largura, height: altura, deviceScaleFactor: 1, mobile: true });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: true });
}
async function avaliar(expr) {
  const r = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`avaliar: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}
async function ate(expr, desc, ms = 12000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { try { if (await avaliar(expr)) return; } catch { /* trocando de tela */ } await espera(100); }
  throw new Error(`tempo esgotado: ${desc}`);
}
async function print(nome) {
  const r = await cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(P.saida, `${nome}.png`), Buffer.from(r.data, "base64"));
}
// Ajudantes dentro da página. As checagens devolvem true/false (um elemento
// da página não atravessa o DevTools como valor).
const AJUDA = `
window.__rot = (rot) => [...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label') === rot && e.offsetParent !== null);
window.__rotIni = (ini) => [...document.querySelectorAll('[aria-label]')].find((e) => (e.getAttribute('aria-label') || '').startsWith(ini) && e.offsetParent !== null);
window.__valor = (el, v) => {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
window.__texto = (t) => document.body.innerText.replace(/\\u00a0/g, " ").includes(t);
window.__cartoes = () => document.querySelectorAll('[aria-label$="Tocar para editar"]').length;
window.__botao = (rot) => [...document.querySelectorAll('[role=button]')].filter((b) => b.getAttribute('aria-label') === rot && b.offsetParent).pop();
true`;
const ajuda = () => avaliar(AJUDA);
const api = (url) => avaliar(`fetch(${JSON.stringify(url)}).then((r) => r.json())`);
const medir = () => avaliar(`(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  const alvos = [...document.querySelectorAll('[role=button], [role=radio], [role=switch], input, textarea')].filter(vis);
  const pequenos = alvos.filter((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) < ${P.alvoMinimo}; })
    .map((e) => (e.getAttribute('aria-label') || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().height));
  // Valores (números, moeda, porcentagem) nunca podem aparecer cortados.
  const cortados = [...document.querySelectorAll('[dir=auto]')].filter((e) => vis(e) && /\d/.test(e.textContent) && !e.closest('[aria-label$="Tocar para editar"]')
    && (e.scrollWidth > e.clientWidth + 1 || (getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth))).map((e) => e.textContent.slice(0, 20));
  return { rolagem: document.scrollingElement.scrollWidth > innerWidth + 1, largura: innerWidth, pequenos, cortados };
})()`);

const res = [];
async function passo(nome, fn) {
  try { await fn(); res.push(`OK    ${nome}`); console.log(`OK    ${nome}`); }
  catch (e) { res.push(`FALHA ${nome}: ${e.message}`); console.log(`FALHA ${nome}: ${e.message}`); await print(`FALHA-${nome.replace(/[^a-z0-9]+/gi, "-")}`).catch(() => {}); }
}
async function conferirTela(nome) {
  const m = await medir();
  console.log(`      ${nome} (${m.largura}px): rolagem lateral ${m.rolagem ? "SIM" : "não"}, alvos < ${P.alvoMinimo}px: ${m.pequenos.length}, valores cortados: ${m.cortados.length}${m.pequenos.length ? ` (${m.pequenos.slice(0, 4).join(" | ")})` : ""}`);
  if (m.rolagem) throw new Error(`rolagem lateral em ${nome}`);
  if (m.pequenos.length) throw new Error(`alvos de toque pequenos em ${nome}: ${m.pequenos.join(" | ")}`);
  if (m.cortados.length) throw new Error(`valores cortados em ${nome}: ${m.cortados.join(" | ")}`);
}
async function entrar() {
  await cdp("Network.clearBrowserCookies").catch(() => {});
  await cdp("Page.navigate", { url: app.url });
  await ate("!!document.querySelector('input[aria-label=\"Usuário\"]')", "tela de entrar", 20000);
  await ajuda();
  await avaliar(`__valor(__rot('Usuário'), ${JSON.stringify(P.usuario)}); __valor(__rot('Senha'), ${JSON.stringify(P.senha)}); __rot('Entrar').click(); true`);
  await ate("__texto('Olá, Admin Teste')", "início", 15000);
  await ajuda();
}
const abrirDashboard = async (nome) => {
  await avaliar(`__rot('Dashboard ${nome}').click(); true`);
  await ate(`!!__rot('Voltar') && __texto(${JSON.stringify(nome)}) && !document.querySelector('[role=progressbar][aria-busy=true]')`, `dashboard ${nome}`);
};

const [principal, ...outras] = P.telas;
await tela(principal);
await cdp("Page.navigate", { url: app.url });

await passo("entrar: senha errada mostra o erro", async () => {
  await ate("!!document.querySelector('input[aria-label=\"Usuário\"]')", "tela de entrar", 20000);
  await ajuda();
  await conferirTela("entrar");
  await avaliar(`__valor(__rot('Usuário'), ${JSON.stringify(P.usuario)}); __valor(__rot('Senha'), 'errada-123'); __rot('Entrar').click(); true`);
  await ate("!!document.querySelector('[role=alert]')", "erro de login");
});
await passo("entrar: dashboards e módulos do menu", async () => {
  await avaliar(`__valor(__rot('Senha'), ${JSON.stringify(P.senha)}); __rot('Entrar').click(); true`);
  await ate("__texto('Olá, Admin Teste') && !!__rot('Dashboard Finanças pessoais') && !!__rotIni('Lançamentos, ')", "início", 15000);
  await ajuda();
  await print("inicio");
  await conferirTela("início");
});
await passo("dashboard: cards na ordem salva, números lado a lado", async () => {
  await abrirDashboard("Finanças pessoais");
  await ate("__texto('R$ 11.300,00') && __texto('Toque num grupo para ver os valores') && __texto('Conta corrente')", "cards com dados");
  const id = (await api("/api/dashboards")).find((d) => d.nome === "Finanças pessoais").id;
  const widgets = (await api(`/api/dashboards/${id}`)).widgets;
  const esperado = [...widgets].sort((a, b) => a.y * 12 + a.x - (b.y * 12 + b.x)).map((w) => w.titulo);
  const naTela = await avaliar(`(() => { const t = ${JSON.stringify(esperado)}; return [...document.querySelectorAll('[role=heading]')].map((h) => h.textContent).filter((x) => t.includes(x)); })()`);
  if (JSON.stringify(naTela) !== JSON.stringify(esperado)) throw new Error(`ordem na tela ${naTela} != ${esperado}`);
  const topos = await avaliar(`[...document.querySelectorAll('[role=heading]')].filter((h) => ['Receitas', 'Despesas'].includes(h.textContent)).map((h) => Math.round(h.getBoundingClientRect().top))`);
  if (topos.length !== 2 || topos[0] !== topos[1]) throw new Error(`Receitas e Despesas não estão lado a lado: ${topos}`);
  await print("dashboard-financas");
  await conferirTela("dashboard");
});
await passo("dashboard: tocar num grupo mostra os valores", async () => {
  await avaliar(`[...document.querySelectorAll('rect[fill="transparent"]')][0].dispatchEvent(new MouseEvent('click', { bubbles: true })); true`);
  await ate("/[a-z]{3}\\/\\d{2}: Entrada R\\$/.test(document.body.innerText.replace(/\\u00a0/g, ' '))", "valores do grupo");
  await print("dashboard-grupo");
});
await passo("dashboard Estudos: rosca, calendário e meta", async () => {
  await avaliar(`__rot('Voltar').click(); true`);
  await ate("!!__rot('Dashboard Estudos')", "início");
  await ajuda();
  await abrirDashboard("Estudos");
  await ate("__texto('Toque num dia para ver o valor') && __texto('Dias ativos') && !!document.querySelector('[role=progressbar]') && !!__rotIni('Matemática: ')", "cards de Estudos");
  await avaliar(`__rotIni('Matemática: ').click(); true`);
  await ate("/\\d+%/.test(document.body.innerText)", "porcentagem da fatia");
  await print("dashboard-estudos");
  await conferirTela("dashboard Estudos");
  await avaliar(`__rot('Voltar').click(); true`);
  await ate("!!__rot('Dashboard Estudos')", "início");
});
await passo("módulo: resumo, cartões e busca", async () => {
  await ajuda();
  await avaliar(`__rotIni('Lançamentos, ').click(); true`);
  await ate("__cartoes() === 12 && __texto('Receitas')", "12 cartões e resumo");
  await print("modulo");
  await conferirTela("módulo");
  await avaliar(`__valor(__rot('Buscar em Lançamentos'), 'Aporte'); true`);
  await ate("__cartoes() === 1", "1 resultado");
  await avaliar(`__valor(__rot('Buscar em Lançamentos'), ''); true`);
  await ate("__cartoes() === 12", "volta a 12");
});
await passo("lançar com '123,45' e a data de hoje", async () => {
  await avaliar(`__rot('Lançar em Lançamentos').click(); true`);
  await ate("!!__rot('Descrição') && !!document.querySelector('[aria-label=\"Hoje\"][aria-checked=true]')", "formulário com Hoje marcado");
  await ajuda();
  await print("formulario");
  await conferirTela("formulário");
  const cat = await avaliar(`[...document.querySelector('[aria-label="Categoria"][role=radiogroup]').querySelectorAll('[role=radio]')][0].getAttribute('aria-label')`);
  await avaliar(`__valor(__rot('Descrição'), 'Teste celular'); __valor(__rot('Valor'), '123,45');
    [...document.querySelector('[aria-label="Categoria"][role=radiogroup]').querySelectorAll('[role=radio]')][0].click(); true`);
  await ate(`!!document.querySelector('[aria-label="${cat}"][aria-checked=true]')`, "categoria marcada");
  await avaliar(`__botao('Lançar').click(); true`);
  await ate("__cartoes() === 13 && __texto('Lançado em Lançamentos') && __texto('R$ 123,45')", "13 cartões e aviso");
  const r = (await api("/api/modulos/lancamentos/registros?q=Teste%20celular")).result[0];
  const h = new Date();
  const iso = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
  if (r.valor !== 123.45 || r.data !== iso || r.tipo !== "saida") throw new Error(`no banco: ${JSON.stringify(r)}`);
});
await passo("editar: tocar no cartão e salvar", async () => {
  await ajuda();
  await avaliar(`__rotIni('Teste celular.').click(); true`);
  await ate("__rot('Descrição')?.value === 'Teste celular' && __rot('Valor')?.value === '123,45'", "formulário com o registro");
  await avaliar(`__valor(__rot('Valor'), '200'); __rot('Salvar').click(); true`);
  await ate("__texto('Registro atualizado') && __texto('R$ 200,00')", "valor atualizado");
});
await passo("erro do servidor aparece no formulário", async () => {
  await ajuda();
  await avaliar(`__rot('Lançar em Lançamentos').click(); true`);
  await ate("!!__rot('Descrição')", "formulário");
  await avaliar(`__botao('Lançar').click(); true`);
  await ate("!!document.querySelector('[role=alert]')", "erro do servidor");
  await avaliar(`__rot('Voltar').click(); true`);
  await ate("__cartoes() === 13", "de volta à lista");
});
await passo("excluir com confirmação", async () => {
  await ajuda();
  await avaliar(`__rotIni('Teste celular.').click(); true`);
  await ate("!!__rot('Excluir registro')", "edição");
  await avaliar(`__rot('Excluir registro').click(); true`);
  await ate("__texto('Isso não pode ser desfeito.')", "confirmação");
  await avaliar(`__botao('Excluir').click(); true`);
  await ate("__cartoes() === 12 && __texto('Registro excluído')", "12 cartões");
});
await passo("ajustes: tema Floresta noite salvo na conta; lembretes só no celular", async () => {
  await ajuda();
  await avaliar(`__rot('Voltar').click(); true`);
  await ate("!!__rot('Ajustes')", "início");
  await avaliar(`__rot('Ajustes').click(); true`);
  await ate("!!__rotIni('Floresta noite.') && __texto('Os lembretes funcionam no app do celular')", "ajustes");
  await ajuda();
  await conferirTela("ajustes");
  await avaliar(`__rotIni('Floresta noite.').click(); true`);
  await ate("[...document.querySelectorAll('div')].some((d) => getComputedStyle(d).backgroundColor === 'rgb(12, 20, 16)')", "fundo verde-escuro");
  await ate("fetch('/api/status').then((r) => r.json()).then((d) => d.usuario.preferencias.tema === 'floresta_noite')", "salvo na conta");
  await espera(300);
  await print("ajustes-floresta-noite");
  await avaliar(`__rot('Voltar').click(); true`);
  await ate("__texto('Olá, Admin Teste')", "início");
  await avaliar(`__rot('Dashboard Finanças pessoais').click(); true`);
  await ate("__texto('R$ 11.300,00')", "dashboard no tema");
  await espera(400);
  await print("dashboard-floresta-noite");
  await avaliar(`__rot('Voltar').click(); true`);
  await avaliar("fetch('/api/eu/preferencias', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tema: 'sistema' }) }).then((r) => r.ok)");
});
await passo("sair volta à tela de entrar", async () => {
  await ajuda();
  await avaliar(`__rot('Ajustes').click(); true`);
  await ate("!!__rot('Sair')", "ajustes");
  await avaliar(`__rot('Sair').click(); true`);
  await ate("!!document.querySelector('input[aria-label=\"Usuário\"]')", "tela de entrar");
});
for (const t of outras) {
  await passo(`tela ${t.largura}x${t.altura}: início, dashboard e formulário cabem`, async () => {
    await tela(t);
    await entrar();
    await conferirTela("início");
    await abrirDashboard("Finanças pessoais");
    await ate("__texto('R$ 11.300,00')", "dashboard");
    await conferirTela("dashboard");
    await print(`dashboard-${t.largura}`);
    await avaliar(`__rot('Voltar').click(); true`);
    await ate("!!__rot('Lançar em Lançamentos')", "início");
    await avaliar(`__rot('Lançar em Lançamentos').click(); true`);
    await ate("!!__rot('Descrição')", "formulário");
    await ajuda();
    await conferirTela("formulário");
  });
}
res.push(errosJs.length ? `FALHA erros de JavaScript: ${errosJs.slice(0, 3).join(" | ")}` : "OK    sem erros de JavaScript");
console.log(res.at(-1));

ws.close();
// Fecha o navegador e espera ele sair, para a próxima rodada usar a mesma porta.
await new Promise((ok) => { nav.once("exit", ok); nav.kill(); setTimeout(ok, 5000); });
await app.fechar();
const falhas = res.filter((r) => r.startsWith("FALHA")).length;
fs.writeFileSync(path.join(P.saida, "resultado.txt"), res.join("\n") + "\n");
console.log(`\n${res.length - falhas} ok, ${falhas} falha(s). Prints em ${P.saida}`);
process.exit(falhas ? 1 : 0);
