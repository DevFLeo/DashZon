# DashZon: especificação técnica do sistema

Referência técnica (arquitetura, dados, API, segurança, implantação e regras de desenvolvimento). Comandos de operação: `CLAUDE.md`. Tutorial e tabelas de funções: `docs/DESENVOLVIMENTO.md`. Histórico de mudanças: `Log.md`.

---

## 1. Arquitetura

```
Navegador (SPA HTML/CSS/JS, sem build)
   │ HTTP/JSON (gzip) · cookie de sessão
   ▼
Backend Ruby (Sinatra 4 · Puma ou WEBrick) ── SQLite (arquivo único, conexão única)
   │ JSON via stdin/stdout (um processo por consulta, com cache)
   ▼
Motor C++17 (dashzon_engine): busca e agregação, sem estado, sem acesso a disco
```

| Componente | Responsabilidade | Não faz |
|---|---|---|
| Backend Ruby | Dono do banco e das regras: autenticação, validação (`ModuleSchema`), persistência, API REST, cache | Agregação pesada em loop Ruby |
| Motor C++ | `aggregate`, `multi`, `search` sobre registros recebidos | Abrir o SQLite, conhecer módulos ou templates |
| Frontend | Telas genéricas montadas a partir do schema JSON dos módulos | Regras de negócio, persistência (só `localStorage` para preferência de navegador) |

O domínio é dirigido por dados: módulos (campos, resumo) e dashboards vêm de templates JSON. O código só conhece tipos de campo genéricos: `texto`, `texto_longo`, `markdown`, `numero`, `moeda`, `data`, `hora`, `selecao`, `booleano` e `movimento`. Todo campo `booleano` aparece na tabela como caixa de marcar (checklist).

Declarações opcionais do módulo (validadas em `ModuleSchema.normalize_modulo!`; o código não sabe que módulo é qual):

| Chave | Formato | Efeito |
|---|---|---|
| `ordenacao` | até 3 `{campo, direcao}` | Ordem da lista do módulo |
| `visao` | `{tipo: "notas", titulo, conteudo, pasta?}` (texto, markdown/texto_longo, texto/seleção) | A tela do módulo vira um caderno de notas (`js/notas.js`) em vez da tabela |
| `nota` | `{modulo, titulo, pasta?}` | Cada registro ganha o botão "Nota", que abre ou cria no módulo de notas `modulo` a nota de mesmo título (pasta = valor do campo `pasta`). Sem o módulo instalado e ligado, o botão não aparece |
| `configuracoes` | lista de ids de campo (até 20) | Campos ajustáveis em Configurações > Módulos (opções de seleção e valores padrão), visíveis só com o módulo ligado |

## 2. Stack e versões

