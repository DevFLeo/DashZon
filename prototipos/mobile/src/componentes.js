// Peças de interface do app: botões, campos, chips, avisos e confirmação.
// Acessibilidade com as propriedades aria-* (role, aria-checked...): valem no
// celular e na web; o accessibilityState antigo o React Native Web ignora.
// Alvos de toque de 44 px no mínimo e rótulos para o leitor de tela.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useApp } from "./sessao";

export function Botao({ titulo, onPress, tipo = "normal", desativado, carregando, rotulo, estilo, pequeno }) {
  const { tema } = useApp();
  const fundo = tipo === "primario" ? tema.cor("destaque") : tipo === "perigo" ? tema.cor("ruim") : tema.cor("superficie");
  const texto = tipo === "primario" ? tema.cor("destaque-tinta") : tipo === "perigo" ? "#ffffff" : tema.cor("texto");
  return (
    <Pressable onPress={onPress} disabled={desativado || carregando} accessibilityRole="button" accessibilityLabel={rotulo || titulo}
      aria-disabled={!!(desativado || carregando)} aria-busy={!!carregando}
      style={({ pressed }) => [s.botao, pequeno && s.botaoPequeno, { backgroundColor: fundo, borderColor: tipo === "normal" ? tema.cor("borda") : fundo, opacity: desativado ? 0.5 : pressed ? 0.85 : 1 }, estilo]}>
      {carregando ? <ActivityIndicator color={texto} /> : <Text style={[s.botaoTexto, { color: texto }]}>{titulo}</Text>}
    </Pressable>
  );
}

export function Campo({ rotulo, obrigatorio, ajuda, erro, ...props }) {
  const { tema } = useApp();
  const [foco, setFoco] = useState(false);
  return (
    <View style={s.campo}>
      {rotulo ? <Text style={[s.rotulo, { color: tema.cor("texto-2") }]}>{rotulo}{obrigatorio ? <Text style={{ color: tema.cor("ruim") }}> *</Text> : null}</Text> : null}
      <TextInput placeholderTextColor={tema.cor("texto-fraco")} accessibilityLabel={rotulo} onFocus={() => setFoco(true)} onBlur={() => setFoco(false)}
        style={[s.entrada, { color: tema.cor("texto"), backgroundColor: tema.cor("fundo"), borderColor: foco ? tema.cor("destaque") : tema.cor("borda") }, props.multiline && s.entradaLonga]}
        {...props} />
      {ajuda ? <Text style={[s.ajuda, { color: tema.cor("texto-fraco") }]}>{ajuda}</Text> : null}
      {erro ? <Text style={[s.ajuda, { color: tema.cor("ruim") }]}>{erro}</Text> : null}
    </View>
  );
}

export function Chip({ texto, ativo, onPress, cor }) {
  const { tema } = useApp();
  const destaque = cor || tema.cor("destaque");
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" aria-checked={!!ativo} accessibilityLabel={texto}
      style={[s.chip, { borderColor: ativo ? destaque : tema.cor("borda"), backgroundColor: ativo ? destaque : tema.cor("superficie") }]}>
      <Text style={[s.chipTexto, { color: ativo ? tema.cor("destaque-tinta") : tema.cor("texto-2") }]}>{texto}</Text>
    </Pressable>
  );
}

// Aviso que some sozinho (em 3,5 s), no rodapé.
export function useAviso() {
  const [aviso, setAviso] = useState(null);
  const timer = useRef(null);
  function avisar(texto, tipo = "ok") {
    clearTimeout(timer.current);
    setAviso({ texto, tipo });
    timer.current = setTimeout(() => setAviso(null), tipo === "erro" ? 6000 : 3500);
  }
  return [aviso, avisar];
}

export function Aviso({ aviso }) {
  const { tema } = useApp();
  const opacidade = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(opacidade, { toValue: aviso ? 1 : 0, duration: 180, useNativeDriver: false }).start(); }, [aviso, opacidade]);
  if (!aviso) return null;
  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" accessibilityRole="alert"
      style={[s.aviso, { opacity: opacidade, backgroundColor: aviso.tipo === "erro" ? tema.cor("ruim") : tema.cor("texto") }]}>
      <Text style={{ color: aviso.tipo === "erro" ? "#ffffff" : tema.cor("fundo"), fontSize: 15 }}>{aviso.texto}</Text>
    </Animated.View>
  );
}

// Confirmação própria (o Alert com botões não funciona no navegador).
export function Confirmar({ visivel, titulo, texto, acao = "Excluir", onSim, onNao }) {
  const { tema } = useApp();
  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={onNao}>
      <Pressable style={s.veu} onPress={onNao} accessibilityLabel="Fechar">
        <Pressable style={[s.caixa, { backgroundColor: tema.cor("superficie") }]} onPress={() => {}}>
          <Text style={[s.caixaTitulo, { color: tema.cor("texto") }]}>{titulo}</Text>
          <Text style={{ color: tema.cor("texto-2"), fontSize: 15, lineHeight: 21 }}>{texto}</Text>
          <View style={s.caixaBotoes}>
            <Botao titulo="Cancelar" onPress={onNao} estilo={{ flex: 1 }} />
            <Botao titulo={acao} tipo="perigo" onPress={onSim} estilo={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Cabeçalho de tela: voltar (quando houver), título e uma ação à direita.
export function Cabecalho({ titulo, sub, onVoltar, direita }) {
  const { tema } = useApp();
  return (
    <View style={[s.cabecalho, { borderBottomColor: tema.cor("borda"), backgroundColor: tema.cor("superficie") }]}>
      {onVoltar ? (
        <Pressable onPress={onVoltar} accessibilityRole="button" accessibilityLabel="Voltar" style={s.voltar} hitSlop={8}>
          <Text style={{ color: tema.cor("destaque"), fontSize: 26, lineHeight: 28 }}>{"‹"}</Text>
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.titulo, { color: tema.cor("texto") }]} numberOfLines={1} accessibilityRole="header">{titulo}</Text>
        {sub ? <Text style={{ color: tema.cor("texto-fraco"), fontSize: 13 }} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {direita}
    </View>
  );
}

const s = StyleSheet.create({
  botao: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  botaoPequeno: { minHeight: 44, paddingHorizontal: 12 },
  botaoTexto: { fontSize: 16, fontWeight: "700" },
  campo: { gap: 6, marginBottom: 14 },
  rotulo: { fontSize: 14, fontWeight: "600" },
  entrada: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  entradaLonga: { minHeight: 110, paddingTop: 12, textAlignVertical: "top" },
  ajuda: { fontSize: 13 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, justifyContent: "center" },
  chipTexto: { fontSize: 15, fontWeight: "600" },
  aviso: { position: "absolute", left: 16, right: 16, bottom: 24, padding: 14, borderRadius: 14 },
  veu: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  caixa: { borderRadius: 20, padding: 20, gap: 14 },
  caixaTitulo: { fontSize: 19, fontWeight: "700" },
  caixaBotoes: { flexDirection: "row", gap: 10, marginTop: 6 },
  cabecalho: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, minHeight: 60 },
  voltar: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  titulo: { fontSize: 19, fontWeight: "800" }
});
