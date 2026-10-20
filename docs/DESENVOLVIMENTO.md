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

Nada no sistema sabe o que é "gasto", "demanda" ou "fluxo de caixa". Tudo isso vem de **templates JSON**. Um template descreve **módulos** (quais campos cada cadastro tem), **resumos** (os KPIs do módulo) e **dashboards** (quais gráficos mostrar). O código só sabe lidar com *tipos de campo* genéricos: texto, texto longo, Markdown, número, moeda, data, hora, seleção, booleano e movimento.

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
| `registros` | Os dados de **todos** os módulos: `modulo_id` + **`dados`** (array JSON compacto, ver "Formato do registro em disco") + `criado_em` / `atualizado_em` como **inteiros** (epoch em segundos; `atualizado_em` fica vazio enquanto o registro nunca foi editado) |
| `dashboards` | Nome de cada dashboard |
| `widgets` | Cada cartão do dashboard: título, tipo (kpi/bar/line/table), `modulo_slug`, **`config`** (JSON: o que medir e como agrupar) e posição x/y/w/h |
| `usuarios` | Contas: `login`, `senha_hash` + `sal`, nome, e-mail (+ `email_verificado_em`), `documento_tipo` / `documento_hash` / `documento_mascara`, cargo, `perfil` (`admin`/`usuario`), `ativo`, `deve_trocar_senha`, `sessao_versao`, último login |
| `tokens` | Links de uso único (`redefinir_senha` 24 h, `verificar_email` 7 dias): só o `token_hash`, com validade e data de uso |
| `ajustes` | Regras do painel do adm (chave/valor): `exigir_documento`, `exigir_email`, `exigir_email_verificado` |
| `jsons` | JSON do usuário: `tipo` `template` (importados, aparecem na galeria) ou `exportacao` (cada backup baixado), com `nome` e `conteudo` (**comprimido com zlib**, num BLOB; ver "JSON do usuário comprimido") |

`usuarios`, `tokens`, `ajustes` e `jsons` ficam fora do `SCHEMA` principal (`EXTRAS_SQL`) e são criadas sob demanda por `garantir_tabelas!`, então um banco existente as ganha sem mudar o `user_version`. As colunas novas de `usuarios` entram por `migrar_usuarios!` (compara com `PRAGMA table_info` e faz `ALTER TABLE`); num banco que já tinha usuários mas nenhum administrador, o primeiro vira administrador.

**Onde fica cada JSON:** os templates padrão são arquivos em `backend/templates/` e vão para o git. Tudo o que o usuário traz ou gera (templates importados, exportações) vai para a tabela `jsons` do banco, que já fica fora do git. O `.gitignore` também ignora qualquer outro `.json` solto no projeto; um template colocado em `backend/templates/` continua aparecendo na galeria localmente, mas não é versionado.

Por que JSON dentro do SQLite? Porque criar ou alterar um módulo não exige migração de banco. A versão do schema fica em `PRAGMA user_version` (hoje `3`).

### Formato do registro em disco

Um objeto JSON por registro repetia o nome de todos os campos em todas as linhas. Por isso cada módulo guarda em `schema.slots` o mapa `id do campo -> posição`, e o registro é um **array JSON posicional** (módulo `RecordCodec`, `lib/record_codec.rb`), com os tipos encurtados:

| Tipo | Como é gravado |
|---|---|
| `data` | dias desde 1970-01-01 (`20412` = 2025-11-20) |
| `hora` | minutos desde 00:00 (`510` = 08:30) |
| `booleano` | `1` / `0` |
| `movimento` | `0` = entrada, `1` = saída |
| `numero`, `moeda` | número; inteiro quando não tem casas decimais |
| `texto`, `texto_longo`, `selecao` | o próprio texto |

```
antes   {"descricao":"Aluguel","tipo":"saida","valor":1450.0,"data":"2025-11-20","pago":true}
depois  ["Aluguel",1,1450,20412,1]
```

Campos vazios no fim do array são omitidos. Os `slots` **só crescem**: um campo removido continua reservando a posição dele (se voltar com o mesmo `id`, recupera os dados), e um campo novo ganha a próxima posição livre. Por isso dá para reordenar, remover e adicionar campos no editor "Estrutura (JSON)" sem corromper os registros antigos. **Trocar o tipo** de um campo que já existe converte os valores gravados no mesmo `PUT /api/modulos/:slug` (`Database.reconverter_registros!`); o que não converte vira vazio. Os `slots` são detalhe interno: não vão para a exportação e são ignorados em templates importados.

Um registro "achatado", no formato que a API e o C++ usam (o `RecordCodec` desfaz o formato compacto ao ler; as datas voltam em texto ISO como sempre), fica assim:

```json
{ "id": 7, "descricao": "Aluguel", "tipo": "saida", "valor": 1450, "categoria": "Moradia",
  "data": "2026-09-20", "pago": true, "_criado_em": "2026-09-20T12:00:00Z", "_atualizado_em": "2026-09-20T12:00:00Z" }
```

### JSON do usuário comprimido

