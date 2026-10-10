// Ícones de ajuda "(?)" com prévia em imagem. Passar o mouse mostra a imagem
// (tooltip flutuante); clicar abre um popup com o texto e as imagens.
// As imagens ficam em frontend/preview/ (prints tirados com dados fictícios).
const Ajuda = (() => {
  const P = "/preview/";

  const CATALOGO = {
    // --- tipos de card ------------------------------------------------------
    "card-kpi": {
      titulo: "Número (KPI)",
      texto: "Um número grande, como total gasto, saldo do mês ou quantidade de demandas abertas. Use quando a pergunta é \"quanto?\" ou \"quantos?\" e não precisa comparar grupos.",
      imagens: ["card-kpi.png"]
    },
    "card-bar": {
      titulo: "Barras",
      texto: "Compara grupos lado a lado: gasto por categoria, demandas por status, entradas × saídas por mês. Com \"Cores por\", cada barra se divide em séries (até 2 ficam lado a lado, mais que isso ficam empilhadas).",
      imagens: ["card-bar.png"]
    },
    "card-line": {
      titulo: "Linha",
      texto: "Mostra a evolução no tempo. Funciona melhor separando por um campo de data (agrupado por mês).",
      imagens: ["card-line.png"]
    },
    "card-table": {
      titulo: "Tabela",
      texto: "Lista cada grupo com a quantidade e o valor calculado. Boa para ver números exatos ou quando há muitos grupos.",
      imagens: ["card-table.png"]
    },
    "card-sugestoes": {
      titulo: "Atalhos",
      texto: "Cards prontos montados a partir dos campos do módulo escolhido. Clique em um para preencher tudo de uma vez; depois é só ajustar o que quiser. A prévia ao lado usa dados fictícios, só para você ver o formato.",
      imagens: ["card-bar.png", "card-kpi.png"]
    },
    "card-lancar": {
      titulo: "Lançar pelo dashboard",
      texto: "Cadastra um registro novo sem sair do dashboard. O formulário é o mesmo da tela do módulo, e os cards se atualizam assim que você salva.",
      imagens: ["modulo-lancamentos.png"]
    },

    // --- módulos ------------------------------------------------------------
    "modulo-lancamentos": { titulo: "Lançamentos", texto: "Tudo que entra e sai: descrição, entrada/saída, valor, categoria, conta ou cartão, data, parcela e se já foi pago.", imagens: ["modulo-lancamentos.png"] },
    "modulo-orcamento": { titulo: "Orçamento mensal", texto: "Quanto você planeja gastar por categoria em cada mês, para comparar com o realizado.", imagens: ["modulo-orcamento.png"] },
    "modulo-contas": { titulo: "Contas e cartões", texto: "Onde o dinheiro está: contas e cartões com instituição, limite ou saldo, dia de vencimento e se está ativa.", imagens: ["modulo-contas.png"] },
    "modulo-movimentacoes": { titulo: "Movimentações de caixa", texto: "Entradas e saídas da empresa com categoria, centro de custo, conta e situação (previsto ou realizado).", imagens: ["modulo-movimentacoes.png"] },
    "modulo-demandas": { titulo: "Demandas", texto: "Pedidos, tarefas e chamados da equipe com status, prioridade, setor, responsável, prazo e valor estimado.", imagens: ["modulo-demandas.png"] },
    "modulo-inventario_dados": { titulo: "Inventário de dados", texto: "Mapa das bases de dados do setor: origem, dono, classificação, dados pessoais (LGPD) e qualidade.", imagens: ["modulo-inventario_dados.png"] },
    "modulo-indicadores": { titulo: "Indicadores do setor", texto: "Medições periódicas de cada setor: valor medido, meta, unidade, período e se atingiu a meta.", imagens: ["modulo-indicadores.png"] },
    "modulo-cronograma_estudos": { titulo: "Cronograma de estudos", texto: "Sessões de estudo por data e horário, com matéria, assunto, atividade e duração. A lista segue a ordem do calendário e a coluna \"Estudado\" funciona como checklist: marque direto na tabela.", imagens: ["modulo-cronograma_estudos.png"] },

    // --- templates (galeria) -------------------------------------------------
    "template-financas-pessoais": { titulo: "Finanças pessoais", texto: "Instala Lançamentos, Orçamento mensal e Contas e cartões, com um dashboard de receitas, despesas e saldo.", imagens: ["modulo-lancamentos.png", "modulo-orcamento.png", "modulo-contas.png"] },
    "template-fluxo-caixa": { titulo: "Fluxo de caixa empresarial", texto: "Instala Movimentações de caixa (previsto × realizado) com um dashboard de entradas, saídas e saldo por mês.", imagens: ["modulo-movimentacoes.png"] },
    "template-gestao-demandas": { titulo: "Gestão de demandas", texto: "Instala Demandas com status, prioridade e prazo, e um dashboard por status e setor.", imagens: ["modulo-demandas.png"] },
    "modulo-anotacoes": { titulo: "Anotações", texto: "Caderno de notas em Markdown, como no Obsidian: pastas, [[links]] entre notas, #tags, tarefas que se marcam com um clique e importação/exportação de arquivos .md.", imagens: ["modulo-anotacoes.png"] },
    "template-cronograma-estudos": { titulo: "Cronograma de estudos", texto: "Instala o Cronograma de estudos (data, horário, matéria e checklist do que foi estudado) e as Anotações em Markdown, ligadas: cada sessão abre a nota do assunto. Vem com um dashboard de horas por matéria e por mês, estudadas × pendentes.", imagens: ["modulo-cronograma_estudos.png", "modulo-anotacoes.png"] },
    "template-anotacoes": { titulo: "Anotações (estilo Obsidian)", texto: "Instala só o caderno de notas em Markdown: pastas, [[links]], #tags, tarefas e arquivos .md.", imagens: ["modulo-anotacoes.png"] },
    "template-mapeamento-setor": { titulo: "Mapeamento de dados do setor", texto: "Instala o Inventário de dados (LGPD) e os Indicadores do setor, com um dashboard por setor, classificação, dados pessoais e qualidade.", imagens: ["modulo-inventario_dados.png", "modulo-indicadores.png"] },

    "criar-modulo": {
      titulo: "Criar um módulo em JSON",
      texto: "Um módulo é uma lista de campos. Cada campo tem id, nome e tipo (texto, texto_longo, markdown, numero, moeda, data, hora, selecao, booleano ou movimento). Seleção precisa de \"opcoes\". O \"resumo\" define os números do topo da tela, e \"ordenacao\" (opcional) a ordem da lista, como [{\"campo\": \"data\", \"direcao\": \"asc\"}]. Campos sim/não aparecem na tabela como caixas de marcar (checklist). Opcionais: \"visao\": {\"tipo\": \"notas\", ...} transforma o módulo num caderno de notas; \"nota\" liga cada registro a uma nota; \"configuracoes\" lista os campos ajustáveis em Configurações > Módulos. O nome do módulo precisa ser único. Com \"Começar do zero\" você recebe um exemplo pronto para editar. A tela gerada fica assim:",
      imagens: ["modulo-lancamentos.png"]
    }
  };

  const esc = (s) => Util.escapeHtml(s);
  let tooltip = null;

  function existe(chave) { return Boolean(CATALOGO[chave]); }

  // HTML do ícone. Usa <span role="button"> para poder ficar dentro de um
  // <button> (os cartões da galeria) sem HTML inválido.
  function icone(chave) {
    const item = CATALOGO[chave];
    if (!item) return "";
    return `<span class="dica" role="button" tabindex="0" data-dica="${esc(chave)}" aria-label="Ajuda: ${esc(item.titulo)}" title="">?</span>`;
  }

  function mostrarTooltip(el) {
    const item = CATALOGO[el.dataset.dica];
    if (!item) return;
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "dica-tooltip";
      document.body.appendChild(tooltip);
    }
    tooltip.innerHTML = `<strong>${esc(item.titulo)}</strong>
      ${item.imagens?.length ? `<img src="${P}${esc(item.imagens[0])}" alt="Prévia: ${esc(item.titulo)}">` : `<p>${esc(item.texto)}</p>`}
      <span class="hint">Clique no ? para mais detalhes</span>`;
    tooltip.hidden = false;

    // Abaixo do ícone; se não couber, acima. Sempre dentro da janela.
    const r = el.getBoundingClientRect();
    const t = tooltip.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
    const abaixo = r.bottom + 8 + t.height < window.innerHeight;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${abaixo ? r.bottom + 8 : Math.max(8, r.top - t.height - 8)}px`;
  }

  function esconderTooltip() { if (tooltip) tooltip.hidden = true; }

  function abrirPopup(chave) {
    const item = CATALOGO[chave];
    if (!item) return;
    esconderTooltip();
    document.getElementById("dica-titulo").textContent = item.titulo;
    document.getElementById("dica-texto").textContent = item.texto;
    document.getElementById("dica-imagens").innerHTML = (item.imagens || [])
      .map((img) => `<img src="${P}${esc(img)}" alt="Prévia: ${esc(item.titulo)}" loading="lazy">`).join("");
    Util.abrirModal("modal-dica");
  }

  function init() {
    document.addEventListener("mouseover", (e) => {
      const el = e.target.closest?.(".dica");
      if (el) mostrarTooltip(el);
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest?.(".dica") && !e.relatedTarget?.closest?.(".dica")) esconderTooltip();
    });
    // Captura: o clique no "?" não pode acionar o cartão/botão em volta dele.
    document.addEventListener("click", (e) => {
      const el = e.target.closest?.(".dica");
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      abrirPopup(el.dataset.dica);
    }, true);
    document.addEventListener("keydown", (e) => {
      const el = e.target.closest?.(".dica");
      if (el && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        e.stopPropagation();
        abrirPopup(el.dataset.dica);
      }
    }, true);
    window.addEventListener("scroll", esconderTooltip, true);
  }

  return { init, icone, existe, abrirPopup };
})();
