// Markdown -> HTML para as notas (visão "notas"), no espírito do Obsidian.
//
// Segurança: o texto é ESCAPADO antes de qualquer marcação (Util.escapeHtml),
// então nenhum HTML da nota é interpretado. Links só com http(s), mailto ou
// endereço relativo (sem ":"), o que barra "javascript:" e afins.
//
// Cobre: títulos, parágrafos (quebra de linha simples vira <br>, como no
// Obsidian), negrito, itálico, riscado, ==destaque==, `código`, blocos ```,
// citações, listas (aninhadas pelo recuo), tarefas "- [ ]" (clicáveis: cada
// caixa sabe a linha de origem), tabelas, linha horizontal, [texto](url),
// imagens, endereços soltos, [[links entre notas|apelido]] e #tags.
const Markdown = (() => {
  const esc = (s) => Util.escapeHtml(s);

  // URL já escapada (vem do texto escapado). Só esquemas seguros.
  function urlSegura(u) {
    const url = u.trim();
    if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
    return url.includes(":") ? null : url;
  }

  // --------------------------------------------------------------- inline ----
  function inline(textoEscapado, opcoes) {
    const guardados = [];
    const guardar = (html) => `\u0000${guardados.push(html) - 1}\u0000`;
    let s = textoEscapado;

    // Código primeiro: nada dentro dele é formatado.
    s = s.replace(/`([^`]+)`/g, (_, c) => guardar(`<code>${c}</code>`));
    // [[Nota]] e [[Nota|apelido]]
    s = s.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, alvo, apelido) => {
      const titulo = alvo.trim();
      const existe = opcoes.existeNota ? opcoes.existeNota(Util.desescapar(titulo)) : true;
      return guardar(`<a href="#" class="wikilink${existe ? "" : " novo"}" data-nota="${titulo}" title="${existe ? "Abrir" : "Criar"} a nota ${titulo}">${(apelido || titulo).trim()}</a>`);
    });
    // Imagens e links
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => {
      const url = urlSegura(u);
      return url ? guardar(`<img src="${url}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">`) : m;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, texto, u) => {
      const url = urlSegura(u);
      return url ? guardar(`<a href="${url}" target="_blank" rel="noopener noreferrer">${texto}</a>`) : m;
    });
    // Endereço solto
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, (_, antes, u) =>
      `${antes}${guardar(`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`)}`);
    // #tag (não pega "&#39;" do texto escapado: precisa de espaço ou início antes)
    s = s.replace(/(^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu, (_, antes, tag) =>
      `${antes}${guardar(`<a href="#" class="tag" data-tag="${tag}">#${tag}</a>`)}`);

    s = s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])_(?!\s)(.+?)_(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>")
      .replace(/~~(.+?)~~/g, "<del>$1</del>")
      .replace(/==(.+?)==/g, "<mark>$1</mark>");

    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => guardados[Number(i)]);
  }

  // --------------------------------------------------------------- blocos ----
  const RE = {
    cerca: /^\s*```\s*([\w+-]*)\s*$/,
    titulo: /^(#{1,6})\s+(.*?)\s*#*\s*$/,
    linha: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
    citacao: /^\s*>\s?(.*)$/,
    item: /^(\s*)([-*+]|\d+[.)])\s+(.*)$/,
    tarefa: /^\[([ xX])\]\s+(.*)$/,
    separadorTabela: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
  };

  const celulas = (linha) => linha.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  function render(fonte, opcoes = {}) {
    // \u0000 marca os trechos guardados em inline(): não pode vir do texto.
    const linhas = String(fonte ?? "").replace(/\u0000/g, "").replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    let i = 0;

    while (i < linhas.length) {
      const l = linhas[i];

      if (!l.trim()) { i++; continue; }

      const cerca = l.match(RE.cerca);
      if (cerca) {
        const codigo = [];
        i++;
        while (i < linhas.length && !RE.cerca.test(linhas[i])) codigo.push(linhas[i++]);
        i++; // fecha a cerca
        html.push(`<pre><code${cerca[1] ? ` class="lang-${esc(cerca[1])}"` : ""}>${esc(codigo.join("\n"))}</code></pre>`);
        continue;
      }

      const t = l.match(RE.titulo);
      if (t) {
        const n = t[1].length;
        html.push(`<h${n}>${inline(esc(t[2]), opcoes)}</h${n}>`);
        i++;
        continue;
      }

      if (RE.linha.test(l)) { html.push("<hr>"); i++; continue; }

      if (RE.citacao.test(l)) {
        const dentro = [];
        while (i < linhas.length && RE.citacao.test(linhas[i])) dentro.push(linhas[i++].match(RE.citacao)[1]);
        html.push(`<blockquote>${render(dentro.join("\n"), { ...opcoes, semTarefas: true })}</blockquote>`);
        continue;
      }

      if (l.includes("|") && i + 1 < linhas.length && RE.separadorTabela.test(linhas[i + 1])) {
        const cab = celulas(l);
        const alinhar = celulas(linhas[i + 1]).map((c) => (c.endsWith(":") ? (c.startsWith(":") ? "center" : "right") : ""));
        i += 2;
        const corpo = [];
        while (i < linhas.length && linhas[i].includes("|") && linhas[i].trim()) corpo.push(celulas(linhas[i++]));
        const td = (tag, c, k) => `<${tag}${alinhar[k] ? ` style="text-align:${alinhar[k]}"` : ""}>${inline(esc(c), opcoes)}</${tag}>`;
        html.push(`<div class="md-tabela"><table><thead><tr>${cab.map((c, k) => td("th", c, k)).join("")}</tr></thead>` +
          `<tbody>${corpo.map((r) => `<tr>${cab.map((_, k) => td("td", r[k] ?? "", k)).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }

      if (RE.item.test(l)) {
        i = lista(linhas, i, html, opcoes);
        continue;
      }

      // Parágrafo: até a próxima linha vazia ou outro bloco.
      const par = [];
      while (i < linhas.length && linhas[i].trim() && !RE.cerca.test(linhas[i]) && !RE.titulo.test(linhas[i]) &&
             !RE.citacao.test(linhas[i]) && !RE.item.test(linhas[i]) && !RE.linha.test(linhas[i])) {
        par.push(inline(esc(linhas[i].trim()), opcoes));
        i++;
      }
      html.push(`<p>${par.join("<br>")}</p>`);
    }
    return html.join("\n");
  }

  // Listas aninhadas pelo recuo. Devolve o índice da primeira linha depois da lista.
  function lista(linhas, i, html, opcoes) {
    const pilha = []; // [{recuo, tag}]
    const abrir = (recuo, tag) => { pilha.push({ recuo, tag }); html.push(`<${tag}>`); };
    const fechar = () => { html.push(`</li></${pilha.pop().tag}>`); };

    while (i < linhas.length) {
      const m = linhas[i].match(RE.item);
      if (!m) {
        // Linha recuada logo abaixo de um item continua o item.
        if (linhas[i].trim() && /^\s{2,}/.test(linhas[i]) && pilha.length) {
          html.push(`<br>${inline(esc(linhas[i].trim()), opcoes)}`);
          i++;
          continue;
        }
        break;
      }
      const recuo = m[1].replace(/\t/g, "    ").length;
      const tag = /\d/.test(m[2]) ? "ol" : "ul";

      if (!pilha.length || recuo > pilha[pilha.length - 1].recuo) {
        abrir(recuo, tag);
      } else {
        while (pilha.length > 1 && recuo < pilha[pilha.length - 1].recuo) fechar();
        html.push("</li>");
      }

      const tarefa = m[3].match(RE.tarefa);
      if (tarefa) {
        const feito = tarefa[1] !== " ";
        const caixa = opcoes.semTarefas
          ? `<input type="checkbox" disabled ${feito ? "checked" : ""}>`
          : `<input type="checkbox" data-linha="${i}" ${feito ? "checked" : ""} aria-label="Marcar tarefa">`;
        html.push(`<li class="tarefa${feito ? " feita" : ""}">${caixa} <span>${inline(esc(tarefa[2]), opcoes)}</span>`);
      } else {
        html.push(`<li>${inline(esc(m[3]), opcoes)}`);
      }
      i++;
    }
    while (pilha.length > 1) fechar();
    if (pilha.length) html.push(`</li></${pilha.pop().tag}>`);
    return i;
  }

  // Marca/desmarca a tarefa da linha `n` do texto-fonte.
  function alternarTarefa(fonte, n) {
    const linhas = String(fonte).split("\n");
    const l = linhas[n];
    if (l === undefined) return fonte;
    linhas[n] = l.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/, (_, antes, x) => `${antes}[${x === " " ? "x" : " "}]`);
    return linhas.join("\n");
  }

  // #tags de um texto (sem as que estão dentro de código).
  function tags(fonte) {
    const semCodigo = String(fonte ?? "").replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
    const achadas = new Set();
    for (const m of semCodigo.matchAll(/(^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu)) achadas.add(m[2]);
    return [...achadas];
  }

  // Títulos citados em [[...]].
  function links(fonte) {
    return [...String(fonte ?? "").matchAll(/\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim());
  }

  return { render, alternarTarefa, tags, links };
})();