Cada "Backup com dados (JSON)" guarda uma cópia completa dos registros na tabela `jsons`, em JSON verboso. Sem compressão, cada exportação ocupava no banco tanto quanto todos os dados juntos. Por isso `conteudo` é gravado **comprimido com zlib**, num BLOB (módulo `JsonGuardado`, `lib/json_guardado.rb`; JSON comprime cerca de 10 vezes). Não muda o schema: a coluna continua `TEXT`, e o SQLite guarda o BLOB como está.

- `Database.salvar_json!`, `json_salvo`, `jsons` e `excluir_json!` são o único caminho: comprimem ao gravar e descomprimem ao ler. A API (`/api/exportacoes`, galeria de templates) não muda; o `bytes` da lista passa a ser o tamanho realmente ocupado no banco.
- Linhas antigas em texto puro continuam legíveis: `JsonGuardado.decodificar` aceita os dois formatos (um JSON em texto começa por `{` ou `[`; um fluxo zlib sempre começa por `0x78`, então não se confundem). A migração v2 para v3 comprime as que já existem, dentro da mesma transação e coberta pela mesma cópia de segurança.
- A deduplicação de templates importados compara o texto **descomprimido**, não o BLOB, para não depender de o zlib produzir a mesma saída em versões diferentes.

### Migração do banco da versão 2 para a 3

Um banco criado antes desta mudança (versão 2: registros em objeto JSON e datas em texto) é convertido **no lugar**, sem arquivar e sem perder dados, por `lib/migracao.rb`. Acontece sozinho na partida do servidor (`app.rb` chama `Database.configured?` logo após carregar), antes de aceitar requisições:

1. Grava uma cópia consistente do banco antigo ao lado (`dashzon.db.v2-AAAAMMDDHHMMSS.bak`, via `VACUUM INTO`). Se não conseguir gravar a cópia, não migra.
2. Numa **única transação**: calcula os `slots` de cada módulo (chaves de campos já removidos, mas ainda com valores, também ganham slot), reescreve `registros` (ids preservados), cria o índice `idx_widgets_dashboard` e comprime as exportações e templates antigos da tabela `jsons` (o texto descomprimido é idêntico ao original). Qualquer erro desfaz tudo.
3. Fora da transação: liga o `auto_vacuum` incremental e roda `VACUUM`, para o arquivo já ficar enxuto.

O que o validador antigo aceitava mas não existe (uma data como `2026-13-45`, um texto num campo numérico) vira vazio e é contado no aviso do log; o valor original fica na cópia de segurança. Se a migração **falhar**, o servidor sobe mesmo assim e toda requisição responde erro 500 com a causa e o caminho da cópia: ela **não** é tratada como "sistema não configurado" (isso levaria ao setup, que arquivaria o banco do usuário). A falha é memorizada no processo (não tenta de novo a cada requisição, o que gravaria uma cópia a cada tentativa) até o servidor ser reiniciado. Banco de versão anterior à 2 continua sendo arquivado como `.bak` pelo setup, como antes.

Os arquivos `dashzon.db.v2-*.bak` ficam na pasta do banco (no Docker, no volume `dados`) até você apagá-los. Confira que tudo está certo e remova quando quiser liberar o espaço.

**Voltar atrás depois de migrar:** o código antigo não lê o formato v3. Pare o servidor, restaure a cópia `dashzon.db.v2-*.bak` sobre o `dashzon.db` (renomeando-a) e volte o código à versão anterior; o que foi lançado depois da migração não está na cópia. Se a migração **falhou** nada precisa ser restaurado: o banco continua exatamente como estava, na versão 2.

**Outras convenções do banco (v3):** índice em `widgets(dashboard_id)`; `auto_vacuum` incremental (`Database.compactar!` devolve ao disco o espaço de um módulo excluído); ajustes de velocidade na conexão (`temp_store`, `cache_size`, `mmap_size`). O modo **WAL continua desligado** (o backup copia só o `dashzon.db`). As outras tabelas (`dashboards`, `usuarios`...) mantêm as datas em texto.

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
- `padrao` é o valor inicial. Em campos de data, aceita `"$hoje"`, `"$hoje-30"` e `"$hoje+7"`. Um padrão inválido (ex.: opção que não existe) é recusado ao salvar a estrutura.
- `ordenacao` (opcional) é a ordem da lista na tela do módulo, com até 3 critérios: `[{ "campo": "data", "direcao": "asc" }, { "campo": "hora" }]` (`direcao` padrão `asc`; vazios ficam por último). Sem ela, a lista vai do mais novo para o mais antigo. Não muda cards nem resumos.
- `seed` são os dados de exemplo, instalados só se o usuário marcar essa opção.
- Campos `booleano` aparecem na tabela do módulo como **caixas de marcar** (checklist): o clique grava só aquele campo (`PATCH`).
- `visao` (opcional) troca a tabela por outra tela. Hoje existe `{"tipo": "notas", "titulo": "titulo", "conteudo": "conteudo", "pasta": "pasta"}`: o módulo vira um caderno de notas em Markdown (veja o template `anotacoes.json`).
- `nota` (opcional), por exemplo `{"modulo": "anotacoes", "titulo": "assunto", "pasta": "materia"}`: cada registro ganha o botão **Nota**, que abre (ou cria) no módulo de notas a nota cujo título é o valor do campo `titulo`.
- `configuracoes` (opcional), por exemplo `["materia", "atividade", "duracao"]`: esses campos aparecem em **Configurações → Módulos** (opções de seleção e valores padrão), só enquanto o módulo está ligado.

