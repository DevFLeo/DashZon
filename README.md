# DashZon

Um painel de gestão que se molda ao que você quer controlar. Em vez de uma planilha para cada coisa, você escolhe (ou importa) um template em JSON e o sistema monta sozinho os cadastros, os resumos e os dashboards de arrastar e soltar. Hoje ele já cuida de finanças pessoais, fluxo de caixa de empresa, demandas de equipe e mapeamento de dados de um setor. Se der para descrever em JSON, dá para controlar aqui.

A inspiração veio de projetos open source de finanças como o [OpenMonetis](https://openmonetis.com/) e o [Actual Budget](https://actualbudget.org/). A diferença é que aqui nada é fixo em "finanças": tudo é genérico.

> É um projeto pessoal, feito aos poucos e aprendendo no caminho. Mais abaixo tem uma seção de **perguntas e respostas** com os perrengues que já apareceram e como foram resolvidos (ou não).

## O que dá para fazer

- **Primeiro acesso guiado:** nome, moeda, usuário e senha, e galeria de templates (dá para escolher vários ou importar um JSON). O banco só é criado no final.
- **Contas de usuário de verdade:** login por usuário ou e-mail, **Minha conta** (nome, e-mail, CPF/CNPJ, trocar senha), "Esqueci minha senha" e botão **Sair**. Senhas, CPF/CNPJ e links ficam guardados só em **hash**.
- **Painel do adm** (canto inferior esquerdo, só para administradores): criar gente nova com cargo (sócio, líder de produção, funcionário...) e perfil (administrador ou usuário), gerar senha temporária ou link de redefinição, confirmar e-mail, desativar e excluir. Também define as regras: CPF/CNPJ obrigatório ou não, e-mail obrigatório e "só entra quem confirmou o e-mail".
- **Novo dashboard a partir de um template:** em branco ou escolhendo outro template da galeria, que instala os módulos dele e abre o dashboard pronto. Módulos com o mesmo nome **não se duplicam**: o existente é reaproveitado.
- **Módulos gerados pelo JSON:** resumo (KPIs), busca, filtros, tabela e formulário montados a partir dos campos, com validação.
- **Estrutura editável:** edite campos, opções e resumos de um módulo em JSON direto na tela, ou adicione módulos pela galeria ou colando/importando um JSON.
- **Dashboards de arrastar e soltar:** cards de número, barras, linha e tabela, com medida (contagem, soma, média, saldo), agrupamento (inclusive por mês), séries e filtro.
- **Criador de card guiado:** atalhos prontos a partir dos campos do módulo, escolhas em linguagem simples, nome sugerido, uma frase explicando o card e **prévia ao vivo com dados fictícios**.
- **Lançar pelo dashboard:** "+ Lançar" no topo (ou "+" em cada card) cadastra um registro sem sair do dashboard, e os cards se atualizam.
- **Ajuda (?) com imagem:** no criador de card e na criação de módulos, passar o mouse mostra um print de exemplo; clicar abre um popup com explicação e imagens (`frontend/preview/`).
- **Modo privacidade:** esconde os valores em moeda com um clique.
- **Três temas com um clique:** sol (claro) → pôr do sol (**suave**: fundo creme, contraste mais baixo e menos luz azul, para cansar menos a vista) → lua (escuro). O ícone gira a cada troca. Em **Minha conta** dá para escolher o tema, a página que abre ao entrar, começar com os valores ocultos e "sair dos outros dispositivos". Tudo fica salvo na conta.
- **Exportar/backup:** a configuração (e, se quiser, os dados) sai em JSON no mesmo formato de template.
- **JSON do usuário no banco:** templates importados e cada exportação ficam guardados no SQLite (tabela `jsons`), e os importados voltam na galeria. No git ficam só os templates padrão; qualquer outro `.json` é ignorado.

## Como funciona

```
Navegador (HTML/JS, Chart.js, GridStack)
        │  JSON / HTTP
        ▼
Backend Ruby (Sinatra) ── SQLite (data/dashzon.db)
        │  JSON via stdin/stdout
        ▼
Motor C++ (dashzon_engine): busca e agregação
```

- **Ruby** é dono do banco e das regras: valida os templates, os módulos e os registros e expõe a API REST.
- **C++** faz o trabalho pesado de busca e agregação (somas, contagens, saldo entrada/saída, agrupamento por mês, séries). Ele não conhece nenhum módulo específico: recebe registros e devolve números.
- **O banco só é criado depois do cadastro inicial.** Enquanto o setup não é concluído, nenhum arquivo é gravado.

## Templates padrão

| Template | Módulos |
|---|---|
| Finanças pessoais | Lançamentos (conta/cartão, parcela, pago), Orçamento mensal, Contas e cartões |
| Fluxo de caixa empresarial | Movimentações (categoria, centro de custo, conta, previsto × realizado) |
| Gestão de demandas | Demandas (status, prioridade, setor, responsável, prazo) |
| Mapeamento de dados do setor | Inventário de dados (origem, dono, classificação, LGPD, qualidade), Indicadores com meta |

Todos vêm com categorias reais, resumos (KPIs), dados de exemplo opcionais e um dashboard montado. Também dá para **importar um template seu** e **exportar a configuração atual** no mesmo formato, para backup ou para levar a um servidor.

## Rodando localmente (Windows)

Pré-requisitos: Ruby 3.4 (`winget install RubyInstallerTeam.Ruby.3.4`), CMake e Visual Studio Build Tools (compilador C++).

```powershell
# 1. Compilar o motor C++
cmake -S engine-cpp -B engine-cpp/build
cmake --build engine-cpp/build --config Release

# 2. Instalar as gems e subir o backend
cd backend
bundle install
bundle exec ruby app.rb
```

Depois é só abrir http://127.0.0.1:4567. No primeiro acesso você cria o seu usuário, que já nasce **administrador**. Não existe usuário padrão nem senha conhecida.

Para rodar os testes (usam um banco temporário, nunca o seu):

```powershell
cd backend
bundle exec rake test
```

### No seu domínio (DuckDNS + HTTPS)

Para acessar de fora de casa em `https://SEUNOME.duckdns.org:2444`, siga o passo a passo em **[docs/PUBLICAR-DUCKDNS.md](docs/PUBLICAR-DUCKDNS.md)**. Os scripts prontos estão em `deploy/` (`instalar.ps1`, `iniciar-publico.ps1`, `parar-publico.ps1`), com o Caddy cuidando do certificado HTTPS.

### Em servidor

O motor C++ é portável (CMake + C++17, sem dependências). Compile-o na máquina de destino e configure por variáveis de ambiente:

| Variável | Padrão | Uso |
|---|---|---|
| `DASHZON_HOST` | `127.0.0.1` | Interface de rede (`0.0.0.0` para expor) |
| `PORT` | `4567` | Porta HTTP |
| `DASHZON_DB_PATH` | `data/dashzon.db` | Caminho do banco SQLite |
| `DASHZON_ENGINE` | `engine-cpp/build/...` | Caminho do binário do motor |
| `DASHZON_SESSION_SECRET` | arquivo `data/segredo.key` | Chave do servidor (64+ caracteres): assina o login e protege o hash do CPF/CNPJ. Sem a variável, é criada no arquivo na primeira vez. **Não apague nem troque** |
| `DASHZON_HOSTS` | só localhost e IPs | Domínios aceitos, separados por vírgula (ex.: `meupainel.duckdns.org`) |
| `DASHZON_COOKIE_SEGURO` | desligado | `1` no uso público: requisições por HTTPS (via Caddy) recebem o cookie de login marcado como Secure. O acesso local por `http://127.0.0.1` continua funcionando |
| `DASHZON_URL_PUBLICA` | o endereço da requisição | Endereço usado nos links de e-mail (ex.: `https://meupainel.duckdns.org:2444`) |
| `DASHZON_SMTP_HOST`, `_PORTA`, `_USUARIO`, `_SENHA`, `_REMETENTE` | sem e-mail | Servidor de e-mail para confirmação e "esqueci a senha". Sem isso, o admin manda os links por outro canal |

```bash
cd backend && bundle exec rackup -o 0.0.0.0 -p 8080   # usa config.ru
```

## Perguntas e respostas (os perrengues até aqui)

Tudo que já deu problema, gerou dúvida ou ficou para depois. Se travar em algo, procure aqui primeiro.

### Coisas que não dá (ainda) para fazer

**"Dá para puxar o extrato do meu banco automaticamente?"**
Ainda não. Para isso precisaríamos da API do **Open Finance**, e ela não é aberta para qualquer um: só instituições autorizadas pelo Banco Central (ou parceiros delas) acessam, com certificado, contrato e consentimento do cliente. Para um projeto pessoal rodando no localhost, isso está fora de alcance. O caminho que está nos próximos passos é **importar o CSV/OFX** que o próprio banco deixa baixar.

**"E orçamento × realizado, igual ao Actual Budget?"**
Está na lista, mas exige cruzar dois módulos (orçamento e lançamentos) na hora de agregar. Isso mexe na lógica dos gráficos, que por regra do projeto só muda com pedido explícito (ver `CLAUDE.md`). Vai ser feito com calma, como um recurso separado.

**"Dá para cada pessoa ver só uma parte (só o módulo dela)?"**
Ainda não. Hoje existem dois perfis: **usuário** (usa tudo, menos o painel do adm) e **administrador** (usa tudo e mexe nas contas e regras). Permissão por módulo ou por dashboard fica para depois.

**"Dá para mandar o e-mail de confirmação de verdade?"**
Dá, mas precisa de um servidor de e-mail (SMTP): as variáveis `DASHZON_SMTP_*` (no Gmail, com uma "senha de app"). Sem isso o sistema funciona igual: o administrador marca o e-mail como confirmado no painel e gera o link de redefinição de senha para mandar pelo WhatsApp, por exemplo.

### Contas e senhas

**"Esqueci a senha, e agora?"**
Clique em "Esqueci minha senha". Com e-mail configurado, chega um link; sem ele, peça ao administrador: no painel ele gera uma **senha temporária** (você cria a sua no primeiro acesso) ou um **link de redefinição** (vale 24 h, uma vez só).

**"E se quem esqueceu fui eu, o único administrador?"**
Tem receita no `docs/DESENVOLVIMENTO.md` ("Esqueci a senha do administrador"): um comando que define uma senha temporária direto no banco. Por isso vale ter **dois administradores** (um sócio, por exemplo).

**"Cadê o admin/admin?"**
Saiu. Ele existia quando o login era só de brincadeira, mas uma senha conhecida seria uma porta aberta com o sistema na internet. Quem já tinha o usuário `admin` continua com ele (e virou administrador), mas **troque essa senha** em Minha conta.

**"Desativei alguém e a pessoa continuou na tela."**
A tela pode continuar aberta, mas a próxima ação dela já volta para o login: desativar, redefinir ou trocar a senha derruba a sessão na hora.

**"Por que o CPF aparece com asteriscos até para o administrador?"**
Porque o número completo não é guardado (LGPD): o banco tem só um hash, para achar duplicados, e a versão mascarada para mostrar. Quer corrigir um documento? É só digitar o novo.

**"Coloquei no DuckDNS e do celular não abre."**
Os suspeitos de sempre, nessa ordem: operadora com **CGNAT** (o IP da WAN do roteador é diferente do que aparece em api.ipify.org; peça "IP público" para a operadora), porta 2444 não redirecionada para o IP certo do PC, ou firewall. Tem uma tabela de problemas no fim do `docs/PUBLICAR-DUCKDNS.md`.

**"Pelo Wi-Fi de casa o meu domínio não abre, mas no 4G abre."**
É o roteador que não faz "NAT loopback" (não deixa acessar o próprio IP público de dentro da rede). Em casa, use `http://127.0.0.1:4567`.

### Erros que já apareceram

**"Deu `bundle: command not found` (ou `ruby` não existe)."**
O Ruby foi instalado, mas o terminal ainda não sabe onde ele está. Abra um terminal novo (o PATH só atualiza depois do `winget`) ou chame direto `C:\Ruby34-x64\bin\bundle`.

**"A API responde 409: 'O sistema ainda não foi configurado'."**
Ainda não passou pelo primeiro acesso. Abra a página e conclua o assistente: é só aí que o banco nasce.

**"Do nada tudo virou 401 e voltei para a tela de login."**
Antes isso acontecia a cada reinício do servidor (a chave da sessão era sorteada no boot). Agora a chave fica em `data/segredo.key`, então só cai quem teve a senha trocada ou a conta desativada. Se todo mundo caiu de uma vez, alguém apagou ou trocou esse arquivo.

**"Deu `Host not permitted`."**
O Sinatra só aceita localhost e IPs. Para acessar por um domínio (DuckDNS, por exemplo), coloque-o em `DASHZON_HOSTS`. Isso apareceu até nos testes automáticos, que usam o host `example.org`.

**"Deu 429: 'Muitas tentativas'."**
Foram 8 erros de senha (ou pedidos de link) do mesmo IP em 15 minutos. Espere, ou reinicie o servidor, que zera a contagem.

**"O logout pelo `curl` deu `Length Required`."**
O WEBrick não aceita POST sem corpo. Mande `-d '{}'` com `Content-Type: application/json`. O frontend já faz isso.

**"Deu `invalid byte sequence in UTF-8` ao mandar JSON pelo terminal."**
O acento saiu com a codificação errada do terminal (aconteceu no Git Bash com `curl -d '...Título...'`). Salve o JSON num arquivo UTF-8 e mande com `-d @arquivo.json`, ou teste pela interface.

**"Instalei o mesmo template duas vezes e ficaram módulos duplicados."**
Isso acontecia mesmo, e foi corrigido: agora o nome de módulo é único, e instalar de novo reaproveita o módulo que já existe (sem repetir os dados de exemplo). O dashboard repetido ganha "(2)" no nome.

**"Abri o servidor minimizado e ele não subiu."**
Aconteceu algumas vezes ao iniciar pelo `Start-Process` com janela minimizada. O jeito que sempre funciona é rodar no próprio terminal (`bundle exec ruby app.rb`) ou em segundo plano mandando a saída para um arquivo de log, para ver o erro se algo der errado.

**"O git fica avisando `LF will be replaced by CRLF`."**
É só o Windows convertendo fim de linha. Não é erro e não precisa fazer nada.

### Dúvidas de "por que foi feito assim?"

**"Por que C++ junto com Ruby?"**
Busca e soma sobre muitos registros ficam num binário rápido e sem dependências. A API em Ruby continua simples e cuida do banco e das regras. O C++ nunca abre o banco: recebe registros e devolve números.

**"Por que JSON dentro do SQLite?"**
Para criar ou mudar um módulo sem migração de banco. Um campo novo é só uma chave a mais no JSON.

**"Importei um template e o arquivo não apareceu no git."**
É de propósito. Templates importados e exportações ficam guardados no banco (tabela `jsons`), não em arquivo. No git ficam só os 4 templates padrão, e qualquer outro `.json` é ignorado.

**"Posso mudar como os gráficos se organizam (ordem, cores, empilhamento)?"**
Só com pedido explícito. É a regra principal do `CLAUDE.md`: melhorar **como** se alimenta o dashboard pode, mexer na fórmula dos gráficos não.

**"Os prints do (?) precisam de Chrome instalado?"**
Não. O `scripts/gerar-previews.js` usa o Puppeteer, que baixa o próprio Chromium (na máquina onde o projeto roda não havia nem Chrome nem Edge). Os prints saem de uma instância separada com dados fictícios, nunca do seu banco.

**"O gráfico de linha do print só mostra dois meses."**
Os dados de exemplo cobrem só esse período. Com uso de verdade, a linha vai crescendo.

## Estrutura

```
backend/
  app.rb                 rotas da API (Sinatra)
  config.ru              entrada para rackup/puma em servidor
  lib/database.rb        SQLite: schema, conexão, módulos, registros, usuários e JSON guardados
  lib/module_schema.rb   validação de módulos, widgets e registros
  lib/template_registry.rb  listar/validar/instalar/exportar templates
  lib/engine_client.rb   ponte com o binário C++
  lib/dados_ficticios.rb registros inventados para a prévia do criador de card
  lib/usuarios.rb        contas, perfis, senhas (hash), links e regras de cadastro
  lib/documento.rb       validação e máscara de CPF/CNPJ
  lib/segredo.rb         chave do servidor, HMAC e tokens
  lib/correio.rb         envio de e-mail (SMTP opcional)
  rotas/usuarios.rb      login, minha conta e painel do adm (/api/admin)
  test/                  testes (Minitest + Rack::Test), banco temporário
  templates/*.json       templates padrão (os únicos JSON versionados)
engine-cpp/
  src/main.cpp           comandos aggregate, multi e search
  src/json.hpp           parser/serializador JSON mínimo
frontend/
  index.html             estrutura da tela e modais
  js/app.js              inicialização, navegação e barra lateral
  js/setup.js            assistente de primeiro acesso
  js/login.js            tela de login, esqueci a senha e botão Sair
  js/conta.js            minha conta, troca obrigatória de senha e links
  js/admin.js            painel do adm
  js/tema.js             botão sol/lua (tema claro/escuro)
  js/modulos.js          tela genérica de módulo e editor JSON
  js/dashboards.js       canvas de dashboards, criador de card e "Lançar"
  js/ajuda.js            ícones (?) com prévia em imagem
  preview/               prints de cada módulo e tipo de card (dados fictícios)
  js/util.js, js/api.js  formatação, cores e cliente HTTP
  vendor/                Chart.js e GridStack (offline)
docs/DESENVOLVIMENTO.md  lógica, funções e tutorial
docs/PUBLICAR-DUCKDNS.md passo a passo para rodar no seu domínio
deploy/                  Caddyfile e scripts de publicação (instalar, iniciar, parar, DuckDNS)
scripts/gerar-previews.js  refaz os prints de frontend/preview/
CLAUDE.md                regras do projeto
```

> **Regra do projeto:** a lógica de funcionamento e a fórmula de organização dos dashboards e gráficos não mudam sem pedido explícito (detalhes em `CLAUDE.md`).

## Branches

- `main`: versão estável e de referência.
- `desenvolvimento`: trabalho do dia a dia; vai para a `main` quando estiver estável.
- `producao`: o que está (ou vai estar) rodando no servidor.

## Próximos passos

- Script de inicialização (um clique) e empacotamento como executável Windows.
- Orçamento × realizado (cruzar dois módulos, como no Actual Budget).
- Importação do extrato em CSV/OFX para dentro de um módulo (é a alternativa ao Open Finance; ver as perguntas e respostas).
- Permissões por módulo/dashboard (hoje: usuário e administrador).
- Subir sozinho junto com o Windows (hoje é preciso rodar o `iniciar-publico.ps1` depois de reiniciar o PC).
- Tela para ver e baixar de novo as exportações guardadas no banco (a API `/api/exportacoes` já existe).
