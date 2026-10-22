// Conversões entre o que a pessoa digita no celular e o que o servidor
// espera. Sem React Native: os testes de unidade (testes/) rodam no Node.

// Datas: o servidor usa AAAA-MM-DD; na tela, DD/MM/AAAA.
export const paraTela = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

export function paraIso(texto) {
  const m = String(texto || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : String(texto || "").trim();
}

// Números: na tela com vírgula (teclado brasileiro); o servidor aceita
// "123,45", "1.234,56" e "1234.56".
export const numeroParaTela = (v) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

// "dashzon.duckdns.org" -> "https://dashzon.duckdns.org"; tira a barra final.
export function normalizarServidor(texto) {
  let t = String(texto || "").trim().replace(/\/+$/, "");
  if (t && !/^https?:\/\//i.test(t)) t = `https://${t}`;
  return t;
}

// "8:5", "08:05", "20h" -> { hora: 8, minuto: 5 }; inválido -> null.
export function lerHora(texto) {
  const m = String(texto || "").trim().match(/^(\d{1,2})(?:[:h](\d{1,2})?)?$/i);
  if (!m) return null;
  const hora = Number(m[1]);
  const minuto = Number(m[2] || 0);
  return hora <= 23 && minuto <= 59 ? { hora, minuto } : null;
}

export const horaTexto = ({ hora, minuto }) => `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
