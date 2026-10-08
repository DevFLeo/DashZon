// Dashboard no celular: em vez de 12 colunas espremidas, os cards são
// empilhados em ordem de leitura (de cima para baixo, da esquerda para a
// direita), com os pequenos (KPIs) dois por linha. Ver o bloco "Dashboard no
// celular" do style.css.
//
// REGRA (ver CLAUDE.md): isto NÃO altera o layout do dashboard. Só LÊ os
// atributos gs-x/gs-y/gs-w/gs-h que o GridStack já põe em cada card e os
// copia para `order`, a altura e uma classe usados pelo CSS do celular. Não
// chama o GridStack e não grava nada: no computador a grade de 12 colunas e o
// layout salvo continuam exatamente iguais.
const Responsivo = (() => {
  const LARGURA_MEIA = 3; // cards de até 3 das 12 colunas (KPIs) ocupam meia linha no celular

  function aplicar(grade) {
    grade.querySelectorAll(":scope > .grid-stack-item").forEach((el) => {
      const x = Number(el.getAttribute("gs-x")) || 0;
      const y = Number(el.getAttribute("gs-y")) || 0;
      const w = Number(el.getAttribute("gs-w")) || 12;
      const h = Number(el.getAttribute("gs-h")) || 3;
      el.style.order = String(y * 12 + x);
      el.style.setProperty("--gs-h", String(h));
      el.classList.toggle("cel-meia", w <= LARGURA_MEIA);
    });
  }

  function init() {
    const grade = document.getElementById("grid");
    if (!grade) return;
    // Observa só a entrada/saída de cards e os atributos de posição: as
    // mudanças feitas aqui (style, class) não disparam o observador de novo.
    new MutationObserver(() => aplicar(grade)).observe(grade, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["gs-x", "gs-y", "gs-w", "gs-h"]
    });
    aplicar(grade);
  }

  document.addEventListener("DOMContentLoaded", init);
  return { aplicar };
})();
