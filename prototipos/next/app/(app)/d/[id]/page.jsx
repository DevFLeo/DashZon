"use client";
import { useParams } from "next/navigation";
import { Dashboard } from "@dashzon/ui";
import { useApp } from "../../contexto.js";

export default function PaginaDashboard() {
  const { id } = useParams();
  const { sessao, tema } = useApp();
  return <Dashboard id={id} sessao={sessao} tema={tema} />;
}
