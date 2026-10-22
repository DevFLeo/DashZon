// Protótipo em React (Vite): uma página só, rotas por #hash, como o oficial
// (#/d/<id> dashboard, #/m/<slug> módulo). As telas vêm de @dashzon/ui.
import { useEffect, useState } from "react";
import { Api, Configuracoes, Dashboard, Login, Modulo, Moldura, useSessao, useTema } from "@dashzon/ui";

function useHash() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const mudou = () => setHash(location.hash);
    window.addEventListener("hashchange", mudou);
    return () => window.removeEventListener("hashchange", mudou);
  }, []);
  return hash;
}

const LinkHash = ({ href, className, children }) => <a href={href} className={className}>{children}</a>;

export function App() {
  const [sessao, recarregar] = useSessao();
  const [tema, trocarTema, escolhaTema, escolherTema] = useTema(sessao.usuario?.preferencias?.tema, !!sessao.usuario);
  const hash = useHash();

  if (sessao.carregando) return <p className="card-sub" style={{ padding: 24 }}>Carregando…</p>;
  if (sessao.erro) return <p className="card-erro" style={{ padding: 24 }}>{sessao.erro}</p>;
  if (sessao.sem_login) return <Login tecnologia="React (Vite)" onEntrou={recarregar} />;

  const [, tipo, id] = hash.split("/");
  const primeiro = sessao.menuDashboards[0];
  const ativo = tipo === "config" ? "config" : tipo === "m" ? `m${decodeURIComponent(id)}` : `d${tipo === "d" ? id : primeiro?.id}`;
  let tela;
  if (tipo === "config") tela = <Configuracoes sessao={sessao} escolhaTema={escolhaTema} escolherTema={escolherTema} onMudou={recarregar} />;
  else if (tipo === "m") tela = <Modulo slug={decodeURIComponent(id)} sessao={sessao} onMudou={recarregar} />;
  else if (tipo === "d" || primeiro) tela = <Dashboard id={tipo === "d" ? id : primeiro.id} sessao={sessao} tema={tema} />;
  else tela = <div className="vazio">Nenhum dashboard.</div>;

  return (
    <Moldura sessao={sessao} ativo={ativo} Link={LinkHash} tecnologia="Protótipo React (Vite)"
      hrefDashboard={(d) => `#/d/${d}`} hrefModulo={(m) => `#/m/${encodeURIComponent(m)}`} hrefConfig="#/config"
      tema={tema} trocarTema={trocarTema} escolhaTema={escolhaTema} escolherTema={escolherTema} onSair={async () => { await Api.post("/api/logout"); recarregar(); }}>
      {tela}
    </Moldura>
  );
}
