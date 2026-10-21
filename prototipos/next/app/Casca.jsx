"use client";
// Moldura do protótipo Next: sessão, barra lateral com next/link e as rotas
// de arquivo (/d/[id], /m/[slug]). Sem login, vai para /entrar.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Api, Moldura, useSessao, useTema } from "@dashzon/ui";

export default function Casca({ ativo, children }) {
  const [sessao, recarregar] = useSessao();
  const [tema, trocarTema] = useTema();
  const router = useRouter();
  useEffect(() => { if (sessao.sem_login) router.replace("/entrar"); }, [sessao.sem_login, router]);

  if (sessao.carregando || sessao.sem_login) return <p className="card-sub" style={{ padding: 24 }}>Carregando…</p>;
  if (sessao.erro) return <p className="card-erro" style={{ padding: 24 }}>{sessao.erro}</p>;
  return (
    <Moldura sessao={sessao} ativo={ativo} Link={Link} tecnologia="Protótipo Next.js"
      hrefDashboard={(d) => `/d/${d}`} hrefModulo={(m) => `/m/${encodeURIComponent(m)}`}
      tema={tema} trocarTema={trocarTema}
      onSair={async () => { await Api.post("/api/logout"); recarregar(); }}>
      {children(sessao, tema)}
    </Moldura>
  );
}
