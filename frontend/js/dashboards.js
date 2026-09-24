// Construtor de dashboards: canvas com arrasta-e-solta (GridStack) onde o
// usuário monta widgets escolhendo tabela + campo ("chave") do banco. O
// layout (posição/tamanho) e a config de cada widget ficam salvos no
// backend (tabelas dashboards/widgets).
const Dashboards = (() => {
  let grid = null;
  let dashboards = [];
  let currentId = null;
  let meta = null;
  let widgetCharts = {};

  function el(id) { return document.getElementById(id); }

  async function init() {
    grid = GridStack.init({ cellHeight: 80, margin: 8, float: true }, el("grid"));
    grid.on("change", persistLayout);

    meta = await Api.get("/api/meta/fields");
    populateTableSelect();

    el("new-dashboard-btn").addEventListener("click", createDashboard);
    el("rename-dashboard-btn").addEventListener("click", renameDashboard);
    el("add-widget-btn").addEventListener("click", () => Util.openModal("modal-widget"));
    el("widget-tabela").addEventListener("change", populateFieldSelects);
    el("form-widget").addEventListener("submit", onAddWidget);

    populateFieldSelects();
    await loadDashboardList();
  }

  function populateTableSelect() {
    const sel = el("widget-tabela");
    sel.innerHTML = Object.entries(meta).map(([key, t]) => `<option value="${key}">${t.label}</option>`).join("");
  }

  function populateFieldSelects() {
    const table = el("widget-tabela").value || Object.keys(meta)[0];
    const t = meta[table];
    const agrupar = el("widget-agrupar");
    const campo = el("widget-campo");
    agrupar.innerHTML = `<option value="">— sem agrupamento —</option>` +
      Object.entries(t.dimensoes).map(([k, label]) => `<option value="${k}">${label}</option>`).join("");
    campo.innerHTML = `<option value="">— contagem —</option>` +
      Object.entries(t.medidas).map(([k, label]) => `<option value="${k}">${label}</option>`).join("");
  }

  async function loadDashboardList() {
    dashboards = await Api.get("/api/dashboards");
    if (!dashboards.length) return;
    if (!currentId || !dashboards.find((d) => d.id === currentId)) currentId = dashboards[0].id;
    renderList();
    await openDashboard(currentId);
  }

  function renderList() {
    el("dashboard-list").innerHTML = dashboards.map((d) => `
      <div class="sidebar-item ${d.id === currentId ? "active" : ""}" data-id="${d.id}">
        <span>${Util.escapeHtml(d.nome)}</span>
        <button class="del" data-del="${d.id}" title="Excluir dashboard">✕</button>
      </div>
    `).join("");

    el("dashboard-list").querySelectorAll(".sidebar-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.closest("[data-del]")) return;
        openDashboard(Number(item.dataset.id));
      });
    });
    el("dashboard-list").querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Excluir este dashboard e seus widgets?")) return;
        await Api.del(`/api/dashboards/${btn.dataset.del}`);
        currentId = null;
        await loadDashboardList();
      });
    });
  }

  async function createDashboard() {
    const nome = prompt("Nome do novo dashboard:");
    if (!nome || !nome.trim()) return;
    const { id } = await Api.post("/api/dashboards", { nome: nome.trim() });
    currentId = id;
    await loadDashboardList();
  }

  async function renameDashboard() {
    const dash = dashboards.find((d) => d.id === currentId);
    if (!dash) return;
    const nome = prompt("Novo nome do dashboard:", dash.nome);
    if (!nome || !nome.trim()) return;
    await Api.put(`/api/dashboards/${currentId}`, { nome: nome.trim() });
    await loadDashboardList();
  }

  async function openDashboard(id) {
    currentId = id;
    renderList();
    const dash = await Api.get(`/api/dashboards/${id}`);
    el("dashboard-title").textContent = dash.nome;

    Object.values(widgetCharts).forEach((c) => c && c.destroy && c.destroy());
    widgetCharts = {};
    grid.removeAll();

    dash.widgets.forEach((w) => addWidgetToGrid(w));
  }

  function widgetBodyHtml(w) {
    if (w.tipo === "kpi") return `<div class="widget-kpi-value" id="w-val-${w.id}">—</div><div class="widget-kpi-sub" id="w-sub-${w.id}"></div>`;
    if (w.tipo === "table") return `<div id="w-table-${w.id}" style="overflow:auto;flex:1;font-size:12px;"></div>`;
    return `<canvas id="w-chart-${w.id}"></canvas>`;
  }

  function addWidgetToGrid(w) {
    const node = grid.addWidget({
      x: w.x, y: w.y, w: w.w, h: w.h,
      id: String(w.id),
      content: `
        <div class="widget-header">
          <span class="title">${Util.escapeHtml(w.titulo)}</span>
          <button class="del" data-del-widget="${w.id}" title="Remover">✕</button>
        </div>
        <div class="widget-body">${widgetBodyHtml(w)}</div>
      `
    });
    node.querySelector(`[data-del-widget="${w.id}"]`).addEventListener("click", () => removeWidget(w.id));
    loadWidgetData(w);
  }

  async function removeWidget(id) {
    if (!confirm("Remover este widget do dashboard?")) return;
    await Api.del(`/api/widgets/${id}`);
    if (widgetCharts[id]) { widgetCharts[id].destroy(); delete widgetCharts[id]; }
    const gridItem = document.getElementById(`w-chart-${id}`)?.closest(".grid-stack-item")
      || document.getElementById(`w-val-${id}`)?.closest(".grid-stack-item")
      || document.getElementById(`w-table-${id}`)?.closest(".grid-stack-item");
    if (gridItem) grid.removeWidget(gridItem);
  }

  async function loadWidgetData(w) {
    try {
      const data = await Api.get(`/api/widgets/${w.id}/data`);
      const rows = data.result || [];
      if (w.tipo === "kpi") renderKpiWidget(w, rows, data.total_count);
      else if (w.tipo === "table") renderTableWidget(w, rows);
      else renderChartWidget(w, rows);
    } catch (err) {
      console.error("Falha ao carregar widget", w.id, err);
    }
  }

  function renderKpiWidget(w, rows, totalCount) {
    const valueEl = document.getElementById(`w-val-${w.id}`);
    const subEl = document.getElementById(`w-sub-${w.id}`);
    if (!valueEl) return;
    if (w.campo) {
      const total = rows.reduce((acc, r) => acc + (r.sum || 0), 0);
      valueEl.textContent = Util.fmtMoney(total);
      subEl.textContent = `soma de ${w.campo}`;
    } else {
      valueEl.textContent = String(totalCount ?? rows.reduce((a, r) => a + r.count, 0));
      subEl.textContent = "registros";
    }
  }

  function renderTableWidget(w, rows) {
    const wrap = document.getElementById(`w-table-${w.id}`);
    if (!wrap) return;
    if (!rows.length) { wrap.innerHTML = `<div class="empty-state">Sem dados</div>`; return; }
    wrap.innerHTML = `<table class="data"><thead><tr><th>${w.agrupar_por || "Chave"}</th><th>Qtd.</th>${w.campo ? "<th>Soma</th>" : ""}</tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${Util.escapeHtml(r.key)}</td><td class="num">${r.count}</td>${w.campo ? `<td class="num">${Util.fmtMoney(r.sum)}</td>` : ""}</tr>`).join("")}</tbody></table>`;
  }

  function renderChartWidget(w, rows) {
    const canvas = document.getElementById(`w-chart-${w.id}`);
    if (!canvas) return;
    const labels = rows.map((r) => r.key);
    const values = rows.map((r) => (w.campo ? r.sum : r.count));

    if (widgetCharts[w.id]) widgetCharts[w.id].destroy();
    widgetCharts[w.id] = new Chart(canvas.getContext("2d"), {
      type: w.tipo === "line" ? "line" : "bar",
      data: {
        labels,
        datasets: [{
          label: w.titulo,
          data: values,
          backgroundColor: "#2a78d6",
          borderColor: "#2a78d6",
          borderRadius: 4,
          tension: 0.3,
          maxBarThickness: 32
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: "#e1e0d9" } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  async function persistLayout(_event, items) {
    if (!items) return;
    await Promise.all(items.map((it) => Api.put(`/api/widgets/${it.id}/layout`, {
      x: it.x, y: it.y, w: it.w, h: it.h
    }).catch(() => {})));
  }

  async function onAddWidget(ev) {
    ev.preventDefault();
    if (!currentId) { alert("Crie um dashboard primeiro."); return; }
    const payload = {
      titulo: el("widget-titulo").value.trim(),
      tipo: el("widget-tipo").value,
      tabela: el("widget-tabela").value,
      agrupar_por: el("widget-agrupar").value || null,
      campo: el("widget-campo").value || null,
      agregacao: el("widget-campo").value ? "sum" : "count",
      x: 0, y: 0, w: 4, h: 3
    };
    const { id } = await Api.post(`/api/dashboards/${currentId}/widgets`, payload);
    Util.closeModal("modal-widget");
    el("form-widget").reset();
    populateFieldSelects();
    addWidgetToGrid({ ...payload, id });
  }

  return { init };
})();
