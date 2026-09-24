(function () {
  function el(id) { return document.getElementById(id); }

  function switchView(name) {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
    if (name === "demandas") Demandas.reload();
    if (name === "fluxo") Fluxo.reload();
  }

  function wireNav() {
    document.querySelectorAll(".tabs button").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });
  }

  function wireModalDismiss() {
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => Util.closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.remove("open");
      });
    });
  }

  async function startApp(status) {
    Util.setCurrency(status.moeda);
    el("brand-name").textContent = "DashZon";
    el("org-meta").textContent = `${status.org_name} · ${status.moeda}`;
    el("app").classList.add("ready");

    wireNav();
    wireModalDismiss();

    await Dashboards.init();
    Demandas.init();
    Fluxo.init();
  }

  async function boot() {
    const status = await Api.get("/api/status");
    if (status.configured) {
      await startApp(status);
      return;
    }

    Util.openModal("setup-overlay");
    el("setup-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      await Api.post("/api/setup", {
        org_name: el("setup-org").value.trim(),
        moeda: el("setup-moeda").value,
        meta_mensal: parseFloat(el("setup-meta").value || "0")
      });
      document.getElementById("setup-overlay").classList.remove("open");
      const newStatus = await Api.get("/api/status");
      await startApp(newStatus);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
