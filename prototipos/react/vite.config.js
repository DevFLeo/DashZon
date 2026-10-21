import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// A API é a do DashZon (Ruby). Padrão: a instância de TESTE na 4571, nunca o
// banco real. Mude com DASHZON_API=http://127.0.0.1:4567 se quiser.
const alvo = process.env.DASHZON_API || "http://127.0.0.1:4571";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: alvo,
        changeOrigin: true,
        // O backend recusa escrita com Origin de outro site: pelo proxy, a
        // origem passa a ser a do próprio backend.
        configure: (proxy) => proxy.on("proxyReq", (req) => req.setHeader("origin", alvo))
      }
    }
  }
});
