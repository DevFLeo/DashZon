"use client";
// Configurações do protótipo: tema e módulos no menu. As duas escolhas ficam
// nas preferências da conta (PUT /api/eu/preferencias), as mesmas do
// DashZon oficial: mudar aqui vale lá, e vice-versa.
import { useState } from "react";
import { avisar } from "./Base.jsx";
import { Api } from "./logica.js";
import { TEMAS } from "./temas.js";

// Miniatura do tema: a página, um cartão com texto, o destaque e três séries.
function Previa({ tema }) {
  if (!tema.previa) {
    // Automático: um pedaço de cada tema que ele usa ("sistema": claro e
    // escuro; Vivaldi: as quatro estações).
    return (
      <span className="tema-previa tema-previa-sistema" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${tema.compoe.length}, 1fr)` }}>
        {tema.compoe.map((id) => <Previa key={id} tema={TEMAS.find((t) => t.id === id)} />)}
      </span>
    );
  }
  const [fundo, cartao, texto, destaque, s1, s2, s3] = tema.previa;
  return (
    <span className="tema-previa" aria-hidden="true" style={{ background: fundo }}>
      <span className="tp-cartao" style={{ background: cartao }}>
        <span className="tp-linha" style={{ background: texto }} />
        <span className="tp-barras">
          {[[s1, 70], [s2, 45], [s3, 90]].map(([cor, h]) => <span key={cor + h} style={{ background: cor, height: `${h}%` }} />)}
        </span>
      </span>
      <span className="tp-botao" style={{ background: destaque }} />
    </span>
  );
}

export function Configuracoes({ sessao, escolhaTema, escolherTema, onMudou = () => {} }) {
  const [ocultos, setOcultos] = useState(() => sessao.usuario.preferencias?.modulos_ocultos || []);
  const [salvando, setSalvando] = useState("");

  async function trocarTema(id) {
    await escolherTema(id);
    avisar(`Tema ${TEMAS.find((t) => t.id === id).nome} aplicado`);
  }

  async function alternarModulo(m, visivel) {
    const novos = visivel ? ocultos.filter((s) => s !== m.slug) : [...ocultos, m.slug];
    setOcultos(novos);
    setSalvando(m.slug);
    try {
      await Api.put("/api/eu/preferencias", { modulos_ocultos: novos });
      avisar(visivel ? `${m.nome} voltou ao menu` : `${m.nome} saiu do seu menu (os dados continuam)`);
      onMudou();
    } catch (e) {
      setOcultos(ocultos);
      avisar(e.message, "erro");
    } finally {
      setSalvando("");
    }
  }

  const grupos = [...new Set(TEMAS.map((t) => t.grupo))];
  return (
    <>
      <header className="cabecalho">
        <h1>Configurações</h1>
        <p className="card-sub">Ficam na sua conta: valem aqui e no DashZon oficial.</p>
      </header>

      <section className="config-secao" aria-labelledby="cfg-tema">
        <h2 id="cfg-tema">Tema</h2>
        {grupos.map((g) => (
          <fieldset key={g} className="temas">
            <legend>{g}</legend>
            {TEMAS.filter((t) => t.grupo === g).map((t) => (
              <label key={t.id} className={`tema-cartao ${escolhaTema === t.id ? "marcado" : ""}`}>
                <input type="radio" name="tema" value={t.id} checked={escolhaTema === t.id} onChange={() => trocarTema(t.id)} />
                <Previa tema={t} />
                <span className="tema-texto"><strong>{t.nome}</strong><span className="card-sub">{t.desc}</span></span>
              </label>
            ))}
          </fieldset>
        ))}
      </section>

      <section className="config-secao" aria-labelledby="cfg-menu">
        <h2 id="cfg-menu">Módulos no menu</h2>
        <p className="card-sub">Desligar só tira o módulo do seu menu: os dados e os cards continuam, e as outras pessoas não são afetadas.</p>
        <ul className="lista-chaves">
          {sessao.modulos.map((m) => {
            const visivel = !ocultos.includes(m.slug);
            return (
              <li key={m.slug}>
                <label className="chave">
                  <span className="chave-texto"><strong>{m.nome}</strong><span className="card-sub">{m.total} registro(s)</span></span>
                  <input type="checkbox" role="switch" checked={visivel} disabled={salvando === m.slug}
                    onChange={(e) => alternarModulo(m, e.target.checked)} aria-label={`Mostrar ${m.nome} no menu`} />
                </label>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
