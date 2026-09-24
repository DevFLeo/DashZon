// Tela de Fluxo de Caixa: KPIs + gráfico mensal vêm de /api/fluxo/summary
// (agregado pelo motor C++), a tabela é CRUD direto contra o SQLite.
const Fluxo = (() => {
  let chart = null;

  function el(id) { return document.getElementById(id); }

  async function reload() {
    const [summary, list] = await Promise.all([
      Api.get("/api/fluxo/summary"),
      Api.get("/api/fluxo")
    ]);
    renderKpis(summary);
    renderChart(summary.by_mes || []);
    renderTable(list);
  }

  function renderKpis(s) {
    el("fluxo-kpis").innerHTML = `
      <div class="kpi"><div class="label">Entradas</div><div class="value good">${Util.fmtMoney(s.total_entrada)}</div></div>
      <div class="kpi"><div class="label">Saídas</div><div class="value bad">${Util.fmtMoney(s.total_saida)}</div></div>
      <div class="kpi"><div class="label">Saldo</div><div class="value ${s.saldo >= 0 ? "good" : "bad"}">${Util.fmtMoney(s.saldo)}</div></div>
    `;
  }

  function renderChart(byMes) {
    const ctx = el("fluxo-chart").getContext("2d");
    const labels = byMes.map((m) => m.mes);
    const entrada = byMes.map((m) => m.entrada);
    const saida = byMes.map((m) => m.saida);

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Entrada", data: entrada, backgroundColor: "#2a78d6", borderRadius: 4, maxBarThickness: 28 },
          { label: "Saída", data: saida, backgroundColor: "#e34948", borderRadius: 4, maxBarThickness: 28 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom" } },
        scales: {
          y: { beginAtZero: true, grid: { color: "#e1e0d9" } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function renderTable(list) {
    const wrap = el("fluxo-table-wrap");
    if (!list.length) {
      wrap.innerHTML = `<div class="empty-state">Nenhum lançamento ainda.</div>`;
      return;
    }
    const rows = list.map((f) => `<tr>
      <td><span class="badge ${f.tipo === "entrada" ? "badge-good" : "badge-critical"}">${f.tipo === "entrada" ? "Entrada" : "Saída"}</span></td>
      <td>${Util.escapeHtml(f.categoria)}</td>
      <td>${Util.escapeHtml(f.descricao || "—")}</td>
      <td class="num">${Util.fmtMoney(f.valor)}</td>
      <td>${Util.fmtDate(f.data)}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-sm" data-edit="${f.id}">Editar</button>
          <button class="btn btn-sm btn-danger" data-del="${f.id}">Excluir</button>
        </div>
      </td>
    </tr>`).join("");

    wrap.innerHTML = `<table class="data">
      <thead><tr><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Data</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

    wrap.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => openEdit(list.find((f) => String(f.id) === btn.dataset.edit)));
    });
    wrap.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => removeItem(btn.dataset.del));
    });
  }

  function openNew() {
    el("modal-fluxo-title").textContent = "Novo lançamento";
    el("form-fluxo").reset();
    el("fluxo-id").value = "";
    el("fluxo-data").value = new Date().toISOString().slice(0, 10);
    Util.openModal("modal-fluxo");
  }

  function openEdit(f) {
    if (!f) return;
    el("modal-fluxo-title").textContent = "Editar lançamento";
    el("fluxo-id").value = f.id;
    el("fluxo-tipo").value = f.tipo;
    el("fluxo-valor").value = f.valor;
    el("fluxo-categoria").value = f.categoria || "";
    el("fluxo-descricao").value = f.descricao || "";
    el("fluxo-data").value = f.data || "";
    Util.openModal("modal-fluxo");
  }

  async function removeItem(id) {
    if (!confirm("Excluir este lançamento?")) return;
    await Api.del(`/api/fluxo/${id}`);
    reload();
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const payload = {
      tipo: el("fluxo-tipo").value,
      valor: parseFloat(el("fluxo-valor").value || "0"),
      categoria: el("fluxo-categoria").value.trim() || "(sem categoria)",
      descricao: el("fluxo-descricao").value.trim(),
      data: el("fluxo-data").value
    };
    const id = el("fluxo-id").value;
    if (id) await Api.put(`/api/fluxo/${id}`, payload);
    else await Api.post("/api/fluxo", payload);
    Util.closeModal("modal-fluxo");
    reload();
  }

  function init() {
    el("new-fluxo-btn").addEventListener("click", openNew);
    el("form-fluxo").addEventListener("submit", onSubmit);
    reload();
  }

  return { init, reload };
})();
