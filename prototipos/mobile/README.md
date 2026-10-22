# DashZon no celular (React Native / Expo), parte 1

App de celular do DashZon, para Android e iPhone, feito com [Expo](https://expo.dev) (SDK 58, React Native 0.88). É um protótipo: o frontend oficial continua em `frontend/`.

- **Lógica:** a de `prototipos/core` (`@dashzon/core`), a mesma dos protótipos web: formatação, fórmulas dos cards (cópia da do oficial), temas.
- **Backend:** a API Ruby de sempre, sem mudança. O app não manda `Origin` e o cookie da sessão fica guardado no aparelho, então o login funciona como na web.

## O que tem (parte 1)

| Tela | O que faz |
|---|---|
| Entrar | Endereço do servidor (fica guardado), usuário e senha |
| Início | Os módulos do seu menu, na ordem da conta, com "+ Lançar" em cada um |
| Módulo | Resumo, busca, registros em cartões, puxar para atualizar, "Carregar mais" e botão "+" |
| Lançar / editar | Formulário pela estrutura do módulo: teclado numérico (aceita vírgula), Hoje/Ontem nas datas, opções em botões, sim/não em interruptor, excluir com confirmação |
| Ajustes | Os temas da conta (inclusive Floresta dia, tarde e noite) e sair |

Também: botão voltar do Android, área segura da tela (entalhe e barra de gestos), alvos de toque de 44 px e rótulos para o leitor de tela (`aria-*`).

**Ainda não tem:** dashboards com gráficos, notas, aprovações, painel do adm.

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

## Testar no navegador

O mesmo código roda na web (React Native Web), o que serve para testes automáticos:

```powershell
npx expo export --platform web     # gera dist/
```

Sirva `dist/` com um proxy que repasse `/api` para a instância de teste, trocando o `Origin` pelo do backend (como faz o `vite.config.js` dos protótipos). Na web, o app fala com a mesma origem e não pede o endereço do servidor.

## Estrutura

```
App.js              sessão, navegação (pilha), voltar do Android, avisos
src/sessao.js       endereço do servidor, API (@dashzon/core) e tema da conta
src/componentes.js  botão, campo, chip, aviso, confirmação, cabeçalho
src/telas/          Entrar, Inicio, Modulo, Formulario, Ajustes
metro.config.js     faz o Metro enxergar ../core
```

## Próximas partes (possibilidades)

Ver a lista em `prototipos/README.md`, seção "App de celular".
