// Carregado no <head>, antes de desenhar a página: aplica o tema, a fonte e o tamanho do texto
// salvos neste navegador (evita piscar no tema/fonte errados). Fica num arquivo,
// e não inline no HTML, porque a política de conteúdo (CSP) só aceita scripts
// do próprio DashZon.
try {
  // O atributo de cada tema vem de /temas.js (gerado de temas/temas.json).
  var t = localStorage.getItem("dashzon.tema");
  var lista = (window.DASHZON_TEMAS && window.DASHZON_TEMAS.temas) || [];
  var autos = (window.DASHZON_TEMAS && window.DASHZON_TEMAS.automaticos) || [];
  // Automático por estação (Vivaldi): a última estação já começada no ano.
  for (var a = 0; a < autos.length; a++) {
    var est = autos[a].estacoes;
    if (autos[a].id !== t || !est) continue;
    var d = new Date();
    var md = ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    t = est[est.length - 1].tema;
    for (var e = 0; e < est.length; e++) if (est[e].desde <= md) t = est[e].tema;
  }
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].id === t) document.documentElement.setAttribute("data-theme", lista[i].atributo);
  }
  var f = localStorage.getItem("dashzon.fonte");
  if (f === "sistema" || f === "nunito" || f === "atkinson") document.documentElement.setAttribute("data-fonte", f);
  var z = localStorage.getItem("dashzon.tamanho");
  if (z === "pequena" || z === "grande" || z === "muito_grande") document.documentElement.setAttribute("data-tamanho", z);
} catch (_) { /* navegação privada: segue o padrão */ }
