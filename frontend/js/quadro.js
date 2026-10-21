// Outras formas de ver os registros de um módulo (a pedido), além da tabela:
//  - Quadro (estilo Trello), por departamento: uma coluna por opção do status
//    (o declarado em `produtividade`, ou a primeira seleção); arrastar um
//    cartão (ou usar as setas) muda o status com um PATCH só desse campo. O
//    filtro de departamento usa o campo de unidade do módulo.
//  - Agenda: os registros pelo dia de um campo de data, numa janela em volta
//    de hoje (-15/+15, -30, +30, -30/+30 dias), para ver quem produziu e o que
//    vem pela frente.
// As permissões são as do servidor (unidade em cascata): um movimento recusado
// volta para o lugar, com a mensagem.
const Quadro = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  let modulo = null;
  let contexto = { q: "", filtros: {} };
  let registros = [];
  let arrastando = null;

  const campoDe = (id) => modulo.schema.campos.find((c) => c.id === id);
  const chave = (sufixo) => `dashzon.${sufixo}.${modulo.slug}`;
  const selecoes = () => modulo.schema.campos.filter((c) => c.tipo === "selecao");
  const datas = () => modulo.schema.campos.filter((c) => c.tipo === "data");

  function campoColuna() {
    const salvo = Util.storage(chave("quadro.coluna"));
    return campoDe(salvo) || campoDe(modulo.schema.produtividade?.status) || selecoes()[0] || null;
  }

  function campoUnidade() {
    const u = campoDe(modulo.schema.unidade);
    return u && u.opcoes ? u : null;
  }

  function campoPrazo() {
    return campoDe(Util.storage(chave("agenda.campo"))) || campoDe(modulo.schema.produtividade?.prazo) || datas()[0] || null;
  }

  // Departamento escolhido: o salvo; senão o da própria pessoa (se ela está numa das opções).
  function departamento() {
    const u = campoUnidade();
    if (!u) return "";
    const salvo = Util.storage(chave("quadro.depto"));
    if (salvo !== null) return u.opcoes.includes(salvo) ? salvo : "";
    const permitidas = modulo.opcoes_unidade;
    return permitidas && permitidas.length === 1 ? permitidas[0] : "";
  }

  async function carregar(extra = {}) {
    const qs = new URLSearchParams({ limite: "1000" });
    if (contexto.q) qs.set("q", contexto.q);
    Object.entries({ ...contexto.filtros, ...extra }).forEach(([k, v]) => { if (v) qs.set(`f[${k}]`, v); });
    const prazo = campoPrazo();
    if (prazo) qs.set("ordem", `${prazo.id}:asc`);
    const res = await Api.get(`/api/modulos/${encodeURIComponent(modulo.slug)}/registros?${qs}`);
    registros = res.result;
    return res;
  }

  // ---------------------------------------------------------------- quadro ----
  async function abrirQuadro(m, ctx) {
    modulo = m;
    contexto = ctx;
    const alvo = $("mod-quadro");
    const coluna = campoColuna();
    if (!coluna) {
      alvo.innerHTML = '<div class="empty-state"><h2>Sem quadro</h2><div>O quadro precisa de um campo de seleção (ex.: status) para virar colunas.</div></div>';
      return;
    }
    const u = campoUnidade();
    const depto = departamento();
    const res = await carregar(u && depto ? { [u.id]: depto } : {});
    const outros = selecoes().filter((c) => c.id !== coluna.id && c.id !== u?.id).slice(0, 2);
    const prazo = campoPrazo();
    const hoje = Util.hojeISO();
    const rot = campoDe(modulo.schema.rotulo);

    const colunas = [...coluna.opcoes];
    if (registros.some((r) => !r[coluna.id])) colunas.push("");
    const cartao = (r) => {
      const p = prazo && r[prazo.id];
      const fim = modulo.schema.produtividade;
      const fechado = fim && [...(fim.concluido || []), ...(fim.encerrado || [])].includes(r[fim.status]);
      const atrasado = p && p < hoje && !fechado;
      const i = colunas.indexOf(r[coluna.id] || "");
      return `<article class="cartao" draggable="true" data-id="${r.id}" tabindex="0" aria-label="${esc(String(r[rot.id] ?? ""))}">
        <strong class="cartao-titulo">${esc(String(r[rot.id] ?? "Sem título"))}</strong>
        <div class="cartao-chips">
          ${!depto && u && r[u.id] ? `<span class="chip">${esc(String(r[u.id]).split(/\s+-\s+/)[0])}</span>` : ""}
          ${outros.map((c) => (r[c.id] ? `<span class="chip">${esc(r[c.id])}</span>` : "")).join("")}
        </div>
        ${p ? `<div class="cartao-prazo ${atrasado ? "prod-alerta" : ""}">${esc(prazo.nome)}: ${Util.fmtData(p)}${atrasado ? " (atrasado)" : p === hoje ? " (hoje)" : ""}</div>` : ""}
        <div class="cartao-acoes">
          <button type="button" class="icon-btn" data-mover="-1" ${i <= 0 ? "disabled" : ""} aria-label="Mover para a coluna anterior">${Util.icone("esquerda")}</button>
          <button type="button" class="btn btn-sm" data-abrir>Abrir</button>
          <button type="button" class="icon-btn" data-mover="1" ${i >= colunas.length - 1 ? "disabled" : ""} aria-label="Mover para a próxima coluna">${Util.icone("direita")}</button>
        </div>
      </article>`;
    };

    alvo.innerHTML = `<div class="quadro-barra">
        ${u ? `<label class="classificar" for="qd-depto"><span>Departamento</span><select id="qd-depto">
          <option value="">Todos</option>${u.opcoes.map((o) => `<option value="${esc(o)}" ${o === depto ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>` : ""}
        <label class="classificar" for="qd-coluna"><span>Colunas por</span><select id="qd-coluna">
          ${selecoes().filter((c) => c.id !== u?.id).map((c) => `<option value="${c.id}" ${c.id === coluna.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label>
        <span class="hint">${Util.fmtNumero(registros.length, 0)} cartão(ões)${res.count > registros.length ? ` de ${res.count}` : ""}. Arraste entre as colunas ou use as setas.</span>
      </div>
      <div class="quadro" role="list">${colunas.map((col) => {
        const daqui = registros.filter((r) => (r[coluna.id] || "") === col);
        return `<section class="quadro-coluna" data-coluna="${esc(col)}" role="listitem" aria-label="${esc(col || "Sem valor")}">
          <header><strong>${esc(col || "Sem valor")}</strong><span class="badge">${daqui.length}</span>
            ${col ? `<button type="button" class="icon-btn" data-novo-em="${esc(col)}" aria-label="Novo em ${esc(col)}" title="Novo cartão nesta coluna">+</button>` : ""}</header>
          <div class="quadro-cartoes">${daqui.map(cartao).join("") || '<p class="hint quadro-vazio">Nada aqui</p>'}</div>
        </section>`;
      }).join("")}</div>`;

    $("qd-depto")?.addEventListener("change", (e) => { Util.storage(chave("quadro.depto"), e.target.value); abrirQuadro(modulo, contexto); });
    $("qd-coluna").addEventListener("change", (e) => { Util.storage(chave("quadro.coluna"), e.target.value); abrirQuadro(modulo, contexto); });
    alvo.querySelectorAll("[data-novo-em]").forEach((b) => b.addEventListener("click", () => {
      const valores = { [coluna.id]: b.dataset.novoEm };
      if (u && depto) valores[u.id] = depto;
      Modulos.novoCom(modulo.slug, valores, () => abrirQuadro(modulo, contexto));
    }));
    alvo.querySelectorAll(".cartao").forEach((c) => {
      const id = Number(c.dataset.id);
      c.querySelector("[data-abrir]").addEventListener("click", () => Modulos.editar(modulo.slug, id, () => abrirQuadro(modulo, contexto)));
      c.querySelectorAll("[data-mover]").forEach((b) => b.addEventListener("click", () => {
        const r = registros.find((x) => x.id === id);
        const destino = colunas[colunas.indexOf(r[coluna.id] || "") + Number(b.dataset.mover)];
        if (destino !== undefined && destino !== "") mover(id, coluna, destino);
      }));
      c.addEventListener("dragstart", (ev) => { arrastando = id; c.classList.add("arrastando"); ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", String(id)); });
      c.addEventListener("dragend", () => { arrastando = null; c.classList.remove("arrastando"); });
      c.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && ev.target === c) Modulos.editar(modulo.slug, id, () => abrirQuadro(modulo, contexto));
      });
    });
    alvo.querySelectorAll(".quadro-coluna").forEach((col) => {
      col.addEventListener("dragover", (ev) => { if (arrastando !== null && col.dataset.coluna) { ev.preventDefault(); col.classList.add("alvo"); } });
      col.addEventListener("dragleave", () => col.classList.remove("alvo"));
      col.addEventListener("drop", (ev) => {
        ev.preventDefault();
        col.classList.remove("alvo");
        const id = Number(ev.dataTransfer.getData("text/plain")) || arrastando;
        const r = registros.find((x) => x.id === id);
        if (r && col.dataset.coluna && (r[coluna.id] || "") !== col.dataset.coluna) mover(id, coluna, col.dataset.coluna);
      });
    });
  }

  async function mover(id, coluna, destino) {
    try {
      const r = await Api.patch(`/api/modulos/${encodeURIComponent(modulo.slug)}/registros/${id}`, { [coluna.id]: destino });
      Util.aviso(r?.pendente ? r.mensagem : `Movido para "${destino}"`);
      if (r?.pendente) await App.recarregarNav();
    } catch (e) {
      Util.aviso(e.message, "erro");
    }
    await abrirQuadro(modulo, contexto);
  }

  // ---------------------------------------------------------------- agenda ----
  const JANELAS = [["-15+15", "-15 / +15 dias", -15, 15], ["-30", "-30 dias", -30, 0], ["+30", "+30 dias", 0, 30], ["-30+30", "-30 / +30 dias", -30, 30]];

  async function abrirAgenda(m, ctx) {
    modulo = m;
    contexto = ctx;
    const alvo = $("mod-agenda");
    const prazo = campoPrazo();
    if (!prazo) {
      alvo.innerHTML = '<div class="empty-state"><h2>Sem agenda</h2><div>A agenda precisa de um campo de data (ex.: prazo).</div></div>';
      return;
    }
    const salva = Util.storage(chave("agenda.janela"));
    const janela = JANELAS.find(([id]) => id === salva) || JANELAS[0];
    await carregar();
    const [, , de, ate] = janela;
    const inicio = Util.hojeISO(de);
    const fim = Util.hojeISO(ate);
    const hoje = Util.hojeISO();
    const rot = campoDe(modulo.schema.rotulo);
    const u = campoDe(modulo.schema.unidade);
    const st = campoDe(modulo.schema.produtividade?.status) || selecoes().find((c) => c.id !== u?.id);
    const porDia = new Map();
    let semData = 0;
    let fora = 0;
    registros.forEach((r) => {
      const d = r[prazo.id];
      if (!d) { semData++; return; }
      if (d < inicio || d > fim) { fora++; return; }
      porDia.set(d, [...(porDia.get(d) || []), r]);
    });
    const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    const dias = [];
    for (let i = de; i <= ate; i++) dias.push(Util.hojeISO(i));
    const total = [...porDia.values()].reduce((t, l) => t + l.length, 0);

    alvo.innerHTML = `<div class="quadro-barra">
        <label class="classificar" for="ag-campo"><span>Data</span><select id="ag-campo">
          ${datas().map((c) => `<option value="${c.id}" ${c.id === prazo.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label>
        <span class="segmentado" role="group" aria-label="Período">${JANELAS.map(([id, t]) => `<button type="button" data-ag-janela="${id}" aria-pressed="${id === janela[0]}">${t}</button>`).join("")}</span>
        <span class="hint">${Util.fmtNumero(total, 0)} no período${fora ? ` · ${fora} fora dele` : ""}${semData ? ` · ${semData} sem data` : ""}</span>
      </div>
      <ol class="agenda">${dias.map((d) => {
        const lista = porDia.get(d) || [];
        const sem = SEM[new Date(`${d}T12:00:00`).getDay()];
        return `<li class="agenda-dia ${d === hoje ? "hoje" : d < hoje ? "passado" : "futuro"} ${lista.length ? "" : "vazio"}">
          <div class="agenda-data"><span>${sem}</span><strong>${d.slice(8, 10)}/${d.slice(5, 7)}</strong>${d === hoje ? '<span class="chip chip-entrada">hoje</span>' : ""}</div>
          <div class="agenda-itens">${lista.map((r) => `<button type="button" class="agenda-item" data-id="${r.id}">
            <strong>${esc(String(r[rot.id] ?? "Sem título"))}</strong>
            ${u && r[u.id] ? `<span class="chip">${esc(String(r[u.id]).split(/\s+-\s+/)[0])}</span>` : ""}
            ${st && r[st.id] ? `<span class="chip">${esc(r[st.id])}</span>` : ""}</button>`).join("")}</div>
        </li>`;
      }).join("")}</ol>`;

    $("ag-campo").addEventListener("change", (e) => { Util.storage(chave("agenda.campo"), e.target.value); abrirAgenda(modulo, contexto); });
    alvo.querySelectorAll("[data-ag-janela]").forEach((b) => b.addEventListener("click", () => {
      Util.storage(chave("agenda.janela"), b.dataset.agJanela);
      abrirAgenda(modulo, contexto);
    }));
    alvo.querySelectorAll(".agenda-item").forEach((b) => b.addEventListener("click", () =>
      Modulos.editar(modulo.slug, Number(b.dataset.id), () => abrirAgenda(modulo, contexto))));
  }

  function init() { /* tudo é ligado ao desenhar */ }

  return { init, abrirQuadro, abrirAgenda };
})();
