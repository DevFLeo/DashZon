// Construtor de dashboards: canvas GridStack onde cada widget aponta para um
// módulo e uma consulta (medida, agrupamento, séries, filtro). Os dados vêm
// de /api/widgets/:id/data, calculados pelo motor C++.
const Dashboards = (() => {
  let grid = null;
  let atual = null;
  let carregando = false;
  let editando = null;
  let filtrosExtras = {};
  const charts = {};

  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  const TAMANHO = { kpi: { w: 3, h: 2 }, table: { w: 4, h: 3 }, bar: { w: 6, h: 4 }, line: { w: 6, h: 4 } };
  const MAX_GRUPOS = 15;

  const campoDe = (modulo, id) => modulo && id ? modulo.schema.campos.find((c) => c.id === id) : null;

  // -------------------------------------------------------------- canvas ----
  function init() {
    grid = GridStack.init({
      column: 12,
      cellHeight: 76,
      margin: 8,
      float: false,
      draggable: { handle: ".widget-header" },
      resizable: { handles: "se" }
    }, $("grid"));

    grid.on("change", (_ev, itens) => salvarLayout(itens));
    grid.on("resizestop", (_ev, el) => charts[el.gridstackNode.id]?.resize());

    $("btn-add-widget").addEventListener("click", () => abrirFormulario());
    $("btn-renomear-dashboard").addEventListener("click", renomear);
    $("btn-excluir-dashboard").addEventListener("click", excluir);
    $("form-widget").addEventListener("submit", salvarWidget);
    $("w-modulo").addEventListener("change", () => preencherOpcoes(null));
    $("w-tipo").addEventListener("change", atualizarVisibilidade);
    $("w-agregacao").addEventListener("change", atualizarVisibilidade);
    $("w-filtro-campo").addEventListener("change", () => preencherValoresFiltro(""));

    // Troca de tema claro/escuro: redesenha os gráficos com as novas cores.
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => atual && abrir(atual.id));
  }

  function destruirCharts() {
    Object.keys(charts).forEach((id) => { charts[id].destroy(); delete charts[id]; });
  }

  async function abrir(id) {
    atual = await Api.get(`/api/dashboards/${id}`);
    $("dash-titulo").textContent = atual.nome;
    destruirCharts();

    carregando = true;
    grid.removeAll();
    grid.batchUpdate();
    atual.widgets.forEach((w) => adicionarNoGrid(w, false));
    grid.batchUpdate(false);
    carregando = false;

    $("dash-vazio").hidden = atual.widgets.length > 0;
    atual.widgets.forEach(carregarDados);
  }

  function adicionarNoGrid(w, autoPosicao) {
    const item = document.createElement("div");
    item.className = "grid-stack-item";
    item.setAttribute("gs-id", String(w.id));
    item.setAttribute("gs-w", w.w);
    item.setAttribute("gs-h", w.h);
    if (autoPosicao) {
      item.setAttribute("gs-auto-position", "true");
    } else {
      item.setAttribute("gs-x", w.x);
      item.setAttribute("gs-y", w.y);
    }
    item.innerHTML = `
      <div class="grid-stack-item-content">
        <div class="widget-header">
          <span class="title">${esc(w.titulo)}</span>
          <span class="tools">
            <button class="icon-btn" data-editar title="Editar widget" aria-label="Editar widget">✎</button>
            <button class="icon-btn" data-remover title="Remover widget" aria-label="Remover widget">×</button>
          </span>
        </div>
        <div class="widget-body" id="wb-${w.id}"></div>
      </div>`;
    item.querySelector("[data-editar]").addEventListener("click", () => abrirFormulario(atual.widgets.find((x) => x.id === w.id)));
    item.querySelector("[data-remover]").addEventListener("click", () => remover(w.id));
    $("grid").appendChild(item);
    grid.makeWidget(item);
    return item;
  }

  async function salvarLayout(itens) {
    if (carregando || !itens) return;
    await Promise.all(itens.map((n) => Api.put(`/api/widgets/${n.id}/layout`, { x: n.x, y: n.y, w: n.w, h: n.h }).catch(() => {})));
  }

  // ---------------------------------------------------------- dados ----
  function valorDe(cfg, alvo) {
    if (!alvo) return 0;
    if (cfg.agregacao === "contagem") return alvo.count;
    if (cfg.agregacao === "media") return alvo.avg ?? (alvo.count ? alvo.sum / alvo.count : 0);
    return alvo.sum;
  }

  function formatador(cfg, modulo) {
    if (cfg.agregacao === "contagem") return (v) => Util.fmtNumero(v, 0);
    return campoDe(modulo, cfg.campo)?.tipo === "moeda" ? Util.fmtMoeda : (v) => Util.fmtNumero(v);
  }

  function descricao(cfg, modulo) {
    const medida = {
      contagem: "registros",
      soma: `soma de ${campoDe(modulo, cfg.campo)?.nome}`,
      media: `média de ${campoDe(modulo, cfg.campo)?.nome}`,
      saldo: "entradas − saídas"
    }[cfg.agregacao];
    const filtros = Object.entries(cfg.filtro || {}).map(([k, v]) => {
      const c = campoDe(modulo, k);
      return `${c ? c.nome : k}: ${c ? Util.rotuloChave(c, v) : v}`;
    });
    return [medida, ...filtros].join(" · ");
  }

  // Ordem das barras: meses em ordem, seleções na ordem das opções do schema,
  // o resto do maior para o menor.
  function ordenar(linhas, cfg, modulo) {
    const campo = campoDe(modulo, cfg.agrupar_por);
    if (cfg.formato_grupo === "mes" || !campo) return linhas;
    const opcoes = Util.opcoesDe(campo).map((o) => o.v);
    if (opcoes.length) {
      const pos = (k) => { const i = opcoes.indexOf(k); return i < 0 ? 999 : i; };
      return [...linhas].sort((a, b) => pos(a.key) - pos(b.key));
    }
    return [...linhas].sort((a, b) => valorDe(cfg, b) - valorDe(cfg, a));
  }

  async function carregarDados(w) {
    const corpo = $(`wb-${w.id}`);
    if (!corpo) return;
    try {
      const d = await Api.get(`/api/widgets/${w.id}/data`);
      const modulo = App.modulo(w.modulo_slug);
      if (w.tipo === "kpi" || w.tipo === "table") {
        charts[w.id]?.destroy();
        delete charts[w.id];
      }
      if (w.tipo === "kpi") renderKpi(corpo, d, modulo);
      else if (w.tipo === "table") renderTabela(corpo, d, modulo);
      else renderGrafico(w, corpo, d, modulo);
    } catch (e) {
      corpo.innerHTML = `<div class="widget-erro">${esc(e.message)}</div>`;
    }
  }

  function renderKpi(corpo, d, modulo) {
    const cfg = d.config;
    const valor = cfg.agregacao === "contagem" ? d.total_count : cfg.agregacao === "media" ? d.total_avg : d.total_sum;
    const moeda = campoDe(modulo, cfg.campo)?.tipo === "moeda";
    const sinal = cfg.agregacao === "saldo" ? (valor >= 0 ? "positivo" : "negativo") : "";
    corpo.innerHTML = `
      <div class="widget-kpi value ${sinal} ${moeda ? "sensivel" : ""}">${formatador(cfg, modulo)(valor)}</div>
      <div class="widget-sub">${esc(descricao(cfg, modulo))}</div>`;
  }

  function renderTabela(corpo, d, modulo) {
    const cfg = d.config;
    const fmt = formatador(cfg, modulo);
    const grupo = campoDe(modulo, cfg.agrupar_por);
    const linhas = ordenar(d.result, cfg, modulo).slice(0, 50);
    if (!linhas.length || !d.total_count) { corpo.innerHTML = '<div class="widget-sub">Sem dados</div>'; return; }

    const mostrarMedida = cfg.agregacao !== "contagem";
    const moeda = campoDe(modulo, cfg.campo)?.tipo === "moeda";
    corpo.classList.add("tabela");
    corpo.innerHTML = `<table class="data">
      <thead><tr><th>${esc(grupo ? grupo.nome : "Total")}</th><th class="num">Qtd.</th>${mostrarMedida ? `<th class="num">${esc(descricao({ ...cfg, filtro: {} }, modulo))}</th>` : ""}</tr></thead>
      <tbody>${linhas.map((r) => `<tr>
        <td>${esc(Util.rotuloChave(grupo, r.key, cfg.formato_grupo))}</td>
        <td class="num">${Util.fmtNumero(r.count, 0)}</td>
        ${mostrarMedida ? `<td class="num ${moeda ? "sensivel" : ""}">${fmt(valorDe(cfg, r))}</td>` : ""}
      </tr>`).join("")}</tbody></table>`;
  }

  function renderGrafico(w, corpo, d, modulo) {
    const cfg = d.config;
    const fmt = formatador(cfg, modulo);
    const grupo = campoDe(modulo, cfg.agrupar_por);
    const serieCampo = campoDe(modulo, cfg.serie_por);
    const todas = ordenar(d.result, cfg, modulo);
    const linhas = todas.slice(0, MAX_GRUPOS);

    if (!d.total_count) { corpo.innerHTML = '<div class="widget-sub">Sem dados</div>'; return; }

    const labels = linhas.map((r) => Util.rotuloChave(grupo, r.key, cfg.formato_grupo));
    const linha = w.tipo === "line";
    const estilo = (cor) => linha
      ? { borderColor: cor, backgroundColor: cor, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0.25, fill: false }
      : { backgroundColor: cor, borderRadius: 4, maxBarThickness: 36 };

    // Até 2 séries (ex.: entrada x saída) ficam lado a lado para comparar;
    // mais que isso é composição e vira barra empilhada.
    const empilhar = !linha && serieCampo && d.series_keys.length > 2;
    const superficie = Util.cssVar("--surface-1");

    let datasets;
    if (serieCampo) {
      const ordem = Util.opcoesDe(serieCampo).map((o) => o.v);
      const chaves = [...d.series_keys].sort((a, b) => (ordem.indexOf(a) + 1 || 999) - (ordem.indexOf(b) + 1 || 999));
      datasets = chaves.map((k) => ({
        label: Util.rotuloChave(serieCampo, k),
        data: linhas.map((r) => valorDe(cfg, r.series?.[k])),
        ...estilo(Util.corSerie(serieCampo, k)),
        ...(empilhar ? { borderRadius: 0, borderColor: superficie, borderWidth: { top: 2 } } : {})
      }));
    } else {
      datasets = [{ label: w.titulo, data: linhas.map((r) => valorDe(cfg, r)), ...estilo(Util.cssVar("--series-1")) }];
    }

    const moeda = campoDe(modulo, cfg.campo)?.tipo === "moeda";
    corpo.classList.toggle("sensivel", moeda);
    corpo.innerHTML = `<canvas aria-label="${esc(w.titulo)}"></canvas>${todas.length > MAX_GRUPOS ? `<div class="widget-sub">Mostrando ${MAX_GRUPOS} de ${todas.length} grupos</div>` : ""}`;

    const muted = Util.cssVar("--text-muted");
    charts[w.id]?.destroy();
    charts[w.id] = new Chart(corpo.querySelector("canvas"), {
      type: linha ? "line" : "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: datasets.length > 1, position: "bottom", labels: { boxWidth: 10, boxHeight: 10, color: Util.cssVar("--text-secondary") } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } }
        },
        scales: {
          x: { stacked: empilhar, grid: { display: false }, ticks: { color: muted } },
          y: {
            stacked: empilhar,
            beginAtZero: true,
            grid: { color: Util.cssVar("--gridline") },
            border: { display: false },
            ticks: {
              color: muted,
              precision: cfg.agregacao === "contagem" ? 0 : undefined,
              callback: (v) => Util.fmtCompacto(v, moeda)
            }
          }
        }
      }
    });
  }

  // ------------------------------------------------------- formulário ----
  function opcoes(id, lista, valor) {
    const el = $(id);
    el.innerHTML = lista.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
    if (valor !== undefined && lista.some(([v]) => v === valor)) el.value = valor;
  }

  function preencherOpcoes(cfg) {
    const modulo = App.modulo($("w-modulo").value);
    const campos = modulo.schema.campos;
    const numericos = campos.filter((c) => Util.NUMERICOS.includes(c.tipo));

    const agregacoes = [["contagem", "Contagem de registros"]];
    if (numericos.length) agregacoes.push(["soma", "Soma"], ["media", "Média"]);
    if (numericos.length && campos.some((c) => c.tipo === "movimento")) agregacoes.push(["saldo", "Saldo (entradas − saídas)"]);

    opcoes("w-agregacao", agregacoes, cfg?.agregacao || "contagem");
    opcoes("w-campo", numericos.map((c) => [c.id, c.nome]), cfg?.campo || undefined);
    opcoes("w-agrupar", [["", "— sem agrupamento —"], ...campos.filter((c) => Util.DIMENSOES.includes(c.tipo))
      .map((c) => [c.id, c.tipo === "data" ? `${c.nome} (por mês)` : c.nome])], cfg?.agrupar_por || "");
    opcoes("w-serie", [["", "— uma série só —"], ...campos.filter((c) => Util.SERIES.includes(c.tipo)).map((c) => [c.id, c.nome])], cfg?.serie_por || "");

    // A tela edita um filtro; filtros adicionais (vindos de templates) são mantidos.
    const entradas = Object.entries(cfg?.filtro || {});
    const [campoFiltro, valorFiltro] = entradas[0] || ["", ""];
    filtrosExtras = Object.fromEntries(entradas.slice(1));
    opcoes("w-filtro-campo", [["", "— sem filtro —"], ...campos.filter((c) => Util.SERIES.includes(c.tipo)).map((c) => [c.id, c.nome])], campoFiltro);
    preencherValoresFiltro(valorFiltro);

    const extras = Object.entries(filtrosExtras).map(([k, v]) => {
      const c = campoDe(modulo, k);
      return `${c ? c.nome : k} = ${c ? Util.rotuloChave(c, v) : v}`;
    });
    $("w-filtro-extra").hidden = !extras.length;
    $("w-filtro-extra").textContent = extras.length ? `Também filtra por ${extras.join(", ")} (mantido).` : "";

    atualizarVisibilidade();
  }

  function preencherValoresFiltro(valor) {
    const modulo = App.modulo($("w-modulo").value);
    const campo = campoDe(modulo, $("w-filtro-campo").value);
    $("w-filtro-valor").disabled = !campo;
    opcoes("w-filtro-valor", campo ? Util.opcoesDe(campo).map((o) => [o.v, o.l]) : [["", "—"]], valor);
  }

  function atualizarVisibilidade() {
    const tipo = $("w-tipo").value;
    $("w-campo-wrap").hidden = $("w-agregacao").value === "contagem";
    $("w-agrupar-wrap").hidden = tipo === "kpi";
    $("w-serie-wrap").hidden = tipo === "kpi" || tipo === "table";
  }

  function erroWidget(msg) {
    $("widget-erro").textContent = msg;
    $("widget-erro").hidden = !msg;
  }

  function abrirFormulario(w = null) {
    const modulos = App.modulos();
    if (!modulos.length) { Util.aviso("Adicione um módulo antes de criar widgets.", "erro"); return; }

    editando = w;
    $("widget-modal-titulo").textContent = w ? "Editar widget" : "Adicionar widget";
    $("w-titulo").value = w ? w.titulo : "";
    $("w-tipo").value = w ? w.tipo : "bar";
    opcoes("w-modulo", modulos.map((m) => [m.slug, m.nome]), w ? w.modulo_slug : modulos[0].slug);
    preencherOpcoes(w ? w.config : null);
    erroWidget("");
    Util.abrirModal("modal-widget");
    $("w-titulo").focus();
  }

  async function salvarWidget(ev) {
    ev.preventDefault();
    const tipo = $("w-tipo").value;
    const agregacao = $("w-agregacao").value;
    const filtro = { ...filtrosExtras };
    if ($("w-filtro-campo").value) filtro[$("w-filtro-campo").value] = $("w-filtro-valor").value;

    const corpo = {
      titulo: $("w-titulo").value.trim(),
      tipo,
      modulo: $("w-modulo").value,
      config: {
        agregacao,
        campo: agregacao === "contagem" ? null : $("w-campo").value,
        agrupar_por: tipo === "kpi" ? null : $("w-agrupar").value || null,
        serie_por: tipo === "bar" || tipo === "line" ? $("w-serie").value || null : null,
        filtro
      }
    };

    try {
      if (editando) {
        const salvo = await Api.put(`/api/widgets/${editando.id}`, corpo);
        Object.assign(editando, salvo);
        const item = grid.getGridItems().find((el) => el.gridstackNode.id === String(salvo.id));
        item.querySelector(".widget-header .title").textContent = salvo.titulo;
        $(`wb-${salvo.id}`).className = "widget-body";
        carregarDados(editando);
      } else {
        const tam = TAMANHO[tipo];
        const salvo = await Api.post(`/api/dashboards/${atual.id}/widgets`, { ...corpo, x: 0, y: 0, ...tam });
        atual.widgets.push(salvo);
        const item = adicionarNoGrid(salvo, true);
        const n = item.gridstackNode;
        await Api.put(`/api/widgets/${salvo.id}/layout`, { x: n.x, y: n.y, w: n.w, h: n.h });
        $("dash-vazio").hidden = true;
        carregarDados(salvo);
      }
      Util.fecharModal("modal-widget");
    } catch (e) {
      erroWidget(e.message);
    }
  }

  async function remover(id) {
    if (!confirm("Remover este widget do dashboard?")) return;
    await Api.del(`/api/widgets/${id}`);
    charts[id]?.destroy();
    delete charts[id];
    const item = grid.getGridItems().find((el) => el.gridstackNode.id === String(id));
    if (item) grid.removeWidget(item);
    atual.widgets = atual.widgets.filter((w) => w.id !== id);
    $("dash-vazio").hidden = atual.widgets.length > 0;
  }

  async function renomear() {
    const nome = prompt("Novo nome do dashboard:", atual.nome);
    if (!nome || !nome.trim()) return;
    await Api.put(`/api/dashboards/${atual.id}`, { nome: nome.trim() });
    atual.nome = nome.trim();
    $("dash-titulo").textContent = atual.nome;
    await App.recarregarNav();
  }

  async function excluir() {
    if (!confirm(`Excluir o dashboard "${atual.nome}"? Os módulos e registros não são afetados.`)) return;
    await Api.del(`/api/dashboards/${atual.id}`);
    await App.recarregarNav();
    App.irPadrao();
  }

  return { init, abrir, novoWidget: () => abrirFormulario() };
})();
