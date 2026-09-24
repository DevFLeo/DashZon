# DashZon

Dashboard de gestão **modular** e **multiuso**: você escolhe (ou importa) templates em JSON e o sistema monta os módulos de cadastro, os resumos e os dashboards de arrastar e soltar. Serve para controlar finanças pessoais, fluxo de caixa de uma empresa, demandas de uma equipe, mapear os dados de um setor ou qualquer outra coisa que você descrever em JSON.

Inspirado em projetos open source de finanças como [OpenMonetis](https://openmonetis.com/) e [Actual Budget](https://actualbudget.org/), mas genérico.

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

Depois é só abrir http://127.0.0.1:4567.

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
- Importação de CSV/extrato para dentro de um módulo.
- Usuários de verdade antes de publicar em servidor: cadastro de mais pessoas, troca de senha e permissões (hoje o login é simulado, com um usuário local).
- Tela para ver e baixar de novo as exportações guardadas no banco (a API `/api/exportacoes` já existe).
