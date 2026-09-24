# DashZon: guia de desenvolvimento

Este guia explica como o DashZon funciona por dentro, o que faz cada arquivo e cada função importante, e traz um mini tutorial para manutenção e para apresentar o projeto.

> **Regra do projeto (ver `CLAUDE.md`):** a lógica de funcionamento e a fórmula de organização dos dashboards e gráficos não mudam sem pedido explícito. Isso cobre a agregação do motor C++, o formato do `config` de um widget (`normalize_consulta!` / `engine_query`) e o desenho/ordem/layout em `dashboards.js` (`valorDe` … `renderGrafico`, GridStack). O código marca esses trechos com comentários `REGRA:`. Melhorar **como** o usuário alimenta o dashboard é permitido, desde que gere o mesmo `config`.

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
POST /api/setup              -> {org_name, moeda, usuario, senha, templates: [...ids], importados: [...JSON], com_exemplos}
       1. valida TODOS os templates primeiro (se um falhar, nada é criado)
       2. arquivar_versao_antiga!  (se existir banco de schema antigo, renomeia para .bak)
       3. create_schema!           (só aqui o arquivo data/dashzon.db nasce)
       4. criar_usuario!           (o login do setup; a sessão já sai autenticada)
       5. install! de cada template (módulos + dados de exemplo + dashboards)
       6. salvar_importado! dos JSON importados (tabela jsons, voltam na galeria)
