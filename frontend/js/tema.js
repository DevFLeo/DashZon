// Tema claro/escuro. Sol = claro, lua = escuro; o botão gira e troca um pelo
// outro. "sistema" segue o Windows/navegador. A escolha fica no navegador
// (para abrir já no tema certo, antes do login) e, com alguém logado, também
// nas preferências da conta (vale em qualquer computador).
//
// Só troca os tokens de cor (data-theme no <html>); os gráficos são
// redesenhados com as mesmas funções de sempre (REGRA em CLAUDE.md).
const Tema = (() => {
  const CHAVE = "dashzon.tema";
  const escuroNoSistema = window.matchMedia("(prefers-color-scheme: dark)");
  let aoMudar = null; // callback do App para salvar na conta

  function preferido() {
    const t = Util.storage(CHAVE);
    return ["claro", "escuro", "sistema"].includes(t) ? t : "sistema";
  }

  function efetivo(tema = preferido()) {
    if (tema === "sistema") return escuroNoSistema.matches ? "escuro" : "claro";
    return tema;
  }

  function atualizarBotoes() {
    const escuro = efetivo() === "escuro";
    document.querySelectorAll(".tema-btn").forEach((b) => {
      b.classList.toggle("escuro", escuro);
      const proximo = escuro ? "claro" : "escuro";
      b.setAttribute("aria-label", `Mudar para o tema ${proximo}`);
      b.title = `Tema ${escuro ? "escuro" : "claro"} (clique para o ${proximo})`;
    });
  }

  // Aplica sem salvar na conta (usado ao carregar as preferências do login).
  function aplicar(tema) {
    const t = ["claro", "escuro", "sistema"].includes(tema) ? tema : "sistema";
    Util.storage(CHAVE, t);
    if (t === "sistema") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t === "escuro" ? "dark" : "light");
    atualizarBotoes();
    document.dispatchEvent(new CustomEvent("dashzon:tema"));
  }

  function alternar(ev) {
    const botao = ev?.currentTarget;
    const novo = efetivo() === "escuro" ? "claro" : "escuro";
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
