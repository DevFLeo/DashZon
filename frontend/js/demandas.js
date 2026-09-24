// Tela de Demandas: CRUD + busca/kanban resolvidos pelo motor C++ (via
// GET /api/demandas/search, que sempre passa pelo dashzon_engine).
const Demandas = (() => {
  const STATUS_LABEL = { backlog: "Backlog", em_andamento: "Em andamento", concluido: "Concluído", cancelado: "Cancelado" };
  const PRIORIDADE = {
    baixa: { label: "Baixa", cls: "badge-good" },
    media: { label: "Média", cls: "badge-warning" },
    alta: { label: "Alta", cls: "badge-serious" },
    urgente: { label: "Urgente", cls: "badge-critical" }
  };

  let state = { q: "", status: "" };

  function el(id) { return document.getElementById(id); }

  async function reload() {
    const qs = new URLSearchParams();
    if (state.q) qs.set("q", state.q);
    if (state.status) qs.set("status", state.status);
    const data = await Api.get(`/api/demandas/search?${qs.toString()}`);
    renderKanban(data.by_status || {});
    renderTable(data.result || []);
  }

  function renderKanban(byStatus) {
    const wrap = el("demanda-kanban");
    wrap.innerHTML = Object.keys(STATUS_LABEL).map((key) => {
      const count = byStatus[key] || 0;
      return `<div class="kpi"><div class="label">${STATUS_LABEL[key]}</div><div class="value">${count}</div></div>`;
    }).join("");
  }

  function renderTable(list) {
    const wrap = el("demanda-table-wrap");
    if (!list.length) {
      wrap.innerHTML = `<div class="empty-state">Nenhuma demanda encontrada.</div>`;
      return;
    }
    const rows = list.map((d) => {
      const pr = PRIORIDADE[d.prioridade] || PRIORIDADE.media;
      return `<tr>
        <td>
          <strong>${Util.escapeHtml(d.titulo)}</strong>
          ${d.descricao ? `<div class="hint">${Util.escapeHtml(d.descricao)}</div>` : ""}
        </td>
        <td><span class="badge badge-neutral">${STATUS_LABEL[d.status] || d.status}</span></td>
        <td><span class="badge ${pr.cls}">${pr.label}</span></td>
        <td>${Util.escapeHtml(d.responsavel || "—")}</td>
        <td class="num">${Util.fmtMoney(d.valor)}</td>
        <td>${Util.fmtDate(d.prazo)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-sm" data-edit="${d.id}">Editar</button>
            <button class="btn btn-sm btn-danger" data-del="${d.id}">Excluir</button>
          </div>
        </td>
      </tr>`;
    }).join("");

    wrap.innerHTML = `<table class="data">
      <thead><tr><th>Título</th><th>Status</th><th>Prioridade</th><th>Responsável</th><th>Valor</th><th>Prazo</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

    wrap.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => openEdit(list.find((d) => String(d.id) === btn.dataset.edit)));
    });
    wrap.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => removeItem(btn.dataset.del));
    });
  }

  function openNew() {
    el("modal-demanda-title").textContent = "Nova demanda";
    el("form-demanda").reset();
    el("demanda-id").value = "";
    Util.openModal("modal-demanda");
  }

  function openEdit(d) {
    if (!d) return;
    el("modal-demanda-title").textContent = "Editar demanda";
    el("demanda-id").value = d.id;
    el("demanda-titulo").value = d.titulo || "";
    el("demanda-descricao").value = d.descricao || "";
    el("demanda-status").value = d.status || "backlog";
    el("demanda-etapa").value = d.etapa_fluxo || "entrada";
    el("demanda-prioridade").value = d.prioridade || "media";
    el("demanda-valor").value = d.valor || 0;
    el("demanda-responsavel").value = d.responsavel || "";
    el("demanda-prazo").value = d.prazo || "";
    Util.openModal("modal-demanda");
  }

  async function removeItem(id) {
    if (!confirm("Excluir esta demanda?")) return;
    await Api.del(`/api/demandas/${id}`);
    reload();
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const payload = {
      titulo: el("demanda-titulo").value.trim(),
      descricao: el("demanda-descricao").value.trim(),
      status: el("demanda-status").value,
      etapa_fluxo: el("demanda-etapa").value,
      prioridade: el("demanda-prioridade").value,
      valor: parseFloat(el("demanda-valor").value || "0"),
      responsavel: el("demanda-responsavel").value.trim(),
      prazo: el("demanda-prazo").value || null
    };
    const id = el("demanda-id").value;
    if (id) await Api.put(`/api/demandas/${id}`, payload);
    else await Api.post("/api/demandas", payload);
    Util.closeModal("modal-demanda");
    reload();
  }

  function init() {
    el("new-demanda-btn").addEventListener("click", openNew);
    el("form-demanda").addEventListener("submit", onSubmit);
    el("demanda-search").addEventListener("input", Util.debounce((e) => {
      state.q = e.target.value.trim();
      reload();
    }, 250));
    el("demanda-filter-status").addEventListener("change", (e) => {
      state.status = e.target.value;
      reload();
    });
    reload();
  }

  return { init, reload };
})();
