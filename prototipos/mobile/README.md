# DashZon no celular (React Native / Expo)

App de celular do DashZon, para Android e iPhone, feito com [Expo](https://expo.dev) (SDK 58, React Native 0.88). É um protótipo: o frontend oficial continua em `frontend/`.

- **Lógica:** a de `prototipos/core` (`@dashzon/core`), a mesma dos protótipos web: formatação, fórmulas dos cards (cópia da do oficial), temas.
- **Backend:** a API Ruby de sempre, sem mudança. O app não manda `Origin` e o cookie da sessão fica guardado no aparelho, então o login funciona como na web.

## O que tem

| Tela | O que faz |
|---|---|
| Entrar | Endereço do servidor (fica guardado), usuário e senha |
| Início | Os dashboards e os módulos do seu menu, na ordem da conta, com "+ Lançar" em cada módulo |
| Dashboard (parte 2) | Os cards empilhados na ordem salva, números lado a lado; número, meta, tabela, barras, linha, rosca e calendário; tocar num grupo, fatia ou dia mostra o valor; puxar para atualizar |
| Módulo | Resumo, busca, registros em cartões, puxar para atualizar, "Carregar mais" e botão "+" |
| Lançar / editar | Formulário pela estrutura do módulo: teclado numérico (aceita vírgula), Hoje/Ontem nas datas, opções em botões, sim/não em interruptor, excluir com confirmação |
| Ajustes | Os temas da conta (inclusive Floresta dia, tarde e noite), o lembrete diário (parte 2) e sair |

**Lembrete diário (parte 2):** notificação do próprio aparelho, sem servidor, no horário e no módulo escolhidos; tocar nela abre o formulário daquele módulo. Funciona no Expo Go no Android (notificações locais); na web não existe.

Também: botão voltar do Android, área segura da tela (entalhe e barra de gestos), alvos de toque de 44 px e rótulos para o leitor de tela (`aria-*`).

**Ainda não tem:** notas, aprovações, painel do adm, editar cards.

## Rodar no celular (desenvolvimento)

1. O celular precisa alcançar o DashZon por **HTTPS**, por exemplo o endereço do modo público (`docs/PUBLICAR-DUCKDNS.md`). Para testar, use uma instância de teste, nunca o banco real sem querer.
2. Instale o app **Expo Go** no celular (Play Store ou App Store).
3. No computador:
   ```powershell
   cd prototipos\mobile
   npm install
   npx expo start
   ```
4. Leia o QR code com o Expo Go (Android) ou com a câmera (iPhone). Computador e celular na mesma rede Wi-Fi.
5. No app, informe o endereço do servidor (ex.: `dashzon.seudominio.org`), usuário e senha.

Para instalar dependências novas, use `npx expo install <pacote>`: ele escolhe as versões compatíveis com o SDK.

## Testes (`testes/`)

```powershell
npm run teste            # tudo: unidade, export web e 2 rodadas de ponta a ponta com a instância zerada
npm run teste:unidade    # só os testes de unidade (Node)
npm run teste:web        # só o ponta a ponta, numa instância de teste já no ar e NÃO configurada
npm run teste:servir     # o app web com /api repassada (para olhar no navegador)
```

O `npm run teste` chama `testes/rodar-testes.ps1`, que aceita `-Rodadas 1`, `-SemExport`, `-SoUnidade`, `-Porta` e `-Banco`. Ele recusa a porta 4567 e o `dashzon.db`: os testes nunca encostam no banco real.

| Arquivo | O que faz |
|---|---|
| `parametros.mjs` | Os parâmetros dos testes, num lugar só (tabela abaixo) |
| `unidade.test.mjs` | Formatos (datas, números, endereço, hora), temas e cores, e os dados dos cards: ordem, séries, empilhar, 15 grupos, tabela, rosca, meta do mês, calendário |
| `e2e-web.mjs` | O app de verdade num Chromium headless com tela de celular: entrar, dashboards, tocar no gráfico, módulo, busca, lançar com "123,45", editar, erro do servidor, excluir, tema, sair. Em cada tela confere rolagem lateral, alvos de toque e valores cortados |
| `servir-web.mjs` | Serve `dist/` e repassa `/api` para a instância, trocando o `Origin` pelo do backend |
| `rodar-testes.ps1` | Orquestra tudo; prints e resultado em `testes/resultados/` (fora do git) |

**Parâmetros** (cada um troca por variável de ambiente, sem mexer no código):

| Parâmetro | Variável | Padrão |
|---|---|---|
| Instância de teste | `DASHZON_TESTE_API` | `http://127.0.0.1:4581` (banco `data/teste-mobile.db`) |
| Porta do app web | `DASHZON_TESTE_PORTA` | `8090` |
| Conta criada no setup | `DASHZON_TESTE_USUARIO`, `DASHZON_TESTE_SENHA` | `admin`, `Prototipo-2026!` |
| Templates do setup | `DASHZON_TESTE_TEMPLATES` | `financas-pessoais,cronograma-estudos,gestao-demandas` |
| Telas testadas | `DASHZON_TESTE_TELAS` | `390x844,360x740` (a primeira roda o roteiro inteiro) |
| Alvo de toque mínimo | `DASHZON_TESTE_ALVO` | `44` (px) |
| Navegador | `NAVEGADOR` | Edge, Chrome ou o Chrome do Puppeteer |
| Porta do DevTools | `DASHZON_TESTE_CDP` | `9360` |
| Pasta dos prints | `DASHZON_TESTE_SAIDA` | `testes/resultados/<data>` |

Exemplo: `$env:DASHZON_TESTE_TELAS = "320x640,412x915"; npm run teste`.

**O que os testes não cobrem:** o aparelho de verdade. O ponta a ponta usa a versão web (React Native Web). As notificações só existem no celular: aqui elas são conferidas apenas até o empacotamento para Android (`npx expo export --platform android`); **falta testar num aparelho** (Expo Go), assim como o resto do app.

## Estrutura

```
App.js              sessão, navegação (pilha), voltar do Android, avisos
src/sessao.js       endereço do servidor, API (@dashzon/core) e tema da conta
src/componentes.js  botão, campo, chip, aviso, confirmação, cabeçalho
src/formatos.js     datas, números, endereço e hora (sem React Native: testável no Node)
src/graficos.js     dados de cada card (a lógica do Card.jsx, sem React Native)
src/cards.js        o desenho dos cards (react-native-svg)
src/lembretes.js    o lembrete diário (expo-notifications)
src/telas/          Entrar, Inicio, Dashboard, Modulo, Formulario, Ajustes
testes/             testes de unidade e de ponta a ponta, com parâmetros
metro.config.js     faz o Metro enxergar ../core
```

## Próximas partes (possibilidades)

Ver a lista em `prototipos/README.md`, seção "App de celular".
