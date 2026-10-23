// Teste de ponta a ponta no emulador Android (o app nativo, no Expo Go).
// Toca e digita pelo adb, achando os elementos na árvore de acessibilidade
// (uiautomator): os mesmos rótulos que o leitor de tela usa.
//
// Pré-requisitos (o testes/emulador.ps1 prepara tudo):
//   emulador ligado, adb reverse das portas 8081 (Metro) e da instância de
//   teste, `npx expo start` no ar e uma instância de teste NÃO configurada.
//   Com DASHZON_TESTE_APP=apk abre o APK instalado (sem Metro nem Expo Go).
//   node testes/e2e-emulador.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PARAMETROS as P } from "./parametros.mjs";

const ADB = P.adb;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const saida = path.join(P.saida, "emulador");
fs.mkdirSync(saida, { recursive: true });
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const porta = new URL(P.api).port;
// No emulador o app fala com 127.0.0.1, que o adb reverse leva à instância.
const SERVIDOR = `http://127.0.0.1:${porta}`;
const APK = P.app === "apk";

// 1. Instância de teste não configurada: o teste faz o setup.
const status = await (await fetch(`${P.api}/api/status`)).json();
if (status.configured !== false) { console.log(`ERRO: ${P.api} já está configurada. Use uma instância de teste zerada.`); process.exit(2); }
const r0 = await fetch(`${P.api}/api/setup`, { method: "POST", headers: { "Content-Type": "application/json", Origin: P.api },
  body: JSON.stringify({ usuario: P.usuario, senha: P.senha, nome: "Admin Teste", templates: P.templates }) });
if (!r0.ok) { console.log("ERRO no setup", await r0.text()); process.exit(2); }

// --- tela -----------------------------------------------------------------
function arvore() {
  adb("shell", "uiautomator", "dump", "/sdcard/dz.xml");
  const xml = adb("shell", "cat", "/sdcard/dz.xml");
  return [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
    const a = (n) => (m[0].match(new RegExp(`${n}="([^"]*)"`)) || [])[1] || "";
    const [x1, y1, x2, y2] = (a("bounds").match(/\d+/g) || [0, 0, 0, 0]).map(Number);
    const des = (s) => s.replace(/&#10;/g, "\n").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return { texto: des(a("text")), rotulo: des(a("content-desc")), x: (x1 + x2) >> 1, y: (y1 + y2) >> 1, alt: y2 - y1, larg: x2 - x1, clicavel: a("clickable") === "true" };
  });
}
const achar = (nos, alvo) => nos.find((n) => (typeof alvo === "function" ? alvo(n) : n.rotulo === alvo || n.texto === alvo));
async function ate(alvo, desc, ms = 20000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const n = achar(arvore(), alvo);
    if (n) return n;
    await espera(700);
  }
  throw new Error(`não apareceu: ${desc}`);
}
const textoNaTela = (t) => (n) => n.texto.replace(/ /g, " ").includes(t) || n.rotulo.replace(/ /g, " ").includes(t);
const tocar = (n, dx = 0) => adb("shell", "input", "tap", String(n.x + dx), String(n.y));
// O Expo Go põe um botão flutuante de ferramentas no canto superior direito;
// se o menu dele abrir, fecha.
async function fecharMenuDoExpo() {
  const fechar = achar(arvore(), (x) => x.rotulo === "Close");
  if (fechar) { tocar(fechar); await espera(800); }
}
async function digitar(alvo, texto) {
  const n = await ate(alvo, `campo ${alvo}`);
  tocar(n);
  await espera(400);
  adb("shell", "input", "keyevent", "KEYCODE_MOVE_END");
  for (let i = 0; i < 40; i++) adb("shell", "input", "keyevent", "KEYCODE_DEL");
  adb("shell", `input text '${texto.replace(/ /g, "%s").replace(/'/g, "")}'`);
  await espera(300);
}
// Rola a tela até o elemento aparecer (o formulário é maior que a tela).
async function rolarAte(alvo, desc) {
  for (let i = 0; i < 8; i++) {
    const n = achar(arvore(), alvo);
    if (n && n.y < 2300) return n; // acima da barra de gestos
    adb("shell", "input", "swipe", "540", "1800", "540", "900", "300");
    await espera(600);
  }
  throw new Error(`não achei rolando: ${desc}`);
}
const voltar = () => adb("shell", "input", "keyevent", "KEYCODE_BACK");
const esconderTeclado = async () => { adb("shell", "input", "keyevent", "KEYCODE_ESCAPE"); await espera(300); };
function print(nome) { fs.writeFileSync(path.join(saida, `${nome}.png`), execFileSync(ADB, ["exec-out", "screencap", "-p"])); }
// Alvos de toque menores que o mínimo (em dp; a tela tem densidade d).
function alvosPequenos(nos, densidade) {
  return nos.filter((n) => n.clicavel && n.alt > 0 && Math.min(n.alt, n.larg) / densidade < P.alvoMinimo - 0.5).map((n) => `${n.rotulo || n.texto || "?"} ${Math.round(n.alt / densidade)}dp`);
}
const densidade = Number((adb("shell", "wm", "density").match(/(\d+)\s*$/) || [0, 420])[1]) / 160;

