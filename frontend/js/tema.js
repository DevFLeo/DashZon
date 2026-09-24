// Tema: sol (claro) -> pôr do sol (suave) -> lua (escuro) -> sol. O botão gira
// e troca um ícone pelo outro. "sistema" segue o Windows/navegador (claro ou
// escuro). A escolha fica no navegador (para abrir já no tema certo, antes do
// login) e, com alguém logado, também nas preferências da conta.
//
// Só troca os tokens de cor (data-theme no <html>); os gráficos são
// redesenhados com as mesmas funções de sempre (REGRA em CLAUDE.md).
const Tema = (() => {
  const CHAVE = "dashzon.tema";
  const TEMAS = ["sistema", "claro", "suave", "escuro"];
  const ATRIBUTO = { claro: "light", suave: "soft", escuro: "dark" };
  const PROXIMO = { claro: "suave", suave: "escuro", escuro: "claro" };
  const NOME = { claro: "claro (sol)", suave: "suave (pôr do sol)", escuro: "escuro (lua)" };
  const escuroNoSistema = window.matchMedia("(prefers-color-scheme: dark)");
  let aoMudar = null; // callback do App para salvar na conta

  function preferido() {
    const t = Util.storage(CHAVE);
    return TEMAS.includes(t) ? t : "sistema";
  }

  // O tema que está valendo de fato: claro, suave ou escuro.
  function efetivo(tema = preferido()) {
    if (tema === "sistema") return escuroNoSistema.matches ? "escuro" : "claro";
    return tema;
  }

  function atualizarBotoes() {
    const atual = efetivo();
    document.querySelectorAll(".tema-btn").forEach((b) => {
      b.classList.toggle("suave", atual === "suave");
      b.classList.toggle("escuro", atual === "escuro");
      b.setAttribute("aria-label", `Tema ${NOME[atual]}. Mudar para o tema ${NOME[PROXIMO[atual]]}`);
      b.title = `Tema ${NOME[atual]} (clique para o ${NOME[PROXIMO[atual]]})`;
    });
  }

  // Aplica sem salvar na conta (usado ao carregar as preferências do login).
  function aplicar(tema) {
    const t = TEMAS.includes(tema) ? tema : "sistema";
    Util.storage(CHAVE, t);
    if (t === "sistema") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", ATRIBUTO[t]);
    atualizarBotoes();
    document.dispatchEvent(new CustomEvent("dashzon:tema"));
  }

  function alternar(ev) {
    const botao = ev?.currentTarget;
    const novo = PROXIMO[efetivo()];
    if (botao) {
      botao.classList.remove("girando");
      void botao.offsetWidth; // reinicia a animação se clicar de novo rápido
      botao.classList.add("girando");
    }
    aplicar(novo);
    if (aoMudar) aoMudar(novo);
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

  return { init, aplicar, preferido, efetivo, definirCallback };
})();
