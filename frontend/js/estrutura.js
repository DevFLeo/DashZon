// Montar estruturas sem clicar unidade por unidade (a pedido: "nomear a árvore
// que veio da SEMEC ou criar outra, como a SEMAGRIC, com os dados que eu quiser"):
//  - Nova estrutura: o administrador (ou o gestor, dentro da unidade dele)
//    escreve a árvore como lista, uma unidade por linha, com recuo. Pode começar
//    em branco, do modelo SEMEC ou de uma cópia de uma estrutura existente. A
//    prévia mostra o tipo de cada linha e o que já existe (é reaproveitado).
//    O servidor confere tudo de novo (Equipes.criar_arvore!) e grava tudo ou nada.
//  - Unidades do campo: troca as opções do campo de unidade de um módulo pelas
//    unidades de uma estrutura (ex.: as demandas passam a ser da SEMAGRIC).
const Estrutura = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  const NOME_TIPO = { secretaria: "Secretaria", subsecretaria: "Subsecretaria", departamento: "Departamento", divisao: "Divisão", equipe: "Equipe" };
  const ABAIXO = { secretaria: "subsecretaria", subsecretaria: "departamento", departamento: "divisao", divisao: "divisao", equipe: "equipe" };
  const TIPOS = { secretaria: "secretaria", subsecretaria: "subsecretaria", departamento: "departamento", divisao: "divisao", equipe: "equipe" };

  let modo = null;        // { tipo: "admin" } ou { tipo: "gestor", pai }
  let existentes = new Map(); // SIGLA -> unidade (para a prévia)
  let aoCriar = null;

  // Mesmo formato do servidor (Equipes.ler_arvore), só para a prévia.
  function ler(texto) {
    const nos = [];
    const erros = [];
    const pilha = [];
    String(texto || "").replace(/\r\n/g, "\n").split("\n").forEach((bruta, i) => {
      const linha = i + 1;
      const limpa = bruta.trim();
      if (!limpa || limpa.startsWith("#")) return;
      const recuo = bruta.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
      let [conteudo, tipoTxt] = limpa.replace(/^[-*•]\s+/, "").split(/\|(.*)/s).map((x) => (x || "").trim());
      let tipo = null;
      if (tipoTxt) {
        tipo = TIPOS[Util.semAcento(tipoTxt)] || null;
        if (!tipo) erros.push(`Linha ${linha}: tipo "${tipoTxt}" inválido`);
      }
      const partes = conteudo.split(/\s+[-–—]\s+/);
      const sigla = (partes.shift() || "").trim().toUpperCase();
      let nome = partes.join(" - ").trim();
      if (!nome) {
        if (sigla.includes(" ")) erros.push(`Linha ${linha}: escreva "SIGLA - Nome"`);
        nome = sigla;
      }
      while (pilha.length && pilha.at(-1)[0] >= recuo) pilha.pop();
      const pai = pilha.length ? pilha.at(-1)[1] : null;
      if (nos.some((n) => n.sigla === sigla)) erros.push(`Linha ${linha}: a sigla ${sigla} aparece duas vezes`);
      nos.push({ linha, sigla, nome, tipo, pai, nivel: pilha.length });
      pilha.push([recuo, nos.length - 1]);
    });
    // Tipo pelo nível (ou o da unidade que já existe).
    nos.forEach((n) => {
      const ja = existentes.get(n.sigla);
      if (ja) { n.existe = ja; n.tipo = ja.tipo; return; }
      const tipoPai = n.pai !== null ? nos[n.pai].tipo : modo?.pai?.tipo;
      n.tipo = n.tipo || (tipoPai ? ABAIXO[tipoPai] : "secretaria");
    });
    return { nos, erros };
  }

  function previa() {
    const { nos, erros } = ler($("arvore-texto").value);
    const novas = nos.filter((n) => !n.existe).length;
    $("arvore-previa").innerHTML = nos.length
      ? `<ul>${nos.map((n) => `<li style="--nivel:${n.nivel}" class="${n.existe ? "ja-existe" : ""}">
          <span class="chip chip-tipo chip-${esc(n.tipo)}">${esc(NOME_TIPO[n.tipo] || n.tipo)}</span>
          <strong>${esc(n.sigla)}</strong> ${esc(n.nome)}${n.existe ? ' <span class="hint">(já existe: reaproveitada, não muda)</span>' : ""}</li>`).join("")}</ul>
        <p class="hint">${novas} nova(s)${nos.length - novas ? `, ${nos.length - novas} reaproveitada(s)` : ""}${modo?.pai ? `, dentro de ${esc(modo.pai.sigla || modo.pai.nome)}` : ""}</p>`
      : '<p class="hint">Escreva ao lado: aparece aqui como vai ficar.</p>';
    $("arvore-erro").textContent = erros.join(" · ");
    $("arvore-erro").hidden = !erros.length;
    $("arvore-criar").disabled = !nos.length || erros.length > 0 || novas === 0;
  }

  // opts: { lista (unidades conhecidas), pai (gestor), aoCriar }
  async function abrirArvore({ lista = [], pai = null, depois = null } = {}) {
    modo = pai ? { tipo: "gestor", pai } : { tipo: "admin" };
    existentes = new Map(lista.filter((u) => u.sigla).map((u) => [u.sigla.toUpperCase(), u]));
    aoCriar = depois;
    $("form-arvore").reset();
    $("arvore-titulo").textContent = pai ? `Várias unidades dentro de ${pai.sigla || pai.nome}` : "Nova estrutura";
    $("arvore-base-wrap").hidden = Boolean(pai);
    if (!pai) {
      const raizes = lista.filter((u) => !u.pai_id);
      $("arvore-base").innerHTML = '<option value="">Em branco</option><option value="modelo">Modelo SEMEC (exemplo)</option>' +
        raizes.map((u) => `<option value="${u.id}">Copiar: ${esc(u.sigla || u.nome)} - ${esc(u.nome)}</option>`).join("");
    }
    previa();
    Util.abrirModal("modal-arvore");
    $("arvore-texto").focus();
  }

  async function trocarBase() {
    const v = $("arvore-base").value;
    if (!v) { $("arvore-texto").value = ""; previa(); return; }
    if ($("arvore-texto").value.trim() && !confirm("Trocar o texto atual pela base escolhida?")) return;
    try {
      const r = await Api.get(`/api/admin/equipes/texto${v === "modelo" ? "" : `?raiz=${v}`}`);
      $("arvore-texto").value = r.texto;
      previa();
    } catch (e) { Util.aviso(e.message, "erro"); }
  }

  async function criar(ev) {
    ev.preventDefault();
    const texto = $("arvore-texto").value;
    try {
      const r = modo.tipo === "gestor"
        ? await Api.post("/api/gestao/arvore", { pai_id: modo.pai.id, texto })
        : await Api.post("/api/admin/equipes/arvore", { texto });
      Util.fecharModal("modal-arvore");
      Util.aviso(`${r.criadas} unidade(s) criada(s)${r.reaproveitadas.length ? `, ${r.reaproveitadas.length} reaproveitada(s)` : ""}. Para usar nos módulos: botão "Unidades do campo" no módulo.`);
      await aoCriar?.(r);
    } catch (e) {
      $("arvore-erro").textContent = e.message;
      $("arvore-erro").hidden = false;
    }
  }

  // ------------------------------------------------- unidades do campo ----
  let moduloUc = null;
  let unidadesUc = [];
  let depoisUc = null;

  async function abrirUnidadesCampo(modulo, depois) {
    moduloUc = modulo;
    depoisUc = depois;
    const campo = modulo.schema.campos.find((c) => c.id === modulo.schema.unidade);
    unidadesUc = await Api.get("/api/equipes"); // as do alcance (o admin vê todas), com o caminho
    $("uc-dica").textContent = `O campo "${campo.nome}" passa a ter uma opção para cada unidade da estrutura escolhida ("SIGLA - Nome"). É por ela que cada registro fica de uma unidade.`;
    const raizes = unidadesUc.filter((u) => !unidadesUc.some((x) => u.caminho.startsWith(`${x.caminho} / `)));
    const outras = unidadesUc.filter((u) => !raizes.includes(u));
    $("uc-raiz").innerHTML = '<option value="">Escolha...</option>' +
      `<optgroup label="Estruturas">${raizes.map((u) => `<option value="${u.id}">${esc(u.caminho)}</option>`).join("")}</optgroup>` +
      (outras.length ? `<optgroup label="Só uma parte">${outras.map((u) => `<option value="${u.id}">${esc(u.caminho)}</option>`).join("")}</optgroup>` : "");
    $("uc-nome").value = modulo.nome;
    $("uc-erro").hidden = true;
    previaUc();
    Util.abrirModal("modal-unidades-campo");
    $("uc-raiz").focus();
  }

  function previaUc() {
    const raiz = unidadesUc.find((u) => String(u.id) === $("uc-raiz").value);
    if (!raiz) { $("uc-previa").innerHTML = '<p class="hint">Escolha a estrutura.</p>'; return; }
    const dentro = unidadesUc.filter((u) => u.id === raiz.id || u.caminho.startsWith(`${raiz.caminho} / `))
      .sort((a, b) => a.caminho.localeCompare(b.caminho, "pt-BR"));
    $("uc-previa").innerHTML = `<ul>${dentro.map((u) => `<li style="--nivel:${u.caminho.split(" / ").length - raiz.caminho.split(" / ").length}">
      <strong>${esc(u.sigla || u.nome)}</strong> - ${esc(u.nome)}</li>`).join("")}</ul>`;
  }

  async function aplicarUc(ev) {
    ev.preventDefault();
    try {
      const r = await Api.put(`/api/modulos/${encodeURIComponent(moduloUc.slug)}/unidades`, { raiz_id: Number($("uc-raiz").value), nome: $("uc-nome").value.trim() });
      Util.fecharModal("modal-unidades-campo");
      Util.aviso(r.opcoes_mantidas?.length
        ? `Unidades atualizadas. ${r.opcoes_mantidas.length} opção(ões) antiga(s) ficaram porque estão em registros.`
        : "Unidades do campo atualizadas");
      await depoisUc?.(r);
    } catch (e) {
      $("uc-erro").textContent = e.message;
      $("uc-erro").hidden = false;
    }
  }

  function init() {
    $("arvore-texto").addEventListener("input", previa);
    $("arvore-base").addEventListener("change", trocarBase);
    $("form-arvore").addEventListener("submit", criar);
    $("uc-raiz").addEventListener("change", previaUc);
    $("form-unidades-campo").addEventListener("submit", aplicarUc);
  }

  return { init, abrirArvore, abrirUnidadesCampo, ler };
})();
