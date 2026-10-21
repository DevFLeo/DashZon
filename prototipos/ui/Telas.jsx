"use client";
// Telas compartilhadas pelos protótipos. O roteamento fica com cada app:
// React usa #hash; Next usa as rotas de arquivo (app/d/[id], app/m/[slug]).
// Por isso os links chegam prontos em `hrefDashboard`/`hrefModulo` e o
// componente de link (`Link`) é o de cada um.
import { useEffect, useState } from "react";
import { Card } from "./Card.jsx";
import { Api, fmtValor } from "./logica.js";

export function Cubo() {
  return (
    <div className="logo-3d" aria-hidden="true">
      <div className="cubo">
        {["frente", "tras", "dir", "esq", "topo", "base"].map((f) => <span key={f} className={`face f-${f}`} />)}
        <span className="nucleo" />
      </div>
    </div>
  );
}

// Tema claro/escuro no <html data-tema>, guardado no navegador.
export function useTema() {
  const [tema, setTema] = useState("escuro");
  useEffect(() => {
    let salvo = null;
    try { salvo = localStorage.getItem("dashzon.prototipo.tema"); } catch (_) { /* sem storage */ }
    if (salvo) setTema(salvo);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    try { localStorage.setItem("dashzon.prototipo.tema", tema); } catch (_) { /* sem storage */ }
  }, [tema]);
  return [tema, () => setTema((t) => (t === "escuro" ? "claro" : "escuro"))];
}

export function Login({ onEntrou, tecnologia }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  async function enviar(ev) {
    ev.preventDefault();
    setErro("");
    try {
      await Api.post("/api/login", { usuario, senha });
      onEntrou();
    } catch (e) { setErro(e.message); }
  }
  return (
    <div className="login">
      <form className="login-card" onSubmit={enviar}>
        <div className="login-marca"><Cubo /><h1>DashZon</h1></div>
        <p className="card-sub">Protótipo em {tecnologia}</p>
        <label>Usuário<input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" required /></label>
        <label>Senha<input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required /></label>
        {erro && <div className="card-erro">{erro}</div>}
        <button className="btn btn-primario">Entrar</button>
      </form>
    </div>
  );
}

// Moldura do app: carrega sessão, módulos e dashboards; barra lateral + conteúdo.
export function useSessao() {
  const [estado, setEstado] = useState({ carregando: true });
  async function carregar() {
    try {
      const status = await Api.get("/api/status");
      if (!status.usuario) { setEstado({ carregando: false, sem_login: true }); return; }
      const [modulos, dashboards] = await Promise.all([Api.get("/api/modulos"), Api.get("/api/dashboards")]);
      setEstado({ carregando: false, usuario: status.usuario, moeda: status.moeda, modulos, dashboards });
    } catch (e) { setEstado({ carregando: false, erro: e.message }); }
  }
  useEffect(() => { carregar(); }, []);
  return [estado, carregar];
}

export function Moldura({ sessao, ativo, Link, hrefDashboard, hrefModulo, tema, trocarTema, onSair, tecnologia, children }) {
  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <Cubo />
          <div><strong>DashZon</strong><small>{tecnologia}</small></div>
          <button className="btn-tema" onClick={trocarTema} aria-label="Mudar o tema">{tema === "escuro" ? "Claro" : "Escuro"}</button>
        </div>
        <nav>
          <div className="nav-titulo">Dashboards</div>
          {sessao.dashboards.map((d) => (
            <Link key={d.id} href={hrefDashboard(d.id)} className={`nav-item ${ativo === `d${d.id}` ? "ativo" : ""}`}>{d.nome}</Link>
          ))}
          <div className="nav-titulo">Módulos</div>
          {sessao.modulos.map((m) => (
            <Link key={m.slug} href={hrefModulo(m.slug)} className={`nav-item ${ativo === `m${m.slug}` ? "ativo" : ""}`}>
              <span>{m.nome}</span><span className="contagem">{m.total}</span>
            </Link>
          ))}
        </nav>
        <div className="rodape">
          <span>Conectado como <strong>{sessao.usuario.nome || sessao.usuario.login}</strong></span>
          <button className="btn" onClick={onSair}>Sair</button>
        </div>
      </aside>
      <main className="conteudo">{children}</main>
    </div>
  );
}

export function Dashboard({ id, sessao, tema }) {
  const [dash, setDash] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    setDash(null);
    Api.get(`/api/dashboards/${id}`).then(setDash).catch((e) => setErro(e.message));
  }, [id]);
  if (erro) return <div className="card-erro">{erro}</div>;
  if (!dash) return <p className="card-sub">Carregando…</p>;
  const modulo = (slug) => sessao.modulos.find((m) => m.slug === slug);
  return (
    <>
      <header className="cabecalho">
        <h1>{dash.nome}</h1>
        <p className="card-sub">{dash.visibilidade === "privado" ? "Só você vê" : dash.visibilidade === "equipes" ? `Equipes: ${(dash.equipes || []).map((e) => e.nome).join(", ")}` : "Da equipe"} · {dash.widgets.length} cards</p>
      </header>
      {dash.widgets.length
        ? <div className="grade">{dash.widgets.map((w) => <Card key={w.id} widget={w} modulo={modulo(w.modulo_slug)} moeda={sessao.moeda} tema={tema} />)}</div>
        : <div className="vazio">Dashboard vazio.</div>}
    </>
  );
}

export function Modulo({ slug, sessao }) {
  const [regs, setRegs] = useState(null);
  const modulo = sessao.modulos.find((m) => m.slug === slug);
  useEffect(() => {
    setRegs(null);
    Api.get(`/api/modulos/${encodeURIComponent(slug)}/registros?limite=100`).then(setRegs);
  }, [slug]);
  if (!modulo) return <div className="card-erro">Módulo não encontrado</div>;
  const campos = modulo.schema.campos.filter((c) => !["texto_longo", "markdown"].includes(c.tipo)).slice(0, 7);
  return (
    <>
      <header className="cabecalho"><h1>{modulo.nome}</h1><p className="card-sub">{modulo.descricao}</p></header>
      {!regs ? <p className="card-sub">Carregando…</p> : (
        <div className="tabela-moldura">
          <table className="tabela">
            <thead><tr>{campos.map((c) => <th key={c.id}>{c.nome}</th>)}</tr></thead>
            <tbody>{regs.result.map((r) => <tr key={r.id}>{campos.map((c) => <td key={c.id}>{fmtValor(c, r[c.id], sessao.moeda)}</td>)}</tr>)}</tbody>
          </table>
          <p className="card-sub">{regs.count} registro(s)</p>
        </div>
      )}
    </>
  );
}