```

O filtro `before "/api/*"` do `app.rb` protege a API:

- Sempre abertas (`ROTAS_ABERTAS`): `/api/status`, `/api/login`, `/api/logout`, `/api/usuarios/primeiro` e as dos links (`/api/senha/esqueci`, `/api/senha/redefinir`, `/api/email/verificar`).
- **Antes do setup**, só o setup e a galeria respondem; o resto dá **409 "O sistema ainda não foi configurado"**.
- **Depois do setup**, tudo (inclusive a galeria, que passa a ter templates do usuário) exige login: sem sessão válida, **401**.
- Com **senha temporária**, só dá para trocar a senha, ver o status e sair: o resto responde **403** com `trocar_senha: true`.
- `/api/admin/*` é só para administradores: os demais recebem **403**.

### Contas de usuário

Quem faz o setup é o primeiro **administrador**. Depois disso, o administrador cria as outras contas no **Painel do adm**. Cada conta tem nome, login, e-mail, CPF/CNPJ, cargo (Sócio, Líder de produção, Funcionário... texto livre) e perfil:

| Perfil | Pode |
|---|---|
| `usuario` | Usar o sistema (módulos, dashboards) e editar a própria conta (nome, e-mail, documento, senha) |
| `admin` | Tudo isso e o Painel do adm: contas, regras de cadastro, nome e moeda da organização |

```
POST /api/login              -> {usuario (login ou e-mail), senha}
POST /api/logout
POST /api/usuarios/primeiro  -> só num banco sem nenhum usuário; o criado vira admin
GET  /api/eu | PUT /api/eu   -> minha conta (nome, email, documento)
PUT  /api/eu/preferencias    -> {tema: sistema|claro|escuro, pagina_inicial: ""|#/d/<id>|#/m/<slug>|#/admin, privacidade}
POST /api/eu/sair-outros     -> derruba as outras sessões (esta continua)
PUT  /api/eu/senha           -> {senha_atual, senha_nova}
POST /api/senha/esqueci      -> manda link por e-mail (se houver SMTP)
POST /api/senha/redefinir    -> {token, senha}
POST /api/email/verificar    -> {token}
```

**Sessão:** cookie assinado com `session[:uid]` e `session[:sv]` (a `sessao_versao` do usuário). A cada requisição, `usuario_atual` confere se a conta existe, está ativa e se a versão bate. Trocar ou redefinir a senha e desativar a conta sobem a versão, e as outras sessões caem na hora.

**Chave do servidor** (`lib/segredo.rb`): `DASHZON_SESSION_SECRET` ou o arquivo `segredo.key` ao lado do banco, criado na primeira vez. Ela assina o cookie (reiniciar o servidor não derruba mais ninguém) e é a chave do HMAC do CPF/CNPJ. **Não apague esse arquivo:** as sessões caem e os documentos já gravados deixam de ser reconhecidos como duplicados.

**Hash de tudo o que é sensível:**

| Dado | Como é guardado |
|---|---|
| Senha | PBKDF2-HMAC-SHA256, 100 mil iterações, sal por usuário |
| CPF/CNPJ | HMAC-SHA256 com a chave do servidor (para achar duplicados) + versão mascarada para exibir (`***.982.247-**`). O número completo não é gravado |
| Token de link | SHA-256. O token em si só existe no link |

**Proteções:** 8 falhas por IP em 15 minutos bloqueiam login e links (429); uma senha errada ainda espera meio segundo; login inexistente leva o mesmo tempo que senha errada; "esqueci a senha" não diz se a conta existe. Nunca sobra zero administrador ativo, e ninguém se exclui, se desativa ou tira o próprio perfil de administrador.

**E-mail:** com `DASHZON_SMTP_HOST` (e usuário/senha), os links de confirmação de e-mail e de redefinição vão por e-mail (`lib/correio.rb`). Sem isso, o administrador gera o link de redefinição e manda por outro canal (WhatsApp, por exemplo), e marca os e-mails como confirmados à mão.

**Regras de cadastro** (tabela `ajustes`, editadas no painel): CPF/CNPJ opcional, CPF obrigatório, CNPJ obrigatório ou qualquer um dos dois; e-mail obrigatório; e "só entra quem confirmou o e-mail" (administradores sempre entram, para ninguém ficar trancado fora).

## 3. Modelo de dados

| Tabela | O que guarda |
|---|---|
| `config` | Uma linha só: nome da organização, moeda e data do setup |
| `modulos` | Um por módulo instalado: `slug` (identificador único), nome, descrição, ícone e **`schema`** (JSON com campos, rótulo e resumo) |
| `registros` | Os dados de **todos** os módulos: `modulo_id` + **`dados`** (JSON com os valores dos campos) |
| `dashboards` | Nome de cada dashboard |
| `widgets` | Cada cartão do dashboard: título, tipo (kpi/bar/line/table), `modulo_slug`, **`config`** (JSON: o que medir e como agrupar) e posição x/y/w/h |
| `usuarios` | Contas: `login`, `senha_hash` + `sal`, nome, e-mail (+ `email_verificado_em`), `documento_tipo` / `documento_hash` / `documento_mascara`, cargo, `perfil` (`admin`/`usuario`), `ativo`, `deve_trocar_senha`, `sessao_versao`, último login |
| `tokens` | Links de uso único (`redefinir_senha` 24 h, `verificar_email` 7 dias): só o `token_hash`, com validade e data de uso |
| `ajustes` | Regras do painel do adm (chave/valor): `exigir_documento`, `exigir_email`, `exigir_email_verificado` |
| `jsons` | JSON do usuário: `tipo` `template` (importados, aparecem na galeria) ou `exportacao` (cada backup baixado), com `nome` e `conteudo` |

`usuarios`, `tokens`, `ajustes` e `jsons` ficam fora do `SCHEMA` principal (`EXTRAS_SQL`) e são criadas sob demanda por `garantir_tabelas!`, então um banco existente as ganha sem mudar o `user_version`. As colunas novas de `usuarios` entram por `migrar_usuarios!` (compara com `PRAGMA table_info` e faz `ALTER TABLE`); num banco que já tinha usuários mas nenhum administrador, o primeiro vira administrador.

**Onde fica cada JSON:** os templates padrão são arquivos em `backend/templates/` e vão para o git. Tudo o que o usuário traz ou gera (templates importados, exportações) vai para a tabela `jsons` do banco, que já fica fora do git. O `.gitignore` também ignora qualquer outro `.json` solto no projeto; um template colocado em `backend/templates/` continua aparecendo na galeria localmente, mas não é versionado.

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
| `garantir_tabelas!` | Cria `usuarios`, `tokens`, `ajustes` e `jsons` se ainda não existirem e roda `migrar_usuarios!` (uma vez por conexão) |
| `atualizar_config!` | Nome da organização (opcional) e moeda |
| `salvar_json!(tipo, nome, obj)` | Guarda um JSON; um template idêntico a um já salvo não é duplicado |
| `jsons(tipo)` / `json_salvo(id)` / `excluir_json!` | Lista (sem o conteúdo), lê e remove JSON guardados |
| `modulos` / `modulo(slug)` | Lista ou busca módulos, já com o `schema` convertido de JSON |
| `modulo_por_nome(nome, exceto_id:)` | Acha um módulo pelo nome, sem diferenciar maiúsculas (comparado em Ruby para tratar acentos). Base da regra "nome de módulo é único" |
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
| `all` / `find(id)` | Templates padrão (`backend/templates/*.json`, pelo campo `ordem`) seguidos dos importados guardados no banco, que ganham o id `salvo-<n>` |
| `salvar_importado!(bruto)` | Guarda um template importado na tabela `jsons` |
| `summary(t)` | Versão resumida para a galeria do setup |
| `normalize!(t)` | Valida o template inteiro sem gravar: módulos, seeds e widgets apontando para módulos existentes |
| `install!(tpl, com_exemplos:)` | Grava tudo numa transação. **Módulo com o mesmo nome de um existente é reaproveitado** (não duplica, não repete os dados de exemplo; widgets do template passam a apontar para ele e os que não cabem mais no schema atual são pulados). Se só o slug colidir, usa `slug_2`, `slug_3`... Devolve `{modulos, dashboards, reaproveitados, widgets_pulados}` |
| `nome_dashboard_livre` | Dashboard de nome repetido vira "Nome (2)", "Nome (3)"... |
| `export(com_dados:)` | Gera um template com a configuração atual, reimportável |

### `backend/lib/engine_client.rb` (módulo `EngineClient`)

`run(payload)` procura o binário (`DASHZON_ENGINE` ou `engine-cpp/build/...`), manda o JSON pelo stdin e lê a resposta. Se o binário não existe ou devolve `error`, levanta `EngineError`, que vira resposta **500**.

### `backend/lib/usuarios.rb` (módulo `Usuarios`)

Toda regra de conta. Erros levantam `Usuarios::Erro` com o status HTTP (422, 403, 404), que o `app.rb` devolve com a mensagem.

| Função | O que faz |
|---|---|
| `validar_dados!(d, atual:)` | Login (3–40, letras/números/`._-`, único sem diferenciar maiúsculas), nome, e-mail (formato, único, obrigatório conforme regra), CPF/CNPJ (dígitos verificadores, tipo exigido, único pelo HMAC), cargo e perfil. Campo ausente mantém o valor atual |
| `criar!` / `atualizar!(id, d, por_admin:)` | Grava a conta. Sem `por_admin`, login, cargo e perfil são ignorados. E-mail trocado perde a confirmação |
| `definir_senha!(id, nova, deve_trocar:)` | Troca a senha, sobe `sessao_versao` e invalida links de redefinição pendentes |
| `definir_ativo!` / `excluir!` / `garantir_outro_admin!` | Ativar/desativar e excluir, sem nunca zerar os administradores ativos |
| `autenticar` / `pode_entrar!` | Confere a senha (tempo igual para login inexistente) e as regras de entrada (conta ativa, e-mail confirmado se exigido) |
| `senha_temporaria` | 12 caracteres sem os que se confundem (0/O, 1/l/I) |
| `criar_token!` / `consumir_token!` | Links de uso único. O de confirmação vale só para o e-mail para o qual foi gerado |
| `ajustes` / `salvar_ajustes!` | Regras de cadastro. Exigir e-mail confirmado liga "e-mail obrigatório" junto |
| `publico(u)` | O que pode sair na API (nunca hash de senha, sal ou hash de documento) |

`lib/documento.rb` valida e mascara CPF/CNPJ; `lib/segredo.rb` cuida da chave do servidor, do HMAC e dos tokens; `lib/correio.rb` envia e-mail por SMTP quando configurado. As rotas ficam em `backend/rotas/usuarios.rb`.

### `backend/lib/dados_ficticios.rb` (módulo `DadosFicticios`)

`registros(schema)` inventa 72 registros a partir dos campos do módulo, só para a prévia do criador de card: valores em moeda entre 40 e 2.400, datas espalhadas pelos últimos 6 meses, mais saídas que entradas, e as primeiras opções de cada seleção aparecendo mais (para as barras variarem). A semente é fixa por módulo, então a prévia não "pula" a cada ajuste.

### `backend/app.rb` (rotas)

| Método e rota | Para quê |
|---|---|
| `GET /api/status` | Se já foi configurado, com nome, usuário conectado (dados públicos) e moeda; antes do login, se falta criar o primeiro usuário |
| `POST /api/login`, `POST /api/logout`, `/api/eu*`, `/api/senha/*`, `/api/email/verificar` | Sessão, minha conta e links (ver "Contas de usuário") |
| `GET/PUT /api/admin/ajustes`, `PUT /api/admin/config` | Regras de cadastro; nome e moeda da organização |
| `GET/POST /api/admin/usuarios`, `PUT/DELETE /api/admin/usuarios/:id` | Listar, criar (sem senha: gera temporária), editar, excluir |
| `POST /api/admin/usuarios/:id/{ativo,senha-temporaria,link-redefinicao,email-verificado,enviar-verificacao}` | Ações do painel sobre uma conta |
| `GET /api/templates`, `GET /api/templates/:id` | Galeria (padrão + importados) e JSON completo de um template |
| `DELETE /api/templates/salvo-<n>` | Remove um template importado da galeria (os padrão não podem ser removidos) |
| `POST /api/templates/validar` | Pré-visualiza um JSON importado sem gravar |
| `POST /api/setup` | Cria o banco, o usuário e instala os templates escolhidos |
| `POST /api/templates/instalar` | Adiciona um template depois do setup (`template_id` da galeria ou `template` colado, que fica guardado no banco) |
| `GET /api/export?dados=1` | Baixa a configuração (e os dados) em JSON e guarda uma cópia no banco |
| `GET /api/exportacoes`, `GET/DELETE /api/exportacoes/:id` | Histórico de exportações guardadas: listar, baixar de novo, remover |
| `GET/POST /api/modulos`, `GET/PUT/DELETE /api/modulos/:slug` | CRUD de módulos. O slug não muda no PUT |
| `GET /api/modulos/:slug/resumo` | KPIs do módulo (um único processo C++ com `multi`) |
| `GET /api/modulos/:slug/registros?q=texto&f[campo]=valor` | Lista com busca e filtros (C++ `search`) |
| `POST/PUT/DELETE /api/modulos/:slug/registros[/:id]` | CRUD de registros, validado pelo schema |
| `GET/POST/PUT/DELETE /api/dashboards[/:id]` | Dashboards (GET com id traz os widgets) |
| `POST /api/dashboards/:id/widgets`, `PUT/DELETE /api/widgets/:id` | Widgets |
| `PUT /api/widgets/:id/layout` | Só posição e tamanho (chamado a cada arrastar, nunca apaga a config) |
| `GET /api/widgets/:id/data` | Dados do widget (C++ `aggregate`) |
| `POST /api/widgets/preview` | Prévia do criador de card: mesma validação e mesma consulta do `/data`, sobre registros **fictícios** gerados do schema (`lib/dados_ficticios.rb`, semente fixa por módulo). Nada é gravado |

`POST /api/modulos` e `PUT /api/modulos/:slug` respondem **422** se o nome já pertence a outro módulo.

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

`frontend/` é uma SPA sem etapa de build: HTML, CSS e JS puros, com Chart.js e GridStack guardados em `frontend/vendor/` para funcionar offline. Cada arquivo JS é um módulo com escopo próprio (`const X = (() => { ... return {...} })()`), carregado nesta ordem pelo `index.html`: `util` → `ajuda` → `tema` → `api` → `setup` → `login` → `conta` → `admin` → `modulos` → `dashboards` → `app`.

### Navegação

A URL guarda onde você está, então dá para recarregar a página ou mandar o link:

| Hash | Tela |
|---|---|
| `#/d/3` | Dashboard de id 3 |
| `#/m/lancamentos` | Módulo de slug `lancamentos` |
| `#/inicio` | Nenhum módulo instalado (convite para adicionar) |

### `js/app.js` (`App`)

| Função | O que faz |
|---|---|
| `boot` | Liga os comportamentos globais e decide entre o assistente (`Setup.iniciar`), a tela de login (`Login.iniciar`) e a aplicação |
| `iniciarApp` | Aplica a moeda, inicia as telas e carrega a barra lateral |
| `recarregarNav` | Busca módulos e dashboards de novo (chame depois de criar ou excluir algo) |
| `rotear` | Lê o hash e abre o dashboard ou o módulo. Rota inválida vai para a rota padrão |
| `modulo(slug)` / `modulos()` | Módulos em memória, com o schema, usados pelos widgets e formulários |
| `aplicarPrivacidade` | Liga/desliga a classe `privado` no `<body>` (salva no navegador) |

### `js/setup.js` (`Setup`)

`iniciar(onConcluido)` mostra a galeria (o primeiro template já vem marcado), pede usuário e senha, deixa importar um JSON e, no envio, chama `POST /api/setup`. `cardHtml(...)` desenha o cartão de template e é reaproveitado nos modais "Adicionar módulo" e "Novo dashboard"; `tagDe(t)` põe a etiqueta "Importado" nos templates vindos do banco.

### `js/login.js` (`Login`)

`iniciar(status, onConcluido)` mostra a tela de login (usuário ou e-mail) e chama `POST /api/login`; num banco sem usuários, vira "crie seu usuário" (`/api/usuarios/primeiro`). Tem o "Esqueci minha senha". `sair()` chama `POST /api/logout` e recarrega a página. O `api.js` volta para a tela de login sempre que uma chamada recebe **401** (sessão expirada ou derrubada).

### `js/conta.js` (`Conta`)

"Minha conta" (nome, e-mail com situação de confirmação, CPF/CNPJ e troca de senha), `trocaObrigatoria(usuario)` (modal que não fecha até a pessoa criar a senha própria, depois de uma senha temporária) e `paginaLink()`, que trata `#/redefinir/<token>` e `#/verificar-email/<token>` e depois tira o token da barra de endereço.

### `js/tema.js` (`Tema`)

Botão de tema (`.tema-btn`: na barra lateral e, antes do login, flutuando no canto) com ciclo de três: sol = claro (`data-theme="light"`) → pôr do sol = **suave** (`"soft"`: sol sobre fundo alaranjado e lua com brilho clarinho) → lua = escuro (`"dark"`). A troca gira o botão e cruza os ícones (CSS; desliga com "reduzir movimento"). `aplicar(tema)` põe `data-theme` no `<html>` (ou tira, para seguir o sistema), guarda no navegador (`dashzon.tema`) e dispara o evento `dashzon:tema`, que o dashboard usa para **redesenhar** os gráficos com as mesmas funções (a regra dos gráficos não muda). Um script no `<head>` aplica o tema salvo antes de desenhar a página, sem piscar. Com alguém logado, o botão também salva na conta (`Conta.salvarTema`), e ao entrar vale o tema da conta.

### `js/admin.js` (`Admin`)

O Painel do adm (`#/admin`, link no canto inferior esquerdo, só para administradores): regras de cadastro, organização, lista de usuários com "Editar" e o menu "Mais…" (senha temporária, link de redefinição, confirmar e-mail, enviar confirmação, desativar/reativar, excluir). Senha temporária e link aparecem **uma única vez** no `#modal-segredo`, com botão de copiar.

### `js/modulos.js` (`Modulos`)

| Função | O que faz |
|---|---|
| `abrir(slug)` | Carrega o módulo e desenha resumo, filtros e tabela |
| `renderFiltros` | Um `<select>` para até 4 campos de movimento, sim/não ou seleção |
| `renderTabela` / `celula` | Colunas = campos com `lista` diferente de `false` (até 7), formatadas pelo tipo |
| `inputHtml` | **Onde cada tipo de campo vira um input** (checkbox, date, number, select...) |
| `coletar` | Lê o formulário e converte números e booleanos antes de enviar |
| `abrirEstrutura` / `salvarEstrutura` | Editor JSON do módulo (`PUT /api/modulos/:slug`) |
| `abrirAdicionar` / `comoTemplate` / `instalar` | Galeria e importação. Um módulo solto é embrulhado num template antes de validar e instalar |
| `abrirFormulario(registro, modulo, depois)` | Formulário de registro de qualquer módulo; `depois` roda após salvar (na tela do módulo, recarrega a tabela) |
| `lancar(slug, depois)` | Novo registro sem sair da tela atual: é o que o "+ Lançar" do dashboard usa |

### `js/dashboards.js` (`Dashboards`)

| Função | O que faz |
|---|---|
| `init` | Cria o GridStack (12 colunas, arrasta pelo título) e liga o formulário de widget |
| `abrir(id)` | Limpa o canvas e recria os widgets do dashboard |
| `adicionarNoGrid` | Monta o HTML do cartão e registra no GridStack (`makeWidget`) |
| `salvarLayout` | Em cada arrastar/redimensionar, chama só `PUT /api/widgets/:id/layout` |
| `carregarDados` | Busca `/api/widgets/:id/data` e escolhe `renderKpi`, `renderTabela` ou `renderGrafico` |
| `ordenar` | Meses em ordem, seleções na ordem das opções do schema, o resto do maior para o menor |
| `renderGrafico` | Chart.js: até 2 séries lado a lado, mais que isso empilhadas; cor da série pela opção (`Util.corSerie`) |
| `preencherOpcoes` | Monta o formulário de widget a partir dos campos do módulo escolhido. Filtros extras são mantidos |
| `abrirNovo` | Modal "Novo dashboard": aba **A partir de um template** (instala os módulos do template e abre o dashboard dele) ou **Em branco** (só o nome) |
| `escolherLancar` / `aposLancar` | "+ Lançar": se o dashboard usa um módulo só, abre direto o formulário dele; senão pergunta qual (os usados primeiro). Depois de salvar, recarrega todos os cards. Cada card também tem um "+" que lança no módulo dele |

#### Criador de card

O formulário de card (`abrirFormulario` / `salvarWidget`) tem 5 passos e uma prévia ao lado. Ele só ajuda a **preencher** os mesmos campos `w-*` de antes; o card salvo sai de `montarCorpo()` com o mesmo `config`.

| Função | O que faz |
|---|---|
| `sugestoes(modulo)` / `renderSugestoes` | Atalhos gerados dos campos do módulo: total de registros, saldo ou total, valor por categoria, entradas × saídas por mês, evolução mês a mês, tabela por categoria. Clicar preenche tudo |
| `setTipo` | Os 4 botões de tipo (número, barras, linha, tabela) gravam no `<input hidden id="w-tipo">` |
| `tituloSugerido` | Nome automático ("Valor por Categoria", "Saldo mês a mês"...) até o usuário digitar um nome |
| `frase` | Explica em português o que o card vai mostrar |
| `montarCorpo` | Monta `{titulo, tipo, modulo, config}`, usado por salvar e pela prévia |
| `atualizarPrevia` | `POST /api/widgets/preview` e desenha com os **mesmos** `renderKpi` / `renderTabela` / `renderGrafico` (gráfico com id `previa`). Respostas atrasadas são ignoradas |

### `js/ajuda.js` (`Ajuda`)

Os ícones **(?)** com prévia em imagem. `CATALOGO` guarda, para cada chave (`card-kpi`, `modulo-lancamentos`, `template-fluxo-caixa`, `criar-modulo`...), um título, um texto e as imagens de `frontend/preview/`.

- `icone(chave)` devolve o HTML do ícone (um `<span role="button">`, para poder ficar dentro dos cartões da galeria, que são `<button>`). Chave sem entrada no catálogo não gera ícone.
- Passar o mouse mostra um tooltip flutuante com a primeira imagem; clicar (ou Enter/Espaço) abre o popup `#modal-dica` com o texto e todas as imagens.
- O clique é tratado na fase de captura e não propaga: clicar no (?) de um template **não** instala o template.

Os prints são gerados por `scripts/gerar-previews.js` (ver seção 8). Para um módulo novo ter (?), acrescente a entrada `modulo-<slug>` no `CATALOGO` e o slug na lista `MODULOS` do script.

### `js/util.js` (`Util`)

Formatação (`fmtMoeda`, `fmtNumero`, `fmtData`, `fmtMes`, `fmtCompacto`, `fmtValor(campo, v)`, `rotuloChave`), opções de um campo (`opcoesDe`), datas relativas (`resolverToken`), cores lidas dos tokens CSS (`cssVar`, `corSerie`) e utilidades de modal e aviso. `fmtData` não passa por `new Date()` de propósito: `new Date("2026-09-23")` é meia-noite UTC e, no Brasil, apareceria como dia 22.

### Cores

São três paletas de tokens: claro (`:root`), escuro (`[data-theme="dark"]` ou o sistema no escuro, só quando não há `data-theme`) e suave (`[data-theme="soft"]`). O suave foi conferido para texto ≥ 4,5:1 e séries dos gráficos ≥ 3:1 contra o fundo; se mexer nele, confira de novo. As séries mantêm a mesma ordem e identidade nas três paletas.


As cores dos gráficos vêm dos tokens `--series-1` a `--series-8` em `css/style.css`, com um valor para o tema claro e outro para o escuro. A cor de uma série segue a **posição da opção no schema**, nunca o ranking. Assim, "Restrita" é sempre a mesma cor, mesmo quando um filtro esconde outras categorias. Entrada/saída usam o par azul/vermelho. Da 9ª opção em diante vem o cinza, em vez de inventar uma cor nova.

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

### Rodar os testes (e a validação dupla)

```powershell
cd backend
bundle exec rake test     # Minitest + Rack::Test, banco temporário; nunca toca data/dashzon.db
```

Os testes ficam em `backend/test/` (`usuarios_test.rb`, `documento_test.rb`, `modulos_test.rb`); `test_helper.rb` aponta `DASHZON_DB_PATH` para uma pasta temporária **antes** de carregar o app e zera o banco a cada teste. Pela regra do `CLAUDE.md`, toda mudança passa duas vezes pela validação (testes + teste de ponta a ponta no navegador numa instância separada, em outra porta e com outro banco) antes do commit.

### Esqueci a senha do administrador

Se existe outro administrador, ele gera uma senha temporária para você no painel. Se você é o único: pare o servidor e crie um usuário novo direto no banco pelo Ruby do projeto:

```powershell
cd backend
bundle exec ruby -e 'require_relative "lib/usuarios"; id = Usuarios.por_login_ou_email("SEU_LOGIN")["id"]; Usuarios.definir_senha!(id, "senha-temporaria-123", deve_trocar: true)'
```

No próximo login, o sistema pede para você criar uma senha nova.

### Voltar ao "primeiro acesso"

Pare o servidor e **renomeie** (não apague, se quiser guardar os dados) o arquivo `data/dashzon.db`. Na próxima abertura, o assistente de setup aparece de novo. Antes disso, dá para salvar tudo em `GET /api/export?dados=1`.

### Testar a API sem o frontend

Depois do setup a API exige login, então o `curl` precisa guardar o cookie da sessão (`-c` grava, `-b` envia):

```bash
B=http://127.0.0.1:4567
curl -s $B/api/status
curl -s -c cj -X POST $B/api/setup -H "Content-Type: application/json" \
  -d '{"org_name":"Minha empresa","moeda":"BRL","usuario":"dono","senha":"uma-senha-forte","templates":["fluxo-caixa"],"com_exemplos":true}'
# (num banco já configurado:)
curl -s -c cj -X POST $B/api/login -H "Content-Type: application/json" -d '{"usuario":"dono","senha":"uma-senha-forte"}'
alias curl='curl -b cj'
curl -s $B/api/modulos
curl -s $B/api/modulos/movimentacoes/resumo
curl -s "$B/api/modulos/movimentacoes/registros?q=folha&f%5Bsituacao%5D=Realizado"
curl -s -X POST $B/api/modulos/movimentacoes/registros -H "Content-Type: application/json" \
  -d '{"descricao":"Venda balcão","tipo":"entrada","valor":"1.250,00","categoria":"Vendas","situacao":"Realizado"}'
```

### Publicar no domínio (DuckDNS + Caddy)

O passo a passo para o usuário está em `docs/PUBLICAR-DUCKDNS.md`. Por dentro:

- `deploy/Caddyfile`: HTTPS na porta pública com certificado pelo **desafio DNS-01 do DuckDNS** (só a 2444 fica aberta, então não dá para usar as portas 80/443), cabeçalhos de segurança e `reverse_proxy` para o DashZon em `127.0.0.1`.
- `deploy/iniciar-publico.ps1` sobe o DashZon com `DASHZON_HOST=127.0.0.1`, `DASHZON_HOSTS=<domínio>`, `DASHZON_COOKIE_SEGURO=1` e `DASHZON_URL_PUBLICA`, e depois o Caddy. Tem parâmetros de teste (`-ArquivoConfig`, `-PortaInterna`, `-Banco`, `-Caddyfile`, `-SemDuckDns`).
- **Cookie Secure por requisição:** com `DASHZON_COOKIE_SEGURO=1`, um `before` marca `secure` só quando `request.ssl?` (o Caddy manda `X-Forwarded-Proto: https`). Ligar Secure para tudo quebraria o acesso local: o Rack não grava cookie Secure numa requisição HTTP.
- Scripts `.ps1` são salvos em **UTF-8 com BOM** (o Windows PowerShell 5.1 lê arquivo sem BOM como ANSI e estraga os acentos). E chamada a programa que escreve na saída de erro (como o Caddy) precisa de `ErrorActionPreference = Continue` naquele trecho.

Para testar a publicação sem o domínio real: um `.env` de teste, uma cópia do `Caddyfile` com `tls internal` no lugar do bloco `dns duckdns`, `iniciar-publico.ps1 -PortaInterna 4600 -Banco <db de teste> -Caddyfile <cópia> -SemDuckDns`, e um navegador com `--host-resolver-rules="MAP teste.duckdns.org 127.0.0.1"`.

### Refazer os prints de prévia (?)

Quando a tela mudar, gere os prints de novo numa instância **separada** (banco próprio, dados de exemplo fictícios), para não expor nem mexer nos seus dados. O passo a passo completo está no topo de `scripts/gerar-previews.js`; em resumo: suba o backend com `DASHZON_DB_PATH` apontando para um banco temporário e `PORT=4600`, faça o setup com os 4 templates e `com_exemplos: true`, e rode `npm i --no-save puppeteer` e `node scripts/gerar-previews.js http://127.0.0.1:4600 demo demo`. Os PNG vão para `frontend/preview/`.

### Criar o seu próprio template

1. Copie um arquivo de `backend/templates/` e troque `id`, `nome` e os módulos.
2. Valide sem instalar: `POST /api/templates/validar` com `{"template": {...}}`. A resposta aponta exatamente o campo errado.
3. Para ele aparecer na galeria, salve em `backend/templates/`. Para usar uma vez só, importe pelo setup ou mande em `POST /api/templates/instalar` com `{"template": {...}}`.

### Adicionar um novo tipo de campo (exemplo: `percentual`)

1. `module_schema.rb`: inclua em `TIPOS` e, se puder ser somado, em `NUMERICOS` (ou em `DIMENSOES`/`SERIES`, se for categoria).
2. `module_schema.rb`, `coerce_valor`: diga como converter e validar o valor.
3. Frontend: em `js/util.js`, como mostrar o valor (`fmtValor`); em `js/modulos.js`, qual `<input>` usar (`inputHtml`) e como ler o valor (`coletar`).
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

Antes de começar: renomeie o `data/dashzon.db` (se existir) para abrir no assistente e deixe o terminal do servidor visível.

1. **O problema (30 s).** "Cada área controla suas coisas numa planilha diferente. O DashZon é um único painel que se adapta ao que você quer controlar."
2. **Primeiro acesso (1 min).** Mostre a pasta `data/` sem o banco. No assistente, dê um nome, crie usuário e senha, marque **Finanças pessoais** e **Fluxo de caixa** e crie. Mostre o `dashzon.db` aparecendo só agora. Clique em **Sair** e entre de novo para mostrar o login.
3. **Uso (1 min 30 s).** No dashboard de finanças, aponte receitas, despesas e saldo. Vá em **Lançamentos**, cadastre um gasto e volte: os números mudaram. Use a busca e o filtro "Pago: Não".
4. **Modularidade (1 min 30 s).** Clique em **Estrutura (JSON)**, acrescente uma categoria (por exemplo, "Pets") e salve: ela já aparece no formulário. Depois, em **+ Módulos → Importar ou criar em JSON → Começar do zero**, instale um módulo novo ao vivo.
5. **Versatilidade (1 min).** Em **Novo dashboard → A partir de um template**, escolha **Mapeamento de dados do setor** (LGPD): outro assunto, no mesmo sistema, sem código novo, e o dashboard dele já abre pronto.
6. **Dashboard (1 min).** Em **+ Card**, passe o mouse no (?) de "Linha" para mostrar a prévia em imagem, escolha um atalho e mostre a prévia com dados fictícios mudando a cada ajuste. Adicione, arraste e redimensione. Use **+ Lançar** para cadastrar um gasto sem sair do dashboard e veja os cards atualizarem. Ligue **Ocultar valores** para mostrar o modo privacidade.
7. **Arquitetura (1 min).** Mostre um template em `backend/templates/`. Ruby cuida das regras e do banco, e o C++ faz as contas. Rode o motor sozinho: `echo '{...}' | dashzon_engine.exe`.
8. **Próximos passos (30 s).** Servidor (já configurável por variáveis de ambiente), executável, orçamento × realizado, importação de CSV e publicação com HTTPS (DuckDNS + Caddy).

Perguntas que costumam aparecer:

- *Por que C++?* Busca e agregação sobre muitos registros ficam num binário rápido e sem dependências, e a API em Ruby continua simples.
- *Por que JSON no banco?* Para criar ou alterar módulos sem migração. Se um módulo virar gargalo, dá para passá-lo para uma tabela própria sem mudar o contrato da API.
- *E se eu apagar um campo usado num gráfico?* O widget é revalidado a cada leitura e responde 422 com o motivo, em vez de mostrar dados errados.
