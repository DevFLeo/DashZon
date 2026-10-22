// Carregado no <head>, antes de desenhar a página: aplica o tema, a fonte e o tamanho do texto
// salvos neste navegador (evita piscar no tema/fonte errados). Fica num arquivo,
// e não inline no HTML, porque a política de conteúdo (CSP) só aceita scripts
// do próprio DashZon.
try {
  // O atributo de cada tema vem de /temas.js (gerado de temas/temas.json).
  var t = localStorage.getItem("dashzon.tema");
  var lista = (window.DASHZON_TEMAS && window.DASHZON_TEMAS.temas) || [];
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].id === t) document.documentElement.setAttribute("data-theme", lista[i].atributo);
  }
  var f = localStorage.getItem("dashzon.fonte");
  if (f === "sistema" || f === "nunito" || f === "atkinson") document.documentElement.setAttribute("data-fonte", f);
  var z = localStorage.getItem("dashzon.tamanho");
  if (z === "pequena" || z === "grande" || z === "muito_grande") document.documentElement.setAttribute("data-tamanho", z);
} catch (_) { /* navegação privada: segue o padrão */ }
