// Inicialização, navegação (hash: #/d/<id> dashboard, #/m/<slug>[/<id>] módulo
// ou nota, #/config/<aba> configurações, #/admin) e estado compartilhado (lista
// de módulos e dashboards) usado pelas telas.
const App = (() => {
  let modulos = [];
  let dashboards = [];

  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;

  const modulo = (slug) => modulos.find((m) => m.slug === slug);
  // Módulos que a pessoa desligou em Configurações > Módulos saem do menu dela.
  const ocultos = () => new Set(usuario?.preferencias?.modulos_ocultos || []);
  const modulosVisiveis = () => modulos.filter((m) => !ocultos().has(m.slug));

  function rotaAtual() {
    const [, tipo, id, extra] = location.hash.split("/");
    return { tipo, id: id ? decodeURIComponent(id) : null, extra: extra ? decodeURIComponent(extra) : null };
  }

  async function recarregarNav() {
    [modulos, dashboards] = await Promise.all([Api.get("/api/modulos"), Api.get("/api/dashboards")]);
    renderNav();
  }

  function renderNav() {
    const rota = rotaAtual();
    $("nav-dashboards").innerHTML = dashboards.length
      ? dashboards.map((d) => {
          // 🔒 só meu · 👥 da equipe (com o dono no título, se não for meu)
          const meu = d.dono_id === usuario?.id;
          const marca = d.visibilidade === "privado" ? "🔒" : "👥";
          const dica = d.visibilidade === "privado" ? "Só você vê" : meu ? "Compartilhado com a equipe" : `Da equipe, criado por ${d.dono_nome || "outra pessoa"}`;
          return `<a class="nav-item ${rota.tipo === "d" && rota.id === String(d.id) ? "active" : ""}" href="#/d/${d.id}" title="${esc(dica)}">
            <span>${esc(d.nome)}</span><span class="nav-marca" aria-label="${esc(dica)}">${marca}</span></a>`;
        }).join("")
      : '<div class="nav-empty">Nenhum dashboard</div>';
    const visiveis = modulosVisiveis();
    $("nav-modulos").innerHTML = visiveis.length
      ? visiveis.map((m) => `<a class="nav-item ${rota.tipo === "m" && rota.id === m.slug ? "active" : ""}" href="#/m/${encodeURIComponent(m.slug)}">
          <span>${esc(m.nome)}</span><span class="count">${m.total}</span></a>`).join("")
      : `<div class="nav-empty">${modulos.length ? '<a href="#/config/modulos">Todos desligados: ligue em Configurações</a>' : "Nenhum módulo"}</div>`;
    $("link-config").classList.toggle("active", rota.tipo === "config");
  }

  function mostrar(view) {
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === view));
  }

  function rotaPadrao() {
    if (!modulos.length) return "#/inicio";
    if (dashboards.length) return `#/d/${dashboards[0].id}`;
    const primeiro = modulosVisiveis()[0] || modulos[0];
    return `#/m/${encodeURIComponent(primeiro.slug)}`;
  }

  function ir(hash) {
    if (location.hash === hash) rotear();
    else location.hash = hash;
  }

  const irPadrao = () => ir(rotaPadrao());

  async function rotear() {
    const { tipo, id, extra } = rotaAtual();
    // Navegar entre notas do mesmo caderno não recarrega a lista.
    const jaNasNotas = $("view-notas").classList.contains("active");
    renderNav();
    try {
      await Notas.gravarAgora(); // uma nota com edição pendente é gravada antes de sair
      // Link para um dashboard que não está na lista (ex.: alguém acabou de
      // compartilhar): busca a lista de novo uma vez antes de desistir.
      if (tipo === "d" && !dashboards.some((d) => String(d.id) === id)) await recarregarNav();
      if (tipo === "d" && dashboards.some((d) => String(d.id) === id)) {
        mostrar("view-dashboard");
        await Dashboards.abrir(Number(id));
      } else if (tipo === "m" && modulo(id)) {
        if (modulo(id).schema.visao?.tipo === "notas") {
          mostrar("view-notas");
          await Notas.abrir(id, extra, jaNasNotas);
        } else {
          mostrar("view-modulo");
          await Modulos.abrir(id);
        }
      } else if (tipo === "config") {
        mostrar("view-config");
        await Config.abrir(id);
      } else if (tipo === "admin" && usuario?.admin) {
        mostrar("view-admin");
        await Admin.abrir(usuario.id);
      } else if (!modulos.length) {
        mostrar("view-vazio");
      } else {
        location.replace(rotaPadrao());
      }
    } catch (e) {
      Util.aviso(e.message, "erro");
    }
  }

  function aplicarPrivacidade(ligado) {
    document.body.classList.toggle("privado", ligado);
    const btn = $("btn-privacidade");
    btn.setAttribute("aria-pressed", String(ligado));
    btn.textContent = ligado ? "Mostrar valores" : "Ocultar valores";
    Util.storage("dashzon.privado", ligado ? "1" : "0");
  }

  // Botão "×" no topo de cada modal que pode ser fechado (os com data-fixo,
  // como a troca obrigatória de senha, não ganham).
  function botoesFecharModais() {
    document.querySelectorAll(".modal-overlay:not([data-fixo]) > .modal").forEach((modal) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "icon-btn modal-fechar";
      b.setAttribute("aria-label", "Fechar");
      b.title = "Fechar";
      b.textContent = "×";
      b.addEventListener("click", () => modal.parentElement.classList.remove("open"));
      modal.prepend(b);
    });
  }

  function ligarComportamentosGlobais() {
    Ajuda.init();
    botoesFecharModais();
    document.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", () => Util.fecharModal(b.dataset.fechar)));
    // Modais com data-fixo (troca de senha obrigatória) não fecham por fora nem com Esc.
    document.querySelectorAll(".modal-overlay:not([data-fixo])").forEach((o) => o.addEventListener("mousedown", (e) => {
      if (e.target === o) o.classList.remove("open");
    }));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") document.querySelectorAll(".modal-overlay.open:not([data-fixo])").forEach((o) => o.classList.remove("open"));
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
    document.querySelectorAll('[data-acao="novo-dashboard"]').forEach((b) => b.addEventListener("click", () => Dashboards.abrirNovo()));
    $("btn-novo-dashboard").addEventListener("click", () => Dashboards.abrirNovo());
    $("btn-sair").addEventListener("click", Login.sair);

    $("btn-privacidade").addEventListener("click", () => aplicarPrivacidade(!document.body.classList.contains("privado")));
    window.addEventListener("unhandledrejection", (e) => Util.aviso(e.reason?.message || "Erro inesperado", "erro"));
    ligarMenuMovel();
  }

  // Celular: o menu lateral vira uma gaveta aberta pelo botão ☰ (no computador
  // o botão fica escondido e o menu sempre à vista). Fecha ao navegar, ao
  // escolher qualquer item e com Esc.
  function ligarMenuMovel() {
    const app = $("app");
    const btn = $("btn-menu");
    const definir = (aberto) => {
      app.classList.toggle("menu-aberto", aberto);
      btn.setAttribute("aria-expanded", String(aberto));
      btn.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
    };
    btn.addEventListener("click", () => definir(!app.classList.contains("menu-aberto")));
    window.addEventListener("hashchange", () => definir(false));
    $("menu-movel").addEventListener("click", (e) => { if (e.target.closest("a, button")) definir(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && app.classList.contains("menu-aberto")) { definir(false); btn.focus(); } });
  }

  // ------------------------------------------------------ usuário ----
  let usuario = null;

  // Nome no rodapé e o link "Painel do adm" (só para administradores).
  function atualizarUsuario(u) {
    usuario = u;
    $("usuario-nome").textContent = u.nome || u.login;
    $("link-admin").hidden = !u.admin;
  }

  async function iniciarApp() {
    let status = await Api.get("/api/status");
    // Entrou com senha temporária: cria a própria antes de qualquer outra coisa.
    if (status.usuario.deve_trocar_senha) {
      await Conta.trocaObrigatoria(status.usuario);
      status = await Api.get("/api/status");
    }

    // Preferências da conta: tema (o botão sol/lua passa a salvar na conta),
    // valores ocultos ao entrar e página inicial.
    const prefs = status.usuario.preferencias;
    Tema.aplicar(prefs.tema);
    Fonte.aplicar(prefs.fonte);
    Tema.definirCallback(Conta.salvarTema);
    if (prefs.privacidade) aplicarPrivacidade(true);
    if (!location.hash && prefs.pagina_inicial) history.replaceState(null, "", prefs.pagina_inicial);
    document.body.classList.add("logado");

    Util.setMoeda(status.moeda);
    // Nome da organização é opcional: sem ele, só "DashZon".
    $("org-nome").textContent = status.org_name || "";
    $("org-nome").hidden = !status.org_name;
    document.title = status.org_name ? `DashZon · ${status.org_name}` : "DashZon";
    atualizarUsuario(status.usuario);
    $("app").classList.add("ready");

    Dashboards.init();
    Modulos.init();
    Conta.init(status);
    Admin.init();

    await recarregarNav();
    window.addEventListener("hashchange", rotear);
    await rotear();
  }

  async function boot() {
    ligarComportamentosGlobais();
    Tema.init();
    Fonte.init();
    aplicarPrivacidade(Util.storage("dashzon.privado") === "1");
    if (Conta.paginaLink()) return; // aberto por um link de e-mail/redefinição
    const status = await Api.get("/api/status");
    if (!status.configured) await Setup.iniciar(iniciarApp);
    else if (!status.usuario) Login.iniciar(status, iniciarApp);
    else await iniciarApp();
  }

  document.addEventListener("DOMContentLoaded", boot);

  return { modulo, modulos: () => modulos, modulosVisiveis, dashboards: () => dashboards, usuario: () => usuario, recarregarNav, ir, irPadrao, atualizarUsuario };
})();