| Item | Versão / detalhe |
|---|---|
| Ruby | 3.4 (imagem Docker `ruby:3.4-slim`, RubyInstaller no Windows); 3.2+ funciona |
| Sinatra / Rack / rackup | 4.2.1 / 3.2.7 / 2.3.1 |
| Servidor HTTP | Puma 7.2.1 fora do Windows (`platforms: :ruby`); WEBrick 1.9.2 no Windows. O Sinatra escolhe sozinho |
| SQLite | gem `sqlite3` 2.9.6, com o SQLite embutido (pré-compilada para x86_64/aarch64 Linux e x64 Windows) |
| Outras gems | `csv` 3.3.6 (importação de extratos), `net-smtp` 0.5.1 (e-mail) |
| Testes | Minitest 5.27, rack-test 2.2, rake 13.4 (grupo `:test`) |
| Importador de planilhas | Python 3.8+, só biblioteca padrão (`scripts/importar_planilha.py`); ferramenta opcional, fora do servidor |
| Motor | C++17, CMake ≥ 3.15, sem dependências; JSON próprio em `src/json.hpp`; Release por padrão |
| Frontend | Chart.js 4.5.1 e GridStack, em `frontend/vendor/` (offline, sem CDN) |
| Fontes | Inter, Nunito e Atkinson Hyperlegible 5.1.0 (fontsource, OFL, subconjunto latino) em `frontend/vendor/fonts/`, com as licenças |
| Proxy HTTPS | Caddy 2 (Let's Encrypt, ou plugin DuckDNS no Windows) |

## 3. Estrutura do repositório

```
backend/
  app.rb                   rotas de módulos, registros, dashboards, widgets, templates, setup; filtros
  config.ru                entrada rackup
  rotas/usuarios.rb        login, conta, admin, links de e-mail, limite de tentativas
  rotas/equipes.rb         equipes (grupos de usuários, que podem ser empresa) no painel do adm
  lib/ambiente.rb          Ambiente["VAR", padrao]: variável vazia = não definida
  lib/database.rb          conexão, schema, migração na abertura, registros, jsons
  lib/record_codec.rb      formato compacto de registros.dados
  lib/json_guardado.rb     compressão zlib da tabela jsons
  lib/migracao.rb          migração do banco v2 -> v3 no lugar
  lib/module_schema.rb     validação de módulos, widgets, consultas e registros
  lib/template_registry.rb galeria, validação, instalação e exportação de templates
  lib/engine_client.rb     ponte com o binário C++
  lib/desempenho.rb        CacheResultados (motor) e CacheEstaticos (cabeçalhos)
  lib/usuarios.rb          contas, senhas, tokens, preferências, ajustes
  lib/acesso.rb            quem vê e quem altera dashboards e módulos (por requisição)
  lib/solicitacoes.rb      pedidos do perfil visualizador (aprovar/negar)
  lib/equipes.rb           equipes e membros; CNPJ em HMAC + máscara; empresa de teste
  lib/segredo.rb           chave do servidor (sessão e HMAC)
  lib/documento.rb         CPF/CNPJ: validação, máscara, HMAC
  lib/correio.rb           SMTP opcional
  lib/dados_ficticios.rb   registros fictícios para a prévia de card
  templates/*.json         7 templates padrão (únicos JSON versionados; cada um liberado no .gitignore)
  test/*_test.rb           Minitest + Rack::Test em banco temporário
engine-cpp/                CMakeLists.txt, src/main.cpp, src/json.hpp
frontend/                  index.html, css/, js/, vendor/, preview/
deploy/                    Caddyfile (DuckDNS), Caddyfile.servidor (Docker), scripts PowerShell
scripts/                   rodar.ps1 (Windows), auditar-responsivo.ps1/.js (responsividade), gerar-previews.js,
                           importar_planilha.py (+ test_importar_planilha.py)
exemplos/                  cronograma-estudos.xlsx/.csv (planilha modelo) e gerar_exemplos.py
prototipos/                experimento: DashZon em React (Vite) e em Next.js, com a mesma API (ver §9.1)
Dockerfile, docker-compose.yml, .env.example
data/                      (fora do git) dashzon.db, segredo.key, cópias *.bak
log/                       (fora do git) logs do rodar.ps1
```

## 4. Configuração (variáveis de ambiente)

Lidas por `Ambiente["NOME", padrao]`: valor vazio ou só espaços conta como não definido (o Docker Compose passa as opcionais vazias).

| Variável | Padrão | Efeito |
|---|---|---|
| `DASHZON_HOST` | `127.0.0.1` | Interface de escuta (Docker: `0.0.0.0` dentro do container) |
| `PORT` | `4567` | Porta HTTP |
| `DASHZON_DB_PATH` | `data/dashzon.db` | Arquivo do banco; `segredo.key` e as cópias `.bak` ficam na mesma pasta |
| `DASHZON_ENGINE` | busca em `engine-cpp/build/{Release,Debug,}/dashzon_engine[.exe]` | Caminho do motor |
| `DASHZON_ENGINE_TIMEOUT` | `60` | Segundos por chamada ao motor; passou disso, o processo é encerrado (HTTP 500) |
| `DASHZON_LIMITE_POR_MINUTO` | `1200` | Requisições à API por IP por minuto (acima: 429 com `Retry-After: 60`) |
| `DASHZON_SESSAO_HORAS` | `12` | Sessão parada por mais tempo que isso cai |
| `DASHZON_SESSAO_DIAS` | `30` | Validade máxima de uma sessão, mesmo em uso |
| `DASHZON_HOSTS` | vazio | Domínios aceitos no `Host`, além de localhost e IPs |
| `DASHZON_COOKIE_SEGURO` | `0` | `1`: cookie `Secure` em toda requisição que chega por HTTPS |
| `DASHZON_SESSION_SECRET` | vazio | Chave do servidor; sem ela, usa `segredo.key` ao lado do banco (criado com 64+ bytes, modo 600) |
| `DASHZON_URL_PUBLICA` | `request.base_url` | Base dos links de e-mail e de redefinição |
| `DASHZON_SMTP_HOST`, `_PORTA` (587), `_USUARIO`, `_SENHA`, `_REMETENTE` | vazio | E-mail. Sem host, o envio fica desligado e o admin entrega os links |
| `APP_ENV` | `development` | `production` no Docker; `test` nos testes |

Docker Compose (`.env`): `DASHZON_DOMINIO` vira `DASHZON_HOSTS` e o domínio do Caddy; `DASHZON_PORTA` é a porta publicada em `127.0.0.1`. DuckDNS (`deploy/publico.env`): `DUCKDNS_DOMINIO`, `DUCKDNS_TOKEN`, `PORTA_PUBLICA` (padrão 2444).

## 5. Persistência (SQLite, schema v3)

### 5.1 Conexão

- **Uma** conexão por processo, serializada por `Monitor` (`Database::LOCK`), porque conexões por thread travariam o arquivo no Windows. `Database.transaction` é reentrante.
- PRAGMAs: `foreign_keys=ON`, `temp_store=MEMORY`, `cache_size=-16384` (16 MB), `mmap_size=134217728`. Diário em modo **DELETE**: WAL proibido, porque o backup copia só o `.db`.
- `auto_vacuum=INCREMENTAL` em bancos novos e migrados; `Database.compactar!` roda `PRAGMA incremental_vacuum` depois de excluir um módulo.
- `Database.versao_dados` = geração da conexão + `PRAGMA data_version` + `total_changes`; muda a cada gravação, inclusive feita por outro processo. É a base de invalidação do cache.
- O arquivo só é criado no setup. `configured?` responde false sem criar nada enquanto o arquivo não existe.

### 5.2 Tabelas

| Tabela | Colunas | Observações |
|---|---|---|
| `config` | `id` (=1), `org_name`, `moeda`, `configured_at` | Uma linha |
| `modulos` | `id`, `slug` UNIQUE, `nome`, `descricao`, `icone`, `schema` (JSON: `campos`, `rotulo`, `resumo`, `slots`), `template_origem`, `ordem`, `criado_em`, `dono_id`, `visibilidade` (`todos`/`privado`/`equipes`), `lancamento` (`dono`/`todos`) | `dono_id`, `visibilidade` e `lancamento` por `ALTER TABLE` (`migrar_modulos!`): os que já existiam viram `todos` do primeiro admin. `lancamento` (§7.0): módulo novo nasce `dono`; na criação da coluna, os de tabela ficam `todos` e os de notas viram `dono` (`notas_so_do_dono!`). Nome único sem diferenciar maiúsculas (comparado em Ruby, por causa dos acentos) |
| `registros` | `id` INTEGER PK, `modulo_id` → modulos ON DELETE CASCADE, `dados` (array JSON compacto), `criado_em` INTEGER (epoch), `atualizado_em` INTEGER NULL | Índice `idx_registros_modulo` |
| `dashboards` | `id`, `nome`, `criado_em`, `atualizado_em`, `dono_id`, `visibilidade` (`privado`/`equipe`), `fixo` (0/1) | Colunas novas por `ALTER TABLE` (`migrar_dashboards!`); os que já existiam viram `equipe` do primeiro admin |
| `widgets` | `id`, `dashboard_id` → dashboards CASCADE, `titulo`, `tipo` (kpi/bar/line/table/pie/calendario), `modulo_slug`, `config` (JSON), `x`, `y`, `w`, `h` | Índice `idx_widgets_dashboard`; grade de 12 colunas |
| `usuarios` | `id`, `login` UNIQUE, `senha_hash`, `sal`, `nome`, `email`, `email_verificado_em`, `documento_tipo`, `documento_hash`, `documento_mascara`, `cargo`, `perfil` (`admin`/`usuario`), `ativo`, `deve_trocar_senha`, `sessao_versao`, `ultimo_login_em`, `criado_em`, `atualizado_em`, `preferencias` (JSON) | Criada sob demanda; colunas novas por `ALTER TABLE` (`migrar_usuarios!`) |
| `tokens` | `id`, `usuario_id` → usuarios CASCADE, `tipo` (`redefinir_senha` 24 h, `verificar_email` 7 dias), `token_hash` UNIQUE (SHA-256), `dado`, `expira_em`, `usado_em`, `criado_em` | Uso único |
| `ajustes` | `chave` PK, `valor` | `exigir_documento` (nao/cpf/cnpj/qualquer), `exigir_email`, `exigir_email_verificado`; regras de senha: `senha_minima` (6 a 64, padrão 8), `senha_forte`, `senha_maiuscula`, `senha_numero`, `senha_simbolo` ("0"/"1", desligadas por padrão) |
| `dashboard_equipes`, `modulo_equipes` | (`dashboard_id`/`modulo_id`, `equipe_id`), ambos CASCADE | Equipes escolhidas quando a visibilidade é `equipes` |
| `solicitacoes` | `id`, `modulo_id` → modulos CASCADE, `registro_id`, `acao` (criar/alterar/excluir), `dados` e `antes` (JSON), `solicitante_id` → usuarios CASCADE, `status` (pendente/aprovada/negada), `motivo`, `revisor_id`, `criado_em`, `decidido_em` | Pedidos do perfil visualizador |
| `registros_exemplo` | `registro_id` PK → registros CASCADE, `modulo_id` → modulos CASCADE | Dados de exemplo que vieram com um template. Marcados na instalação; editar um registro tira a marca. Bancos antigos: na criação da tabela, `marcar_exemplos_antigos!` marca os registros nunca editados criados até 5 s do módulo de template |
| `eventos_seguranca` | `id`, `quando` INTEGER (epoch), `tipo`, `ip`, `conta` (HMAC do login digitado, 32 hex), `usuario_id`, `detalhe` | Diário de segurança e base da contagem de falhas (§8). Índices por `(ip, quando)`, `(conta, quando)` e `quando`. Guardado por 180 dias |
| `jsons` | `id`, `tipo` (`template`/`exportacao`), `nome`, `conteudo` (BLOB zlib), `criado_em` | Índice `idx_jsons_tipo` |
| `equipes` | `id`, `nome`, `descricao`, `empresa` (0/1), `exigir_cnpj` (0/1), `cnpj_hash` (HMAC), `cnpj_mascara`, `teste` (0/1), `criado_em`, `atualizado_em` | Grupo de usuários. Empresa pode exigir CNPJ ou não; CNPJ único (pelo HMAC). `teste` = empresa de teste com CNPJ fictício |
| `equipe_membros` | `equipe_id` → equipes CASCADE, `usuario_id` → usuarios CASCADE, `criado_em`; PK (equipe, usuário) | Um usuário em nenhuma, uma ou várias equipes. Índice `idx_equipe_membros_usuario` |

`usuarios`, `tokens`, `ajustes`, `jsons`, `eventos_seguranca`, `equipes`, `equipe_membros`, `registros_exemplo`, `dashboard_equipes`, `modulo_equipes` e `solicitacoes` estão em `EXTRAS_SQL` (`CREATE TABLE IF NOT EXISTS`), criados por `garantir_tabelas!`. Datas fora de `registros` continuam em texto ISO 8601 UTC.

### 5.3 Formato de `registros.dados` (`RecordCodec`)

Array JSON posicional; a posição de cada campo vem de `modulos.schema.slots` (`id → índice`). Os slots só crescem: um campo removido mantém sua posição (volta com os dados se for recriado com o mesmo `id`), e um campo novo recebe `slots.size`.

| Tipo | Em disco | Na API / no motor |
|---|---|---|
| `data` | inteiro: dias desde 1970-01-01 | `"AAAA-MM-DD"` |
| `booleano` | `1` / `0` | `true` / `false` |
| `movimento` | `0` / `1` | `"entrada"` / `"saida"` |
| `hora` | inteiro: minutos desde 00:00 | `"HH:MM"` |
| `numero`, `moeda` | número; inteiro se não tem casas (abaixo de 2^53) | número |
| `texto`, `texto_longo`, `markdown`, `selecao` | texto | texto |

`null`s finais são omitidos. O `decode` nunca levanta erro: um valor incompatível com o tipo vira `nil`. Na troca de tipo de um campo existente, `Database.reconverter_registros!` converte os valores via `ModuleSchema.coerce_valor` na mesma transação do `PUT`.

A API devolve o registro "achatado" (`campos..., id, _criado_em, _atualizado_em`), com datas ISO (o `_atualizado_em` cai para o `criado_em` quando nulo). Leitura projetada: `Database.registros(m, campos: [...], meta: false)` desempacota só os campos pedidos, sem os carimbos de data.

### 5.4 JSON do usuário (`JsonGuardado`)

`jsons.conteudo` é zlib (`BEST_COMPRESSION`) num BLOB, guardado na própria coluna TEXT, sem mudança de schema. A leitura aceita texto legado: um JSON em texto começa por `{` ou `[`, e o zlib por `0x78`. A deduplicação de templates compara o texto descomprimido. `bytes` na lista é o tamanho ocupado.

### 5.5 Versões e migração

`PRAGMA user_version` = `SCHEMA_VERSION` = 3.

| Versão encontrada | Ação |
|---|---|
| 3 | Nenhuma |
| 2 (com tabela `registros`) | **Migração no lugar** (`Migracao.se_preciso!`), na partida (`app.rb` chama `Database.configured?` ao carregar) |
| < 2, ou sem tabelas | Considerado antigo: o setup renomeia para `dashzon.db.AAAAMMDDHHMMSS.bak` (`arquivar_versao_antiga!`) |

Migração v2 → v3:

1. Cópia de segurança `dashzon.db.v2-AAAAMMDDHHMMSS.bak` via `VACUUM INTO` (fallback: cópia do arquivo). Sem cópia, não migra.
2. Transação `IMMEDIATE`, que confere a versão de novo:
   - calcula os slots de cada módulo, incluindo as chaves órfãs ainda presentes nos registros;
   - recria `registros` (ids preservados, datas ISO → epoch; `atualizado_em` igual ao `criado_em` vira NULL; valores inválidos viram NULL e são contados);
   - cria `idx_widgets_dashboard` e comprime as linhas texto de `jsons`;
   - grava `user_version=3`.
3. Fora da transação: `auto_vacuum=INCREMENTAL` + `VACUUM`.

Uma falha vira `Migracao::Falha`: nada é alterado, o servidor sobe e as requisições respondem 500 com a causa e o caminho da cópia. Nunca vira "não configurado", que levaria ao setup e arquivaria o banco. A falha é memorizada por processo (não há nova tentativa nem nova cópia por requisição) até `Database.fechar!` ou reinício. A migração imprime um resumo no stderr (registros, módulos, tamanhos, cópia, valores descartados, JSONs comprimidos).

Medido: 100 mil registros migram em ~5,6 s, de 19,7 MB para 8,6 MB.

## 6. Motor C++ e cache

### 6.1 Protocolo

`EngineClient.run(payload)`: um processo por chamada (`EngineClient.executar`, `Open3.popen3` com entrada, stdout e stderr em threads), JSON pelo stdin, JSON pelo stdout. Se a resposta tiver `error`, se o código de saída não for 0 ou se passar de `DASHZON_ENGINE_TIMEOUT` (o processo é encerrado), levanta `EngineError` (HTTP 500).

| Comando | Entrada | Saída |
|---|---|---|
| `aggregate` | `records`, `group_by`, `group_format` (`mes`), `series_by`, `value_field`, `filters` {campo: valor}, `sign_field`, `negative_values` | `result` [{key, count, sum, avg, series}], `series_keys`, `total_count`, `total_sum`, `total_avg` |
| `multi` | `records`, `queries` [opções do aggregate] | `results` [...] (os registros atravessam o pipe uma vez) |
| `search` | `records`, `q` (substring, sem diferenciar maiúsculas), `text_fields`, `filters` | `result` [registros], `count` |

A tradução da consulta de um widget ou resumo para o motor é feita por `ModuleSchema.engine_query` (protegida pela REGRA). `saldo` vira `sign_field` = campo movimento + `negative_values: ["saida"]`.

### 6.2 Desempenho

- `CacheResultados.buscar(*chave)`: até 300 respostas do motor, com chave = partes (módulo, schema, config/consulta) e validade = `Database.versao_dados` (qualquer gravação limpa tudo).
- **Projeção:** resumos e cards enviam ao motor só os campos de `ModuleSchema.campos_usados` (agrupar, série, valor, sinal, filtros). Card de 50 mil registros sem cache: 1,37 s → 0,82 s, e payload de 11,4 → 6,0 MB.
- **Formato compacto:** 50 mil lançamentos ocupam 10,5 MB → 4,3 MB.
- `Rack::Deflater` (gzip) em todas as respostas. `CacheEstaticos` define `max-age=86400` para `/vendor` e `/preview`, e `no-cache` para o resto (revalidação com 304).

## 7. API HTTP

Formato JSON (`application/json;charset=utf-8`, também nos erros dos middlewares). Erros: `{"error": "mensagem"}`.

| Status | Quando |
|---|---|
| 401 | Sem sessão |
| 403 | Não é admin em `/api/admin/*`, senha temporária pendente (`trocar_senha: true`) ou escrita com `Origin` de outro site |
| 404 | Recurso inexistente |
| 409 | Sistema ainda não configurado |
| 422 | Validação (`ModuleSchema::Error`, `Usuarios::Erro`) |
| 413 | Corpo acima de 64 MB (`LimiteCorpo`, pelo `Content-Length`) |
| 429 | Limite de tentativas (login, links e a senha atual em `PUT /api/eu/senha`) |
| 400 | JSON inválido, corpo que não é um objeto ou que não está em UTF-8 |
| 500 | Motor ou migração (com a causa); erro inesperado responde "Erro interno" e o detalhe vai só para o log |
| 502 | SMTP |

**Filtro `before "/api/*"`:**

1. Rotas abertas (`ROTAS_ABERTAS`): `/api/status`, `/api/login`, `/api/logout`, `/api/usuarios/primeiro`, `/api/senha/esqueci`, `/api/senha/redefinir`, `/api/email/verificar`.
2. Antes do setup: só `/api/setup`, `/api/templates/validar` e `GET /api/templates*`; o resto responde 409.
3. Sessão obrigatória: usuário ativo e `sessao_versao` igual à da sessão.
4. `deve_trocar_senha`: só `/api/status`, `/api/logout`, `/api/eu`, `/api/eu/senha`.
5. `/api/admin/*` exige `perfil == "admin"`.

| Rotas | Função |
|---|---|
| `GET /api/status` | `configured`, `org_name`, `email_configurado`; com sessão: `usuario`, `moeda`; sem: `sem_usuario` |
| `POST /api/setup` | Cria o banco, o primeiro admin (`usuario`, `senha`, `nome`) e instala `templates`/`importados`; abre a sessão |
| `POST /api/login`, `/api/logout`, `/api/usuarios/primeiro` | Sessão; criação do primeiro usuário quando não há nenhum |
| `POST /api/senha/esqueci`, `/api/senha/redefinir`, `/api/email/verificar` | Links por token (limite por IP) |
| `GET/PUT /api/eu`, `PUT /api/eu/senha`, `PUT /api/eu/preferencias`, `POST /api/eu/sair-outros`, `POST /api/eu/verificar-email` | Configurações da pessoa. Preferências: `tema`, `fonte`, `tamanho_fonte`, `pagina_inicial`, `privacidade`, `modulos_ocultos` (slugs desligados no menu dela, até 100) e `ordem_menu` (`{dashboards: [ids], modulos: [slugs]}`, até 500 cada: a ordem arrastada na barra lateral) |
| `GET/PUT /api/admin/ajustes`, `PUT /api/admin/config` | Regras de cadastro; organização e moeda |
| `GET /api/equipes` | Equipes que a pessoa pode escolher ao compartilhar |
| `PUT /api/modulos/:slug/compartilhar` | `visibilidade` (todos/privado/equipes), `equipes`, `lancamento` (dono/todos; sem a chave, fica como está), `dono_id` (só admin) |
| `GET /api/solicitacoes`, `GET /api/solicitacoes/contagem`, `POST /api/solicitacoes/:id/aprovar`, `.../negar` (`motivo`) | Pedidos do perfil visualizador: os que a pessoa decide e os dela |
| `GET /api/admin/seguranca`, `POST /api/admin/seguranca/desbloquear` | Checagem da instalação, bloqueios em vigor e os últimos 300 eventos (acessos e alterações); desbloqueio de um IP (`ip`) ou conta (`conta` = hash) |
| `GET/POST /api/admin/usuarios`, `PUT/DELETE /api/admin/usuarios/:id`, `POST .../:id/ativo`, `.../senha-temporaria`, `.../link-redefinicao`, `.../email-verificado`, `.../enviar-verificacao` | Gestão de usuários. A lista traz `equipes` de cada um (`[]` = nenhuma); `POST`/`PUT` aceitam `equipes` (ids; define exatamente em quais está, na mesma transação) |
| `GET/POST /api/admin/equipes`, `PUT/DELETE /api/admin/equipes/:id`, `PUT .../:id/membros` (`usuario_ids`), `POST /api/admin/equipes/teste` | Equipes (`nome`, `descricao`, `empresa`, `exigir_cnpj`, `cnpj`); excluir não apaga as contas. `teste` cria uma empresa de teste com CNPJ fictício |
| `GET /api/templates`, `GET /api/templates/:id`, `POST /api/templates/validar`, `POST /api/templates/instalar`, `DELETE /api/templates/:id` (só `salvo-*`) | Galeria |
| `GET /api/export[?dados=1]`, `GET /api/exportacoes`, `GET/DELETE /api/exportacoes/:id` | Exportação e histórico (guardado em `jsons`) |
| `GET/POST /api/modulos`, `GET/PUT/DELETE /api/modulos/:slug` | Módulos (o `PUT` preserva slots e reconverte tipos; o `DELETE` remove widgets e registros e compacta) |
| `GET /api/modulos/:slug/resumo` | KPIs (`multi`, projetado, com cache) |
| `GET /api/modulos/:slug/registros?q=&f[campo]=&inicio=&limite=` | Busca (`search`), ordenada pela `ordenacao` do módulo (`ModuleSchema.ordenar_registros`) e paginada (`limite` padrão 200, máx. 1000; `count` = total). O cache guarda só a página |
| `GET /api/modulos/:slug/registros/:id` | Um registro lido do banco (base do formulário de edição: a lista vem do motor) |
| `PATCH /api/modulos/:slug/registros/:id` | Altera só os campos enviados; o resto vem do banco, e o registro inteiro passa por `coerce_registro!` (checklist) |
| `POST/PUT/DELETE /api/modulos/:slug/registros[/:id]` | CRUD validado por `coerce_registro!`. Escrita (com o `PATCH`) exige `pode_lancar` (§7.0): senão 403 |
| `GET/POST /api/dashboards`, `GET/PUT/DELETE /api/dashboards/:id` | Dashboards **por usuário**: a lista traz os seus e os da equipe (com `dono_nome`, `fixo`, `editavel`); o privado de outra pessoa responde 404; `PUT` parcial (`nome`, `fixo`, `visibilidade`; `dono_id` só admin); alterar exige ser o dono ou admin num da equipe (403). O `GET :id` traz os widgets |
| `GET /api/dashboards/:id/exemplos`, `DELETE /api/dashboards/:id?exemplos=1&modulos=1`, `DELETE /api/modulos/:slug/exemplos` | Dados de exemplo: quantos os módulos do dashboard ainda têm; excluir o dashboard levando só esses registros; apagar os exemplos de um módulo. `/api/modulos` e `GET /api/modulos/:slug` trazem `exemplos`. O `GET` também traz `modulos_do_dashboard` (os dos cards e os que o template instalou junto: mesmo horário, dono e template que declara um dashboard com esse nome), com `registros`, `exemplos`, `removivel` e `motivo`; `modulos=1` exclui os removíveis (que a pessoa pode alterar e que nenhum outro dashboard usa), com os registros, e o diário registra quais |
| `POST /api/dashboards/:id/widgets`, `PUT/DELETE /api/widgets/:id`, `PUT /api/widgets/:id/layout` | Widgets (o `layout` altera só x/y/w/h) |
| `GET /api/widgets/:id/data` | Dados do card (`aggregate`, revalidado contra o schema atual, projetado, com cache) |
| `POST /api/widgets/preview` | Prévia sobre 72 registros fictícios (nada gravado) |

**Validação de valores:** `texto` ≤ 500, `texto_longo` ≤ 5000, `markdown` ≤ 100.000 caracteres (guarda o recuo; só o fim é aparado e `\r\n` vira `\n`); números finitos e em formato simples (aceita `1.234,56`, `1234.56`, `1.5e3`; recusa `0x1A` e `1_000`); datas existentes no calendário; `hora` em `HH:MM` (aceita `8:05` e `08:05:00`); `selecao`/`movimento` restritos às opções; `padrao` aceita `$hoje`, `$hoje±N` e é validado ao salvar a estrutura.

**Limites de cadastro:** nome de módulo, de campo e de dashboard ≤ 80; descrição de módulo ≤ 500; ícone ≤ 40; ajuda ≤ 500; até 100 campos por módulo e 200 opções por seleção (≤ 100 caracteres cada). Moeda: `BRL`, `USD` ou `EUR` (setup e painel do adm).

### 7.0 Quem vê e quem altera (`lib/acesso.rb`)

Regras num só lugar, um objeto por requisição (helper `acesso` no `app.rb`):

| | Dashboard (`visibilidade`) | Módulo (`visibilidade`) |
|---|---|---|
| Só o dono | `privado` (nem os admins) | `privado` |
| Equipes escolhidas | `equipes` (`dashboard_equipes`): membros, dono e admins | `equipes` (`modulo_equipes`): membros, dono e admins |
| Todos | `equipe` (nome antigo mantido) | `todos` |
| Além disso | | quem vê um dashboard vê os módulos dos cards dele |
| Alterar | dono, ou admin quando não é privado | dono, ou admin quando não é privado (estrutura, compartilhar, excluir, apagar exemplos) |
| Lançar registros | | quem altera o módulo; com `lancamento` = `todos`, também todos que o veem |

- Novo dashboard e novo módulo nascem privados de quem criou; o setup cria os do template como "todos". Instalar um template só reaproveita módulo (de mesmo nome ou uma cópia "Nome (n)") que a pessoa vê **e** com o mesmo alcance do dashboard: privado reaproveita só módulo privado dela; para todos, só módulo de todos. Senão cria "Nome (2)", com os dados de exemplo. Assim um teste privado não grava nos dados de todos, e um dashboard para todos não expõe o módulo privado de ninguém.
- Na janela "Novo dashboard", "Quem vê este dashboard?" fica no topo (um clique no template já instala), com "Só eu" marcado sempre que ela abre.
- Quem não é admin só compartilha com as próprias equipes (`GET /api/equipes` lista as que pode usar). Excluir uma conta passa dashboards **e módulos** dela para quem excluiu.
- `modulo!(slug)` responde 404 para módulo que a pessoa não vê; `modulo_editavel!` e `modulo_lancavel!` respondem 403. A exportação leva só o visível.
- **Quem lança registros** (pentest de 26/10/2026, achado 1): criar, alterar e excluir registros é regra do servidor (`Acesso#pode_lancar?`, helper `modulo_lancavel!`), não só da tela. O dono escolhe em Compartilhar ("Só eu e os administradores" ou "Todos que veem o módulo"); a API traz `lancamento` e `pode_lancar` em cada módulo. Sem `pode_lancar`, a tabela esconde "Novo registro", "Editar", "Excluir" e trava o checklist; as notas ficam só leitura; os cards do dashboard perdem o "+" de lançar. Apagar exemplos (direto ou ao excluir um dashboard com `?exemplos=1`) só nos módulos que a pessoa altera.
- **Perfil `visualizador`** (`Usuarios::PERFIS`): não cria dashboards, módulos nem instala templates (403). `POST/PUT/PATCH/DELETE` de registro valida os dados e responde **202** com `{pendente, mensagem}`, sem gravar: vira um pedido em `solicitacoes`. Decide o dono do módulo (se ativo e não visualizador) ou um admin: `POST /api/solicitacoes/:id/aprovar|negar`, que revalida e aplica na hora. No navegador: tela Aprovações (`js/aprovacoes.js`, `#/aprovacoes`) com o antes e o depois de cada campo; link no menu com o número de pedidos; notas só leitura para o visualizador.

### 7.1 Dashboards: dono, equipe e layout fixo

- Cada dashboard tem **dono** (quem criou) e **visibilidade**: `privado` (só o dono vê, nem os administradores) ou `equipe` (todos veem). Novo nasce `privado`; o setup cria os do template como `equipe`; instalar um template depois cria os dele como `privado` de quem instalou (ou `equipe`, se pedido).
- **Alterar** (nome, cards, layout, compartilhamento, excluir): o dono, ou um administrador quando é da equipe. Os demais só veem e lançam registros nos módulos em que podem (§7.0). Helpers `dashboard!` (ver; 404 se não pode) e `dashboard_editavel!` / `widget!(editar: true)` (403) no `app.rb`.
- **Transferir:** só administrador, para uma conta ativa (`PUT {dono_id}`). Excluir uma conta passa os dashboards dela para quem excluiu.
- **Fixo:** `PUT /api/widgets/:id/layout` responde 409 enquanto o dashboard está fixado; no navegador, `GridStack.setStatic` trava arrastar/redimensionar (a grade e o layout salvo não mudam, REGRA §12.1).
- A exportação leva só os dashboards que a pessoa vê.
- `scripts/verificar-dashboards.js` confere isso num servidor de verdade com uma conta comum (credenciais por variável de ambiente; só cria e apaga um dashboard de teste dela).

## 8. Autenticação e segurança

- **Sessão:** cookie Rack assinado com a chave do servidor (`Segredo.chave`), `httponly`, `same_site: strict`, e `Secure` em HTTPS quando `DASHZON_COOKIE_SEGURO=1`. Guarda `uid` e `sv` (= `sessao_versao`). Trocar ou redefinir a senha, desativar o usuário ou "sair dos outros" incrementa `sessao_versao`, e as outras sessões caem na hora.
- **Senha:** PBKDF2-HMAC-SHA256, 100.000 iterações, sal de 16 bytes por usuário, 32 bytes de saída. `ITERACOES` é imutável (as senhas gravadas dependem dele). Login: 3 a 40 caracteres, letras sem acento, números, `.`, `-`, `_` e espaço simples entre as partes ("teste 1"); `Usuarios.normalizar_login` corta as pontas e junta espaços repetidos (cadastro, setup e entrada). O admin escolhe se quem é criado com senha precisa trocá-la no 1º acesso (`deve_trocar_senha`).
- **CPF/CNPJ:** validado; só ficam gravados o HMAC-SHA256 com a chave do servidor e uma máscara para exibição.
- **Tokens de link:** só o SHA-256 é gravado; uso único; validade de 24 h (redefinição) ou 7 dias (e-mail).
- **Anti-força-bruta** (`lib/seguranca.rb`):
  - as falhas ficam em `eventos_seguranca`, então **sobrevivem a um reinício**;
  - **por IP:** 8 falhas em 15 min (login errado, senha atual errada, link inválido ou pedido de link) bloqueiam login, "esqueci", "redefinir", "verificar" e a troca de senha para esse IP;
  - **por conta:** 10 falhas contra o mesmo login em 15 min, **vindas de qualquer IP**, bloqueiam essa conta. Login inexistente conta igual, com a mesma mensagem, para não revelar quem existe;
  - um login certo, ou o desbloqueio pelo adm, zera a contagem daquele IP ou conta;
  - login errado espera 0,5 s;
  - o login digitado é gravado só como HMAC (alguém pode digitar a senha no campo errado);
  - IP e conta vão ao SQLite sempre como TEXT (`Seguranca.texto`): o driver grava texto binário como BLOB, e BLOB nunca é igual a TEXT.
- **Diário de alterações** (`AUDITORIA` no `app.rb`): um `before` lê o nome do alvo (antes de excluir) e um `after` grava, se a resposta deu certo, quem criou, alterou ou excluiu usuários, equipes, dashboards, módulos, regras, templates e pedidos de aprovação, com um resumo do pedido sem senha nem documento (o corpo vem do `body_json`). Registros (pentest, achado 2): `registro_criado`, `registro_alterado` e `registro_excluido` com módulo e número do registro, sem os valores; alterações seguidas do mesmo registro pela mesma pessoa em 10 min (`JANELA_REGISTRO_ALTERADO`) viram um evento, porque as notas gravam a cada pausa da digitação. O 202 do visualizador continua `pedido_criado`. O alvo vem do caminho convertido para UTF-8 (`Seguranca.texto`): como texto binário, o SQLite o comparava como BLOB e o nome do módulo não aparecia. Painel do adm: filtro tudo / alterações / acessos.
- **Diário de segurança:** login, saída, falhas, bloqueios, desbloqueios, trocas e redefinições de senha, "sair dos outros", escrita de outro site e excesso de requisições (os dois últimos no máximo 1 vez por minuto por IP). Aparece no Painel do adm, junto da checagem da instalação: HTTPS, cookie seguro, quantidade de admins, senhas temporárias, logins errados em 24 h e validade da sessão.
- **Regras de senha** (Painel do adm > Regras de senha; `Usuarios.regras_senha`): só o tamanho é regra fixa (mínimo de 6 a 64, padrão 8; máximo 200). São **opções** do administrador, desligadas por padrão: "senha forte" (recusa a igual ao login, as ~60 mais comuns como `12345678` e `senha123`, um caractere repetido e as sequências `abcdefgh`/`87654321`), maiúsculas e minúsculas, letras e números, e um símbolo. Vale para cadastro, troca e redefinição; o setup usa o padrão (o banco ainda não existe). A senha temporária gerada cumpre as regras em vigor. `/api/status` expõe `regras_senha`, e as telas mostram "mínimo N, com..." e ajustam o `minlength`.
- **Sessão:** cai depois de `DASHZON_SESSAO_HORAS` (12) sem uso e, no máximo, em `DASHZON_SESSAO_DIAS` (30); cada login começa uma sessão nova.
- **`Seguranca::Protecao`** (middleware, por fora do app):
  - cabeçalhos em toda resposta:
    - CSP: `script-src 'self'` (sem script inline nem `eval`; o tema e a fonte do `<head>` estão em `js/antes.js`), `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`; estilos inline e imagens `https:` (notas) são aceitos;
    - `nosniff`, `X-Frame-Options DENY`, `Referrer-Policy same-origin`, `Permissions-Policy` e `COOP same-origin`;
    - HSTS só em HTTPS;
    - `Server: DashZon`, sem a versão do Ruby ou do servidor;
  - escrita (`POST/PUT/PATCH/DELETE` em `/api`) com `Origin` diferente de `req.base_url` (esquema + host + porta, já com o `X-Forwarded-Proto` do Caddy) ou `null` recebe 403, e a sessão de quem foi alvo continua de pé. Sem `Origin` (curl, importador) segue, e a sessão continua exigida. Por isso o `HttpOrigin` e o `RemoteToken` do Rack::Protection ficam desligados (`set :protection, except: ...`): eles rodam antes e, em vez de recusar, derrubavam a sessão; as demais proteções do Sinatra seguem ligadas;
  - limite de requisições à API por IP (`DASHZON_LIMITE_POR_MINUTO`).
- **SQL injection:** todo SQL usa parâmetros (`?`). O teste `test_nenhum_sql_monta_texto_com_dado` varre o backend e falha se aparecer SQL com texto interpolado fora de uma lista curta, onde só entram constantes do código. Outro teste manda ataques clássicos pela API (login, busca, filtros, slug, valores), e eles viram texto comum.
- **XSS:** todo texto do usuário passa por `Util.escapeHtml`; o Markdown escapa antes de formatar; a CSP barra script injetado mesmo se escapar algo.
- **Contas:** sem usuário padrão. Sempre resta pelo menos um admin ativo; ninguém se exclui, se desativa ou remove o próprio perfil de admin.
- **Host:** `host_authorization` aceita localhost, `.localhost`, qualquer IP e `DASHZON_HOSTS`; o resto recebe 403.
- **Rede:** o app escuta em 127.0.0.1 (no Docker, a porta é publicada só em 127.0.0.1). Para a internet, só via Caddy com HTTPS. `Caddyfile.servidor` aplica HSTS, `nosniff`, `X-Frame-Options DENY`, `Referrer-Policy same-origin` e compressão zstd/gzip.
- **Segredos fora do git:** `.env`, `deploy/publico.env`, `data/`, `*.db`, `*.bak` e `*.json` (exceto os 6 templates padrão e `.vscode`).

## 9. Frontend

SPA sem build. Scripts carregados em ordem: `vendor/gridstack-all.js`, `vendor/chart.umd.js`, `util`, `ajuda`, `tema`, `fonte`, `api`, `markdown`, `setup`, `login`, `conta`, `config`, `admin`, `modulos`, `notas`, `dashboards`, `compartilhar`, `aprovacoes`, `menu`, `responsivo`, `app`. Cada tela segue o padrão `const X = (() => { ...; return {...}; })()`.

**Ícones:** sem emojis (regra do `CLAUDE.md`, conferida por `test_interface_sem_emojis`). Ícones são SVG de traço por `Util.icone(nome)` (classe `.ico`: cor do texto, tamanho da letra). Marca: cubo 3D transparente girando à esquerda de "DashZon" (`.logo-3d`: seis faces em CSS 3D com `preserve-3d`, cores de `--accent`, núcleo que pulsa; acelera com o mouse; parado com `prefers-reduced-motion`).

**Barra lateral** (`js/menu.js`):

- **Cascata:** cada seção (Dashboards, Módulos) abre e fecha pelo título (`.nav-cascata`, `aria-expanded`); as fechadas ficam no `localStorage`.
- **Arrastar e soltar:** dashboards e módulos se reordenam pela alça (`.nav-alca`) com Pointer Events, então funciona com mouse e com o dedo (`touch-action: none` só na alça); no teclado, Alt + seta. A ordem é da conta (`ordem_menu`, `App.salvarOrdem`); quem não está na lista vai para o fim. A rota padrão usa a mesma ordem.
- **Recolher** (só acima de 800px): botão ao lado da marca; a barra vira uma coluna de 64px com o cubo e siglas de duas letras (`.nav-sigla`). Fica no `localStorage`; ao mudar, dispara `resize` para a grade e os gráficos se ajustarem.
- **Botão direito num dashboard** (no menu ou na tela dele), tecla de menu ou toque longo (550 ms): menu "Fixar" / "Fixado" (`role=menuitemcheckbox`), o mesmo `fixo` do botão "Fixar layout" / "Fixado" do painel, que continua lá. `App.marcarFixo` mantém os dois e o alfinete do menu em sincronia. Quem não pode alterar vê o item desligado. Em campos, links fora do menu ou com texto selecionado fica o menu do navegador. Depois do toque longo, o `mousedown`/`click` de compatibilidade são engolidos (senão fechariam o menu e abririam o link).

**Painel do adm:** botão "Criar" com Usuário, Equipe (pode ser empresa; CNPJ obrigatório ou não), Lote de produção (instala o template) e Empresa de teste. Tabela de equipes (CNPJ mascarado, membros) e coluna "Equipes" na de usuários ("Nenhuma" quando não está em nenhuma). O formulário do usuário e o da equipe marcam a relação nos dois sentidos.

**Tipos de card** (`dashboards.js`, um só despacho `desenhar()` para o dashboard e a prévia):

| Tipo | Config | Desenho |
|---|---|---|
| `kpi` | o de sempre; com `meta` (> 0), `periodo` (`tudo`, `mes`, `semana`) e `campo_data` vira card de meta | `renderKpi`; com meta, `renderMeta`: valor, "de N", barra de progresso, quanto falta ou passou. Por mês/semana o servidor agrupa por dia (`agrupar_por` = `campo_data`, sem formato) e o navegador soma só os dias do período atual |
| `bar`, `line` | o de sempre | `renderGrafico` |
| `table` | o de sempre | `renderTabela` |
| `pie` | exige `agrupar_por` | `renderPizza`: rosca, número de categorias no centro (plugin do Chart.js), legenda à direita ou embaixo. Sem paleta, uma cor do tema por fatia |
| `calendario` | `agrupar_por` = campo de data, `formato_grupo` nulo (um valor por dia) | `renderCalendario`: um quadradinho por dia, 4 níveis de intensidade, semanas que cabem na largura, dias ativos e sequências; redesenha em `resize`/`resizestop` |

**Cores do card** (editor > passo "Cores"; `config.paleta`, `config.cores` {categoria: "#rrggbb"}, `config.cor`): 9 paletas nomeadas (`Util.PALETAS`), cor por categoria ou série com `<input type=color>`, e "Surpreenda-me" (`Util.paletaSurpresa`: matizes pelo ângulo de ouro, com um nome). `Util.corDe` = escolhida > paleta > identidade de sempre (`corSerie`); `Util.corUnica` para número, linha e calendário. Sem cores escolhidas, o desenho é idêntico ao de antes. O servidor valida (`normalize_aparencia!`) e não usa isso na consulta.

**Dados de exemplo:** ao excluir um dashboard, uma janela lista os módulos dele com dados de exemplo e oferece apagá-los junto (`DELETE /api/dashboards/:id?exemplos=1`). A mesma janela oferece excluir também os módulos do dashboard (`?modulos=1`): marcada quando eles só têm dados de exemplo; desmarcada, com aviso, quando há registros cadastrados por alguém; e lista os que ficam e por quê (de outra pessoa, ou usado por outro dashboard). Na tela do módulo, "Apagar dados de exemplo (N)" (`DELETE /api/modulos/:slug/exemplos`).

**Responsividade** (bloco no fim do `style.css`, para ter precedência):

| Faixa | Comportamento |
|---|---|
| ≤ 820px ou `pointer: coarse` | Alvos de toque de 36–44px (o `.dica` tem 36px de área por borda transparente); campos com `font-size` 16px (evita o zoom do iOS) |
| ≤ 800px | Barra superior fixa (botão de menu, cubo, marca, tema) e o menu numa gaveta (`#menu-movel`; `app.js` `ligarMenuMovel`, com `aria-expanded`; fecha em `hashchange`, clique em item e Esc). No desktop o invólucro é `display: contents` |
| ≤ 640px | Dashboard empilhado (`responsivo.js`); KPIs do módulo 2 por linha; modais em tela cheia (`100dvh`), com rodapé fixo nos que são um `form` único |
| < 360px | KPIs do dashboard 1 por linha |

- **Dashboard empilhado:** `responsivo.js` observa `#grid` (`MutationObserver` em `gs-x/gs-y/gs-w/gs-h` e na lista de filhos) e copia os atributos para `order = y*12 + x`, `--gs-h` e a classe `cel-meia` (w ≤ 3). O CSS troca a grade absoluta por CSS grid de 2 colunas e desliga arrastar/redimensionar. A configuração do GridStack (12 colunas), o `salvarLayout` e o layout salvo não mudam.
- **Container queries:** `.kpi` e `.grid-stack-item-content` são `container-type: inline-size`; os valores usam `clamp(17px, 12.5–13cqi, 26–30px)`. Com toque, cards de até 280px quebram o cabeçalho (ferramentas acima do título).
- **Ferramentas do card:** com mouse ficam em `position: absolute`, sem reservar largura (aparecem no hover); com `hover: none` ficam sempre visíveis.
- **Fechar modal:** um "×" (`.modal-fechar`, sticky no topo) é injetado pelo `app.js` em todo `.modal-overlay` sem `data-fixo`.

- **Rotas por hash:** `#/d/<id>` (dashboard), `#/m/<slug>` (módulo; tabela ou caderno de notas, conforme a `visao`), `#/m/<slug>/<id>` (uma nota), `#/config/<aba>` (`conta`, `aparencia`, `seguranca`, `modulos`), `#/admin`, `#/inicio`, `#/redefinir/<token>`, `#/verificar-email/<token>`.
- **Configurações** (`js/config.js` + formulários do `js/conta.js`): página com abas no lugar do antigo modal "Minha conta".
  - Na aba Módulos, cada pessoa liga ou desliga um módulo: ele sai do menu dela, dos atalhos e da página inicial, mas os dados e os cards continuam.
  - Com o módulo ligado, aparecem as opções declaradas em `configuracoes`; salvar faz um `PUT /api/modulos/:slug` com o schema inteiro.
  - A aba também lista os templates da galeria cujos módulos ainda não estão instalados.
- **Notas** (`js/notas.js`, módulos com `visao: notas`), no estilo do Obsidian:
  - lista em árvore por pasta (`A/B` = subpasta), tags com contagem e busca sem acento;
  - editor Markdown com prévia (Ler, Editar ou Lado a lado) e gravação automática (`PATCH` 700 ms depois da última tecla; `Ctrl+S` grava na hora);
  - `[[link]]` abre a nota ou cria uma que não existe; tarefas `- [ ]` clicáveis na prévia; "Mencionada em";
  - importar `.md` (arquivos soltos ou uma pasta, como um cofre do Obsidian; mesmo título na mesma pasta é atualizado) e baixar uma nota `.md` ou todas num `.zip` (`Util.zip`, sem compressão, nomes em UTF-8);
  - lê até 1000 notas por módulo.
  - quem pode alterar o módulo (dono ou admin; nunca o visualizador) vê "Apagar notas de exemplo (N)" (`DELETE /api/modulos/:slug/exemplos`) e "Excluir módulo" (`DELETE /api/modulos/:slug`), como na tela de tabela; para só tirar do próprio menu continua valendo Configurações > Módulos.
- **Markdown** (`js/markdown.js`, sem biblioteca): o texto é escapado antes da marcação, então HTML da nota nunca é interpretado; links só com `http(s)`, `mailto` ou endereço relativo. A auditoria isenta da medida de alvo de toque os links dentro do Markdown (exceção "inline" da WCAG 2.5.8).
- **Boot:** `GET /api/status` decide entre setup, login (ou "crie seu usuário") e o app; troca de senha obrigatória antes de qualquer outra tela.
- **`Api`:** `fetch` + JSON. Um 401 fora de `/api/login` e `/api/usuarios/primeiro` volta para `/`.
- **Temas:** todos em `temas/temas.json`, a fonte única (`temas/README.md` explica como criar um). O backend (`lib/temas.rb`) valida a preferência (`Usuarios::TEMAS = Temas.ids`) e gera `/temas.css` (os 26 tokens de cor de cada tema, em `:root[data-theme="<atributo>"]`, e o claro/escuro do "sistema") e `/temas.js` (`window.DASHZON_TEMAS`, a lista sem os tokens), carregados no `<head>` antes do `style.css` e do `antes.js`; o `style.css` não tem mais cores de tema. Grupos: Básicos (sistema, claro, suave, escuro), Floresta (dia, tarde, noite) e Estações (Vivaldi, outono, inverno, primavera, verão). Automáticos: `sistema` (claro/escuro do aparelho) e `vivaldi` (a estação pela data, hemisfério sul; `antes.js` já abre na estação certa). O botão do topo gira dentro do grupo, com o ícone da `fase` (sol, pôr do sol, lua); segurar o botão, botão direito ou seta para baixo abre o seletor rápido com o mascote (o cubo nas cores de cada tema; setas, Enter, Esc). Nas 8 séries, a 1 é a entrada e a 8 a saída, com matizes bem diferentes em todos os temas. Modo privacidade pela classe `sensivel`.
- **Fonte:** preferência da conta `fonte` (`inter` padrão, `sistema`, `nunito`, `atkinson`; validada por `Usuarios::FONTES`).
  - `js/fonte.js` põe `data-fonte` no `<html>` (que troca `--font-sans`) e guarda a escolha no `localStorage`, para a tela de login já abrir com ela.
  - O Chart.js desenha em `<canvas>` e não herda o CSS: `Fonte.aplicar` define `Chart.defaults.font.family` e redesenha os gráficos depois que o arquivo da fonte carrega.
  - Em Configurações > Aparência, a amostra mostra a fonte antes de salvar.
  - Números com `tabular-nums` (KPIs e colunas alinhados).
- **Tamanho do texto:** preferência da conta `tamanho_fonte` (`pequena` 90%, `normal`, `grande` 115%, `muito_grande` 130%; validada por `Usuarios::TAMANHOS_FONTE`).
  - Todo `font-size` em px do `style.css` é `calc(Npx * var(--fs))`; `js/fonte.js` põe `data-tamanho` no `<html>` (que define `--fs`) e escala o `Chart.defaults.font.size`. O `antes.js` aplica a escolha guardada no navegador antes de desenhar.
  - Só o texto muda: a grade de 12 colunas, a altura das linhas e o layout salvo dos dashboards continuam os mesmos (REGRA §12.1).
  - Números dos KPIs: `clamp(17px, 12.5–13cqi, calc(26–30px * var(--fs)))`; o termo `cqi` faz caber na largura do card, e só o teto cresce com a escala (não corta o número).
  - Campos no celular: `max(16px, …)`, para o tamanho pequeno não provocar o zoom do iOS.
  - Textos de até 12px têm piso de 11px (`max(11px, …)`): o tamanho pequeno não os deixa ilegíveis.
  - `scripts/auditar-responsivo.ps1 -TamanhoFonte muito_grande` audita com o texto maior.
- **Cantos:** `--radius-sm` 8px (botões, campos), `--radius-md` 14px (cartões), `--radius-lg` 20px (janelas). Nos gráficos (a pedido, sem mudar dados nem ordem): linhas com `cubicInterpolationMode: "monotone"` (suaves sem passar dos pontos), barras com `borderRadius` 6, legenda e tooltip arredondados.

### 9.1 Protótipos em React, Next.js e React Native (`prototipos/`)

Experimento, fora do frontend oficial (que continua sem build e sem CDN, §12.6). Workspace npm com três pacotes:

| Pacote | O que é |
|---|---|
| `core` (`@dashzon/core`) | Lógica e temas sem HTML nem CSS, para a web e o celular: `logica.js` (`criarApi(base, credenciais)`, formatação, cópia de `valorDe`, `formatador`, `descricao`, `ordenar`, `opcoesDe`, `resolverToken`, e `criarCores(lerToken)` para as cores do tema) e `temas.js` (os valores de `Usuarios::TEMAS`, a ordem do botão do topo e os tokens de cor de cada tema) |
| `ui` (`@dashzon/ui`) | Telas web compartilhadas (reexporta o `core`; `logica.js` só acrescenta as cores lidas do CSS): `Telas.jsx` (login, moldura com barra lateral, dashboard, tema), `Registros.jsx` (tela do módulo e formulário de registro), `Base.jsx` (ícones SVG, avisos, janela `<dialog>`, confirmação), `Card.jsx` (número, meta, barras, linha, pizza, tabela, calendário com `react-chartjs-2`), `logica.js` (cópia de `valorDe`, `formatador`, `ordenar`, cores, `opcoesDe`, `resolverToken`) e `estilo.css` (tokens do DashZon) |
| `react` | Vite + React 19: rotas por `#hash`; proxy `/api` no `vite.config.js` |
| `next` | Next.js 15 (App Router): `/entrar` e o grupo `(app)` (`/`, `/d/[id]`, `/m/[slug]`), cujo `layout.jsx` é a moldura e fica montado entre as rotas (sessão em `contexto.js`); proxy em `app/api/[...caminho]/route.js` |
| `mobile` | App de celular em React Native (Expo SDK 58, RN 0.88), fora dos workspaces (o React Native exige versões exatas do React); usa o `core` por `file:../core` e o Metro observa `../core`. Parte 1: entrar (endereço do servidor guardado), módulos do menu, registros (busca, cartões, puxar para atualizar), lançar/editar/excluir pelo schema, temas da conta. Parte 2: dashboards (`src/graficos.js` com a lógica do `Card.jsx`, sem React Native; desenho em `react-native-svg`, cards na ordem `y*12 + x`, número/meta estreitos lado a lado) e lembrete diário local (`expo-notifications`, canal no Android, tocar abre o formulário; carregado só se os módulos nativos existem, conferidos com `requireOptionalNativeModule`, porque no Expo Go do Android ele quebra ao carregar). Sem servidor guardado o app abre direto na tela de entrar; a API do celular tem tempo limite de 15 s (`criarApi(base, credenciais, tempoLimite)`). APK testável: `npm run apk` (`apk.ps1`: `expo prebuild` + `gradlew assembleRelease`, assinado com a chave de debug, arm64-v8a e x86_64, saída em `apk/`; `-Http` liga `usesCleartextTraffic` pelo `app.config.js` com `DASHZON_APK_HTTP=1`; pacote `com.dashzon.app`; no Windows usa uma cópia do CMake do SDK com o ninja 1.12, por causa do limite de 260 caracteres). Testes em `mobile/testes/`: `unidade.test.mjs` (Node), `e2e-emulador.mjs` com `emulador.ps1` (`-Apk` testa o APK instalado) (`npm run teste:emulador`: o app nativo no emulador Android pelo Expo Go, via `adb` e a árvore de acessibilidade do uiautomator; `adb reverse` das portas 8081 e da instância), `e2e-web.mjs` (Chromium a 390 e 360 px; só em instância não configurada; confere rolagem, alvos de 44 px e valores cortados), parâmetros em `parametros.mjs` (variáveis `DASHZON_TESTE_*`), tudo por `rodar-testes.ps1` (instância 4581, `data/teste-mobile.db`, recusa 4567 e o banco real). Fala com a API Ruby sem mudança: o app não manda `Origin` (o `Seguranca::Protecao` deixa passar e exige a sessão) e o cookie fica no aparelho. Precisa do servidor em HTTPS. Acessibilidade com as propriedades `aria-*` (o `accessibilityState` antigo o React Native Web ignora) |

- **O que fazem:**
  - **Registros:** resumo, busca (300 ms depois da última tecla, resposta atrasada descartada), até 4 filtros, checklist (`PATCH` só do campo, desfeito se falhar), "Carregar mais", criar/editar/excluir. O formulário sai do schema como no oficial (padrões `$hoje`, opção removida mantida, erro 422 no formulário), "Editar" lê o registro do banco, e o 202 do visualizador vira aviso.
  - **Moldura:** seções que abrem e fecham, barra recolhida (68px, siglas), ordem e módulos ocultos da conta (`ordem_menu`, `modulos_ocultos`), tema que segue o sistema, cada uma no `localStorage`.
  - **Configurações** (`ui/Configuracoes.jsx`, `ui/temas.js`; React `#/config`, Next `/config`): o tema em cartões com prévia (os mesmos valores de `Usuarios::TEMAS`, inclusive os Floresta) e ligar/desligar módulos no menu, gravados em `PUT /api/eu/preferencias` (`tema`, `modulos_ocultos`), as mesmas preferências do oficial. `useTema` segue a conta, acompanha o sistema na escolha "sistema" e o botão do topo gira na família como o `tema.js`. Ao trocar de tela a página volta ao topo.
  - **Calendário:** mesmos números do `renderCalendario` (semanas que cabem na largura, `valorDe`, 4 níveis, sequências); acrescenta hoje marcado, dica na hora, `role=grid` com um dia no Tab (setas, Home, End) e o resumo (total, dias ativos, sequências, melhor dia).
  - **Celular:** até 800px barra no topo e menu em gaveta (fecha com Esc, no véu ou ao navegar); até 640px dashboard em 2 colunas na ordem `y*12 + x` (meia largura para `w <= 3`, só CSS como o `responsivo.js`) e registros em cartões; janelas em tela cheia.
- **O que não fazem:** arrastar e editar cards, editar a estrutura de módulos, painel do adm, o resto das configurações (conta, senha, fonte, tamanho do texto), notas (o módulo de notas aparece como tabela) e aprovações.
- **Teste:** o roteiro de ponta a ponta usa as checagens do `scripts/auditar-responsivo.js` (seletores trocados para `dialog[open]` e `.grade > .card`) em 1280, 768 e 390px.
- **API:** os dois proxies trocam o `Origin` pelo do backend (o `Seguranca::Protecao` recusa escrita de outra origem) e repassam o cookie de sessão. O padrão é a instância de teste (`DASHZON_API`, 4571), nunca o banco real.
- **Lógica:** a de `core/logica.js` é cópia, usada pela web e pelo celular: a referência continua sendo `frontend/js/dashboards.js` (REGRA §12.1).
- **Temas:** `core/temas.js` importa `temas/temas.json` (`with { type: "json" }`, aceito por Node, Vite, Next e Metro) e converte os tokens para os nomes dos protótipos; `cssDosTemas()` gera o CSS da web (injetado no `main.jsx` do React e no `layout.jsx` do Next); `temaEfetivo` resolve os automáticos. Seletor rápido em `ui/SeletorTemas.jsx`.
- **Comparação:** prints em `prototipos/prints/` e comparação no `prototipos/README.md`.
- **Comandos:** `cd prototipos; npm install; npm run react` (porta 5173, só em `localhost`) ou `npm run next` (porta 3000).

## 10. Implantação

| Topologia | Como | Servidor HTTP | Dados |
|---|---|---|---|
| Windows local | `scripts/rodar.ps1`: confere Ruby, faz `bundle check/install`, compila o motor se faltar ou se o código for mais novo, sobe `ruby -rbundler/setup app.rb` oculto e espera `/api/status` (30 s). `-Banco` relativo vale a partir da raiz. Só para processos `ruby` na porta (outro programa: avisa e sai); porta ocupada sem `/api/status` 200 (ex.: migração que falhou): mostra o log em vez de subir outro | WEBrick | `data/`; logs em `log/` (`dashzon.log` = stderr, `bundle.log`, `motor.log`) |
| Docker | Multi-stage: `build` (cmake Release + gems sem teste), `teste` (`docker build --target teste .` roda a suíte), `final` (`ruby:3.4-slim`, usuário uid 1000, `VOLUME /dados`, healthcheck em `/api/status` a cada 30 s com início em 20 s) | Puma | volume `dashzon_dashzon-dados` |
| Docker + domínio | `--profile https`: serviço `caddy:2` nas portas 80/443, proxy para `dashzon:4567`, certificado Let's Encrypt | Puma | volumes `caddy-dados` e `caddy-config` |
| Windows + DuckDNS | `deploy/instalar.ps1` (Caddy com plugin `dns.providers.duckdns`, firewall, tarefa de IP a cada 5 min); `iniciar-publico.ps1` (app em 127.0.0.1:4567, Caddy em 0.0.0.0:2444); `parar-publico.ps1` | WEBrick | `data/` |

- **Atualização:** `git pull` e subir de novo. Um banco v2 migra sozinho na partida.
- **Backup:**
  - Docker: `tar` do volume com o container parado (comandos em `servidor.md`).
  - Local: copiar `data/` (banco + `segredo.key`) com o servidor parado.
  - O export JSON não leva usuários nem senhas.
- **Restauração de versão:** depois de migrar, o código antigo não lê a v3. Para voltar, restaure o `dashzon.db.v2-*.bak`.

## 11. Testes

- **Comando:** `cd backend; bundle exec rake test`. Arquivos `test/**/*_test.rb`: `usuarios`, `documento`, `ambiente`, `cookie_seguro`, `preferencias`, `modulos`, `desempenho`, `registro_codec`, `registros_compactos`, `json_guardado`, `migracao`, `revisao`, `cronograma`, `anotacoes`, `seguranca`. São 210 testes (com `equipes`, `dashboards_acesso`, `cores`, `cards_estudo`, `exemplos`, `acesso`, `pentest_registros`); os do motor dão `skip` se o binário não existir.
- **Importador (Python):** `python -m unittest discover -s scripts -p "test_*.py"` (13 testes: conversão por tipo, leitura de `.xlsx`/`.csv` e as planilhas de `exemplos/`).
- **Isolamento:** `test_helper.rb` define `DASHZON_DB_PATH` num diretório temporário **antes** de carregar o app, zera o banco a cada teste e define `DASHZON_HOSTS=example.org`.
- **`migracao_test`:** monta um banco v2 real e cobre:
  - dados, ids e datas;
  - campo órfão e valores inválidos;
  - cópia de segurança e idempotência;
  - partida em processo novo;
  - falha (nada alterado, sem ir ao setup, sem nova tentativa).
- **Ponta a ponta:** instância separada (outra `PORT` e outro `DASHZON_DB_PATH`), percorrendo setup → módulo → criar, editar e excluir registro → editor de estrutura → dashboard → sair e entrar → celular (gaveta, dashboard empilhado, "×" do modal, **layout salvo intacto**).
- **Responsividade:** `scripts/auditar-responsivo.ps1` (Edge headless via DevTools; 7 larguras × 11 telas = 74 auditorias, com prints em `log/responsivo/`). As checagens estão em `scripts/auditar-responsivo.js`: erros (rolagem horizontal, fora da tela, toque < 24px, texto maior que a caixa, modal que não cabe, card < 150px, botões sobrepostos) e avisos (toque < 36px, campo < 16px, texto < 11px). O loop é repetir até zero erros e revisar os prints. O script recusa instância já configurada.

## 12. Regras de desenvolvimento

### 12.1 Regra fixa: lógica dos dashboards e gráficos

Não alterar a lógica de funcionamento nem a fórmula de organização dos dashboards e gráficos sem pedido explícito:

- **Motor C++** (`engine-cpp/src/main.cpp`): `aggregate`, `multi`, `search`, a forma de agrupar, somar, contar, calcular saldo e montar séries, e o formato da resposta (`result`, `series_keys`, `total_*`).
- **Consulta** (`backend/lib/module_schema.rb`): `normalize_consulta!`, `normalize_widget!` e `engine_query`, isto é, o formato do `config` (`agregacao`, `campo`, `agrupar_por`, `formato_grupo`, `serie_por`, `filtro`). Acrescentados a pedido em 21/10/2026: os tipos `pie` e `calendario`, a meta do `kpi` (`meta`, `periodo`, `campo_data`) e a aparência (`paleta`, `cores`, `cor`), sem mudar o motor nem o resultado dos cards antigos.
- **Desenho e ordem** (`frontend/js/dashboards.js`):
  - funções `valorDe`, `formatador`, `descricao`, `ordenar`, `renderKpi`, `renderTabela`, `renderGrafico`;
  - comportamento: cores por identidade, séries lado a lado até 2 e empilhadas acima disso, limite de grupos;
  - layout GridStack: 12 colunas, `salvarLayout` só com posição/tamanho, `TAMANHO` por tipo.

Melhorias em **como o usuário alimenta** os dashboards são permitidas, desde que gerem o mesmo `config` e reaproveitem essas funções. Mudanças que só alteram **quais dados** chegam ao motor sem alterar o resultado (projeção de campos, cache) também são permitidas, com teste de igualdade. A **apresentação no celular** (`responsivo.js` + CSS, §9) é permitida porque só lê o layout: não chama o GridStack nem grava nada, e o teste de ponta a ponta confere que o layout salvo fica idêntico. Trechos protegidos têm comentário `REGRA:`.

### 12.2 Domínio

- O JSON do usuário vai para `jsons`, comprimido, só pelos helpers (`salvar_json!`, `json_salvo`, `jsons`, `excluir_json!`). Só os templates padrão ficam no git.
- Nome de módulo é único; instalar um template reaproveita o módulo que já existe com o mesmo nome, desde que a pessoa o veja e ele tenha o mesmo alcance do dashboard (§7.0).
- O banco só nasce no setup.
- Banco antigo nunca é apagado: vira `.bak`. Banco com dados nunca cai no `arquivar_versao_antiga!`: mudar o formato exige migração no lugar (§5.5).

### 12.3 Validação dupla (uso real)

1. Antes de mudar: ler o código atual e confirmar o comportamento afetado.
2. Depois de mudar:
   - rodada 1: `bundle exec rake test` + teste de ponta a ponta numa instância separada;
   - corrigir e repetir tudo (rodada 2) num banco zerado.
   - Commit só com as duas rodadas sem falha.
3. Problemas em `desenvolvimento.md` (fora do git); mudanças em `Log.md`.

### 12.4 Contas

- Regras em `lib/usuarios.rb`; as rotas (`rotas/usuarios.rb`) só chamam essas funções.
- Hash sempre (§8); nada disso sai na API (`Usuarios.publico`).
- `segredo.key` / `DASHZON_SESSION_SECRET` não podem ser trocados ou apagados: derrubam as sessões e invalidam o HMAC dos documentos.
- Rota nova de administração vai no prefixo `/api/admin/`.

### 12.5 Backend

- SQL sempre parametrizado (`?`). Acesso ao banco só pelos helpers de `Database` (conexão única). Várias escritas = `Database.transaction`.
- `registros.dados` só por `Database.registros`, `registro`, `inserir_registro`, `atualizar_registro`, `remover_registro`. SQL direto nessa coluna lê/grava no formato errado.
- Todo JSON de cadastro passa por `ModuleSchema`. Nada específico de um template no código.
- Tabela nova em banco existente: `CREATE TABLE IF NOT EXISTS` em `garantir_tabelas!`, sem subir `SCHEMA_VERSION`. Mudar o formato de dados gravados: subir a versão **com** migração em `lib/migracao.rb` (cópia antes, uma transação, `Migracao::Falha`, teste com banco antigo real).
- Erros esperados → 422 em português; nunca stack trace ao navegador.
- Rota aberta nova: entra em `ROTAS_ABERTAS`, com justificativa e limite de tentativas.
- Chamada nova ao motor passa por `CacheResultados.buscar`, com chave completa. Não criar outro mecanismo de invalidação.
- Variáveis de ambiente por `Ambiente[...]`. WAL proibido.
- Limites em toda entrada do usuário.

### 12.6 Frontend

- Sem build e sem CDN. Sem emojis: ícones por `Util.icone` (SVG) ou texto.
- Todo texto do usuário/banco passa por `Util.escapeHtml` antes de `innerHTML` (prefira `textContent`).
- HTTP só pelo `Api`; erros no formulário (`form-erro`) ou em `Util.aviso`.
- Cores só por tokens CSS. `localStorage` só para preferências do navegador.
- Acessibilidade: `<button>` reais, `aria-label`, foco visível, Esc fecha modais.
- Moeda com a classe `sensivel`.
- Ao atualizar uma biblioteca em `vendor/`, mude o nome do arquivo (cache de 1 dia).
- Mudou a interface? Rode `scripts/auditar-responsivo.ps1` numa instância zerada até zero erros e revise os prints. Regras responsivas vão no bloco do fim do `style.css`.

### 12.7 Testes, git e documentação

- Funcionalidade nova no backend vem com teste. Nunca testar contra `data/dashzon.db`. Sintaxe: `ruby -c`, `node --check frontend/js/*.js`.
- Branches: `desenvolvimento` (trabalho), `main` (estável), `producao` (servidor); `desenvolvimentoUI-UX` para a interface dos protótipos React e Next. Push só quando pedido.
- Commits em pt-BR, um por parte pronta (`feat(área)`, `fix(área)`, `test`, `docs`), com o README por último.
- `CHANGELOG.md`: tudo o que entrou, por data e por tipo (Conventional Commits), gerado do `git log` por `python scripts/gerar_changelog.py`. Rode de novo depois de novos commits.
- Manter `docs/DESENVOLVIMENTO.md`, `Sistema.md` e `Log.md` em dia. Comentários explicam o porquê.
