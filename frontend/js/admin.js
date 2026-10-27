// Painel do administrador (#/admin): regras de cadastro, organização e
// usuários (criar, editar, ativar/desativar, senha temporária, link de
// redefinição, confirmar e-mail, excluir), equipes (grupos de usuários, que
// podem ser empresa) e o menu "Criar" (usuário, equipe, lote de produção,
// empresa de teste). Só aparece para administradores;
// o backend barra /api/admin/* para os demais de qualquer forma.
const Admin = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  let ajustes = null;
  let usuarios = [];
  let equipes = [];
  let editando = null;
  let editandoEquipe = null;
  let euId = null;

  function erro(id, msg) {
    $(id).textContent = msg;
    $(id).hidden = !msg;
  }

  // ------------------------------------------------------------ tela ----
  async function abrir(meuId) {
    euId = meuId;
    [ajustes, usuarios, equipes] = await Promise.all([Api.get("/api/admin/ajustes"), Api.get("/api/admin/usuarios"), Api.get("/api/admin/equipes")]);
    $("aj-documento").value = ajustes.exigir_documento;
    $("aj-email").checked = ajustes.exigir_email === "1";
    $("aj-email-verificado").checked = ajustes.exigir_email_verificado === "1";
    $("aj-smtp").textContent = ajustes.email_configurado
      ? "Envio de e-mail configurado: links de confirmação e de senha vão por e-mail."
      : "Envio de e-mail NÃO configurado: confirme e-mails aqui e mande os links de senha por outro canal (veja DASHZON_SMTP_* no README).";
    $("org-nome-input").value = ajustes.org_name || "";
    $("org-moeda").value = ajustes.moeda || "BRL";
    $("u-cargos").innerHTML = ajustes.cargos_sugeridos.map((c) => `<option value="${esc(c)}">`).join("");
    preencherRegrasSenha();
    erro("aj-erro", "");
    erro("org-erro", "");
    erro("rs-erro", "");
    renderEquipes();
    renderUsuarios();
    renderModulos();
    await carregarSeguranca();
  }

  // Módulos e quem vê (relatório, problema 2): os antigos ficaram "todos";
  // daqui o admin muda cada um sem abrir módulo por módulo.
  function renderModulos() {
    const mods = App.modulos();
    if (!mods.length) { $("admin-modulos").innerHTML = '<p class="hint">Nenhum módulo.</p>'; return; }
    const quem = (m) => Compartilhar.descrever(m.visibilidade === "todos" ? "equipe" : m.visibilidade, m.equipes);
    $("admin-modulos").innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr><th>Módulo</th><th>Dono</th><th>Quem vê</th><th></th></tr></thead><tbody>${mods.map((m) => `<tr>
        <td><a href="#/m/${encodeURIComponent(m.slug)}">${esc(m.nome)}</a></td><td>${esc(m.dono_nome || "—")}</td>
        <td>${m.visibilidade === "todos" ? '<span class="chip chip-teste">Todos</span>' : esc(quem(m))}</td>
        <td>${m.editavel ? `<button class="btn btn-sm" data-mod-comp="${esc(m.slug)}">Compartilhar</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
    $("admin-modulos").querySelectorAll("[data-mod-comp]").forEach((b) => b.addEventListener("click", () => {
      const m = App.modulo(b.dataset.modComp);
      Compartilhar.abrir({
        tipo: "modulo", titulo: `Quem vê "${m.nome}"`, atual: m,
        onSalvar: async (corpo) => {
          await Api.put(`/api/modulos/${encodeURIComponent(m.slug)}/compartilhar`, corpo);
          await App.recarregarNav();
          renderModulos();
        }
      });
    }));
  }

  // ------------------------------------------------------- menu Criar ----
  function abrirMenuCriar(abrir) {
    $("menu-criar").hidden = !abrir;
    $("btn-criar").setAttribute("aria-expanded", String(abrir));
    if (abrir) $("menu-criar").querySelector("button")?.focus();
  }

  // Já instalado (algum dashboard usa o módulo do lote): abre o existente em
  // vez de criar mais um "Produção" (relatório, problema 7).
  async function criarLote() {
    const modulo = App.modulos().find((m) => m.template_origem === "lote-producao");
    const existente = modulo && App.dashboards().find((d) => (d.modulos || []).includes(modulo.slug));
    if (existente) {
      Util.aviso(`O lote de produção já está instalado: abrindo "${existente.nome}".`);
      App.ir(`#/d/${existente.id}`);
      return;
    }
    if (!confirm('Instalar o módulo "Lotes de produção" e o dashboard "Produção" (com 8 lotes de exemplo)?\n' +
      "Ele nasce só seu; em seguida você escolhe quem vê (equipes ou todos).")) return;
    try {
      // Privado primeiro: o que o admin cria não aparece para todos sem ele escolher (problema 2).
      const r = await Api.post("/api/templates/instalar", { template_id: "lote-producao", com_exemplos: true, visibilidade: "privado" });
      Util.aviso(Util.resumoInstalacao(r));
      await App.recarregarNav();
      if (r.dashboards?.length) {
        App.ir(`#/d/${r.dashboards[0]}`);
        setTimeout(() => Dashboards.compartilhar(), 600);
      }
    } catch (e) { Util.aviso(e.message, "erro"); }
  }

  async function criarEmpresaTeste() {
    try {
      const e = await Api.post("/api/admin/equipes/teste", {});
      Util.aviso(`"${e.nome}" criada (CNPJ fictício ${e.cnpj}). Exclua quando não precisar mais.`);
      await recarregar();
    } catch (er) { Util.aviso(er.message, "erro"); }
  }

  // ------------------------------------------------------------ equipes ----
  function renderEquipes() {
    if (!equipes.length) {
      $("admin-equipes").innerHTML = '<div class="empty-state empty-state-baixo">Nenhuma equipe ainda. Use <strong>Criar ▾ → Equipe</strong>.</div>';
      return;
    }
    const linhas = equipes.map((e) => {
      const selos = [e.empresa ? '<span class="chip">Empresa</span>' : "", e.teste ? '<span class="chip chip-teste">Teste</span>' : ""].join(" ");
      const membros = e.membros.length
        ? e.membros.map((m) => `<span class="chip">${esc(m.nome)}</span>`).join(" ")
        : '<span class="hint">Nenhum membro</span>';
      return `<tr>
        <td><strong>${esc(e.nome)}</strong> ${selos}${e.descricao ? `<div class="hint">${esc(e.descricao)}</div>` : ""}</td>
        <td>${e.cnpj ? `<span class="nowrap">CNPJ ${esc(e.cnpj)}</span>` : e.empresa ? '<span class="hint">sem CNPJ</span>' : '<span class="hint">—</span>'}</td>
        <td class="membros">${membros}</td>
        <td><div class="row-actions">
          <button class="btn btn-sm" data-eq-editar="${e.id}">Editar</button>
          <button class="btn btn-sm" data-eq-usuario="${e.id}">+ Usuário</button>
          <button class="btn btn-sm btn-danger" data-eq-excluir="${e.id}">Excluir</button>
        </div></td>
      </tr>`;
    }).join("");
    $("admin-equipes").innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr><th>Equipe</th><th>CNPJ</th><th>Membros</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
    const acha = (id) => equipes.find((e) => String(e.id) === id);
    $("admin-equipes").querySelectorAll("[data-eq-editar]").forEach((b) => b.addEventListener("click", () => abrirEquipe(acha(b.dataset.eqEditar))));
    $("admin-equipes").querySelectorAll("[data-eq-usuario]").forEach((b) => b.addEventListener("click", () => abrirFormulario(null, [Number(b.dataset.eqUsuario)])));
    $("admin-equipes").querySelectorAll("[data-eq-excluir]").forEach((b) => b.addEventListener("click", () => excluirEquipe(acha(b.dataset.eqExcluir))));
  }

  // Lista de caixinhas (equipes no cadastro de usuário, membros no de equipe).
  function listaMarcar(alvo, itens, jaMarcados) {
    $(alvo).innerHTML = itens.length
      ? itens.map((i) => `<label class="field-check"><input type="checkbox" value="${i.id}" ${jaMarcados.includes(i.id) ? "checked" : ""}> ${esc(i.rotulo)}</label>`).join("")
      : '<span class="hint">Nenhuma ainda.</span>';
  }
  const marcados = (alvo) => [...document.querySelectorAll(`#${alvo} input:checked`)].map((c) => Number(c.value));

  function atualizarCamposEmpresa() {
    const empresa = $("eq-empresa").checked;
    $("eq-empresa-campos").hidden = !empresa;
    $("eq-cnpj-label").classList.toggle("obrigatorio", empresa && $("eq-exigir-cnpj").checked);
  }

  function abrirEquipe(e = null) {
    editandoEquipe = e;
    $("form-equipe").reset();
    $("equipe-titulo").textContent = e ? `Editar ${e.nome}` : "Nova equipe";
    $("equipe-salvar").textContent = e ? "Salvar" : "Criar equipe";
    $("eq-nome").value = e?.nome || "";
    $("eq-descricao").value = e?.descricao || "";
    $("eq-empresa").checked = Boolean(e?.empresa);
    $("eq-exigir-cnpj").checked = e ? Boolean(e.exigir_cnpj) : true;
    $("eq-cnpj").placeholder = e?.cnpj ? "Deixe em branco para manter" : "00.000.000/0000-00";
    $("eq-cnpj-atual").textContent = e?.cnpj ? `Cadastrado: ${e.cnpj}` : "";
    listaMarcar("eq-membros", usuarios.map((u) => ({ id: u.id, rotulo: `${u.nome || u.login} (${u.login})` })), (e?.membros || []).map((m) => m.id));
    atualizarCamposEmpresa();
    erro("equipe-erro", "");
    Util.abrirModal("modal-equipe");
    $("eq-nome").focus();
  }

  async function salvarEquipe(ev) {
    ev.preventDefault();
    erro("equipe-erro", "");
    const dados = {
      nome: $("eq-nome").value.trim(),
      descricao: $("eq-descricao").value.trim(),
      empresa: $("eq-empresa").checked,
      exigir_cnpj: $("eq-empresa").checked && $("eq-exigir-cnpj").checked
    };
    if ($("eq-cnpj").value.trim()) dados.cnpj = $("eq-cnpj").value.trim();
    else if (!editandoEquipe) dados.cnpj = "";
    try {
      const e = editandoEquipe ? await Api.put(`/api/admin/equipes/${editandoEquipe.id}`, dados) : await Api.post("/api/admin/equipes", dados);
      // Criada: se os membros falharem, salvar de novo edita esta (não cria outra).
      const nova = !editandoEquipe;
      editandoEquipe = e;
      await Api.put(`/api/admin/equipes/${e.id}/membros`, { usuario_ids: marcados("eq-membros") });
      Util.fecharModal("modal-equipe");
      Util.aviso(nova ? "Equipe criada" : "Equipe atualizada");
      await recarregar();
    } catch (er) { erro("equipe-erro", er.message); }
  }

  async function excluirEquipe(e) {
    if (!confirm(`Excluir a equipe "${e.nome}"? As ${e.membros.length} pessoa(s) continuam com as contas; só deixam de estar nesta equipe.`)) return;
    try {
      await Api.del(`/api/admin/equipes/${e.id}`);
      Util.aviso("Equipe excluída");
      await recarregar();
    } catch (er) { Util.aviso(er.message, "erro"); }
  }

  // ------------------------------------------------------------ segurança ----
  const NOMES_EVENTO = {
    login_ok: "Entrou", login_falhou: "Login errado", logout: "Saiu", bloqueio: "Bloqueio",
    desbloqueio: "Desbloqueio", senha_atual_errada: "Senha atual errada", link_invalido: "Link inválido",
    pedido_link: "Pediu link de senha", senha_trocada: "Trocou a senha", senha_redefinida: "Redefiniu a senha",
    sessoes_encerradas: "Saiu dos outros dispositivos", origem_recusada: "Escrita de outro site recusada",
    excesso_requisicoes: "Excesso de requisições",
    // Alterações (relatório, problema 6)
    usuario_criado: "Criou usuário", usuario_alterado: "Alterou usuário", usuario_excluido: "Excluiu usuário",
    usuario_ativo: "Ativou/desativou usuário", senha_temporaria: "Gerou senha temporária", link_redefinicao: "Gerou link de senha",
    email_confirmado: "Confirmou e-mail", equipe_criada: "Criou equipe", empresa_teste_criada: "Criou empresa de teste",
    equipe_alterada: "Alterou equipe", equipe_excluida: "Excluiu equipe", equipe_membros: "Mudou membros da equipe",
    regras_alteradas: "Mudou regras", organizacao_alterada: "Mudou organização", dashboard_criado: "Criou dashboard",
    dashboard_alterado: "Alterou dashboard", dashboard_excluido: "Excluiu dashboard", modulo_criado: "Criou módulo",
    modulo_alterado: "Alterou módulo", modulo_compartilhado: "Compartilhou módulo", modulo_excluido: "Excluiu módulo",
    exemplos_apagados: "Apagou dados de exemplo", template_instalado: "Instalou template", pedido_criado: "Pediu aprovação",
    pedido_aprovado: "Aprovou pedido", pedido_negado: "Negou pedido",
    // Registros (pentest de 26/10/2026, achado 2)
    registro_criado: "Criou registro", registro_alterado: "Alterou registro", registro_excluido: "Excluiu registro"
  };
  const ACESSOS = new Set(["login_ok", "login_falhou", "logout", "bloqueio", "desbloqueio", "senha_atual_errada", "link_invalido",
    "pedido_link", "senha_trocada", "senha_redefinida", "sessoes_encerradas", "origem_recusada", "excesso_requisicoes"]);
  let eventos = [];
  const ALERTA = new Set(["login_falhou", "bloqueio", "senha_atual_errada", "link_invalido", "origem_recusada", "excesso_requisicoes"]);

  async function carregarSeguranca() {
    const s = await Api.get("/api/admin/seguranca");
    $("seg-checagens").innerHTML = s.checagens.map((c) => {
      const classe = c.ok === true ? "ok" : c.ok === false ? "alerta" : "info";
      const sinal = c.ok === true ? Util.icone("certo") : c.ok === false ? "!" : "i";
      return `<li class="checagem ${classe}"><span class="checagem-sinal" aria-hidden="true">${sinal}</span>
        <div><strong>${esc(c.titulo)}</strong><div class="hint">${esc(c.detalhe)}</div></div></li>`;
    }).join("");
    $("seg-limites").textContent = `Bloqueio automático por ${s.limites.janela_minutos} min: ${s.limites.por_ip} falhas do mesmo IP ou ${s.limites.por_conta} contra a mesma conta.`;
    $("seg-bloqueios").innerHTML = s.bloqueios.length
      ? s.bloqueios.map((b) => `<div class="bloqueio">
          <span>${b.tipo === "ip" ? `IP <code>${esc(b.ip)}</code>` : `Conta <strong>${esc(b.login || "(login que não existe)")}</strong>`}</span>
          <button type="button" class="btn btn-sm" data-desbloquear-ip="${esc(b.ip || "")}" data-desbloquear-conta="${esc(b.conta || "")}">Desbloquear</button>
        </div>`).join("")
      : '<p class="hint">Nenhum bloqueio agora.</p>';
    $("seg-bloqueios").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => desbloquear(b)));
    eventos = s.eventos;
    renderEventos();
  }

  // Filtro do diário: tudo, só acessos (login, senha, bloqueio) ou só alterações.
  function renderEventos() {
    const filtro = $("seg-filtro").value;
    const lista = eventos.filter((e) => filtro === "tudo" || (filtro === "acessos") === ACESSOS.has(e.tipo)).slice(0, 150);
    const data = (iso) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
    $("seg-eventos").innerHTML = lista.length
      ? `<div class="table-wrap"><table class="data"><thead><tr><th>Quando</th><th>O quê</th><th>Quem</th><th>IP</th><th>Detalhe</th></tr></thead><tbody>${
        lista.map((e) => `<tr class="${ALERTA.has(e.tipo) ? "evento-alerta" : ""}"><td class="nowrap">${esc(data(e.quando))}</td>
          <td>${esc(NOMES_EVENTO[e.tipo] || e.tipo)}</td><td>${esc(e.login || "—")}</td><td><code>${esc(e.ip || "—")}</code></td>
          <td>${esc(e.detalhe || "")}</td></tr>`).join("")}</tbody></table></div>`
      : '<p class="hint">Nada registrado ainda.</p>';
  }

  async function desbloquear(botao) {
    botao.disabled = true;
    try {
      await Api.post("/api/admin/seguranca/desbloquear", { ip: botao.dataset.desbloquearIp, conta: botao.dataset.desbloquearConta });
      Util.aviso("Desbloqueado");
      await carregarSeguranca();
    } catch (e) {
      botao.disabled = false;
      Util.aviso(e.message, "erro");
    }
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
        <td>${u.admin ? '<span class="chip chip-entrada">Administrador</span>' : u.perfil === "visualizador" ? '<span class="chip">Visualizador</span>' : "Usuário"}</td>
        <td>${email}</td>
        <td>${u.documento ? `<span class="nowrap">${esc(u.documento_tipo.toUpperCase())} ${esc(u.documento)}</span>` : '<span class="hint">—</span>'}</td>
        <td>${u.equipes?.length ? u.equipes.map((e) => `<span class="chip${e.teste ? " chip-teste" : ""}">${esc(e.nome)}</span>`).join(" ") : '<span class="hint">Nenhuma</span>'}</td>
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
      <thead><tr><th>Nome / login</th><th>Cargo</th><th>Perfil</th><th>E-mail</th><th>Documento</th><th>Equipes</th><th>Situação</th><th></th></tr></thead>
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
    [usuarios, equipes] = await Promise.all([Api.get("/api/admin/usuarios"), Api.get("/api/admin/equipes")]);
    renderEquipes();
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

  // `equipesIniciais`: equipes já marcadas (ex.: "+ Usuário" numa equipe).
  function abrirFormulario(u = null, equipesIniciais = []) {
    editando = u;
    $("form-usuario").reset();
    rotulosObrigatorios();
    $("usuario-titulo").textContent = u ? `Editar ${u.nome || u.login}` : "Novo usuário";
    $("usuario-salvar").textContent = u ? "Salvar" : "Criar usuário";
    $("u-senha-wrap").hidden = Boolean(u);
    $("u-trocar").checked = true;
    $("u-trocar-wrap").hidden = true;
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
    listaMarcar("u-equipes", equipes.map((e) => ({ id: e.id, rotulo: e.nome + (e.teste ? " (teste)" : "") })),
      u ? (u.equipes || []).map((e) => e.id) : equipesIniciais);
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
      perfil: $("u-perfil").value,
      equipes: marcados("u-equipes")
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
        if ($("u-senha").value) {
          dados.senha = $("u-senha").value;
          dados.deve_trocar_senha = $("u-trocar").checked; // relatório, problema 5
        }
        const r = await Api.post("/api/admin/usuarios", dados);
        Util.fecharModal("modal-usuario");
        if (r.senha_temporaria) {
          mostrarSegredo(`Senha temporária de ${dados.nome}`,
            `Usuário criado. Login: ${dados.login}. No primeiro acesso, ${dados.nome} vai criar a própria senha.`, r.senha_temporaria);
        } else {
          Util.aviso(dados.deve_trocar_senha ? "Usuário criado. No primeiro acesso ele(a) vai trocar a senha." : "Usuário criado. Já entra com a senha informada.");
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

  // ------------------------------------------------------ regras de senha ----
  const OPCOES_SENHA = { "rs-forte": "senha_forte", "rs-maiuscula": "senha_maiuscula", "rs-numero": "senha_numero", "rs-simbolo": "senha_simbolo" };
  const regrasDosAjustes = (a) => ({ minima: Number(a.senha_minima), forte: a.senha_forte === "1", maiuscula: a.senha_maiuscula === "1",
    numero: a.senha_numero === "1", simbolo: a.senha_simbolo === "1" });

  function preencherRegrasSenha() {
    $("rs-minima").value = ajustes.senha_minima;
    Object.entries(OPCOES_SENHA).forEach(([id, chave]) => { $(id).checked = ajustes[chave] === "1"; });
    resumirRegrasSenha();
  }

  function resumirRegrasSenha() {
    const r = { minima: Number($("rs-minima").value) || 8 };
    Object.entries(OPCOES_SENHA).forEach(([id, chave]) => { r[chave.replace("senha_", "")] = $(id).checked; });
    $("rs-resumo").textContent = `Novas senhas: ${Util.descreverRegrasSenha(r)}. Vale para quem criar ou trocar a senha daqui em diante.`;
  }

  async function salvarRegrasSenha(ev) {
    ev.preventDefault();
    erro("rs-erro", "");
    const corpo = { senha_minima: Number($("rs-minima").value) };
    Object.entries(OPCOES_SENHA).forEach(([id, chave]) => { corpo[chave] = $(id).checked; });
    try {
      const r = await Api.put("/api/admin/ajustes", corpo);
      Object.assign(ajustes, r);
      Util.aplicarRegrasSenha(regrasDosAjustes(r));
      Util.aviso("Regras de senha salvas");
    } catch (e) { erro("rs-erro", e.message); }
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
    $("btn-criar").addEventListener("click", (ev) => { ev.stopPropagation(); abrirMenuCriar($("menu-criar").hidden); });
    document.addEventListener("click", (ev) => { if (!ev.target.closest(".menu-criar")) abrirMenuCriar(false); });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !$("menu-criar").hidden) { abrirMenuCriar(false); $("btn-criar").focus(); }
    });
    const item = (id, fn) => $(id).addEventListener("click", () => { abrirMenuCriar(false); fn(); });
    item("btn-novo-usuario", () => abrirFormulario());
    item("btn-nova-equipe", () => abrirEquipe());
    item("btn-novo-lote", criarLote);
    item("btn-empresa-teste", criarEmpresaTeste);
    $("form-equipe").addEventListener("submit", salvarEquipe);
    $("eq-empresa").addEventListener("change", atualizarCamposEmpresa);
    $("eq-exigir-cnpj").addEventListener("change", atualizarCamposEmpresa);
    $("form-usuario").addEventListener("submit", salvar);
    // Só com senha informada faz sentido escolher (a temporária sempre é trocada).
    $("u-senha").addEventListener("input", () => { $("u-trocar-wrap").hidden = !$("u-senha").value; });
    $("form-ajustes").addEventListener("submit", salvarAjustes);
    $("seg-filtro").addEventListener("change", renderEventos);
    $("form-regras-senha").addEventListener("submit", salvarRegrasSenha);
    $("form-regras-senha").addEventListener("input", resumirRegrasSenha);
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
