// Aprovações (#/aprovacoes; relatório de testes, problema 3): pedidos de quem
// tem o perfil "visualizador". Criar, alterar ou excluir um registro só vale
// depois que o dono do módulo (ou um administrador) aprova. A tela mostra os
// pedidos para a pessoa decidir, com o antes e o depois de cada campo, e os
// pedidos que ela mesma fez.
const Aprovacoes = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  const ACAO = { criar: "criar", alterar: "alterar", excluir: "excluir" };
  const STATUS = { pendente: "Aguardando", aprovada: "Aprovado", negada: "Negado" };

  const quando = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

  // Linhas campo | antes | depois (alterar mostra só o que muda).
  function comparacao(p) {
    const campos = p.modulo?.campos || [];
    const linhas = campos.filter((c) => p.acao !== "alterar" || JSON.stringify(p.antes?.[c.id] ?? null) !== JSON.stringify(p.dados?.[c.id] ?? null))
      .filter((c) => p.acao !== "criar" || (p.dados?.[c.id] !== null && p.dados?.[c.id] !== undefined && p.dados?.[c.id] !== ""))
      .map((c) => `<tr><td>${esc(c.nome)}</td>
        <td>${p.acao === "criar" ? "—" : esc(Util.fmtValor(c, p.antes?.[c.id]))}</td>
        <td>${p.acao === "excluir" ? "<em>excluído</em>" : esc(Util.fmtValor(c, p.dados?.[c.id]))}</td></tr>`).join("");
    return linhas
      ? `<div class="table-wrap"><table class="data pedido-dif"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${linhas}</tbody></table></div>`
      : '<p class="hint">Nenhum campo muda.</p>';
  }

  function cartao(p, decidir) {
    const modulo = p.modulo ? `<a href="#/m/${encodeURIComponent(p.modulo.slug)}">${esc(p.modulo.nome)}</a>` : "(módulo excluído)";
    const titulo = decidir
      ? `<strong>${esc(p.solicitante || "?")}</strong> quer <strong>${ACAO[p.acao]}</strong> um registro em ${modulo}`
      : `Você pediu para <strong>${ACAO[p.acao]}</strong> um registro em ${modulo}`;
    const situacao = decidir ? "" : `<span class="chip pedido-${p.status}">${STATUS[p.status]}</span>${p.revisor ? ` <span class="hint">por ${esc(p.revisor)}</span>` : ""}${p.motivo ? ` <span class="hint">· ${esc(p.motivo)}</span>` : ""}`;
    return `<article class="pedido" data-id="${p.id}">
      <div class="pedido-topo"><span>${titulo}</span><span class="hint">${quando(p.criado_em)}</span></div>
      ${comparacao(p)}
      ${decidir
        ? `<div class="row-actions"><button class="btn btn-sm btn-primary" data-aprovar="${p.id}">Aprovar</button>
           <button class="btn btn-sm btn-danger" data-negar="${p.id}">Negar</button></div>`
        : `<div class="pedido-situacao">${situacao}</div>`}
    </article>`;
  }

  async function abrir() {
    const r = await Api.get("/api/solicitacoes");
    $("apr-pendentes").innerHTML = r.pendentes.length
      ? r.pendentes.map((p) => cartao(p, true)).join("")
      : '<div class="empty-state empty-state-baixo">Nenhum pedido esperando você.</div>';
    $("apr-minhas").innerHTML = r.minhas.length
      ? r.minhas.map((p) => cartao(p, false)).join("")
      : '<div class="empty-state empty-state-baixo">Você não fez pedidos.</div>';
  }

  async function decidir(id, aprovar) {
    let motivo = "";
    if (!aprovar) {
      motivo = prompt("Motivo (opcional; a pessoa vai ver):", "");
      if (motivo === null) return;
    }
    try {
      await Api.post(`/api/solicitacoes/${id}/${aprovar ? "aprovar" : "negar"}`, { motivo });
      Util.aviso(aprovar ? "Pedido aprovado: a alteração foi feita" : "Pedido negado");
      await Promise.all([abrir(), App.recarregarNav()]);
    } catch (e) { Util.aviso(e.message, "erro"); }
  }

  function init() {
    $("apr-pendentes").addEventListener("click", (e) => {
      const a = e.target.closest("[data-aprovar]");
      const n = e.target.closest("[data-negar]");
      if (a) decidir(a.dataset.aprovar, true);
      if (n) decidir(n.dataset.negar, false);
    });
  }

  return { init, abrir };
})();
