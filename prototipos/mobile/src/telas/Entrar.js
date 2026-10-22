// Entrar: no celular, o endereço do servidor (fica guardado); depois usuário
// e senha. O login é o mesmo da web (POST /api/login, sessão por cookie).
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Botao, Campo } from "../componentes";
import { NA_WEB, criarApiDoApp, gravarServidor, lerServidor, normalizarServidor, useApp } from "../sessao";

export default function Entrar({ onEntrou }) {
  const { tema } = useApp();
  const [servidor, setServidor] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { lerServidor().then(setServidor); }, []);

  async function entrar() {
    setErro("");
    const url = normalizarServidor(servidor);
    if (!NA_WEB && !url) { setErro("Informe o endereço do servidor."); return; }
    if (!usuario.trim() || !senha) { setErro("Informe usuário e senha."); return; }
    setEnviando(true);
    try {
      const api = criarApiDoApp(url);
      await api.post("/api/login", { usuario: usuario.trim(), senha });
      if (!NA_WEB) await gravarServidor(url);
      onEntrou(url);
    } catch (e) {
      setErro(e.status ? e.message : `Não foi possível falar com o servidor (${e.message}). Confira o endereço e a conexão.`);
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.tela} keyboardShouldPersistTaps="handled">
        <View style={[s.cartao, { backgroundColor: tema.cor("superficie"), borderColor: tema.cor("borda") }]}>
          <View style={s.marca}>
            <View style={[s.cubo, { borderColor: tema.cor("destaque"), backgroundColor: tema.cor("hover") }]} />
            <Text style={[s.nome, { color: tema.cor("texto") }]} accessibilityRole="header">DashZon</Text>
          </View>
          <Text style={{ color: tema.cor("texto-fraco"), marginBottom: 18 }}>App de celular (protótipo React Native)</Text>
          {!NA_WEB && (
            <Campo rotulo="Endereço do servidor" obrigatorio value={servidor} onChangeText={setServidor} placeholder="dashzon.seudominio.org"
              autoCapitalize="none" autoCorrect={false} keyboardType="url" ajuda="O mesmo endereço que você abre no navegador, com HTTPS." />
          )}
          <Campo rotulo="Usuário" obrigatorio value={usuario} onChangeText={setUsuario} autoCapitalize="none" autoCorrect={false}
            autoComplete="username" textContentType="username" returnKeyType="next" />
          <View>
            <Campo rotulo="Senha" obrigatorio value={senha} onChangeText={setSenha} secureTextEntry={!ver} autoCapitalize="none"
              autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={entrar} />
            <Pressable onPress={() => setVer((v) => !v)} accessibilityRole="button" accessibilityLabel={ver ? "Ocultar a senha" : "Mostrar a senha"} style={s.ver}>
              <Text style={{ color: tema.cor("destaque"), fontWeight: "600" }}>{ver ? "Ocultar" : "Mostrar"}</Text>
            </Pressable>
          </View>
          {erro ? <Text style={{ color: tema.cor("ruim"), marginBottom: 12 }} accessibilityRole="alert">{erro}</Text> : null}
          <Botao titulo="Entrar" tipo="primario" onPress={entrar} carregando={enviando} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  tela: { flexGrow: 1, justifyContent: "center", padding: 16 },
  cartao: { borderWidth: 1, borderRadius: 20, padding: 22, width: "100%", maxWidth: 440, alignSelf: "center" },
  marca: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  cubo: { width: 26, height: 26, borderWidth: 2, borderRadius: 6, transform: [{ rotate: "12deg" }] },
  nome: { fontSize: 28, fontWeight: "800" },
  ver: { position: "absolute", right: 6, top: 30, minHeight: 44, justifyContent: "center", paddingHorizontal: 10 }
});
