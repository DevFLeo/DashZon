// Dashboard no celular: os cards empilhados na ordem da posição salva
// (y*12 + x), números e metas estreitos lado a lado, como no responsivo do
// oficial. Cada card busca os próprios dados (GET /api/widgets/:id/data).
// Puxar para baixo atualiza tudo.
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { CorpoDoCard } from "../cards";
import { Cabecalho } from "../componentes";
import { meiaLinha, ordemDosCards } from "../graficos";
import { useApp } from "../sessao";

const PADDING = 30; // recuo interno do card (15 de cada lado)

function Card({ w, largura, versao }) {
  const { tema, api, sessao } = useApp();
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let vivo = true;
    setErro("");
    api.get(`/api/widgets/${w.id}/data`).then((x) => vivo && setD(x)).catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [api, w.id, versao]);
  const modulo = sessao.modulos.find((m) => m.slug === w.modulo_slug);
  const meia = meiaLinha(w);
  return (
    <View style={[s.card, meia && s.meia, { backgroundColor: tema.cor("superficie"), borderColor: tema.cor("borda") }]}>
      <Text style={[s.titulo, { color: tema.cor("texto-2") }]} numberOfLines={2} accessibilityRole="header">{w.titulo}</Text>
      {erro ? <Text style={{ color: tema.cor("ruim") }}>{erro}</Text>
        : !d ? <ActivityIndicator color={tema.cor("destaque")} />
          : <CorpoDoCard w={w} d={d} modulo={modulo} moeda={sessao.moeda} largura={meia ? (largura + PADDING) * 0.485 - PADDING : largura} />}
    </View>
  );
}

export default function Dashboard({ id, voltar }) {
  const { tema, api } = useApp();
  const [dash, setDash] = useState(null);
  const [erro, setErro] = useState("");
  const [largura, setLargura] = useState(0);
  const [versao, setVersao] = useState(0);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(() => api.get(`/api/dashboards/${id}`).then((x) => { setDash(x); setErro(""); }).catch((e) => setErro(e.message)), [api, id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function atualizar() {
    setAtualizando(true);
    await carregar();
    setVersao((v) => v + 1);
    setAtualizando(false);
  }

  const quem = !dash ? "" : dash.visibilidade === "privado" ? "Só você vê" : dash.visibilidade === "equipes" ? "Equipes escolhidas" : "Todos veem";
  return (
    <View style={{ flex: 1 }}>
      <Cabecalho titulo={dash?.nome || "Carregando…"} sub={dash ? `${quem} · ${dash.widgets.length} cards` : ""} onVoltar={voltar} />
      {erro ? <Text style={{ color: tema.cor("ruim"), padding: 16 }}>{erro}</Text> : null}
      {!dash ? <ActivityIndicator style={{ marginTop: 40 }} color={tema.cor("destaque")} /> : (
        <ScrollView contentContainerStyle={s.lista} onLayout={(e) => setLargura(e.nativeEvent.layout.width - 32 - 30)}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={tema.cor("destaque")} />}>
          {!dash.widgets.length ? <Text style={{ color: tema.cor("texto-fraco"), textAlign: "center", padding: 24 }}>Dashboard vazio.</Text> : null}
          <View style={s.grade}>
            {largura > 0 && ordemDosCards(dash.widgets).map((w) => <Card key={w.id} w={w} largura={largura} versao={versao} />)}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  lista: { padding: 16, paddingBottom: 40 },
  grade: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  card: { width: "100%", borderWidth: 1, borderRadius: 16, padding: 15, gap: 8 },
  meia: { width: "48.5%" },
  titulo: { fontSize: 14, fontWeight: "700" }
});
