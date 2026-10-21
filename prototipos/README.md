# Protótipos em React e Next.js (experimento)

Teste de como a interface ficaria com React (Vite) e com Next.js. **Fora do sistema:** o Prefeitura DashZ de verdade continua em `frontend/` (sem build), e nada aqui muda o backend. Os protótipos ainda mostram a marca e as telas do DashZon original e não têm as telas novas da prefeitura (estrutura, Minha equipe, Painel do gestor, quadro, agenda).

| Tem | Não tem |
|---|---|
| Login, barra lateral, tema claro/escuro | Arrastar e redimensionar cards |
| Dashboard com número, meta, barras, linha, pizza, tabela, calendário (só leitura) | Criar ou editar cards, módulos e registros |
| Lista de registros de um módulo | Painel do adm, configurações, notas, aprovações, telas do gestor |

## Rodar

Use sempre a instância de **teste** do backend (nunca o banco real):

```powershell
$env:DASHZON_DB_PATH = "$PWD\data\teste-prototipo.db"; $env:PORT = "4571"; cd backend; ruby -rbundler/setup app.rb   # outro terminal
cd prototipos; npm install
npm run react    # http://localhost:5173 (só localhost)
npm run next     # http://localhost:3000
```

`DASHZON_API` muda o endereço do backend (padrão `http://127.0.0.1:4571`). Os dois proxies trocam o `Origin` pelo do backend (o servidor recusa escrita de outra origem) e repassam o cookie de sessão.

## Estrutura

```
prototipos/
  ui/      componentes e lógica compartilhados (cópia da lógica de frontend/js/dashboards.js)
  react/   Vite + React 19
  next/    Next.js 15 (App Router)
  prints/  comparação das telas (versão DashZon)
```
