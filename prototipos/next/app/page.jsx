"use client";
// Início: abre o primeiro dashboard (ou o login).
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Api } from "@dashzon/ui";

export default function Inicio() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const status = await Api.get("/api/status");
      if (!status.usuario) return router.replace("/entrar");
      const dashboards = await Api.get("/api/dashboards");
      router.replace(dashboards.length ? `/d/${dashboards[0].id}` : `/m/${(await Api.get("/api/modulos"))[0]?.slug || ""}`);
    })();
  }, [router]);
  return <p className="card-sub" style={{ padding: 24 }}>Carregando…</p>;
}
