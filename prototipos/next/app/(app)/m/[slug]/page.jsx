"use client";
import { useParams } from "next/navigation";
import { Modulo } from "@dashzon/ui";
import { useApp } from "../../contexto.js";

export default function PaginaModulo() {
  const slug = decodeURIComponent(useParams().slug);
  const { sessao, recarregar } = useApp();
  return <Modulo slug={slug} sessao={sessao} onMudou={recarregar} />;
}
