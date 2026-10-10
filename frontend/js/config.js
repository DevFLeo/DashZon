// Página de Configurações (#/config/<aba>). As abas Conta, Aparência e
// Segurança usam os formulários do Conta (js/conta.js). A aba Módulos:
//  - liga/desliga cada módulo no menu da pessoa (preferência modulos_ocultos;
//    os dados e os cards continuam, e os outros usuários não são afetados);
//  - mostra as opções de um módulo LIGADO que declare "configuracoes" (lista
//    de campos): opções de seleção e valores padrão, sem mexer no JSON;
//  - lista os módulos da galeria que ainda não estão instalados.
// Nada aqui conhece um módulo específico: tudo vem do schema.
const Config = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  const ABAS = ["conta", "aparencia", "seguranca", "modulos"];
  let eu = null;

  async function abrir(aba) {
    const a = ABAS.includes(aba) ? aba : "conta";
    document.querySelectorAll("#view-config .aba").forEach((x) => {
      x.classList.toggle("active", x.dataset.aba === a);
      if (x.dataset.aba === a) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current");
    });
    document.querySelectorAll("#view-config .aba-painel").forEach((p) => { p.hidden = p.dataset.painel !== a; });
    eu = await Conta.abrir();
    if (a === "modulos") await renderModulos();
  }

  const ocultos = () => new Set(eu?.preferencias?.modulos_ocultos || []);
  const campoDe = (m, id) => m.schema.campos.find((c) => c.id === id);

  // ------------------------------------------------------ seus módulos ----
  async function renderModulos() {
    const off = ocultos();
    const mods = App.modulos();
    $("cfg-modulos").innerHTML = mods.length
      ? mods.map((m) => linhaModulo(m, !off.has(m.slug))).join("")
      : '<p class="hint">Nenhum módulo instalado ainda. Adicione abaixo.</p>';
    $("cfg-modulos").querySelectorAll("[data-ligar]").forEach((cx) => cx.addEventListener("change", () => alternar(cx)));
    $("cfg-modulos").querySelectorAll("form.cfg-opcoes").forEach((f) => f.addEventListener("submit", salvarOpcoes));
    await renderDisponiveis();
  }

  function linhaModulo(m, ligado) {
    const campos = (m.schema.configuracoes || []).map((id) => campoDe(m, id)).filter(Boolean);
    return `<div class="cfg-modulo ${ligado ? "" : "desligado"}" data-slug="${esc(m.slug)}">
      <div class="cfg-modulo-topo">
        <div class="cfg-modulo-info">
          <strong>${esc(m.nome)}</strong> <span class="hint">${Util.fmtNumero(m.total, 0)} registro(s)</span>
          ${m.descricao ? `<div class="hint">${esc(m.descricao)}</div>` : ""}
        </div>
        <label class="interruptor">
          <input type="checkbox" role="switch" data-ligar="${esc(m.slug)}" ${ligado ? "checked" : ""} aria-label="Mostrar ${esc(m.nome)} no menu">
          <span class="interruptor-trilho" aria-hidden="true"></span>
          <span class="interruptor-rotulo">${ligado ? "Ligado" : "Desligado"}</span>
        </label>
      </div>
      ${ligado && campos.length ? formOpcoes(m, campos) : ""}
    </div>`;
  }

  // Opções do módulo: um controle por campo declarado em "configuracoes".
  function formOpcoes(m, campos) {
    const id = (c, s) => `cfg-${m.slug}-${c.id}-${s}`;
    const padrao = (c) => c.padrao ?? "";
    const blocos = campos.map((c) => {
      const rot = esc(c.nome);
      switch (c.tipo) {
        case "selecao": {
          const opts = (c.opcoes || []).map((o) => `<option value="${esc(o)}" ${o === padrao(c) ? "selected" : ""}>${esc(o)}</option>`).join("");
          return `<div class="field"><label for="${id(c, "opcoes")}">${rot}: opções (uma por linha)</label>
              <textarea id="${id(c, "opcoes")}" rows="5" data-opcoes="${esc(c.id)}">${esc((c.opcoes || []).join("\n"))}</textarea></div>
            <div class="field"><label for="${id(c, "padrao")}">${rot}: já vem marcado</label>
              <select id="${id(c, "padrao")}" data-padrao="${esc(c.id)}"><option value="">— nenhum —</option>${opts}</select></div>`;
        }
        case "booleano":
          return `<label class="field-check"><input type="checkbox" data-padrao-bool="${esc(c.id)}" ${c.padrao === true ? "checked" : ""}> ${rot}: já vem marcado</label>`;
        case "data": {
          const v = padrao(c);
          const outro = v && v !== "$hoje" ? `<option value="${esc(v)}" selected>${esc(v)}</option>` : "";
          return `<div class="field"><label for="${id(c, "padrao")}">${rot}: padrão</label>
            <select id="${id(c, "padrao")}" data-padrao="${esc(c.id)}"><option value="">— vazio —</option>
            <option value="$hoje" ${v === "$hoje" ? "selected" : ""}>Hoje</option>${outro}</select></div>`;
        }
        default: {
          const tipo = { numero: "number", moeda: "number", hora: "time" }[c.tipo] || "text";
          return `<div class="field"><label for="${id(c, "padrao")}">${rot}: padrão</label>
            <input id="${id(c, "padrao")}" type="${tipo}" ${tipo === "number" ? 'step="any"' : ""} data-padrao="${esc(c.id)}" data-tipo="${c.tipo}" value="${esc(padrao(c))}"></div>`;
        }
      }
    }).join("");
    return `<form class="cfg-opcoes" data-slug="${esc(m.slug)}">
      <h3>Opções de ${esc(m.nome)}</h3>
      <div class="cfg-opcoes-campos">${blocos}</div>
      <div class="form-erro" hidden></div>
      <div class="modal-actions"><button type="submit" class="btn btn-primary btn-sm">Salvar opções</button></div>
    </form>`;
  }

  async function salvarOpcoes(ev) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const erro = form.querySelector(".form-erro");
    erro.hidden = true;
    try {
      const m = await Api.get(`/api/modulos/${encodeURIComponent(form.dataset.slug)}`);
      const { slots, ...schema } = m.schema;
      const campos = schema.campos.map((c) => {
        const n = { ...c };
        const opcoes = form.querySelector(`[data-opcoes="${c.id}"]`);
        if (opcoes) {
          n.opcoes = [...new Set(opcoes.value.split("\n").map((s) => s.trim()).filter(Boolean))];
          if (!n.opcoes.length) throw new Error(`"${c.nome}" precisa de pelo menos uma opção`);
        }
        const pad = form.querySelector(`[data-padrao="${c.id}"]`);
        const bool = form.querySelector(`[data-padrao-bool="${c.id}"]`);
        if (bool) n.padrao = bool.checked;
        if (pad) {
          let v = pad.value.trim();
          if (pad.dataset.tipo === "numero" || pad.dataset.tipo === "moeda") v = v === "" ? "" : Number(v);
          // Padrão que deixou de ser opção (opção removida acima) cai para "nenhum".
          if (v === "" || (n.opcoes && !n.opcoes.includes(v))) delete n.padrao; else n.padrao = v;
        }
        return n;
      });
      await Api.put(`/api/modulos/${encodeURIComponent(m.slug)}`, { nome: m.nome, descricao: m.descricao, icone: m.icone, ...schema, campos });
      await App.recarregarNav();
      Util.aviso(`Opções de ${m.nome} salvas`);
      await renderModulos();
    } catch (e) {
      erro.textContent = e.message;
      erro.hidden = false;
    }
  }

  async function alternar(cx) {
    const lista = ocultos();
    if (cx.checked) lista.delete(cx.dataset.ligar); else lista.add(cx.dataset.ligar);
    cx.disabled = true;
    try {
      eu = await Api.put("/api/eu/preferencias", { modulos_ocultos: [...lista] });
      App.atualizarUsuario(eu);
      await App.recarregarNav();
      await renderModulos();
    } catch (e) {
      cx.checked = !cx.checked;
      cx.disabled = false;
      Util.aviso(e.message, "erro");
    }
  }

  // ------------------------------------------------ adicionar módulos ----
  async function renderDisponiveis() {
    const templates = await Api.get("/api/templates");
    const instalados = new Set(App.modulos().map((m) => m.nome.trim().toLowerCase()));
    const faltando = templates.filter((t) => t.modulos.some((m) => !instalados.has(String(m.nome).trim().toLowerCase())));
    $("cfg-disponiveis").innerHTML = faltando.length ? faltando.map((t) => {
      const mods = t.modulos.map((m) => (instalados.has(String(m.nome).trim().toLowerCase()) ? `${esc(m.nome)} (já instalado)` : esc(m.nome))).join(", ");
      return `<div class="cfg-disponivel">
        <div><strong>${esc(t.nome)}</strong>${t.origem === "importado" ? ' <span class="chip">Importado</span>' : ""}
          ${t.descricao ? `<div class="hint">${esc(t.descricao)}</div>` : ""}
          <div class="hint">Módulos: ${mods}</div></div>
        <button type="button" class="btn btn-sm btn-primary" data-instalar="${esc(t.id)}">Adicionar</button>
      </div>`;
    }).join("") : '<p class="hint">Você já tem todos os módulos da galeria.</p>';
    $("cfg-disponiveis").querySelectorAll("[data-instalar]").forEach((b) => b.addEventListener("click", () => instalar(b)));
  }

  async function instalar(botao) {
    botao.disabled = true;
    try {
      const res = await Api.post("/api/templates/instalar", { template_id: botao.dataset.instalar, com_exemplos: $("cfg-exemplos").checked });
      // Um módulo que estava desligado e veio de novo pela galeria volta a aparecer.
      const lista = ocultos();
      const antes = lista.size;
      res.modulos.forEach((s) => lista.delete(s));
      if (lista.size !== antes) {
        eu = await Api.put("/api/eu/preferencias", { modulos_ocultos: [...lista] });
        App.atualizarUsuario(eu);
      }
      await App.recarregarNav();
      Util.aviso(Util.resumoInstalacao(res));
      await renderModulos();
    } catch (e) {
      botao.disabled = false;
      Util.aviso(e.message, "erro");
    }
  }

  return { abrir };
})();
