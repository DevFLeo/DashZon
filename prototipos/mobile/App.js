// DashZon no celular (protótipo React Native / Expo): entrar, dashboards,
// módulos, registros e lançamento rápido, temas da conta e lembretes.
// A lógica é a de @dashzon/core, a mesma dos protótipos web; a API é a do
// backend Ruby, sem mudança (sem Origin, só a sessão por cookie).
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Aviso, Botao, useAviso } from "./src/componentes";
import { aoTocarNoLembrete, configurarNotificacoes } from "./src/lembretes";
import { Provedor, criarApiDoApp, lerServidor, useTema } from "./src/sessao";
import Ajustes from "./src/telas/Ajustes";
import Dashboard from "./src/telas/Dashboard";
import Entrar from "./src/telas/Entrar";
import Formulario from "./src/telas/Formulario";
import Inicio from "./src/telas/Inicio";
import Modulo from "./src/telas/Modulo";

// Ordem do menu da conta (a mesma regra da web): quem não está na lista vai
// para o fim; módulos desligados pela pessoa não aparecem.
function ordenar(itens, ordem, chave) {
  const pos = new Map((ordem || []).map((k, i) => [String(k), i]));
  return [...itens].sort((a, b) => (pos.get(String(a[chave])) ?? 1e9) - (pos.get(String(b[chave])) ?? 1e9));
}

function Conteudo() {
  const [servidor, setServidor] = useState(null);
  const [sessao, setSessao] = useState({ carregando: true });
  const [pilha, setPilha] = useState([{ tela: "inicio" }]);
  const [versao, setVersao] = useState(0); // muda depois de salvar: as listas recarregam
  const [recarregando, setRecarregando] = useState(false);
  const [aviso, avisar] = useAviso();
  const api = useMemo(() => (servidor === null ? null : criarApiDoApp(servidor)), [servidor]);
  const [tema, escolherTema] = useTema(sessao.usuario?.preferencias?.tema, sessao.usuario ? api : null);

  useEffect(() => { lerServidor().then(setServidor); }, []);

  const carregar = useCallback(async () => {
    if (!api) return;
    try {
      const status = await api.get("/api/status");
      if (!status.usuario) { setSessao({ carregando: false, sem_login: true }); return; }
      const [modulos, dashboards] = await Promise.all([api.get("/api/modulos"), api.get("/api/dashboards")]);
      const pref = status.usuario.preferencias || {};
      const ocultos = new Set(pref.modulos_ocultos || []);
      setSessao({
        carregando: false, usuario: status.usuario, moeda: status.moeda, modulos,
        menuDashboards: ordenar(dashboards, pref.ordem_menu?.dashboards, "id"),
        menuModulos: ordenar(modulos.filter((m) => !ocultos.has(m.slug)), pref.ordem_menu?.modulos, "slug")
      });
    } catch (e) {
      // Sem servidor configurado (1º uso no celular) ou sem conexão: tela de entrar.
      setSessao({ carregando: false, sem_login: true, erro: e.status ? e.message : null });
    }
  }, [api]);
  useEffect(() => { carregar(); }, [carregar]);

  const ir = (t) => setPilha((p) => [...p, t]);

  // Lembretes: mostrar com o app aberto e, ao tocar, abrir o formulário do módulo.
  useEffect(() => { configurarNotificacoes(); }, []);
  useEffect(() => aoTocarNoLembrete((slug) => setPilha([{ tela: "inicio" }, { tela: "form", slug }])), []);
  const voltar = useCallback(() => setPilha((p) => (p.length > 1 ? p.slice(0, -1) : p)), []);

  // Botão voltar do Android: volta uma tela; na primeira, deixa o sistema agir.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (pilha.length > 1) { voltar(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [pilha.length, voltar]);

  async function sair() {
    try { await api.post("/api/logout"); } catch (_) { /* a sessão some do mesmo jeito */ }
    setPilha([{ tela: "inicio" }]);
    setSessao({ carregando: false, sem_login: true });
  }

  async function recarregar() {
    setRecarregando(true);
    await carregar();
    setRecarregando(false);
  }

  const contexto = { tema, api, sessao };
  let tela;
  if (sessao.carregando) tela = <ActivityIndicator style={{ marginTop: 80 }} color={tema.cor("destaque")} />;
  else if (sessao.sem_login) {
    tela = <Entrar onEntrou={(url) => { setPilha([{ tela: "inicio" }]); if (url !== servidor) setServidor(url); else carregar(); }} />;
  } else {
    const atual = pilha[pilha.length - 1];
    const depoisDeSalvar = () => { voltar(); setVersao((v) => v + 1); carregar(); };
    if (atual.tela === "dashboard") tela = <Dashboard key={atual.id} id={atual.id} voltar={voltar} />;
    else if (atual.tela === "modulo") tela = <Modulo key={atual.slug} slug={atual.slug} voltar={voltar} ir={ir} versao={versao} />;
    else if (atual.tela === "form") tela = <Formulario slug={atual.slug} id={atual.id} voltar={voltar} aoSalvar={depoisDeSalvar} avisar={avisar} />;
    else if (atual.tela === "ajustes") tela = <Ajustes voltar={voltar} escolherTema={escolherTema} sair={sair} servidor={servidor} avisar={avisar} />;
    else tela = <Inicio ir={ir} recarregando={recarregando} recarregar={recarregar} />;
  }

  return (
    <Provedor value={contexto}>
      <SafeAreaView style={[s.raiz, { backgroundColor: tema.cor("fundo") }]} edges={["top", "bottom"]}>
        <StatusBar style={tema.escuro ? "light" : "dark"} />
        <View style={s.conteudo}>{tela}</View>
        {sessao.erro ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: tema.cor("ruim") }}>{sessao.erro}</Text>
            <Botao titulo="Tentar de novo" onPress={recarregar} />
          </View>
        ) : null}
        <Aviso aviso={aviso} />
      </SafeAreaView>
    </Provedor>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Conteudo />
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1 },
  conteudo: { flex: 1, width: "100%", maxWidth: 720, alignSelf: "center" }
});
