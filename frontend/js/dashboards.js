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
    grid.on("resizestop", (_ev, el) => charts[el.gridstackNode.id]?.resize());

    $("btn-add-widget").addEventListener("click", () => abrirFormulario());
    $("btn-renomear-dashboard").addEventListener("click", renomear);
    $("btn-fixar").addEventListener("click", alternarFixo);
    $("btn-compartilhar").addEventListener("click", abrirCompartilhar);
    $("form-compartilhar").addEventListener("submit", salvarCompartilhar);
    $("btn-excluir-dashboard").addEventListener("click", excluir);
    $("form-widget").addEventListener("submit", salvarWidget);
    $("w-modulo").addEventListener("change", trocarModulo);
    $("w-agregacao").addEventListener("change", atualizarVisibilidade);
    $("w-filtro-campo").addEventListener("change", () => preencherValoresFiltro(""));
    document.querySelectorAll("#w-tipos .tipo-card").forEach((b) => b.addEventListener("click", () => { setTipo(b.dataset.tipo); aoMudar(); }));
    ["w-agregacao", "w-campo", "w-agrupar", "w-serie", "w-filtro-campo", "w-filtro-valor"]
      .forEach((id) => $(id).addEventListener("change", () => aoMudar()));
    $("w-titulo").addEventListener("input", () => {
      tituloManual = $("w-titulo").value.trim() !== "";
      previaAtrasada();
    });
    $("btn-lancar").addEventListener("click", escolherLancar);
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

    $("btn-fixar").textContent = atual.fixo ? "🔓 Liberar movimentação" : "🔒 Fixar layout";
    $("btn-fixar").setAttribute("aria-pressed", String(atual.fixo));
    $("btn-fixar").title = atual.fixo ? "Permite arrastar e redimensionar os cards de novo" : "Trava a posição e o tamanho dos cards";

    const meu = atual.dono_id === App.usuario()?.id;
    $("dash-selo").textContent = atual.visibilidade === "privado"
      ? "🔒 Só você vê este dashboard"
      : `👥 Da equipe${meu ? "" : ` · criado por ${atual.dono_nome || "outra pessoa"}`}${editavel ? "" : " · só leitura"}`;
    $("dash-dica").textContent = !editavel
      ? "Você pode ver os cards e lançar registros; só quem criou (ou um administrador) altera este dashboard."
      : atual.fixo
        ? "Layout fixado: os cards não se movem nem mudam de tamanho. Use \"Liberar movimentação\" para reorganizar."
        : "Arraste os cards pelo título e redimensione pelo canto. Passe o mouse num card para lançar, editar ou remover.";
  }

  async function alternarFixo() {
    try {
      await Api.put(`/api/dashboards/${atual.id}`, { fixo: !atual.fixo });
      atual.fixo = !atual.fixo;
      aplicarPermissoes();
      Util.aviso(atual.fixo ? "Layout fixado" : "Movimentação liberada");
    } catch (e) { Util.aviso(e.message, "erro"); }
  }

  async function abrirCompartilhar() {
    document.querySelectorAll('input[name="comp-visibilidade"]').forEach((r) => { r.checked = r.value === atual.visibilidade; });
    $("comp-erro").hidden = true;
    const admin = App.usuario()?.admin;
    $("comp-dono-wrap").hidden = !admin;
    if (admin) {
      const contas = (await Api.get("/api/admin/usuarios")).filter((u) => u.ativo);
      $("comp-dono").innerHTML = contas.map((u) =>
        `<option value="${u.id}" ${u.id === atual.dono_id ? "selected" : ""}>${esc(u.nome || u.login)} (${esc(u.login)})</option>`).join("");
    }
    Util.abrirModal("modal-compartilhar");
  }

  async function salvarCompartilhar(ev) {
    ev.preventDefault();
    const corpo = { visibilidade: document.querySelector('input[name="comp-visibilidade"]:checked')?.value };
    if (!$("comp-dono-wrap").hidden) corpo.dono_id = Number($("comp-dono").value);
    try {
      await Api.put(`/api/dashboards/${atual.id}`, corpo);
      Util.fecharModal("modal-compartilhar");
      await App.recarregarNav();
      // Transferido como privado para outra pessoa: ele some daqui.
      if (App.dashboards().some((d) => d.id === atual.id)) await abrir(atual.id);
      else App.irPadrao();
      Util.aviso("Compartilhamento salvo");
    } catch (e) {
      $("comp-erro").textContent = e.message;
      $("comp-erro").hidden = false;
    }
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
            <button class="icon-btn" data-editar title="Editar card" aria-label="Editar card">✎</button>
            <button class="icon-btn" data-remover title="Remover card" aria-label="Remover card">×</button>
          </span>
        </div>
        <div class="widget-body" id="wb-${w.id}"></div>
      </div>`;
    item.querySelector("[data-lancar]").addEventListener("click", () => Modulos.lancar(w.modulo_slug, aposLancar));
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
    $("w-agrupar-wrap").hidden = tipo === "kpi";
    $("w-serie-wrap").hidden = tipo === "kpi" || tipo === "table";
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
        agrupar_por: tipo === "kpi" ? null : $("w-agrupar").value || null,
        serie_por: tipo === "bar" || tipo === "line" ? $("w-serie").value || null : null,
        filtro
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
    return lista.slice(0, 6);
  }

  function renderSugestoes() {
    const modulo = App.modulo($("w-modulo").value);
    const lista = sugestoes(modulo);
    const icone = { kpi: "123", bar: "▮▮", line: "╱╲", table: "☰" };
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
    const como = { kpi: "um número", bar: "barras", line: "uma linha", table: "uma tabela" }[c.tipo];
    const partes = [`Mostra ${oque} de "${modulo.nome}" como ${como}`];
    const grupo = campoDe(modulo, cfg.agrupar_por);
    if (grupo) partes.push(grupo.tipo === "data" ? `mês a mês (por ${grupo.nome})` : `separado por ${grupo.nome}`);
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
      corpo.className = "widget-body";
      corpo.dataset.tipo = c.tipo;
      charts.previa?.destroy();
      delete charts.previa;
      if (c.tipo === "kpi") renderKpi(corpo, d, modulo);
      else if (c.tipo === "table") renderTabela(corpo, d, modulo);
      else renderGrafico({ id: "previa", tipo: c.tipo, titulo: c.titulo }, corpo, d, modulo);
    } catch (e) {
      if (seq === previaSeq) corpo.innerHTML = `<div class="widget-erro">${esc(e.message)}</div>`;
    }
  }

  const previaAtrasada = Util.debounce(atualizarPrevia, 200);

  // `titulo`: nome do atalho escolhido; sem ele, o nome sai das escolhas.
  function aoMudar(limparAtalho = true, titulo = null) {
    if (limparAtalho) $("w-sugestoes").querySelectorAll(".sugestao.selected").forEach((x) => x.classList.remove("selected"));
    if (!tituloManual) $("w-titulo").value = titulo || tituloSugerido();
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

  async function excluir() {
    if (!confirm(`Excluir o dashboard "${atual.nome}"? Os módulos e registros não são afetados.`)) return;
    await Api.del(`/api/dashboards/${atual.id}`);
    await App.recarregarNav();
    App.irPadrao();
  }

  // ---------------------------------------------------------- lançar ----
  // Cadastra um registro sem sair do dashboard e atualiza os cards.
  async function aposLancar() {
    await App.recarregarNav();
    atual.widgets.forEach(carregarDados);
  }

  function escolherLancar() {
    const usados = [...new Set(atual.widgets.map((w) => w.modulo_slug))].filter((s) => App.modulo(s));
    const outros = App.modulos().map((m) => m.slug).filter((s) => !usados.includes(s));
    if (!usados.length && !outros.length) { Util.aviso("Adicione um módulo antes de lançar.", "erro"); return; }
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
      const { id } = await Api.post("/api/dashboards", { nome, visibilidade: $("nd-compartilhar").checked ? "equipe" : "privado" });
      await concluirNovo(`#/d/${id}`);
    } catch (e) { erroNovo(e.message); }
  }

  async function criarDeTemplate(t) {
    if (!confirm(`Criar um dashboard com o template "${t.nome}"? Ele instala os módulos: ${t.modulos.map((m) => m.nome).join(", ")}.`)) return;
    try {
      const res = await Api.post("/api/templates/instalar", {
        template_id: t.id, com_exemplos: $("nd-exemplos").checked, visibilidade: $("nd-compartilhar").checked ? "equipe" : "privado"
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
    $("nd-compartilhar").checked = false; // por padrão o dashboard novo é só de quem cria
    trocarAbaNovo("nd-aba-template");
    Util.abrirModal("modal-novo-dashboard");
  }

  function initNovo() {
    document.querySelectorAll("#modal-novo-dashboard .tabs button").forEach((b) => b.addEventListener("click", () => trocarAbaNovo(b.dataset.aba)));
    $("nd-aba-branco").addEventListener("submit", criarEmBranco);
  }

  return { init, abrir, abrirNovo, novoWidget: () => abrirFormulario() };
})();