### Tipos de campo

| Tipo | Guarda | Pode agrupar? | Pode virar série? | Pode somar? |
|---|---|---|---|---|
| `texto` | até 500 caracteres | sim | não | não |
| `texto_longo` | até 5000 caracteres | não | não | não |
| `numero` | número (aceita `1.234,56`) | não | não | **sim** |
| `moeda` | número com 2 casas | não | não | **sim** |
| `data` | `AAAA-MM-DD` | sim (por mês) | não | não |
| `hora` | `HH:MM` (aceita `8:05` e `08:05:00`) | não | não | não |
| `markdown` | texto em Markdown, até 100 mil caracteres (formatado na visão de notas) | não | não | não |
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
| `connection` | Abre **uma** conexão SQLite para o processo todo, com `foreign_keys` ligado e ajustes de velocidade (sem WAL) |
| `LOCK` (Monitor) | Serializa o acesso. O WEBrick usa uma thread por requisição, e conexões por thread travariam o arquivo no Windows |
| `rows` / `row` | SELECT devolvendo hashes (remove as chaves numéricas duplicadas que o driver cria) |
| `execute` / `insert` / `alterar` | Escrita. `insert` devolve o id novo de forma atômica; `alterar` devolve quantas linhas foram afetadas (0 = não achou) |
| `transaction { }` | Ou tudo ou nada (usado na instalação de templates). É **reentrante**: dentro de outra transação, reaproveita a de fora |
| `configured?` | O arquivo existe, o banco está na versão atual (migrando-o antes, se for a 2) e há linha em `config` |
| `migrar_se_preciso!` | Roda `Migracao.se_preciso!` uma vez por processo; memoriza uma falha para não repetir a cada requisição |
| `arquivar_versao_antiga!` | Renomeia um banco de schema antigo (anterior à versão 2) para `.bak` (nunca apaga) |
| `create_schema!` | Cria as tabelas (já com `auto_vacuum` incremental) e grava a `config` |
| `compactar!` | `PRAGMA incremental_vacuum`: devolve ao disco o espaço livre (chamado ao excluir um módulo) |
| `garantir_tabelas!` | Cria `usuarios`, `tokens`, `ajustes` e `jsons` se ainda não existirem e roda `migrar_usuarios!` (uma vez por conexão) |
| `atualizar_config!` | Nome da organização (opcional) e moeda |
| `salvar_json!(tipo, nome, obj)` | Guarda um JSON **comprimido**; um template idêntico a um já salvo (comparando o texto descomprimido) não é duplicado |
| `jsons(tipo)` / `json_salvo(id)` / `excluir_json!` | Lista (sem o conteúdo, com o `bytes` ocupado), lê (descomprimindo, aceita também texto antigo) e remove JSON guardados |
| `modulos` / `modulo(slug)` | Lista ou busca módulos, já com o `schema` convertido de JSON |
| `modulo_por_nome(nome, exceto_id:)` | Acha um módulo pelo nome, sem diferenciar maiúsculas (comparado em Ruby para tratar acentos). Base da regra "nome de módulo é único" |
| `registros(modulo, campos: nil, meta: true)` | Registros "achatados" (ver seção 3), do mais novo ao mais antigo. `campos` lê só esses campos e `meta: false` tira os carimbos de data: é o que resumos e cards usam para mandar ao motor só o que a consulta lê (mesmo resultado, menos dados) |
| `registro` / `inserir_registro` / `atualizar_registro` / `remover_registro` | CRUD de um registro; empacotam e desempacotam pelo `RecordCodec` |
| `reconverter_registros!(modulo_id, antigo, novo)` | Converte os valores gravados quando a edição do módulo troca o tipo de um campo existente |

### `backend/lib/record_codec.rb` (módulo `RecordCodec`)

| Função | O que faz |
|---|---|
| `plano(schema, somente = nil)` | Lista `[id, slot, tipo]` dos campos (ou só dos pedidos em `somente`), calculada uma vez por leitura |
| `pack(schema, dados)` / `unpack(plano, json)` | Registro `{id => valor}` para o array JSON posicional que vai ao banco, e o caminho de volta com os valores originais |
| `encode` / `decode` | Conversão por tipo (data em dias, booleano e movimento em 0/1, inteiro quando possível). O `decode` nunca levanta erro |
| `converter_tipos(json, mudancas)` | Reescreve só os slots cujo tipo mudou (usado por `reconverter_registros!`) |

### `backend/lib/json_guardado.rb` (módulo `JsonGuardado`)

| Função | O que faz |
|---|---|
| `codificar(obj)` / `comprimir_texto(texto)` | Objeto Ruby (ou texto JSON pronto) para o BLOB zlib que vai ao banco |
| `decodificar(valor)` / `texto(valor)` | O caminho de volta: aceita o BLOB comprimido e também texto antigo, e devolve o objeto (ou o texto JSON) |
| `comprimido?(valor)` | Reconhece um fluxo zlib pelo primeiro byte (`0x78`) |

### `backend/lib/migracao.rb` (módulo `Migracao`)

