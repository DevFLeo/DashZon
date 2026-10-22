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
