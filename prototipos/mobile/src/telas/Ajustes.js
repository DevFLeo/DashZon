// Ajustes: o tema (o mesmo da conta, também no oficial) e sair.
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { TEMAS } from "@dashzon/core";
import { Botao, Cabecalho } from "../componentes";
import { NA_WEB, useApp } from "../sessao";

export default function Ajustes({ voltar, escolherTema, sair, servidor, avisar }) {
  const { tema, sessao } = useApp();
  async function trocar(t) {
    try {
      await escolherTema(t.id);
      avisar(`Tema ${t.nome} aplicado`);
    } catch (e) { avisar(`O tema não foi salvo na conta: ${e.message}`, "erro"); }
  }
  return (
    <View style={{ flex: 1 }}>
      <Cabecalho titulo="Ajustes" onVoltar={voltar} />
      <ScrollView contentContainerStyle={s.tela}>
        <Text style={[s.secao, { color: tema.cor("texto-fraco") }]}>TEMA</Text>
        <Text style={{ color: tema.cor("texto-2"), marginBottom: 10 }}>Fica na sua conta: vale aqui e no DashZon pelo navegador.</Text>
        <View style={s.grade} accessibilityRole="radiogroup" accessibilityLabel="Tema">
          {TEMAS.map((t) => {
            const ativo = tema.escolha === t.id;
            const [fundo, cartao, , destaque, s1, s2, s3] = t.previa || ["#f4f3ef", "#ffffff", "", "#2a78d6", "#2a78d6", "#0e0e0e", "#3987e5"];
            return (
              <Pressable key={t.id} onPress={() => trocar(t)} accessibilityRole="radio" aria-checked={ativo} accessibilityLabel={`${t.nome}. ${t.desc}`}
                style={[s.tema, { borderColor: ativo ? tema.cor("destaque") : tema.cor("borda"), borderWidth: ativo ? 2 : 1, backgroundColor: tema.cor("superficie") }]}>
                <View style={[s.previa, { backgroundColor: fundo }]}>
                  <View style={[s.previaCartao, { backgroundColor: cartao }]}>
                    {[s1, s2, s3].map((c, i) => <View key={i} style={{ flex: 1, height: `${[70, 45, 90][i]}%`, backgroundColor: c, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />)}
                  </View>
                  <View style={[s.previaBotao, { backgroundColor: destaque }]} />
                </View>
                <Text style={{ color: tema.cor("texto"), fontWeight: "700", fontSize: 15 }}>{t.nome}</Text>
                <Text style={{ color: tema.cor("texto-fraco"), fontSize: 12 }} numberOfLines={2}>{t.desc}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[s.secao, { color: tema.cor("texto-fraco"), marginTop: 24 }]}>CONTA</Text>
        <Text style={{ color: tema.cor("texto"), fontSize: 16 }}>{sessao.usuario.nome || sessao.usuario.login}</Text>
        {!NA_WEB && servidor ? <Text style={{ color: tema.cor("texto-fraco"), marginBottom: 12 }}>{servidor}</Text> : <View style={{ height: 12 }} />}
        <Botao titulo="Sair" onPress={sair} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  tela: { padding: 16, paddingBottom: 40 },
  secao: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6 },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tema: { width: "47.5%", flexGrow: 1, borderRadius: 14, padding: 8, gap: 4, minHeight: 44 },
  previa: { height: 64, borderRadius: 8, padding: 6, flexDirection: "row", alignItems: "flex-end", gap: 6, overflow: "hidden" },
  previaCartao: { flex: 1, height: "100%", borderRadius: 6, padding: 5, flexDirection: "row", alignItems: "flex-end", gap: 4 },
  previaBotao: { width: 16, height: 16, borderRadius: 5 }
});