| Função | O que faz |
|---|---|
| `se_preciso!(db, caminho)` | Se o banco é da versão 2: cópia de segurança, conversão numa transação e `VACUUM`. Devolve nil se não havia o que migrar, ou o resumo (registros, módulos, valores descartados, tamanhos, caminho da cópia). Qualquer erro vira `Migracao::Falha` |
| `copia_de_seguranca!` | `VACUUM INTO` (ou cópia do arquivo, em SQLite sem esse comando). Sem cópia, não migra |
| `converter!` | Calcula os slots, reescreve `registros` (ids preservados, datas em epoch), cria o índice dos widgets e comprime os JSON antigos (`comprimir_jsons!`) |

### `backend/lib/module_schema.rb` (módulo `ModuleSchema`)

É a **porta de entrada de todo JSON**: templates, editor e API passam por aqui. Qualquer erro vira `ModuleSchema::Error`, e o `app.rb` transforma isso em resposta **422** com a mensagem em português.

| Função | O que faz |
|---|---|
| `normalize_modulo!(defn, anterior = nil)` | Valida slug, nome e campos; define o `rotulo`; valida o `resumo`; atribui os `slots` (na edição, `anterior` é o schema gravado, para manter as posições) |
| `schema_de(modulo)` | A parte do módulo que vai para a coluna `modulos.schema` |
| `campos_usados(queries)` | Ids dos campos que as consultas do motor realmente leem (só decide quais campos mandar; a consulta não muda) |
| `normalize_campo!` | Valida id/tipo, exige `opcoes` em seleção e fixa `entrada`/`saida` em movimento |
| `normalize_consulta!` | Regras comuns a resumo e widget (tabela "Consulta" da seção 4) |
| `normalize_widget!(w, schema)` | Valida título/tipo e a consulta; KPI e tabela não têm série |
| `engine_query(schema, cfg)` | Traduz a consulta para o motor C++. `saldo` vira `sign_field` + `negative_values: ["saida"]` |
| `coerce_registro!(schema, dados)` | Valida e converte os valores de um registro, aplica `padrao` e descarta chaves desconhecidas |
| `coerce_valor` | Conversão por tipo (número finito, data que exista no calendário, opção válida...) |
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
| `GET /api/modulos/:slug/registros?q=texto&f[campo]=valor&inicio=0&limite=200` | Lista com busca e filtros (C++ `search`), na `ordenacao` do módulo, paginada (`limite` até 1000; `count` = total encontrado) |
| `GET /api/modulos/:slug/registros/:id` | Um registro, lido direto do banco (base do formulário de edição) |
| `PATCH /api/modulos/:slug/registros/:id` | Altera só os campos enviados (o checklist usa para marcar sim/não) |
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

`frontend/` é uma SPA sem etapa de build: HTML, CSS e JS puros, com Chart.js e GridStack guardados em `frontend/vendor/` para funcionar offline. Cada arquivo JS é um módulo com escopo próprio (`const X = (() => { ... return {...} })()`), carregado nesta ordem pelo `index.html`: `util` → `ajuda` → `tema` → `fonte` → `api` → `setup` → `login` → `conta` → `admin` → `modulos` → `dashboards` → `responsivo` → `app`.

### Celular e telas pequenas

Faixas do CSS (bloco "Responsividade", no fim do `style.css`, para ter precedência sobre as regras-base):

| Largura | O que muda |
|---|---|
| até 820px ou tela de toque | Alvos de toque de 36 a 44px (botões, itens de menu, ícones; o (?) tem 36px de área com o círculo pequeno); campos com 16px (abaixo disso o iPhone dá zoom ao tocar) |
| até 800px | O menu lateral vira uma barra fixa no topo (marca, tema e botão de menu) e uma **gaveta** que abre por baixo dela (`app.js`, `ligarMenuMovel`: fecha ao navegar, ao escolher um item e com Esc; `aria-expanded` no botão) |
| até 640px | Dashboard empilhado (abaixo); KPIs do módulo dois por linha; modais em **tela cheia** com o rodapé de botões fixo; setup e login com menos moldura |
| abaixo de 360px | KPIs do dashboard um por linha |

- **Dashboard no celular** (`js/responsivo.js` + CSS): em vez da grade de 12 colunas espremida, os cards empilham em ordem de leitura (`order = y*12 + x`), com os de até 3 colunas (KPIs) dois por linha e a altura vinda do `gs-h`. O script **só lê** os atributos `gs-x/gs-y/gs-w/gs-h` que o GridStack já põe nos cards; não chama o GridStack e não grava nada (REGRA). Arrastar e redimensionar ficam desligados nessa faixa, porque no toque gravariam posições da tela pequena por cima do layout real. O teste de ponta a ponta confere que o layout salvo fica idêntico depois de usar a versão de celular.
- **Valores dos KPIs** (`.widget-kpi`, `.kpi .value`) se ajustam à largura do próprio card com *container queries* (`clamp(...cqi...)`), em vez de vazar.
- **Ferramentas do card:** com mouse, aparecem ao passar sobre o card e não ocupam espaço (o título usa a largura toda); no toque ficam sempre visíveis e, em card estreito (até 280px), vão para uma linha própria acima do título.
- **"×" nos modais:** `app.js` (`botoesFecharModais`) põe um botão de fechar, preso no topo ao rolar, em todo modal sem `data-fixo`.
- **Auditoria:** `scripts/auditar-responsivo.ps1` (ver seção 8).

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

