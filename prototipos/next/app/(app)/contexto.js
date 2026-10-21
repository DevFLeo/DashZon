"use client";
// Sessão, tema e "recarregar" do layout do grupo (app), para as páginas.
import { createContext, useContext } from "react";

export const Contexto = createContext(null);
export const useApp = () => useContext(Contexto);
