// Os cards do dashboard no celular, desenhados com SVG. Os dados vêm de
// graficos.js (mesma lógica da web); aqui fica só o desenho e o toque:
// tocar num grupo (barras/linha), numa fatia ou num dia mostra o valor, e
// cada gráfico tem um resumo em texto para o leitor de tela.
import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { dadosCalendario, dadosGrafico, dadosMeta, dadosNumero, dadosPizza, dadosTabela } from "./graficos";
import { useApp } from "./sessao";

const ALTURA = 190;
const EIXO = 46; // espaço dos números do eixo
const abreviar = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e3) return `${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
};
const cortar = (t, n) => (t.length > n ? `${t.slice(0, Math.max(1, n - 1))}.` : t);
// Texto dentro do SVG: sem serifa também na web (o padrão do navegador é serifado).
const FONTE = Platform.OS === "web" ? "system-ui, -apple-system, Segoe UI, sans-serif" : undefined;
// Número grande do card: o tamanho cai conforme o comprimento, para caber
// inteiro mesmo em meia largura (o adjustsFontSizeToFit não existe na web).
const tamanhoDoNumero = (texto, largura) => Math.max(15, Math.min(26, Math.floor((largura - 4) / (String(texto).length * 0.62))));

function Legenda({ itens }) {
  const { tema } = useApp();
  if (itens.length < 2) return null;
  return (
    <View style={s.legenda}>
      {itens.map((i) => (
        <View key={i.rotulo} style={s.legendaItem}>
          <View style={[s.bolinha, { backgroundColor: i.cor }]} />
          <Text style={{ color: tema.cor("texto-2"), fontSize: 13 }}>{i.rotulo}</Text>
        </View>
      ))}
    </View>
  );
}

function Numero({ d, modulo, moeda, largura }) {
  const { tema } = useApp();
  const n = dadosNumero(d, modulo, moeda);
  const cor = n.sinal === "positivo" ? tema.cor("bom") : n.sinal === "negativo" ? tema.cor("ruim") : n.cor || tema.cor("texto");
  return (
    <View accessible accessibilityLabel={`${n.texto}. ${n.descricao}`}>
      <Text style={[s.numero, { color: cor, fontSize: tamanhoDoNumero(n.texto, largura) }]}>{n.texto}</Text>
      <Text style={{ color: tema.cor("texto-fraco"), fontSize: 13 }}>{n.descricao}</Text>
    </View>
  );
}

function Meta({ d, modulo, moeda, largura }) {
  const { tema } = useApp();
  const m = dadosMeta(d, modulo, moeda);
  const cor = tema.corUnica(d.config);
  return (
    <View style={{ gap: 8 }} accessible accessibilityLabel={`${m.valor} de ${m.meta}. ${m.texto}. ${m.porcento}`}>
      <Text style={{ color: tema.cor("texto-fraco") }}><Text style={[s.numero, { color: cor, fontSize: tamanhoDoNumero(m.valor, largura * 0.6) }]}>{m.valor}</Text>  de {m.meta}</Text>
      <View style={[s.trilho, { backgroundColor: tema.cor("hover") }]} role="progressbar" aria-valuenow={Math.round(m.barra)} aria-valuemin={0} aria-valuemax={100}>
        <View style={{ width: `${m.barra}%`, height: "100%", backgroundColor: cor, borderRadius: 6 }} />
      </View>
      <Text style={{ color: tema.cor("texto-fraco"), fontSize: 13 }}>{m.texto} · {m.porcento}</Text>
    </View>
  );
}

function Tabela({ d, modulo, moeda }) {
  const { tema } = useApp();
  const t = dadosTabela(d, modulo, moeda);
  if (!d.total_count) return <Text style={{ color: tema.cor("texto-fraco") }}>Sem dados</Text>;
  const borda = { borderBottomColor: tema.cor("borda"), borderBottomWidth: 1 };
  return (
    <View>
      <View style={[s.linhaTabela, borda]}>
        <Text style={[s.celula, s.cab, { color: tema.cor("texto-fraco"), flex: 2 }]}>{t.titulo}</Text>
        <Text style={[s.celula, s.cab, s.num, { color: tema.cor("texto-fraco") }]}>Qtd.</Text>
        {t.comValor && <Text style={[s.celula, s.cab, s.num, { color: tema.cor("texto-fraco"), flex: 1.6 }]}>Valor</Text>}
      </View>
      {t.linhas.map((l) => (
        <View key={l.chave} style={[s.linhaTabela, borda]}>
          <Text style={[s.celula, { color: tema.cor("texto"), flex: 2 }]} numberOfLines={1}>{l.rotulo}</Text>
          <Text style={[s.celula, s.num, { color: tema.cor("texto") }]}>{l.qtd}</Text>
          {t.comValor && <Text style={[s.celula, s.num, { color: tema.cor("texto"), flex: 1.6 }]} numberOfLines={1}>{l.valor}</Text>}
        </View>
      ))}
    </View>
  );
}

// Barras (lado a lado até 2 séries, empilhadas acima) e linha.
function Grafico({ w, d, modulo, moeda, largura }) {
  const { tema } = useApp();
  const [sel, setSel] = useState(null);
  const g = dadosGrafico(w, d, modulo, moeda, tema);
  if (g.vazio) return <Text style={{ color: tema.cor("texto-fraco") }}>Sem dados</Text>;
  const n = g.rotulos.length;
  const passo = Math.max(56, (largura - EIXO) / Math.max(n, 1)); // grupo nunca menor que 56 px: rola de lado
  const larguraUtil = passo * n;
  const topo = 8;
  const base = ALTURA - 26;
  const y = (v) => base - (g.maximo ? (v / g.maximo) * (base - topo) : 0);
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => g.maximo * f);
  const grade = tema.cor("borda");
  const fraco = tema.cor("texto-fraco");
  const resumo = g.rotulos.map((r, i) => `${r}: ${g.series.map((s2) => `${g.series.length > 1 ? `${s2.rotulo} ` : ""}${g.fmt(s2.valores[i] || 0)}`).join(", ")}`).join("; ");

  const barras = g.rotulos.map((_, i) => {
    const x0 = i * passo;
    if (g.linha) return null;
    if (g.empilhar) {
      let acc = 0;
      return g.series.map((s2) => {
        const v = s2.valores[i] || 0;
        const ry = y(acc + v);
        const h = y(acc) - ry;
        acc += v;
        return <Rect key={`${i}-${s2.rotulo}`} x={x0 + passo * 0.2} y={ry} width={passo * 0.6} height={Math.max(0, h)} fill={s2.cor} />;
      });
    }
    const k = g.series.length;
    const lb = Math.min(36, (passo * 0.7) / k);
    const ini = x0 + (passo - lb * k) / 2;
    return g.series.map((s2, j) => {
      const v = s2.valores[i] || 0;
      return <Rect key={`${i}-${s2.rotulo}`} x={ini + j * lb} y={y(v)} width={lb - 2} height={Math.max(0, base - y(v))} rx={4}
        fill={s2.coresPorGrupo ? s2.coresPorGrupo[i] : s2.cor} />;
    });
  });

  const desenho = (
    <Svg width={larguraUtil} height={ALTURA}>
      {marcas.map((m) => <Line key={m} x1={0} x2={larguraUtil} y1={y(m)} y2={y(m)} stroke={grade} strokeWidth={1} />)}
      {sel !== null && <Rect x={sel * passo} y={topo} width={passo} height={base - topo} fill={tema.cor("hover")} />}
      <G>{barras}</G>
      {g.linha && g.series.map((s2) => (
        <G key={s2.rotulo}>
          <Polyline points={s2.valores.map((v, i) => `${i * passo + passo / 2},${y(v || 0)}`).join(" ")} fill="none" stroke={s2.cor} strokeWidth={2.5} />
          {s2.valores.map((v, i) => <Circle key={i} cx={i * passo + passo / 2} cy={y(v || 0)} r={3.5} fill={s2.cor} />)}
        </G>
      ))}
      {g.rotulos.map((r, i) => (
        <SvgText fontFamily={FONTE} key={`r${i}`} x={i * passo + passo / 2} y={ALTURA - 8} fontSize={11} fill={fraco} textAnchor="middle">{cortar(r, Math.floor(passo / 7))}</SvgText>
      ))}
      {g.rotulos.map((_, i) => (
        <Rect key={`t${i}`} x={i * passo} y={0} width={passo} height={ALTURA} fill="transparent" onPress={() => setSel(sel === i ? null : i)} />
      ))}
    </Svg>
  );

  return (
    <View accessible accessibilityLabel={`Gráfico de ${g.linha ? "linha" : "barras"}. ${resumo}`}>
      <Text style={[s.selecao, { color: sel === null ? fraco : tema.cor("texto") }]} numberOfLines={2}>
        {sel === null ? "Toque num grupo para ver os valores" : `${g.rotulos[sel]}: ${g.series.map((s2) => `${g.series.length > 1 ? `${s2.rotulo} ` : ""}${g.fmt(s2.valores[sel] || 0)}`).join(" · ")}`}
      </Text>
      <View style={{ flexDirection: "row" }}>
        <Svg width={EIXO} height={ALTURA} style={{ flexShrink: 0 }}>
          {marcas.map((m) => <SvgText fontFamily={FONTE} key={m} x={EIXO - 6} y={y(m) + 4} fontSize={10} fill={fraco} textAnchor="end">{abreviar(m)}</SvgText>)}
        </Svg>
        {larguraUtil > largura - EIXO
          ? <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>{desenho}</ScrollView>
          : desenho}
      </View>
      <Legenda itens={g.series.map((s2) => ({ rotulo: s2.rotulo, cor: s2.cor }))} />
    </View>
  );
}

// Rosca: fatias por Path; o centro mostra quantas categorias, como na web.
function Pizza({ d, modulo, moeda }) {
  const { tema } = useApp();
  const [sel, setSel] = useState(null);
  const p = dadosPizza(d, modulo, moeda, tema);
  if (!p.fatias.length) return <Text style={{ color: tema.cor("texto-fraco") }}>Sem dados</Text>;
  const R = 70;
  const r = 44;
  const c = R + 4;
  let ang = -Math.PI / 2;
  const ponto = (raio, a) => `${c + raio * Math.cos(a)},${c + raio * Math.sin(a)}`;
  return (
    <View style={s.pizza} accessible accessibilityLabel={`Gráfico de rosca. ${p.fatias.map((f) => `${f.rotulo}: ${f.texto}`).join("; ")}`}>
      <Svg width={c * 2} height={c * 2}>
        {p.fatias.map((f, i) => {
          const a0 = ang;
          const a1 = ang + f.fracao * Math.PI * 2 - (p.fatias.length > 1 ? 0.0001 : 0.0001);
          ang += f.fracao * Math.PI * 2;
          const grande = a1 - a0 > Math.PI ? 1 : 0;
          const caminho = `M ${ponto(R, a0)} A ${R} ${R} 0 ${grande} 1 ${ponto(R, a1)} L ${ponto(r, a1)} A ${r} ${r} 0 ${grande} 0 ${ponto(r, a0)} Z`;
          return <Path key={f.rotulo} d={caminho} fill={f.cor} stroke={tema.cor("superficie")} strokeWidth={2} opacity={sel === null || sel === i ? 1 : 0.35} onPress={() => setSel(sel === i ? null : i)} />;
        })}
        <SvgText fontFamily={FONTE} x={c} y={c + 2} fontSize={sel === null ? 22 : 14} fontWeight="bold" fill={tema.cor("texto")} textAnchor="middle">
          {sel === null ? String(p.fatias.length) : `${Math.round(p.fatias[sel].fracao * 100)}%`}
        </SvgText>
        <SvgText fontFamily={FONTE} x={c} y={c + 18} fontSize={10} fill={tema.cor("texto-fraco")} textAnchor="middle">{sel === null ? cortar(p.grupo, 12) : cortar(p.fatias[sel].rotulo, 12)}</SvgText>
      </Svg>
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        {p.fatias.map((f, i) => (
          <Pressable key={f.rotulo} onPress={() => setSel(sel === i ? null : i)} style={s.fatia} accessibilityRole="button" accessibilityLabel={`${f.rotulo}: ${f.texto}`}>
            <View style={[s.bolinha, { backgroundColor: f.cor }]} />
            <Text style={{ color: tema.cor("texto-2"), fontSize: 13, flex: 1 }} numberOfLines={1}>{f.rotulo}</Text>
            <Text style={{ color: sel === i ? tema.cor("texto") : tema.cor("texto-fraco"), fontSize: 13, fontWeight: sel === i ? "700" : "400" }}>{f.texto}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Calendário: quadradinhos por dia, semanas que cabem na largura.
function Calendario({ d, modulo, moeda, largura }) {
  const { tema } = useApp();
  const [sel, setSel] = useState(null);
  const CEL = 14;
  const VAO = 3;
  const semanas = Math.max(8, Math.min(53, Math.floor((largura - 26) / (CEL + VAO))));
  const c = dadosCalendario(d, modulo, moeda, semanas);
  const base = tema.corUnica(d.config);
  const mistura = ["0", "4d", "8c", "cc", "ff"]; // opacidade por nível (hex)
  const cor = (n) => (n === 0 ? tema.cor("hover") : `${base}${mistura[n]}`);
  const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const escolhido = sel !== null ? c.dias[sel] : null;
  return (
    <View accessible={false}>
      <Text style={[s.selecao, { color: escolhido ? tema.cor("texto") : tema.cor("texto-fraco") }]}>
        {escolhido ? `${escolhido.texto} em ${SEM[escolhido.sem]}, ${escolhido.data.split("-").reverse().join("/")}` : "Toque num dia para ver o valor"}
      </Text>
      <Svg width={26 + semanas * (CEL + VAO)} height={16 + 7 * (CEL + VAO)} accessibilityLabel={`Calendário: ${c.total} em ${c.ativos} dias nas últimas ${semanas} semanas`}>
        {c.meses.map((m) => <SvgText fontFamily={FONTE} key={`${m.coluna}${m.nome}`} x={26 + m.coluna * (CEL + VAO)} y={11} fontSize={10} fill={tema.cor("texto-fraco")}>{m.nome}</SvgText>)}
        {[1, 3, 5].map((sm) => <SvgText fontFamily={FONTE} key={sm} x={0} y={16 + sm * (CEL + VAO) + 11} fontSize={10} fill={tema.cor("texto-fraco")}>{SEM[sm]}</SvgText>)}
        {c.dias.map((x, i) => (
          <Rect key={x.data} x={26 + Math.floor(i / 7) * (CEL + VAO)} y={16 + x.sem * (CEL + VAO)} width={CEL} height={CEL} rx={4}
            fill={cor(x.nivel)} stroke={i === c.dias.length - 1 ? tema.cor("texto-2") : sel === i ? tema.cor("destaque") : "none"} strokeWidth={1.5}
            onPress={() => setSel(sel === i ? null : i)} />
        ))}
      </Svg>
      <View style={s.calNumeros}>
        {[["Total", c.total], ["Dias ativos", String(c.ativos)], ["Sequência atual", `${c.atual} d`], ["Maior sequência", `${c.maior} d`]].map(([r, v]) => (
          <View key={r} style={[s.calNumero, { backgroundColor: tema.cor("hover") }]}>
            <Text style={{ color: tema.cor("texto-fraco"), fontSize: 11 }}>{r}</Text>
            <Text style={{ color: tema.cor("texto"), fontSize: 15, fontWeight: "700" }}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CorpoDoCard({ w, d, modulo, moeda, largura }) {
  const props = { w, d, modulo, moeda, largura };
  if (w.tipo === "kpi") return d.config.meta ? <Meta {...props} /> : <Numero {...props} />;
  if (w.tipo === "table") return <Tabela {...props} />;
  if (w.tipo === "pie") return <Pizza {...props} />;
  if (w.tipo === "calendario") return <Calendario {...props} />;
  return <Grafico {...props} />;
}

const s = StyleSheet.create({
  numero: { fontSize: 26, fontWeight: "800" },
  trilho: { height: 12, borderRadius: 6, overflow: "hidden" },
  linhaTabela: { flexDirection: "row", paddingVertical: 8, gap: 8 },
  celula: { flex: 1, fontSize: 14 },
  cab: { fontWeight: "600", fontSize: 13 },
  num: { textAlign: "right" },
  selecao: { fontSize: 13, marginBottom: 6, minHeight: 18 },
  legenda: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 },
  legendaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  bolinha: { width: 10, height: 10, borderRadius: 5 },
  pizza: { flexDirection: "row", alignItems: "center", gap: 12 },
  fatia: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  calNumeros: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  calNumero: { borderRadius: 10, paddingVertical: 5, paddingHorizontal: 10, flexGrow: 1 }
});
