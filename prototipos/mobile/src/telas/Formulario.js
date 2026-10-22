// Formulário de registro montado pela estrutura do módulo, pensado para o
// dedo: teclado numérico nos valores, "Hoje"/"Ontem" nas datas, opções em
// botões e sim/não em interruptor. Mesmas regras da web: padrões ($hoje),
// opção removida mantida, erro do servidor (422) no formulário, e o
// visualizador recebe o aviso do pedido de aprovação (202).
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { NUMERICOS, hojeISO, opcoesDe, resolverToken } from "@dashzon/core";
import { Botao, Cabecalho, Campo, Chip, Confirmar } from "../componentes";
import { useApp } from "../sessao";

// Datas: o servidor usa AAAA-MM-DD; na tela, DD/MM/AAAA.
const paraTela = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
function paraIso(texto) {
  const m = String(texto || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : String(texto || "").trim();
}
// Números: aceita vírgula (teclado brasileiro); o servidor também aceita "1.234,56".
const numeroParaTela = (v) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

export default function Formulario({ slug, id, voltar, aoSalvar, avisar }) {
  const { tema, api } = useApp();
  const [modulo, setModulo] = useState(null);
  const [dados, setDados] = useState({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const base = `/api/modulos/${encodeURIComponent(slug)}`;

  useEffect(() => {
    (async () => {
      try {
        const m = await api.get(base);
        const reg = id ? await api.get(`${base}/registros/${id}`) : null;
        const inicial = {};
        for (const c of m.schema.campos) {
          const v = reg ? reg[c.id] : resolverToken(c.padrao);
          inicial[c.id] = c.tipo === "data" ? paraTela(v) : NUMERICOS.includes(c.tipo) ? numeroParaTela(v) : v;
        }
        setModulo(m);
        setDados(inicial);
      } catch (e) { setErro(e.message); }
    })();
  }, [api, base, id]);

  const mudar = (campo, v) => setDados((d) => ({ ...d, [campo]: v }));

  async function salvar() {
    setErro("");
    const corpo = {};
    for (const c of modulo.schema.campos) {
      const v = dados[c.id];
      if (c.tipo === "booleano") corpo[c.id] = !!v;
      else if (v === "" || v === undefined || v === null) corpo[c.id] = null;
      else if (c.tipo === "data") corpo[c.id] = paraIso(v);
      else corpo[c.id] = v;
    }
    setEnviando(true);
    try {
      const r = id ? await api.put(`${base}/registros/${id}`, corpo) : await api.post(`${base}/registros`, corpo);
      avisar(r?.pendente ? r.mensagem : id ? "Registro atualizado" : `Lançado em ${modulo.nome}`);
      aoSalvar();
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  }

  async function confirmarExclusao() {
    setExcluir(false);
    try {
      const r = await api.del(`${base}/registros/${id}`);
      avisar(r?.pendente ? r.mensagem : "Registro excluído");
      aoSalvar();
    } catch (e) { setErro(e.message); }
  }

  if (!modulo) {
    return (
      <View style={{ flex: 1 }}>
        <Cabecalho titulo={id ? "Editar" : "Lançar"} onVoltar={voltar} />
        {erro ? <Text style={{ color: tema.cor("ruim"), padding: 16 }}>{erro}</Text> : <ActivityIndicator style={{ marginTop: 40 }} color={tema.cor("destaque")} />}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Cabecalho titulo={id ? "Editar registro" : "Lançar"} sub={modulo.nome} onVoltar={voltar} />
      <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
        {modulo.schema.campos.map((c) => {
          const v = dados[c.id];
          if (c.tipo === "booleano") {
            return (
              <View key={c.id} style={[s.linha, { borderColor: tema.cor("borda") }]}>
                <Text style={{ color: tema.cor("texto"), fontSize: 16, flex: 1 }}>{c.nome}</Text>
                <Switch value={!!v} onValueChange={(x) => mudar(c.id, x)} accessibilityLabel={c.nome}
                  trackColor={{ true: tema.cor("destaque"), false: tema.cor("borda") }} thumbColor={tema.cor("superficie")} />
              </View>
            );
          }
          if (c.tipo === "selecao" || c.tipo === "movimento") {
            const opcoes = opcoesDe(c);
            const removida = v && !opcoes.some((o) => o.v === v) ? [{ v, l: `${v} (opção removida)` }] : [];
            return (
              <View key={c.id} style={s.grupo} accessibilityRole="radiogroup" accessibilityLabel={c.nome}>
                <Text style={[s.rotulo, { color: tema.cor("texto-2") }]}>{c.nome}{c.obrigatorio ? <Text style={{ color: tema.cor("ruim") }}> *</Text> : null}</Text>
                <View style={s.chips}>
                  {[...removida, ...opcoes].map((o) => (
                    <Chip key={o.v} texto={o.l} ativo={v === o.v} onPress={() => mudar(c.id, v === o.v && !c.obrigatorio ? null : o.v)}
                      cor={c.tipo === "movimento" ? tema.corDe({}, c, o.v) : undefined} />
                  ))}
                </View>
              </View>
            );
          }
          if (c.tipo === "data") {
            return (
              <View key={c.id}>
                <Campo rotulo={c.nome} obrigatorio={c.obrigatorio} ajuda={c.ajuda} value={v || ""} onChangeText={(x) => mudar(c.id, x)}
                  placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" maxLength={10} />
                <View style={[s.chips, { marginTop: -6, marginBottom: 14 }]}>
                  <Chip texto="Hoje" ativo={paraIso(v) === hojeISO()} onPress={() => mudar(c.id, paraTela(hojeISO()))} />
                  <Chip texto="Ontem" ativo={paraIso(v) === hojeISO(-1)} onPress={() => mudar(c.id, paraTela(hojeISO(-1)))} />
                </View>
              </View>
            );
          }
          const numerico = NUMERICOS.includes(c.tipo);
          return (
            <Campo key={c.id} rotulo={c.nome} obrigatorio={c.obrigatorio} ajuda={c.ajuda} value={v == null ? "" : String(v)}
              onChangeText={(x) => mudar(c.id, x)} multiline={c.tipo === "texto_longo" || c.tipo === "markdown"}
              keyboardType={numerico ? "decimal-pad" : c.tipo === "hora" ? "numbers-and-punctuation" : "default"}
              placeholder={c.tipo === "moeda" ? "0,00" : c.tipo === "hora" ? "HH:MM" : undefined} />
          );
        })}
        {erro ? <Text style={{ color: tema.cor("ruim"), marginBottom: 12 }} accessibilityRole="alert">{erro}</Text> : null}
        <Botao titulo={id ? "Salvar" : "Lançar"} tipo="primario" onPress={salvar} carregando={enviando} />
        {id ? <Botao titulo="Excluir registro" tipo="perigo" onPress={() => setExcluir(true)} estilo={{ marginTop: 10 }} /> : null}
      </ScrollView>
      <Confirmar visivel={excluir} titulo="Excluir registro" texto="Isso não pode ser desfeito." onSim={confirmarExclusao} onNao={() => setExcluir(false)} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  form: { padding: 16, paddingBottom: 40 },
  grupo: { marginBottom: 16, gap: 8 },
  rotulo: { fontSize: 14, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  linha: { flexDirection: "row", alignItems: "center", minHeight: 56, borderBottomWidth: 1, marginBottom: 14 }
});
