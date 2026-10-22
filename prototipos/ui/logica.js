// A lógica vem de @dashzon/core (sem HTML nem CSS, a mesma do celular). Aqui
// fica só o que depende do navegador: as cores do tema lidas do CSS.
import { criarCores } from "@dashzon/core";

export * from "@dashzon/core";

export function cssVar(nome) {
  if (typeof window === "undefined") return "#888888";
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || "#888888";
}

export const { corDe, corUnica } = criarCores(cssVar);
