# Protótipos: DashZon em React, Next.js e no celular (React Native)

Teste de como o DashZon ficaria com React (Vite), com Next.js e como app de celular (React Native / Expo). **É um experimento:** o sistema de verdade continua em `frontend/` (sem build), e nada aqui muda o backend. Todos usam a mesma API Ruby e a mesma lógica (`core/`).

## Prints

As mesmas telas nas três versões estão em `prints/`. Os prefixos são `atual-`, `react-` e `next-`, e as telas são:

| Tela | Arquivo |
|---|---|
| Login | `*-login.png` |
| Dashboard Estudos (calendário, meta, pizza, tabela; no React e no Next, com a dica de um dia) | `*-estudos.png` |
| Dashboard Finanças pessoais | `*-financas.png` |
| Finanças no tema claro | `*-financas-claro.png` |
| Módulo (resumo, busca, filtros, registros) | `*-modulo.png` |
| Celular (390 px), dashboard empilhado | `*-celular.png` |
| Novo registro (só React e Next) | `react-formulario.png`, `next-formulario.png` |
| Módulo no celular, registros em cartões (só React e Next) | `react-celular-modulo.png`, `next-celular-modulo.png` |
| Menu em gaveta no celular (só React e Next) | `react-celular-menu.png`, `next-celular-menu.png` |
| Calendário no celular, com a dica do dia (só React e Next) | `react-celular-calendario.png`, `next-celular-calendario.png` |
| Configurações: temas e módulos no menu (só React e Next) | `react-configuracoes.png`, `next-configuracoes.png`, `*-celular-configuracoes.png` |

## O que tem e o que não tem

| Tem | Ainda não tem |
|---|---|
| Login, barra lateral com o cubo 3D | Arrastar e redimensionar cards |
| Configurações: todos os temas do oficial (inclusive Floresta dia, tarde e noite) e módulos no menu, salvos na conta | O resto das configurações (conta, senha, fonte, tamanho do texto) |
| Menu com seções que abrem e fecham, barra recolhida com siglas, ordem e módulos ocultos da conta | Criar e editar cards e a estrutura dos módulos |
| Dashboard com os cards: número, meta, barras, linha, pizza, tabela, calendário (com meses, dica, teclado e resumo do período), na grade de 12 colunas | Painel do adm, configurações, notas (aparecem como tabela), aprovações |
| Módulo: resumo, busca, filtros, checklist, "Carregar mais", criar, editar e excluir registro | |
| Avisos, janelas com Esc e foco no primeiro campo, confirmação antes de excluir | |
| Celular: menu em gaveta, dashboard empilhado na ordem salva, registros em cartões, formulário em tela cheia | |

O perfil visualizador também usa o formulário: o backend responde que virou um pedido de aprovação, e o aviso mostra isso.

## Estrutura

```
prototipos/
  core/     @dashzon/core: lógica e temas sem HTML nem CSS (web e celular)
    logica.js      API (criarApi), formatação, fórmulas dos cards, criarCores
    temas.js       os temas do DashZon, com os tokens de cor de cada um
  ui/       @dashzon/ui: telas web compartilhadas pelo React e pelo Next
    Telas.jsx      login, moldura (menu, gaveta), dashboard, tema
    Registros.jsx  tela do módulo e formulário de registro
    Card.jsx       os cards do dashboard
    Base.jsx       ícones SVG, avisos, janela e confirmação
    Configuracoes.jsx  tema e módulos no menu (preferências da conta)
    temas.js       reexporta os temas do core
    logica.js      reexporta o core e lê as cores do tema no CSS
    estilo.css     tokens do DashZon e o responsivo
  react/    casca React (Vite): rotas por #hash, proxy do Vite
  next/     casca Next.js (App Router): rotas de arquivo e proxy próprio
            app/(app)/layout.jsx é a moldura, montada uma vez para todas as rotas
  mobile/   app de celular em React Native (Expo), fora dos workspaces (ver mobile/README.md)
  prints/   as imagens de comparação
```

