// Módulo: resumo, busca e os registros em cartões. Tocar num registro abre a
// edição; o botão "+" lança um novo; puxar para baixo atualiza.
// Mesmas regras da web: a busca espera a digitação e descarta resposta velha.
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { NUMERICOS, fmtMoeda, fmtNumero, fmtValor } from "@dashzon/core";
import { Cabecalho } from "../componentes";
import { useApp } from "../sessao";

const FORA = ["texto_longo", "markdown"];

export default function Modulo({ slug, voltar, ir, versao }) {
  const { tema, api, sessao } = useApp();
  const [modulo, setModulo] = useState(null);
  const [resumo, setResumo] = useState([]);
  const [regs, setRegs] = useState(null);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");
  const ultima = useRef(0);
  const base = `/api/modulos/${encodeURIComponent(slug)}`;

  const carregar = useCallback(async (mais = false, atuais = []) => {
    const qs = new URLSearchParams();
    if (busca.trim()) qs.set("q", busca.trim());
    qs.set("limite", "50");
    if (mais) qs.set("inicio", String(atuais.length));
    const minha = ++ultima.current;
    try {
      const r = await api.get(`${base}/registros?${qs}`);
      if (minha !== ultima.current) return;
      setRegs(mais ? atuais.concat(r.result) : r.result);
      setTotal(r.count);
      setErro("");
    } catch (e) { if (minha === ultima.current) setErro(e.message); }
  }, [api, base, busca]);

  useEffect(() => {
    api.get(base).then(setModulo).catch((e) => setErro(e.message));
    api.get(`${base}/resumo`).then(setResumo).catch(() => setResumo([]));
  }, [api, base, versao]);

  useEffect(() => {
    const t = setTimeout(() => carregar(), busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca, versao]);

  async function atualizar() {
    setAtualizando(true);
    await Promise.all([carregar(), api.get(`${base}/resumo`).then(setResumo).catch(() => {})]);
    setAtualizando(false);
  }

  if (!modulo) {
    return (
      <View style={{ flex: 1 }}>
        <Cabecalho titulo="Carregando…" onVoltar={voltar} />
        {erro ? <Text style={{ color: tema.cor("ruim"), padding: 16 }}>{erro}</Text> : <ActivityIndicator style={{ marginTop: 40 }} color={tema.cor("destaque")} />}
      </View>
    );
  }

  const campos = modulo.schema.campos;
  const rotulo = modulo.schema.rotulo;
  const visiveis = campos.filter((c) => c.id !== rotulo && c.lista !== false && !FORA.includes(c.tipo)).slice(0, 4);
  const faltam = regs ? total - regs.length : 0;

  const Cartao = ({ item: r }) => (
    <Pressable onPress={() => ir({ tela: "form", slug, id: r.id })} accessibilityRole="button"
      accessibilityLabel={`${r[rotulo] ?? `Registro ${r.id}`}. Tocar para editar`}
      style={({ pressed }) => [s.cartao, { backgroundColor: tema.cor("superficie"), borderColor: tema.cor("borda"), opacity: pressed ? 0.85 : 1 }]}>
      <Text style={[s.cartaoTitulo, { color: tema.cor("texto") }]} numberOfLines={1}>{String(r[rotulo] ?? `Registro ${r.id}`)}</Text>
      <View style={s.cartaoCampos}>
        {visiveis.map((c) => {
          const v = r[c.id];
          if (c.tipo === "movimento" && v) {
            const cor = v === "saida" ? tema.corDe({}, c, "saida") : tema.corDe({}, c, "entrada");
            return <Text key={c.id} style={[s.etiqueta, { color: cor, borderColor: cor }]}>{fmtValor(c, v)}</Text>;
          }
          const texto = c.tipo === "booleano" ? `${c.nome}: ${v ? "Sim" : "Não"}` : fmtValor(c, v, sessao.moeda);
          return (
            <Text key={c.id} style={[s.valor, { color: NUMERICOS.includes(c.tipo) ? tema.cor("texto") : tema.cor("texto-2"), fontWeight: NUMERICOS.includes(c.tipo) ? "700" : "400" }]}
              numberOfLines={1}>{texto}</Text>
          );
        })}
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <Cabecalho titulo={modulo.nome} sub={`${fmtNumero(total, 0)} registro(s)`} onVoltar={voltar} />
      <FlatList
        data={regs || []}
        keyExtractor={(r) => String(r.id)}
        renderItem={Cartao}
        contentContainerStyle={s.lista}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={tema.cor("destaque")} />}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            {resumo.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {resumo.map((k) => {
                  const texto = k.agregacao === "contagem" ? fmtNumero(k.valor, 0) : k.formato === "moeda" ? fmtMoeda(k.valor, sessao.moeda) : fmtNumero(k.valor);
                  const cor = k.agregacao === "saldo" ? (k.valor >= 0 ? tema.cor("bom") : tema.cor("ruim")) : tema.cor("texto");
                  return (
                    <View key={k.titulo} style={[s.kpi, { backgroundColor: tema.cor("superficie"), borderColor: tema.cor("borda") }]} accessible accessibilityLabel={`${k.titulo}: ${texto}`}>
                      <Text style={{ color: tema.cor("texto-fraco"), fontSize: 13 }}>{k.titulo}</Text>
                      <Text style={{ color: cor, fontSize: 20, fontWeight: "800" }}>{texto}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <TextInput value={busca} onChangeText={setBusca} placeholder="Buscar" placeholderTextColor={tema.cor("texto-fraco")}
              accessibilityLabel={`Buscar em ${modulo.nome}`} clearButtonMode="while-editing" returnKeyType="search"
              style={[s.busca, { color: tema.cor("texto"), backgroundColor: tema.cor("superficie"), borderColor: tema.cor("borda") }]} />
            {erro ? <Text style={{ color: tema.cor("ruim") }}>{erro}</Text> : null}
          </View>
        }
        ListEmptyComponent={regs ? (
          <Text style={{ color: tema.cor("texto-fraco"), textAlign: "center", padding: 24 }}>
            {busca ? "Nada encontrado com essa busca." : "Nenhum registro ainda. Toque em + para lançar o primeiro."}
          </Text>
        ) : <ActivityIndicator style={{ marginTop: 24 }} color={tema.cor("destaque")} />}
        ListFooterComponent={faltam > 0 ? (
          <Pressable onPress={() => carregar(true, regs)} accessibilityRole="button" style={[s.mais, { borderColor: tema.cor("borda") }]}>
            <Text style={{ color: tema.cor("destaque"), fontWeight: "700" }}>Carregar mais ({fmtNumero(faltam, 0)})</Text>
          </Pressable>
        ) : <View style={{ height: 90 }} />}
      />
      <Pressable onPress={() => ir({ tela: "form", slug })} accessibilityRole="button" accessibilityLabel={`Lançar em ${modulo.nome}`}
        style={({ pressed }) => [s.fab, { backgroundColor: tema.cor("destaque"), opacity: pressed ? 0.85 : 1 }]}>
        <Text style={{ color: tema.cor("destaque-tinta"), fontSize: 30, lineHeight: 32, fontWeight: "400" }}>+</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  lista: { padding: 16, gap: 10 },
  kpi: { borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, minWidth: 140, gap: 2 },
  busca: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  cartao: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  cartaoTitulo: { fontSize: 17, fontWeight: "700" },
  cartaoCampos: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  valor: { fontSize: 14 },
  etiqueta: { fontSize: 13, fontWeight: "700", borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  mais: { minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 4, marginBottom: 90 },
  fab: { position: "absolute", right: 20, bottom: 28, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }
});
