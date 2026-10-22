"use client";
// Telas compartilhadas pelos protótipos. O roteamento fica com cada app:
// React usa #hash; Next usa as rotas de arquivo (app/d/[id], app/m/[slug]).
// Por isso os links chegam prontos em `hrefDashboard`/`hrefModulo` e o
// componente de link (`Link`) é o de cada um.
import { useEffect, useState } from "react";
import { Avisos, Icone, avisar } from "./Base.jsx";
import { Card } from "./Card.jsx";
import { Api } from "./logica.js";
import { PROXIMO, temaEfetivo, temaPorId } from "./temas.js";

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

// Preferência só deste navegador. O storage pode faltar (aba privada, prévia).
function lerLocal(chave, padrao) {
  try { const v = localStorage.getItem(chave); return v === null ? padrao : JSON.parse(v); } catch (_) { return padrao; }
}
function gravarLocal(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (_) { /* sem storage */ }
}

// Estado guardado no navegador. Começa no padrão (igual no servidor e no
// cliente, para o Next não reclamar de hidratação) e lê o salvo depois.
function useLocal(chave, padrao) {
  const [valor, setValor] = useState(padrao);
  const [lido, setLido] = useState(false);
  useEffect(() => { setValor(lerLocal(chave, padrao)); setLido(true); }, [chave]);
  useEffect(() => { if (lido) gravarLocal(chave, valor); }, [chave, valor, lido]);
  return [valor, setValor];
}

// Tema no <html data-tema>. A escolha é a da conta (preferencias.tema, a mesma
// do oficial); antes do login vale a guardada no navegador. "sistema" segue o
// computador e acompanha quando ele muda.
// Devolve [tema efetivo, girar (botão do topo), escolha, escolher(id)].
export function useTema(daConta, logado = false) {
  const [escolha, setEscolha] = useState("sistema");
  const [escuroNoSistema, setEscuroNoSistema] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (mq) {
      setEscuroNoSistema(mq.matches);
      const mudou = (e) => setEscuroNoSistema(e.matches);
      mq.addEventListener("change", mudou);
      setEscolha((e) => lerLocal("dashzon.prototipo.tema", e));
      return () => mq.removeEventListener("change", mudou);
    }
    setEscolha((e) => lerLocal("dashzon.prototipo.tema", e));
  }, []);
  useEffect(() => { if (temaPorId(daConta)) setEscolha(daConta); }, [daConta]);

  const tema = temaEfetivo(escolha, escuroNoSistema);
  useEffect(() => { document.documentElement.dataset.tema = tema; }, [tema]);

  async function escolher(novo) {
    if (!temaPorId(novo)) return;
    setEscolha(novo);
    gravarLocal("dashzon.prototipo.tema", novo);
    if (!logado) return;
    try { await Api.put("/api/eu/preferencias", { tema: novo }); } catch (e) { avisar(`O tema não foi salvo na conta: ${e.message}`, "erro"); }
  }
  return [tema, () => escolher(PROXIMO[tema]), escolha, escolher];
}

