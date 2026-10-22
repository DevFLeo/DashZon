// Serve a versão web do app (dist/) e repassa /api para a instância de teste,
// trocando o Origin pelo do backend (o mesmo que o proxy do Vite faz nos
// protótipos web). Usado pelo e2e-web.mjs; também roda sozinho:
//   node testes/servir-web.mjs        (http://127.0.0.1:8090)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PARAMETROS } from "./parametros.mjs";

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".ttf": "font/ttf" };

export function servir({ dist = PARAMETROS.dist, porta = PARAMETROS.porta, alvo = PARAMETROS.api } = {}) {
  if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error(`Sem ${dist}/index.html: rode "npx expo export --platform web" antes.`);
  const raiz = path.resolve(dist);
  const servidor = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/api/")) {
        const corpo = await new Promise((ok) => { const p = []; req.on("data", (c) => p.push(c)); req.on("end", () => ok(Buffer.concat(p))); });
        const leitura = ["GET", "HEAD"].includes(req.method);
        const h = {};
        for (const k of ["content-type", "cookie", "accept"]) if (req.headers[k]) h[k] = req.headers[k];
        if (!leitura) h.origin = alvo;
        const r = await fetch(alvo + req.url, { method: req.method, headers: h, body: leitura ? undefined : corpo, redirect: "manual" });
        const saida = { "content-type": r.headers.get("content-type") || "application/json" };
        const cookies = r.headers.getSetCookie();
        if (cookies.length) saida["set-cookie"] = cookies;
        res.writeHead(r.status, saida);
        res.end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      let arq = path.resolve(raiz, "." + decodeURIComponent(req.url.split("?")[0]));
      if (!arq.startsWith(raiz) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) arq = path.join(raiz, "index.html");
      res.writeHead(200, { "content-type": TIPOS[path.extname(arq)] || "application/octet-stream" });
      fs.createReadStream(arq).pipe(res);
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `Proxy: ${e.message}` }));
    }
  });
  return new Promise((ok, falha) => {
    servidor.once("error", falha);
    servidor.listen(porta, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${porta}/`, fechar: () => new Promise((f) => servidor.close(f)) }));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = await servir();
  console.log(`App em ${s.url} (API: ${PARAMETROS.api})`);
}