As abas Conta, Aparência e Segurança da página de Configurações (nome, e-mail com situação de confirmação, CPF/CNPJ, preferências e troca de senha; `abrir()` preenche tudo e devolve a conta), `trocaObrigatoria(usuario)` (modal que não fecha até a pessoa criar a senha própria, depois de uma senha temporária) e `paginaLink()`, que trata `#/redefinir/<token>` e `#/verificar-email/<token>` e depois tira o token da barra de endereço.

### `js/tema.js` (`Tema`)

Botão de tema (`.tema-btn`: na barra lateral e, antes do login, flutuando no canto) com ciclo de três: sol = claro (`data-theme="light"`) → pôr do sol = **suave** (`"soft"`: sol sobre fundo alaranjado e lua com brilho clarinho) → lua = escuro (`"dark"`). A troca gira o botão e cruza os ícones (CSS; desliga com "reduzir movimento"). `aplicar(tema)` põe `data-theme` no `<html>` (ou tira, para seguir o sistema), guarda no navegador (`dashzon.tema`) e dispara o evento `dashzon:tema`, que o dashboard usa para **redesenhar** os gráficos com as mesmas funções (a regra dos gráficos não muda). Um script no `<head>` aplica o tema salvo antes de desenhar a página, sem piscar. Com alguém logado, o botão também salva na conta (`Conta.salvarTema`), e ao entrar vale o tema da conta.

### `js/fonte.js` (`Fonte`)

Fonte da interface, escolhida em **Configurações → Aparência → Fonte**:

| Opção | Fonte |
|---|---|
| `inter` (padrão) | Inter |
| `sistema` | a do sistema (Segoe UI no Windows) |
| `nunito` | Nunito, arredondada |
| `atkinson` | Atkinson Hyperlegible, feita para leitura fácil |

- Os arquivos `.woff2` ficam em `vendor/fonts/` (offline, só o subconjunto latino, licença OFL ao lado). O `@font-face` está no topo do `style.css`.
- `aplicar(fonte)`:
  - põe `data-fonte` no `<html>` (o CSS troca `--font-sans`);
  - guarda no navegador (`dashzon.fonte`; o script do `<head>` aplica antes de desenhar);
  - ajusta `Chart.defaults.font.family`, porque os gráficos são `<canvas>` e não herdam o CSS, e redesenha os gráficos quando o arquivo da fonte termina de carregar.
- Ao entrar vale a fonte da conta (`preferencias.fonte`).
- Fonte nova: o arquivo em `vendor/fonts/` (com a versão no nome), o `@font-face`, a regra `:root[data-fonte="x"]` e a `.amostra-fonte[data-fonte="x"]` no CSS, a entrada em `Fonte.FONTES` e em `Usuarios::FONTES`. O teste `test_cada_fonte_tem_arquivo_e_regra_no_css` confere que nada ficou faltando.

### `js/config.js` (`Config`)

Página de Configurações (`#/config/<aba>`).

- `abrir(aba)` mostra a aba e preenche os formulários pelo `Conta.abrir()`.
- Na aba **Módulos**:
  - cada módulo tem um interruptor; desligar grava `preferencias.modulos_ocultos` e o `App` tira o módulo do menu (`App.modulosVisiveis`);
  - com o módulo ligado e `configuracoes` declaradas, aparece um formulário gerado pelo tipo de cada campo (seleção: opções uma por linha e qual já vem marcada; número, hora, data e sim/não: o padrão). Salvar faz `PUT /api/modulos/:slug` com o schema inteiro;
  - "Adicionar módulos" lista os templates com módulo ainda não instalado e instala com `POST /api/templates/instalar`.

### `js/markdown.js` (`Markdown`)

`render(texto, {existeNota})` devolve HTML **seguro**: escapa tudo antes de aplicar a marcação, então nenhum HTML da nota é interpretado, e links só aceitam `http(s)`, `mailto` ou endereço relativo. Também tem `alternarTarefa(texto, linha)`, `tags(texto)` e `links(texto)`, usados pela tela de notas.

### `js/notas.js` (`Notas`)

Tela dos módulos com `visao: notas`.

| Função | O que faz |
|---|---|
| `abrir(slug, id, jaNaTela)` | Carrega as notas (até 1000) ao entrar na tela; navegar entre notas do mesmo caderno não recarrega |
| `renderLista` | Árvore por pasta (`A/B` = subpasta; pastas fechadas lembradas no navegador), tags com contagem, busca sem acento |
| `agendar` / `gravarAgora` | Gravação automática (`PATCH` só dos campos mudados, 700 ms depois da última tecla; `Ctrl+S` grava na hora; o `App` grava antes de trocar de tela) |
| `abrirLink` | `[[título]]`: abre a nota ou, se não existir, cria na mesma pasta |
| `importar` / `baixarTudo` | `.md` soltos ou uma pasta (cofre do Obsidian; mesmo título na mesma pasta é atualizado) e `.zip` de todas, com as pastas |
| `abrirOuCriar(slug, titulo, pasta)` | Botão "Nota" de outro módulo (declaração `nota`) |

