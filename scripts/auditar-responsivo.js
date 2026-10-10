// Checagens da auditoria de responsividade (usado por auditar-responsivo.ps1,
// que executa este código dentro da página em cada tamanho de tela). Devolve
// JSON com `erros` (o loop só termina com zero) e `avisos`.
(() => {
  const W = innerWidth, H = innerHeight;
  const mobile = W < 820;
  const erros = [], avisos = [];
  const nome = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    else if (el.classList.length) s += "." + [...el.classList].slice(0, 2).join(".");
    const t = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 22);
    return t ? `${s} "${t}"` : s;
  };
  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05) return false;
    }
    return true;
  };
  // Dentro de um contêiner que recorta/rola na horizontal: sair da tela é intencional.
  const recortado = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (["auto", "scroll", "hidden", "clip"].includes(ox)) return true;
    }
    return false;
  };
  const naTela = (r) => r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;

  const modal = document.querySelector(".modal-overlay.open .modal");
  const raiz = modal || document.body;
  const todos = [...raiz.querySelectorAll("*")].filter(visivel);

  // 1. rolagem horizontal da página inteira
  const sw = document.scrollingElement.scrollWidth;
  if (sw > W + 1) erros.push(`rolagem horizontal na página (${sw}px numa tela de ${W}px)`);

  // 2. elementos que saem da tela sem estar num contêiner com rolagem
  const fora = todos.filter((el) => { const r = el.getBoundingClientRect(); return (r.right > W + 1 || r.left < -1) && !recortado(el); });
  fora.filter((el) => !fora.includes(el.parentElement)).slice(0, 6)
    .forEach((el) => { const r = el.getBoundingClientRect(); erros.push(`fora da tela: ${nome(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`); });

  // 3. alvos de toque (celular/tablet)
  if (mobile) {
    // Links no meio de um texto (Markdown renderizado das notas) ficam de fora:
    // a WCAG 2.5.8 isenta alvos "inline" numa frase, cujo tamanho é o da linha.
    const alvos = todos.filter((el) => el.matches("button, a[href], select, textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), [role=button], summary") &&
      !(el.matches("a") && el.closest(".md")));
    const minusculos = [], pequenos = [];
    alvos.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!naTela(r)) return;
      const m = Math.min(r.width, r.height);
      if (m < 24) minusculos.push(el); else if (m < 36) pequenos.push(el);
    });
    if (minusculos.length) erros.push(`${minusculos.length} alvos de toque < 24px: ` + minusculos.slice(0, 4).map(nome).join(" | "));
    if (pequenos.length) avisos.push(`${pequenos.length} alvos de toque < 36px: ` + pequenos.slice(0, 4).map(nome).join(" | "));
    const zoom = todos.filter((el) => el.matches("input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea") && parseFloat(getComputedStyle(el).fontSize) < 16);
    if (zoom.length) avisos.push(`${zoom.length} campos com fonte < 16px (o iPhone dá zoom ao tocar): ` + zoom.slice(0, 3).map((el) => nome(el) + " " + getComputedStyle(el).fontSize).join(" | "));
  }

  // 4. texto que não cabe na caixa (cortado ou vazando)
  const cortados = todos.filter((el) => {
    if (!el.matches("button, .btn, h1, h2, h3, label, .nav-item, .kpi .value, .kpi .label, .widget-kpi, .chip, .tpl-card, .page-header *")) return false;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === "ellipsis") return false;
    return el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0;
  });
  if (cortados.length) erros.push(`${cortados.length} textos maiores que a caixa: ` + cortados.slice(0, 4).map(nome).join(" | "));

  // 5. modal cabe na tela
  if (modal) {
    const r = modal.getBoundingClientRect();
    if (r.width > W + 1) erros.push(`modal mais largo que a tela (${Math.round(r.width)}px)`);
    if (modal.scrollHeight > modal.clientHeight + 2 && getComputedStyle(modal).overflowY === "visible") erros.push("modal maior que a tela sem rolagem");
    if (r.top < -1 || r.bottom > H + 1) erros.push(`modal sai da tela na vertical [${Math.round(r.top)}..${Math.round(r.bottom)}]`);
  }

  // 6. cards do dashboard estreitos demais para ler
  const cards = todos.filter((el) => el.matches(".grid-stack-item"));
  const estreitos = cards.filter((el) => el.getBoundingClientRect().width < 150);
  if (estreitos.length) erros.push(`${estreitos.length} de ${cards.length} cards com menos de 150px de largura (ilegíveis)`);

  // 7. texto miúdo
  const miudos = todos.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 11);
  if (miudos.length) avisos.push(`${miudos.length} textos com fonte < 11px: ` + miudos.slice(0, 3).map(nome).join(" | "));

  // 8. sobreposição de botões (ex.: barra de ações espremida)
  const botoes = todos.filter((el) => el.matches(".btn, .icon-btn, .tema-btn") && naTela(el.getBoundingClientRect()));
  let sobre = 0; const exemplos = [];
  for (let i = 0; i < botoes.length; i++) for (let j = i + 1; j < botoes.length; j++) {
    const a = botoes[i].getBoundingClientRect(), b = botoes[j].getBoundingClientRect();
    if (botoes[i].contains(botoes[j]) || botoes[j].contains(botoes[i])) continue;
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (x > 2 && y > 2) { sobre++; if (exemplos.length < 3) exemplos.push(nome(botoes[i]) + " x " + nome(botoes[j])); }
  }
  if (sobre) erros.push(`${sobre} botões sobrepostos: ${exemplos.join(" | ")}`);

  return JSON.stringify({ erros, avisos, sw, W });
})()
