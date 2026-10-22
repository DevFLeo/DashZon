// Telas do gestor de unidade (Prefeitura DashZ):
//  - Painel do gestor (#/produtividade): a função mestre (lib/produtividade.rb)
//    soma os processos de baixo para cima (DCAD + DTAD + DASI = DGEO; DGEO +
//    DIPLAD + DIPEI = SUPLAN; SUPLAN + SURÇAM = SEMEC). Mesmas regras para
//    todas as unidades: é um retrato imparcial da produtividade.
//  - Minha equipe (#/equipe): o gestor põe e tira pessoas e unidades do seu
//    escopo, em cascata (rotas/gestao.rb). O servidor confere tudo de novo.
const Gestao = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  const n0 = (v) => Util.fmtNumero(v, 0);
  const NOME_TIPO = { secretaria: "Secretaria", subsecretaria: "Subsecretaria", departamento: "Departamento", divisao: "Divisão", equipe: "Equipe" };
  const TIPO_ABAIXO = { secretaria: "subsecretaria", subsecretaria: "departamento", departamento: "divisao", divisao: "divisao", equipe: "equipe" };
  const rotulo = (u) => (u.sigla ? `${u.sigla} · ${u.nome}` : u.nome);

  // ----------------------------------------------------- painel do gestor ----
  let painel = null;
  const COLUNAS = [
    ["total", "Total", "Todos os registros da unidade e das unidades abaixo dela."],
    ["andamento", "Em andamento", "Total menos concluídos e encerrados."],
    ["concluidos", "Concluídos", "Status que o módulo declara como concluído."],
    ["encerrados", "Encerrados", "Arquivados ou indeferidos: saíram da fila sem conclusão."],
    ["atrasados", "Atrasados", "Em andamento com o prazo antes de hoje."],
    ["vencem_7", "Vencem em 7 dias", "Em andamento com prazo de hoje até daqui a 7 dias."],
    ["sem_prazo", "Sem prazo", "Em andamento sem data de prazo."]
  ];

  async function abrirPainel() {
    const sel = $("prod-modulo");
    const escolhido = sel.value || Util.storage("dashzon.prod.modulo") || "";
    painel = await Api.get(`/api/produtividade${escolhido ? `?modulo=${encodeURIComponent(escolhido)}` : ""}`);
    if (escolhido && !painel.modulos.length) { // módulo escolhido antes sumiu: volta para "todos"
      Util.storage("dashzon.prod.modulo", "");
      painel = await Api.get("/api/produtividade");
    }
    const todos = escolhido ? (await Api.get("/api/produtividade")).modulos : painel.modulos;
    sel.innerHTML = '<option value="">Todos os módulos (somados)</option>' +
      todos.map((m) => `<option value="${esc(m.slug)}" ${m.slug === escolhido ? "selected" : ""}>${esc(m.nome)}</option>`).join("");
    renderPainel();
  }

  // As unidades de topo do que a pessoa vê (o escopo dela): somadas nos números de cima.
  function topos() {
    const ids = new Set(painel.unidades.map((u) => u.id));
    return painel.unidades.filter((u) => !ids.has(u.pai_id));
  }

  function somaTopos() {
    const s = Object.fromEntries(COLUNAS.map(([k]) => [k, 0]));
    topos().forEach((u) => COLUNAS.forEach(([k]) => { s[k] += u.total[k]; }));
    const fechados = s.concluidos + s.encerrados;
    s.taxa = s.total ? Math.round(fechados / s.total * 1000) / 10 : null;
    return s;
  }

  function barra(taxa) {
    if (taxa === null || taxa === undefined) return '<span class="hint">—</span>';
    return `<span class="prod-taxa"><span class="prod-barra" aria-hidden="true"><span style="width:${Math.min(100, taxa)}%"></span></span>${Util.fmtNumero(taxa, 1)}%</span>`;
  }

  function renderPainel() {
    if (!painel.modulos.length) {
      $("prod-kpis").innerHTML = "";
      $("prod-tabela").innerHTML = `<div class="empty-state"><h2>Nenhum módulo com painel</h2>
        <div>O painel soma os módulos que declaram <code>unidade</code> e <code>produtividade</code> na estrutura (ex.: Gestão de Demandas - DGEO e Processos SEI).</div></div>`;
      $("prod-regras").innerHTML = "";
      return;
    }
    if (!painel.unidades.length) {
      $("prod-kpis").innerHTML = "";
      $("prod-tabela").innerHTML = '<div class="empty-state"><h2>Nenhuma unidade cadastrada</h2><div>Crie a estrutura (Painel do adm &gt; Criar &gt; Unidade ou Estrutura modelo).</div></div>';
      return;
    }
    const s = somaTopos();
    const nomes = topos().map((u) => u.sigla || u.nome).join(" + ");
    const kpi = (titulo, valor, classe = "") => `<div class="kpi"><div class="label">${esc(titulo)}</div><div class="value ${classe}">${valor}</div></div>`;
    $("prod-kpis").innerHTML = [
      kpi(`Total (${nomes})`, n0(s.total)),
      kpi("Em andamento", n0(s.andamento)),
      kpi("Concluídos", n0(s.concluidos), "positivo"),
      kpi("Atrasados", n0(s.atrasados), s.atrasados ? "negativo" : ""),
      kpi("Vencem em 7 dias", n0(s.vencem_7)),
      kpi("Taxa de conclusão", s.taxa === null ? "—" : `${Util.fmtNumero(s.taxa, 1)}%`)
    ].join("");

    const base = Math.min(...painel.unidades.map((u) => u.nivel));
    const linhas = painel.unidades.map((u) => `<tr class="${u.total.total ? "" : "prod-vazia"}">
      <th scope="row"><div class="unidade-arvore" style="--nivel:${u.nivel - base}">
        <span class="chip chip-tipo chip-${esc(u.tipo)}">${esc(NOME_TIPO[u.tipo] || u.tipo)}</span>
        <strong>${esc(u.sigla || "")}</strong> <span class="prod-nome">${esc(u.nome)}</span>
        ${u.direto.total !== u.total.total ? `<div class="hint">só da unidade: ${n0(u.direto.total)}</div>` : ""}</div></th>
      ${COLUNAS.map(([k]) => `<td class="num ${k === "atrasados" && u.total[k] ? "prod-alerta" : ""}">${n0(u.total[k])}</td>`).join("")}
      <td>${barra(u.total.taxa)}</td></tr>`).join("");
    const sem = painel.sem_unidade && painel.sem_unidade.total
      ? `<tr class="prod-sem"><th scope="row">Sem unidade reconhecida
          <div class="hint">${Object.entries(painel.sem_unidade.valores || {}).map(([v, n]) => `${esc(v || "(campo vazio)")}: ${n0(n)}`).join(" · ")}</div></th>
          ${COLUNAS.map(([k]) => `<td class="num">${n0(painel.sem_unidade[k])}</td>`).join("")}<td>${barra(painel.sem_unidade.taxa)}</td></tr>`
      : "";
    $("prod-tabela").innerHTML = `<div class="table-wrap"><table class="data tabela-prod">
      <caption class="hint">Atualizado em ${new Date(painel.gerado_em).toLocaleString("pt-BR")} · cada linha já inclui as unidades de dentro</caption>
      <thead><tr><th>Unidade</th>${COLUNAS.map(([, t, d]) => `<th class="num" title="${esc(d)}">${esc(t)}</th>`).join("")}<th title="(concluídos + encerrados) / total">Conclusão</th></tr></thead>
      <tbody>${linhas}${sem}</tbody></table></div>`;

    $("prod-regras").innerHTML = `<ul>
      ${COLUNAS.map(([, t, d]) => `<li><strong>${esc(t)}:</strong> ${esc(d)}</li>`).join("")}
      <li><strong>Conclusão:</strong> (concluídos + encerrados) dividido pelo total.</li>
      <li><strong>Soma em cascata:</strong> cada unidade soma o que é dela (o valor do campo de unidade começa pela sigla dela, ex.: "DGEO - Gabinete do Diretor") e tudo das unidades de dentro.</li>
      ${painel.modulos.map((m) => `<li><strong>${esc(m.nome)}:</strong> concluído = ${esc(m.regras.concluido.join(", "))}${m.regras.encerrado?.length ? `; encerrado = ${esc(m.regras.encerrado.join(", "))}` : ""}${m.regras.prazo ? `; prazo = campo <code>${esc(m.regras.prazo)}</code>` : ""}; unidade = campo <code>${esc(m.unidade)}</code>.</li>`).join("")}
      <li><strong>Como alterar:</strong> na Estrutura (JSON) do módulo, a chave <code>produtividade</code> diz o status, o que é concluído/encerrado e o prazo; a chave <code>unidade</code> diz qual campo liga o registro à unidade. Detalhes no Relatório 1 PDZ.</li></ul>`;
  }

  function baixarCsv() {
    if (!painel?.unidades.length) return;
    const cab = ["Caminho", "Sigla", "Unidade", "Tipo", ...COLUNAS.map(([, t]) => t), "Conclusão (%)", "Só da unidade (total)"];
    const linhas = painel.unidades.map((u) => [u.caminho, u.sigla || "", u.nome, NOME_TIPO[u.tipo] || u.tipo,
      ...COLUNAS.map(([k]) => u.total[k]), u.total.taxa ?? "", u.direto.total]);
    const cel = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [cab, ...linhas].map((l) => l.map(cel).join(";")).join("\r\n");
    Util.baixar(`produtividade-${Util.hojeISO()}.csv`, `﻿${csv}`, "text/csv;charset=utf-8");
  }

  // ---------------------------------------------------------- minha equipe ----
  let dados = null;
  let unidadeAlvo = null;   // unidade do "+ Existente"
  let unidadeEditada = null; // unidade aberta no formulário (gestor)
  let formGestor = false;    // o modal de unidade foi aberto por esta tela

  async function abrirEquipe() {
    dados = await Api.get("/api/gestao");
    const gere = dados.unidades.filter((u) => dados.minhas_gestoes.includes(u.id)).map((u) => u.sigla || u.nome);
    $("eqp-escopo").textContent = App.usuario()?.admin
      ? "Administrador: todas as unidades. Aqui você administra as pessoas por unidade, como um gestor."
      : `Você gere ${gere.join(", ")} e tudo o que está abaixo: pode pôr e tirar pessoas, criar unidades dentro e mudar quem é gestor.`;
    renderUnidades();
    renderPessoas();
  }

  function renderUnidades() {
    if (!dados.unidades.length) {
      $("eqp-unidades").innerHTML = '<div class="empty-state empty-state-baixo">Nenhuma unidade no seu alcance.</div>';
      return;
    }
    const base = Math.min(...dados.unidades.map((u) => u.nivel));
    const editaveis = new Set(dados.editaveis);
    $("eqp-unidades").innerHTML = `<div class="table-wrap"><table class="data tabela-unidades"><thead><tr><th>Unidade</th><th>Pessoas</th><th></th></tr></thead><tbody>${
      dados.unidades.map((u) => `<tr>
        <td><div class="unidade-arvore" style="--nivel:${u.nivel - base}">
          <span class="chip chip-tipo chip-${esc(u.tipo)}">${esc(NOME_TIPO[u.tipo] || u.tipo)}</span>
          <strong>${esc(u.sigla || "")}</strong> ${esc(u.nome)}</div></td>
        <td><ul class="pessoas-unidade">${u.membros.length ? u.membros.map((m) => `<li>
          <span>${esc(m.nome)} <span class="hint">${esc(m.login)}</span></span>
          <select data-papel-unidade="${u.id}" data-usuario="${m.id}" aria-label="Papel de ${esc(m.nome)} em ${esc(u.sigla || u.nome)}">
            <option value="membro" ${m.papel === "gestor" ? "" : "selected"}>Membro</option>
            <option value="gestor" ${m.papel === "gestor" ? "selected" : ""}>Gestor</option></select>
          <button type="button" class="btn btn-sm" data-tirar-unidade="${u.id}" data-usuario="${m.id}" aria-label="Tirar ${esc(m.nome)} de ${esc(u.sigla || u.nome)}">Tirar</button>
        </li>`).join("") : '<li class="hint">Ninguém ainda</li>'}</ul></td>
        <td><div class="row-actions">
          <button class="btn btn-sm" data-pessoa-nova="${u.id}">+ Pessoa</button>
          <button class="btn btn-sm" data-pessoa-existente="${u.id}">+ Existente</button>
          <button class="btn btn-sm" data-unidade-dentro="${u.id}">+ Dentro</button>
          ${editaveis.has(u.id) ? `<button class="btn btn-sm" data-unidade-editar="${u.id}">Editar</button>
            <button class="btn btn-sm btn-danger" data-unidade-excluir="${u.id}">Excluir</button>` : ""}
        </div></td></tr>`).join("")}</tbody></table></div>`;

    const el = $("eqp-unidades");
    const acha = (id) => dados.unidades.find((u) => u.id === Number(id));
    el.querySelectorAll("[data-papel-unidade]").forEach((s) => s.addEventListener("change", () =>
      executar(() => Api.put(`/api/gestao/unidades/${s.dataset.papelUnidade}/membros/${s.dataset.usuario}`, { papel: s.value }), "Papel atualizado")));
    el.querySelectorAll("[data-tirar-unidade]").forEach((b) => b.addEventListener("click", () => {
      const u = acha(b.dataset.tirarUnidade);
      if (!confirm(`Tirar esta pessoa de ${u.sigla || u.nome}? A conta continua.`)) return;
      executar(() => Api.del(`/api/gestao/unidades/${u.id}/membros/${b.dataset.usuario}`), "Pessoa tirada da unidade");
    }));
    el.querySelectorAll("[data-pessoa-nova]").forEach((b) => b.addEventListener("click", () => abrirPessoa(Number(b.dataset.pessoaNova))));
    el.querySelectorAll("[data-pessoa-existente]").forEach((b) => b.addEventListener("click", () => abrirExistente(acha(b.dataset.pessoaExistente))));
    el.querySelectorAll("[data-unidade-dentro]").forEach((b) => b.addEventListener("click", () => abrirUnidade(null, acha(b.dataset.unidadeDentro))));
    el.querySelectorAll("[data-unidade-editar]").forEach((b) => b.addEventListener("click", () => abrirUnidade(acha(b.dataset.unidadeEditar))));
    el.querySelectorAll("[data-unidade-excluir]").forEach((b) => b.addEventListener("click", () => {
      const u = acha(b.dataset.unidadeExcluir);
      if (!confirm(`Excluir a unidade ${rotulo(u)}? As pessoas continuam com as contas.`)) return;
      executar(() => Api.del(`/api/gestao/unidades/${u.id}`), "Unidade excluída");
    }));
  }

  function renderPessoas() {
    const eu = App.usuario()?.id;
    if (!dados.pessoas.length) {
      $("eqp-pessoas").innerHTML = '<p class="hint">Ninguém nas unidades do seu alcance ainda.</p>';
      return;
    }
    $("eqp-pessoas").innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Nome / login</th><th>Cargo</th><th>Unidades</th><th>Situação</th><th></th></tr></thead><tbody>${
      dados.pessoas.map((p) => {
        const pode = p.id !== eu && !p.admin && !p.fora_do_escopo;
        const motivo = p.id === eu ? "você" : p.admin ? "administrador" : p.fora_do_escopo ? "também em unidades fora do seu alcance" : "";
        return `<tr><td><strong>${esc(p.nome || p.login)}</strong><div class="hint">${esc(p.login)}</div></td>
          <td>${esc(p.cargo) || '<span class="hint">—</span>'}</td>
          <td>${p.unidades.map((u) => `<span class="chip${u.papel === "gestor" ? " chip-entrada" : ""}">${esc(u.sigla || u.nome)}${u.papel === "gestor" ? " · gestor" : ""}</span>`).join(" ")}</td>
          <td>${p.ativo ? "Ativo" : '<span class="chip chip-saida">desativado</span>'}${p.deve_trocar_senha ? ' <span class="chip">senha temporária</span>' : ""}</td>
          <td>${pode ? `<div class="row-actions">
            <button class="btn btn-sm" data-conta-senha="${p.id}">Senha temporária</button>
            <button class="btn btn-sm" data-conta-ativo="${p.id}" data-ativo="${p.ativo ? "0" : "1"}">${p.ativo ? "Desativar" : "Reativar"}</button>
            <button class="btn btn-sm btn-danger" data-conta-excluir="${p.id}">Excluir</button></div>` : `<span class="hint">${esc(motivo)}</span>`}</td></tr>`;
      }).join("")}</tbody></table></div>`;
    const el = $("eqp-pessoas");
    const nome = (id) => { const p = dados.pessoas.find((x) => x.id === Number(id)); return p.nome || p.login; };
    el.querySelectorAll("[data-conta-senha]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(`Gerar uma senha temporária para ${nome(b.dataset.contaSenha)}? A senha atual deixa de valer.`)) return;
      try {
        const r = await Api.post(`/api/gestao/usuarios/${b.dataset.contaSenha}/senha-temporaria`, {});
        mostrarSenha(`Senha temporária de ${nome(b.dataset.contaSenha)}`, "Mostrada só agora. No primeiro acesso a pessoa cria a própria senha.", r.senha_temporaria);
        await abrirEquipe();
      } catch (e) { Util.aviso(e.message, "erro"); }
    }));
    el.querySelectorAll("[data-conta-ativo]").forEach((b) => b.addEventListener("click", () => {
      const ativar = b.dataset.ativo === "1";
      if (!ativar && !confirm(`Desativar o acesso de ${nome(b.dataset.contaAtivo)}? Os dados continuam.`)) return;
      executar(() => Api.post(`/api/gestao/usuarios/${b.dataset.contaAtivo}/ativo`, { ativo: ativar }), ativar ? "Acesso reativado" : "Acesso desativado");
    }));
    el.querySelectorAll("[data-conta-excluir]").forEach((b) => b.addEventListener("click", () => {
      if (!confirm(`Excluir a conta de ${nome(b.dataset.contaExcluir)}? Não dá para desfazer; os registros e módulos dela passam para você.`)) return;
      executar(() => Api.del(`/api/gestao/usuarios/${b.dataset.contaExcluir}`), "Conta excluída");
    }));
  }

  async function executar(acao, mensagem) {
    try {
      await acao();
      Util.aviso(mensagem);
    } catch (e) { Util.aviso(e.message, "erro"); }
    await abrirEquipe();
  }

  function mostrarSenha(titulo, texto, valor) {
    $("segredo-titulo").textContent = titulo;
    $("segredo-texto").textContent = texto;
    $("segredo-valor").textContent = valor;
    Util.abrirModal("modal-segredo");
  }

  const opcoesUnidade = (selecionada) => dados.unidades.map((u) =>
    `<option value="${u.id}" ${u.id === selecionada ? "selected" : ""}>${esc(u.caminho || rotulo(u))}</option>`).join("");

  function abrirPessoa(unidadeId) {
    $("form-gestao-pessoa").reset();
    $("gp-unidade").innerHTML = opcoesUnidade(unidadeId);
    $("gp-erro").hidden = true;
    Util.abrirModal("modal-gestao-pessoa");
    $("gp-nome").focus();
  }

  async function salvarPessoa(ev) {
    ev.preventDefault();
    const corpo = { nome: $("gp-nome").value.trim(), login: $("gp-login").value.trim(), email: $("gp-email").value.trim(),
      cargo: $("gp-cargo").value.trim(), unidade_id: Number($("gp-unidade").value), papel: $("gp-papel").value, perfil: $("gp-perfil").value };
    try {
      const r = await Api.post("/api/gestao/usuarios", corpo);
      Util.fecharModal("modal-gestao-pessoa");
      mostrarSenha(`Senha temporária de ${corpo.nome}`, `Conta criada. Login: ${corpo.login}. No primeiro acesso, ${corpo.nome} cria a própria senha.`, r.senha_temporaria);
      await abrirEquipe();
    } catch (e) {
      $("gp-erro").textContent = e.message;
      $("gp-erro").hidden = false;
    }
  }

  function abrirExistente(u) {
    unidadeAlvo = u;
    $("form-gestao-membro").reset();
    $("gm-titulo").textContent = `Adicionar pessoa em ${u.sigla || u.nome}`;
    const ja = new Set(u.membros.map((m) => m.id));
    const contas = dados.contas.filter((c) => !ja.has(c.id));
    $("gm-conta").innerHTML = contas.length
      ? contas.map((c) => `<option value="${c.id}">${esc(c.nome || c.login)} (${esc(c.login)})</option>`).join("")
      : '<option value="">Todas as contas já estão nesta unidade</option>';
    $("gm-erro").hidden = true;
    Util.abrirModal("modal-gestao-membro");
    $("gm-conta").focus();
  }

  async function salvarExistente(ev) {
    ev.preventDefault();
    if (!$("gm-conta").value) return;
    try {
      await Api.put(`/api/gestao/unidades/${unidadeAlvo.id}/membros/${$("gm-conta").value}`, { papel: $("gm-papel").value });
      Util.fecharModal("modal-gestao-membro");
      Util.aviso("Pessoa adicionada");
      await abrirEquipe();
    } catch (e) {
      $("gm-erro").textContent = e.message;
      $("gm-erro").hidden = false;
    }
  }

  // O modal de unidade é o mesmo do Painel do adm; aqui sem a lista de pessoas
  // (o gestor mexe nelas na tabela) e com "fica dentro de" só no escopo dele.
  function abrirUnidade(u = null, pai = null) {
    formGestor = true;
    unidadeEditada = u;
    $("form-equipe").reset();
    $("equipe-titulo").textContent = u ? `Editar ${rotulo(u)}` : `Nova unidade${pai ? ` em ${pai.sigla || pai.nome}` : ""}`;
    $("equipe-salvar").textContent = u ? "Salvar" : "Criar unidade";
    $("eq-tipo").value = u?.tipo || (pai ? TIPO_ABAIXO[pai.tipo] : "divisao");
    $("eq-sigla").value = u?.sigla || "";
    $("eq-nome").value = u?.nome || "";
    $("eq-descricao").value = u?.descricao || "";
    const paiAtual = u ? u.pai_id : pai?.id;
    $("eq-pai").innerHTML = dados.unidades.filter((x) => x.id !== u?.id).map((x) =>
      `<option value="${x.id}" ${x.id === paiAtual ? "selected" : ""}>${esc(x.caminho || rotulo(x))}</option>`).join("");
    $("eq-membros-wrap").hidden = true;
    $("eq-sigla-label").classList.toggle("obrigatorio", $("eq-tipo").value !== "equipe");
    $("equipe-erro").hidden = true;
    Util.abrirModal("modal-equipe");
    $("eq-sigla").focus();
  }

  async function salvarUnidade(ev) {
    ev.preventDefault();
    const corpo = { tipo: $("eq-tipo").value, sigla: $("eq-sigla").value.trim().toUpperCase(), nome: $("eq-nome").value.trim(),
      descricao: $("eq-descricao").value.trim(), pai_id: Number($("eq-pai").value) };
    try {
      if (unidadeEditada) await Api.put(`/api/gestao/unidades/${unidadeEditada.id}`, corpo);
      else await Api.post("/api/gestao/unidades", corpo);
      Util.fecharModal("modal-equipe");
      formGestor = false;
      Util.aviso(unidadeEditada ? "Unidade atualizada" : "Unidade criada");
      await abrirEquipe();
    } catch (e) {
      $("equipe-erro").textContent = e.message;
      $("equipe-erro").hidden = false;
    }
  }

  // O formulário de unidade é compartilhado com o Painel do adm.
  function formularioUnidadeAberto() {
    return formGestor && $("view-equipe").classList.contains("active");
  }

  function init() {
    $("prod-modulo").addEventListener("change", () => { Util.storage("dashzon.prod.modulo", $("prod-modulo").value); abrirPainel(); });
    $("prod-csv").addEventListener("click", baixarCsv);
    $("prod-imprimir").addEventListener("click", () => window.print());
    $("eqp-nova-pessoa").addEventListener("click", () => abrirPessoa(dados?.unidades[0]?.id));
    $("eqp-nova-unidade").addEventListener("click", () => abrirUnidade(null, dados?.unidades.find((u) => dados.minhas_gestoes.includes(u.id)) || dados?.unidades[0]));
    // Várias de uma vez, em texto, dentro da unidade que a pessoa gere (a de cima).
    $("eqp-nova-arvore").addEventListener("click", () => {
      const pai = dados?.unidades.find((u) => dados.minhas_gestoes.includes(u.id)) || dados?.unidades[0];
      if (!pai) return;
      Estrutura.abrirArvore({ lista: dados.unidades, pai, depois: abrirEquipe });
    });
    $("form-gestao-pessoa").addEventListener("submit", salvarPessoa);
    $("form-gestao-membro").addEventListener("submit", salvarExistente);
    // Abrindo o modal pelo Painel do adm, o formulário volta a ser do adm.
    document.getElementById("btn-nova-equipe")?.addEventListener("click", () => { formGestor = false; });
    $("admin-equipes")?.addEventListener("click", () => { formGestor = false; }, true);
  }

  return { init, abrirPainel, abrirEquipe, salvarUnidade, formularioUnidadeAberto };
})();
