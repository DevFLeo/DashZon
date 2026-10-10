// Gera os prints de prévia usados pelos ícones "(?)" (frontend/preview/*.png):
// um por módulo dos templates padrão e um por tipo de card.
//
// Use uma instância SEPARADA, com banco próprio e dados fictícios. Assim o
// seu banco não é tocado:
//
//   $env:DASHZON_DB_PATH = "$env:TEMP\dashzon-previews.db"; $env:PORT = "4600"
//   cd backend; bundle exec ruby app.rb
//   # em outro terminal: setup com os 4 templates e dados de exemplo
//   curl -X POST http://127.0.0.1:4600/api/setup -H "Content-Type: application/json" \
//     -d '{"org_name":"Demo","usuario":"demo","senha":"demo","templates":["financas-pessoais","fluxo-caixa","gestao-demandas","mapeamento-setor","cronograma-estudos"],"com_exemplos":true}'
//
// Depois (Puppeteer baixa o próprio Chromium; não é dependência do projeto):
//   npm i --no-save puppeteer
//   node scripts/gerar-previews.js http://127.0.0.1:4600 demo demo
const puppeteer = require("puppeteer");
const path = require("path");

const [base = "http://127.0.0.1:4600", usuario = "demo", senha = "demo"] = process.argv.slice(2);
const SAIDA = path.join(__dirname, "..", "frontend", "preview");
const MODULOS = ["lancamentos", "orcamento", "contas", "movimentacoes", "demandas", "inventario_dados", "indicadores", "cronograma_estudos"];
// Cards do dashboard "Finanças pessoais" usados como exemplo de cada tipo.
const CARDS = { kpi: "Saldo", bar: "Receitas x despesas por mês", line: "Saldo mês a mês", table: "Gastos por conta / cartão" };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);

  await page.goto(base, { waitUntil: "networkidle0" });
  await page.type("#login-usuario", usuario);
  await page.type("#login-senha", senha);
  await Promise.all([page.click("#login-entrar"), page.waitForSelector(".app.ready")]);
  await espera(800);

  for (const slug of MODULOS) {
    await page.goto(`${base}/#/m/${slug}`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#view-modulo.active #mod-tabela table, #view-modulo.active .empty-state");
    await espera(400);
    const box = await (await page.$(".main")).boundingBox();
    await page.screenshot({ path: path.join(SAIDA, `modulo-${slug}.png`), clip: { x: box.x, y: 0, width: box.width, height: 640 } });
    console.log("modulo", slug);
  }

  const dashes = await page.evaluate(async () => (await fetch("/api/dashboards")).json());
  const fin = dashes.find((d) => d.nome === "Finanças pessoais");
  await page.goto(`${base}/#/d/${fin.id}`, { waitUntil: "networkidle0" });
  await espera(1500);
  for (const [tipo, titulo] of Object.entries(CARDS)) {
    const el = (await page.evaluateHandle((t) =>
      [...document.querySelectorAll(".grid-stack-item-content")].find((x) => x.querySelector(".title")?.textContent === t), titulo)).asElement();
    if (!el) { console.log("card não encontrado:", titulo); continue; }
    await el.screenshot({ path: path.join(SAIDA, `card-${tipo}.png`) });
    console.log("card", tipo);
  }

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
