"use client";
// Moldura do protótipo Next: um layout do grupo (app), que o App Router
// mantém montado entre /d/[id] e /m/[slug]. Assim a sessão e a barra lateral
// carregam uma vez só, e trocar de tela não pisca "Carregando…".
// Sem login, vai para /entrar.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Api, Moldura, useSessao, useTema } from "@dashzon/ui";
import { Contexto } from "./contexto.js";

// /d/3 -> "d3"; /m/lancamentos -> "mlancamentos" (a chave do item ativo).
function ativoDe(caminho) {
  const [, tipo, id] = caminho.split("/");
  if (tipo === "config") return "config";
  return tipo === "d" || tipo === "m" ? `${tipo}${decodeURIComponent(id || "")}` : "";
}

export default function LayoutApp({ children }) {
  const [sessao, recarregar] = useSessao();
  const [tema, trocarTema, escolhaTema, escolherTema] = useTema(sessao.usuario?.preferencias?.tema, !!sessao.usuario);
  const router = useRouter();
  const caminho = usePathname();
  useEffect(() => { if (sessao.sem_login) router.replace("/entrar"); }, [sessao.sem_login, router]);

  if (sessao.carregando || sessao.sem_login) return <p className="card-sub" style={{ padding: 24 }}>Carregando…</p>;
  if (sessao.erro) return <p className="card-erro" style={{ padding: 24 }}>{sessao.erro}</p>;
  return (
    <Contexto.Provider value={{ sessao, tema, recarregar, escolhaTema, escolherTema }}>
      <Moldura sessao={sessao} ativo={ativoDe(caminho)} Link={Link} tecnologia="Protótipo Next.js"
        hrefDashboard={(d) => `/d/${d}`} hrefModulo={(m) => `/m/${encodeURIComponent(m)}`} hrefConfig="/config"
        tema={tema} trocarTema={trocarTema}
        onSair={async () => { await Api.post("/api/logout"); recarregar(); }}>
        {children}
      </Moldura>
    </Contexto.Provider>
  );
}
