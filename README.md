# DashZon

Um painel de gestão que se molda ao que você quer controlar. Em vez de uma planilha para cada coisa, você escolhe (ou importa) um template em JSON e o sistema monta sozinho os cadastros, os resumos e os dashboards de arrastar e soltar. Hoje ele já cuida de finanças pessoais, fluxo de caixa de empresa, demandas de equipe e mapeamento de dados de um setor. Se der para descrever em JSON, dá para controlar aqui.

A inspiração veio de projetos open source de finanças como o [OpenMonetis](https://openmonetis.com/) e o [Actual Budget](https://actualbudget.org/). A diferença é que aqui nada é fixo em "finanças": tudo é genérico.

> É um projeto pessoal, feito aos poucos e aprendendo no caminho. Mais abaixo tem uma seção de **perguntas e respostas** com os perrengues que já apareceram e como foram resolvidos (ou não).

## O que dá para fazer

- **Primeiro acesso guiado:** nome, moeda, usuário e senha, e galeria de templates (dá para escolher vários ou importar um JSON). O banco só é criado no final.
- **Login (simulado):** tela de entrada com usuário e senha e botão **Sair**. Bancos criados antes do login entram com **admin / admin**.
- **Novo dashboard a partir de um template:** em branco ou escolhendo outro template da galeria, que instala os módulos dele e abre o dashboard pronto. Módulos com o mesmo nome **não se duplicam**: o existente é reaproveitado.
- **Módulos gerados pelo JSON:** resumo (KPIs), busca, filtros, tabela e formulário montados a partir dos campos, com validação.
- **Estrutura editável:** edite campos, opções e resumos de um módulo em JSON direto na tela, ou adicione módulos pela galeria ou colando/importando um JSON.
- **Dashboards de arrastar e soltar:** cards de número, barras, linha e tabela, com medida (contagem, soma, média, saldo), agrupamento (inclusive por mês), séries e filtro.
- **Criador de card guiado:** atalhos prontos a partir dos campos do módulo, escolhas em linguagem simples, nome sugerido, uma frase explicando o card e **prévia ao vivo com dados fictícios**.
- **Lançar pelo dashboard:** "+ Lançar" no topo (ou "+" em cada card) cadastra um registro sem sair do dashboard, e os cards se atualizam.
- **Ajuda (?) com imagem:** no criador de card e na criação de módulos, passar o mouse mostra um print de exemplo; clicar abre um popup com explicação e imagens (`frontend/preview/`).
- **Modo privacidade:** esconde os valores em moeda com um clique.
- **Exportar/backup:** a configuração (e, se quiser, os dados) sai em JSON no mesmo formato de template.
- **JSON do usuário no banco:** templates importados e cada exportação ficam guardados no SQLite (tabela `jsons`), e os importados voltam na galeria. No git ficam só os templates padrão; qualquer outro `.json` é ignorado.
- **Tema claro e escuro**, seguindo o sistema operacional.

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

Depois é só abrir http://127.0.0.1:4567. Se o banco foi criado antes do login existir, entre com **admin / admin**.

### Em servidor

O motor C++ é portável (CMake + C++17, sem dependências). Compile-o na máquina de destino e configure por variáveis de ambiente:

| Variável | Padrão | Uso |
|---|---|---|
| `DASHZON_HOST` | `127.0.0.1` | Interface de rede (`0.0.0.0` para expor) |
| `PORT` | `4567` | Porta HTTP |
| `DASHZON_DB_PATH` | `data/dashzon.db` | Caminho do banco SQLite |
| `DASHZON_ENGINE` | `engine-cpp/build/...` | Caminho do binário do motor |
| `DASHZON_SESSION_SECRET` | sorteada a cada boot | Chave do cookie de login (64+ caracteres). Fixe-a no servidor para as sessões sobreviverem a um reinício |

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

**"Posso ter vários usuários, cada um com seu acesso?"**
Ainda não. O login é **simulado**: um usuário local, com a senha guardada em hash, só para não ficar aberto. Cadastro de pessoas, troca de senha e permissões ficam para antes de colocar num servidor.

**"Esqueci a senha, e agora?"**
Ainda não existe "esqueci minha senha". Dá para parar o servidor e renomear o `data/dashzon.db`: o sistema volta para o primeiro acesso e cria um banco novo. O antigo continua lá, renomeado, com os dados intactos.

### Erros que já apareceram

**"Deu `bundle: command not found` (ou `ruby` não existe)."**
O Ruby foi instalado, mas o terminal ainda não sabe onde ele está. Abra um terminal novo (o PATH só atualiza depois do `winget`) ou chame direto `C:\Ruby34-x64\bin\bundle`.

**"A API responde 409: 'O sistema ainda não foi configurado'."**
Ainda não passou pelo primeiro acesso. Abra a página e conclua o assistente: é só aí que o banco nasce.

**"Do nada tudo virou 401 e voltei para a tela de login."**
O servidor foi reiniciado. Sem a variável `DASHZON_SESSION_SECRET`, a chave da sessão é sorteada a cada vez que o servidor sobe, então todo mundo precisa entrar de novo. Em servidor, defina essa variável.

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
  templates/*.json       templates padrão (os únicos JSON versionados)
engine-cpp/
  src/main.cpp           comandos aggregate, multi e search
  src/json.hpp           parser/serializador JSON mínimo
frontend/
  index.html             estrutura da tela e modais
  js/app.js              inicialização, navegação e barra lateral
  js/setup.js            assistente de primeiro acesso
  js/login.js            tela de login e botão Sair
  js/modulos.js          tela genérica de módulo e editor JSON
  js/dashboards.js       canvas de dashboards, criador de card e "Lançar"
  js/ajuda.js            ícones (?) com prévia em imagem
  preview/               prints de cada módulo e tipo de card (dados fictícios)
  js/util.js, js/api.js  formatação, cores e cliente HTTP
  vendor/                Chart.js e GridStack (offline)
docs/DESENVOLVIMENTO.md  lógica, funções e tutorial
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
- Usuários de verdade antes de publicar em servidor: cadastro de mais pessoas, troca de senha e permissões (hoje o login é simulado, com um usuário local).
- Tela para ver e baixar de novo as exportações guardadas no banco (a API `/api/exportacoes` já existe).
