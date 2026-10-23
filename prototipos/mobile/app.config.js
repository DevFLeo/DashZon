// Config do Expo: o app.json, mais um ajuste opcional para o APK de teste.
// DASHZON_APK_HTTP=1 libera http:// (usesCleartextTraffic) no build de
// release, para testar contra uma instância na rede local ou no emulador
// (http://127.0.0.1 com adb reverse). Sem ele o APK só fala HTTPS.
module.exports = ({ config }) => {
  if (process.env.DASHZON_APK_HTTP !== "1") return config;
  return {
    ...config,
    plugins: [...(config.plugins || []), ["expo-build-properties", { android: { usesCleartextTraffic: true } }]]
  };
};
