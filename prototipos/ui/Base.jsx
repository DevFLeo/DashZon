"use client";
// Peças de interface dos protótipos: ícones SVG, avisos e janela modal.
// Sem emojis (regra do projeto): os ícones são os mesmos traços do oficial
// (Util.icone em frontend/js/util.js), mais os que as telas daqui pedem.
import { useEffect, useRef, useSyncExternalStore } from "react";

const ICONES = {
  cadeado: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  equipe: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 5.7" /></>,
  lapis: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  certo: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  tabela: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" /></>,
  barras: <path d="M5 20V11M10 20V5M15 20v-7M20 20V9" />,
  seta: <path d="M6 9l6 6 6-6" />,
  recolher: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9.5 4.5v15M16 10l-2 2 2 2" /></>,
  expandir: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9.5 4.5v15M14 10l2 2-2 2" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  mais: <path d="M12 5v14M5 12h14" />,
  busca: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  lixeira: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  sol: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>,
  lua: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  // Pôr do sol: meio sol sobre o horizonte.
  tarde: <><path d="M5 17a7 7 0 0 1 14 0" /><path d="M2.5 17h19M12 5.5V8M5.6 9.2l1.7 1.7M18.4 9.2l-1.7 1.7M7 20.5h10" /></>,
  engrenagem: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /><circle cx="12" cy="12" r="6.2" /></>,
  sair: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 8l-4 4 4 4M6 12h10" /></>
};

export function Icone({ nome, rotulo }) {
  return (
    <svg className={`ico ico-${nome}`} viewBox="0 0 24 24" {...(rotulo ? { role: "img", "aria-label": rotulo } : { "aria-hidden": true })}>
      {ICONES[nome]}
    </svg>
  );
}

// --- avisos ------------------------------------------------------------------
// Uma lista fora do React, para qualquer tela chamar `avisar(...)` sem
// precisar de contexto; <Avisos /> é montado uma vez, na moldura.
let lista = [];
let proximo = 1;
const ouvintes = new Set();
const mudou = () => ouvintes.forEach((f) => f());

export function avisar(texto, tipo = "ok") {
  const id = proximo++;
  lista = [...lista, { id, texto, tipo }];
  mudou();
  setTimeout(() => fecharAviso(id), tipo === "erro" ? 7000 : 4000);
}

function fecharAviso(id) {
  lista = lista.filter((a) => a.id !== id);
  mudou();
}

export function Avisos() {
  const itens = useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => ouvintes.delete(f); },
    () => lista,
    () => lista
  );
  return (
    <div className="avisos" role="status" aria-live="polite">
      {itens.map((a) => (
        <div key={a.id} className={`aviso aviso-${a.tipo}`}>
          <span>{a.texto}</span>
          <button className="btn-icone" onClick={() => fecharAviso(a.id)} aria-label="Fechar aviso"><Icone nome="fechar" /></button>
        </div>
      ))}
    </div>
  );
}

// --- janela modal ------------------------------------------------------------
// <dialog> nativo: showModal() já prende o foco, escurece o fundo e fecha com
// Esc (evento "cancel"). Clicar fora da caixa também fecha.
export function Janela({ titulo, aberta, onFechar, children, rodape, largura = 520 }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) {
      d.showModal();
      // O showModal() foca o primeiro botão (o fechar). Melhor o primeiro campo
      // do formulário, ou o botão marcado com data-foco.
      d.querySelector("[data-foco], .janela-corpo :is(input, select, textarea)")?.focus();
    }
    if (!aberta && d.open) d.close();
  }, [aberta]);
  return (
    <dialog ref={ref} className="janela" style={{ "--janela-largura": `${largura}px` }}
      onCancel={(e) => { e.preventDefault(); onFechar(); }}
      onClick={(e) => { if (e.target === ref.current) onFechar(); }}>
      {aberta && (
        <div className="janela-caixa">
          <header className="janela-topo">
            <h2>{titulo}</h2>
            <button className="btn-icone" onClick={onFechar} aria-label="Fechar"><Icone nome="fechar" /></button>
          </header>
          <div className="janela-corpo">{children}</div>
          {rodape && <footer className="janela-rodape">{rodape}</footer>}
        </div>
      )}
    </dialog>
  );
}

// Confirmação no lugar do confirm() do navegador.
export function Confirmar({ aberta, titulo, texto, acao = "Excluir", onSim, onNao }) {
  return (
    <Janela titulo={titulo} aberta={aberta} onFechar={onNao} largura={420}
      rodape={<><button className="btn" onClick={onNao} data-foco>Cancelar</button><button className="btn btn-perigo" onClick={onSim}>{acao}</button></>}>
      <p className="texto-janela">{texto}</p>
    </Janela>
  );
}