### `js/admin.js` (`Admin`)

O Painel do adm (`#/admin`, link no canto inferior esquerdo, só para administradores): regras de cadastro, organização, lista de usuários com "Editar" e o menu "Mais…" (senha temporária, link de redefinição, confirmar e-mail, enviar confirmação, desativar/reativar, excluir). Senha temporária e link aparecem **uma única vez** no `#modal-segredo`, com botão de copiar.

A seção **Segurança** (`carregarSeguranca`, `GET /api/admin/seguranca`) mostra a checagem da instalação, os bloqueios em vigor (com "Desbloquear") e os últimos 100 eventos do diário.

### `backend/lib/seguranca.rb` (módulo `Seguranca`)

| Função | O que faz |
|---|---|
| `registrar!(tipo, ip:, login:, usuario_id:, detalhe:)` | Grava um evento no diário (`eventos_seguranca`). O login vira HMAC (`conta`) |
| `falhou!(tipo, ...)` | Registra uma falha e, se ela fechou um bloqueio, registra também o `bloqueio` |
| `bloqueio(ip:, login:)` | `:ip`, `:conta` ou `nil`, contando as falhas da janela de 15 min desde o último `login_ok`/`desbloqueio` |
| `desbloquear!`, `bloqueios_ativos`, `eventos` | Painel do adm |
| `motivo_senha_fraca(senha, login)` | `nil` ou o motivo (comum, sequência, repetida, igual ao login). Usado por `Usuarios.validar_senha!` |
| `Protecao` (middleware) | Cabeçalhos (CSP...), recusa escrita de outro `Origin` e limita requisições por IP (`Protecao.limite`) |

Nas rotas, use `barrar_se_muitas_tentativas!(login)` antes de conferir uma senha ou token, `falhou!(tipo, login:)` quando falhar e `diario!(tipo)` para eventos de auditoria. Um tipo de falha novo entra em `FALHAS_IP` e/ou `FALHAS_CONTA`. Toda tela nova precisa caber na CSP: nada de `<script>` inline, `onclick=` ou `eval`.

### `js/modulos.js` (`Modulos`)

| Função | O que faz |
|---|---|
| `abrir(slug)` | Carrega o módulo e desenha resumo, filtros e tabela |
| `renderFiltros` | Um `<select>` para até 4 campos de movimento, sim/não ou seleção |
| `carregarRegistros(mais)` | Busca a lista em páginas de 200 (`inicio`/`limite`); "Carregar mais" acrescenta a próxima. Respostas fora de ordem são descartadas |
| `renderTabela` / `celula` | Colunas = campos com `lista` diferente de `false` (até 7), formatadas pelo tipo. Sim/não vira caixa de marcar |
| `marcar` | Checklist: `PATCH` só do campo sim/não clicado; atualiza o resumo e desfaz a marcação se der erro |
| `inputHtml` | **Onde cada tipo de campo vira um input** (checkbox, date, number, select...) |
| `coletar` | Lê o formulário e converte números e booleanos antes de enviar |
| `abrirEstrutura` / `salvarEstrutura` | Editor JSON do módulo (`PUT /api/modulos/:slug`) |
| `abrirAdicionar` / `comoTemplate` / `instalar` | Galeria e importação. Um módulo solto é embrulhado num template antes de validar e instalar |
| `abrirFormulario(registro, modulo, depois)` | Formulário de registro de qualquer módulo; `depois` roda após salvar (na tela do módulo, recarrega a tabela). "Editar" lê o registro de `GET /registros/:id` (do banco), não da lista |
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

Os testes ficam em `backend/test/` (`usuarios_test.rb`, `documento_test.rb`, `modulos_test.rb`, `desempenho_test.rb`, e os do banco: `registro_codec_test.rb`, `registros_compactos_test.rb`, `json_guardado_test.rb` e `migracao_test.rb`, que monta um banco v2 de verdade, migra e confere dados, cópia de segurança e os caminhos de falha); `test_helper.rb` aponta `DASHZON_DB_PATH` para uma pasta temporária **antes** de carregar o app e zera o banco a cada teste. Pela regra do `CLAUDE.md`, toda mudança passa duas vezes pela validação (testes + teste de ponta a ponta no navegador numa instância separada, em outra porta e com outro banco) antes do commit.

### Testar a responsividade (mudou algo na interface)

A auditoria abre o Edge sem janela, passa por 7 tamanhos de tela (320, 360, 390, 768, 1024, 1366 e 1920px) e por setup, login, dashboard, módulo, admin, menu do celular e os modais, grava um print de cada combinação em `log\responsivo\<data>\` e mede:

- **erros:** rolagem horizontal, elemento fora da tela, alvo de toque menor que 24px, texto maior que a caixa, modal que não cabe, card do dashboard com menos de 150px e botões sobrepostos;
- **avisos:** alvo de toque menor que 36px, campo com fonte menor que 16px (zoom no iPhone) e texto menor que 11px.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1 -Porta 4570 -Banco data\teste-responsivo.db   # instância separada e zerada
powershell -ExecutionPolicy Bypass -File scripts\auditar-responsivo.ps1 -Porta 4570                     # -Telas dashboard,modulo para só algumas
powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1 -Porta 4570 -Parar                           # depois apague data\teste-responsivo.db
```

