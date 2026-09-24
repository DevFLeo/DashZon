# DashZon: guia de desenvolvimento

Este guia explica como o DashZon funciona por dentro, o que faz cada arquivo e cada função importante, e traz um mini tutorial para manutenção e para apresentar o projeto.

Sumário:

1. [A ideia em uma frase](#1-a-ideia-em-uma-frase)
2. [Caminho de uma requisição](#2-caminho-de-uma-requisição)
3. [Modelo de dados](#3-modelo-de-dados)
4. [Formato do template JSON](#4-formato-do-template-json)
5. [Backend Ruby, arquivo por arquivo](#5-backend-ruby-arquivo-por-arquivo)
6. [Motor C++](#6-motor-c)
7. [Frontend](#7-frontend)
8. [Mini tutorial de manutenção](#8-mini-tutorial-de-manutenção)
9. [Roteiro de apresentação](#9-roteiro-de-apresentação)

---

## 1. A ideia em uma frase

Nada no sistema sabe o que é "gasto", "demanda" ou "fluxo de caixa". Tudo isso vem de **templates JSON**. Um template descreve **módulos** (quais campos cada cadastro tem), **resumos** (os KPIs do módulo) e **dashboards** (quais gráficos mostrar). O código só sabe lidar com *tipos de campo* genéricos: texto, número, moeda, data, seleção, booleano e movimento.

Por isso o mesmo sistema serve para finanças pessoais, caixa de empresa, demandas ou inventário de dados: muda o JSON, não o código.

## 2. Caminho de uma requisição

Exemplo: o dashboard pede os dados do gráfico "Receitas x despesas por mês".

```
1. Navegador  GET /api/widgets/5/data
2. app.rb     lê o widget 5 no SQLite (tabela widgets)
3. app.rb     lê o módulo do widget (tabela modulos) e revalida a config
              contra o schema atual  -> ModuleSchema.normalize_widget!
4. app.rb     traduz a config para o "idioma" do motor -> ModuleSchema.engine_query
              {agrupar_por: "data"}  ->  {"group_by":"data","group_format":"mes", ...}
5. app.rb     carrega todos os registros do módulo -> Database.registros
6. EngineClient.run  abre o dashzon_engine.exe, escreve o JSON no stdin
7. C++        agrupa por mês, separa as séries entrada/saída, soma os valores
              e escreve o resultado no stdout
8. app.rb     devolve o JSON ao navegador, que desenha com Chart.js
```

Regra de ouro: **o Ruby conversa com o banco, e o C++ só faz conta.** O C++ nunca abre o SQLite; ele recebe uma lista de registros e devolve números. Assim ele funciona com qualquer módulo e dá para trocar o banco (por exemplo, PostgreSQL no servidor) sem mexer no C++.

### O setup (primeira vez)

```
GET  /api/status             -> {"configured": false}
GET  /api/templates          -> galeria de templates
POST /api/setup              -> {org_name, moeda, templates: [...ids], importados: [...JSON], com_exemplos}
       1. valida TODOS os templates primeiro (se um falhar, nada é criado)
       2. arquivar_versao_antiga!  (se existir banco de schema antigo, renomeia para .bak)
       3. create_schema!           (só aqui o arquivo data/dashzon.db nasce)
       4. install! de cada template (módulos + dados de exemplo + dashboards)
```

Antes do setup, qualquer rota da API que precise do banco responde **409 "O sistema ainda não foi configurado"**. Isso é o filtro `before "/api/*"` do `app.rb`.

## 3. Modelo de dados

| Tabela | O que guarda |
|---|---|
| `config` | Uma linha só: nome da organização, moeda e data do setup |
| `modulos` | Um por módulo instalado: `slug` (identificador único), nome, descrição, ícone e **`schema`** (JSON com campos, rótulo e resumo) |
| `registros` | Os dados de **todos** os módulos: `modulo_id` + **`dados`** (JSON com os valores dos campos) |
| `dashboards` | Nome de cada dashboard |
| `widgets` | Cada cartão do dashboard: título, tipo (kpi/bar/line/table), `modulo_slug`, **`config`** (JSON: o que medir e como agrupar) e posição x/y/w/h |

Por que JSON dentro do SQLite? Porque criar ou alterar um módulo não exige migração de banco: um campo novo é só uma chave a mais no JSON. A versão do schema fica em `PRAGMA user_version` (hoje `2`).

Um registro "achatado", no formato que a API e o C++ usam, fica assim:

```json
{ "id": 7, "descricao": "Aluguel", "tipo": "saida", "valor": 1450.0,
  "categoria": "Moradia", "data": "2026-09-20", "pago": true,
  "_criado_em": "...", "_atualizado_em": "..." }
```

## 4. Formato do template JSON

```json
{
  "formato": "dashzon-template",
  "versao": 1,
  "id": "meu-template",
  "nome": "Meu template",
  "descricao": "Para que serve",
  "modulos": [ { ...módulo... } ],
  "dashboards": [ { "nome": "Visão geral", "widgets": [ { ...widget... } ] } ]
}
```

### Módulo

```json
{
  "slug": "gastos",
  "nome": "Gastos",
  "descricao": "Opcional",
  "rotulo": "descricao",
  "campos": [
    { "id": "descricao", "nome": "Descrição", "tipo": "texto", "obrigatorio": true },
    { "id": "valor", "nome": "Valor", "tipo": "moeda", "obrigatorio": true },
    { "id": "categoria", "nome": "Categoria", "tipo": "selecao", "opcoes": ["Casa", "Mercado"] },
    { "id": "data", "nome": "Data", "tipo": "data", "padrao": "$hoje" }
  ],
  "resumo": [
    { "titulo": "Total gasto", "agregacao": "soma", "campo": "valor" }
  ],
  "seed": [
    { "descricao": "Feira", "valor": 120, "categoria": "Mercado", "data": "$hoje-3" }
  ]
}
```

- `slug` e `id` dos campos aceitam letras minúsculas, números e `_`, começando por letra. `id`, `_criado_em` e `_atualizado_em` são reservados.
- `rotulo` é o campo usado como "título" do registro. Se faltar, vale o primeiro campo texto.
- `lista: false` esconde o campo da tabela (ele continua no formulário).
- `padrao` é o valor inicial. Em campos de data, aceita `"$hoje"`, `"$hoje-30"` e `"$hoje+7"`.
- `seed` são os dados de exemplo, instalados só se o usuário marcar essa opção.

### Tipos de campo

| Tipo | Guarda | Pode agrupar? | Pode virar série? | Pode somar? |
|---|---|---|---|---|
| `texto` | até 500 caracteres | sim | não | não |
| `texto_longo` | até 5000 caracteres | não | não | não |
| `numero` | número (aceita `1.234,56`) | não | não | **sim** |
| `moeda` | número com 2 casas | não | não | **sim** |
| `data` | `AAAA-MM-DD` | sim (por mês) | não | não |
| `selecao` | uma das `opcoes` | sim | sim | não |
| `booleano` | `true`/`false` | sim | sim | não |
| `movimento` | `entrada` ou `saida` | sim | sim | não, mas habilita o **saldo** |

### Consulta (usada por resumos e widgets)

| Chave | Valores | Efeito |
|---|---|---|
| `agregacao` | `contagem`, `soma`, `media`, `saldo` | O que calcular. `saldo` = entradas − saídas e exige um campo `movimento` |
| `campo` | id de um campo numero/moeda | O que somar (não precisa para `contagem`) |
| `agrupar_por` | id de um campo | Uma barra/linha por valor. Campo data agrupa por mês |
| `serie_por` | id de seleção/booleano/movimento | Divide cada grupo em séries (ex.: entrada × saída) |
| `filtro` | `{ "campo": "valor" }` | Só considera os registros que batem. Booleano: `"true"`/`"false"` |

### Widget

```json
{ "titulo": "Despesas por categoria", "tipo": "bar", "modulo": "gastos",
  "x": 0, "y": 0, "w": 6, "h": 4,
  "config": { "agregacao": "soma", "campo": "valor", "agrupar_por": "categoria" } }
```

`tipo`: `kpi` (número grande), `bar`, `line` ou `table`. O canvas tem 12 colunas: `x` vai de 0 a 11, e `w` + `x` não passa de 12.

## 5. Backend Ruby, arquivo por arquivo

### `backend/lib/database.rb` (módulo `Database`)

| Função | O que faz |
|---|---|
| `connection` | Abre **uma** conexão SQLite para o processo todo, com `foreign_keys` ligado |
| `LOCK` (Monitor) | Serializa o acesso. O WEBrick usa uma thread por requisição, e conexões por thread travariam o arquivo no Windows |
| `rows` / `row` | SELECT devolvendo hashes (remove as chaves numéricas duplicadas que o driver cria) |
| `execute` / `insert` | Escrita. `insert` devolve o id novo de forma atômica |
| `transaction { }` | Ou tudo ou nada (usado na instalação de templates) |
| `configured?` | O arquivo existe, o `user_version` está atual e há linha em `config` |
| `arquivar_versao_antiga!` | Renomeia um banco de schema antigo para `.bak` (nunca apaga) |
| `create_schema!` | Cria as tabelas e grava a `config` |
| `modulos` / `modulo(slug)` | Lista ou busca módulos, já com o `schema` convertido de JSON |
| `registros(modulo_id)` | Registros do módulo, "achatados" (ver seção 3) |

### `backend/lib/module_schema.rb` (módulo `ModuleSchema`)

É a **porta de entrada de todo JSON**: templates, editor e API passam por aqui. Qualquer erro vira `ModuleSchema::Error`, e o `app.rb` transforma isso em resposta **422** com a mensagem em português.

| Função | O que faz |
|---|---|
| `normalize_modulo!(defn)` | Valida slug, nome e campos; define o `rotulo`; valida o `resumo` |
| `normalize_campo!` | Valida id/tipo, exige `opcoes` em seleção e fixa `entrada`/`saida` em movimento |
| `normalize_consulta!` | Regras comuns a resumo e widget (tabela "Consulta" da seção 4) |
| `normalize_widget!(w, schema)` | Valida título/tipo e a consulta; KPI e tabela não têm série |
| `engine_query(schema, cfg)` | Traduz a consulta para o motor C++. `saldo` vira `sign_field` + `negative_values: ["saida"]` |
| `coerce_registro!(schema, dados)` | Valida e converte os valores de um registro, aplica `padrao` e descarta chaves desconhecidas |
| `coerce_valor` | Conversão por tipo (número, data, opção válida...) |
| `parse_number` | Aceita `1234.56`, `1234,56` e `1.234,56` |
| `resolve_token` | `$hoje`, `$hoje-30`, `$hoje+7` viram uma data |

### `backend/lib/template_registry.rb` (módulo `TemplateRegistry`)

| Função | O que faz |
|---|---|
| `all` / `find(id)` | Lê `backend/templates/*.json`, ordenados pelo campo `ordem` |
| `summary(t)` | Versão resumida para a galeria do setup |
| `normalize!(t)` | Valida o template inteiro sem gravar: módulos, seeds e widgets apontando para módulos existentes |
| `install!(tpl, com_exemplos:)` | Grava tudo numa transação. Se o slug já existe, usa `slug_2`, `slug_3`... e corrige os widgets |
| `export(com_dados:)` | Gera um template com a configuração atual, reimportável |

### `backend/lib/engine_client.rb` (módulo `EngineClient`)

`run(payload)` procura o binário (`DASHZON_ENGINE` ou `engine-cpp/build/...`), manda o JSON pelo stdin e lê a resposta. Se o binário não existe ou devolve `error`, levanta `EngineError`, que vira resposta **500**.

### `backend/app.rb` (rotas)

| Método e rota | Para quê |
|---|---|
| `GET /api/status` | Se já foi configurado, com nome e moeda |
| `GET /api/templates`, `GET /api/templates/:id` | Galeria e JSON completo de um template |
| `POST /api/templates/validar` | Pré-visualiza um JSON importado sem gravar |
| `POST /api/setup` | Cria o banco e instala os templates escolhidos |
| `POST /api/templates/instalar` | Adiciona um template depois do setup |
| `GET /api/export?dados=1` | Baixa a configuração (e os dados) em JSON |
| `GET/POST /api/modulos`, `GET/PUT/DELETE /api/modulos/:slug` | CRUD de módulos. O slug não muda no PUT |
| `GET /api/modulos/:slug/resumo` | KPIs do módulo (um único processo C++ com `multi`) |
| `GET /api/modulos/:slug/registros?q=texto&f[campo]=valor` | Lista com busca e filtros (C++ `search`) |
| `POST/PUT/DELETE /api/modulos/:slug/registros[/:id]` | CRUD de registros, validado pelo schema |
| `GET/POST/PUT/DELETE /api/dashboards[/:id]` | Dashboards (GET com id traz os widgets) |
| `POST /api/dashboards/:id/widgets`, `PUT/DELETE /api/widgets/:id` | Widgets |
| `PUT /api/widgets/:id/layout` | Só posição e tamanho (chamado a cada arrastar, nunca apaga a config) |
| `GET /api/widgets/:id/data` | Dados do widget (C++ `aggregate`) |

## 6. Motor C++

O binário `engine-cpp/build/Release/dashzon_engine.exe` lê **um** JSON do stdin e escreve **um** JSON no stdout. Não tem estado nem acesso a disco.

### `aggregate`

```json
{ "cmd": "aggregate", "records": [ ... ],
  "group_by": "data", "group_format": "mes", "series_by": "tipo",
  "value_field": "valor", "filters": { "pago": "true" },
  "sign_field": "tipo", "negative_values": ["saida"] }
```

Todas as opções são opcionais. Resposta:

```json
{ "result": [ { "key": "2026-09", "count": 7, "sum": 8716.9, "avg": 1245.27,
                "series": { "entrada": { "count": 2, "sum": 6100 }, "saida": { ... } } } ],
  "series_keys": ["entrada", "saida"],
  "total_count": 12, "total_sum": 16284.1, "total_avg": 1357.01 }
```

### `multi`

`{ "cmd": "multi", "records": [...], "queries": [ {opções de aggregate}, ... ] }` devolve `{ "results": [ ... ] }`. Os registros atravessam o pipe uma vez só, mesmo com quatro KPIs.

### `search`

`{ "cmd": "search", "records": [...], "q": "alug", "text_fields": ["descricao"], "filters": {...} }` devolve `{ "result": [...registros...], "count": N }`. A busca é por substring e ignora maiúsculas/minúsculas.

### Funções em `src/main.cpp`

| Função | O que faz |
|---|---|
| `valueAsString` / `fieldAsString` | Converte qualquer valor para texto (booleano vira `"true"`/`"false"`) |
| `fieldAsNumber` | Converte para número (aceita número ou texto) |
| `readFilters` / `passesFilters` | Lê `filters` e testa se o registro bate em todos |
| `aggregate` | Filtra, agrupa, aplica o sinal, soma e separa as séries. Grupos por mês saem ordenados |
| `runMulti` | Várias `aggregate` sobre os mesmos registros |
| `runSearch` | Busca textual e filtros |

`src/json.hpp` é um parser e serializador JSON próprio (sem dependências), pensado só para esse contrato.

## 7. Frontend

`frontend/` é uma SPA sem etapa de build: HTML, CSS e JS puros, com Chart.js e GridStack guardados em `frontend/vendor/` para funcionar offline.

**Atenção:** os arquivos `js/demandas.js`, `js/fluxo.js`, `js/dashboards.js` e `js/app.js` ainda são da **primeira versão** (telas fixas) e chamam rotas que não existem mais. Eles serão substituídos pela interface genérica: assistente com galeria de templates, tela de módulo gerada a partir do schema, editor JSON e construtor de dashboards por módulo. Os tokens de cor em `css/style.css` (claro/escuro, séries e status) continuam valendo.

## 8. Mini tutorial de manutenção

### Rodar do zero

```powershell
cmake -S engine-cpp -B engine-cpp/build
cmake --build engine-cpp/build --config Release
cd backend
bundle install
bundle exec ruby app.rb      # http://127.0.0.1:4567
```

Se o terminal não achar o `ruby`, abra um terminal novo (o PATH é atualizado depois do `winget`) ou use `C:\Ruby34-x64\bin\ruby.exe`.

### Voltar ao "primeiro acesso"

Pare o servidor e **renomeie** (não apague, se quiser guardar os dados) o arquivo `data/dashzon.db`. Na próxima abertura, o assistente de setup aparece de novo. Antes disso, dá para salvar tudo em `GET /api/export?dados=1`.

### Testar a API sem o frontend

```bash
B=http://127.0.0.1:4567
curl -s $B/api/status
curl -s -X POST $B/api/setup -H "Content-Type: application/json" \
  -d '{"org_name":"Minha empresa","moeda":"BRL","templates":["fluxo-caixa"],"com_exemplos":true}'
curl -s $B/api/modulos
curl -s $B/api/modulos/movimentacoes/resumo
curl -s "$B/api/modulos/movimentacoes/registros?q=folha&f%5Bsituacao%5D=Realizado"
curl -s -X POST $B/api/modulos/movimentacoes/registros -H "Content-Type: application/json" \
  -d '{"descricao":"Venda balcão","tipo":"entrada","valor":"1.250,00","categoria":"Vendas","situacao":"Realizado"}'
```

### Criar o seu próprio template

1. Copie um arquivo de `backend/templates/` e troque `id`, `nome` e os módulos.
2. Valide sem instalar: `POST /api/templates/validar` com `{"template": {...}}`. A resposta aponta exatamente o campo errado.
3. Para ele aparecer na galeria, salve em `backend/templates/`. Para usar uma vez só, importe pelo setup ou mande em `POST /api/templates/instalar` com `{"template": {...}}`.

### Adicionar um novo tipo de campo (exemplo: `percentual`)

1. `module_schema.rb`: inclua em `TIPOS` e, se puder ser somado, em `NUMERICOS` (ou em `DIMENSOES`/`SERIES`, se for categoria).
2. `module_schema.rb`, `coerce_valor`: diga como converter e validar o valor.
3. Frontend: como mostrar e qual `<input>` usar no formulário.
4. O motor C++ normalmente não muda: ele só vê números e textos.

### Adicionar um comando novo no motor C++

1. Escreva a função em `engine-cpp/src/main.cpp`, no padrão `Value runX(const Value& root)`.
2. Registre-a no `if (cmd == ...)` do `main`.
3. Recompile: `cmake --build engine-cpp/build --config Release`.
4. Teste isolado: `echo '{"cmd":"x","records":[...]}' | engine-cpp/build/Release/dashzon_engine.exe`
5. Chame pelo Ruby com `EngineClient.run(cmd: "x", ...)`.

### Erros comuns

| Sintoma | Causa e solução |
|---|---|
| `409 O sistema ainda não foi configurado` | Falta o `POST /api/setup` |
| `422` com uma mensagem | Validação do JSON: a mensagem diz o campo |
| `500 Motor C++ não encontrado` | Compile o `engine-cpp` ou defina `DASHZON_ENGINE` |
| `Sinatra could not start, the required gems weren't found` | Rode `bundle install` na pasta `backend` |
| `nio4r`/`MSYS2 could not be found` ao instalar o puma | No Windows, use o WEBrick (padrão). Para o puma, rode `ridk install` |
| Porta 4567 ocupada | Outro servidor já está rodando. Feche-o ou defina `PORT` |
| Mudei o `app.rb` e nada mudou | O Sinatra não recarrega sozinho: reinicie o servidor |

### Branches e commits

- Trabalhe na `desenvolvimento`. Quando algo estiver estável, faça merge na `main`. O que for para o servidor vai para a `producao`.
- Um commit por parte que fique pronta (motor, backend, templates, cada tela), com a mensagem no formato `tipo(área): resumo`, por exemplo `feat(backend): ...` ou `fix(engine-cpp): ...`.

## 9. Roteiro de apresentação

Cerca de 5 a 7 minutos:

1. **O problema (30 s).** "Cada área controla suas coisas numa planilha diferente. O DashZon é um único painel que se adapta ao que você quer controlar."
2. **A ideia (1 min).** Mostre um template JSON em `backend/templates/` e explique: "isto aqui é o cadastro inteiro; o sistema lê o JSON e monta tudo".
3. **Primeiro acesso (1 min).** Mostre que antes do setup não existe o arquivo `data/dashzon.db`. Faça o setup escolhendo dois templates e mostre o arquivo `dashzon.db` aparecendo.
4. **Uso (2 min).** Cadastre um lançamento, mostre o resumo mudando e depois os dashboards: receitas x despesas por mês, gastos por categoria e saldo.
5. **Versatilidade (1 min).** Instale o template de mapeamento de dados (LGPD) no mesmo sistema: outro assunto, zero código novo.
6. **Arquitetura (1 min).** Ruby cuida das regras e do banco, e o C++ faz as contas. Mostre o motor sozinho: `echo '{...}' | dashzon_engine.exe`.
7. **Próximos passos (30 s).** Servidor (já configurável por variáveis de ambiente), frontend genérico, modo privacidade e executável.

Perguntas que costumam aparecer:

- *Por que C++?* Busca e agregação sobre muitos registros ficam num binário rápido e sem dependências, e a API em Ruby continua simples.
- *Por que JSON no banco?* Para criar ou alterar módulos sem migração. Se um módulo virar gargalo, dá para passá-lo para uma tabela própria sem mudar o contrato da API.
- *E se eu apagar um campo usado num gráfico?* O widget é revalidado a cada leitura e responde 422 com o motivo, em vez de mostrar dados errados.
