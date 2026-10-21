// Visão "notas": a tela de um módulo cujo schema declara
//   "visao": { "tipo": "notas", "titulo": <campo>, "conteudo": <campo>, "pasta": <campo opcional> }
// vira um caderno no estilo Obsidian: notas por pasta à esquerda, editor
// Markdown com prévia, [[links]] entre notas, #tags, tarefas clicáveis,
// "mencionada em" e importar/baixar arquivos .md. Cada nota é um registro
// comum do módulo (mesma API, mesma validação); nada aqui conhece um módulo
// específico.
const Notas = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  const MODOS = ["ler", "editar", "dividir"];

  let modulo = null;       // módulo aberto
  let mapa = null;         // { titulo, conteudo, pasta } = ids dos campos
  let notas = [];          // registros do módulo
  let atualId = null;      // nota aberta
  let filtroTag = "";
  let busca = "";
  let pendente = null;     // { id, mudancas } aguardando gravação
  let timer = null;
  let ligado = false;

  const nota = (id) => notas.find((n) => n.id === id);
  const tituloDe = (n) => String(n?.[mapa.titulo] ?? "");
  const conteudoDe = (n) => String(n?.[mapa.conteudo] ?? "");
  const pastaDe = (n) => (mapa.pasta ? String(n?.[mapa.pasta] ?? "").trim().replace(/^\/+|\/+$/g, "") : "");
  const porTitulo = (t) => notas.find((n) => Util.semAcento(tituloDe(n).trim()) === Util.semAcento(String(t).trim()));
  // Modo escolhido (Ler/Editar/Lado a lado); sem escolha, "Ler" no celular e "Lado a lado" no computador.
  const modo = () => {
    const salvo = Util.storage("dashzon.notas.modo");
    if (MODOS.includes(salvo)) return salvo;
    return window.matchMedia("(max-width: 800px)").matches ? "ler" : "dividir";
  };

  // ------------------------------------------------------------ abrir ----
  // `jaNaTela`: navegação entre notas do mesmo módulo (não recarrega a lista).
  async function abrir(slug, idNota, jaNaTela = false) {
    if (!ligado) ligar();
    const outroModulo = modulo?.slug !== slug;
    if (outroModulo || !jaNaTela) {
      await gravarAgora();
      modulo = App.modulo(slug) || (await Api.get(`/api/modulos/${encodeURIComponent(slug)}`));
      mapa = modulo.schema.visao;
      if (outroModulo) { filtroTag = ""; busca = ""; $("notas-busca").value = ""; atualId = null; }
      await carregar();
    }
    $("notas-modulo").textContent = modulo.nome;
    $("notas-descricao").textContent = modulo.descricao || "";
    // Sem nota no endereço: no computador reabre a última; no celular mostra a lista.
    const telaLarga = !window.matchMedia("(max-width: 800px)").matches;
    const alvo = idNota && nota(Number(idNota)) ? Number(idNota) : telaLarga && atualId && nota(atualId) ? atualId : null;
    renderLista();
    if (alvo) mostrar(alvo); else renderVazio();
  }

  async function carregar() {
    const res = await Api.get(`/api/modulos/${modulo.slug}/registros?limite=1000`);
    notas = res.result;
    if (res.count > notas.length) Util.aviso(`Mostrando ${notas.length} de ${res.count} notas`, "erro");
  }

  // ------------------------------------------------------- lista e pastas ----
  function filtradas() {
    const q = Util.semAcento(busca);
    return notas.filter((n) => {
      if (filtroTag && !Markdown.tags(conteudoDe(n)).includes(filtroTag)) return false;
      if (!q) return true;
      return Util.semAcento(tituloDe(n)).includes(q) || Util.semAcento(conteudoDe(n)).includes(q);
    });
  }

  // Árvore de pastas ("A/B" vira A > B). Pastas primeiro, depois as notas, por nome.
  function arvore(lista) {
    const raiz = { pastas: new Map(), notas: [] };
    lista.forEach((n) => {
      let no = raiz;
      pastaDe(n).split("/").filter(Boolean).forEach((p) => {
        if (!no.pastas.has(p)) no.pastas.set(p, { pastas: new Map(), notas: [] });
        no = no.pastas.get(p);
      });
      no.notas.push(n);
    });
    return raiz;
  }

  function htmlArvore(no, caminho) {
    const ordem = (a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
    const pastas = [...no.pastas.keys()].sort(ordem).map((p) => {
      const cam = caminho ? `${caminho}/${p}` : p;
      const fechada = Util.storage(`dashzon.notas.fechada.${modulo.slug}.${cam}`) === "1" && !busca && !filtroTag;
      return `<details class="nota-pasta" data-pasta="${esc(cam)}" ${fechada ? "" : "open"}>
        <summary>${esc(p)}</summary>${htmlArvore(no.pastas.get(p), cam)}</details>`;
    }).join("");
    const itens = [...no.notas].sort((a, b) => ordem(tituloDe(a), tituloDe(b))).map((n) =>
      `<a href="#/m/${encodeURIComponent(modulo.slug)}/${n.id}" class="nota-item ${n.id === atualId ? "active" : ""}" data-id="${n.id}">${esc(tituloDe(n) || "Sem título")}</a>`).join("");
    return pastas + itens;
  }

  function renderLista() {
    const lista = filtradas();
    $("notas-arvore").innerHTML = lista.length ? htmlArvore(arvore(lista), "") :
      `<p class="hint">${notas.length ? "Nenhuma nota com essa busca ou tag." : "Nenhuma nota ainda."}</p>`;
    $("notas-arvore").querySelectorAll("details").forEach((d) => d.addEventListener("toggle", () => {
      Util.storage(`dashzon.notas.fechada.${modulo.slug}.${d.dataset.pasta}`, d.open ? "0" : "1");
    }));

    // Tags de todas as notas, com contagem.
    const contagem = new Map();
    notas.forEach((n) => Markdown.tags(conteudoDe(n)).forEach((t) => contagem.set(t, (contagem.get(t) || 0) + 1)));
    const tags = [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
    $("notas-tags").innerHTML = tags.map(([t, n]) =>
      `<button type="button" class="tag ${t === filtroTag ? "ativa" : ""}" data-tag="${esc(t)}" aria-pressed="${t === filtroTag}">#${esc(t)} <span>${n}</span></button>`).join("");
    $("notas-tags").hidden = !tags.length;

    $("notas-contagem").textContent = `${lista.length} de ${notas.length} nota(s)`;
    $("notas-pastas").innerHTML = [...new Set(notas.map(pastaDe).filter(Boolean))].sort().map((p) => `<option value="${esc(p)}">`).join("");
  }

  // ----------------------------------------------------------- uma nota ----
  function renderVazio() {
    atualId = null;
    $("notas").classList.remove("com-nota");
    $("nota-painel").hidden = true;
    $("nota-vazia").hidden = false;
  }

  function mostrar(id) {
    const n = nota(id);
    if (!n) return renderVazio();
    atualId = id;
    $("notas").classList.add("com-nota");
    $("nota-vazia").hidden = true;
    $("nota-painel").hidden = false;
    $("nota-titulo").value = tituloDe(n);
    $("nota-pasta-campo").hidden = !mapa.pasta;
    $("nota-pasta").value = pastaDe(n);
    $("nota-editor").value = conteudoDe(n);
    status("salvo");
    // Visualizador: só lê (cada tecla viraria um pedido de aprovação).
    const soLer = App.usuario()?.perfil === "visualizador";
    ["nota-titulo", "nota-pasta", "nota-editor"].forEach((id) => { $(id).readOnly = soLer; });
    if (soLer) $("nota-status").textContent = "Somente leitura";
    aplicarModo(modo());
    renderPrevia();
    document.querySelectorAll("#notas-arvore .nota-item").forEach((a) => a.classList.toggle("active", Number(a.dataset.id) === id));
  }

  function aplicarModo(m) {
    $("nota-corpo").className = `nota-corpo modo-${m}`;
    document.querySelectorAll("#nota-modos button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.modo === m)));
  }

  function renderPrevia() {
    const n = nota(atualId);
    if (!n) return;
    const texto = $("nota-editor").value;
    $("nota-previa").innerHTML = Markdown.render(texto, { existeNota: (t) => Boolean(porTitulo(t)) }) ||
      '<p class="hint">Nota vazia. Escreva em Markdown no editor.</p>';

    // "Mencionada em": notas que têm [[este título]].
    const titulo = Util.semAcento(tituloDe(n).trim());
    const citam = notas.filter((x) => x.id !== n.id && Markdown.links(conteudoDe(x)).some((l) => Util.semAcento(l) === titulo));
    $("nota-backlinks").innerHTML = citam.length
      ? `<h3>Mencionada em</h3>${citam.map((x) => `<a href="#/m/${encodeURIComponent(modulo.slug)}/${x.id}" class="nota-item">${esc(tituloDe(x))}</a>`).join("")}`
      : "";
  }

  // --------------------------------------------------------- gravação ----
  function status(s) {
    const txt = { salvo: "Salvo", salvando: "Salvando…", pendente: "Alterado", erro: "Erro ao salvar" }[s];
    $("nota-status").textContent = txt;
    $("nota-status").className = `nota-status ${s}`;
  }

  // As edições são gravadas sozinhas, 700 ms depois da última tecla (só os campos que mudaram).
  function agendar(campo, valor) {
    if (App.usuario()?.perfil === "visualizador") return;
    if (!pendente || pendente.id !== atualId) pendente = { id: atualId, mudancas: {} };
    pendente.mudancas[campo] = valor;
    const n = nota(atualId);
    if (n) n[campo] = valor;
    status("pendente");
    clearTimeout(timer);
    timer = setTimeout(gravarAgora, 700);
  }

  async function gravarAgora() {
    clearTimeout(timer);
    if (!pendente) return;
    const { id, mudancas } = pendente;
    pendente = null;
    if (id === atualId) status("salvando");
    try {
      const novo = await Api.patch(`/api/modulos/${modulo.slug}/registros/${id}`, mudancas);
      const i = notas.findIndex((n) => n.id === id);
      if (i >= 0) notas[i] = { ...notas[i], ...novo };
      if (id === atualId) status("salvo");
      if (mapa.titulo in mudancas || (mapa.pasta && mapa.pasta in mudancas)) renderLista();
    } catch (e) {
      if (id === atualId) status("erro");
      Util.aviso(e.message, "erro");
    }
  }

  // ---------------------------------------------------------- ações ----
  function tituloLivre(base) {
    let t = base;
    for (let k = 2; porTitulo(t); k++) t = `${base} ${k}`;
    return t;
  }

  async function criar(titulo, pasta = "", conteudo = "") {
    const dados = { [mapa.titulo]: titulo, [mapa.conteudo]: conteudo };
    if (mapa.pasta) dados[mapa.pasta] = pasta;
    const novo = await Api.post(`/api/modulos/${modulo.slug}/registros`, dados);
    notas.push(novo);
    return novo;
  }

  async function novaNota() {
    await gravarAgora();
    const pasta = pastaDe(nota(atualId));
    const n = await criar(tituloLivre("Sem título"), pasta);
    App.recarregarNav();
    location.hash = `#/m/${encodeURIComponent(modulo.slug)}/${n.id}`;
    aplicarModo(modo() === "ler" ? "editar" : modo());
    setTimeout(() => { $("nota-titulo").focus(); $("nota-titulo").select(); }, 50);
  }

  async function excluir() {
    const n = nota(atualId);
    if (!n || !confirm(`Excluir a nota "${tituloDe(n)}"?`)) return;
    pendente = null;
    await Api.del(`/api/modulos/${modulo.slug}/registros/${n.id}`);
    notas = notas.filter((x) => x.id !== n.id);
    atualId = null;
    App.recarregarNav();
    history.replaceState(null, "", `#/m/${encodeURIComponent(modulo.slug)}`);
    renderLista();
    renderVazio();
    Util.aviso("Nota excluída");
  }

  async function abrirLink(titulo) {
    await gravarAgora();
    let alvo = porTitulo(titulo);
    if (!alvo) {
      if (!confirm(`A nota "${titulo}" ainda não existe. Criar agora?`)) return;
      alvo = await criar(titulo.trim(), pastaDe(nota(atualId)), `# ${titulo.trim()}\n\n`);
      App.recarregarNav();
    }
    location.hash = `#/m/${encodeURIComponent(modulo.slug)}/${alvo.id}`;
  }

  const arquivoMd = (n) => `${Util.nomeArquivo(tituloDe(n))}.md`;

  function baixarNota() {
    const n = nota(atualId);
    if (n) Util.baixar(arquivoMd(n), conteudoDe(n), "text/markdown;charset=utf-8");
  }

  async function baixarTudo() {
    await gravarAgora();
    if (!notas.length) { Util.aviso("Não há notas para baixar"); return; }
    const usados = new Set();
    const arquivos = notas.map((n) => {
      const pasta = pastaDe(n).split("/").filter(Boolean).map(Util.nomeArquivo).join("/");
      let nome = `${pasta ? `${pasta}/` : ""}${arquivoMd(n)}`;
      for (let k = 2; usados.has(nome.toLowerCase()); k++) nome = nome.replace(/( \d+)?\.md$/, ` ${k}.md`);
      usados.add(nome.toLowerCase());
      return { nome, conteudo: conteudoDe(n) };
    });
    Util.baixar(`${Util.nomeArquivo(modulo.nome)}.zip`, Util.zip(arquivos));
  }

  // Importa arquivos .md (ou uma pasta inteira, como um cofre do Obsidian). Nota
  // com o mesmo título na mesma pasta é atualizada; as outras são criadas.
  async function importar(arquivos, deUmaPasta) {
    const lista = [...arquivos].filter((f) => /\.(md|markdown|txt)$/i.test(f.name) && !/(^|\/)\./.test(f.webkitRelativePath || f.name));
    if (!lista.length) { Util.aviso("Nenhum arquivo .md encontrado", "erro"); return; }
    await gravarAgora();
    let novas = 0, atualizadas = 0;
    const erros = [];
    for (const f of lista) {
      try {
        const texto = (await Util.lerArquivo(f)).replace(/^﻿/, "");
        const titulo = f.name.replace(/\.(md|markdown|txt)$/i, "").trim();
        // "Cofre/Matemática/Funções.md" -> pasta "Matemática" (o nome da pasta escolhida não entra).
        const partes = deUmaPasta ? (f.webkitRelativePath || "").split("/").slice(1, -1) : [];
        const pasta = mapa.pasta ? partes.join("/") : "";
        const existente = notas.find((n) => Util.semAcento(tituloDe(n)) === Util.semAcento(titulo) &&
          Util.semAcento(pastaDe(n)) === Util.semAcento(pasta));
        if (existente) {
          const novo = await Api.patch(`/api/modulos/${modulo.slug}/registros/${existente.id}`, { [mapa.conteudo]: texto });
          Object.assign(existente, novo);
          atualizadas++;
        } else {
          await criar(titulo, pasta, texto);
          novas++;
        }
      } catch (e) {
        erros.push(`${f.name}: ${e.message}`);
      }
    }
    renderLista();
    if (atualId) mostrar(atualId);
    await App.recarregarNav();
    Util.aviso(`Importadas: ${novas} nova(s), ${atualizadas} atualizada(s)${erros.length ? `, ${erros.length} com erro (${erros[0]})` : ""}`,
      erros.length ? "erro" : "info");
  }

  // ------------------------------------------------------------ init ----
  function ligar() {
    ligado = true;
    $("notas-nova").addEventListener("click", novaNota);
    $("notas-vazia-nova").addEventListener("click", novaNota);
    $("notas-baixar-tudo").addEventListener("click", baixarTudo);
    $("notas-estrutura").addEventListener("click", () => Modulos.abrirEstrutura(modulo));
    $("notas-btn-importar").addEventListener("click", () => $("notas-importar").click());
    $("notas-btn-importar-pasta").addEventListener("click", () => $("notas-importar-pasta").click());
    $("notas-importar").addEventListener("change", (e) => { importar(e.target.files, false); e.target.value = ""; });
    $("notas-importar-pasta").addEventListener("change", (e) => { importar(e.target.files, true); e.target.value = ""; });
    $("notas-busca").addEventListener("input", Util.debounce((e) => { busca = e.target.value.trim(); renderLista(); }, 150));
    $("notas-voltar").addEventListener("click", () => { history.replaceState(null, "", `#/m/${encodeURIComponent(modulo.slug)}`); renderLista(); renderVazio(); });

    $("notas-tags").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tag]");
      if (!b) return;
      filtroTag = filtroTag === b.dataset.tag ? "" : b.dataset.tag;
      renderLista();
    });

    $("nota-titulo").addEventListener("input", (e) => agendar(mapa.titulo, e.target.value));
    $("nota-pasta").addEventListener("input", (e) => agendar(mapa.pasta, e.target.value));
    $("nota-editor").addEventListener("input", (e) => { agendar(mapa.conteudo, e.target.value); renderPrevia(); });
    $("nota-titulo").addEventListener("blur", gravarAgora);
    $("nota-excluir").addEventListener("click", excluir);
    $("nota-baixar").addEventListener("click", baixarNota);
    document.querySelectorAll("#nota-modos button").forEach((b) => b.addEventListener("click", () => {
      Util.storage("dashzon.notas.modo", b.dataset.modo);
      aplicarModo(b.dataset.modo);
      if (b.dataset.modo !== "ler") $("nota-editor").focus();
    }));

    // Cliques na prévia: [[link]], #tag e caixas de tarefa.
    $("nota-previa").addEventListener("click", (e) => {
      const link = e.target.closest(".wikilink");
      if (link) { e.preventDefault(); abrirLink(link.dataset.nota); return; }
      const tag = e.target.closest(".tag");
      if (tag) { e.preventDefault(); filtroTag = tag.dataset.tag; renderLista(); return; }
    });
    $("nota-previa").addEventListener("change", (e) => {
      const cx = e.target.closest("input[data-linha]");
      if (!cx) return;
      const novo = Markdown.alternarTarefa($("nota-editor").value, Number(cx.dataset.linha));
      $("nota-editor").value = novo;
      agendar(mapa.conteudo, novo);
      renderPrevia();
    });

    // Atalho: Ctrl+S grava na hora (e não abre o "salvar página" do navegador).
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && document.getElementById("view-notas").classList.contains("active")) {
        e.preventDefault();
        gravarAgora();
      }
    });
    window.addEventListener("beforeunload", (e) => { if (pendente) { gravarAgora(); e.preventDefault(); } });
  }

  // Botão "Nota" de outro módulo (ex.: uma sessão do cronograma): abre a nota
  // com esse título no módulo de notas, ou cria uma.
  async function abrirOuCriar(slugNotas, titulo, pasta) {
    const t = String(titulo || "").trim();
    if (!t) { Util.aviso("Este registro não tem título para a nota", "erro"); return; }
    const alvo = App.modulo(slugNotas);
    if (!alvo?.schema?.visao) { Util.aviso("O módulo de anotações não está instalado. Adicione em Configurações > Módulos.", "erro"); return; }
    const v = alvo.schema.visao;
    const res = await Api.get(`/api/modulos/${slugNotas}/registros?q=${encodeURIComponent(t)}&limite=1000`);
    let n = res.result.find((x) => Util.semAcento(String(x[v.titulo] ?? "").trim()) === Util.semAcento(t));
    if (!n) {
      const dados = { [v.titulo]: t, [v.conteudo]: `# ${t}\n\n` };
      if (v.pasta && pasta) dados[v.pasta] = pasta;
      n = await Api.post(`/api/modulos/${slugNotas}/registros`, dados);
      if (modulo?.slug === slugNotas) notas.push(n);
      await App.recarregarNav();
    }
    location.hash = `#/m/${encodeURIComponent(slugNotas)}/${n.id}`;
  }

  // Depois de mudar a estrutura do módulo: a próxima abertura relê tudo.
  function esquecer() { modulo = null; mapa = null; atualId = null; }

  return { abrir, abrirOuCriar, gravarAgora, esquecer };
})();