export function Login({ onEntrou, tecnologia }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function enviar(ev) {
    ev.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await Api.post("/api/login", { usuario, senha });
      onEntrou();
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  }
  return (
    <div className="login">
      <form className="login-card" onSubmit={enviar}>
        <div className="login-marca"><Cubo /><h1>DashZon</h1></div>
        <p className="card-sub">Protótipo em {tecnologia}</p>
        <label>Usuário<input className="campo" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoFocus required /></label>
        <label>Senha
          <span className="senha">
            <input className="campo" type={ver ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
            <button type="button" className="btn-texto" onClick={() => setVer((v) => !v)} aria-pressed={ver}>{ver ? "Ocultar" : "Mostrar"}</button>
          </span>
        </label>
        {erro && <div className="card-erro" role="alert">{erro}</div>}
        <button className="btn btn-primario btn-grande" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}

// Ordem da barra lateral: a da conta (`ordem_menu`, arrastada no oficial);
// quem não está na lista vai para o fim. Módulos desligados pela pessoa
// (`modulos_ocultos`) saem do menu, como no oficial.
function ordenarMenu(itens, ordem, chave) {
  const pos = new Map((ordem || []).map((k, i) => [String(k), i]));
  return [...itens].sort((a, b) => (pos.get(String(a[chave])) ?? 1e9) - (pos.get(String(b[chave])) ?? 1e9));
}

// Moldura do app: carrega sessão, módulos e dashboards.
export function useSessao() {
  const [estado, setEstado] = useState({ carregando: true });
  async function carregar() {
    try {
      const status = await Api.get("/api/status");
      if (!status.usuario) { setEstado({ carregando: false, sem_login: true }); return; }
      const [modulos, dashboards] = await Promise.all([Api.get("/api/modulos"), Api.get("/api/dashboards")]);
      const pref = status.usuario.preferencias || {};
      const ocultos = new Set(pref.modulos_ocultos || []);
      setEstado({
        carregando: false, usuario: status.usuario, moeda: status.moeda, modulos,
        menuDashboards: ordenarMenu(dashboards, pref.ordem_menu?.dashboards, "id"),
        menuModulos: ordenarMenu(modulos.filter((m) => !ocultos.has(m.slug)), pref.ordem_menu?.modulos, "slug"),
        dashboards
      });
    } catch (e) { setEstado({ carregando: false, erro: e.message }); }
  }
  useEffect(() => { carregar(); }, []);
  return [estado, carregar];
}

// Duas letras para a barra recolhida ("Finanças pessoais" -> "FP").
const sigla = (nome) => {
  const partes = String(nome).split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]/.test(p));
  return ((partes[0]?.[0] || nome[0] || "") + (partes[1]?.[0] || nome[1] || "")).toUpperCase();
};

function Secao({ id, titulo, fechadas, alternar, children }) {
  const aberta = !fechadas.includes(id);
  return (
    <div className="nav-secao">
      <button className="nav-titulo" onClick={() => alternar(id)} aria-expanded={aberta} aria-controls={`nav-${id}`}>
        <span>{titulo}</span><Icone nome="seta" />
      </button>
      <div id={`nav-${id}`} hidden={!aberta}>{children}</div>
    </div>
  );
}

