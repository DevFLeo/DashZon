"use client";
// Tela do módulo: resumo, busca, filtros, tabela com checklist e o formulário
// de registro. Mesmo comportamento do oficial (frontend/js/modulos.js):
// - a lista vem do motor de busca, mas "Editar" lê o registro do banco;
// - sim/não marca direto na tabela (PATCH só daquele campo);
// - o perfil visualizador recebe 202 {pendente, mensagem}: vira um pedido.
import { useEffect, useRef, useState } from "react";
import { Confirmar, Icone, Janela, avisar } from "./Base.jsx";
import { Api, NUMERICOS, SERIES, fmtMoeda, fmtNumero, fmtValor, opcoesDe, resolverToken } from "./logica.js";

const FORA_DA_TABELA = ["texto_longo", "markdown"];

function Resumo({ itens, moeda }) {
  if (!itens?.length) return null;
  return (
    <div className="resumo">
      {itens.map((r) => {
        const texto = r.agregacao === "contagem" ? fmtNumero(r.valor, 0) : r.formato === "moeda" ? fmtMoeda(r.valor, moeda) : fmtNumero(r.valor);
        const sinal = r.agregacao === "saldo" ? (r.valor >= 0 ? "positivo" : "negativo") : "";
        return <div key={r.titulo} className="resumo-item"><span>{r.titulo}</span><strong className={`card-numero ${sinal}`}>{texto}</strong></div>;
      })}
    </div>
  );
}

// Movimento e sim/não primeiro (os filtros mais usados), depois seleções.
const PRIORIDADE = { movimento: 0, booleano: 1, selecao: 2 };

