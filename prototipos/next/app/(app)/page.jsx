"use client";
// Início: abre o primeiro dashboard na ordem do menu da conta (ou o primeiro
// módulo). O login fica a cargo do layout do grupo.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "./contexto.js";

export default function Inicio() {
  const router = useRouter();
  const { sessao } = useApp();
  const destino = sessao.menuDashboards[0] ? `/d/${sessao.menuDashboards[0].id}`
    : sessao.menuModulos[0] ? `/m/${encodeURIComponent(sessao.menuModulos[0].slug)}` : null;
  useEffect(() => { if (destino) router.replace(destino); }, [destino, router]);
  return destino ? null : <div className="vazio">Nenhum dashboard ou módulo ainda.</div>;
}
