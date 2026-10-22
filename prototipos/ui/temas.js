// Os temas do DashZon (os mesmos valores de Usuarios::TEMAS e de
// frontend/js/tema.js), com o que a tela de Configurações mostra de cada um.
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
