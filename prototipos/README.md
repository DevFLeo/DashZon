# Protótipos: DashZon em React e em Next.js

Teste de como o DashZon ficaria com React (Vite) e com Next.js. **É um experimento:** o sistema de verdade continua em `frontend/` (sem build), e nada aqui muda o backend. Os dois protótipos usam a mesma API Ruby, por um proxy.

## Prints

As mesmas telas nas três versões estão em `prints/`. Os prefixos são `atual-`, `react-` e `next-`, e as telas são:

| Tela | Arquivo |
|---|---|
| Login | `*-login.png` |
| Dashboard Estudos (calendário, meta, pizza, barras, linha, tabela) | `*-estudos.png` |
| Dashboard Finanças pessoais | `*-financas.png` |
| Finanças no tema claro | `*-financas-claro.png` |
| Módulo (lista de registros) | `*-modulo.png` |
| Celular (390 px) | `*-celular.png` |

## O que tem e o que não tem

| Tem | Não tem (é só uma vitrine) |
|---|---|
| Login, barra lateral com o cubo 3D, tema claro/escuro | Arrastar e redimensionar cards |
| Dashboard com os cards: número, meta, barras, linha, pizza, tabela, calendário | Criar e editar cards, módulos e registros |
| Grade de 12 colunas com as posições salvas | Painel do adm, configurações, notas, aprovações |
| Lista de registros de um módulo | |

## Estrutura

```
prototipos/
  ui/       @dashzon/ui: telas, cards, lógica e CSS compartilhados pelos dois
  react/    casca React (Vite): rotas por #hash, proxy do Vite
  next/     casca Next.js (App Router): rotas de arquivo e proxy próprio
  prints/   as imagens de comparação
```

Os dois apps usam os **mesmos componentes** (`ui/`). O que muda entre eles é só o que cada tecnologia faz de diferente.

| | React (Vite) | Next.js |
|---|---|---|
| Rotas | `#/d/1`, `#/m/slug` (uma página só, como o atual) | `/d/1`, `/m/slug`, `/entrar` (um arquivo por rota em `app/`) |
| API | proxy do servidor de desenvolvimento (`vite.config.js`) | route handler `app/api/[...caminho]/route.js` (funciona também em produção) |
| Produção | arquivos estáticos (`dist/`), servidos por qualquer servidor | um processo Node (`next start`) ou exportação estática |
| Tamanho (1ª carga, gzip) | ~126 KB de JS | ~174 KB de JS |
| Boa escolha se | quer só trocar o frontend, mantendo o Ruby | quer páginas renderizadas no servidor, SEO ou juntar parte do backend no Node |

## Como rodar

Precisa de Node 20+ e de uma instância do DashZon rodando. O padrão é a de **teste** na porta 4571; nunca aponte para o banco real sem querer.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/rodar.ps1 -Porta 4571 -Banco data\prototipo.db   # instância de teste
cd prototipos
npm install
npm run react     # http://localhost:5173
npm run next      # http://localhost:3000
```

Para usar outra instância: `$env:DASHZON_API = "http://127.0.0.1:4567"` antes de rodar.

## Observações

- A lógica dos cards (`ui/logica.js`) copia a do `frontend/js/dashboards.js`, que continua sendo a referência (regra do `CLAUDE.md`). Se um dia migrar, ela deve sair de um lugar só.
- O backend recusa escrita com `Origin` de outro site. Os dois proxies trocam a origem pela do backend, e a sessão (cookie) funciona igual.
- Sem emojis (regra do projeto); ícones e cubo em CSS/SVG.
