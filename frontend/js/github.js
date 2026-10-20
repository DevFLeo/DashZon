// Painel "Contribuições do GitHub" (#/github), para acompanhar os estudos:
// o calendário de contribuições do último ano (como no perfil do GitHub) e os
// números do período. Os dados vêm de /api/github/contribuicoes (o servidor
// lê a página pública do GitHub e guarda por 30 min). O usuário do GitHub fica
// nas preferências da conta.
const Github = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const CEL = 14; // quadradinho (11px) + espaço (3px)
  let dados = null;

  function erro(msg) {
    $("gh-erro").textContent = msg;
    $("gh-erro").hidden = !msg;
  }

  async function abrir() {
    const eu = await Api.get("/api/eu");
    // Quem já começou a digitar enquanto a conta carregava não perde o texto.
    if (document.activeElement !== $("gh-usuario")) $("gh-usuario").value = eu.preferencias.github_usuario || "";
    erro("");
    if (!eu.preferencias.github_usuario) {
      dados = null;
      $("gh-conteudo").hidden = true;
      $("gh-vazio").hidden = false;
      return;
    }
    await carregar();
  }

  async function carregar() {
    $("gh-vazio").hidden = true;
    $("gh-carregando").hidden = false;
    try {
      dados = await Api.get("/api/github/contribuicoes");
      $("gh-conteudo").hidden = false;
      desenhar();
    } catch (e) {
      $("gh-conteudo").hidden = true;
      erro(e.message);
    } finally {
      $("gh-carregando").hidden = true;
    }
  }

  async function salvarUsuario(ev) {
    ev.preventDefault();
    erro("");
    try {
      await Api.put("/api/eu/preferencias", { github_usuario: $("gh-usuario").value.trim() });
      await abrir();
    } catch (e) { erro(e.message); }
  }

  const fmtData = (iso) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; };

  function desenhar() {
    const d = dados;
    $("gh-titulo-usuario").textContent = d.usuario;
    $("gh-link").href = `https://github.com/${encodeURIComponent(d.usuario)}`;
    const kpi = (rotulo, valor, sub = "") => `<div class="kpi"><div class="label">${rotulo}</div><div class="value">${valor}</div>${sub ? `<div class="hint">${sub}</div>` : ""}</div>`;
    $("gh-kpis").innerHTML = [
      kpi("Contribuições no último ano", d.total.toLocaleString("pt-BR")),
      kpi("Dias com contribuição", d.dias_ativos, `de ${d.dias.length}`),
      kpi("Sequência atual", `${d.sequencia_atual} dia${d.sequencia_atual === 1 ? "" : "s"}`),
      kpi("Maior sequência", `${d.maior_sequencia} dia${d.maior_sequencia === 1 ? "" : "s"}`),
      kpi("Últimos 30 dias", d.ultimos_30.toLocaleString("pt-BR"))
    ].join("");
    desenharCalendario();
    $("gh-atualizado").textContent = `Dados do GitHub de ${new Date(d.atualizado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} (atualiza a cada 30 min).`;
  }

  // Semanas em colunas (domingo em cima), como no GitHub. Mostra só as
  // semanas que cabem na largura, das mais recentes para trás (sem rolagem).
  function desenharCalendario() {
    const caixa = $("gh-calendario");
    const largura = caixa.clientWidth || 700;
    const semanasCabem = Math.max(8, Math.floor((largura - 34) / CEL));

    const semanas = [];
    let atual = [];
    dados.dias.forEach((dia) => {
      const sem = new Date(`${dia.data}T12:00:00`).getDay();
      if (sem === 0 && atual.length) { semanas.push(atual); atual = []; }
      atual.push(dia);
    });
    if (atual.length) semanas.push(atual);
    const visiveis = semanas.slice(-semanasCabem);

    let mesAnterior = -1;
    const meses = visiveis.map((s, i) => {
      const mes = Number(s[0].data.slice(5, 7)) - 1;
      const rotulo = mes !== mesAnterior && i > 0 ? MESES[mes] : "";
      mesAnterior = mes;
      return `<span style="grid-column:${i + 2}">${rotulo}</span>`;
    }).join("");

    const celulas = visiveis.map((s, col) => s.map((dia) => {
      const linha = new Date(`${dia.data}T12:00:00`).getDay() + 2;
      const texto = `${dia.total === 0 ? "Nenhuma contribuição" : `${dia.total} contribuiç${dia.total === 1 ? "ão" : "ões"}`} em ${fmtData(dia.data)}`;
      return `<span class="gh-dia" data-nivel="${dia.nivel}" style="grid-column:${col + 2};grid-row:${linha}" title="${texto}" role="img" aria-label="${texto}"></span>`;
    }).join("")).join("");

    caixa.innerHTML = `<div class="gh-grade" style="grid-template-columns: 30px repeat(${visiveis.length}, 11px)">
      <span class="gh-dia-semana" style="grid-row:3">seg</span><span class="gh-dia-semana" style="grid-row:5">qua</span><span class="gh-dia-semana" style="grid-row:7">sex</span>
      ${meses}${celulas}</div>`;
    $("gh-periodo").textContent = visiveis.length < semanas.length
      ? `Mostrando as últimas ${visiveis.length} semanas (alargue a tela para ver o ano todo).`
      : "Últimos 12 meses.";
  }

  function init() {
    $("form-gh").addEventListener("submit", salvarUsuario);
    $("gh-atualizar").addEventListener("click", carregar);
    let t;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(() => { if (dados && $("view-github").classList.contains("active")) desenharCalendario(); }, 150);
    });
  }

  return { init, abrir };
})();
