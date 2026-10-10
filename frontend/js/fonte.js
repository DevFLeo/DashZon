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

  const init = () => aplicar(preferida());

  return { FONTES, init, aplicar, preferida };
})();