Os dois apps web usam os **mesmos componentes** (`ui/`). O que muda entre eles é só o que cada tecnologia faz de diferente. O app de celular tem telas próprias (componentes nativos) e divide com eles a lógica (`core/`): a regra de negócio fica num lugar só, e a API Ruby é a única fonte de dados.

| | React (Vite) | Next.js |
|---|---|---|
| Rotas | `#/d/1`, `#/m/slug` (uma página só, como o atual) | `/d/1`, `/m/slug`, `/entrar` (um arquivo por rota em `app/`; a moldura é um layout que fica montado) |
| API | proxy do servidor de desenvolvimento (`vite.config.js`) | route handler `app/api/[...caminho]/route.js` (funciona também em produção) |
| Produção | arquivos estáticos (`dist/`), servidos por qualquer servidor | um processo Node (`next start`) ou exportação estática |
| Tamanho (1ª carga, gzip) | ~135 KB de JS | ~182 KB de JS |
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

## App de celular

Em `mobile/` (como rodar no celular com o Expo Go: `mobile/README.md`). A **parte 1** cobre o uso mais forte no celular, que é lançar e consultar: entrar, módulos do menu, registros com busca, lançar, editar e excluir, e os temas da conta.

| Tela | Print |
|---|---|
| Início com "+ Lançar" | `mobile-inicio.png` (Floresta noite: `mobile-inicio-floresta-noite.png`) |
| Módulo: resumo e registros em cartões | `mobile-modulo.png` |
| Lançar | `mobile-formulario.png` |
| Excluir com confirmação | `mobile-confirmar.png` |
| Ajustes: temas | `mobile-ajustes-floresta-noite.png` |

### Possibilidades para as próximas partes

**Sem mudar o backend** (o app usa o que a API já tem):

| Possibilidade | Para quê |
|---|---|
| Dashboards no celular | Ver os cards (números, metas, gráficos, calendário) empilhados, na ordem salva |
| Lembretes no aparelho | Avisar a hora da sessão de estudo, conta a vencer ou meta do mês, sem servidor (notificações locais) |
| Entrar com digital ou rosto | Reabrir o app sem digitar a senha (a sessão continua no servidor) |
| Lançar sem internet | Guardar o lançamento no aparelho e enviar quando a conexão voltar |
| Atalho "Lançar gasto" | Pelo ícone do app (toque longo), direto no formulário |
| Ler o QR code da nota fiscal (NFC-e) | Preencher valor e data do lançamento pela câmera |
| Notas no celular | Ler e escrever as anotações em Markdown |
| Aprovações | O dono ou o admin aprova ou nega os pedidos do visualizador com um toque |
| Compartilhar | Mandar um resumo ou um registro pelo WhatsApp e afins |

**Exigindo mudança no backend:**

| Possibilidade | O que falta no servidor |
|---|---|
| Notificação push (pedido de aprovação, conta vencendo) | Guardar o token do aparelho e enviar pelo serviço do Expo/Google/Apple |
| Foto do recibo no lançamento | Receber e guardar arquivos (hoje o registro só tem campos de texto e número) |
| Widget na tela inicial | Um resumo leve para o widget; além disso o widget é código nativo |
| Publicar nas lojas | Contas de desenvolvedor, ícone e nome finais, política de privacidade |

## Observações

- A lógica dos cards (`core/logica.js`) copia a do `frontend/js/dashboards.js`, que continua sendo a referência (regra do `CLAUDE.md`). Web e celular usam essa mesma cópia.
- O backend recusa escrita com `Origin` de outro site. Os dois proxies trocam a origem pela do backend, e a sessão (cookie) funciona igual.
- Sem emojis (regra do projeto); ícones e cubo em CSS/SVG.
- A interface dos protótipos é trabalhada na branch `desenvolvimentoUI-UX`.
- Testado de ponta a ponta no navegador (1280, 768 e 390 px), com as checagens do `scripts/auditar-responsivo.js`: zero erros e nenhum erro de JavaScript nos dois.