Corrija, suba a instância zerada de novo e repita até sair **0 erros** (o script sai com código 1 enquanto houver erro); depois olhe os prints, porque a medição não pega tudo (ex.: um título cortado com reticências é "válido" para ela). Ele se recusa a rodar numa instância já configurada, já que faz o setup com dados de exemplo.

### Esqueci a senha do administrador

Se existe outro administrador, ele gera uma senha temporária para você no painel. Se você é o único: pare o servidor e crie um usuário novo direto no banco pelo Ruby do projeto:

```powershell
cd backend
bundle exec ruby -e 'require_relative "lib/usuarios"; id = Usuarios.por_login_ou_email("SEU_LOGIN")["id"]; Usuarios.definir_senha!(id, "senha-temporaria-123", deve_trocar: true)'
```

No próximo login, o sistema pede para você criar uma senha nova.

Com Docker, o mesmo comando roda dentro do container (sem parar o servidor):

```bash
docker compose exec dashzon bundle exec ruby -e 'require_relative "lib/usuarios"; id = Usuarios.por_login_ou_email("SEU_LOGIN")["id"]; Usuarios.definir_senha!(id, "senha-temporaria-123", deve_trocar: true)'
```

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

### Velocidade

- **Cache de resultados** (`lib/desempenho.rb`, `CacheResultados`): cards, resumos, buscas e a prévia guardam a resposta do motor C++. A chave leva módulo, schema e consulta; a validade é `Database.versao_dados` (`PRAGMA data_version` + `total_changes` + geração da conexão), que muda a cada gravação, inclusive de outro processo. Mudou o banco, o cache inteiro some. Os testes em `test/desempenho_test.rb` cobrem incluir, editar, excluir, duas gravações no mesmo segundo e gravação por outro processo.
- **gzip** (`Rack::Deflater`) em tudo e **cache de estáticos** (`CacheEstaticos`): `vendor/` e `preview/` por 1 dia; o resto com `no-cache` (o navegador revalida e recebe 304).
- **Puma** fora do Windows (no Docker); no Windows fica o WEBrick.
- **Banco compacto** (schema v3): registros em array posicional com datas em dias e datas de criação em inteiros, índice nos widgets, `auto_vacuum` incremental e cache de páginas maior. Com 50 mil lançamentos, o arquivo foi de 10,5 MB para 4,3 MB (e de 19,7 MB para 8,6 MB com 100 mil, migrando um banco real). O WAL segue desligado de propósito.
- **Resumos e cards leem só o que usam:** `Database.registros(m, campos:, meta: false)` manda ao motor C++ apenas os campos da consulta (a conta e o resultado são os mesmos; num card de soma por mês com 50 mil registros, de 11,4 MB para 6,0 MB enviados e de 1,37 s para 0,82 s sem cache).
- Medido na instância de teste: transferência ao abrir de 375 KB para 116 KB; 8 cards em paralelo de ~90–150 ms para ~50 ms no Windows e ~30 ms no Docker.

### Docker

`Dockerfile` em três etapas: `build` (compila o motor com CMake e instala as gems sem as de teste em `/usr/local/bundle`), `teste` (roda `rake test`: `docker build --target teste .`) e `final` (imagem enxuta, usuário sem root `dashzon`, volume `/dados` com banco e `segredo.key`, healthcheck em `/api/status`). O `docker-compose.yml` tem `name: dashzon` (volume `dashzon_dashzon-dados`), porta só em `127.0.0.1` e o perfil `https` com o Caddy (`deploy/Caddyfile.servidor`). O Compose passa variáveis opcionais vazias, por isso todo acesso a variável de ambiente é por `Ambiente["NOME", padrão]` (`lib/ambiente.rb`).

### Publicar no domínio (DuckDNS + Caddy)

O passo a passo para o usuário está em `docs/PUBLICAR-DUCKDNS.md`. Por dentro:

- `deploy/Caddyfile`: HTTPS na porta pública com certificado pelo **desafio DNS-01 do DuckDNS** (só a 2444 fica aberta, então não dá para usar as portas 80/443), cabeçalhos de segurança e `reverse_proxy` para o DashZon em `127.0.0.1`.
- `deploy/iniciar-publico.ps1` sobe o DashZon com `DASHZON_HOST=127.0.0.1`, `DASHZON_HOSTS=<domínio>`, `DASHZON_COOKIE_SEGURO=1` e `DASHZON_URL_PUBLICA`, e depois o Caddy. Tem parâmetros de teste (`-ArquivoConfig`, `-PortaInterna`, `-Banco`, `-Caddyfile`, `-SemDuckDns`).
- **Cookie Secure por requisição:** com `DASHZON_COOKIE_SEGURO=1`, um `before` marca `secure` só quando `request.ssl?` (o Caddy manda `X-Forwarded-Proto: https`). Ligar Secure para tudo quebraria o acesso local: o Rack não grava cookie Secure numa requisição HTTP.
- Scripts `.ps1` são salvos em **UTF-8 com BOM** (o Windows PowerShell 5.1 lê arquivo sem BOM como ANSI e estraga os acentos). E chamada a programa que escreve na saída de erro (como o Caddy) precisa de `ErrorActionPreference = Continue` naquele trecho.

