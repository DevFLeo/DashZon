// Tela genérica de módulo. Nada aqui conhece "gastos" ou "demandas": resumo,
// filtros, tabela e formulário são montados a partir do schema JSON do
// módulo (campos + tipos + resumo).
const Modulos = (() => {
  let atual = null;
  let registros = [];
  let filtros = {};
  let busca = "";
  let editandoId = null;
  // O formulário de registro também é aberto pelo dashboard ("Lançar"), então
  // guarda o próprio módulo e o que fazer depois de salvar.
  let formModulo = null;
  let aoSalvar = null;

  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;

  const ESQUELETO = {
    slug: "meu_modulo",
    nome: "Meu módulo",
    descricao: "Para que serve este cadastro",
    campos: [
      { id: "nome", nome: "Nome", tipo: "texto", obrigatorio: true },
      { id: "categoria", nome: "Categoria", tipo: "selecao", opcoes: ["A", "B", "C"] },
      { id: "valor", nome: "Valor", tipo: "moeda" },
      { id: "data", nome: "Data", tipo: "data", padrao: "$hoje" },
      { id: "ativo", nome: "Ativo", tipo: "booleano", padrao: true }
    ],
    resumo: [
      { titulo: "Registros", agregacao: "contagem" },
      { titulo: "Valor total", agregacao: "soma", campo: "valor" }
    ]
  };

  const campos = () => atual.schema.campos;

  // ------------------------------------------------------------- tela ----
  async function abrir(slug) {
    atual = await Api.get(`/api/modulos/${encodeURIComponent(slug)}`);
    filtros = {};
    busca = "";
    $("mod-busca").value = "";
    $("mod-titulo").textContent = atual.nome;
    $("mod-descricao").textContent = atual.descricao || "";
    renderFiltros();
    await Promise.all([carregarResumo(), carregarRegistros()]);
  }

  async function recarregar() {
    await Promise.all([carregarResumo(), carregarRegistros(), App.recarregarNav()]);
  }

  async function carregarResumo() {
    const itens = await Api.get(`/api/modulos/${atual.slug}/resumo`);
    const alvo = $("mod-resumo");
    alvo.hidden = !itens.length;
    alvo.innerHTML = itens.map((r) => {
      const moeda = r.formato === "moeda";
      const texto = r.agregacao === "contagem" ? Util.fmtNumero(r.valor, 0) : moeda ? Util.fmtMoeda(r.valor) : Util.fmtNumero(r.valor);
      const sinal = r.agregacao === "saldo" ? (r.valor >= 0 ? "positivo" : "negativo") : "";
      return `<div class="kpi"><div class="label">${esc(r.titulo)}</div><div class="value ${sinal} ${moeda ? "sensivel" : ""}">${texto}</div></div>`;
    }).join("");
  }

  function renderFiltros() {
    const alvo = $("mod-filtros");
    // Movimento e sim/não primeiro (os filtros mais usados), depois seleções.
    const prioridade = { movimento: 0, booleano: 1, selecao: 2 };
    const filtraveis = campos()
      .filter((c) => Util.SERIES.includes(c.tipo))
      .sort((a, b) => prioridade[a.tipo] - prioridade[b.tipo])
      .slice(0, 4);
    alvo.innerHTML = filtraveis.map((c) => `
      <select data-filtro="${c.id}" aria-label="Filtrar por ${esc(c.nome)}">
        <option value="">${esc(c.nome)}: todos</option>
        ${Util.opcoesDe(c).map((o) => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join("")}
      </select>`).join("");
    alvo.querySelectorAll("select").forEach((s) => s.addEventListener("change", () => {
      filtros[s.dataset.filtro] = s.value;
      carregarRegistros();
    }));
  }

  // Cada busca ganha um número; uma resposta que chega depois de outra mais
  // nova (busca digitada rápido) é descartada em vez de sobrescrever a tabela.
  let ultimaBusca = 0;
  // A API devolve uma página por vez (200); "Carregar mais" pede a próxima e
  // acrescenta. `totalRegistros` é o total encontrado pela busca/filtros.
  let totalRegistros = 0;

  async function carregarRegistros(mais = false) {
    const qs = new URLSearchParams();
    if (busca) qs.set("q", busca);
    Object.entries(filtros).forEach(([k, v]) => { if (v) qs.set(`f[${k}]`, v); });
    if (mais) qs.set("inicio", registros.length);
    const minha = ++ultimaBusca;
    const res = await Api.get(`/api/modulos/${atual.slug}/registros?${qs}`);
    if (minha !== ultimaBusca) return;
    registros = mais ? registros.concat(res.result) : res.result;
    totalRegistros = res.count;
    $("mod-contagem").textContent = registros.length < totalRegistros
      ? `${Util.fmtNumero(registros.length, 0)} de ${Util.fmtNumero(totalRegistros, 0)} registro(s)`
      : `${Util.fmtNumero(totalRegistros, 0)} registro(s)`;
    renderTabela();
  }

  function celula(c, r) {
    const v = r[c.id];
    // Sim/não vira checklist: marca direto na tabela (PATCH só deste campo).
    if (c.tipo === "booleano") {
      const rotulo = `${c.nome}: ${Util.fmtValor(campos().find((x) => x.id === atual.schema.rotulo) || c, r[atual.schema.rotulo])}`;
      return `<td class="cel-check"><label class="marcar"><input type="checkbox" data-marcar="${r.id}" data-campo="${c.id}" ${v ? "checked" : ""}
        aria-label="${esc(rotulo)}"></label></td>`;
    }
    if (c.tipo === "movimento" && v) return `<td><span class="chip chip-${v}">${Util.fmtValor(c, v)}</span></td>`;
    if (c.tipo === "selecao" && v) return `<td><span class="chip">${esc(v)}</span></td>`;
    const texto = esc(Util.fmtValor(c, v));
    const classes = [Util.NUMERICOS.includes(c.tipo) ? "num" : "", c.tipo === "moeda" ? "sensivel" : ""].join(" ");
    return `<td class="${classes}">${c.id === atual.schema.rotulo ? `<strong>${texto}</strong>` : texto}</td>`;
  }

  function renderTabela() {
    const alvo = $("mod-tabela");
    if (!registros.length) {
      const filtrando = busca || Object.values(filtros).some(Boolean);
      alvo.innerHTML = `<div class="empty-state"><h2>Nenhum registro</h2>
        <div>${filtrando ? "Nada encontrado com essa busca ou filtro." : "Comece cadastrando o primeiro."}</div>
        ${filtrando ? "" : '<button class="btn btn-primary" data-novo>+ Novo registro</button>'}</div>`;
      alvo.querySelector("[data-novo]")?.addEventListener("click", () => abrirFormulario());
      return;
    }

    const cols = campos().filter((c) => c.lista !== false).slice(0, 7);
    const head = cols.map((c) => `<th class="${Util.NUMERICOS.includes(c.tipo) ? "num" : c.tipo === "booleano" ? "cel-check" : ""}">${esc(c.nome)}</th>`).join("");
    // "nota": cada registro abre (ou cria) a nota de mesmo título no módulo de
    // notas declarado, se ele estiver instalado e ligado para esta pessoa.
    const nota = atual.schema.nota && App.modulosVisiveis().find((m) => m.slug === atual.schema.nota.modulo && m.schema.visao);
    const linhas = registros.map((r) => `<tr>${cols.map((c) => celula(c, r)).join("")}
      <td><div class="row-actions">
        ${nota ? `<button class="btn btn-sm" data-nota-de="${r.id}" title="Abrir a anotação de ${esc(String(r[atual.schema.nota.titulo] ?? ""))}">Nota</button>` : ""}
        <button class="btn btn-sm" data-editar="${r.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-excluir="${r.id}">Excluir</button>
      </div></td></tr>`).join("");

    const faltam = totalRegistros - registros.length;
    const mais = faltam > 0
      ? `<div class="carregar-mais"><button class="btn" data-mais>Carregar mais (${Util.fmtNumero(faltam, 0)} restante${faltam > 1 ? "s" : ""})</button></div>`
      : "";
    alvo.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr>${head}<th></th></tr></thead><tbody>${linhas}</tbody></table></div>${mais}`;
    alvo.querySelector("[data-mais]")?.addEventListener("click", (e) => {
      e.currentTarget.disabled = true;
      carregarRegistros(true);
    });
    // Editar lê o registro do banco: a lista vem do motor de busca e não deve
    // ser a base do que é regravado.
    alvo.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", async () => {
      try {
        abrirFormulario(await Api.get(`/api/modulos/${atual.slug}/registros/${b.dataset.editar}`));
      } catch (e) { Util.aviso(e.message, "erro"); }
    }));
    alvo.querySelectorAll("[data-excluir]").forEach((b) => b.addEventListener("click", () => excluirRegistro(b.dataset.excluir)));
    alvo.querySelectorAll("[data-marcar]").forEach((cx) => cx.addEventListener("change", () => marcar(cx)));
    alvo.querySelectorAll("[data-nota-de]").forEach((b) => b.addEventListener("click", () => {
      const r = registros.find((x) => String(x.id) === b.dataset.notaDe);
      const n = atual.schema.nota;
      Notas.abrirOuCriar(n.modulo, r?.[n.titulo], n.pasta ? r?.[n.pasta] : "").catch((e) => Util.aviso(e.message, "erro"));
    }));
  }

  // Checklist: grava só o campo marcado. Em caso de erro, desfaz a marcação.
  async function marcar(cx) {
    const id = Number(cx.dataset.marcar);
    cx.disabled = true;
    try {
      const novo = await Api.patch(`/api/modulos/${atual.slug}/registros/${id}`, { [cx.dataset.campo]: cx.checked });
      const i = registros.findIndex((r) => r.id === id);
      if (i >= 0) registros[i] = { ...registros[i], ...novo };
      await carregarResumo();
    } catch (e) {
      cx.checked = !cx.checked;
      Util.aviso(e.message, "erro");
    } finally {
      cx.disabled = false;
    }
  }

  // ------------------------------------------------------- formulário ----
  function inputHtml(c, valor) {
    const id = `r-${c.id}`;
    const req = c.obrigatorio ? "required" : "";
    const label = `<label for="${id}" class="${c.obrigatorio ? "obrigatorio" : ""}">${esc(c.nome)}</label>`;
    const ajuda = c.ajuda ? `<div class="ajuda">${esc(c.ajuda)}</div>` : "";

    switch (c.tipo) {
      case "booleano":
        return `<div class="field field-check"><label><input type="checkbox" id="${id}" ${valor ? "checked" : ""}> ${esc(c.nome)}</label>${ajuda}</div>`;
      case "texto_longo":
        return `<div class="field">${label}<textarea id="${id}" ${req}>${esc(valor ?? "")}</textarea>${ajuda}</div>`;
      case "selecao":
      case "movimento": {
        const vazio = c.obrigatorio && valor ? "" : '<option value="">—</option>';
        const opcoes = Util.opcoesDe(c);
        // Valor gravado com uma opção que saiu da estrutura: continua na lista
        // (e selecionado), senão o navegador trocaria ou apagaria o valor ao salvar.
        const removida = valor && !opcoes.some((o) => o.v === valor)
          ? `<option value="${esc(valor)}" selected>${esc(valor)} (opção removida)</option>` : "";
        const opts = opcoes.map((o) => `<option value="${esc(o.v)}" ${o.v === valor ? "selected" : ""}>${esc(o.l)}</option>`).join("");
        return `<div class="field">${label}<select id="${id}" ${req}>${vazio}${removida}${opts}</select>${ajuda}</div>`;
      }
      default: {
        const tipo = { numero: "number", moeda: "number", data: "date", hora: "time" }[c.tipo] || "text";
        const step = c.tipo === "moeda" ? 'step="0.01"' : c.tipo === "numero" ? 'step="any"' : "";
        return `<div class="field">${label}<input id="${id}" type="${tipo}" ${step} ${req} value="${esc(valor ?? "")}">${ajuda}</div>`;
      }
    }
  }

  function abrirFormulario(registro = null, modulo = atual, depois = recarregar) {
    formModulo = modulo;
    aoSalvar = depois;
    editandoId = registro ? registro.id : null;
    $("registro-titulo").textContent = registro ? `Editar registro · ${modulo.nome}` : `Novo registro · ${modulo.nome}`;
    $("registro-campos").innerHTML = modulo.schema.campos.map((c) => inputHtml(c, registro ? registro[c.id] : Util.resolverToken(c.padrao))).join("");
    erroRegistro("");
    Util.abrirModal("modal-registro");
    $("registro-campos").querySelector("input, select, textarea")?.focus();
  }

  function coletar() {
    const dados = {};
    formModulo.schema.campos.forEach((c) => {
      const el = $(`r-${c.id}`);
      if (c.tipo === "booleano") dados[c.id] = el.checked;
      else if (Util.NUMERICOS.includes(c.tipo)) dados[c.id] = el.value === "" ? null : Number(el.value);
      else dados[c.id] = el.value === "" ? null : el.value;
    });
    return dados;
  }

  function erroRegistro(msg) {
    $("registro-erro").textContent = msg;
    $("registro-erro").hidden = !msg;
  }

  async function salvarRegistro(ev) {
    ev.preventDefault();
    try {
      const dados = coletar();
      const slug = formModulo.slug;
      if (editandoId) await Api.put(`/api/modulos/${slug}/registros/${editandoId}`, dados);
      else await Api.post(`/api/modulos/${slug}/registros`, dados);
      Util.fecharModal("modal-registro");
      Util.aviso(editandoId ? "Registro atualizado" : `Lançado em ${formModulo.nome}`);
      await aoSalvar();
    } catch (e) {
      erroRegistro(e.message);
    }
  }

  async function excluirRegistro(id) {
    if (!confirm("Excluir este registro?")) return;
    await Api.del(`/api/modulos/${atual.slug}/registros/${id}`);
    await recarregar();
  }

  // ---------------------------------------------------- estrutura JSON ----
  // Módulo cuja estrutura está aberta no editor (a tabela ou um caderno de notas).
  let estruturaDe = null;

  // Tudo o que o schema declara (campos, resumo, ordenacao, visao, nota,
  // configuracoes...) vai para o editor; só os slots, detalhe interno, ficam de fora.
  function abrirEstrutura(mod = atual) {
    estruturaDe = mod;
    const { slots, ...schema } = mod.schema;
    const def = { slug: mod.slug, nome: mod.nome, descricao: mod.descricao, icone: mod.icone, ...schema };
    $("estrutura-json").value = JSON.stringify(def, null, 2);
    erroEstrutura("");
    Util.abrirModal("modal-estrutura");
  }

  function erroEstrutura(msg) {
    $("estrutura-erro").textContent = msg;
    $("estrutura-erro").hidden = !msg;
  }

  function lerJson(texto) {
    try {
      return JSON.parse(texto);
    } catch (e) {
      throw new Error(`JSON inválido: ${e.message}`);
    }
  }

  async function salvarEstrutura(ev) {
    ev.preventDefault();
    try {
      // O PUT devolve o módulo atualizado: usa já, para que um clique rápido em
      // "Novo registro" monte o formulário com o schema novo.
      const salvo = await Api.put(`/api/modulos/${estruturaDe.slug}`, lerJson($("estrutura-json").value));
      Util.fecharModal("modal-estrutura");
      Util.aviso("Estrutura salva");
      await App.recarregarNav();
      if (atual?.slug === salvo.slug) atual = salvo;
      // A estrutura pode ter mudado a visão (tabela <-> notas): a rota decide a tela.
      Notas.esquecer();
      App.ir(`#/m/${encodeURIComponent(salvo.slug)}`);
    } catch (e) {
      erroEstrutura(e.message);
    }
  }

  async function excluirModulo() {
    const total = App.modulo(atual.slug)?.total ?? 0;
    if (!confirm(`Excluir o módulo "${atual.nome}" e seus ${total} registro(s)?\nWidgets que usam este módulo também serão removidos.`)) return;
    await Api.del(`/api/modulos/${atual.slug}`);
    Util.aviso("Módulo excluído");
    await App.recarregarNav();
    App.irPadrao();
  }

  // ----------------------------------------------- adicionar módulo ----
  function erroAdicionar(msg) {
    $("add-erro").textContent = msg;
    $("add-erro").hidden = !msg;
  }

  // Aceita um template completo ou a definição de um único módulo.
  function comoTemplate(obj) {
    if (obj && Array.isArray(obj.modulos)) return obj;
    if (obj && Array.isArray(obj.campos)) return { id: "personalizado", nome: obj.nome || "Módulo personalizado", modulos: [obj], dashboards: [] };
    throw new Error("O JSON precisa ter \"modulos\" (template) ou \"campos\" (um módulo).");
  }

  async function instalar(corpo) {
    const res = await Api.post("/api/templates/instalar", { ...corpo, com_exemplos: $("add-exemplos").checked });
    Util.fecharModal("modal-add-modulo");
    Util.aviso(Util.resumoInstalacao(res));
    await App.recarregarNav();
    App.ir(`#/m/${res.modulos[0]}`);
  }

  function trocarAba(id) {
    document.querySelectorAll("#modal-add-modulo .tabs button").forEach((b) => b.classList.toggle("active", b.dataset.aba === id));
    $("aba-galeria").hidden = id !== "aba-galeria";
    $("aba-json").hidden = id !== "aba-json";
    erroAdicionar("");
  }

  async function abrirAdicionar() {
    const templates = await Api.get("/api/templates");
    $("add-galeria").innerHTML = templates.map((t) => Setup.cardHtml({
      id: t.id, nome: t.nome, descricao: t.descricao, tag: Setup.tagDe(t),
      modulos: t.modulos.map((m) => m.nome), dashboards: t.dashboards, selecionavel: false
    })).join("");
    $("add-galeria").querySelectorAll(".tpl-card").forEach((card) => card.addEventListener("click", async () => {
      const t = templates.find((x) => x.id === card.dataset.id);
      if (!confirm(`Instalar "${t.nome}"? Um módulo com o mesmo nome de um já existente é reaproveitado (sem repetir os dados de exemplo).`)) return;
      try { await instalar({ template_id: t.id }); } catch (e) { erroAdicionar(e.message); }
    }));
    $("add-previa").textContent = "";
    trocarAba("aba-galeria");
    Util.abrirModal("modal-add-modulo");
  }

  async function validarJson() {
    erroAdicionar("");
    try {
      const template = comoTemplate(lerJson($("add-json").value));
      const p = await Api.post("/api/templates/validar", { template });
      $("add-previa").textContent = `Válido: ${p.modulos.join(", ")}${p.dashboards.length ? ` · dashboards: ${p.dashboards.join(", ")}` : ""}`;
      return template;
    } catch (e) {
      $("add-previa").textContent = "";
      erroAdicionar(e.message);
      return null;
    }
  }

  // ---------------------------------------------------------- init ----
  function init() {
    $("btn-novo-registro").addEventListener("click", () => abrirFormulario());
    $("form-registro").addEventListener("submit", salvarRegistro);
    $("btn-estrutura").addEventListener("click", () => abrirEstrutura());
    $("form-estrutura").addEventListener("submit", salvarEstrutura);
    $("estrutura-formatar").addEventListener("click", () => {
      try {
        $("estrutura-json").value = JSON.stringify(lerJson($("estrutura-json").value), null, 2);
        erroEstrutura("");
      } catch (e) { erroEstrutura(e.message); }
    });
    $("btn-excluir-modulo").addEventListener("click", excluirModulo);
    $("mod-busca").addEventListener("input", Util.debounce((e) => {
      busca = e.target.value.trim();
      carregarRegistros();
    }, 250));

    $("btn-add-modulo").addEventListener("click", abrirAdicionar);
    document.querySelectorAll("#modal-add-modulo .tabs button").forEach((b) => b.addEventListener("click", () => trocarAba(b.dataset.aba)));
    $("add-esqueleto").addEventListener("click", () => { $("add-json").value = JSON.stringify(ESQUELETO, null, 2); });
    $("add-arquivo").addEventListener("change", async (ev) => {
      const file = ev.target.files[0];
      ev.target.value = "";
      if (file) $("add-json").value = await Util.lerArquivo(file);
    });
    $("add-validar").addEventListener("click", validarJson);
    $("add-instalar").addEventListener("click", async () => {
      const template = await validarJson();
      if (!template) return;
      try { await instalar({ template }); } catch (e) { erroAdicionar(e.message); }
    });
  }

  // Novo registro num módulo qualquer, sem sair da tela atual (usado pelo
  // "+ Lançar" do dashboard).
  function lancar(slug, depois) {
    const modulo = App.modulo(slug);
    if (!modulo) { Util.aviso("Módulo não encontrado", "erro"); return; }
    abrirFormulario(null, modulo, depois);
  }

  return { init, abrir, abrirAdicionar, abrirEstrutura, lancar };
})();
