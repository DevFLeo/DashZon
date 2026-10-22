// Ajustes: o tema (o mesmo da conta, também no oficial), o lembrete diário
// (só no aparelho) e sair.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { TEMAS } from "@dashzon/core";
import { Botao, Cabecalho, Campo, Chip } from "../componentes";
import { horaTexto, lerHora } from "../formatos";
import { SUPORTADO, desligarLembrete, ligarLembrete, lerLembrete } from "../lembretes";
import { NA_WEB, useApp } from "../sessao";

const HORAS = ["08:00", "12:00", "18:00", "20:00"];

function Lembretes({ avisar }) {
  const { tema, sessao } = useApp();
  const [salvo, setSalvo] = useState(null);
  const [ligado, setLigado] = useState(false);
  const [hora, setHora] = useState("20:00");
  const [modulo, setModulo] = useState(sessao.menuModulos[0]?.slug || "");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    lerLembrete().then((l) => {
      if (!l) return;
      setSalvo(l);
      setLigado(!!l.ligado);
      setHora(l.hora);
      if (sessao.menuModulos.some((m) => m.slug === l.modulo)) setModulo(l.modulo);
    });
  }, []);

  if (!SUPORTADO) {
    return <Text style={{ color: tema.cor("texto-fraco") }}>Os lembretes funcionam no app do celular (notificações do aparelho).</Text>;
  }
  const horaLida = lerHora(hora);
  async function salvar() {
    if (!horaLida) { avisar("Hora inválida. Use HH:MM, por exemplo 20:00.", "erro"); return; }
    const m = sessao.menuModulos.find((x) => x.slug === modulo);
    if (!m) { avisar("Escolha um módulo.", "erro"); return; }
    setEnviando(true);
    try {
      const novo = ligado ? await ligarLembrete(horaLida, m) : await desligarLembrete();
      setSalvo(novo);
      avisar(ligado ? `Lembrete todo dia às ${horaTexto(horaLida)}` : "Lembrete desligado");
    } catch (e) { avisar(e.message, "erro"); } finally { setEnviando(false); }
  }
  return (
    <View>
      <View style={[s.linha, { borderColor: tema.cor("borda") }]}>
        <Text style={{ color: tema.cor("texto"), fontSize: 16, flex: 1 }}>Lembrete diário para lançar</Text>
        <Switch value={ligado} onValueChange={setLigado} accessibilityLabel="Lembrete diário para lançar"
          trackColor={{ true: tema.cor("destaque"), false: tema.cor("borda") }} thumbColor={tema.cor("superficie")} />
      </View>
      {ligado && (
        <>
          <Campo rotulo="Horário" value={hora} onChangeText={setHora} placeholder="HH:MM" keyboardType="numbers-and-punctuation" maxLength={5}
            erro={hora && !horaLida ? "Use HH:MM, por exemplo 20:00." : ""} />
          <View style={[s.chips, { marginTop: -6, marginBottom: 14 }]}>
            {HORAS.map((h) => <Chip key={h} texto={h} ativo={hora === h} onPress={() => setHora(h)} />)}
          </View>
          <Text style={[s.rotulo, { color: tema.cor("texto-2") }]}>Abrir o formulário de</Text>
          <View style={[s.chips, { marginBottom: 14 }]}>
            {sessao.menuModulos.map((m) => <Chip key={m.slug} texto={m.nome} ativo={modulo === m.slug} onPress={() => setModulo(m.slug)} />)}
          </View>
        </>
      )}
      {salvo?.ligado ? <Text style={{ color: tema.cor("texto-fraco"), marginBottom: 10 }}>Agora: todo dia às {salvo.hora}, em {salvo.nomeModulo}.</Text> : null}
      <Botao titulo={ligado ? "Salvar lembrete" : "Desligar lembrete"} onPress={salvar} carregando={enviando} desativado={!ligado && !salvo?.ligado} />
    </View>
  );
}

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
            // Automático: as cores de destaque dos temas que ele usa (Vivaldi: as quatro estações).
            const partes = t.compoe ? t.compoe.map((id) => TEMAS.find((x) => x.id === id)?.previa).filter(Boolean) : [];
            const [fundo, cartao, , destaque, s1, s2, s3] = t.previa || [partes[0][0], partes[0][1], "", partes[0][3], ...partes.map((p) => p[3]).slice(-3)];
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

        <Text style={[s.secao, { color: tema.cor("texto-fraco"), marginTop: 24 }]}>LEMBRETES</Text>
        <Lembretes avisar={avisar} />

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
  previaBotao: { width: 16, height: 16, borderRadius: 5 },
  linha: { flexDirection: "row", alignItems: "center", minHeight: 56, borderBottomWidth: 1, marginBottom: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rotulo: { fontSize: 14, fontWeight: "600", marginBottom: 8 }
});