Para testar a publicação sem o domínio real: um `.env` de teste, uma cópia do `Caddyfile` com `tls internal` no lugar do bloco `dns duckdns`, `iniciar-publico.ps1 -PortaInterna 4600 -Banco <db de teste> -Caddyfile <cópia> -SemDuckDns`, e um navegador com `--host-resolver-rules="MAP teste.duckdns.org 127.0.0.1"`.

### Refazer os prints de prévia (?)

Quando a tela mudar, gere os prints de novo numa instância **separada** (banco próprio, dados de exemplo fictícios), para não expor nem mexer nos seus dados. O passo a passo completo está no topo de `scripts/gerar-previews.js`; em resumo: suba o backend com `DASHZON_DB_PATH` apontando para um banco temporário e `PORT=4600`, faça o setup com os 6 templates e `com_exemplos: true`, e rode `npm i --no-save puppeteer` e `node scripts/gerar-previews.js http://127.0.0.1:4600 demo demo`. Os PNG vão para `frontend/preview/`.

### Criar o seu próprio template

1. Copie um arquivo de `backend/templates/` e troque `id`, `nome` e os módulos.
2. Valide sem instalar: `POST /api/templates/validar` com `{"template": {...}}`. A resposta aponta exatamente o campo errado.
3. Para ele aparecer na galeria, salve em `backend/templates/` **e** libere o arquivo no `.gitignore` (lá só os templates padrão escapam do `*.json`). Para usar uma vez só, importe pelo setup ou mande em `POST /api/templates/instalar` com `{"template": {...}}`.

### Importar uma planilha (Excel ou CSV) com Python

`scripts/importar_planilha.py` lê um `.xlsx` ou `.csv` e grava cada linha como um registro de um módulo, **pela API** (mesma validação da tela; o banco não é tocado diretamente). Só usa a biblioteca padrão do Python 3.8+: não precisa de `pip install`.

```powershell
winget install Python.Python.3.12                     # se ainda não tiver Python (abra um terminal novo depois)
$env:DASHZON_SENHA = "sua-senha"                      # ou deixe sem, e ele pergunta
python scripts\importar_planilha.py exemplos\cronograma-estudos.xlsx --modulo cronograma_estudos --usuario SEU_LOGIN --simular
python scripts\importar_planilha.py exemplos\cronograma-estudos.xlsx --modulo cronograma_estudos --usuario SEU_LOGIN
```

- **Cabeçalho:** a primeira linha (ou `--linha-cabecalho N`). Cada coluna casa com um campo pelo **nome ou id**, sem diferenciar maiúsculas, acentos e espaços ("Duração (horas)", "duracao", "DURACAO (HORAS)"). Colunas sem campo são ignoradas com aviso; faltar uma obrigatória sem `padrao` é erro antes de enviar.
- **Conversão pelo tipo do campo:**
  - data: célula de data do Excel, `DD/MM/AAAA` ou `AAAA-MM-DD`;
  - hora: célula de hora, `8:05`, `19h30`;
  - sim/não: `Sim`/`Não`, `x`, `✓`, `verdadeiro`, `1`/`0`;
  - número: `1,5`, `R$ 1.234,56`;
  - seleção: sem diferenciar acento ou maiúsculas, e vira a opção exata.
- **Erros:** a linha com problema é pulada e aparece no fim com o número da linha do arquivo e o motivo; as outras são gravadas. Código de saída: 0 tudo certo, 1 alguma linha recusada, 2 erro de arquivo, login ou módulo.
- **Opções:** `--url` (padrão `http://127.0.0.1:4567`), `--aba` (nome ou número da aba do .xlsx), `--simular` (só confere e mostra as primeiras linhas convertidas).
- **Limites:** `.xls` (Excel antigo) e `.ods` não são lidos (salve como `.xlsx` ou `.csv`). Importar duas vezes o mesmo arquivo duplica os registros.
- **Exemplo pronto:** `exemplos/cronograma-estudos.xlsx` e `.csv` (as mesmas 14 linhas), gerados por `exemplos/gerar_exemplos.py`. O cabeçalho é o modelo de planilha que o módulo "Cronograma de estudos" espera.
- **Testes:** `python -m unittest discover -s scripts -p "test_*.py"`.

### Adicionar um novo tipo de campo (exemplo: `percentual`)

1. `module_schema.rb`: inclua em `TIPOS` e, se puder ser somado, em `NUMERICOS` (ou em `DIMENSOES`/`SERIES`, se for categoria).
2. `module_schema.rb`, `coerce_valor`: diga como converter e validar o valor.
3. `record_codec.rb`: como o valor fica no array compacto (`encode`/`decode`; o `decode` nunca levanta erro). Sem formato especial, ele passa como veio. Veja o `hora` (minutos desde 00:00) como exemplo.
4. `dados_ficticios.rb`: um valor inventado para a prévia do criador de card.
5. Frontend: em `js/util.js`, como mostrar o valor (`fmtValor`); em `js/modulos.js`, qual `<input>` usar (`inputHtml`) e como ler o valor (`coletar`).
6. `scripts/importar_planilha.py` (`converter`): como a célula da planilha vira o valor do tipo.
7. O motor C++ normalmente não muda: ele só vê números e textos.

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
