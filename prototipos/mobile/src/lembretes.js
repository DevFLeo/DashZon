// Lembretes no aparelho (notificações locais, sem servidor): um lembrete
// diário para lançar, num horário e num módulo escolhidos. Tocar na
// notificação abre o formulário daquele módulo. Só no celular: na web as
// notificações do Expo não existem.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { horaTexto } from "./formatos";

const CHAVE = "dashzon.lembrete";
const CANAL = "lembretes";
// O módulo só é carregado no celular (na web ele nem existe), e com proteção:
// no Expo Go do Android (SDK 53+) o expo-notifications quebra ao carregar
// (falta o módulo nativo de push, ExpoTopicSubscriptionModule). Sem ele o
// app segue normal e os lembretes avisam que precisam do app instalado
// (build de desenvolvimento). Achado no teste no emulador.
let carregado;
function notificacoes() {
  if (carregado === undefined) {
    carregado = null;
    // Antes de carregar, confere se os módulos nativos existem: no Expo Go
    // do Android falta o de push e o pacote quebra ao carregar (num erro que
    // o modo de desenvolvimento mostra mesmo capturado). O executionEnvironment
    // não serve para detectar: no Expo Go do SDK 58 ele vem como "bare".
    if (Platform.OS !== "web") {
      const { requireOptionalNativeModule } = require("expo-modules-core");
      const nativos = Platform.OS === "android" ? ["ExpoTopicSubscriptionModule", "ExpoNotificationScheduler"] : ["ExpoNotificationScheduler"];
      if (nativos.every((n) => requireOptionalNativeModule(n))) {
        try {
          const m = require("expo-notifications");
          if (typeof m?.setNotificationHandler === "function" && typeof m?.scheduleNotificationAsync === "function") carregado = m;
        } catch (_) { /* sem o módulo nativo: lembretes indisponíveis */ }
      }
    }
  }
  return carregado;
}
export const SUPORTADO = Platform.OS !== "web";
export const disponivel = () => !!notificacoes();
export const MOTIVO = Platform.OS === "web"
  ? "Os lembretes funcionam no app do celular (notificações do aparelho)."
  : "Os lembretes precisam do app instalado (build de desenvolvimento): no Expo Go do Android as notificações não carregam.";

export async function lerLembrete() {
  try { return JSON.parse((await AsyncStorage.getItem(CHAVE)) || "null"); } catch (_) { return null; }
}

// Mostra a notificação mesmo com o app aberto. Chamado uma vez, no App.
export function configurarNotificacoes() {
  if (!disponivel()) return;
  notificacoes().setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
  });
}

// Tocar na notificação: devolve o slug do módulo para abrir o formulário.
export function aoTocarNoLembrete(abrir) {
  if (!disponivel()) return () => {};
  const sub = notificacoes().addNotificationResponseReceivedListener((r) => {
    const slug = r.notification.request.content.data?.modulo;
    if (slug) abrir(slug);
  });
  return () => sub.remove();
}

// Liga (ou troca) o lembrete diário. Devolve o que ficou gravado.
// `hora` = { hora, minuto }; `modulo` = { slug, nome }.
export async function ligarLembrete(hora, modulo) {
  if (!disponivel()) throw new Error(MOTIVO);
  const N = notificacoes();
  // Android 8+: toda notificação precisa de um canal (e o pedido de
  // permissão do Android 13+ só aparece depois que existe um).
  if (Platform.OS === "android") {
    await N.setNotificationChannelAsync(CANAL, { name: "Lembretes", importance: N.AndroidImportance.DEFAULT });
  }
  let { status } = await N.getPermissionsAsync();
  if (status !== "granted") ({ status } = await N.requestPermissionsAsync());
  if (status !== "granted") throw new Error("Sem permissão para notificações. Libere nas configurações do aparelho.");

  await N.cancelAllScheduledNotificationsAsync();
  const id = await N.scheduleNotificationAsync({
    content: { title: "DashZon", body: `Hora de lançar em ${modulo.nome}`, data: { modulo: modulo.slug } },
    trigger: { type: N.SchedulableTriggerInputTypes.DAILY, hour: hora.hora, minute: hora.minuto, channelId: CANAL }
  });
  const salvo = { ligado: true, hora: horaTexto(hora), modulo: modulo.slug, nomeModulo: modulo.nome, id };
  await AsyncStorage.setItem(CHAVE, JSON.stringify(salvo));
  return salvo;
}

export async function desligarLembrete() {
  if (disponivel()) await notificacoes().cancelAllScheduledNotificationsAsync();
  const atual = await lerLembrete();
  const salvo = atual ? { ...atual, ligado: false, id: null } : null;
  if (salvo) await AsyncStorage.setItem(CHAVE, JSON.stringify(salvo));
  return salvo;
}
