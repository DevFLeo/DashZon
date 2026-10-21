"use client";
import { useParams } from "next/navigation";
import { Modulo } from "@dashzon/ui";
import Casca from "../../Casca.jsx";

export default function PaginaModulo() {
  const slug = decodeURIComponent(useParams().slug);
  return <Casca ativo={`m${slug}`}>{(sessao) => <Modulo slug={slug} sessao={sessao} />}</Casca>;
}
