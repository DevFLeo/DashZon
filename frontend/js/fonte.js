// Fonte da interface, escolhida em Configurações > Aparência. Como o tema: fica no navegador
// (para abrir já com a fonte certa, antes do login) e, com alguém logado, nas
// preferências da conta. Troca o atributo data-fonte do <html> (os tokens
// --font-sans no CSS) e a fonte dos gráficos do Chart.js, que desenham num
// <canvas> e não herdam o CSS.
const Fonte = (() => {
  const CHAVE = "dashzon.fonte";
  const FONTES = {
    inter: "Inter (padrão)",
    sistema: "Fonte do sistema",
    nunito: "Nunito (arredondada)",
    atkinson: "Atkinson Hyperlegible (leitura fácil)"
  };

  // Tamanho do texto: escala --fs do CSS (todo font-size em px é multiplicado).
  const TAMANHOS = {
    pequena: { nome: "Pequeno (90%)", escala: 0.9 },
    normal: { nome: "Normal (100%)", escala: 1 },
    grande: { nome: "Grande (115%)", escala: 1.15 },
    muito_grande: { nome: "Muito grande (130%)", escala: 1.3 }
  };
  const CHAVE_TAMANHO = "dashzon.tamanho";
  const TAMANHO_GRAFICO = 12; // padrão do Chart.js

  const tamanhoPreferido = () => {
    const t = Util.storage(CHAVE_TAMANHO);
    return TAMANHOS[t] ? t : "normal";
  };

  const preferida = () => {
    const f = Util.storage(CHAVE);
    return FONTES[f] ? f : "inter";
  };

  // Os gráficos já desenhados são atualizados depois que a fonte carrega (o
  // canvas não redesenha sozinho quando o arquivo da fonte chega).
  function atualizarGraficos() {
    const familia = getComputedStyle(document.body).fontFamily;
    if (!window.Chart) return;
    Chart.defaults.font.family = familia;
    Chart.defaults.font.size = Math.round(TAMANHO_GRAFICO * TAMANHOS[tamanhoPreferido()].escala);
    Object.values(Chart.instances || {}).forEach((g) => g.update("none"));
  }

  function aplicar(fonte) {
    const f = FONTES[fonte] ? fonte : "inter";
    Util.storage(CHAVE, f);
    if (f === "inter") document.documentElement.removeAttribute("data-fonte");
    else document.documentElement.setAttribute("data-fonte", f);
    atualizarGraficos();
    const familia = getComputedStyle(document.body).fontFamily.split(",")[0];
    document.fonts?.load(`14px ${familia}`).then(atualizarGraficos, () => {});
  }

  // Só o texto muda de tamanho; a grade e o layout dos dashboards não.
  function aplicarTamanho(tamanho) {
    const t = TAMANHOS[tamanho] ? tamanho : "normal";
    Util.storage(CHAVE_TAMANHO, t);
    if (t === "normal") document.documentElement.removeAttribute("data-tamanho");
    else document.documentElement.setAttribute("data-tamanho", t);
    atualizarGraficos();
  }

  const init = () => { aplicarTamanho(tamanhoPreferido()); aplicar(preferida()); };

  return { FONTES, TAMANHOS, init, aplicar, aplicarTamanho, preferida, tamanhoPreferido };
})();
