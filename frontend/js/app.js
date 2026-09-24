// Inicialização, navegação (hash: #/d/<id> dashboard, #/m/<slug> módulo) e
// estado compartilhado (lista de módulos e dashboards) usado pelas telas.
const App = (() => {
  let modulos = [];
  let dashboards = [];

  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;

  const modulo = (slug) => modulos.find((m) => m.slug === slug);

  function rotaAtual() {
    const [, tipo, id] = location.hash.split("/");
    return { tipo, id: id ? decodeURIComponent(id) : null };
  }

  async function recarregarNav() {
    [modulos, dashboards] = await Promise.all([Api.get("/api/modulos"), Api.get("/api/dashboards")]);
    renderNav();
  }

  function renderNav() {
    const rota = rotaAtual();
    $("nav-dashboards").innerHTML = dashboards.length
      ? dashboards.map((d) => `<a class="nav-item ${rota.tipo === "d" && rota.id === String(d.id) ? "active" : ""}" href="#/d/${d.id}">${esc(d.nome)}</a>`).join("")
      : '<div class="nav-empty">Nenhum dashboard</div>';
    $("nav-modulos").innerHTML = modulos.length
      ? modulos.map((m) => `<a class="nav-item ${rota.tipo === "m" && rota.id === m.slug ? "active" : ""}" href="#/m/${encodeURIComponent(m.slug)}">
          <span>${esc(m.nome)}</span><span class="count">${m.total}</span></a>`).join("")
      : '<div class="nav-empty">Nenhum módulo</div>';
  }

  function mostrar(view) {
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === view));
  }

  function rotaPadrao() {
    if (!modulos.length) return "#/inicio";
    if (dashboards.length) return `#/d/${dashboards[0].id}`;
    return `#/m/${encodeURIComponent(modulos[0].slug)}`;
  }

  function ir(hash) {
    if (location.hash === hash) rotear();
    else location.hash = hash;
  }

  const irPadrao = () => ir(rotaPadrao());

  async function rotear() {
    const { tipo, id } = rotaAtual();
    renderNav();
    try {
      if (tipo === "d" && dashboards.some((d) => String(d.id) === id)) {
        mostrar("view-dashboard");
        await Dashboards.abrir(Number(id));
      } else if (tipo === "m" && modulo(id)) {
        mostrar("view-modulo");
        await Modulos.abrir(id);
      } else if (!modulos.length) {
        mostrar("view-vazio");
      } else {
        location.replace(rotaPadrao());
      }
    } catch (e) {
      Util.aviso(e.message, "erro");
    }
  }

  async function novoDashboard() {
    const nome = prompt("Nome do novo dashboard:");
    if (!nome || !nome.trim()) return;
    const { id } = await Api.post("/api/dashboards", { nome: nome.trim() });
    await recarregarNav();
    ir(`#/d/${id}`);
  }

  function aplicarPrivacidade(ligado) {
    document.body.classList.toggle("privado", ligado);
    const btn = $("btn-privacidade");
    btn.setAttribute("aria-pressed", String(ligado));
    btn.textContent = ligado ? "Mostrar valores" : "Ocultar valores";
    Util.storage("dashzon.privado", ligado ? "1" : "0");
  }

  function ligarComportamentosGlobais() {
    document.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", () => Util.fecharModal(b.dataset.fechar)));
    document.querySelectorAll(".modal-overlay").forEach((o) => o.addEventListener("mousedown", (e) => {
      if (e.target === o) o.classList.remove("open");
    }));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach((o) => o.classList.remove("open"));
    });

    // Tab dentro dos editores JSON insere indentação em vez de sair do campo.
    document.querySelectorAll("textarea.code").forEach((t) => t.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      const { selectionStart: i, selectionEnd: f, value } = t;
      t.value = `${value.slice(0, i)}  ${value.slice(f)}`;
      t.selectionStart = t.selectionEnd = i + 2;
    }));

    document.querySelectorAll('[data-acao="add-widget"]').forEach((b) => b.addEventListener("click", () => Dashboards.novoWidget()));
    document.querySelectorAll('[data-acao="add-modulo"]').forEach((b) => b.addEventListener("click", () => Modulos.abrirAdicionar()));

    $("btn-privacidade").addEventListener("click", () => aplicarPrivacidade(!document.body.classList.contains("privado")));
    window.addEventListener("unhandledrejection", (e) => Util.aviso(e.reason?.message || "Erro inesperado", "erro"));
  }

  async function iniciarApp() {
    const status = await Api.get("/api/status");
    Util.setMoeda(status.moeda);
    $("org-nome").textContent = status.org_name;
    document.title = `DashZon · ${status.org_name}`;
    $("app").classList.add("ready");

    Dashboards.init();
    Modulos.init();
    $("btn-novo-dashboard").addEventListener("click", novoDashboard);

    await recarregarNav();
    window.addEventListener("hashchange", rotear);
    await rotear();
  }

  async function boot() {
    ligarComportamentosGlobais();
    aplicarPrivacidade(Util.storage("dashzon.privado") === "1");
    const status = await Api.get("/api/status");
    if (status.configured) await iniciarApp();
    else await Setup.iniciar(iniciarApp);
  }

  document.addEventListener("DOMContentLoaded", boot);

  return { modulo, modulos: () => modulos, recarregarNav, ir, irPadrao };
})();
