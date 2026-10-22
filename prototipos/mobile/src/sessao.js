// Sessão do app: endereço do servidor, a API e o tema da conta.
// A lógica (formatação, cores, temas) vem de @dashzon/core, a mesma da web.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform, useColorScheme } from "react-native";
import { criarApi, criarCores, PROXIMO, temaEfetivo, TOKENS, ESCUROS } from "@dashzon/core";

const CHAVE_SERVIDOR = "dashzon.servidor";
const CHAVE_TEMA = "dashzon.tema";

// Na web (teste no navegador) o app fala com a mesma origem, pelo proxy;
// no celular, com o endereço do servidor que a pessoa digitou.
export const NA_WEB = Platform.OS === "web";

export async function lerServidor() {
  try { return (await AsyncStorage.getItem(CHAVE_SERVIDOR)) || ""; } catch (_) { return ""; }
}
export async function gravarServidor(url) {
  try { await AsyncStorage.setItem(CHAVE_SERVIDOR, url); } catch (_) { /* sem armazenamento */ }
}

// "dashzon.duckdns.org" -> "https://dashzon.duckdns.org"; tira a barra final.
export function normalizarServidor(texto) {
  let t = String(texto || "").trim().replace(/\/+$/, "");
  if (t && !/^https?:\/\//i.test(t)) t = `https://${t}`;
  return t;
}

export const criarApiDoApp = (servidor) => (NA_WEB ? criarApi("", "same-origin") : criarApi(servidor, "include"));

const Contexto = createContext(null);
export const useApp = () => useContext(Contexto);
export const Provedor = Contexto.Provider;

// Tema: a escolha da conta (preferencias.tema), a mesma do oficial; antes do
// login, a guardada no aparelho. "sistema" segue o modo claro/escuro do aparelho.
export function useTema(daConta, api) {
  const esquema = useColorScheme();
  const [escolha, setEscolha] = useState("sistema");
  useEffect(() => { AsyncStorage.getItem(CHAVE_TEMA).then((t) => t && setEscolha(t)).catch(() => {}); }, []);
  useEffect(() => { if (daConta) setEscolha(daConta); }, [daConta]);

  const id = temaEfetivo(escolha, esquema === "dark");
  const valor = useMemo(() => {
    const t = TOKENS[id];
    const cor = (nome) => t[`--${nome}`];
    return { id, escolha, escuro: ESCUROS.includes(id), cor, ...criarCores((nome) => t[nome]) };
  }, [id, escolha]);

  async function escolher(novo) {
    setEscolha(novo);
    AsyncStorage.setItem(CHAVE_TEMA, novo).catch(() => {});
    if (api) await api.put("/api/eu/preferencias", { tema: novo });
  }
  return [valor, escolher, () => escolher(PROXIMO[id] || "claro")];
}
