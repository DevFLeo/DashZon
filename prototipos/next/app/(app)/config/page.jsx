"use client";
import { Configuracoes } from "@dashzon/ui";
import { useApp } from "../contexto.js";

export default function PaginaConfig() {
  const { sessao, recarregar, escolhaTema, escolherTema } = useApp();
  return <Configuracoes sessao={sessao} escolhaTema={escolhaTema} escolherTema={escolherTema} onMudou={recarregar} />;
}
