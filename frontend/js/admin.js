// Painel do administrador (#/admin): regras de cadastro, organização e
// usuários (criar, editar, ativar/desativar, senha temporária, link de
// redefinição, confirmar e-mail, excluir). Só aparece para administradores;
// o backend barra /api/admin/* para os demais de qualquer forma.
const Admin = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  let ajustes = null;
  let usuarios = [];
  let editando = null;
  let euId = null;

  function erro(id, msg) {
    $(id).textContent = msg;
    $(id).hidden = !msg;
  }

  // ------------------------------------------------------------ tela ----
  async function abrir(meuId) {
    euId = meuId;
    [ajustes, usuarios] = await Promise.all([Api.get("/api/admin/ajustes"), Api.get("/api/admin/usuarios")]);
    $("aj-documento").value = ajustes.exigir_documento;
    $("aj-email").checked = ajustes.exigir_email === "1";
    $("aj-email-verificado").checked = ajustes.exigir_email_verificado === "1";
    $("aj-smtp").textContent = ajustes.email_configurado
      ? "Envio de e-mail configurado: links de confirmação e de senha vão por e-mail."
      : "Envio de e-mail NÃO configurado: confirme e-mails aqui e mande os links de senha por outro canal (veja DASHZON_SMTP_* no README).";
    $("org-nome-input").value = ajustes.org_name || "";
    $("org-moeda").value = ajustes.moeda || "BRL";
    $("u-cargos").innerHTML = ajustes.cargos_sugeridos.map((c) => `<option value="${esc(c)}">`).join("");
    erro("aj-erro", "");
    erro("org-erro", "");
    renderUsuarios();
  }

  function renderUsuarios() {
    const linhas = usuarios.map((u) => {
      const email = u.email
        ? `${esc(u.email)} <span class="selo ${u.email_verificado ? "selo-ok" : "selo-pendente"}">${u.email_verificado ? "confirmado" : "pendente"}</span>`
        : '<span class="hint">—</span>';
      const status = [
        u.ativo ? "" : '<span class="chip chip-saida">desativado</span>',
        u.deve_trocar_senha ? '<span class="chip">senha temporária</span>' : ""
      ].join(" ");
      const eu = u.id === euId;
      return `<tr>
        <td><strong>${esc(u.nome || u.login)}</strong>${eu ? ' <span class="hint">(você)</span>' : ""}<div class="hint">${esc(u.login)}</div></td>
        <td>${esc(u.cargo) || '<span class="hint">—</span>'}</td>
        <td>${u.admin ? '<span class="chip chip-entrada">Administrador</span>' : "Usuário"}</td>
        <td>${email}</td>
        <td>${u.documento ? `<span class="nowrap">${esc(u.documento_tipo.toUpperCase())} ${esc(u.documento)}</span>` : '<span class="hint">—</span>'}</td>
        <td>${status}</td>
        <td><div class="row-actions">
          <button class="btn btn-sm" data-acao="editar" data-id="${u.id}">Editar</button>
          <select class="acoes-usuario" data-id="${u.id}" aria-label="Mais ações para ${esc(u.login)}">
            <option value="">Mais…</option>
            <option value="senha-temporaria">Gerar senha temporária</option>
            <option value="link-redefinicao">Gerar link de redefinição de senha</option>
            ${u.email && !u.email_verificado ? '<option value="confirmar-email">Marcar e-mail como confirmado</option>' : ""}
            ${u.email && u.email_verificado ? '<option value="desconfirmar-email">Marcar e-mail como NÃO confirmado</option>' : ""}
            ${u.email && !u.email_verificado && ajustes.email_configurado ? '<option value="enviar-verificacao">Enviar confirmação por e-mail</option>' : ""}
            ${eu ? "" : `<option value="${u.ativo ? "desativar" : "ativar"}">${u.ativo ? "Desativar acesso" : "Reativar acesso"}</option>`}
            ${eu ? "" : '<option value="excluir">Excluir usuário</option>'}
          </select>
        </div></td>
      </tr>`;
    }).join("");

    $("admin-usuarios").innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr><th>Nome / login</th><th>Cargo</th><th>Perfil</th><th>E-mail</th><th>Documento</th><th>Situação</th><th></th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`;
    $("admin-usuarios").querySelectorAll('[data-acao="editar"]').forEach((b) => b.addEventListener("click", () => {
      abrirFormulario(usuarios.find((u) => String(u.id) === b.dataset.id));
    }));
    $("admin-usuarios").querySelectorAll(".acoes-usuario").forEach((s) => s.addEventListener("change", () => {
      const acao = s.value;
      s.value = "";
      if (acao) executar(acao, usuarios.find((u) => String(u.id) === s.dataset.id));
    }));
  }

  async function recarregar() {
    usuarios = await Api.get("/api/admin/usuarios");
    renderUsuarios();
  }

  function mostrarSegredo(titulo, texto, valor) {
    $("segredo-titulo").textContent = titulo;
    $("segredo-texto").textContent = texto;
    $("segredo-valor").textContent = valor;
    Util.abrirModal("modal-segredo");
  }

  async function executar(acao, u) {
    const nome = u.nome || u.login;
    try {
      switch (acao) {
        case "senha-temporaria": {
          if (!confirm(`Gerar uma senha temporária para ${nome}? A senha atual deixa de valer e as sessões dele(a) são encerradas.`)) return;
          const r = await Api.post(`/api/admin/usuarios/${u.id}/senha-temporaria`, {});
          mostrarSegredo(`Senha temporária de ${nome}`, `Login: ${u.login}. No primeiro acesso, ${nome} vai criar a própria senha.`, r.senha_temporaria);
          break;
        }
        case "link-redefinicao": {
          const r = await Api.post(`/api/admin/usuarios/${u.id}/link-redefinicao`, {});
          mostrarSegredo(`Link de redefinição de ${nome}`,
            `${r.enviado ? `Também enviado para ${u.email}. ` : ""}Vale por 24 horas e só pode ser usado uma vez. A senha atual continua valendo até ser trocada.`,
            r.link);
          break;
        }
        case "confirmar-email":
        case "desconfirmar-email":
          await Api.post(`/api/admin/usuarios/${u.id}/email-verificado`, { verificado: acao === "confirmar-email" });
          Util.aviso("E-mail atualizado");
          break;
        case "enviar-verificacao": {
          const r = await Api.post(`/api/admin/usuarios/${u.id}/enviar-verificacao`, {});
          Util.aviso(r.mensagem);
          break;
        }
        case "desativar":
        case "ativar":
          if (acao === "desativar" && !confirm(`Desativar o acesso de ${nome}? Ele(a) é desconectado(a) na hora. Os dados continuam.`)) return;
          await Api.post(`/api/admin/usuarios/${u.id}/ativo`, { ativo: acao === "ativar" });
          Util.aviso(acao === "ativar" ? "Acesso reativado" : "Acesso desativado");
          break;
        case "excluir":
          if (!confirm(`Excluir ${nome} (${u.login})? Isso não pode ser desfeito. Para só bloquear o acesso, use "Desativar".`)) return;
          await Api.del(`/api/admin/usuarios/${u.id}`);
          Util.aviso("Usuário excluído");
          break;
        default:
          return;
      }
      await recarregar();
    } catch (e) {
      Util.aviso(e.message, "erro");
    }
  }

  // ------------------------------------------------------- formulário ----
  function rotulosObrigatorios() {
    const doc = { nao: "CPF ou CNPJ", cpf: "CPF", cnpj: "CNPJ", qualquer: "CPF ou CNPJ" }[ajustes.exigir_documento];
    $("u-documento-label").textContent = doc;
    $("u-documento-label").classList.toggle("obrigatorio", ajustes.exigir_documento !== "nao");
    $("u-email-label").classList.toggle("obrigatorio", ajustes.exigir_email === "1");
  }

  function abrirFormulario(u = null) {
    editando = u;
    $("form-usuario").reset();
    rotulosObrigatorios();
    $("usuario-titulo").textContent = u ? `Editar ${u.nome || u.login}` : "Novo usuário";
    $("usuario-salvar").textContent = u ? "Salvar" : "Criar usuário";
    $("u-senha-wrap").hidden = Boolean(u);
    if (u) {
      $("u-nome").value = u.nome || "";
      $("u-login").value = u.login;
      $("u-email").value = u.email || "";
      $("u-cargo").value = u.cargo || "";
      $("u-perfil").value = u.perfil;
      $("u-perfil").disabled = u.id === euId; // não rebaixa a si mesmo
      $("u-documento").placeholder = u.documento ? "Deixe em branco para manter" : "";
      $("u-documento-atual").textContent = u.documento ? `Cadastrado: ${u.documento_tipo.toUpperCase()} ${u.documento}` : "";
    } else {
      $("u-perfil").disabled = false;
      $("u-documento").placeholder = "";
      $("u-documento-atual").textContent = "";
    }
    erro("usuario-erro", "");
    Util.abrirModal("modal-usuario");
    $("u-nome").focus();
  }

  async function salvar(ev) {
    ev.preventDefault();
    erro("usuario-erro", "");
    const dados = {
      nome: $("u-nome").value.trim(),
      login: $("u-login").value.trim(),
      email: $("u-email").value.trim(),
      cargo: $("u-cargo").value.trim(),
      perfil: $("u-perfil").value
    };
    if ($("u-documento").value.trim()) dados.documento = $("u-documento").value.trim();
    else if (!editando) dados.documento = "";
    if (editando && editando.id === euId) delete dados.perfil;

    try {
      if (editando) {
        await Api.put(`/api/admin/usuarios/${editando.id}`, dados);
        Util.fecharModal("modal-usuario");
        Util.aviso("Usuário atualizado");
        if (editando.id === euId) App.atualizarUsuario(await Api.get("/api/eu"));
      } else {
        if ($("u-senha").value) dados.senha = $("u-senha").value;
        const r = await Api.post("/api/admin/usuarios", dados);
        Util.fecharModal("modal-usuario");
        if (r.senha_temporaria) {
          mostrarSegredo(`Senha temporária de ${dados.nome}`,
            `Usuário criado. Login: ${dados.login}. No primeiro acesso, ${dados.nome} vai criar a própria senha.`, r.senha_temporaria);
        } else {
          Util.aviso("Usuário criado. No primeiro acesso ele(a) vai trocar a senha.");
        }
      }
      await recarregar();
    } catch (e) { erro("usuario-erro", e.message); }
  }

  async function salvarAjustes(ev) {
    ev.preventDefault();
    erro("aj-erro", "");
    try {
      const r = await Api.put("/api/admin/ajustes", {
        exigir_documento: $("aj-documento").value,
        exigir_email: $("aj-email").checked,
        exigir_email_verificado: $("aj-email-verificado").checked
      });
      Object.assign(ajustes, r);
      $("aj-email").checked = r.exigir_email === "1"; // confirmar e-mail liga "e-mail obrigatório"
      Util.aviso("Regras salvas");
    } catch (e) { erro("aj-erro", e.message); }
  }

  async function salvarOrg(ev) {
    ev.preventDefault();
    erro("org-erro", "");
    try {
      await Api.put("/api/admin/config", { org_name: $("org-nome-input").value.trim(), moeda: $("org-moeda").value });
      location.reload(); // reaplica nome e moeda em todas as telas
    } catch (e) { erro("org-erro", e.message); }
  }

  function init() {
    $("btn-novo-usuario").addEventListener("click", () => abrirFormulario());
    $("form-usuario").addEventListener("submit", salvar);
    $("form-ajustes").addEventListener("submit", salvarAjustes);
    $("form-org").addEventListener("submit", salvarOrg);
    $("segredo-copiar").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("segredo-valor").textContent);
        Util.aviso("Copiado");
      } catch (_) {
        // Sem permissão de área de transferência (ex.: HTTP fora do localhost): seleciona para Ctrl+C.
        const r = document.createRange();
        r.selectNodeContents($("segredo-valor"));
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        Util.aviso("Selecionado: use Ctrl+C");
      }
    });
  }

  return { init, abrir };
})();
