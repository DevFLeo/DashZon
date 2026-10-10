// Carregado no <head>, antes de desenhar a página: aplica o tema e a fonte
// salvos neste navegador (evita piscar no tema/fonte errados). Fica num arquivo,
// e não inline no HTML, porque a política de conteúdo (CSP) só aceita scripts
// do próprio DashZon.
try {
  var t = localStorage.getItem("dashzon.tema");
  var attr = { claro: "light", suave: "soft", escuro: "dark" }[t];
  if (attr) document.documentElement.setAttribute("data-theme", attr);
  var f = localStorage.getItem("dashzon.fonte");
  if (f === "sistema" || f === "nunito" || f === "atkinson") document.documentElement.setAttribute("data-fonte", f);
} catch (_) { /* navegação privada: segue o padrão */ }
