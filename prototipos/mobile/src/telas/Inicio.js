// Início: os dashboards e os módulos do menu da pessoa (ordem e ocultos da
// conta, como na web); cada módulo com "Lançar" direto. Puxar para baixo
// atualiza.
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Cabecalho } from "../componentes";
import { useApp } from "../sessao";

export default function Inicio({ ir, recarregando, recarregar }) {
  const { tema, sessao } = useApp();
  const nome = sessao.usuario.nome || sessao.usuario.login;
  return (
    <View style={{ flex: 1 }}>
      <Cabecalho titulo="DashZon" sub={`Olá, ${nome}`}
        direita={
          <Pressable onPress={() => ir({ tela: "ajustes" })} accessibilityRole="button" accessibilityLabel="Ajustes" style={s.acao}>
            <Text style={{ color: tema.cor("destaque"), fontWeight: "700", fontSize: 15 }}>Ajustes</Text>
          </Pressable>
        } />
      <FlatList
        data={sessao.menuModulos}
        keyExtractor={(m) => m.slug}
        contentContainerStyle={s.lista}
        refreshControl={<RefreshControl refreshing={recarregando} onRefresh={recarregar} tintColor={tema.cor("destaque")} />}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {sessao.menuDashboards.length > 0 && <Text style={[s.secao, { color: tema.cor("texto-fraco") }]}>DASHBOARDS</Text>}
            {sessao.menuDashboards.map((d) => (
              <Pressable key={d.id} onPress={() => ir({ tela: "dashboard", id: d.id })} accessibilityRole="button"
                accessibilityLabel={`Dashboard ${d.nome}`}
                style={({ pressed }) => [s.item, s.dash, { backgroundColor: tema.cor("superficie"), borderColor: tema.cor("borda"), opacity: pressed ? 0.85 : 1 }]}>
                <View style={[s.marcaDash, { backgroundColor: tema.cor("destaque") }]} />
                <View style={s.itemAbrir}>
                  <Text style={[s.itemNome, { color: tema.cor("texto") }]} numberOfLines={1}>{d.nome}</Text>
                  <Text style={{ color: tema.cor("texto-fraco"), fontSize: 13 }}>{d.visibilidade === "privado" ? "Só você vê" : d.visibilidade === "equipes" ? "Equipes escolhidas" : "Todos veem"}</Text>
                </View>
                <Text style={{ color: tema.cor("texto-fraco"), fontSize: 22 }}>{"›"}</Text>
              </Pressable>
            ))}
            <Text style={[s.secao, { color: tema.cor("texto-fraco"), marginTop: sessao.menuDashboards.length ? 8 : 0 }]}>MÓDULOS</Text>
          </View>
        }
        ListEmptyComponent={<Text style={{ color: tema.cor("texto-fraco"), padding: 16 }}>Nenhum módulo no seu menu.</Text>}
        renderItem={({ item: m }) => (
          <View style={[s.item, { backgroundColor: tema.cor("superficie"), borderColor: tema.cor("borda") }]}>
            <Pressable style={s.itemAbrir} onPress={() => ir({ tela: "modulo", slug: m.slug })} accessibilityRole="button"
              accessibilityLabel={`${m.nome}, ${m.total} registros`}>
              <Text style={[s.itemNome, { color: tema.cor("texto") }]} numberOfLines={1}>{m.nome}</Text>
              <Text style={{ color: tema.cor("texto-fraco"), fontSize: 13 }}>{m.total} registro(s){m.visibilidade === "privado" ? " · só você vê" : ""}{m.pode_lancar === false ? " · só leitura" : ""}</Text>
            </Pressable>
            {m.pode_lancar === false ? null : <Pressable onPress={() => ir({ tela: "form", slug: m.slug })} accessibilityRole="button" accessibilityLabel={`Lançar em ${m.nome}`}
              style={[s.lancar, { backgroundColor: tema.cor("destaque") }]}>
              <Text style={{ color: tema.cor("destaque-tinta"), fontWeight: "800", fontSize: 15 }}>+ Lançar</Text>
            </Pressable>}
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  lista: { padding: 16, gap: 10 },
  secao: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, marginBottom: 2 },
  acao: { minHeight: 44, minWidth: 44, justifyContent: "center", paddingHorizontal: 8 },
  item: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingLeft: 16, paddingRight: 10, minHeight: 72 },
  itemAbrir: { flex: 1, minWidth: 0, paddingVertical: 12, gap: 2 },
  itemNome: { fontSize: 17, fontWeight: "700" },
  lancar: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, justifyContent: "center" },
  dash: { gap: 12, paddingRight: 16 },
  marcaDash: { width: 6, alignSelf: "stretch", borderRadius: 3, marginVertical: 14 }
});
