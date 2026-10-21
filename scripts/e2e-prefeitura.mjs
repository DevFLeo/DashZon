// Teste de ponta a ponta do Prefeitura DashZ no navegador (Chrome headless via
// DevTools Protocol, sem dependências: Node 22+ tem WebSocket nativo).
//
// Use SÓ numa instância separada e zerada (o script faz o setup):
//   powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1 -Porta 4580 -Banco data\teste-pdz.db
//   node scripts\e2e-prefeitura.mjs --porta 4580 [--chrome caminho\chrome.exe]
//
// Percorre: setup pela tela, estrutura (unidade pela tela + estrutura modelo),
// as entidades de teste (2 secretarias, 2 subsecretarias, 2 departamentos, 2
// divisões e os usuários de cada nível), Larissa/Marvin/Eduardo/Hayrine, e
// confere com cada um: links do gestor, Minha equipe, Painel do gestor,
// lançamento por unidade, 403 fora da unidade, quadro, agenda, classificar
// por, expansão do card, períodos do calendário, temas floresta e excluir
// caderno de anotações. Prints e resultado em log/e2e/<data>/.
// Sai com código 1 se alguma checagem falhar.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, l) => (v.startsWith("--") ? [...a, [v.slice(2), l[i + 1]]] : a), []));
const PORTA = Number(args.porta || 4580);
const BASE = `http://127.0.0.1:${PORTA}/`;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = join(RAIZ, "log", "e2e", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
mkdirSync(SAIDA, { recursive: true });
const SENHA = "senha-teste-2026";

function acharChrome() {
  if (args.chrome) return args.chrome;
  const cands = [
    `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`
  ];
  const pup = join(homedir(), ".cache", "puppeteer", "chrome");
  if (existsSync(pup)) {
    for (const v of readdirSync(pup)) {
      const dentro = join(pup, v);
      for (const d of readdirSync(dentro)) if (existsSync(join(dentro, d, "chrome.exe"))) cands.push(join(dentro, d, "chrome.exe"));
    }
  }
  return cands.find((c) => c && existsSync(c));
}

const resultados = [];
const errosConsole = [];
function checar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok: Boolean(ok), detalhe: String(detalhe).slice(0, 400) });
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}${ok || !detalhe ? "" : ` -> ${String(detalhe).slice(0, 300)}`}`);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = acharChrome();
  if (!chrome) throw new Error("Chrome/Edge não encontrado (use --chrome)");
  const perfil = join(tmpdir(), `pdz-e2e-${Date.now()}`);
  const portaCdp = 9400 + Math.floor(Math.random() * 400);
  const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${portaCdp}`, `--user-data-dir=${perfil}`, "--no-first-run",
    "--no-default-browser-check", "--window-size=1366,900", "about:blank"], { stdio: "ignore" });
  try {
    let alvo = null;
    for (let i = 0; i < 60 && !alvo; i++) {
      try { alvo = (await (await fetch(`http://127.0.0.1:${portaCdp}/json/list`)).json()).find((t) => t.type === "page"); } catch { await esperar(250); }
    }
    if (!alvo) throw new Error("DevTools não respondeu");
    const ws = new WebSocket(alvo.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let seq = 0;
    const pend = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
      if (m.method === "Page.javascriptDialogOpening") cdp("Page.handleJavaScriptDialog", { accept: true });
      if (m.method === "Runtime.exceptionThrown") errosConsole.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errosConsole.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
    };
    const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    await cdp("Page.enable");
    await cdp("Runtime.enable");

    const js = async (expr) => {
      const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "erro no js");
      return r.result?.result?.value;
    };
    const ate = async (cond, seg = 15) => {
      for (let i = 0; i < seg * 10; i++) { try { if (await js(`Boolean(${cond})`)) return true; } catch { /* página trocando */ } await esperar(100); }
      return false;
    };
    const tamanho = (w, h) => cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    const print = async (nome) => {
      const r = await cdp("Page.captureScreenshot", { format: "png" });
      if (r.result?.data) writeFileSync(join(SAIDA, `${nome}.png`), Buffer.from(r.result.data, "base64"));
    };
    const ir = async (hash, cond) => { await js(`location.hash = ${JSON.stringify(hash)}; 0`); return ate(cond); };
    const api = (metodo, caminho, corpo) => js(`fetch(${JSON.stringify(caminho)}, { method: ${JSON.stringify(metodo)}, headers: { "Content-Type": "application/json" }, body: ${corpo ? JSON.stringify(JSON.stringify(corpo)) : "undefined"} })
      .then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }))`);
    // Troca de usuário: antes sai da página do app (uma requisição ainda em voo
    // da conta anterior regravaria o cookie de sessão dela depois do login).
    const entrar = async (login) => {
      await cdp("Page.navigate", { url: `${BASE}api/status` });
      await esperar(700);
      await api("POST", "/api/logout", {});
      const r = await api("POST", "/api/login", { usuario: login, senha: SENHA });
      await cdp("Page.navigate", { url: BASE });
      await ate("document.getElementById('app')?.classList.contains('ready')", 20);
      await esperar(400);
      return r.status;
    };

    // ------------------------------------------------------------ setup ----
    await tamanho(1366, 900);
    await cdp("Page.navigate", { url: BASE });
    checar("setup aparece numa instância zerada", await ate("document.getElementById('setup')?.classList.contains('open') && document.querySelectorAll('#setup-galeria .tpl-card').length >= 1", 20));
    const nomesGaleria = await js("[...document.querySelectorAll('#setup-galeria .tpl-card h3, #setup-galeria .tpl-card strong')].map(e => e.textContent).join(' | ')");
    checar("galeria sem finanças, fluxo de caixa, cronograma e lote", !/finan|fluxo de caixa|cronograma|lote/i.test(nomesGaleria), nomesGaleria);
    checar("setup não vem com modelo marcado nem dados de exemplo", await js("!document.querySelector('#setup-galeria .tpl-card.selected') && !document.getElementById('setup-exemplos').checked"));
    checar("marca Prefeitura DashZ no setup", (await js("document.querySelector('#setup h1').textContent")).includes("Prefeitura DashZ"));
    await print("01-setup");
    await js(`(() => {
      document.getElementById('setup-org').value = 'SEMEC - Teste';
      document.getElementById('setup-exemplos').checked = true; // a instância de teste usa os dados de exemplo
      document.getElementById('setup-usuario').value = 'admteste';
      document.getElementById('setup-senha').value = ${JSON.stringify(SENHA)};
      const conf = document.getElementById('setup-senha2') || document.querySelector('#setup-form input[type=password]:not(#setup-senha)');
      if (conf) conf.value = ${JSON.stringify(SENHA)};
      document.querySelectorAll('#setup-galeria .tpl-card').forEach(c => { if (!c.classList.contains('selected') && !c.getAttribute('aria-pressed')?.includes('true')) c.click(); });
      return 0; })()`);
    await js("document.querySelector('#setup-form [type=submit]').click(); 0");
    checar("setup pela tela abre o sistema", await ate("document.getElementById('app')?.classList.contains('ready')", 30), await js("document.querySelector('#setup .form-erro:not([hidden])')?.textContent || ''"));
    checar("título da aba com o novo nome", (await js("document.title")).startsWith("Prefeitura DashZ"));
    await esperar(800);
    await print("02-dashboard-admin");

    // ---------------------------------------------- estrutura e pessoas ----
    await js("window.confirm = () => true; 0");
    await ir("#/admin", "document.getElementById('view-admin').classList.contains('active')");
    await js("document.getElementById('btn-criar').click(); document.getElementById('btn-estrutura-modelo').click(); 0");
    checar("estrutura modelo pelo menu Criar", await ate("document.querySelectorAll('#admin-equipes .tabela-unidades tbody tr').length >= 9", 10));
    // Uma unidade pela tela: "+ Dentro" na DIPLAD.
    await js(`(() => { const tr = [...document.querySelectorAll('#admin-equipes tbody tr')].find(t => t.textContent.includes('DIPLAD')); tr.querySelector('[data-eq-filha]').click(); return 0; })()`);
    await ate("document.getElementById('modal-equipe').classList.contains('open')");
    checar("+ Dentro sugere divisão dentro de departamento", (await js("document.getElementById('eq-tipo').value")) === "divisao");
    await print("03-modal-unidade");
    await js(`(() => { document.getElementById('eq-sigla').value = 'DIPLAD1'; document.getElementById('eq-nome').value = 'Divisão de Planejamento 1';
      document.querySelector('#form-equipe [type=submit]').click(); return 0; })()`);
    checar("unidade criada pela tela dentro do DIPLAD", await ate("[...document.querySelectorAll('#admin-equipes tbody tr')].some(t => t.textContent.includes('DIPLAD1'))", 10));
    const repetida = await api("POST", "/api/admin/equipes", { sigla: "dgeo", nome: "Outro", tipo: "departamento" });
    checar("sigla repetida é recusada", repetida.status === 422, JSON.stringify(repetida.corpo));

    const ids = Object.fromEntries((await api("GET", "/api/admin/equipes")).corpo.map((e) => [e.sigla, e.id]));
    // Duas de cada (pedido 8).
    for (const n of [1, 2]) {
      const sec = await api("POST", "/api/admin/equipes", { sigla: `SECTESTE${n}`, nome: `secretariasteste${n}`, tipo: "secretaria" });
      const sub = await api("POST", "/api/admin/equipes", { sigla: `SUBTESTE${n}`, nome: `subsecretariateste${n}`, tipo: "subsecretaria", pai_id: sec.corpo.id });
      const dep = await api("POST", "/api/admin/equipes", { sigla: `DEPTESTE${n}`, nome: `departamentoteste${n}`, tipo: "departamento", pai_id: sub.corpo.id });
      const div = await api("POST", "/api/admin/equipes", { sigla: `DIVTESTE${n}`, nome: `divisaoteste${n}`, tipo: "divisao", pai_id: dep.corpo.id });
      Object.assign(ids, { [`SECTESTE${n}`]: sec.corpo.id, [`SUBTESTE${n}`]: sub.corpo.id, [`DEPTESTE${n}`]: dep.corpo.id, [`DIVTESTE${n}`]: div.corpo.id });
      checar(`árvore de teste ${n} criada`, [sec, sub, dep, div].every((r) => r.status === 201), [sec, sub, dep, div].map((r) => r.status).join(","));
    }
    const pessoas = [
      ["larissa", { gestor_de: [ids.SUPLAN, ids["SURÇAM"]] }], ["marvin", { gestor_de: [ids.DGEO] }],
      ["eduardo", { gestor_de: [ids.DTAD] }], ["hayrine", { equipes: [ids.DCAD] }], ["davi", { gestor_de: [ids.DASI] }],
      ["usuariosecretariateste1", { gestor_de: [ids.SECTESTE1] }], ["usuariosecretariateste2", { gestor_de: [ids.SECTESTE2] }],
      ["usuariosubsecretariateste1", { gestor_de: [ids.SUBTESTE1] }], ["usuariosubsecretariateste2", { gestor_de: [ids.SUBTESTE2] }],
      ["usuariodepartamentoteste1", { gestor_de: [ids.DEPTESTE1] }], ["usuariodepartamentoteste2", { gestor_de: [ids.DEPTESTE2] }],
      ["usuariodivisaoteste1", { equipes: [ids.DIVTESTE1] }], ["usuariodivisaoteste2", { equipes: [ids.DIVTESTE2] }]
    ];
    for (const [login, u] of pessoas) {
      const r = await api("POST", "/api/admin/usuarios", { login, nome: login[0].toUpperCase() + login.slice(1), senha: SENHA, deve_trocar_senha: false,
        equipes: u.equipes || [], gestor_de: u.gestor_de || [] });
      if (r.status !== 201) checar(`criar ${login}`, false, JSON.stringify(r.corpo));
    }
    checar("13 contas de teste criadas", (await api("GET", "/api/admin/usuarios")).corpo.length === 14);
    // Módulo de teste por unidade, visível para todos.
    await api("POST", "/api/modulos", { slug: "teste_unidades", nome: "Teste por unidade", unidade: "unidade",
      produtividade: { status: "status", concluido: ["Feito"], prazo: "prazo" },
      campos: [{ id: "titulo", nome: "Título", tipo: "texto", obrigatorio: true },
        { id: "unidade", nome: "Unidade", tipo: "selecao", obrigatorio: true, opcoes: ["DIVTESTE1 - divisaoteste1", "DIVTESTE2 - divisaoteste2", "DEPTESTE1 - departamentoteste1", "DEPTESTE2 - departamentoteste2"] },
        { id: "status", nome: "Status", tipo: "selecao", opcoes: ["Aberto", "Em andamento", "Feito"], padrao: "Aberto" },
        { id: "prazo", nome: "Prazo", tipo: "data" }] });
    await api("PUT", "/api/modulos/teste_unidades/compartilhar", { visibilidade: "todos" });
    await js("location.reload(); 0");
    await ate("document.getElementById('app')?.classList.contains('ready')", 20);
    await ir("#/admin", "document.querySelectorAll('#admin-equipes tbody tr').length > 15");
    await esperar(300);
    await print("04-admin-estrutura");

    // --------------------------------------------- admin: painel e módulo ----
    checar("admin vê os links do gestor", await js("!document.getElementById('link-produtividade').hidden && !document.getElementById('link-equipe').hidden"));
    await ir("#/produtividade", "!!document.querySelector('#prod-tabela table')");
    const semec = await js("[...document.querySelectorAll('#prod-tabela tbody tr')].find(t => t.textContent.includes('SEMEC'))?.querySelectorAll('td')[0]?.textContent");
    const dgeo = await js("[...document.querySelectorAll('#prod-tabela tbody tr')].find(t => t.querySelector('strong')?.textContent === 'DGEO')?.querySelectorAll('td')[0]?.textContent");
    checar("painel: SEMEC soma o DGEO (exemplos do template)", Number(semec) >= Number(dgeo) && Number(dgeo) > 0, `SEMEC ${semec}, DGEO ${dgeo}`);
    await print("05-painel-gestor-admin");
    await ir("#/m/demandas", "!!document.querySelector('#mod-tabela table.data tbody tr')");
    const ordemAntes = await js("[...document.querySelectorAll('#mod-tabela tbody tr td:first-child')].map(t => t.textContent.trim())");
    await js("((s) => { s.value = 'titulo_processo:asc'; s.dispatchEvent(new Event('change')); })(document.getElementById('mod-ordem')); 0");
    await esperar(800);
    const ordemAz = await js("[...document.querySelectorAll('#mod-tabela tbody tr td:first-child')].map(t => t.textContent.trim())");
    const esperado = [...ordemAz].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
    checar("classificar por A-Z", JSON.stringify(ordemAz) === JSON.stringify(esperado) && ordemAz.length === ordemAntes.length, ordemAz.join(" | "));
    await js("((s) => { s.value = 'data_limite:asc'; s.dispatchEvent(new Event('change')); })(document.getElementById('mod-ordem')); 0");
    await esperar(800);
    await print("06-modulo-classificar-prazo");
    await js("document.querySelector('#mod-visoes [data-visao=quadro]').click(); 0");
    checar("quadro abre com colunas por status", await ate("document.querySelectorAll('#mod-quadro .quadro-coluna').length === 5"));
    await print("07-quadro");
    const cartao = await js("document.querySelector('#mod-quadro .quadro-coluna .cartao')?.dataset.id");
    const colAntes = await js(`document.querySelector('#mod-quadro .cartao[data-id="${cartao}"]').closest('.quadro-coluna').dataset.coluna`);
    await js(`document.querySelector('#mod-quadro .cartao[data-id="${cartao}"] [data-mover="1"]').click(); 0`);
    await esperar(1200);
    const colDepois = await js(`document.querySelector('#mod-quadro .cartao[data-id="${cartao}"]')?.closest('.quadro-coluna').dataset.coluna`);
    checar("quadro: seta move o cartão para a próxima coluna", colAntes !== colDepois && colDepois, `${colAntes} -> ${colDepois}`);
    await js("((s) => { s.value = 'DTAD - Divisão de Tecnologia e Dados'; s.dispatchEvent(new Event('change')); })(document.getElementById('qd-depto')); 0");
    await esperar(800);
    const deptos = await js("[...document.querySelectorAll('#mod-quadro .cartao')].length");
    checar("quadro filtrado por departamento (DTAD)", deptos >= 1 && deptos < 8, String(deptos));
    await print("08-quadro-dtad");
    await js("localStorage.setItem('dashzon.quadro.depto.demandas', ''); document.querySelector('#mod-visoes [data-visao=agenda]').click(); 0");
    checar("agenda abre com 31 dias (-15/+15)", await ate("document.querySelectorAll('#mod-agenda .agenda-dia').length === 31"));
    await js("document.querySelector('[data-ag-janela=\"-30+30\"]').click(); 0");
    checar("agenda -30/+30 mostra 61 dias", await ate("document.querySelectorAll('#mod-agenda .agenda-dia').length === 61"));
    await print("09-agenda");
    await js("document.querySelector('#mod-visoes [data-visao=tabela]').click(); 0");

    // --------------------------------------------- dashboard: expansão ----
    const dash = await js("App.dashboards().find(d => d.nome === 'Demandas DGEO')?.id");
    await ir(`#/d/${dash}`, "document.querySelectorAll('.grid-stack-item').length >= 9");
    await esperar(1500);
    await js(`[...document.querySelectorAll('.grid-stack-item')].find(i => i.textContent.includes('Carga por servidor')).querySelector('.link-expandir').click(); 0`);
    checar("expansão pela linha da tabela", await ate("!!document.querySelector('#exp-lista table') && document.getElementById('modal-expandir').classList.contains('open')"));
    await print("10-expandir-tabela");
    await js("document.querySelectorAll('.modal-overlay.open').forEach(o => o.classList.remove('open')); 0");
    // Barra "Média" em "Demandas por prioridade": clique no centro da barra pelo Chart.js.
    const clicouBarra = await js(`(() => {
      const item = [...document.querySelectorAll('.grid-stack-item')].find(i => i.querySelector('.title')?.textContent === 'Demandas por prioridade');
      const canvas = item.querySelector('canvas'); const ch = Chart.getChart(canvas);
      const idx = ch.data.labels.indexOf('Média'); if (idx < 0) return false;
      const el = ch.getDatasetMeta(0).data[idx]; const r = canvas.getBoundingClientRect();
      const x = r.left + el.x; const y = r.top + (el.y + el.base) / 2;
      ['mousemove', 'mousedown', 'mouseup', 'click'].forEach(t => canvas.dispatchEvent(new MouseEvent(t, { clientX: x, clientY: y, bubbles: true })));
      return true; })()`);
    const okBarra = clicouBarra && await ate("document.getElementById('modal-expandir').classList.contains('open') && document.getElementById('exp-titulo').textContent.includes('Média') && !!document.querySelector('#exp-resumo table')");
    const resumoMedia = await js("document.getElementById('exp-resumo').textContent");
    checar("expansão: clicar em 'Média' lista as demandas médias por divisão e prazo", okBarra && /Próximo prazo/.test(resumoMedia), resumoMedia);
    await print("11-expandir-media");
    await js("document.querySelectorAll('.modal-overlay.open').forEach(o => o.classList.remove('open')); 0");
    const cal = await js("[...document.querySelectorAll('.grid-stack-item')].find(i => i.querySelector('.title')?.textContent.includes('calendário'))?.getAttribute('gs-id')");
    // Período = zoom do mesmo calendário do ano (seletor no cabeçalho do card).
    const periodo = (v) => js(`((s) => { s.value = '${v}'; s.dispatchEvent(new Event('change')); })(document.querySelector('[gs-id="${cal}"] [data-cal-periodo]')); 0`);
    const diasCal = `document.querySelectorAll('[gs-id="${cal}"] .cal-grade .cal-dia[data-chave]')`;
    const tamCel = `parseFloat(getComputedStyle(document.querySelector('[gs-id="${cal}"] .cal-grade .cal-dia[data-chave]')).width)`;
    const celAno = await js(tamCel);
    await periodo("-15+15");
    checar("calendário -15/+15: 31 dias, mesma grade do ano com zoom", await ate(`${diasCal}.length === 31 && !!document.querySelector('[gs-id="${cal}"] .cal-grade.cal-zoom') && ${tamCel} > ${celAno}`), `ano ${celAno}px`);
    await periodo("+30");
    checar("calendário +30: 31 dias a partir de hoje", await ate(`${diasCal}.length === 31 && ${diasCal}[0].classList.contains('hoje')`));
    await periodo("-30+30");
    await ate(`${diasCal}.length === 61`);
    await esperar(300);
    await print("12-calendario-30-30");
    await js(`(document.querySelector('[gs-id="${cal}"] .cal-grade .cal-dia[data-chave][data-nivel="1"], [gs-id="${cal}"] .cal-grade .cal-dia[data-chave][data-nivel="2"], [gs-id="${cal}"] .cal-grade .cal-dia[data-chave][data-nivel="3"], [gs-id="${cal}"] .cal-grade .cal-dia[data-chave][data-nivel="4"]') || document.querySelector('[gs-id="${cal}"] .cal-dia.hoje')).click(); 0`);
    checar("clicar num dia do calendário lista o previsto no dia", await ate("document.getElementById('modal-expandir').classList.contains('open') && /registro/.test(document.getElementById('exp-sub').textContent)"));
    await print("13-expandir-dia");
    await js("document.querySelectorAll('.modal-overlay.open').forEach(o => o.classList.remove('open')); 0");
    await periodo("padrao");
    checar("calendário volta ao Ano (sem zoom)", await ate(`!!document.querySelector('[gs-id="${cal}"] .cal-grade') && !document.querySelector('[gs-id="${cal}"] .cal-zoom')`));

    // ------------------------------------------------------------ temas ----
    for (const [tema, attr] of [["floresta_dia", "forest-day"], ["floresta_tarde", "forest-dusk"], ["floresta_noite", "forest-night"]]) {
      await js(`Tema.aplicar('${tema}'); 0`);
      await esperar(500);
      checar(`tema ${tema}`, (await js("document.documentElement.getAttribute('data-theme')")) === attr);
      await print(`14-tema-${tema}`);
    }
    await js("document.querySelector('.sidebar .tema-btn').click(); 0");
    checar("botão do tema gira dentro da floresta (noite -> dia)", (await js("document.documentElement.getAttribute('data-theme')")) === "forest-day");
    await js("Tema.aplicar('claro'); 0");

    // ------------------------------------------ perfis em cascata ----
    // Hayrine (membro DCAD): sem links de gestor; só lança no DCAD; não edita o DTAD.
    checar("login hayrine", (await entrar("hayrine")) === 200);
    checar("membro comum não vê links do gestor", await js("document.getElementById('link-produtividade').hidden && document.getElementById('link-equipe').hidden"));
    await ir("#/m/demandas", "!!document.querySelector('#mod-tabela tbody tr')");
    await js("document.getElementById('btn-novo-registro').click(); 0");
    await ate("document.getElementById('modal-registro').classList.contains('open')");
    const opsHay = await js("[...document.querySelectorAll('#r-divisao_responsavel option')].map(o => o.value).filter(Boolean)");
    checar("formulário da Hayrine só oferece o DCAD", JSON.stringify(opsHay) === JSON.stringify(["DCAD - Divisão de Cadastro (Dados)"]), opsHay.join(","));
    await print("15-hayrine-form");
    await js("document.querySelectorAll('.modal-overlay.open').forEach(o => o.classList.remove('open')); 0");
    const regs = (await api("GET", "/api/modulos/demandas/registros?limite=100")).corpo.result;
    const dtad = regs.find((r) => r.divisao_responsavel.startsWith("DTAD"));
    const dcad = regs.find((r) => r.divisao_responsavel.startsWith("DCAD"));
    checar("Hayrine não altera demanda do DTAD (403)", (await api("PATCH", `/api/modulos/demandas/registros/${dtad.id}`, { prioridade: "Baixa" })).status === 403);
    checar("Hayrine altera demanda do DCAD", (await api("PATCH", `/api/modulos/demandas/registros/${dcad.id}`, { prioridade: "Alta" })).status === 200);
    checar("Hayrine não exclui demanda do DCAD de outra pessoa (403)", (await api("DELETE", `/api/modulos/demandas/registros/${dcad.id}`)).status === 403);
    // Pela tela: excluir mostra a mensagem do servidor.
    await js(`(() => { const b = document.querySelector('#mod-tabela [data-excluir="${dtad.id}"]'); if (b) b.click(); return 0; })()`);
    checar("tela mostra o aviso de unidade ao excluir", await ate("/outra unidade/.test(document.getElementById('toast').textContent)"), await js("document.getElementById('toast').textContent"));

    // Eduardo (gestor DTAD): Minha equipe só DTAD; painel só DTAD; não lança no DCAD.
    checar("login eduardo", (await entrar("eduardo")) === 200);
    await ir("#/equipe", "!!document.querySelector('#eqp-unidades table')");
    const unEdu = await js("[...document.querySelectorAll('#eqp-unidades tbody tr strong')].map(s => s.textContent)");
    checar("Minha equipe do Eduardo = só DTAD", JSON.stringify(unEdu) === '["DTAD"]', unEdu.join(","));
    await print("16-minha-equipe-eduardo");
    await ir("#/produtividade", "!!document.querySelector('#prod-tabela table')");
    const unProdEdu = await js("[...document.querySelectorAll('#prod-tabela tbody tr strong')].map(s => s.textContent)");
    checar("painel do Eduardo = só DTAD", JSON.stringify(unProdEdu) === '["DTAD"]', unProdEdu.join(","));
    checar("Eduardo não lança no DCAD", (await api("POST", "/api/modulos/demandas/registros", { titulo_processo: "x", status_tramitacao: "Em Análise", prioridade: "Média", divisao_responsavel: "DCAD - Divisão de Cadastro (Dados)", descricao_demanda: "x" })).status === 403);
    const novaEdu = await api("POST", "/api/modulos/demandas/registros", { titulo_processo: "Demanda do Edu", status_tramitacao: "Em Análise", prioridade: "Média", divisao_responsavel: "DTAD - Divisão de Tecnologia e Dados", data_limite: new Date().toISOString().slice(0, 10), descricao_demanda: "x" });
    checar("Eduardo lança no DTAD", novaEdu.status === 201);
    checar("Eduardo exclui demanda do DTAD (gestor)", (await api("DELETE", `/api/modulos/demandas/registros/${dtad.id}`)).status === 200);
    // Caderno de anotações criado pelo Eduardo (uma "aba" nova), compartilhado com o DTAD.
    const slugNotas = "notas_dtad";
    const novoCaderno = await api("POST", "/api/modulos", { slug: slugNotas, nome: "Notas do DTAD", visao: { tipo: "notas", titulo: "titulo", conteudo: "conteudo", pasta: "pasta" },
      campos: [{ id: "titulo", nome: "Título", tipo: "texto", obrigatorio: true }, { id: "pasta", nome: "Pasta", tipo: "texto" }, { id: "conteudo", nome: "Conteúdo", tipo: "markdown" }] });
    checar("Eduardo cria um caderno de anotações", novoCaderno.status === 201, JSON.stringify(novoCaderno.corpo));
    await api("POST", `/api/modulos/${slugNotas}/registros`, { titulo: "Pauta da semana", conteudo: "- [ ] revisar camadas" });
    const comp = await api("PUT", `/api/modulos/${slugNotas}/compartilhar`, { visibilidade: "equipes", equipes: [ids.DTAD] });
    checar("Eduardo compartilha o caderno com o DTAD", comp.status === 200, `${slugNotas} ${comp.status}`);

    // Marvin (gestor DGEO): vê DGEO/DCAD/DTAD/DASI; exclui o caderno do Eduardo pela tela.
    checar("login marvin", (await entrar("marvin")) === 200);
    await ir("#/equipe", "!!document.querySelector('#eqp-unidades table')");
    const unMarvin = await js("[...document.querySelectorAll('#eqp-unidades tbody tr strong')].map(s => s.textContent).sort()");
    checar("Minha equipe do Marvin = DGEO, DCAD, DTAD, DASI", JSON.stringify(unMarvin) === JSON.stringify(["DASI", "DCAD", "DGEO", "DTAD"]), unMarvin.join(","));
    await print("17-minha-equipe-marvin");
    await ir(`#/m/${slugNotas}`, "document.getElementById('view-notas').classList.contains('active')");
    checar("Marvin vê 'Excluir caderno' no caderno do DTAD", await ate("!document.getElementById('notas-excluir-caderno').hidden"));
    await print("18-notas-marvin");
    await js("window.confirm = () => true; document.getElementById('notas-excluir-caderno').click(); 0");
    checar("Marvin exclui o caderno do DTAD (cascata)", await ate(`!App.modulos().some(m => m.slug === ${JSON.stringify(slugNotas)})`, 10));
    // Marvin cria uma pessoa no DCAD pela tela.
    await ir("#/equipe", "!!document.querySelector('#eqp-unidades table')");
    await js(`[...document.querySelectorAll('#eqp-unidades tbody tr')].find(t => t.querySelector('strong')?.textContent === 'DCAD').querySelector('[data-pessoa-nova]').click(); 0`);
    await ate("document.getElementById('modal-gestao-pessoa').classList.contains('open')");
    await js("document.getElementById('gp-nome').value = 'Técnica DCAD'; document.getElementById('gp-login').value = 'tecnica.dcad'; document.querySelector('#form-gestao-pessoa [type=submit]').click(); 0");
    checar("Marvin cria pessoa no DCAD pela tela (senha temporária)", await ate("document.getElementById('modal-segredo').classList.contains('open') && document.getElementById('segredo-valor').textContent.length >= 8"));
    await js("document.querySelectorAll('.modal-overlay.open').forEach(o => o.classList.remove('open')); 0");
    checar("Marvin não cria pessoa na SURÇAM (403)", (await api("POST", "/api/gestao/usuarios", { nome: "X", login: "x.surcam", unidade_id: ids["SURÇAM"] })).status === 403);

    // Larissa (gestora SUPLAN e SURÇAM): todas as de baixo; desativa a técnica criada.
    checar("login larissa", (await entrar("larissa")) === 200);
    await ir("#/equipe", "!!document.querySelector('#eqp-unidades table')");
    const unLar = await js("[...document.querySelectorAll('#eqp-unidades tbody tr strong')].map(s => s.textContent)");
    checar("Minha equipe da Larissa tem SUPLAN, SURÇAM e tudo abaixo (sem SEMEC)", unLar.includes("SUPLAN") && unLar.includes("SURÇAM") && unLar.includes("DTAD") && unLar.includes("DIPLAD1") && !unLar.includes("SEMEC"), unLar.join(","));
    await print("19-minha-equipe-larissa");
    const tec = (await api("GET", "/api/gestao")).corpo.pessoas.find((p) => p.login === "tecnica.dcad");
    checar("Larissa desativa a técnica do DCAD", (await api("POST", `/api/gestao/usuarios/${tec.id}/ativo`, { ativo: false })).status === 200);
    await ir("#/produtividade", "!!document.querySelector('#prod-tabela table')");
    await print("20-painel-larissa");
    const unProdLar = await js("[...document.querySelectorAll('#prod-tabela tbody tr strong')].map(s => s.textContent)");
    checar("painel da Larissa começa na SUPLAN e na SURÇAM", unProdLar[0] === "SUPLAN" && unProdLar.includes("SURÇAM") && !unProdLar.includes("SEMEC"), unProdLar.join(","));

    // Duas de cada: cada árvore de teste só enxerga e altera a sua.
    checar("login usuariodivisaoteste1", (await entrar("usuariodivisaoteste1")) === 200);
    checar("divisão 1 lança na divisão 1", (await api("POST", "/api/modulos/teste_unidades/registros", { titulo: "a1", unidade: "DIVTESTE1 - divisaoteste1", prazo: new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10) })).status === 201);
    checar("divisão 1 não lança na divisão 2", (await api("POST", "/api/modulos/teste_unidades/registros", { titulo: "x", unidade: "DIVTESTE2 - divisaoteste2" })).status === 403);
    checar("login usuariodivisaoteste2", (await entrar("usuariodivisaoteste2")) === 200);
    const r2 = await api("POST", "/api/modulos/teste_unidades/registros", { titulo: "b2", unidade: "DIVTESTE2 - divisaoteste2", status: "Feito" });
    checar("divisão 2 lança na divisão 2", r2.status === 201);
    const a1 = (await api("GET", "/api/modulos/teste_unidades/registros")).corpo.result.find((r) => r.titulo === "a1");
    checar("divisão 2 não altera registro da divisão 1", (await api("PATCH", `/api/modulos/teste_unidades/registros/${a1.id}`, { status: "Feito" })).status === 403);
    checar("login usuariodepartamentoteste1", (await entrar("usuariodepartamentoteste1")) === 200);
    checar("departamento 1 altera registro da divisão 1 (cascata)", (await api("PATCH", `/api/modulos/teste_unidades/registros/${a1.id}`, { status: "Em andamento" })).status === 200);
    checar("departamento 1 não altera a divisão 2", (await api("PATCH", `/api/modulos/teste_unidades/registros/${r2.corpo.id}`, { status: "Aberto" })).status === 403);
    const prodDep1 = (await api("GET", "/api/produtividade?modulo=teste_unidades")).corpo.unidades.map((u) => u.sigla);
    checar("painel do departamento 1 = DEPTESTE1 e DIVTESTE1", JSON.stringify(prodDep1) === '["DEPTESTE1","DIVTESTE1"]', prodDep1.join(","));
    checar("login usuariosecretariateste1", (await entrar("usuariosecretariateste1")) === 200);
    const prodSec1 = (await api("GET", "/api/produtividade?modulo=teste_unidades")).corpo.unidades;
    const sec1 = prodSec1.find((u) => u.sigla === "SECTESTE1");
    checar("secretaria 1 soma 1 registro (atrasado) e não vê a árvore 2", sec1?.total.total === 1 && sec1?.total.atrasados === 1 && !prodSec1.some((u) => u.sigla.endsWith("2")),
      JSON.stringify(sec1?.total));
    checar("secretaria 1 não gere pessoas da árvore 2", (await api("POST", "/api/gestao/usuarios", { nome: "X", login: "x.arvore2", unidade_id: ids.DIVTESTE2 })).status === 403);
    checar("login usuariosecretariateste2", (await entrar("usuariosecretariateste2")) === 200);
    const sec2 = (await api("GET", "/api/produtividade?modulo=teste_unidades")).corpo.unidades.find((u) => u.sigla === "SECTESTE2");
    checar("secretaria 2 soma 1 concluído (100%)", sec2?.total.concluidos === 1 && sec2?.total.taxa === 100, JSON.stringify(sec2?.total));
    await ir("#/produtividade", "!!document.querySelector('#prod-tabela table')");
    await print("21-painel-secretaria2");

    // --------------------------------------------------------- celular ----
    checar("login marvin (celular)", (await entrar("marvin")) === 200);
    await tamanho(390, 844);
    await ir("#/produtividade", "!!document.querySelector('#prod-tabela table')");
    await esperar(300);
    await print("22-celular-painel");
    await js("localStorage.setItem('dashzon.visao.demandas', 'quadro'); 0");
    await ir("#/m/demandas", "!!document.querySelector('#mod-quadro .quadro-coluna')");
    await esperar(300);
    await print("23-celular-quadro");
    const rolagem = await js("document.documentElement.scrollWidth > window.innerWidth + 1");
    checar("celular: sem rolagem horizontal na página do quadro", !rolagem);
    await js("localStorage.setItem('dashzon.visao.demandas', 'tabela'); 0");

    checar("sem erros de JavaScript no console", errosConsole.length === 0, errosConsole.slice(0, 5).join(" || "));
  } finally {
    proc.kill();
    await esperar(500);
    try { rmSync(perfil, { recursive: true, force: true }); } catch { /* Chrome ainda soltando arquivos */ }
  }
}

main().catch((e) => { checar("roteiro terminou sem exceção", false, e.stack || e.message); }).finally(() => {
  const falhas = resultados.filter((r) => !r.ok);
  writeFileSync(join(SAIDA, "resultado.json"), JSON.stringify({ base: BASE, resultados, errosConsole }, null, 2));
  console.log(`\n${resultados.length} checagens, ${falhas.length} falha(s). Prints e resultado.json em ${SAIDA}`);
  process.exit(falhas.length ? 1 : 0);
});
