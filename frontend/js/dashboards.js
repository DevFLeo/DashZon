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
  const TAMANHO = { kpi: { w: 3, h: 2 }, table: { w: 4, h: 3 }, bar: { w: 6, h: 4 }, line: { w: 6, h: 4 }, pie: { w: 4, h: 4 }, calendario: { w: 12, h: 3 } };
  // Calendários são HTML (não Chart.js): redesenhados quando o card muda de largura.
  const calendarios = {};
  const MAX_GRUPOS = 15;

  const campoDe = (modulo, id) => modulo && id ? modulo.schema.campos.find((c) => c.id === id) : null;

  // -------------------------------------------------------------- canvas ----
  // REGRA (ver CLAUDE.md): grade de 12 colunas, arrastar pelo título e
  // salvarLayout gravando só posição/tamanho. Não alterar sem pedido explícito.
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
    grid.on("resizestop", (_ev, el) => { charts[el.gridstackNode.id]?.resize(); calendarios[el.gridstackNode.id]?.(); });
    window.addEventListener("resize", Util.debounce(() => Object.values(calendarios).forEach((f) => f()), 150));

    $("btn-add-widget").addEventListener("click", () => abrirFormulario());
    $("btn-renomear-dashboard").addEventListener("click", renomear);
    $("btn-fixar").addEventListener("click", alternarFixo);
    $("btn-compartilhar").addEventListener("click", abrirCompartilhar);
    $("btn-excluir-dashboard").addEventListener("click", excluir);
    $("form-excluir-dashboard").addEventListener("submit", confirmarExcluir);
    $("form-widget").addEventListener("submit", salvarWidget);
    $("w-modulo").addEventListener("change", trocarModulo);
    $("w-agregacao").addEventListener("change", atualizarVisibilidade);
    $("w-filtro-campo").addEventListener("change", () => preencherValoresFiltro(""));
    document.querySelectorAll("#w-tipos .tipo-card").forEach((b) => b.addEventListener("click", () => { setTipo(b.dataset.tipo); aoMudar(); }));
    ["w-agregacao", "w-campo", "w-agrupar", "w-serie", "w-filtro-campo", "w-filtro-valor", "w-data", "w-periodo"]
      .forEach((id) => $(id).addEventListener("change", () => aoMudar()));
    $("w-meta").addEventListener("input", () => { atualizarVisibilidade(); aoMudar(); });
    $("w-titulo").addEventListener("input", () => {
      tituloManual = $("w-titulo").value.trim() !== "";
      previaAtrasada();
    });
    $("btn-lancar").addEventListener("click", escolherLancar);
    $("w-paletas").addEventListener("click", (e) => { const b = e.target.closest(".paleta"); if (b) escolherPaleta(b.dataset.paleta); });
    $("w-surpresa").addEventListener("click", surpreender);
    $("w-cores-lista").addEventListener("input", (e) => {
      const el = e.target;
      if (el.dataset.unica !== undefined) aparencia.cor = el.value;
      else if (el.dataset.chave !== undefined) aparencia.cores = { ...aparencia.cores, [el.dataset.chave]: el.value };
      else return;
      $("w-paletas").querySelectorAll(".paleta").forEach((b) => b.setAttribute("aria-checked", "false"));
      previaAtrasada();
    });
    initNovo();

    // Troca de tema claro/escuro: redesenha os gráficos com as novas cores.
    // (O Tema avisa tanto a troca pelo botão sol/lua quanto a do sistema.)
    document.addEventListener("dashzon:tema", () => {
      if (atual && document.getElementById("view-dashboard").classList.contains("active")) abrir(atual.id);
    });
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
    aplicarPermissoes();
    atual.widgets.forEach(carregarDados);
  }

  // --------------------------------------------- dono, equipe e layout fixo ----
  // Só o dono (ou um admin, nos da equipe) altera; os demais só veem e lançam.
  // "Fixo" trava arrastar e redimensionar (GridStack.setStatic): o layout
  // salvo e a grade de 12 colunas continuam os mesmos (REGRA em CLAUDE.md).
  function aplicarPermissoes() {
    const editavel = atual.editavel;
    const travado = atual.fixo || !editavel;
    grid.setStatic(travado);
    $("grid").classList.toggle("layout-fixo", travado);
    ["btn-fixar", "btn-compartilhar", "btn-renomear-dashboard", "btn-excluir-dashboard", "btn-add-widget"]
      .forEach((id) => { $(id).hidden = !editavel; });
    document.querySelectorAll('#dash-vazio [data-acao="add-widget"]').forEach((b) => { b.hidden = !editavel; });

    // Mesmos rótulos do menu do botão direito na barra lateral (App.menuDashboard).
    $("btn-fixar").innerHTML = atual.fixo ? `${Util.icone("cadeado")} Fixado` : `${Util.icone("cadeado-aberto")} Fixar layout`;
    $("btn-fixar").setAttribute("aria-pressed", String(atual.fixo));
    $("btn-fixar").title = atual.fixo ? "Fixado. Clique para arrastar e redimensionar os cards de novo" : "Trava a posição e o tamanho dos cards";

    const meu = atual.dono_id === App.usuario()?.id;
    const quem = atual.visibilidade === "equipes" ? esc(Compartilhar.descrever("equipes", atual.equipes)) : "Da equipe";
    $("dash-selo").innerHTML = atual.visibilidade === "privado"
      ? `${Util.icone("cadeado")} Só você vê este dashboard`
      : `${Util.icone("equipe")} ${quem}${meu ? "" : ` · criado por ${esc(atual.dono_nome || "outra pessoa")}`}${editavel ? "" : " · só leitura"}`;
    $("dash-dica").textContent = !editavel
      ? "Você pode ver os cards e lançar registros; só quem criou (ou um administrador) altera este dashboard."
      : atual.fixo
        ? "Layout fixado: os cards não se movem nem mudam de tamanho. Clique em \"Fixado\" (ou use o botão direito no dashboard, no menu) para reorganizar."
        : "Arraste os cards pelo título e redimensione pelo canto. Passe o mouse num card para lançar, editar ou remover.";
  }

  async function alternarFixo() {
    try {
      await Api.put(`/api/dashboards/${atual.id}`, { fixo: !atual.fixo });
      App.marcarFixo(atual.id, !atual.fixo); // atualiza o menu e chama marcarFixo abaixo
      Util.aviso(atual.fixo ? "Layout fixado" : "Movimentação liberada");
    } catch (e) { Util.aviso(e.message, "erro"); }
  }

  // Fixado/liberado por fora (botão direito no menu): só reflete no aberto.
  function marcarFixo(id, fixo) {
    if (!atual || atual.id !== id) return;
    atual.fixo = fixo;
    aplicarPermissoes();
  }

  // Quem vê: só eu, equipes escolhidas ou todos (js/compartilhar.js).
  async function abrirCompartilhar() {
    await Compartilhar.abrir({
      tipo: "dashboard",
      titulo: "Quem vê este dashboard",
      atual,
      onSalvar: async (corpo) => {
        await Api.put(`/api/dashboards/${atual.id}`, corpo);
        await App.recarregarNav();
        // Transferido como privado para outra pessoa: ele some daqui.
        if (App.dashboards().some((d) => d.id === atual.id)) await abrir(atual.id);
        else App.irPadrao();
      }
    });
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
            <button class="icon-btn" data-lancar title="Lançar em ${esc(App.modulo(w.modulo_slug)?.nome || "")}" aria-label="Lançar registro">+</button>
            <button class="icon-btn" data-editar title="Editar card" aria-label="Editar card">${Util.icone("lapis")}</button>
            <button class="icon-btn" data-remover title="Remover card" aria-label="Remover card">×</button>
          </span>
        </div>
        <div class="widget-body" id="wb-${w.id}"></div>
      </div>`;
    // Lançar só onde a pessoa pode (pode_lancar; o servidor também confere).
    if (!App.modulo(w.modulo_slug)?.pode_lancar) item.querySelector("[data-lancar]").remove();
    item.querySelector("[data-lancar]")?.addEventListener("click", () => Modulos.lancar(w.modulo_slug, aposLancar));
    if (!atual.editavel) item.querySelectorAll("[data-editar], [data-remover]").forEach((b) => b.remove());
    item.querySelector("[data-editar]")?.addEventListener("click", () => abrirFormulario(atual.widgets.find((x) => x.id === w.id)));
    item.querySelector("[data-remover]")?.addEventListener("click", () => remover(w.id));
    $("grid").appendChild(item);
    grid.makeWidget(item);
    return item;
  }

  async function salvarLayout(itens) {
    if (carregando || !itens) return;
    await Promise.all(itens.map((n) => Api.put(`/api/widgets/${n.id}/layout`, { x: n.x, y: n.y, w: n.w, h: n.h }).catch(() => {})));
  }

  // ---------------------------------------------------------- dados ----
  // REGRA (ver CLAUDE.md): a lógica de funcionamento e a fórmula de
  // organização dos gráficos (valorDe, formatador, descricao, ordenar,
  // renderKpi, renderTabela, renderGrafico) e do layout do canvas não mudam
  // sem pedido explícito. O criador de card e o "Lançar" só reaproveitam estas
  // funções; não as reimplemente em outro lugar.
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
      desenhar(w, corpo, d, App.modulo(w.modulo_slug));
    } catch (e) {
      corpo.innerHTML = `<div class="widget-erro">${esc(e.message)}</div>`;
    }
  }

  // Um lugar só decide como cada tipo é desenhado (dashboard e prévia).
  function desenhar(w, corpo, d, modulo) {
    if (!["bar", "line", "pie"].includes(w.tipo)) {
      charts[w.id]?.destroy();
      delete charts[w.id];
    }
    delete calendarios[w.id];
    corpo.classList.remove("tabela", "com-meta", "com-calendario");
    if (w.tipo === "kpi") (d.config.meta ? renderMeta : renderKpi)(corpo, d, modulo);
    else if (w.tipo === "table") renderTabela(corpo, d, modulo);
    else if (w.tipo === "pie") renderPizza(w, corpo, d, modulo);
    else if (w.tipo === "calendario") {
      calendarios[w.id] = () => renderCalendario(corpo, d, modulo);
      calendarios[w.id]();
    } else renderGrafico(w, corpo, d, modulo);
  }

  // ---- Cards de acompanhamento (a pedido: estudos) ----
  // Meta: quanto já foi, quanto falta e a barra de progresso. Por mês ou
  // semana, o servidor agrupa por dia e aqui somam-se só os dias do período.
  function periodoMeta(periodo) {
    const hoje = Util.hojeISO();
    if (periodo === "mes") return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje, rotulo: "deste mês" };
    if (periodo === "semana") {
      const dia = (new Date().getDay() + 6) % 7; // segunda = 0
      return { inicio: Util.hojeISO(-dia), fim: hoje, rotulo: "desta semana" };
    }
    return { inicio: null, fim: null, rotulo: "" };
  }

  function renderMeta(corpo, d, modulo) {
    const cfg = d.config;
    const p = periodoMeta(cfg.periodo);
    let valor;
    if (!p.inicio) valor = cfg.agregacao === "contagem" ? d.total_count : cfg.agregacao === "media" ? d.total_avg : d.total_sum;
    else {
      const dias = d.result.filter((r) => r.key >= p.inicio && r.key <= p.fim);
      const soma = (k) => dias.reduce((t, r) => t + (Number(r[k]) || 0), 0);
      valor = cfg.agregacao === "contagem" ? soma("count") : cfg.agregacao === "media" ? (soma("count") ? soma("sum") / soma("count") : 0) : soma("sum");
    }
    const fmt = formatador(cfg, modulo);
    const moeda = campoDe(modulo, cfg.campo)?.tipo === "moeda";
    const pct = cfg.meta > 0 ? Math.max(0, valor / cfg.meta * 100) : 0;
    const falta = cfg.meta - valor;
    const cor = Util.corUnica(cfg);
    corpo.classList.add("com-meta");
    corpo.innerHTML = `
      <div class="meta-topo"><span class="widget-kpi value ${moeda ? "sensivel" : ""}" style="color:${cor}">${fmt(valor)}</span>
        <span class="meta-de ${moeda ? "sensivel" : ""}">de ${fmt(cfg.meta)}</span></div>
      <div class="meta-barra" role="progressbar" aria-label="Progresso da meta" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(pct, 100))}">
        <span style="width:${Math.min(pct, 100)}%;background:${cor}"></span></div>
      <div class="widget-sub">${falta > 0
        ? `Faltam <strong class="${moeda ? "sensivel" : ""}">${fmt(falta)}</strong> para a meta ${p.rotulo}`
        : `Meta ${p.rotulo} batida${falta < 0 ? `, ${fmt(-falta)} além` : ""}!`} · ${Util.fmtNumero(pct, 0)}%</div>`;
  }

  // Pizza (rosca): uma fatia por categoria; no centro, quantas categorias têm valor.
  function renderPizza(w, corpo, d, modulo) {
    const cfg = d.config;
    const fmt = formatador(cfg, modulo);
    const grupo = campoDe(modulo, cfg.agrupar_por);
    const linhas = ordenar(d.result, cfg, modulo).filter((r) => valorDe(cfg, r) > 0).slice(0, MAX_GRUPOS);
    if (!d.total_count || !linhas.length) { corpo.innerHTML = '<div class="widget-sub">Sem dados</div>'; return; }

    // Fatias vizinhas precisam de cores diferentes: sem paleta nem cores
    // escolhidas, uma cor do tema por fatia, na ordem (a identidade pela
    // posição da opção repetiria ou daria cinza da 9ª opção em diante).
    const escolhidas = cfg.paleta || Object.keys(cfg.cores || {}).length;
    const cores = linhas.map((r, i) => (escolhidas ? Util.corDe(cfg, grupo, r.key, i) : Util.cssVar(`--series-${(i % 8) + 1}`)));
    const total = linhas.reduce((t, r) => t + valorDe(cfg, r), 0);
    const moeda = campoDe(modulo, cfg.campo)?.tipo === "moeda";
    corpo.classList.toggle("sensivel", moeda);
    corpo.innerHTML = `<div class="pizza"><canvas aria-label="${esc(w.titulo)}: ${linhas.length} ${esc(grupo ? grupo.nome : "grupos")}"></canvas></div>`;
    // Número de categorias no centro da rosca (onde quer que a legenda fique).
    const centro = {
      id: "centro",
      afterDraw(chart) {
        const { left, right, top, bottom } = chart.chartArea;
        const x = (left + right) / 2;
        const y = (top + bottom) / 2;
        const fonte = Chart.defaults.font.family;
        const ctx = chart.ctx;
        ctx.save();
        ctx.textAlign = "center";
        ctx.fillStyle = Util.cssVar("--text-primary");
        ctx.font = `700 ${Math.round(Chart.defaults.font.size * 1.9)}px ${fonte}`;
        ctx.textBaseline = "bottom";
        ctx.fillText(String(linhas.length), x, y + 4);
        ctx.fillStyle = Util.cssVar("--text-muted");
        ctx.font = `${Math.round(Chart.defaults.font.size * 0.95)}px ${fonte}`;
        ctx.textBaseline = "top";
        ctx.fillText(grupo ? grupo.nome : "grupos", x, y + 6);
        ctx.restore();
      }
    };
    charts[w.id]?.destroy();
    charts[w.id] = new Chart(corpo.querySelector("canvas"), {
      type: "doughnut",
      plugins: [centro],
      data: {
        labels: linhas.map((r) => Util.rotuloChave(grupo, r.key, cfg.formato_grupo)),
        datasets: [{ data: linhas.map((r) => valorDe(cfg, r)), backgroundColor: cores, borderColor: Util.cssVar("--surface-1"), borderWidth: 2, hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "62%", animation: { duration: 350 },
        plugins: {
          legend: { position: corpo.clientWidth > 360 ? "right" : "bottom", labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8, color: Util.cssVar("--text-secondary") } },
          tooltip: { cornerRadius: 8, padding: 10, callbacks: { label: (ctx) => `${ctx.label}: ${fmt(ctx.parsed)} (${Util.fmtNumero(ctx.parsed / total * 100, 0)}%)` } }
        }
      }
    });
  }

  // Calendário: um quadradinho por dia (como o de contribuições do GitHub),
  // intensidade pelo valor do dia; semanas em colunas, as mais recentes à
  // direita, só as que cabem na largura. Embaixo: dias ativos e sequências.
  function renderCalendario(corpo, d, modulo) {
    const cfg = d.config;
    const fmt = formatador(cfg, modulo);
    const valores = new Map(d.result.map((r) => [r.key, valorDe(cfg, r)]));
    const CEL = 14;
    const semanas = Math.max(8, Math.min(53, Math.floor(((corpo.clientWidth || 600) - 34) / CEL)));
    const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const hoje = new Date();
    hoje.setHours(12, 0, 0, 0);
    const dia = new Date(hoje);
    dia.setDate(hoje.getDate() - hoje.getDay() - (semanas - 1) * 7);

    const dias = [];
    for (; dia <= hoje; dia.setDate(dia.getDate() + 1)) dias.push({ data: iso(dia), sem: dia.getDay(), v: valores.get(iso(dia)) || 0 });
    const max = Math.max(0, ...dias.map((x) => x.v));
    const nivel = (v) => (v <= 0 || !max ? 0 : Math.min(4, Math.ceil(v / max * 4)));

    const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    let mesAnterior = -1;
    const celulas = [];
    const meses = [];
    dias.forEach((x, i) => {
      const col = Math.floor(i / 7) + 2;
      if (x.sem === 0) {
        const mes = Number(x.data.slice(5, 7)) - 1;
        if (mes !== mesAnterior && col > 2) meses.push(`<span class="cal-mes" style="grid-column:${col}">${MESES[mes]}</span>`);
        mesAnterior = mes;
      }
      const texto = `${x.v > 0 ? fmt(x.v) : "Nada"} em ${Util.fmtData(x.data)}`;
      celulas.push(`<span class="cal-dia" data-nivel="${nivel(x.v)}" style="grid-column:${col};grid-row:${x.sem + 2}" title="${texto}"></span>`);
    });

    // Sequências: dias seguidos com valor (hoje ainda zerado conta até ontem).
    let atual = 0;
    for (let i = dias.length - 1 - (dias.at(-1)?.v > 0 ? 0 : 1); i >= 0 && dias[i].v > 0; i--) atual++;
    let maior = 0;
    let corrente = 0;
    dias.forEach((x) => { corrente = x.v > 0 ? corrente + 1 : 0; maior = Math.max(maior, corrente); });
    const ativos = dias.filter((x) => x.v > 0).length;
    const total = dias.reduce((t, x) => t + x.v, 0);

    const moeda = campoDe(modulo, cfg.campo)?.tipo === "moeda";
    corpo.classList.add("com-calendario");
    corpo.style.setProperty("--cal-cor", Util.corUnica(cfg)); // grade e legenda
    corpo.innerHTML = `<div class="cal-grade" style="grid-template-columns:30px repeat(${semanas}, 11px)">
        <span class="cal-sem" style="grid-row:3">seg</span><span class="cal-sem" style="grid-row:5">qua</span><span class="cal-sem" style="grid-row:7">sex</span>
        ${meses.join("")}${celulas.join("")}</div>
      <div class="cal-legenda"><span class="widget-sub"><strong class="${moeda ? "sensivel" : ""}">${fmt(total)}</strong> em ${ativos} dia${ativos === 1 ? "" : "s"}
        · sequência atual ${atual} · maior ${maior}</span>
        <span class="cal-escala" aria-hidden="true">Menos <span class="cal-dia" data-nivel="0"></span><span class="cal-dia" data-nivel="1"></span><span class="cal-dia" data-nivel="2"></span><span class="cal-dia" data-nivel="3"></span><span class="cal-dia" data-nivel="4"></span> Mais</span></div>`;
  }

  function renderKpi(corpo, d, modulo) {
    const cfg = d.config;
    const valor = cfg.agregacao === "contagem" ? d.total_count : cfg.agregacao === "media" ? d.total_avg : d.total_sum;
    const moeda = campoDe(modulo, cfg.campo)?.tipo === "moeda";
    const sinal = cfg.agregacao === "saldo" ? (valor >= 0 ? "positivo" : "negativo") : "";
    // Cor escolhida no editor (o saldo mantém verde/vermelho). Validada no servidor (#rrggbb).
    const cor = cfg.cor && !sinal ? ` style="color:${cfg.cor}"` : "";
    corpo.innerHTML = `
      <div class="widget-kpi value ${sinal} ${moeda ? "sensivel" : ""}"${cor}>${formatador(cfg, modulo)(valor)}</div>
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
    // Curva "monotone": suave, mas nunca passa acima ou abaixo dos pontos (a
    // curva antiga, com tensão, fazia barrigas e chegava a descer abaixo de zero
    // entre dois meses). Só o traço mudou, a pedido; dados e ordem são os mesmos.
    const estilo = (cor) => linha
      ? { borderColor: cor, backgroundColor: cor, borderWidth: 2.5, borderCapStyle: "round", borderJoinStyle: "round",
          cubicInterpolationMode: "monotone", pointRadius: 3, pointHoverRadius: 6, pointHitRadius: 10, fill: false }
      : { backgroundColor: cor, borderRadius: 6, maxBarThickness: 36 };

    // Até 2 séries (ex.: entrada x saída) ficam lado a lado para comparar;
    // mais que isso é composição e vira barra empilhada.
    const empilhar = !linha && serieCampo && d.series_keys.length > 2;
    const superficie = Util.cssVar("--surface-1");

    let datasets;
    if (serieCampo) {
      const ordem = Util.opcoesDe(serieCampo).map((o) => o.v);
      const chaves = [...d.series_keys].sort((a, b) => (ordem.indexOf(a) + 1 || 999) - (ordem.indexOf(b) + 1 || 999));
      // Cores: escolhidas no editor > paleta > identidade da opção (Util.corDe).
      datasets = chaves.map((k, i) => ({
        label: Util.rotuloChave(serieCampo, k),
        data: linhas.map((r) => valorDe(cfg, r.series?.[k])),
        ...estilo(Util.corDe(cfg, serieCampo, k, i)),
        ...(empilhar ? { borderRadius: 0, borderColor: superficie, borderWidth: { top: 2 } } : {})
      }));
    } else {
      // Barras por categoria ganham uma cor cada só quando o card tem paleta ou
      // cores escolhidas; sem isso, uma cor só, como sempre.
      const porCategoria = !linha && grupo && grupo.tipo !== "data" && (cfg.paleta || Object.keys(cfg.cores || {}).length);
      const cor = porCategoria ? linhas.map((r, i) => Util.corDe(cfg, grupo, r.key, i)) : Util.corUnica(cfg);
      datasets = [{ label: w.titulo, data: linhas.map((r) => valorDe(cfg, r)), ...estilo(cor) }];
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
          legend: { display: datasets.length > 1, position: "bottom",
                    labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8, color: Util.cssVar("--text-secondary") } },
          tooltip: { cornerRadius: 8, padding: 10, boxPadding: 4, usePointStyle: true,
                     callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } }
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

    const agregacoes = [["contagem", "Quantidade de registros"]];
    if (numericos.length) agregacoes.push(["soma", "Somar um valor"], ["media", "Média de um valor"]);
    if (numericos.length && campos.some((c) => c.tipo === "movimento")) agregacoes.push(["saldo", "Saldo (entradas − saídas)"]);

    opcoes("w-agregacao", agregacoes, cfg?.agregacao || "contagem");
    opcoes("w-campo", numericos.map((c) => [c.id, c.nome]), cfg?.campo || undefined);
    opcoes("w-agrupar", [["", "— tudo junto —"], ...campos.filter((c) => Util.DIMENSOES.includes(c.tipo))
      .map((c) => [c.id, c.tipo === "data" ? `${c.nome} (mês a mês)` : c.nome])], cfg?.agrupar_por || "");
    opcoes("w-serie", [["", "— uma cor só —"], ...campos.filter((c) => Util.SERIES.includes(c.tipo)).map((c) => [c.id, c.nome])], cfg?.serie_por || "");
    // Calendário e meta por período: qual campo de data.
    const datas = campos.filter((c) => c.tipo === "data").map((c) => [c.id, c.nome]);
    opcoes("w-data", datas.length ? datas : [["", "— o módulo não tem campo de data —"]], cfg?.campo_data || (cfg?.formato_grupo ? undefined : cfg?.agrupar_por) || undefined);
    $("w-meta").value = cfg?.meta ?? "";
    $("w-periodo").value = cfg?.periodo || "mes";

    // A tela edita um filtro; filtros adicionais (vindos de templates) são mantidos.
    const entradas = Object.entries(cfg?.filtro || {});
    const [campoFiltro, valorFiltro] = entradas[0] || ["", ""];
    filtrosExtras = Object.fromEntries(entradas.slice(1));
    opcoes("w-filtro-campo", [["", "— sempre (sem filtro) —"], ...campos.filter((c) => Util.SERIES.includes(c.tipo)).map((c) => [c.id, c.nome])], campoFiltro);
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
    $("w-agrupar-wrap").hidden = tipo === "kpi" || tipo === "calendario";
    $("w-serie-wrap").hidden = !["bar", "line"].includes(tipo);
    $("w-meta-wrap").hidden = tipo !== "kpi";
    $("w-data-wrap").hidden = !(tipo === "calendario" || (tipo === "kpi" && $("w-meta").value.trim() && $("w-periodo").value !== "tudo"));
    document.querySelectorAll("#w-tipos .tipo-card").forEach((b) => {
      const ativo = b.dataset.tipo === tipo;
      b.classList.toggle("selected", ativo);
      b.setAttribute("aria-checked", String(ativo));
    });
  }

  function erroWidget(msg) {
    $("widget-erro").textContent = msg;
    $("widget-erro").hidden = !msg;
  }

  // ------------------------------------------------ criador de card ----
  // Tudo abaixo só ajuda a PREENCHER o formulário (atalhos, nome sugerido,
  // frase explicativa, prévia). O card salvo sai de montarCorpo(), com o
  // mesmo config de sempre, e é desenhado pelas funções render* acima.
  let tituloManual = false;
  let previaSeq = 0;

  function setTipo(tipo) {
    $("w-tipo").value = tipo;
    atualizarVisibilidade();
  }

  // ------------------------------------------------------------ cores ----
  // Aparência do card (a pedido): paleta, cor por categoria e cor única. Vai
  // no config (paleta/cores/cor), não muda a consulta, e o desenho lê com
  // Util.corDe/corUnica.
  let aparencia = { paleta: null, cores: {}, cor: null };
  let ultimaPrevia = null;
  let assinaturaCores = "";

  // O que ganha cor: as séries, as categorias (barras, pizza) ou uma cor só.
  function alvoCores() {
    const modulo = App.modulo($("w-modulo").value);
    const tipo = $("w-tipo").value;
    const serie = tipo === "bar" || tipo === "line" ? campoDe(modulo, $("w-serie").value) : null;
    const grupo = ["bar", "pie"].includes(tipo) ? campoDe(modulo, $("w-agrupar").value) : null;
    const campo = serie || (grupo && grupo.tipo !== "data" ? grupo : null);
    if (!campo) return { campo: null, chaves: [] };
    let chaves = campo.tipo === "movimento" ? ["entrada", "saida"] : campo.tipo === "booleano" ? ["true", "false"] : (campo.opcoes || []);
    if (!chaves.length && ultimaPrevia) chaves = serie ? ultimaPrevia.series_keys || [] : (ultimaPrevia.result || []).map((x) => x.key);
    return { campo, chaves: chaves.slice(0, 24) };
  }

  function renderPaletas() {
    const tema = [1, 2, 3, 4, 5].map((i) => Util.cssVar(`--series-${i}`));
    $("w-paletas").innerHTML = Object.entries(Util.PALETAS).map(([id, p]) => {
      const amostra = (Util.coresDaPaleta(id) || tema).slice(0, 5).map((c) => `<i style="background:${c}"></i>`).join("");
      return `<button type="button" class="paleta" role="radio" data-paleta="${id}" aria-checked="false"><span class="paleta-amostra" aria-hidden="true">${amostra}</span>${esc(p.nome)}</button>`;
    }).join("");
  }

  function renderCores(forcar = false) {
    const tipo = $("w-tipo").value;
    $("w-cores-passo").hidden = tipo === "table";
    const atualPaleta = aparencia.paleta || (Object.keys(aparencia.cores).length || aparencia.cor ? "" : "padrao");
    $("w-paletas").querySelectorAll(".paleta").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.paleta === atualPaleta)));

    const { campo, chaves } = alvoCores();
    const assinatura = JSON.stringify([tipo, campo?.id, chaves]);
    if (!forcar && assinatura === assinaturaCores) return;
    assinaturaCores = assinatura;
    const cfg = { ...aparencia };
    const lista = $("w-cores-lista");
    if (!campo) {
      lista.innerHTML = `<label class="cor-cat"><input type="color" data-unica value="${Util.paraHex(Util.corUnica(cfg))}"><span>Cor do card</span></label>`;
      return;
    }
    lista.innerHTML = chaves.map((k, i) => `<label class="cor-cat"><input type="color" data-chave="${esc(k)}" value="${Util.paraHex(Util.corDe(cfg, campo, k, i))}">
      <span>${esc(Util.rotuloChave(campo, k))}</span></label>`).join("") || '<p class="hint">As categorias aparecem quando houver dados.</p>';
  }

  function escolherPaleta(id) {
    aparencia = { paleta: id === "padrao" ? null : id, cores: {}, cor: null };
    $("w-cores-dica").textContent = "";
    renderCores(true);
    previaAtrasada();
  }

  function surpreender() {
    const { chaves } = alvoCores();
    const s = Util.paletaSurpresa(Math.max(chaves.length, 1));
    aparencia = { paleta: null, cores: Object.fromEntries(chaves.map((k, i) => [k, s.cores[i]])), cor: s.cores[0] };
    $("w-cores-dica").textContent = `Combinação "${s.nome}". Gostou? É só salvar. Quer outra? Clique de novo.`;
    renderCores(true);
    const lista = $("w-cores-lista");
    lista.classList.remove("surpresa");
    void lista.offsetWidth; // reinicia a animação
    lista.classList.add("surpresa");
    previaAtrasada();
  }

  function montarCorpo() {
    const tipo = $("w-tipo").value;
    const agregacao = $("w-agregacao").value;
    const filtro = { ...filtrosExtras };
    if ($("w-filtro-campo").value) filtro[$("w-filtro-campo").value] = $("w-filtro-valor").value;

    return {
      titulo: $("w-titulo").value.trim() || tituloSugerido(),
      tipo,
      modulo: $("w-modulo").value,
      config: {
        agregacao,
        campo: agregacao === "contagem" ? null : $("w-campo").value,
        agrupar_por: tipo === "kpi" ? null : tipo === "calendario" ? $("w-data").value || null : $("w-agrupar").value || null,
        serie_por: tipo === "bar" || tipo === "line" ? $("w-serie").value || null : null,
        filtro,
        paleta: aparencia.paleta,
        cores: aparencia.cores,
        cor: aparencia.cor,
        ...(tipo === "kpi" && $("w-meta").value.trim()
          ? { meta: $("w-meta").value.trim(), periodo: $("w-periodo").value, campo_data: $("w-data").value || null }
          : {})
      }
    };
  }

  // Atalhos montados a partir dos campos do módulo (cada um é só um config
  // pronto; nada novo no formato).
  function sugestoes(modulo) {
    const campos = modulo.schema.campos;
    const num = campos.find((c) => c.tipo === "moeda") || campos.find((c) => c.tipo === "numero");
    const sel = campos.find((c) => c.tipo === "selecao");
    const data = campos.find((c) => c.tipo === "data");
    const mov = campos.find((c) => c.tipo === "movimento");
    const medida = num ? { agregacao: "soma", campo: num.id } : { agregacao: "contagem" };
    const oque = num ? num.nome : "Registros";
    const lista = [{ rotulo: "Total de registros", tipo: "kpi", cfg: { agregacao: "contagem" } }];

    if (mov && num) lista.push({ rotulo: "Saldo", tipo: "kpi", cfg: { agregacao: "saldo", campo: num.id } });
    else if (num) lista.push({ rotulo: `Total de ${num.nome}`, tipo: "kpi", cfg: medida });
    if (sel) lista.push({ rotulo: `${oque} por ${sel.nome}`, tipo: "bar", cfg: { ...medida, agrupar_por: sel.id } });
    if (mov && num && data) {
      lista.push({ rotulo: "Entradas × saídas por mês", tipo: "bar", cfg: { agregacao: "soma", campo: num.id, agrupar_por: data.id, serie_por: mov.id } });
    }
    if (data) lista.push({ rotulo: `${oque} mês a mês`, tipo: "line", cfg: { ...(mov && num ? { agregacao: "saldo", campo: num.id } : medida), agrupar_por: data.id } });
    if (sel) lista.push({ rotulo: `Tabela por ${sel.nome}`, tipo: "table", cfg: { ...medida, agrupar_por: sel.id } });
    if (sel) lista.push({ rotulo: `${oque} por ${sel.nome} (pizza)`, tipo: "pie", cfg: { ...medida, agrupar_por: sel.id } });
    if (data) lista.push({ rotulo: `Calendário de ${oque}`, tipo: "calendario", cfg: { ...medida, agrupar_por: data.id } });
    return lista.slice(0, 8);
  }

  function renderSugestoes() {
    const modulo = App.modulo($("w-modulo").value);
    const lista = sugestoes(modulo);
    const icone = { kpi: "123", bar: Util.icone("barras"), line: Util.icone("linha"), table: Util.icone("tabela"), pie: Util.icone("pizza"), calendario: Util.icone("calendario") };
    $("w-sugestoes").innerHTML = lista.map((s, i) =>
      `<button type="button" class="sugestao" data-i="${i}"><span class="tipo-ico">${icone[s.tipo]}</span>${esc(s.rotulo)}</button>`).join("");
    $("w-sugestoes").querySelectorAll(".sugestao").forEach((b) => b.addEventListener("click", () => {
      const s = lista[Number(b.dataset.i)];
      setTipo(s.tipo);
      preencherOpcoes({ filtro: {}, ...s.cfg });
      $("w-sugestoes").querySelectorAll(".sugestao").forEach((x) => x.classList.toggle("selected", x === b));
      aoMudar(false, s.rotulo);
    }));
  }

  function tituloSugerido() {
    const modulo = App.modulo($("w-modulo").value);
    const tipo = $("w-tipo").value;
    const campo = campoDe(modulo, $("w-campo").value);
    const grupo = tipo === "kpi" ? null : campoDe(modulo, $("w-agrupar").value);
    const base = {
      contagem: "Quantidade",
      soma: campo ? campo.nome : "Total",
      media: `Média de ${campo ? campo.nome : "valor"}`,
      saldo: "Saldo"
    }[$("w-agregacao").value];
    if (tipo === "kpi" && $("w-meta").value.trim()) return `Meta de ${base.toLowerCase()}${{ mes: " do mês", semana: " da semana" }[$("w-periodo").value] || ""}`;
    if (tipo === "calendario") return `${base} por dia`;
    if (!grupo) return base;
    return grupo.tipo === "data" ? `${base} mês a mês` : `${base} por ${grupo.nome}`;
  }

  // Explica em português o que o card vai mostrar.
  function frase() {
    const modulo = App.modulo($("w-modulo").value);
    const c = montarCorpo();
    const cfg = c.config;
    const campo = campoDe(modulo, cfg.campo);
    const oque = {
      contagem: "a quantidade de registros",
      soma: `a soma de ${campo?.nome}`,
      media: `a média de ${campo?.nome}`,
      saldo: `o saldo (entradas − saídas) de ${campo?.nome}`
    }[cfg.agregacao];
    const como = { kpi: "um número", bar: "barras", line: "uma linha", table: "uma tabela", pie: "uma pizza", calendario: "um calendário (um quadrado por dia)" }[c.tipo];
    const partes = [`Mostra ${oque} de "${modulo.nome}" como ${como}`];
    const grupo = campoDe(modulo, cfg.agrupar_por);
    if (cfg.meta) partes.push(`com a meta de ${cfg.meta}${{ mes: " no mês", semana: " na semana" }[cfg.periodo] || ""} e quanto falta`);
    else if (grupo && c.tipo !== "calendario") partes.push(grupo.tipo === "data" ? `mês a mês (por ${grupo.nome})` : `separado por ${grupo.nome}`);
    const serie = campoDe(modulo, cfg.serie_por);
    if (serie) partes.push(`com uma cor para cada ${serie.nome}`);
    const filtros = Object.entries(cfg.filtro).map(([k, v]) => {
      const f = campoDe(modulo, k);
      return `${f ? f.nome : k} = ${f ? Util.rotuloChave(f, v) : v}`;
    });
    if (filtros.length) partes.push(`considerando só ${filtros.join(" e ")}`);
    return `${partes.join(", ")}.`;
  }

  // Prévia com dados fictícios: mesma consulta e mesmo motor (POST
  // /api/widgets/preview) e as MESMAS funções de desenho do dashboard.
  async function atualizarPrevia() {
    const seq = ++previaSeq;
    const c = montarCorpo();
    const modulo = App.modulo(c.modulo);
    const corpo = $("w-previa-corpo");
    $("w-previa-titulo").textContent = c.titulo;
    $("w-frase").textContent = frase();
    try {
      const d = await Api.post("/api/widgets/preview", c);
      if (seq !== previaSeq) return; // chegou uma resposta mais nova
      ultimaPrevia = d;
      renderCores(); // categorias de texto livre só se conhecem pelos dados
      corpo.className = "widget-body";
      corpo.dataset.tipo = c.tipo;
      charts.previa?.destroy();
      delete charts.previa;
      desenhar({ id: "previa", tipo: c.tipo, titulo: c.titulo }, corpo, d, modulo);
    } catch (e) {
      if (seq === previaSeq) corpo.innerHTML = `<div class="widget-erro">${esc(e.message)}</div>`;
    }
  }

  const previaAtrasada = Util.debounce(atualizarPrevia, 200);

  // `titulo`: nome do atalho escolhido; sem ele, o nome sai das escolhas.
  function aoMudar(limparAtalho = true, titulo = null) {
    if (limparAtalho) $("w-sugestoes").querySelectorAll(".sugestao.selected").forEach((x) => x.classList.remove("selected"));
    if (!tituloManual) $("w-titulo").value = titulo || tituloSugerido();
    renderCores();
    previaAtrasada();
  }

  function trocarModulo() {
    preencherOpcoes(null);
    const slug = $("w-modulo").value;
    $("w-modulo-dica").innerHTML = Ajuda.icone(`modulo-${slug}`);
    renderSugestoes();
    aoMudar();
  }

  function abrirFormulario(w = null) {
    const modulos = App.modulos();
    if (!modulos.length) { Util.aviso("Adicione um módulo antes de criar cards.", "erro"); return; }

    editando = w;
    tituloManual = Boolean(w);
    $("widget-modal-titulo").textContent = w ? "Editar card" : "Criar card";
    $("w-salvar").textContent = w ? "Salvar card" : "Adicionar ao dashboard";
    $("w-titulo").value = w ? w.titulo : "";
    aparencia = { paleta: w?.config.paleta || null, cores: { ...(w?.config.cores || {}) }, cor: w?.config.cor || null };
    ultimaPrevia = null;
    assinaturaCores = "";
    $("w-cores-dica").textContent = "";
    renderPaletas();

    // Sugere o módulo que o dashboard já usa mais.
    const usados = (atual?.widgets || []).map((x) => x.modulo_slug);
    const preferido = usados.sort((a, b) => usados.filter((x) => x === b).length - usados.filter((x) => x === a).length)[0];
    const inicial = w ? w.modulo_slug : (App.modulo(preferido) ? preferido : modulos[0].slug);
    opcoes("w-modulo", modulos.map((m) => [m.slug, m.nome]), inicial);
    $("w-modulo-dica").innerHTML = Ajuda.icone(`modulo-${inicial}`);
    renderSugestoes();

    setTipo(w ? w.tipo : "bar");
    preencherOpcoes(w ? w.config : null);
    if (!w) {
      // Card novo já começa num atalho útil (o 3º costuma ser "X por categoria").
      const botoes = $("w-sugestoes").querySelectorAll(".sugestao");
      (botoes[2] || botoes[botoes.length - 1])?.click();
    }
    erroWidget("");
    Util.abrirModal("modal-widget");
    if (w) aoMudar(false); // card novo: o clique no atalho já atualizou tudo
  }

  async function salvarWidget(ev) {
    ev.preventDefault();
    const tipo = $("w-tipo").value;
    const corpo = montarCorpo();

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
    if (!confirm("Remover este card do dashboard? Os registros do módulo não são afetados.")) return;
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

  // Excluir: se os módulos do dashboard ainda têm dados de exemplo do
  // template, oferece apagá-los junto (marcado por padrão). E oferece excluir
  // os próprios módulos (os dos cards e os que vieram com o template), só os
  // que a pessoa pode alterar e que nenhum outro dashboard usa: marcado
  // quando eles só têm dados de exemplo; com dados de alguém, desmarcado e
  // com aviso.
  async function excluir() {
    const ex = await Api.get(`/api/dashboards/${atual.id}/exemplos`);
    const mods = ex.modulos_do_dashboard || [];
    $("exd-texto").textContent = ex.total || mods.some((m) => m.removivel)
      ? `Excluir o dashboard "${atual.nome}"?`
      : `Excluir o dashboard "${atual.nome}"? Os módulos e os registros não são afetados.`;
    mostrarModulosParaExcluir(mods);
    $("exd-exemplos").hidden = !ex.total;
    // Módulo usado por outro dashboard: avisa e deixa desmarcado (relatório, problema 8).
    const compartilhado = ex.modulos.some((m) => m.outros_dashboards.length || m.outros_ocultos);
    $("exd-apagar").checked = !compartilhado;
    $("exd-rotulo").textContent = `Apagar também os ${ex.total} registro(s) de exemplo destes módulos:`;
    $("exd-lista").innerHTML = ex.modulos.map((m) => {
      const outros = [...m.outros_dashboards.map((n) => `"${esc(n)}"`), ...(m.outros_ocultos ? [`${m.outros_ocultos} de outra(s) pessoa(s)`] : [])];
      return `<li>${esc(m.nome)}: ${m.exemplos}${outros.length ? `<div class="exd-aviso">Também usado por ${outros.join(", ")}: esses dashboards ficarão sem os dados de exemplo.</div>` : ""}</li>`;
    }).join("");
    $("exd-erro").hidden = true;
    Util.abrirModal("modal-excluir-dashboard");
  }

  function mostrarModulosParaExcluir(mods) {
    const saem = mods.filter((m) => m.removivel);
    const ficam = mods.filter((m) => !m.removivel);
    const deAlguem = (m) => m.registros - m.exemplos;
    $("exd-modulos").hidden = !mods.length;
    $("exd-apagar-modulos").closest("label").hidden = !saem.length;
    $("exd-apagar-modulos").checked = saem.length > 0 && saem.every((m) => !deAlguem(m));
    $("exd-modulos-rotulo").textContent = saem.length === 1
      ? "Excluir também o módulo deste dashboard, com todos os registros:"
      : `Excluir também os ${saem.length} módulos deste dashboard, com todos os registros:`;
    $("exd-modulos-lista").innerHTML = saem.map((m) => `<li>${esc(m.nome)}: ${m.registros} registro(s)${deAlguem(m)
      ? `<div class="exd-aviso">${deAlguem(m)} não são de exemplo: alguém cadastrou ou editou.</div>` : ""}</li>`).join("");
    $("exd-modulos-ficam").hidden = !ficam.length;
    $("exd-modulos-ficam").textContent = ficam.length
      ? `Ficam: ${ficam.map((m) => `${m.nome} (${m.motivo})`).join("; ")}.` : "";
  }

  async function confirmarExcluir(ev) {
    ev.preventDefault();
    const comExemplos = !$("exd-exemplos").hidden && $("exd-apagar").checked;
    const comModulos = !$("exd-modulos").hidden && !$("exd-apagar-modulos").closest("label").hidden && $("exd-apagar-modulos").checked;
    const qs = new URLSearchParams();
    if (comExemplos) qs.set("exemplos", "1");
    if (comModulos) qs.set("modulos", "1");
    try {
      const r = await Api.del(`/api/dashboards/${atual.id}${qs.toString() ? `?${qs}` : ""}`);
      Util.fecharModal("modal-excluir-dashboard");
      const partes = [r.modulos_apagados?.length ? `${r.modulos_apagados.length} módulo(s)` : "",
        r.exemplos_apagados ? `${r.exemplos_apagados} registro(s) de exemplo` : ""].filter(Boolean);
      Util.aviso(partes.length ? `Dashboard excluído, com ${partes.join(" e ")}` : "Dashboard excluído");
      await App.recarregarNav();
      App.irPadrao();
    } catch (e) {
      $("exd-erro").textContent = e.message;
      $("exd-erro").hidden = false;
    }
  }

  // ---------------------------------------------------------- lançar ----
  // Cadastra um registro sem sair do dashboard e atualiza os cards.
  async function aposLancar() {
    await App.recarregarNav();
    atual.widgets.forEach(carregarDados);
  }

  function escolherLancar() {
    const usados = [...new Set(atual.widgets.map((w) => w.modulo_slug))].filter((s) => App.modulo(s)?.pode_lancar);
    const outros = App.modulos().filter((m) => m.pode_lancar).map((m) => m.slug).filter((s) => !usados.includes(s));
    if (!usados.length && !outros.length) {
      Util.aviso(App.modulos().length ? "Você não pode lançar em nenhum dos módulos que vê." : "Adicione um módulo antes de lançar.", "erro");
      return;
    }
    if (usados.length === 1) { Modulos.lancar(usados[0], aposLancar); return; }

    const botao = (slug, usado) => {
      const m = App.modulo(slug);
      return `<button type="button" class="lancar-item ${usado ? "usado" : ""}" data-slug="${esc(slug)}">
        <strong>${esc(m.nome)}</strong><span class="hint">${usado ? "usado neste dashboard · " : ""}${m.total} registro(s)</span></button>`;
    };
    $("lancar-lista").innerHTML = usados.map((s) => botao(s, true)).join("") + outros.map((s) => botao(s, false)).join("");
    $("lancar-lista").querySelectorAll(".lancar-item").forEach((b) => b.addEventListener("click", () => {
      Util.fecharModal("modal-lancar");
      Modulos.lancar(b.dataset.slug, aposLancar);
    }));
    Util.abrirModal("modal-lancar");
  }

  // ------------------------------------------------- novo dashboard ----
  // Em branco (só o nome) ou a partir de um template da galeria: o template
  // instala os próprios módulos e o dashboard dele, que já abre em seguida.
  function erroNovo(msg) {
    $("nd-erro").textContent = msg;
    $("nd-erro").hidden = !msg;
  }

  function trocarAbaNovo(id) {
    document.querySelectorAll("#modal-novo-dashboard .tabs button").forEach((b) => b.classList.toggle("active", b.dataset.aba === id));
    $("nd-aba-template").hidden = id !== "nd-aba-template";
    $("nd-aba-branco").hidden = id !== "nd-aba-branco";
    erroNovo("");
    if (id === "nd-aba-branco") $("nd-nome").focus();
  }

  // "privado" (padrão) ou "equipe": a escolha do topo da janela.
  const visibilidadeNova = () => document.querySelector('input[name="nd-visibilidade"]:checked')?.value || "privado";

  async function concluirNovo(hash) {
    Util.fecharModal("modal-novo-dashboard");
    await App.recarregarNav();
    App.ir(hash);
  }

  async function criarEmBranco(ev) {
    ev.preventDefault();
    const nome = $("nd-nome").value.trim();
    if (!nome) { erroNovo("Informe o nome do dashboard."); return; }
    try {
      const { id } = await Api.post("/api/dashboards", { nome, visibilidade: visibilidadeNova() });
      await concluirNovo(`#/d/${id}`);
    } catch (e) { erroNovo(e.message); }
  }

  async function criarDeTemplate(t) {
    const quem = visibilidadeNova() === "equipe" ? "que todos veem" : "só seu";
    if (!confirm(`Criar um dashboard ${quem} com o template "${t.nome}"? Ele instala os módulos: ${t.modulos.map((m) => m.nome).join(", ")}.`)) return;
    try {
      const res = await Api.post("/api/templates/instalar", {
        template_id: t.id, com_exemplos: $("nd-exemplos").checked, visibilidade: visibilidadeNova()
      });
      Util.aviso(Util.resumoInstalacao(res));
      await concluirNovo(res.dashboards.length ? `#/d/${res.dashboards[0]}` : `#/m/${encodeURIComponent(res.modulos[0])}`);
    } catch (e) { erroNovo(e.message); }
  }

  async function abrirNovo() {
    const templates = await Api.get("/api/templates");
    $("nd-galeria").innerHTML = templates.map((t) => Setup.cardHtml({
      id: t.id, nome: t.nome, descricao: t.descricao, tag: Setup.tagDe(t),
      modulos: t.modulos.map((m) => m.nome), dashboards: t.dashboards, selecionavel: false
    })).join("");
    $("nd-galeria").querySelectorAll(".tpl-card").forEach((card) => card.addEventListener("click", () => {
      criarDeTemplate(templates.find((x) => x.id === card.dataset.id));
    }));
    $("nd-nome").value = "";
    // Por padrão o dashboard novo é só de quem cria; "Todos veem" é escolha de cada vez.
    document.querySelector('input[name="nd-visibilidade"][value="privado"]').checked = true;
    trocarAbaNovo("nd-aba-template");
    Util.abrirModal("modal-novo-dashboard");
  }

  function initNovo() {
    document.querySelectorAll("#modal-novo-dashboard .tabs button").forEach((b) => b.addEventListener("click", () => trocarAbaNovo(b.dataset.aba)));
    $("nd-aba-branco").addEventListener("submit", criarEmBranco);
  }

  return { init, abrir, abrirNovo, marcarFixo, compartilhar: abrirCompartilhar, aberto: () => atual, novoWidget: () => abrirFormulario() };
})();
