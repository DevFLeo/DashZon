// Carregado no <head>, antes de desenhar a página: aplica o tema, a fonte e o tamanho do texto
// salvos neste navegador (evita piscar no tema/fonte errados). Fica num arquivo,
// e não inline no HTML, porque a política de conteúdo (CSP) só aceita scripts
// do próprio DashZon.
try {
  var t = localStorage.getItem("dashzon.tema");
  var attr = { claro: "light", suave: "soft", escuro: "dark",
    floresta_dia: "floresta-dia", floresta_tarde: "floresta-tarde", floresta_noite: "floresta-noite" }[t];
  if (attr) document.documentElement.setAttribute("data-theme", attr);
  var f = localStorage.getItem("dashzon.fonte");
  if (f === "sistema" || f === "nunito" || f === "atkinson") document.documentElement.setAttribute("data-fonte", f);
  var z = localStorage.getItem("dashzon.tamanho");
  if (z === "pequena" || z === "grande" || z === "muito_grande") document.documentElement.setAttribute("data-tamanho", z);
} catch (_) { /* navegação privada: segue o padrão */ }
