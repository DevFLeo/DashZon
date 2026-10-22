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

  // Um tema automático vira um tema de verdade ("sistema": claro ou escuro).
  function resolver(auto) {
    if (auto.claro) return escuroNoSistema.matches ? auto.escuro : auto.claro;
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
      b.setAttribute("aria-label", `Tema ${nome(atual)}. Mudar para o tema ${nome(proximo(atual))}`);
      b.title = `Tema ${nome(atual)} (clique para o ${nome(proximo(atual))})`;
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

  function alternar(ev) {
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
    });
    // Seguindo o sistema: acompanha quando o Windows troca de tema.
    escuroNoSistema.addEventListener("change", () => {
      if (preferido() === "sistema") aplicar("sistema");
    });
    atualizarBotoes();
  }

  function definirCallback(callback) { aoMudar = callback; }

  // Para o seletor da Aparência: os grupos na ordem do JSON, com os automáticos.
  function opcoes() {
    const grupos = [];
    for (const t of [...AUTOMATICOS, ...TEMAS]) {
      let g = grupos.find((x) => x.nome === t.grupo);
      if (!g) grupos.push((g = { nome: t.grupo, temas: [] }));
      g.temas.push(t);
    }
    return grupos;
  }

  return { init, aplicar, escolher, preferido, efetivo, definirCallback, opcoes, porId: (id) => POR_ID[id] };
})();
