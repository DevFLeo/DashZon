// Assistente de primeiro acesso: nome/moeda + escolha de templates da
// galeria e/ou importados de arquivo JSON. Só no envio o backend cria o banco.
const Setup = (() => {
  let templates = [];
  const selecionados = new Set();
  const importados = [];

  const $ = (id) => document.getElementById(id);

  // Cartão de template, reaproveitado na galeria de "Adicionar módulo".
  function cardHtml({ id, nome, descricao, modulos, dashboards, selecionado, tag, selecionavel = true }) {
    return `
      <button type="button" class="tpl-card ${selecionado ? "selected" : ""}" data-id="${Util.escapeHtml(id)}"
              ${selecionavel ? `aria-pressed="${selecionado ? "true" : "false"}"` : ""}>
        ${tag ? `<span class="tag">${Util.escapeHtml(tag)}</span>` : ""}
        <h3>${Util.escapeHtml(nome)} ${selecionavel ? '<span class="check"></span>' : ""}</h3>
        ${descricao ? `<p>${Util.escapeHtml(descricao)}</p>` : ""}
        <ul>${(modulos || []).map((m) => `<li>${Util.escapeHtml(m)}</li>`).join("")}</ul>
        ${dashboards && dashboards.length ? `<span class="hint">Dashboard: ${dashboards.map(Util.escapeHtml).join(", ")}</span>` : ""}
      </button>`;
  }

  // Templates importados antes ficam guardados no banco e voltam na galeria.
  const tagDe = (t) => (t.origem === "importado" ? "Importado" : "");

  function render() {
    const galeria = $("setup-galeria");
    galeria.innerHTML =
      templates.map((t) => cardHtml({
        id: t.id, nome: t.nome, descricao: t.descricao,
        modulos: t.modulos.map((m) => m.nome), dashboards: t.dashboards,
        selecionado: selecionados.has(t.id), tag: tagDe(t)
      })).join("") +
      importados.map((imp, i) => cardHtml({
        id: `importado-${i}`, nome: imp.nome, modulos: imp.modulos, dashboards: imp.dashboards,
        selecionado: imp.ativo, tag: "Importado"
      })).join("");

    galeria.querySelectorAll(".tpl-card").forEach((card) => {
      card.addEventListener("click", () => alternar(card.dataset.id));
    });

    const total = selecionados.size + importados.filter((i) => i.ativo).length;
    $("setup-resumo").textContent = total ? `${total} template(s) selecionado(s)` : "Nenhum template selecionado";
  }

  function alternar(id) {
    if (id.startsWith("importado-")) {
      const imp = importados[Number(id.split("-")[1])];
      imp.ativo = !imp.ativo;
    } else if (selecionados.has(id)) {
      selecionados.delete(id);
    } else {
      selecionados.add(id);
    }
    render();
  }

  function erro(msg) {
    $("setup-erro").textContent = msg;
    $("setup-erro").hidden = !msg;
  }

  async function importar(ev) {
    const file = ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    erro("");
    try {
      const template = JSON.parse(await Util.lerArquivo(file));
      const previa = await Api.post("/api/templates/validar", { template });
      importados.push({ template, nome: previa.nome || file.name, modulos: previa.modulos, dashboards: previa.dashboards, ativo: true });
      render();
    } catch (e) {
      erro(e instanceof SyntaxError ? `O arquivo não é um JSON válido: ${e.message}` : e.message);
    }
  }

  async function enviar(ev, onConcluido) {
    ev.preventDefault();
    erro("");
    const org = $("setup-org").value.trim();
    if (!org) { erro("Informe um nome."); return; }
    const usuario = $("setup-usuario").value.trim();
    const senha = $("setup-senha").value;
    if (!usuario) { erro("Informe um usuário para o login."); return; }
    if (senha.length < 4) { erro("A senha precisa ter ao menos 4 caracteres."); return; }

    const ativos = importados.filter((i) => i.ativo).map((i) => i.template);
    if (!selecionados.size && !ativos.length &&
        !confirm("Começar sem nenhum módulo? Você poderá adicionar templates depois.")) return;

    const botao = $("setup-enviar");
    botao.disabled = true;
    botao.textContent = "Criando banco...";
    try {
      await Api.post("/api/setup", {
        org_name: org,
        moeda: $("setup-moeda").value,
        usuario,
        senha,
        templates: [...selecionados],
        importados: ativos,
        com_exemplos: $("setup-exemplos").checked
      });
      $("setup").classList.remove("open");
      await onConcluido();
    } catch (e) {
      erro(e.message);
      botao.disabled = false;
      botao.textContent = "Criar banco e começar";
    }
  }

  async function iniciar(onConcluido) {
    templates = await Api.get("/api/templates");
    if (templates.length) selecionados.add(templates[0].id);
    render();
    $("setup-importar").addEventListener("change", importar);
    $("setup-form").addEventListener("submit", (ev) => enviar(ev, onConcluido));
    $("setup").classList.add("open");
    $("setup-org").focus();
  }

  return { iniciar, cardHtml, tagDe };
})();