function Filtros({ campos, valores, onMudar }) {
  const filtraveis = campos.filter((c) => SERIES.includes(c.tipo)).sort((a, b) => PRIORIDADE[a.tipo] - PRIORIDADE[b.tipo]).slice(0, 4);
  return filtraveis.map((c) => (
    <select key={c.id} className="campo" value={valores[c.id] || ""} aria-label={`Filtrar por ${c.nome}`}
      onChange={(e) => onMudar({ ...valores, [c.id]: e.target.value })}>
      <option value="">{c.nome}: todos</option>
      {opcoesDe(c).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  ));
}

function Celula({ campo, registro, rotulo, moeda, onMarcar, pode }) {
  const v = registro[campo.id];
  const nome = { "data-rotulo": campo.nome };
  if (campo.tipo === "booleano") {
    return (
      <td className="cel-check" {...nome}>
        <input type="checkbox" checked={!!v} disabled={!pode} onChange={(e) => onMarcar(registro, campo, e.target.checked)}
          aria-label={`${campo.nome}: ${registro[rotulo] ?? `registro ${registro.id}`}`} />
      </td>
    );
  }
  if (campo.tipo === "movimento" && v) return <td {...nome}><span className={`chip chip-${v}`}>{fmtValor(campo, v)}</span></td>;
  if (campo.tipo === "selecao" && v) return <td {...nome}><span className="chip">{v}</span></td>;
  const texto = fmtValor(campo, v, moeda);
  return <td className={NUMERICOS.includes(campo.tipo) ? "num" : ""} {...nome}>{campo.id === rotulo ? <strong>{texto}</strong> : texto}</td>;
}

function Campo({ campo, valor, onMudar }) {
  const id = `r-${campo.id}`;
  const ajuda = campo.ajuda && <small className="ajuda">{campo.ajuda}</small>;
  if (campo.tipo === "booleano") {
    return (
      <div className="campo-form campo-check">
        <label><input id={id} type="checkbox" checked={!!valor} onChange={(e) => onMudar(e.target.checked)} /> {campo.nome}</label>{ajuda}
      </div>
    );
  }
  const rotulo = <label htmlFor={id} className={campo.obrigatorio ? "obrigatorio" : ""}>{campo.nome}</label>;
  let entrada;
  if (campo.tipo === "texto_longo" || campo.tipo === "markdown") {
    entrada = <textarea id={id} className="campo" rows={campo.tipo === "markdown" ? 8 : 4} required={campo.obrigatorio} value={valor ?? ""} onChange={(e) => onMudar(e.target.value)} />;
  } else if (campo.tipo === "selecao" || campo.tipo === "movimento") {
    const opcoes = opcoesDe(campo);
    // Valor gravado com uma opção que saiu da estrutura continua na lista,
    // senão o navegador apagaria o valor ao salvar (como no oficial).
    const removida = valor && !opcoes.some((o) => o.v === valor);
    entrada = (
      <select id={id} className="campo" required={campo.obrigatorio} value={valor ?? ""} onChange={(e) => onMudar(e.target.value)}>
        {!(campo.obrigatorio && valor) && <option value="">—</option>}
        {removida && <option value={valor}>{valor} (opção removida)</option>}
        {opcoes.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    );
  } else {
    const tipo = { numero: "number", moeda: "number", data: "date", hora: "time" }[campo.tipo] || "text";
    const passo = campo.tipo === "moeda" ? "0.01" : campo.tipo === "numero" ? "any" : undefined;
    entrada = <input id={id} className="campo" type={tipo} step={passo} inputMode={passo ? "decimal" : undefined}
      required={campo.obrigatorio} value={valor ?? ""} onChange={(e) => onMudar(e.target.value)} />;
  }
  return <div className="campo-form">{rotulo}{entrada}{ajuda}</div>;
}

function FormRegistro({ modulo, registro, aberta, onFechar, onSalvo }) {
  const [dados, setDados] = useState({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campos = modulo.schema.campos;

  useEffect(() => {
    if (!aberta) return;
    setErro("");
    setDados(Object.fromEntries(campos.map((c) => [c.id, registro ? registro[c.id] : resolverToken(c.padrao)])));
  }, [aberta, registro, campos]);

  async function salvar(ev) {
    ev.preventDefault();
    setEnviando(true);
    setErro("");
    const corpo = {};
    for (const c of campos) {
      const v = dados[c.id];
      if (c.tipo === "booleano") corpo[c.id] = !!v;
      else if (v === "" || v === undefined) corpo[c.id] = null;
      else corpo[c.id] = NUMERICOS.includes(c.tipo) ? Number(v) : v;
    }
    try {
      const base = `/api/modulos/${encodeURIComponent(modulo.slug)}/registros`;
      const r = registro ? await Api.put(`${base}/${registro.id}`, corpo) : await Api.post(base, corpo);
      if (r?.pendente) avisar(r.mensagem);
      else avisar(registro ? "Registro atualizado" : `Lançado em ${modulo.nome}`);
      onSalvo();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Janela titulo={`${registro ? "Editar registro" : "Novo registro"} · ${modulo.nome}`} aberta={aberta} onFechar={onFechar}
      rodape={<>
        <button type="button" className="btn" onClick={onFechar}>Cancelar</button>
        <button type="submit" form="form-registro" className="btn btn-primario" disabled={enviando}>{enviando ? "Salvando…" : "Salvar"}</button>
      </>}>
      <form id="form-registro" className="form-registro" onSubmit={salvar}>
        {campos.map((c) => (
          <Campo key={c.id} campo={c} valor={dados[c.id]}
            onMudar={(v) => setDados((d) => ({ ...d, [c.id]: v }))} />
        ))}
        {erro && <div className="card-erro" role="alert">{erro}</div>}
      </form>
    </Janela>
  );
}

export function Modulo({ slug, sessao, onMudou = () => {} }) {
  const [modulo, setModulo] = useState(() => sessao.modulos.find((m) => m.slug === slug) || null);
  const [resumo, setResumo] = useState(null);
  const [regs, setRegs] = useState(null);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [filtros, setFiltros] = useState({});
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({ aberta: false, registro: null });
  const [excluir, setExcluir] = useState(null);
  // Cada busca ganha um número: resposta atrasada de uma busca antiga
  // (digitação rápida) é descartada em vez de sobrescrever a tabela.
  const ultima = useRef(0);
  const base = `/api/modulos/${encodeURIComponent(slug)}`;

  async function carregarRegistros(mais = false, atuais = []) {
    const qs = new URLSearchParams();
    if (busca.trim()) qs.set("q", busca.trim());
    Object.entries(filtros).forEach(([k, v]) => { if (v) qs.set(`f[${k}]`, v); });
    if (mais) qs.set("inicio", atuais.length);
    const minha = ++ultima.current;
    try {
      const r = await Api.get(`${base}/registros?${qs}`);
      if (minha !== ultima.current) return;
      setRegs(mais ? atuais.concat(r.result) : r.result);
      setTotal(r.count);
    } catch (e) { if (minha === ultima.current) setErro(e.message); }
  }
  const carregarResumo = () => Api.get(`${base}/resumo`).then(setResumo).catch(() => setResumo([]));

  useEffect(() => {
    setErro(""); setRegs(null); setResumo(null); setBusca("");
    setFiltros((f) => (Object.keys(f).length ? {} : f));
    Api.get(base).then(setModulo).catch((e) => setErro(e.message));
    carregarResumo();
  }, [slug]);

  // A busca espera a pessoa parar de digitar (300 ms); filtros vão na hora.
  useEffect(() => {
    const t = setTimeout(() => carregarRegistros(), busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [slug, busca, filtros]);

  async function recarregar() {
    await Promise.all([carregarRegistros(), carregarResumo()]);
    onMudou();
  }

  async function marcar(registro, campo, valor) {
    setRegs((rs) => rs.map((r) => (r.id === registro.id ? { ...r, [campo.id]: valor } : r)));
    try {
      const r = await Api.patch(`${base}/registros/${registro.id}`, { [campo.id]: valor });
      if (r?.pendente) {
        setRegs((rs) => rs.map((x) => (x.id === registro.id ? { ...x, [campo.id]: !valor } : x)));
        avisar(r.mensagem);
        return;
      }
      carregarResumo();
    } catch (e) {
      setRegs((rs) => rs.map((x) => (x.id === registro.id ? { ...x, [campo.id]: !valor } : x)));
      avisar(e.message, "erro");
    }
  }

  async function editar(id) {
    try { setForm({ aberta: true, registro: await Api.get(`${base}/registros/${id}`) }); } catch (e) { avisar(e.message, "erro"); }
  }

  async function confirmarExclusao() {
    const id = excluir.id;
    setExcluir(null);
    try {
      const r = await Api.del(`${base}/registros/${id}`);
      avisar(r?.pendente ? r.mensagem : "Registro excluído");
      await recarregar();
    } catch (e) { avisar(e.message, "erro"); }
  }

  if (erro && !modulo) return <div className="card-erro">{erro}</div>;
  if (!modulo) return <p className="card-sub">Carregando…</p>;
  const campos = modulo.schema.campos;
  const colunas = campos.filter((c) => c.lista !== false && !FORA_DA_TABELA.includes(c.tipo)).slice(0, 7);
  const rotulo = modulo.schema.rotulo;
  const filtrando = busca.trim() || Object.values(filtros).some(Boolean);
  const faltam = regs ? total - regs.length : 0;
  // Quem só vê o módulo não lança (o servidor responde 403); servidor antigo, sem o campo: pode.
  const pode = modulo.pode_lancar !== false;

  return (
    <>
      <header className="cabecalho cabecalho-acoes">
        <div>
          <h1>{modulo.nome}</h1>
          {modulo.descricao && <p className="card-sub">{modulo.descricao}</p>}
          {!pode && <p className="card-sub">Você só vê os registros: só {modulo.dono_nome || "quem criou"} e os administradores lançam aqui.</p>}
        </div>
        {pode && <button className="btn btn-primario" onClick={() => setForm({ aberta: true, registro: null })}><Icone nome="mais" /> Novo registro</button>}
      </header>

      <Resumo itens={resumo} moeda={sessao.moeda} />

      <div className="barra-ferramentas">
        <label className="busca">
          <Icone nome="busca" />
          <input type="search" className="campo" placeholder="Buscar" aria-label={`Buscar em ${modulo.nome}`} value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <Filtros campos={campos} valores={filtros} onMudar={setFiltros} />
        {regs && <span className="card-sub contagem-registros">
          {regs.length < total ? `${fmtNumero(regs.length, 0)} de ${fmtNumero(total, 0)}` : fmtNumero(total, 0)} registro(s)
        </span>}
      </div>

      {erro && <div className="card-erro">{erro}</div>}
      {!regs ? <div className="esqueleto" aria-label="Carregando" /> : !regs.length ? (
        <div className="vazio">
          <h2>Nenhum registro</h2>
          <p>{filtrando ? "Nada encontrado com essa busca ou filtro." : "Comece cadastrando o primeiro."}</p>
          {!filtrando && pode && <button className="btn btn-primario" onClick={() => setForm({ aberta: true, registro: null })}><Icone nome="mais" /> Novo registro</button>}
        </div>
      ) : (
        <div className="tabela-moldura">
          <table className="tabela tabela-registros">
            <thead><tr>{colunas.map((c) => <th key={c.id} className={NUMERICOS.includes(c.tipo) ? "num" : c.tipo === "booleano" ? "cel-check" : ""}>{c.nome}</th>)}<th><span className="so-leitor">Ações</span></th></tr></thead>
            <tbody>
              {regs.map((r) => (
                <tr key={r.id}>
                  {colunas.map((c) => <Celula key={c.id} campo={c} registro={r} rotulo={rotulo} moeda={sessao.moeda} onMarcar={marcar} pode={pode} />)}
                  <td className="acoes">
                    {pode && <>
                      <button className="btn btn-pequeno" onClick={() => editar(r.id)} aria-label={`Editar ${r[rotulo] ?? ""}`}><Icone nome="lapis" /> Editar</button>
                      <button className="btn btn-pequeno btn-perigo-leve" onClick={() => setExcluir(r)} aria-label={`Excluir ${r[rotulo] ?? ""}`}><Icone nome="lixeira" /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {faltam > 0 && (
            <div className="carregar-mais">
              <button className="btn" onClick={() => carregarRegistros(true, regs)}>Carregar mais ({fmtNumero(faltam, 0)} restante{faltam > 1 ? "s" : ""})</button>
            </div>
          )}
        </div>
      )}

      <FormRegistro modulo={modulo} registro={form.registro} aberta={form.aberta}
        onFechar={() => setForm({ aberta: false, registro: null })}
        onSalvo={() => { setForm({ aberta: false, registro: null }); recarregar(); }} />
      <Confirmar aberta={!!excluir} titulo="Excluir registro"
        texto={excluir ? `Excluir "${excluir[rotulo] ?? `registro ${excluir.id}`}"? Isso não pode ser desfeito.` : ""}
        onSim={confirmarExclusao} onNao={() => setExcluir(null)} />
    </>
  );
}
