// Barra lateral:
//  - seções em cascata (abrem e fecham pelo título);
//  - arrastar e soltar pela alça para reordenar dashboards e módulos (Pointer
//    Events: mouse e toque; no teclado, Alt + seta para cima/baixo). A ordem
//    fica na conta (preferência ordem_menu, via App.salvarOrdem);
//  - barra recolhida numa coluna estreita (só no computador);
//  - menu do botão direito num dashboard, no menu ou na tela dele: "Fixar" /
//    "Fixado" (o mesmo "fixo" do botão do painel). No toque: pressionar e
//    segurar.
// Seções fechadas e barra recolhida são do navegador (localStorage).
const Menu = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  const CHAVE_FECHADAS = "dashzon.menu.fechadas";
  const CHAVE_RECOLHIDO = "dashzon.menu.recolhido";
  const TOQUE_LONGO = 550; // ms segurando para abrir o menu no toque
  const TOLERANCIA = 8; // px que o dedo pode andar sem cancelar o toque longo

  // ----------------------------------------------------------- cascata ----
  function lerFechadas() {
    try {
      const l = JSON.parse(Util.storage(CHAVE_FECHADAS) || "[]");
      return new Set(Array.isArray(l) ? l : []);
    } catch (_) { return new Set(); }
  }

  function definirSecao(botao, aberta) {
    botao.setAttribute("aria-expanded", String(aberta));
    $(botao.getAttribute("aria-controls")).hidden = !aberta;
  }

  function ligarCascata() {
    const fechadas = lerFechadas();
    document.querySelectorAll(".nav-cascata").forEach((b) => {
      const id = b.getAttribute("aria-controls");
      definirSecao(b, !fechadas.has(id));
      b.addEventListener("click", (e) => {
        e.stopPropagation(); // no celular, não fecha a gaveta
        const aberta = b.getAttribute("aria-expanded") !== "true";
        definirSecao(b, aberta);
        const atual = lerFechadas();
        if (aberta) atual.delete(id); else atual.add(id);
        Util.storage(CHAVE_FECHADAS, JSON.stringify([...atual]));
      });
    });
  }

  // ---------------------------------------------------------- recolher ----
  function recolher(sim, guardar = true) {
    $("app").classList.toggle("recolhida", sim);
    const b = $("btn-recolher");
    const rotulo = sim ? "Expandir o menu" : "Recolher o menu";
    b.setAttribute("aria-pressed", String(sim));
    b.setAttribute("aria-label", rotulo);
    b.title = rotulo;
    b.innerHTML = Util.icone(sim ? "expandir" : "recolher");
    if (guardar) Util.storage(CHAVE_RECOLHIDO, sim ? "1" : "0");
    // A área principal mudou de largura sem a janela mudar: avisa a grade e os gráficos.
    window.dispatchEvent(new Event("resize"));
  }

  // ---------------------------------------------------------- arrastar ----
  const chaves = (lista) => [...lista.querySelectorAll(".nav-item[data-ordem]")].map((a) => a.dataset.ordem);

  // Os eventos de mover/soltar ficam no document: o item muda de lugar no DOM
  // durante o arrasto, e isso pode soltar a captura do ponteiro na alça.
  function arrastar(lista, item, e0) {
    const y0 = e0.clientY;
    const antes = chaves(lista).join();
    let movendo = false;

    const mover = (e) => {
      if (e.pointerId !== e0.pointerId) return;
      if (!movendo) {
        if (Math.abs(e.clientY - y0) < 4) return;
        movendo = true;
        item.classList.add("arrastando");
        lista.classList.add("ordenando");
      }
      e.preventDefault();
      const depois = [...lista.querySelectorAll(".nav-item[data-ordem]:not(.arrastando)")].find((x) => {
        const r = x.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      if (depois) { if (item.nextElementSibling !== depois) lista.insertBefore(item, depois); }
      else if (lista.lastElementChild !== item) lista.appendChild(item);
    };
    const fim = (e) => {
      if (e.pointerId !== e0.pointerId) return;
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerup", fim);
      document.removeEventListener("pointercancel", fim);
      item.classList.remove("arrastando");
      lista.classList.remove("ordenando");
      if (movendo && chaves(lista).join() !== antes) App.salvarOrdem(lista.dataset.lista, chaves(lista));
    };
    document.addEventListener("pointermove", mover, { passive: false });
    document.addEventListener("pointerup", fim);
    document.addEventListener("pointercancel", fim);
  }

  // Alt + seta: move o item com foco uma posição.
  function moverComTeclado(lista, item, passo) {
    const ordem = chaves(lista);
    const i = ordem.indexOf(item.dataset.ordem);
    const j = i + passo;
    if (i < 0 || j < 0 || j >= ordem.length) return;
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
    App.salvarOrdem(lista.dataset.lista, ordem); // redesenha o menu na hora
    lista.querySelector(`.nav-item[data-ordem="${CSS.escape(ordem[j])}"]`)?.focus();
  }

  function ligarArrastar() {
    document.querySelectorAll(".nav-lista[data-lista]").forEach((lista) => {
      lista.addEventListener("pointerdown", (e) => {
        const alca = e.target.closest(".nav-alca");
        if (!alca || (e.pointerType === "mouse" && e.button !== 0)) return;
        e.preventDefault(); // sem seleção de texto nem arrastar o link
        arrastar(lista, alca.closest(".nav-item"), e);
      });
      // A alça fica dentro do link: tocar nela não navega (nem fecha a gaveta).
      lista.addEventListener("click", (e) => {
        if (e.target.closest(".nav-alca")) { e.preventDefault(); e.stopPropagation(); }
      });
      lista.addEventListener("dragstart", (e) => e.preventDefault());
      lista.addEventListener("keydown", (e) => {
        const item = e.target.closest(".nav-item[data-ordem]");
        if (!item || !e.altKey || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault();
        moverComTeclado(lista, item, e.key === "ArrowUp" ? -1 : 1);
      });
    });
  }

  // -------------------------------------------------- botão direito ----
  let origemFoco = null;
  let suprimirClique = false;
  let abertoEm = 0;

  function fecharContexto(devolverFoco = false) {
    const m = $("menu-contexto");
    if (m.hidden) return;
    m.hidden = true;
    m.innerHTML = "";
    if (devolverFoco) origemFoco?.focus();
    origemFoco = null;
  }

  function abrirContexto(id, x, y, origem) {
    const d = App.dashboards().find((item) => item.id === id);
    if (!d) return;
    origemFoco = origem;
    abertoEm = Date.now();
    const m = $("menu-contexto");
    m.innerHTML = `<div class="menu-contexto-titulo">${esc(d.nome)}</div>
      <button type="button" role="menuitemcheckbox" aria-checked="${d.fixo}" data-acao="fixar" ${d.editavel ? "" : "disabled"}
        title="${d.fixo ? "Clique para liberar a movimentação dos cards" : "Trava a posição e o tamanho dos cards"}">
        ${Util.icone(d.fixo ? "cadeado" : "cadeado-aberto")}<span>${d.fixo ? "Fixado" : "Fixar"}</span>${d.fixo ? Util.icone("certo") : ""}
      </button>
      ${d.editavel ? "" : '<div class="menu-contexto-nota">Só quem criou (ou um administrador, nos da equipe) fixa este dashboard.</div>'}`;
    m.hidden = false;
    const r = m.getBoundingClientRect();
    m.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
    m.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;

    const botao = m.querySelector('[data-acao="fixar"]');
    (d.editavel ? botao : m).focus?.();
    botao.addEventListener("click", async () => {
      const novo = !d.fixo;
      fecharContexto(true);
      try {
        await Api.put(`/api/dashboards/${d.id}`, { fixo: novo });
        App.marcarFixo(d.id, novo);
        Util.aviso(novo ? `"${d.nome}" fixado` : `"${d.nome}": movimentação liberada`);
      } catch (e) { Util.aviso(e.message, "erro"); }
    });
  }

  // De onde veio o clique: um dashboard do menu ou a tela do dashboard aberto.
  // Em campos, links fora do menu ou com texto selecionado, fica o menu do navegador.
  function alvoDashboard(alvo) {
    const item = alvo.closest("#nav-dashboards .nav-item[data-dashboard]");
    if (item) return { id: Number(item.dataset.dashboard), origem: item };
    const tela = alvo.closest("#view-dashboard.active");
    if (!tela || alvo.closest("input, textarea, select, a[href], .modal-overlay")) return null;
    if (String(getSelection?.() || "").trim()) return null;
    const aberto = Dashboards.aberto();
    return aberto ? { id: aberto.id, origem: $("btn-fixar") } : null;
  }

  function ligarContexto() {
    document.addEventListener("contextmenu", (e) => {
      const alvo = alvoDashboard(e.target);
      if (!alvo) return;
      e.preventDefault();
      // No Android o toque longo também dispara "contextmenu": já está aberto.
      if (!$("menu-contexto").hidden && Date.now() - abertoEm < 800) return;
      let { clientX: x, clientY: y } = e;
      if (!x && !y) { // tecla de menu / Shift+F10: abre junto do item
        const r = alvo.origem.getBoundingClientRect();
        x = r.left + 16;
        y = r.bottom;
      }
      abrirContexto(alvo.id, x, y, alvo.origem);
    });

    // Toque longo (o iPhone não dispara "contextmenu").
    let timer = null;
    let inicio = null;
    const cancelar = () => { clearTimeout(timer); timer = null; };
    document.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" || e.target.closest(".nav-alca, .menu-contexto")) return;
      const alvo = alvoDashboard(e.target);
      if (!alvo) return;
      inicio = { x: e.clientX, y: e.clientY };
      cancelar();
      timer = setTimeout(() => {
        timer = null;
        suprimirClique = true; // o dedo ao soltar não abre o link
        setTimeout(() => { suprimirClique = false; }, 700);
        abrirContexto(alvo.id, inicio.x, inicio.y, alvo.origem);
      }, TOQUE_LONGO);
    });
    document.addEventListener("pointermove", (e) => {
      if (timer && inicio && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > TOLERANCIA) cancelar();
    });
    document.addEventListener("pointerup", cancelar);
    document.addEventListener("pointercancel", cancelar);
    // Ao soltar o dedo, o navegador ainda manda mousedown e click "de
    // compatibilidade": o mousedown tiraria o foco do menu (e o fecharia) e o
    // click abriria o link. Os dois são engolidos.
    const engolir = (e) => {
      if (!suprimirClique || e.target.closest(".menu-contexto")) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "click") suprimirClique = false;
    };
    document.addEventListener("mousedown", engolir, true);
    document.addEventListener("click", engolir, true);

    // Fecha ao clicar fora, com Esc, ao sair pelo Tab, ao rolar ou ao navegar.
    document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".menu-contexto")) fecharContexto(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("menu-contexto").hidden) { e.stopPropagation(); fecharContexto(true); }
    }, true);
    $("menu-contexto").addEventListener("focusout", (e) => {
      if (!suprimirClique && e.relatedTarget && !$("menu-contexto").contains(e.relatedTarget)) fecharContexto();
    });
    window.addEventListener("hashchange", () => fecharContexto());
    window.addEventListener("resize", () => fecharContexto());
    document.addEventListener("scroll", () => fecharContexto(), true);
  }

  function init() {
    ligarCascata();
    ligarArrastar();
    ligarContexto();
    recolher(Util.storage(CHAVE_RECOLHIDO) === "1", false);
    $("btn-recolher").addEventListener("click", () => recolher(!$("app").classList.contains("recolhida")));
  }

  return { init, fecharContexto };
})();
