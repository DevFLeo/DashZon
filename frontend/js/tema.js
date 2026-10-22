// Tema: a lista vem de temas/temas.json (o backend a entrega em /temas.js,
// como window.DASHZON_TEMAS; as cores vêm de /temas.css). Um tema novo no
// JSON aparece aqui sem mudar este arquivo.
//
// O botão do topo gira dentro da família (o grupo do tema): sol (claro) ->
// pôr do sol (suave) -> lua (escuro); Floresta dia -> tarde -> noite. O ícone
// mostra a "fase" do tema. "sistema" segue o Windows/navegador (claro ou
// escuro). A escolha fica no navegador (para abrir já no tema certo, antes do
// login) e, com alguém logado, também nas preferências da conta.
//
// Só troca os tokens de cor (data-theme no <html>); os gráficos são
// redesenhados com as mesmas funções de sempre (REGRA em CLAUDE.md).
const Tema = (() => {
  const CHAVE = "dashzon.tema";
  const DADOS = window.DASHZON_TEMAS || { automaticos: [{ id: "sistema", nome: "Seguir o sistema", claro: "claro", escuro: "escuro" }], temas: [] };
  const TEMAS = DADOS.temas;
  const AUTOMATICOS = DADOS.automaticos;
  const POR_ID = Object.fromEntries(TEMAS.map((t) => [t.id, t]));
  const IDS = [...AUTOMATICOS.map((a) => a.id), ...TEMAS.map((t) => t.id)];
  const escuroNoSistema = window.matchMedia("(prefers-color-scheme: dark)");
  let aoMudar = null; // callback do App para salvar na conta

  // O seguinte do mesmo grupo, voltando ao primeiro.
  function proximo(id) {
    const familia = TEMAS.filter((t) => t.grupo === POR_ID[id]?.grupo);
    const i = familia.findIndex((t) => t.id === id);
    return familia.length ? familia[(i + 1) % familia.length].id : "claro";
  }
  const nome = (id) => (POR_ID[id]?.nome || id).toLowerCase();

  function preferido() {
    const t = Util.storage(CHAVE);
    return IDS.includes(t) ? t : "sistema";
  }

  // Um tema automático vira um tema de verdade: "sistema" fica claro ou
  // escuro conforme o aparelho; "vivaldi" (as quatro estações) segue a data:
  // vale a última estação cujo início ("MM-DD") já passou no ano, e antes da
  // primeira (de janeiro a março), a última do ano anterior.
  function resolver(auto, hoje = new Date()) {
    if (auto.claro) return escuroNoSistema.matches ? auto.escuro : auto.claro;
    if (auto.estacoes) {
      const md = `${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
      const ja = auto.estacoes.filter((e) => e.desde <= md);
      return (ja.length ? ja[ja.length - 1] : auto.estacoes[auto.estacoes.length - 1]).tema;
    }
    return TEMAS[0]?.id || "claro";
  }

  // O tema que está valendo de fato.
  function efetivo(tema = preferido()) {
    const auto = AUTOMATICOS.find((a) => a.id === tema);
    if (auto) return resolver(auto);
    return POR_ID[tema] ? tema : "claro";
  }

  function atualizarBotoes() {
    const atual = efetivo();
    const fase = POR_ID[atual]?.fase;
    document.querySelectorAll(".tema-btn").forEach((b) => {
      b.classList.toggle("suave", fase === "tarde");
      b.classList.toggle("escuro", fase === "noite");
      b.setAttribute("aria-label", `Tema ${nome(atual)}. Mudar para o tema ${nome(proximo(atual))}. Segure ou use a seta para baixo para ver todos`);
      b.title = `Tema ${nome(atual)} (clique para o ${nome(proximo(atual))}; segure para ver todos)`;
    });
  }

  // Aplica sem salvar na conta (usado ao carregar as preferências do login).
  function aplicar(tema) {
    const t = IDS.includes(tema) ? tema : "sistema";
    Util.storage(CHAVE, t);
    if (t === "sistema") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", POR_ID[efetivo(t)].atributo);
    atualizarBotoes();
    document.dispatchEvent(new CustomEvent("dashzon:tema"));
  }

  // Escolhe e salva na conta (botão do topo e, depois, o seletor rápido).
  function escolher(novo) {
    aplicar(novo);
    if (aoMudar) aoMudar(novo);
  }

  // ---- Seletor rápido: segurar o botão (ou botão direito, ou seta para
  // baixo) abre um mini pop-up com o cubo do DashZon, o mascote, pintado
  // nas cores de cada tema. Automáticos: cada face com a cor de um dos temas
  // que ele usa (Vivaldi: as quatro estações; sistema: claro e escuro).
  const SEGURAR_MS = 500;
  let seletor = null;
  let ignorarClique = false;

  const FACES = ["frente", "dir", "tras", "esq", "topo", "base"];
  function cuboHtml(cores) {
    const faces = FACES.map((f, i) => `<span class="face f-${f}" style="--accent:${cores[i % cores.length]}"></span>`).join("");
    return `<span class="logo-3d mini-cubo" aria-hidden="true" style="--accent:${cores[0]}"><span class="cubo">${faces}<span class="nucleo"></span></span></span>`;
  }
  function itemHtml(t, marcado) {
    const partes = t.estacoes ? t.estacoes.map((e) => POR_ID[e.tema]) : t.claro ? [POR_ID[t.claro], POR_ID[t.escuro]] : [t];
    const fundos = partes.map((p) => p.previa[0]);
    const fundo = fundos.length > 1 ? `linear-gradient(90deg, ${fundos.map((c, i) => `${c} ${(i * 100) / fundos.length}% ${((i + 1) * 100) / fundos.length}%`).join(", ")})` : fundos[0];
    const e = Util.escapeHtml;
    return `<button type="button" class="mini-tema" role="radio" aria-checked="${marcado}" data-tema="${e(t.id)}" tabindex="${marcado ? 0 : -1}"
      title="${e(t.desc || t.nome)}"><span class="mini-quadro" style="background:${fundo}">${cuboHtml(partes.map((p) => p.previa[3]))}</span>
      <span class="mini-nome">${e(t.nome)}</span></button>`;
  }

  function fecharSeletor(devolverFoco = true) {
    if (!seletor) return;
    const { el, botao } = seletor;
    el.remove();
    document.removeEventListener("pointerdown", foraDoSeletor, true);
    document.removeEventListener("keydown", teclaDoSeletor, true);
    seletor = null;
    botao.setAttribute("aria-expanded", "false");
    if (devolverFoco) botao.focus();
  }
  function foraDoSeletor(ev) {
    if (seletor && !seletor.el.contains(ev.target) && !seletor.botao.contains(ev.target)) fecharSeletor(false);
  }
  function teclaDoSeletor(ev) {
    if (!seletor) return;
    if (ev.key === "Escape") { ev.preventDefault(); fecharSeletor(); return; }
    const itens = [...seletor.el.querySelectorAll(".mini-tema")];
    const i = itens.indexOf(document.activeElement);
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    if (passo && i >= 0) {
      ev.preventDefault();
      const novo = itens[(i + passo + itens.length) % itens.length];
      itens.forEach((b) => { b.tabIndex = b === novo ? 0 : -1; });
      novo.focus();
    } else if (ev.key === "Home" || ev.key === "End") {
      ev.preventDefault();
      (ev.key === "Home" ? itens[0] : itens[itens.length - 1]).focus();
    }
  }

  function abrirSeletor(botao) {
    if (seletor) { fecharSeletor(false); return; }
    const atual = preferido();
    const el = document.createElement("div");
    el.className = "seletor-temas";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Escolher o tema");
    el.innerHTML = opcoes().map((g) => `<div class="mini-grupo" role="radiogroup" aria-label="${Util.escapeHtml(g.nome)}">
        <div class="mini-grupo-nome">${Util.escapeHtml(g.nome)}</div>
        <div class="mini-lista">${g.temas.map((t) => itemHtml(t, t.id === atual)).join("")}</div></div>`).join("");
    document.body.appendChild(el);
    // Perto do botão, sem sair da tela.
    const r = botao.getBoundingClientRect();
    const larg = el.offsetWidth;
    const alt = el.offsetHeight;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - larg - 8);
    const abaixo = r.bottom + 8 + alt <= window.innerHeight;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${abaixo ? r.bottom + 8 : Math.max(8, r.top - alt - 8)}px`;
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest(".mini-tema");
      if (!b) return;
      escolher(b.dataset.tema);
      fecharSeletor();
    });
    seletor = { el, botao };
    botao.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", foraDoSeletor, true);
    document.addEventListener("keydown", teclaDoSeletor, true);
    (el.querySelector('.mini-tema[aria-checked="true"]') || el.querySelector(".mini-tema")).focus();
  }

  function ligarSegurar(b) {
    let timer = null;
    const cancelar = () => { clearTimeout(timer); timer = null; };
    b.setAttribute("aria-haspopup", "dialog");
    b.setAttribute("aria-expanded", "false");
    b.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      cancelar();
      timer = setTimeout(() => { timer = null; ignorarClique = true; abrirSeletor(b); }, SEGURAR_MS);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((t) => b.addEventListener(t, cancelar));
    b.addEventListener("contextmenu", (ev) => { ev.preventDefault(); cancelar(); abrirSeletor(b); });
    b.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown" || ev.key === "ContextMenu" || (ev.key === "F10" && ev.shiftKey)) { ev.preventDefault(); abrirSeletor(b); }
    });
  }

  function alternar(ev) {
    // Depois de segurar (seletor aberto), o clique que vem ao soltar não troca o tema.
    if (ignorarClique) { ignorarClique = false; return; }
    const botao = ev?.currentTarget;
    if (botao) {
      botao.classList.remove("girando");
      void botao.offsetWidth; // reinicia a animação se clicar de novo rápido
      botao.classList.add("girando");
    }
    escolher(proximo(efetivo()));
  }

  function init(callback) {
    aoMudar = callback || null;
    document.querySelectorAll(".tema-btn").forEach((b) => {
      if (b.dataset.ligado) return;
      b.dataset.ligado = "1";
      b.addEventListener("click", alternar);
      b.addEventListener("animationend", () => b.classList.remove("girando"));
      ligarSegurar(b);
    });
    // Seguindo o sistema: acompanha quando o Windows troca de tema.
    escuroNoSistema.addEventListener("change", () => {
      if (preferido() === "sistema") aplicar("sistema");
    });
    atualizarBotoes();
  }

  function definirCallback(callback) { aoMudar = callback; }

  // Para o seletor da Aparência e o seletor rápido: os grupos na ordem do
  // JSON, cada automático no começo do próprio grupo ("sistema" em Básicos,
  // "vivaldi" em Estações).
  function opcoes() {
    const grupos = [];
    for (const t of TEMAS) if (!grupos.some((g) => g.nome === t.grupo)) grupos.push({ nome: t.grupo, temas: [] });
    for (const a of AUTOMATICOS) if (!grupos.some((g) => g.nome === a.grupo)) grupos.unshift({ nome: a.grupo, temas: [] });
    for (const g of grupos) g.temas = [...AUTOMATICOS.filter((a) => a.grupo === g.nome), ...TEMAS.filter((t) => t.grupo === g.nome)];
    return grupos;
  }

  const automatico = (id) => AUTOMATICOS.find((a) => a.id === id);
  return { init, aplicar, escolher, preferido, efetivo, definirCallback, opcoes, porId: (id) => POR_ID[id], automatico };
})();