// API direto (para conferir o que o app gravou).
let cookie = "";
async function apiTeste(caminho) {
  if (!cookie) {
    const r = await fetch(`${P.api}/api/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: P.api }, body: JSON.stringify({ usuario: P.usuario, senha: P.senha }) });
    cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  }
  return (await fetch(`${P.api}${caminho}`, { headers: { cookie } })).json();
}

const res = [];
async function passo(nome, fn) {
  try { await fn(); res.push(`OK    ${nome}`); console.log(`OK    ${nome}`); }
  catch (e) { res.push(`FALHA ${nome}: ${e.message}`); console.log(`FALHA ${nome}: ${e.message}`); try { print(`FALHA-${nome.replace(/[^a-z0-9]+/gi, "-")}`); } catch { /* sem tela */ } }
}

// 2. Abre o app do zero (sem servidor guardado).
adb("reverse", `tcp:${porta}`, `tcp:${porta}`);
if (APK) {
  adb("shell", "pm", "clear", "com.dashzon.app");
  adb("shell", "am", "start", "-n", "com.dashzon.app/.MainActivity");
} else {
  adb("shell", "pm", "clear", "host.exp.exponent");
  adb("reverse", "tcp:8081", "tcp:8081");
  adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "exp://127.0.0.1:8081");
}

await passo("abre na tela de entrar (primeiro uso, sem servidor)", async () => {
  // Depois do pm clear o Expo Go mostra, uma vez, o aviso e o próprio menu de
  // desenvolvedor por cima do app: fecha o que estiver na frente até o app aparecer.
  for (let i = 0; i < 6; i++) {
    const n = await ate((x) => x.texto === "Continue" || x.rotulo === "Close" || x.rotulo === "Endereço do servidor", "app ou telas do Expo Go", 90000);
    if (n.rotulo === "Endereço do servidor") break;
    tocar(n);
    await espera(1200);
  }
  await ate("Endereço do servidor", "campo do servidor", 30000);
  print("entrar");
  const pequenos = alvosPequenos(arvore(), densidade);
  if (pequenos.length) throw new Error(`alvos pequenos: ${pequenos.join(" | ")}`);
});
await passo("entrar com servidor, usuário e senha", async () => {
  await digitar("Endereço do servidor", SERVIDOR);
  await digitar("Usuário", P.usuario);
  await digitar("Senha", P.senha);
  await esconderTeclado();
  tocar(await ate("Entrar", "botão Entrar"));
  await ate(textoNaTela("Olá, Admin Teste"), "início", 30000);
  print("inicio");
});
await passo("dashboard Finanças com os cards", async () => {
  tocar(await ate("Dashboard Finanças pessoais", "dashboard na lista"));
  await ate(textoNaTela("R$ 11.300,00"), "número de Receitas");
  await espera(800);
  print("dashboard");
  voltar();
  await ate(textoNaTela("Olá, Admin Teste"), "de volta ao início");
});
await passo("lançar com o teclado do celular ('123,45') e a data de hoje", async () => {
  tocar(await ate("Lançar em Lançamentos", "Lançar em Lançamentos"));
  await ate("Descrição", "formulário");
  await digitar("Descrição", "Teste no emulador");
  await digitar("Valor", "123,45");
  await esconderTeclado();
  tocar(await rolarAte("Moradia", "categoria Moradia"));
  print("formulario");
  tocar(await rolarAte((n) => n.rotulo === "Lançar" && n.clicavel, "botão Lançar"));
  await ate(textoNaTela("Lançado em Lançamentos"), "aviso de lançado", 15000).catch(() => {});
  await espera(1500);
  const r = (await apiTeste("/api/modulos/lancamentos/registros?q=Teste%20no%20emulador")).result[0];
  // "Hoje" é o do aparelho (o fuso do emulador pode ser outro que o do PC).
  const iso = adb("shell", "date", "+%Y-%m-%d").trim();
  if (!r || r.valor !== 123.45 || r.categoria !== "Moradia" || r.data !== iso) throw new Error(`no banco: ${JSON.stringify(r)}`);
});
await passo(APK ? "ajustes: lembrete diário disponível; tema Floresta noite salvo na conta" : "ajustes: lembretes explicam o Expo Go; tema Floresta noite salvo na conta", async () => {
  await ate(textoNaTela("Olá, Admin Teste"), "início");
  await fecharMenuDoExpo();
  const ajustes = await ate("Ajustes", "Ajustes");
  tocar(ajustes, -Math.floor(ajustes.larg / 2) + 12); // pela borda esquerda: a direita fica sob o botão do Expo Go
  tocar(await ate((n) => n.rotulo.startsWith("Floresta noite."), "tema Floresta noite"));
  await espera(1500);
  // No APK as notificações existem: aparece o interruptor; no Expo Go, o aviso.
  if (APK) await rolarAte("Lembrete diário para lançar", "interruptor do lembrete");
  else await rolarAte(textoNaTela("precisam do app instalado"), "aviso dos lembretes no Expo Go");
  const pref = (await apiTeste("/api/status")).usuario.preferencias.tema;
  if (pref !== "floresta_noite") throw new Error(`tema na conta: ${pref}`);
  print("ajustes");
});

fs.writeFileSync(path.join(saida, "resultado.txt"), res.join("\n") + "\n");
const falhas = res.filter((r) => r.startsWith("FALHA")).length;
console.log(`\n${res.length - falhas} ok, ${falhas} falha(s). Prints em ${saida}`);
process.exit(falhas ? 1 : 0);
