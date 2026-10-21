// Ícones de ajuda "(?)" com prévia em imagem. Passar o mouse mostra a imagem
// (tooltip flutuante); clicar abre um popup com o texto e as imagens.
// As imagens ficam em frontend/preview/ (prints tirados com dados fictícios).
const Ajuda = (() => {
  const P = "/preview/";

  const CATALOGO = {
    // --- tipos de card ------------------------------------------------------
    "card-kpi": {
      titulo: "Número (KPI)",
      texto: "Um número grande, como o total de processos, os que estão em análise ou os de prazo judicial. Use quando a pergunta é \"quanto?\" ou \"quantos?\" e não precisa comparar grupos.",
      imagens: ["card-kpi.png"]
    },
    "card-bar": {
      titulo: "Barras",
      texto: "Compara grupos lado a lado: demandas por divisão, por prioridade, processos por situação. Clique numa barra para ver os registros dela. Com \"Cores por\", cada barra se divide em séries (até 2 ficam lado a lado, mais que isso ficam empilhadas).",
      imagens: ["card-bar.png"]
    },
    "card-line": {
      titulo: "Linha",
      texto: "Mostra a evolução no tempo. Funciona melhor separando por um campo de data (agrupado por mês).",
      imagens: ["card-line.png"]
    },
    "card-table": {
      titulo: "Tabela",
      texto: "Lista cada grupo com a quantidade e o valor calculado. Boa para ver números exatos ou quando há muitos grupos. Clique num grupo para ver os registros.",
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
      imagens: ["modulo-demandas.png"]
    },

    // --- módulos ------------------------------------------------------------
    "modulo-demandas": { titulo: "Gestão de Demandas - DGEO", texto: "Processos, ordens de serviço e chamados do DGEO: título, status da tramitação, prioridade (até urgente por prazo legal ou judicial), divisão responsável (DCAD, DTAD, DASI ou o gabinete), servidor, prazo legal, custo estimado e número do processo SEI. A divisão liga a demanda à unidade: cada um edita o que é da sua unidade, e o gestor, tudo o que está abaixo dele.", imagens: ["modulo-demandas.png"] },
    "modulo-processos_sei": { titulo: "Processos SEI", texto: "Acompanhamento resumido dos processos no SEI!: número, assunto, unidade responsável, situação, se a ciência foi dada, onde o processo está agora, prazo e o último andamento.", imagens: ["modulo-demandas.png"] },
    "modulo-inventario_dados": { titulo: "Inventário de dados", texto: "Mapa das bases de dados de cada unidade: origem (SEI!, sistema municipal, planilha, SIG...), responsável, classificação pela LAI, dados pessoais (LGPD), publicação em dados abertos e qualidade.", imagens: ["modulo-inventario_dados.png"] },
    "modulo-indicadores": { titulo: "Indicadores das unidades", texto: "Medições periódicas de cada unidade: valor medido, meta, unidade de medida, período e se atingiu a meta.", imagens: ["modulo-indicadores.png"] },
    "modulo-anotacoes": { titulo: "Anotações", texto: "Caderno de notas em Markdown, como no Obsidian: pastas, [[links]] entre notas, #tags, tarefas que se marcam com um clique e importação/exportação de arquivos .md.", imagens: ["modulo-anotacoes.png"] },

    // --- templates (galeria) -------------------------------------------------
    "template-gestao-demandas": { titulo: "Gestão de demandas e processos SEI (DGEO)", texto: "Instala a Gestão de Demandas do DGEO e os Processos SEI, com dashboards por divisão, prioridade, situação e calendário de prazos. Os dois alimentam o Painel do gestor.", imagens: ["modulo-demandas.png"] },
    "template-anotacoes": { titulo: "Anotações da unidade", texto: "Instala o caderno de notas em Markdown: pastas, [[links]], #tags, tarefas e arquivos .md (atas, rotinas, procedimentos).", imagens: ["modulo-anotacoes.png"] },
    "template-mapeamento-setor": { titulo: "Mapeamento de dados das unidades", texto: "Instala o Inventário de dados (LAI e LGPD) e os Indicadores das unidades, com um dashboard por unidade, classificação, dados pessoais e qualidade.", imagens: ["modulo-inventario_dados.png", "modulo-indicadores.png"] },

    "criar-modulo": {
      titulo: "Criar um módulo em JSON",
      texto: "Um módulo é uma lista de campos. Cada campo tem id, nome e tipo (texto, texto_longo, markdown, numero, moeda, data, hora, selecao, booleano ou movimento). Seleção precisa de \"opcoes\". O \"resumo\" define os números do topo da tela, e \"ordenacao\" (opcional) a ordem da lista, como [{\"campo\": \"data\", \"direcao\": \"asc\"}]. Campos sim/não aparecem na tabela como caixas de marcar (checklist). Opcionais: \"visao\": {\"tipo\": \"notas\", ...} transforma o módulo num caderno de notas; \"nota\" liga cada registro a uma nota; \"configuracoes\" lista os campos ajustáveis em Configurações > Módulos; \"unidade\" diz qual campo liga o registro a uma unidade da prefeitura (pela sigla) e \"produtividade\" ({\"status\", \"concluido\", \"encerrado\", \"prazo\"}) põe o módulo no Painel do gestor. O nome do módulo precisa ser único. Com \"Começar do zero\" você recebe um exemplo pronto para editar. A tela gerada fica assim:",
      imagens: ["modulo-demandas.png"]
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
