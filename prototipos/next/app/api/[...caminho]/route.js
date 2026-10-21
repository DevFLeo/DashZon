// Proxy da API do DashZon (Ruby): o navegador fala só com o Next (mesma
// origem, cookie de sessão incluído) e o Next repassa para o backend.
// Padrão: a instância de TESTE na 4571, nunca o banco real.
const ALVO = process.env.DASHZON_API || "http://127.0.0.1:4571";

export const dynamic = "force-dynamic";

async function encaminhar(req, { params }) {
  const { caminho } = await params;
  const busca = new URL(req.url).search;
  const destino = `${ALVO}/api/${caminho.map(encodeURIComponent).join("/")}${busca}`;
  const escrita = !["GET", "HEAD"].includes(req.method);

  const cabecalhos = new Headers();
  for (const h of ["content-type", "cookie", "accept"]) {
    const v = req.headers.get(h);
    if (v) cabecalhos.set(h, v);
  }
  // O backend recusa escrita com Origin de outro site: aqui a origem é a dele.
  if (escrita) cabecalhos.set("origin", ALVO);

  const r = await fetch(destino, {
    method: req.method, headers: cabecalhos, redirect: "manual", cache: "no-store",
    body: escrita ? await req.arrayBuffer() : undefined
  });
  const saida = new Headers();
  const tipo = r.headers.get("content-type");
  if (tipo) saida.set("content-type", tipo);
  for (const c of r.headers.getSetCookie()) saida.append("set-cookie", c);
  return new Response(await r.arrayBuffer(), { status: r.status, headers: saida });
}

export { encaminhar as GET, encaminhar as POST, encaminhar as PUT, encaminhar as PATCH, encaminhar as DELETE };
