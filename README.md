# DashZon

Dashboard de gestão **modular** e **multiuso**: você escolhe (ou importa) templates em JSON e o sistema monta os módulos de cadastro, os resumos e os dashboards de arrastar e soltar. Serve para controlar finanças pessoais, fluxo de caixa de uma empresa, demandas de uma equipe, mapear os dados de um setor ou qualquer outra coisa que você descrever em JSON.

Inspirado em projetos open source de finanças como [OpenMonetis](https://openmonetis.com/) e [Actual Budget](https://actualbudget.org/), mas genérico.

## O que dá para fazer

- **Primeiro acesso guiado:** nome, moeda e galeria de templates (dá para escolher vários ou importar um JSON). O banco só é criado no final.
- **Módulos gerados pelo JSON:** resumo (KPIs), busca, filtros, tabela e formulário montados a partir dos campos, com validação.
- **Estrutura editável:** edite campos, opções e resumos de um módulo em JSON direto na tela, ou adicione módulos pela galeria ou colando/importando um JSON.
- **Dashboards de arrastar e soltar:** widgets de número, barras, linha e tabela, com medida (contagem, soma, média, saldo), agrupamento (inclusive por mês), séries e filtro.
- **Modo privacidade:** esconde os valores em moeda com um clique.
- **Exportar/backup:** a configuração (e, se quiser, os dados) sai em JSON no mesmo formato de template.
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

```bash
cd backend && bundle exec rackup -o 0.0.0.0 -p 8080   # usa config.ru
```

## Estrutura

```
backend/
  app.rb                 rotas da API (Sinatra)
  config.ru              entrada para rackup/puma em servidor
  lib/database.rb        SQLite: schema, conexão, módulos e registros
  lib/module_schema.rb   validação de módulos, widgets e registros
  lib/template_registry.rb  listar/validar/instalar/exportar templates
  lib/engine_client.rb   ponte com o binário C++
  templates/*.json       templates padrão
engine-cpp/
  src/main.cpp           comandos aggregate, multi e search
  src/json.hpp           parser/serializador JSON mínimo
frontend/
  index.html             estrutura da tela e modais
  js/app.js              inicialização, navegação e barra lateral
  js/setup.js            assistente de primeiro acesso
  js/modulos.js          tela genérica de módulo e editor JSON
  js/dashboards.js       canvas de dashboards e widgets
  js/util.js, js/api.js  formatação, cores e cliente HTTP
  vendor/                Chart.js e GridStack (offline)
docs/DESENVOLVIMENTO.md  lógica, funções e tutorial
```

## Branches

- `main`: versão estável e de referência.
- `desenvolvimento`: trabalho do dia a dia; vai para a `main` quando estiver estável.
- `producao`: o que está (ou vai estar) rodando no servidor.

## Próximos passos

- Script de inicialização (um clique) e empacotamento como executável Windows.
- Orçamento × realizado (cruzar dois módulos, como no Actual Budget).
- Importação de CSV/extrato para dentro de um módulo.
- Autenticação e usuários antes de publicar em servidor.
