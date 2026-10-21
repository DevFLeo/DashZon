// Expansão de um card (a pedido): clicar numa barra, numa fatia, numa linha
// da tabela ou num dia do calendário abre os registros que estão por trás
// daquele número. Ex.: em "Demandas por prioridade", clicar em "Média" lista
// as demandas de prioridade média, quais departamentos estão com elas e até
// quando vão os prazos; no calendário, o que vence naquele dia.
//
// Só lê: usa a mesma busca da tela do módulo (/api/modulos/:slug/registros)
// com o filtro do card mais a categoria clicada. O card não muda.
const Expandir = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = Util.escapeHtml;
  let moduloAtual = null;
  let aoFechar = null;

  const campoDe = (m, id) => m.schema.campos.find((c) => c.id === id);

  // Campo de data que funciona como prazo: o declarado na produtividade ou o primeiro de data.
  function campoPrazo(m) {
    const id = m.schema.produtividade?.prazo;
    return (id && campoDe(m, id)) || m.schema.campos.find((c) => c.tipo === "data") || null;
  }

  // Por onde resumir: o campo de unidade do módulo; senão a primeira seleção fora do filtro.
  function campoResumo(m, filtrados) {
    const u = m.schema.unidade && campoDe(m, m.schema.unidade);
    if (u && !filtrados.includes(u.id)) return u;
    return m.schema.campos.find((c) => c.tipo === "selecao" && !filtrados.includes(c.id)) || null;
  }

  // Descreve o que foi clicado: "Prioridade: Média · Divisão: DTAD".
  function descrever(m, filtro, extras) {
    return [...Object.entries(filtro), ...extras].map(([k, v]) => {
      const c = campoDe(m, k);
      return `${c ? c.nome : k}: ${c ? (c.tipo === "data" ? Util.fmtData(v) : Util.rotuloChave(c, v)) : v}`;
    }).join(" · ");
  }

  // `porChave`: categoria clicada { campo, chave, formato }; `serie`: { campo, chave }.
  async function abrir({ slug, titulo, filtro = {}, porChave = null, serie = null, depois = null }) {
    const m = App.modulo(slug);
    if (!m) return;
    moduloAtual = m;
    aoFechar = depois;
    const f = { ...filtro };
    const extras = [];
    let local = () => true;
    for (const alvo of [porChave, serie]) {
      if (!alvo || alvo.chave === undefined || alvo.chave === null) continue;
      const c = campoDe(m, alvo.campo);
      if (alvo.chave === "(vazio)") {
        local = ((antes) => (r) => antes(r) && (r[alvo.campo] === null || r[alvo.campo] === undefined || r[alvo.campo] === ""))(local);
        extras.push([alvo.campo, "(vazio)"]);
      } else if (alvo.formato === "mes" || (c?.tipo === "data" && String(alvo.chave).length === 7)) {
        // Mês (AAAA-MM): a busca filtra por igualdade, então o recorte do mês é feito aqui.
        local = ((antes) => (r) => antes(r) && String(r[alvo.campo] || "").startsWith(alvo.chave))(local);
        extras.push([alvo.campo, Util.fmtMes ? Util.fmtMes(alvo.chave) : alvo.chave]);
      } else {
        f[alvo.campo] = String(alvo.chave);
      }
    }

    const prazo = campoPrazo(m);
    const qs = new URLSearchParams({ limite: "1000" });
    Object.entries(f).forEach(([k, v]) => qs.set(`f[${k}]`, v));
    if (prazo) qs.set("ordem", `${prazo.id}:asc`);
    $("exp-titulo").textContent = titulo;
    $("exp-sub").textContent = "Carregando...";
    $("exp-resumo").innerHTML = "";
    $("exp-lista").innerHTML = "";
    Util.abrirModal("modal-expandir");
    try {
      const res = await Api.get(`/api/modulos/${encodeURIComponent(slug)}/registros?${qs}`);
      const lista = res.result.filter(local);
      const filtro_txt = descrever(m, f, extras);
      $("exp-sub").textContent = `${Util.fmtNumero(lista.length, 0)} registro(s) em ${m.nome}${filtro_txt ? ` · ${filtro_txt}` : ""}${res.count > res.result.length ? ` (lidos ${res.result.length} de ${res.count})` : ""}`;
      renderResumo(m, lista, Object.keys(f).concat(extras.map(([k]) => k)), prazo);
      renderLista(m, lista, prazo);
    } catch (e) {
      $("exp-sub").textContent = e.message;
    }
  }

  function renderResumo(m, lista, filtrados, prazo) {
    const campo = campoResumo(m, filtrados);
    if (!campo || !lista.length) return;
    const hoje = Util.hojeISO();
    const grupos = new Map();
    lista.forEach((r) => {
      const k = r[campo.id] ?? "(vazio)";
      const g = grupos.get(k) || { n: 0, proximo: null, ultimo: null, atrasados: 0 };
      g.n++;
      const p = prazo && r[prazo.id];
      if (p) {
        if (p >= hoje && (!g.proximo || p < g.proximo)) g.proximo = p;
        if (!g.ultimo || p > g.ultimo) g.ultimo = p;
        if (p < hoje && !concluido(m, r)) g.atrasados++;
      }
      grupos.set(k, g);
    });
    const ordem = Util.opcoesDe(campo).map((o) => o.v);
    const linhas = [...grupos.entries()].sort((a, b) => (ordem.indexOf(a[0]) + 1 || 999) - (ordem.indexOf(b[0]) + 1 || 999) || b[1].n - a[1].n);
    $("exp-resumo").innerHTML = `<h3 class="exp-h3">Por ${esc(campo.nome.toLowerCase())}</h3><div class="table-wrap"><table class="data">
      <thead><tr><th>${esc(campo.nome)}</th><th class="num">Qtd.</th>${prazo ? `<th>Próximo prazo</th><th>Vai até</th><th class="num">Atrasados</th>` : ""}</tr></thead>
      <tbody>${linhas.map(([k, g]) => `<tr><td>${esc(Util.rotuloChave(campo, k))}</td><td class="num">${Util.fmtNumero(g.n, 0)}</td>
        ${prazo ? `<td>${g.proximo ? Util.fmtData(g.proximo) : "—"}</td><td>${g.ultimo ? Util.fmtData(g.ultimo) : "—"}</td>
        <td class="num ${g.atrasados ? "prod-alerta" : ""}">${Util.fmtNumero(g.atrasados, 0)}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
  }

  function concluido(m, r) {
    const p = m.schema.produtividade;
    if (!p) return false;
    return [...(p.concluido || []), ...(p.encerrado || [])].includes(r[p.status]);
  }

  function renderLista(m, lista, prazo) {
    if (!lista.length) { $("exp-lista").innerHTML = '<p class="hint">Nenhum registro.</p>'; return; }
    const rot = campoDe(m, m.schema.rotulo);
    const importantes = [m.schema.unidade, m.schema.produtividade?.status, prazo?.id].filter(Boolean);
    const cols = [rot, ...importantes.map((id) => campoDe(m, id)),
      ...m.schema.campos.filter((c) => c.lista !== false && c.id !== rot.id && !importantes.includes(c.id))]
      .filter(Boolean).slice(0, 6);
    const hoje = Util.hojeISO();
    $("exp-lista").innerHTML = `<h3 class="exp-h3">Registros</h3><div class="table-wrap"><table class="data">
      <thead><tr>${cols.map((c) => `<th>${esc(c.nome)}</th>`).join("")}<th></th></tr></thead>
      <tbody>${lista.slice(0, 300).map((r) => `<tr>${cols.map((c) => {
        const v = r[c.id];
        const atrasado = prazo && c.id === prazo.id && v && v < hoje && !concluido(m, r);
        return `<td class="${atrasado ? "prod-alerta" : ""}">${c.id === rot.id ? `<strong>${esc(Util.fmtValor(c, v))}</strong>` : esc(Util.fmtValor(c, v))}${atrasado ? " (atrasado)" : ""}</td>`;
      }).join("")}<td><button type="button" class="btn btn-sm" data-exp-abrir="${r.id}">Abrir</button></td></tr>`).join("")}</tbody></table></div>
      ${lista.length > 300 ? `<p class="hint">Mostrando 300 de ${lista.length}. Use o módulo para ver todos.</p>` : ""}`;
    $("exp-lista").querySelectorAll("[data-exp-abrir]").forEach((b) => b.addEventListener("click", () => {
      Util.fecharModal("modal-expandir");
      Modulos.editar(m.slug, Number(b.dataset.expAbrir), aoFechar);
    }));
  }

  function init() {
    $("exp-abrir-modulo").addEventListener("click", () => {
      Util.fecharModal("modal-expandir");
      if (moduloAtual) App.ir(`#/m/${encodeURIComponent(moduloAtual.slug)}`);
    });
  }

  return { init, abrir };
})();