export function Moldura({ sessao, ativo, Link, hrefDashboard, hrefModulo, hrefConfig, tema, trocarTema, onSair, tecnologia, children }) {
  const [gaveta, setGaveta] = useState(false);
  const [recolhida, setRecolhida] = useLocal("dashzon.prototipo.recolhida", false);
  const [fechadas, setFechadas] = useLocal("dashzon.prototipo.secoes", []);
  const alternar = (id) => setFechadas((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  // Ao trocar de tela: a gaveta fecha e a página volta ao topo (senão a tela
  // nova abre rolada onde a anterior estava).
  useEffect(() => { setGaveta(false); window.scrollTo(0, 0); }, [ativo]);
  useEffect(() => {
    if (!gaveta) return;
    const tecla = (e) => { if (e.key === "Escape") setGaveta(false); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [gaveta]);
  // A grade e os gráficos do Chart.js se ajustam quando a barra muda de largura.
  useEffect(() => { window.dispatchEvent(new Event("resize")); }, [recolhida]);

  // O ícone mostra a fase do tema atual (sol, pôr do sol, lua); o clique vai
  // para o próximo da família, como no oficial.
  const atual = temaPorId(tema);
  const proximo = temaPorId(PROXIMO[tema]);
  const botaoTema = (
    <button className="btn-icone" onClick={trocarTema} aria-label={`Tema ${atual?.nome}. Mudar para ${proximo?.nome}`} title={`Tema ${atual?.nome} (clique para ${proximo?.nome})`}>
      <Icone nome={{ dia: "sol", tarde: "tarde", noite: "lua" }[atual?.fase] || "sol"} />
    </button>
  );
  const item = (chave, href, nome, extra) => (
    <Link key={chave} href={href} className={`nav-item ${ativo === chave ? "ativo" : ""}`} aria-current={ativo === chave ? "page" : undefined} title={recolhida ? nome : undefined}>
      <span className="nav-sigla" aria-hidden="true">{sigla(nome)}</span>
      <span className="nav-nome">{nome}</span>{extra}
    </Link>
  );

  return (
    <div className={`app ${recolhida ? "recolhida" : ""}`}>
      <header className="topo-movel">
        <button className="btn-icone" onClick={() => setGaveta(true)} aria-label="Abrir o menu" aria-expanded={gaveta} aria-controls="lateral"><Icone nome="menu" /></button>
        <Cubo /><strong>DashZon</strong>
        <span className="espaco" />
        {botaoTema}
      </header>
      {gaveta && <div className="veu" onClick={() => setGaveta(false)} aria-hidden="true" />}
      <aside id="lateral" className={`lateral ${gaveta ? "aberta" : ""}`} aria-label="Menu">
        <div className="marca">
          <Cubo />
          <div className="marca-nome"><strong>DashZon</strong><small>{tecnologia}</small></div>
          <span className="so-desktop">{botaoTema}</span>
          <button className="btn-icone so-desktop" onClick={() => setRecolhida((r) => !r)} aria-label={recolhida ? "Expandir o menu" : "Recolher o menu"} aria-pressed={recolhida}>
            <Icone nome={recolhida ? "expandir" : "recolher"} />
          </button>
          <button className="btn-icone so-movel" onClick={() => setGaveta(false)} aria-label="Fechar o menu"><Icone nome="fechar" /></button>
        </div>
        <nav>
          <Secao id="dashboards" titulo="Dashboards" fechadas={fechadas} alternar={alternar}>
            {sessao.menuDashboards.map((d) => item(`d${d.id}`, hrefDashboard(d.id), d.nome,
              d.visibilidade === "privado" ? <span className="nav-selo" title="Só você vê"><Icone nome="cadeado" rotulo="Privado" /></span> : null))}
          </Secao>
          <Secao id="modulos" titulo="Módulos" fechadas={fechadas} alternar={alternar}>
            {sessao.menuModulos.map((m) => item(`m${m.slug}`, hrefModulo(m.slug), m.nome, <span className="contagem">{m.total}</span>))}
          </Secao>
        </nav>
        <div className="nav-extra">
          <Link href={hrefConfig} className={`nav-item ${ativo === "config" ? "ativo" : ""}`} aria-current={ativo === "config" ? "page" : undefined} title={recolhida ? "Configurações" : undefined}>
            <Icone nome="engrenagem" /><span className="nav-nome">Configurações</span>
          </Link>
        </div>
        <div className="rodape">
          <span className="rodape-nome">Conectado como <strong>{sessao.usuario.nome || sessao.usuario.login}</strong></span>
          <button className="btn btn-pequeno" onClick={onSair} aria-label="Sair" title="Sair"><Icone nome="sair" /><span className="nav-nome">Sair</span></button>
        </div>
      </aside>
      <main className="conteudo">{children}</main>
      <Avisos />
    </div>
  );
}

function quemVe(dash) {
  if (dash.visibilidade === "privado") return <><Icone nome="cadeado" /> Só você vê</>;
  if (dash.visibilidade === "equipes") return <><Icone nome="equipe" /> Equipes: {(dash.equipes || []).map((e) => e.nome).join(", ")}</>;
  return <><Icone nome="equipe" /> Todos veem</>;
}

export function Dashboard({ id, sessao, tema }) {
  const [dash, setDash] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    setDash(null);
    setErro("");
    Api.get(`/api/dashboards/${id}`).then(setDash).catch((e) => setErro(e.message));
  }, [id]);
  if (erro) return <div className="card-erro">{erro}</div>;
  if (!dash) return <div className="grade">{[4, 4, 4, 8, 4].map((w, i) => <div key={i} className="card esqueleto" style={{ gridColumn: `span ${w}`, gridRow: "span 2" }} />)}</div>;
  const modulo = (slug) => sessao.modulos.find((m) => m.slug === slug);
  return (
    <>
      <header className="cabecalho">
        <h1>{dash.nome}</h1>
        <p className="card-sub selos">
          <span className="selo">{quemVe(dash)}</span>
          {dash.fixo && <span className="selo">Layout fixo</span>}
          {dash.dono_nome && dash.dono_id !== sessao.usuario.id && <span className="selo">de {dash.dono_nome}</span>}
          <span>{dash.widgets.length} cards</span>
        </p>
      </header>
      {dash.widgets.length
        ? <div className="grade">{dash.widgets.map((w) => <Card key={w.id} widget={w} modulo={modulo(w.modulo_slug)} moeda={sessao.moeda} tema={tema} />)}</div>
        : <div className="vazio">Dashboard vazio.</div>}
    </>
  );
}

export { Modulo } from "./Registros.jsx";
export { Configuracoes } from "./Configuracoes.jsx";
