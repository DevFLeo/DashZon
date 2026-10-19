// Verifica, num servidor de verdade, se os dashboards estão isolados por usuário
// e se o "fixar layout" funciona. Entra com uma conta COMUM (não admin) e não
// estraga nada: só cria e apaga um dashboard de teste dela mesma; nos dashboards
// dos outros faz apenas tentativas que não mudam nada (ex.: renomear para o
// mesmo nome) e confere que o servidor recusa.
//
// Sem dependências (Node 18+). As credenciais vêm de variáveis de ambiente,
// nunca ficam no repositório:
//   PowerShell:
//     $env:DZ_URL="https://seudominio:8443"; $env:DZ_USUARIO="login"; $env:DZ_SENHA="senha"
//     node scripts/verificar-dashboards.js
//   Se a conta estiver com troca de senha obrigatória, defina também DZ_NOVA_SENHA
//   (a senha passa a ser essa).
//   Opcional, para testar com duas pessoas: DZ2_USUARIO e DZ2_SENHA (outra conta comum).
//
// Sai com código 0 se tudo passar, 1 se algo falhar, 2 se não deu para testar.
const URL_BASE = (process.env.DZ_URL || "http://127.0.0.1:4567").replace(/\/$/, "");
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? "OK   " : "FALHA"} ${m}`); if (!c) falhas++; };
const parar = (m) => { console.log(`NÃO DEU PARA TESTAR: ${m}`); process.exit(2); };

function sessao() {
  let cookie = "";
  return async function api(caminho, metodo = "GET", corpo) {
    const r = await fetch(URL_BASE + caminho, {
      method: metodo,
      headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo)
    });
    const novos = r.headers.getSetCookie().map((c) => c.split(";")[0]);
    if (novos.length) cookie = novos.join("; ");
    return { status: r.status, json: await r.json().catch(() => null) };
  };
}

async function entrar(usuario, senha, novaSenha) {
  const api = sessao();
  let r = await api("/api/login", "POST", { usuario, senha });
  if (r.status !== 200) parar(`login de '${usuario}' falhou (${r.status}: ${r.json?.error})`);
  const eu = r.json.usuario;
  if (eu.deve_trocar_senha) {
    if (!novaSenha) parar(`a conta '${usuario}' precisa trocar a senha. Defina DZ_NOVA_SENHA e rode de novo.`);
    r = await api("/api/eu/senha", "PUT", { senha_atual: senha, senha_nova: novaSenha });
    if (r.status !== 200) parar(`troca de senha recusada: ${r.json?.error}`);
    console.log(`(senha da conta '${usuario}' trocada pela de DZ_NOVA_SENHA)`);
  }
  return { api, eu };
}

(async () => {
  console.log(`Servidor: ${URL_BASE}`);
  const st = await sessao()("/api/status");
  if (st.status !== 200) parar(`servidor não respondeu (${st.status})`);
  if (!process.env.DZ_USUARIO || !process.env.DZ_SENHA) parar("defina DZ_USUARIO e DZ_SENHA");

  const { api, eu } = await entrar(process.env.DZ_USUARIO, process.env.DZ_SENHA, process.env.DZ_NOVA_SENHA);
  console.log(`Conta: ${eu.login} (${eu.admin ? "administrador" : "usuário comum"})`);
  if (eu.admin) console.log("Aviso: use uma conta COMUM para este teste; um admin altera os dashboards da equipe.");

  // 1. Versão do servidor: dashboards com dono e visibilidade.
  let r = await api("/api/dashboards");
  if (r.status !== 200) parar(`lista de dashboards: ${r.status} ${r.json?.error || ""}`);
  const lista = r.json;
  const novaVersao = lista.every((d) => "visibilidade" in d && "dono_id" in d && "editavel" in d);
  ok(novaVersao, "servidor já tem dashboards com dono (versão com a correção)");
  if (!novaVersao) {
    console.log(`\nO servidor ainda está na versão antiga: esta conta vê ${lista.length} dashboard(s) de todo mundo.`);
    console.log("Atualize o servidor (git pull + reiniciar) e rode de novo. Nada foi alterado.");
    process.exit(1);
  }

  // 2. Tudo o que esta conta vê é dela ou da equipe.
  const estranhos = lista.filter((d) => d.dono_id !== eu.id && d.visibilidade !== "equipe");
  ok(estranhos.length === 0, `só vê os próprios e os da equipe (${lista.length} visíveis)`);

  // 3. Ids fora da lista respondem 404 (o privado dos outros nem "existe").
  const visiveis = new Set(lista.map((d) => d.id));
  const maior = Math.max(0, ...lista.map((d) => d.id)) + 5;
  const vazados = [];
  for (let id = 1; id <= maior; id++) {
    if (visiveis.has(id)) continue;
    const g = await api(`/api/dashboards/${id}`);
    if (g.status !== 404) vazados.push(`${id}:${g.status}`);
  }
  ok(vazados.length === 0, `dashboards que não aparecem na lista não abrem pelo link${vazados.length ? ` (vazou: ${vazados.join(", ")})` : ""}`);

  // 4. Dashboards da equipe criados por outros: só leitura (tentativas que não mudam nada).
  const daEquipe = lista.filter((d) => d.dono_id !== eu.id && d.visibilidade === "equipe");
  if (!eu.admin && daEquipe.length) {
    const d = daEquipe[0];
    ok(d.editavel === false, `'${d.nome}' (da equipe) aparece como só leitura`);
    r = await api(`/api/dashboards/${d.id}`, "PUT", { nome: d.nome }); // mesmo nome: nada muda mesmo se aceitasse
    ok(r.status === 403, `renomear dashboard da equipe de outra pessoa é recusado (${r.status})`);
  } else {
    console.log("(nenhum dashboard da equipe de outra pessoa para testar o 'só leitura')");
  }

  // 5. Dashboard de teste desta conta: nasce privado, fixa, trava o layout, apaga.
  const nome = `[teste-isolamento] ${new Date().toISOString().slice(0, 16)}`;
  r = await api("/api/dashboards", "POST", { nome });
  ok(r.status === 201, "cria dashboard de teste");
  const meuId = r.json?.id;
  try {
    const meu = (await api("/api/dashboards")).json.find((d) => d.id === meuId);
    ok(meu?.visibilidade === "privado" && meu?.editavel, "dashboard novo nasce privado e editável pelo dono");

    const mods = (await api("/api/modulos")).json || [];
    if (mods.length) {
      const w = await api(`/api/dashboards/${meuId}/widgets`, "POST",
        { titulo: "Teste", tipo: "kpi", modulo: mods[0].slug, config: { agregacao: "contagem" }, x: 0, y: 0, w: 3, h: 2 });
      ok(w.status === 201, "adiciona um card de teste");
      await api(`/api/dashboards/${meuId}`, "PUT", { fixo: true });
      r = await api(`/api/widgets/${w.json.id}/layout`, "PUT", { x: 3, y: 0, w: 3, h: 2 });
      ok(r.status === 409, `com o layout fixado, mover o card é recusado (${r.status})`);
      await api(`/api/dashboards/${meuId}`, "PUT", { fixo: false });
      r = await api(`/api/widgets/${w.json.id}/layout`, "PUT", { x: 3, y: 0, w: 3, h: 2 });
      ok(r.status === 200, "liberado, o card se move");
    }

    // 6. Segunda conta (opcional): não vê o privado desta.
    if (process.env.DZ2_USUARIO && process.env.DZ2_SENHA) {
      const outra = await entrar(process.env.DZ2_USUARIO, process.env.DZ2_SENHA, process.env.DZ2_NOVA_SENHA);
      const lista2 = (await outra.api("/api/dashboards")).json;
      ok(!lista2.some((d) => d.id === meuId), `a conta '${outra.eu.login}' não vê o dashboard privado de teste`);
      ok((await outra.api(`/api/dashboards/${meuId}`)).status === 404, "nem abrindo pelo link");
    }
  } finally {
    if (meuId) {
      r = await api(`/api/dashboards/${meuId}`, "DELETE");
      ok(r.status === 200, "apaga o dashboard de teste (limpeza)");
    }
  }

  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTUDO OK");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("ERRO:", e.message); process.exit(2); });
