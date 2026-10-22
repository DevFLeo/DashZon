"use client";
// Seletor rápido de tema (segurar o botão do topo, botão direito ou seta
// para baixo): o cubo do DashZon, o mascote, nas cores de cada tema. Nos
// automáticos, cada face com a cor de um dos temas que ele usa (Vivaldi: as
// quatro estações; sistema: claro e escuro). Mesmo comportamento do oficial
// (frontend/js/tema.js).
import { useEffect, useRef } from "react";
import { TEMAS } from "./temas.js";

const FACES = ["frente", "dir", "tras", "esq", "topo", "base"];
const porId = (id) => TEMAS.find((t) => t.id === id);

function MiniCubo({ cores }) {
  return (
    <span className="logo-3d mini-cubo" aria-hidden="true" style={{ "--destaque": cores[0] }}>
      <span className="cubo">
        {FACES.map((f, i) => <span key={f} className={`face f-${f}`} style={{ "--destaque": cores[i % cores.length] }} />)}
        <span className="nucleo" />
      </span>
    </span>
  );
}

export function SeletorTemas({ ancora, escolha, onEscolher, onFechar }) {
  const ref = useRef(null);
  const grupos = [...new Set(TEMAS.map((t) => t.grupo))].map((g) => ({ nome: g, temas: TEMAS.filter((t) => t.grupo === g) }));

  // Posição: perto do botão, sem sair da tela. Foco no tema marcado.
  useEffect(() => {
    const el = ref.current;
    const r = ancora.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left), window.innerWidth - el.offsetWidth - 8);
    const abaixo = r.bottom + 8 + el.offsetHeight <= window.innerHeight;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${abaixo ? r.bottom + 8 : Math.max(8, r.top - el.offsetHeight - 8)}px`;
    (el.querySelector('[aria-checked="true"]') || el.querySelector(".mini-tema"))?.focus();
    const fora = (ev) => { if (!el.contains(ev.target) && !ancora.contains(ev.target)) onFechar(false); };
    document.addEventListener("pointerdown", fora, true);
    return () => document.removeEventListener("pointerdown", fora, true);
  }, [ancora, onFechar]);

  function tecla(ev) {
    if (ev.key === "Escape") { ev.preventDefault(); onFechar(true); return; }
    const itens = [...ref.current.querySelectorAll(".mini-tema")];
    const i = itens.indexOf(document.activeElement);
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    if (passo && i >= 0) { ev.preventDefault(); itens[(i + passo + itens.length) % itens.length].focus(); }
    if (ev.key === "Home") { ev.preventDefault(); itens[0].focus(); }
    if (ev.key === "End") { ev.preventDefault(); itens[itens.length - 1].focus(); }
  }

  return (
    <div ref={ref} className="seletor-temas" role="dialog" aria-label="Escolher o tema" onKeyDown={tecla}>
      {grupos.map((g) => (
        <div key={g.nome} className="mini-grupo" role="radiogroup" aria-label={g.nome}>
          <div className="mini-grupo-nome">{g.nome}</div>
          <div className="mini-lista">
            {g.temas.map((t) => {
              const partes = t.compoe ? t.compoe.map(porId) : [t];
              const fundos = partes.map((p) => p.previa[0]);
              const fundo = fundos.length > 1
                ? `linear-gradient(90deg, ${fundos.map((c, i) => `${c} ${(i * 100) / fundos.length}% ${((i + 1) * 100) / fundos.length}%`).join(", ")})`
                : fundos[0];
              const marcado = escolha === t.id;
              return (
                <button key={t.id} type="button" className="mini-tema" role="radio" aria-checked={marcado} tabIndex={marcado ? 0 : -1}
                  title={t.desc || t.nome} onClick={() => { onEscolher(t.id); onFechar(true); }}>
                  <span className="mini-quadro" style={{ background: fundo }}><MiniCubo cores={partes.map((p) => p.previa[3])} /></span>
                  <span className="mini-nome">{t.nome}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
