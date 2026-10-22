// Os temas do DashZon (os mesmos valores de Usuarios::TEMAS e de
// frontend/js/tema.js), com o que a tela de Configurações mostra de cada um.
// Na web as cores vêm do CSS (ui/estilo.css); no celular, de TOKENS, com os
// mesmos nomes e valores (dark = fundo escuro, para a barra de status).
// `previa`: fundo, cartão, texto, destaque e três cores de série.
export const TEMAS = [
  { id: "sistema", grupo: "Básicos", nome: "Seguir o sistema", desc: "Claro ou escuro, como o computador" },
  { id: "claro", grupo: "Básicos", nome: "Claro", desc: "Sol", fase: "dia",
    previa: ["#f4f3ef", "#ffffff", "#1d1d1b", "#2a78d6", "#2a78d6", "#e0703a", "#2fa37a"] },
  { id: "suave", grupo: "Básicos", nome: "Suave", desc: "Pôr do sol, mais leve para os olhos", fase: "tarde",
    previa: ["#eee5d5", "#f7f0e4", "#3a332b", "#3a6ca3", "#3d72ad", "#c96a37", "#2e8f6c"] },
  { id: "escuro", grupo: "Básicos", nome: "Escuro", desc: "Lua", fase: "noite",
    previa: ["#0e0e0e", "#1b1b1b", "#f2f2f2", "#3987e5", "#3987e5", "#e8814e", "#3cb98c"] },
  { id: "floresta_dia", grupo: "Floresta", nome: "Floresta dia", desc: "Verde claro, de manhã na mata", fase: "dia",
    previa: ["#eef3ea", "#fbfcf8", "#13261c", "#2d6a4f", "#2d6a4f", "#c2772a", "#3a7ca5"] },
  { id: "floresta_tarde", grupo: "Floresta", nome: "Floresta tarde", desc: "Luz dourada, contraste mais leve", fase: "tarde",
    previa: ["#e7e1cb", "#f4efdf", "#2c3326", "#3b6e52", "#3b6e52", "#b46d2c", "#3f7493"] },
  { id: "floresta_noite", grupo: "Floresta", nome: "Floresta noite", desc: "Verde profundo, destaque menta", fase: "noite",
    previa: ["#0c1410", "#17221c", "#eef4ec", "#52b788", "#52b788", "#e0a458", "#6fa8dc"] }
];

export const temaPorId = (id) => TEMAS.find((t) => t.id === id);

// O botão do topo gira dentro da família, como no oficial.
export const PROXIMO = {
  claro: "suave", suave: "escuro", escuro: "claro",
  floresta_dia: "floresta_tarde", floresta_tarde: "floresta_noite", floresta_noite: "floresta_dia"
};

// Cores de cada tema, com os nomes das variáveis CSS dos protótipos.
export const TOKENS = {
  claro: { "--fundo": "#f4f3ef", "--superficie": "#ffffff", "--borda": "#e3e1da", "--hover": "#efede7", "--texto": "#1d1d1b", "--texto-2": "#4a4a46", "--texto-fraco": "#7a7a74", "--destaque": "#2a78d6", "--destaque-tinta": "#ffffff", "--bom": "#1d9e5a", "--ruim": "#d24b4b", "--series-1": "#2a78d6", "--series-2": "#e0703a", "--series-3": "#2fa37a", "--series-4": "#c9a227", "--series-5": "#8a5cd6", "--series-6": "#d6487e", "--series-7": "#3fb0c7", "--series-8": "#d24b4b" },
  escuro: { "--fundo": "#0e0e0e", "--superficie": "#1b1b1b", "--borda": "#2c2c2c", "--hover": "#242424", "--texto": "#f2f2f2", "--texto-2": "#c9c9c9", "--texto-fraco": "#8f8f8f", "--destaque": "#3987e5", "--destaque-tinta": "#ffffff", "--bom": "#2fbf73", "--ruim": "#ef6161", "--series-1": "#3987e5", "--series-2": "#e8814e", "--series-3": "#3cb98c", "--series-4": "#d9b43a", "--series-5": "#9d74e6", "--series-6": "#e2608f", "--series-7": "#4cc1d8", "--series-8": "#ef6161" },
  suave: { "--fundo": "#eee5d5", "--superficie": "#f7f0e4", "--borda": "#e0d5c2", "--hover": "#ebe2d2", "--texto": "#3a332b", "--texto-2": "#5a5045", "--texto-fraco": "#6e6352", "--destaque": "#3a6ca3", "--destaque-tinta": "#fffaf2", "--bom": "#3b6a29", "--ruim": "#a13b33", "--series-1": "#3d72ad", "--series-2": "#c96a37", "--series-3": "#2e8f6c", "--series-4": "#a0760f", "--series-5": "#bf6488", "--series-6": "#4a852d", "--series-7": "#6656a0", "--series-8": "#bf4f49" },
  floresta_dia: { "--fundo": "#eef3ea", "--superficie": "#fbfcf8", "--borda": "#dbe5d6", "--hover": "#e8efe3", "--texto": "#13261c", "--texto-2": "#3e5446", "--texto-fraco": "#5f7265", "--destaque": "#2d6a4f", "--destaque-tinta": "#ffffff", "--bom": "#2d6a4f", "--ruim": "#a8432c", "--series-1": "#2d6a4f", "--series-2": "#c2772a", "--series-3": "#3a7ca5", "--series-4": "#9a8417", "--series-5": "#a8577e", "--series-6": "#5e9234", "--series-7": "#6f4e37", "--series-8": "#c0533a" },
  floresta_tarde: { "--fundo": "#e7e1cb", "--superficie": "#f4efdf", "--borda": "#ddd5bd", "--hover": "#ebe5d2", "--texto": "#2c3326", "--texto-2": "#4c5442", "--texto-fraco": "#5a604c", "--destaque": "#3b6e52", "--destaque-tinta": "#fbf7ea", "--bom": "#36633f", "--ruim": "#9a3f2d", "--series-1": "#3b6e52", "--series-2": "#b46d2c", "--series-3": "#3f7493", "--series-4": "#8a7520", "--series-5": "#9b5374", "--series-6": "#5b8634", "--series-7": "#6f4e37", "--series-8": "#b04c37" },
  floresta_noite: { "--fundo": "#0c1410", "--superficie": "#17221c", "--borda": "#26332b", "--hover": "#1f2b24", "--texto": "#eef4ec", "--texto-2": "#b9c8b8", "--texto-fraco": "#8a9a88", "--destaque": "#52b788", "--destaque-tinta": "#0c1410", "--bom": "#74c69d", "--ruim": "#ec8f76", "--series-1": "#52b788", "--series-2": "#e0a458", "--series-3": "#6fa8dc", "--series-4": "#d6c45c", "--series-5": "#d47fa6", "--series-6": "#a3c45a", "--series-7": "#b08f74", "--series-8": "#e07a5f" }
};

export const ESCUROS = ["escuro", "floresta_noite"];

// "sistema" vira claro ou escuro conforme o aparelho.
export const temaEfetivo = (escolha, escuroNoSistema) =>
  (escolha === "sistema" || !TOKENS[escolha] ? (escuroNoSistema ? "escuro" : "claro") : escolha);
