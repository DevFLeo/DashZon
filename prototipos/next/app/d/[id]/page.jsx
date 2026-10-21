"use client";
import { useParams } from "next/navigation";
import { Dashboard } from "@dashzon/ui";
import Casca from "../../Casca.jsx";

export default function PaginaDashboard() {
  const { id } = useParams();
  return <Casca ativo={`d${id}`}>{(sessao, tema) => <Dashboard id={id} sessao={sessao} tema={tema} />}</Casca>;
}
