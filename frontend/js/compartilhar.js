// Janela "Quem vê" de dashboards e módulos (relatório de testes, problemas
// 1 e 2): só eu, equipes escolhidas ou todos; o administrador também troca o
// dono. As equipes oferecidas vêm de /api/equipes (o admin vê todas; os
// demais, as suas). Quem chama passa o estado atual e a função que grava.
const Compartilhar = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  let salvar = null;
  let valorTodos = "equipe";

  // tipo: "dashboard" (todos = "equipe") ou "modulo" (todos = "todos").
  async function abrir({ tipo, titulo, atual, onSalvar }) {
    salvar = onSalvar;
    valorTodos = tipo === "modulo" ? "todos" : "equipe";
    $("comp-titulo").textContent = titulo;
    $("comp-opcao-todos").value = valorTodos;
    $("comp-dica-todos").textContent = tipo === "modulo"
      ? "Todos os usuários veem o módulo e os registros."
      : "Todos veem. Só você e os administradores mudam os cards, o nome e o layout.";
    $("comp-dica-equipes").textContent = tipo === "modulo"
      ? "Só quem está nas equipes marcadas (e os administradores). Quem vê um dashboard com cards deste módulo também vê os dados."
      : "Só quem está nas equipes marcadas (e os administradores).";
    const equipes = await Api.get("/api/equipes");
    const marcadas = (atual.equipes || []).map((e) => e.id ?? e);
    $("comp-equipes").innerHTML = equipes.length
      ? equipes.map((e) => `<label class="field-check"><input type="checkbox" value="${e.id}" ${marcadas.includes(e.id) ? "checked" : ""}> ${esc(e.nome)}${e.empresa ? ' <span class="chip">Empresa</span>' : ""}</label>`).join("")
      : '<span class="hint">Você não está em nenhuma equipe.</span>';
    document.querySelectorAll('input[name="comp-visibilidade"]').forEach((r) => { r.checked = r.value === atual.visibilidade; });
    // Módulo: quem lança registros (pentest de 26/10/2026, achado 1).
    $("comp-lancamento-wrap").hidden = tipo !== "modulo";
    document.querySelectorAll('input[name="comp-lancamento"]').forEach((r) => { r.checked = r.value === (atual.lancamento || "dono"); });
    atualizar();

    const admin = App.usuario()?.admin;
    $("comp-dono-wrap").hidden = !admin;
    if (admin) {
      const contas = (await Api.get("/api/admin/usuarios")).filter((u) => u.ativo);
      $("comp-dono").innerHTML = contas.map((u) =>
        `<option value="${u.id}" ${u.id === atual.dono_id ? "selected" : ""}>${esc(u.nome || u.login)} (${esc(u.login)})</option>`).join("");
    }
    $("comp-erro").hidden = true;
    Util.abrirModal("modal-compartilhar");
  }

  function atualizar() {
    const vis = document.querySelector('input[name="comp-visibilidade"]:checked')?.value;
    // Privado: só o dono vê, então a escolha de quem lança não faz diferença.
    $("comp-lancamento-wrap").disabled = vis === "privado";
    $("comp-equipes").classList.toggle("desligada", vis !== "equipes");
    $("comp-equipes").querySelectorAll("input").forEach((c) => { c.disabled = vis !== "equipes"; });
  }

  async function enviar(ev) {
    ev.preventDefault();
    const corpo = { visibilidade: document.querySelector('input[name="comp-visibilidade"]:checked')?.value };
    if (corpo.visibilidade === "equipes") corpo.equipes = [...$("comp-equipes").querySelectorAll("input:checked")].map((c) => Number(c.value));
    if (!$("comp-lancamento-wrap").hidden) corpo.lancamento = document.querySelector('input[name="comp-lancamento"]:checked')?.value;
    if (!$("comp-dono-wrap").hidden) corpo.dono_id = Number($("comp-dono").value);
    try {
      await salvar(corpo);
      Util.fecharModal("modal-compartilhar");
      Util.aviso("Compartilhamento salvo");
    } catch (e) {
      $("comp-erro").textContent = e.message;
      $("comp-erro").hidden = false;
    }
  }

  // Texto curto de quem vê ("Só você", "Equipes: A, B", "Todos").
  function descrever(vis, equipes = []) {
    if (vis === "privado") return "Só você vê";
    if (vis === "equipes") return equipes.length ? `Equipes: ${equipes.map((e) => e.nome).join(", ")}` : "Equipes escolhidas";
    return "Todos veem";
  }

  function init() {
    $("form-compartilhar").addEventListener("submit", enviar);
    $("form-compartilhar").addEventListener("change", (e) => { if (e.target.name === "comp-visibilidade") atualizar(); });
  }

  return { init, abrir, descrever };
})();
