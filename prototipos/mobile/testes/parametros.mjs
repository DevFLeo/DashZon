// Parâmetros dos testes do app de celular. Cada um pode ser trocado por uma
// variável de ambiente (entre parênteses), sem mexer no código:
//   $env:DASHZON_TESTE_API = "http://127.0.0.1:4580"; npm run teste:web
// Os testes de ponta a ponta só rodam numa instância NÃO configurada (eles
// mesmos fazem o setup): assim nunca encostam no banco real.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const lista = (v, padrao) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : padrao);

// Primeiro Chromium encontrado: Edge, Chrome ou o que o Puppeteer baixou.
function acharNavegador() {
  const candidatos = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    path.join(env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ];
  const cache = path.join(os.homedir(), ".cache/puppeteer/chrome");
  if (fs.existsSync(cache)) {
    for (const versao of fs.readdirSync(cache)) {
      for (const sub of ["chrome-win64/chrome.exe", "chrome-linux64/chrome", "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"]) {
        candidatos.push(path.join(cache, versao, sub));
      }
    }
  }
  return candidatos.find((c) => c && fs.existsSync(c)) || "";
}

const data = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

export const PARAMETROS = {
  // Instância de TESTE do DashZon (DASHZON_TESTE_API): por padrão a 4581, com
  // o banco data/teste-mobile.db (rodar-testes.ps1 zera e sobe). Nunca a do banco real.
  api: env.DASHZON_TESTE_API || "http://127.0.0.1:4581",
  // Porta em que a versão web do app é servida durante o teste (DASHZON_TESTE_PORTA).
  porta: Number(env.DASHZON_TESTE_PORTA || 8090),
  // Conta criada pelo setup do teste (DASHZON_TESTE_USUARIO / DASHZON_TESTE_SENHA).
  usuario: env.DASHZON_TESTE_USUARIO || "admin",
  senha: env.DASHZON_TESTE_SENHA || "Prototipo-2026!",
  // Templates instalados no setup (DASHZON_TESTE_TEMPLATES, separados por vírgula).
  templates: lista(env.DASHZON_TESTE_TEMPLATES, ["financas-pessoais", "cronograma-estudos", "gestao-demandas"]),
  // Telas testadas, "LARGURAxALTURA" (DASHZON_TESTE_TELAS). A primeira roda o roteiro inteiro.
  telas: lista(env.DASHZON_TESTE_TELAS, ["390x844", "360x740"]).map((t) => { const [l, a] = t.split("x").map(Number); return { largura: l, altura: a }; }),
  // Menor alvo de toque aceito, em px (DASHZON_TESTE_ALVO).
  alvoMinimo: Number(env.DASHZON_TESTE_ALVO || 44),
  // Navegador Chromium (NAVEGADOR); vazio = procurar Edge/Chrome.
  navegador: env.NAVEGADOR || acharNavegador(),
  // Porta do DevTools do navegador headless (DASHZON_TESTE_CDP).
  portaCdp: Number(env.DASHZON_TESTE_CDP || 9360),
  // Onde ficam os prints e o resultado (DASHZON_TESTE_SAIDA).
  saida: env.DASHZON_TESTE_SAIDA || path.join(AQUI, "resultados", data),
  // Pasta da versão web exportada (npx expo export --platform web).
  dist: path.join(AQUI, "..", "dist"),
  // Emulador Android (testes/emulador.ps1 e e2e-emulador.mjs): o adb do SDK
  // (ANDROID_HOME) e o aparelho virtual (DASHZON_TESTE_AVD).
  adb: env.DASHZON_TESTE_ADB || path.join(env.ANDROID_HOME || path.join(env.LOCALAPPDATA || "", "Android/Sdk"), "platform-tools", process.platform === "win32" ? "adb.exe" : "adb"),
  avd: env.DASHZON_TESTE_AVD || "Pixel_10",
  // O que o teste do emulador abre (DASHZON_TESTE_APP): "expo" (o Expo Go
  // com o Metro) ou "apk" (o APK instalado, com.dashzon.app; gere com npm run apk -- -Http).
  app: env.DASHZON_TESTE_APP === "apk" ? "apk" : "expo"
};
