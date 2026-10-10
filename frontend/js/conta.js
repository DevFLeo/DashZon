// Conta do próprio usuário (abas Conta, Aparência e Segurança da página de
// Configurações: dados, preferências e senha), a troca obrigatória
// depois de uma senha temporária, e as telas abertas pelos links de e-mail
// (#/redefinir/<token> e #/verificar-email/<token>).
const Conta = (() => {
  const $ = (id) => document.getElementById(id);
  let eu = null;
  let emailConfigurado = false;

  function erro(id, msg) {
    $(id).textContent = msg;
    $(id).hidden = !msg;
  }

  // ------------------------------------------------------ minha conta ----
  function preencher() {
    $("conta-nome").value = eu.nome || "";
    $("conta-email").value = eu.email || "";
    $("conta-documento").value = "";
    $("conta-documento").placeholder = eu.documento ? "Deixe em branco para manter" : "Somente números ou com pontuação";
    $("conta-documento-atual").textContent = eu.documento ? `Cadastrado: ${eu.documento}` : "";
    $("conta-email-selo").textContent = eu.email ? (eu.email_verificado ? "· confirmado" : "· não confirmado") : "";
    $("conta-email-selo").className = `selo ${eu.email_verificado ? "selo-ok" : "selo-pendente"}`;
    $("conta-verificar").hidden = !(eu.email && !eu.email_verificado && emailConfigurado);
    $("conta-info").textContent = [
      `Login: ${eu.login}`,
      eu.cargo ? `Cargo: ${eu.cargo}` : "",
      eu.admin ? "Administrador" : "Usuário"
    ].filter(Boolean).join(" · ");
    $("senha-usuario").value = eu.login;
    preencherPreferencias();
  }

  // ------------------------------------------------------ preferências ----
  function opcoesPaginaInicial() {
    const esc = Util.escapeHtml;
    const grupo = (rotulo, itens) => (itens.length ? `<optgroup label="${rotulo}">${itens.join("")}</optgroup>` : "");
    const dashboards = App.dashboards().map((d) => `<option value="#/d/${d.id}">${esc(d.nome)}</option>`);
    const modulos = App.modulosVisiveis().map((m) => `<option value="#/m/${esc(m.slug)}">${esc(m.nome)}</option>`);
    return '<option value="">Padrão (primeiro dashboard)</option>' +
      grupo("Dashboards", dashboards) + grupo("Módulos", modulos) +
      (eu.admin ? '<option value="#/admin">Painel do adm</option>' : "");
  }

  function preencherPreferencias() {
    const p = eu.preferencias;
    $("pref-tema").value = p.tema;
    $("pref-fonte").innerHTML = Object.entries(Fonte.FONTES).map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    $("pref-fonte").value = p.fonte;
    mostrarAmostraFonte();
    $("pref-inicial").innerHTML = opcoesPaginaInicial();
    // Página que não existe mais (dashboard excluído): mostra "Padrão".
    $("pref-inicial").value = [...$("pref-inicial").options].some((o) => o.value === p.pagina_inicial) ? p.pagina_inicial : "";
    $("pref-privacidade").checked = p.privacidade;
    const quando = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
    $("conta-acessos").textContent = `Último acesso: ${quando(eu.ultimo_login_em)} · Conta criada em ${quando(eu.criado_em)}. ` +
      "Se você entrou num computador que não é seu, use o botão abaixo.";
  }

  async function salvarPreferencias(ev) {
    ev.preventDefault();
    erro("pref-erro", "");
    try {
      eu = await Api.put("/api/eu/preferencias", {
        tema: $("pref-tema").value,
        fonte: $("pref-fonte").value,
        pagina_inicial: $("pref-inicial").value,
        privacidade: $("pref-privacidade").checked
      });
      Tema.aplicar(eu.preferencias.tema);
      Fonte.aplicar(eu.preferencias.fonte);
      App.atualizarUsuario(eu);
      Util.aviso("Aparência salva");
    } catch (e) { erro("pref-erro", e.message); }
  }

  // A amostra mostra a fonte escolhida antes de salvar (sem mudar a tela toda).
  function mostrarAmostraFonte() {
    $("pref-fonte-amostra").dataset.fonte = $("pref-fonte").value;
  }

  // Chamado pelo botão de tema (sol/lua): guarda a escolha na conta.
  async function salvarTema(tema) {
    try {
      eu = await Api.put("/api/eu/preferencias", { tema });
    } catch (_) { /* o tema já foi aplicado neste navegador; só não sincronizou */ }
  }

  async function sairOutros() {
    if (!confirm("Desconectar sua conta de todos os outros navegadores e computadores? Este aqui continua conectado.")) return;
    try {
      const r = await Api.post("/api/eu/sair-outros", {});
      Util.aviso(r.mensagem);
    } catch (e) { Util.aviso(e.message, "erro"); }
  }

  // Preenche as abas Conta, Aparência e Segurança (chamado pela página de Configurações).
  async function abrir() {
    eu = await Api.get("/api/eu");
    preencher();
    $("form-senha").reset();
    erro("conta-erro", "");
    erro("senha-erro", "");
    erro("pref-erro", "");
    return eu;
  }

  async function salvarDados(ev) {
    ev.preventDefault();
    erro("conta-erro", "");
    const dados = { nome: $("conta-nome").value.trim(), email: $("conta-email").value.trim() };
    if ($("conta-documento").value.trim()) dados.documento = $("conta-documento").value.trim();
    try {
      eu = await Api.put("/api/eu", dados);
      preencher();
      App.atualizarUsuario(eu);
      Util.aviso("Dados salvos");
    } catch (e) { erro("conta-erro", e.message); }
  }

  async function pedirVerificacao() {
    try {
      const r = await Api.post("/api/eu/verificar-email", {});
      Util.aviso(r.mensagem);
    } catch (e) { erro("conta-erro", e.message); }
  }

  async function trocarSenha(ev) {
    ev.preventDefault();
    erro("senha-erro", "");
    if ($("senha-nova").value !== $("senha-confirmar").value) { erro("senha-erro", "As senhas novas não conferem."); return; }
    try {
      await Api.put("/api/eu/senha", { senha_atual: $("senha-atual").value, senha_nova: $("senha-nova").value });
      $("form-senha").reset();
      Util.aviso("Senha trocada. Outras sessões abertas com a senha antiga foram encerradas.");
    } catch (e) { erro("senha-erro", e.message); }
  }

  // ------------------------------------------ troca obrigatória de senha ----
  // Promise resolvida quando a pessoa define a senha própria.
  function trocaObrigatoria(usuario) {
    return new Promise((resolve) => {
      $("troca-usuario").value = usuario.login;
      $("form-troca-obrigatoria").reset();
      erro("troca-erro", "");
      $("form-troca-obrigatoria").onsubmit = async (ev) => {
        ev.preventDefault();
        erro("troca-erro", "");
        if ($("troca-nova").value !== $("troca-confirmar").value) { erro("troca-erro", "As senhas novas não conferem."); return; }
        try {
          await Api.put("/api/eu/senha", { senha_atual: $("troca-atual").value, senha_nova: $("troca-nova").value });
          Util.fecharModal("modal-troca-obrigatoria");
          Util.aviso("Senha criada");
          resolve();
        } catch (e) { erro("troca-erro", e.message); }
      };
      Util.abrirModal("modal-troca-obrigatoria");
      $("troca-atual").focus();
    });
  }

  // ---------------------------------------------------- telas de link ----
  // Devolve true se o endereço é um link de e-mail (e já cuidou dele).
  function paginaLink() {
    const m = location.hash.match(/^#\/(redefinir|verificar-email)\/([\w-]+)$/);
    if (!m) return false;
    const [, tipo, token] = m;
    const redefinir = tipo === "redefinir";

    $("link-titulo").textContent = redefinir ? "Criar uma senha nova" : "Confirmar e-mail";
    $("link-texto").textContent = redefinir ? "Escolha a sua nova senha." : "Clique para confirmar o seu e-mail.";
    $("link-campos").hidden = !redefinir;
    $("link-senha").required = redefinir;
    $("link-enviar").textContent = redefinir ? "Salvar senha nova" : "Confirmar e-mail";
    $("link-voltar").hidden = true;

    $("form-link").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      erro("link-erro", "");
      try {
        let r;
        if (redefinir) {
          if ($("link-senha").value !== $("link-confirmar").value) { erro("link-erro", "As senhas não conferem."); return; }
          r = await Api.post("/api/senha/redefinir", { token, senha: $("link-senha").value });
        } else {
          r = await Api.post("/api/email/verificar", { token });
        }
        $("link-texto").textContent = r.mensagem;
        $("link-campos").hidden = true;
        $("link-enviar").hidden = true;
        $("link-voltar").hidden = false;
        // Tira o token da barra de endereço (e do histórico).
        history.replaceState(null, "", "/");
      } catch (e) { erro("link-erro", e.message); }
    });
    $("pagina-link").classList.add("open");
    return true;
  }

  function init(status) {
    emailConfigurado = Boolean(status.email_configurado);
    $("form-conta").addEventListener("submit", salvarDados);
    $("conta-verificar").addEventListener("click", pedirVerificacao);
    $("form-senha").addEventListener("submit", trocarSenha);
    $("form-preferencias").addEventListener("submit", salvarPreferencias);
    $("pref-fonte").addEventListener("change", mostrarAmostraFonte);
    $("conta-sair-outros").addEventListener("click", sairOutros);
    $("troca-sair").addEventListener("click", Login.sair);
  }

  return { init, abrir, trocaObrigatoria, paginaLink, salvarTema };
})();
