# Regras do projeto DashZon

## "Rode o projeto" (e "pare o projeto" / "reinicie o projeto")

Quando pedirem para rodar, parar ou reiniciar o projeto, **gaste o mínimo**: um comando, uma linha de resposta.

- **Windows, sem Docker (padrão desta máquina):**
  `powershell -ExecutionPolicy Bypass -File scripts/rodar.ps1` (rodar) · `... -Reiniciar` · `... -Parar`
  O script já instala só o que falta (gems, motor C++), não reinicia se já estiver no ar e imprime **uma linha**.
- **Docker** (se pedirem Docker, ou num servidor Linux): `docker compose up -d --build` e depois `docker compose ps` (deve estar `healthy`). Parar: `docker compose stop`. Com domínio: `--profile https` (ver `servidor.md`).
- **Não** leia arquivos, não explore o repositório, não rode `bundle install`/`cmake`/testes à mão e não abra o navegador para conferir. Responda só com o endereço (ex.: "No ar: http://127.0.0.1:4567").
- Se falhar, a saída do script já traz o fim do log. Só então leia, se precisar, as últimas linhas de `log/dashzon.log` (ou `docker compose logs --tail 30 dashzon`) e diga o que falta (ex.: instalar Ruby/CMake, ver `servidor.md`).
- Nunca apague nem mova `data/` (banco + `segredo.key`) nem rode `docker compose down -v`.
- O passo a passo completo para pessoas está em `servidor.md`.

## Regra fixa: não alterar a lógica dos dashboards e gráficos

**Não altere a lógica de funcionamento nem a fórmula de organização dos dashboards e gráficos**, a menos que o pedido seja explicitamente sobre isso. Isso vale para:

- **Motor C++** (`engine-cpp/src/main.cpp`): `aggregate`, `multi`, `search`, a forma de agrupar, somar, contar, calcular saldo e montar séries, e o formato da resposta (`result`, `series_keys`, `total_*`).
- **Consulta** (`backend/lib/module_schema.rb`): `normalize_consulta!`, `normalize_widget!` e `engine_query`, ou seja, o formato do `config` de um widget (`agregacao`, `campo`, `agrupar_por`, `formato_grupo`, `serie_por`, `filtro`).
- **Desenho e ordem** (`frontend/js/dashboards.js`): `valorDe`, `formatador`, `descricao`, `ordenar`, `renderKpi`, `renderTabela`, `renderGrafico` (cores por identidade, séries lado a lado até 2 e empilhadas acima disso, limite de grupos) e o layout do GridStack (12 colunas, `salvarLayout` só com posição/tamanho, `TAMANHO` padrão por tipo).

Melhorias de **como o usuário alimenta** os dashboards (formulários, sugestões, pré-visualização, atalhos de lançamento) são permitidas, desde que **gerem o mesmo `config`** e reaproveitem as funções acima em vez de reimplementá-las. A pré-visualização do criador de card roda a mesma consulta no mesmo motor, só que sobre registros fictícios.

Os trechos protegidos têm um comentário `REGRA:` no código apontando para este arquivo.

## Regras de domínio

- JSON do usuário (templates importados, exportações) vai para a tabela `jsons` do banco, nunca para arquivos versionados. Só os templates padrão em `backend/templates/` ficam no git. O `conteudo` é gravado **comprimido** (`JsonGuardado`): leia e grave só por `Database.salvar_json!`, `json_salvo`, `jsons` e `excluir_json!`.
- Nomes de módulo são únicos (sem diferenciar maiúsculas); instalar um template reaproveita o módulo que já tem o mesmo nome.
- O banco só nasce no setup. Nenhuma rota pode criar `data/dashzon.db` antes disso.
- Um banco de schema antigo nunca é apagado: vira `.bak` (`arquivar_versao_antiga!`).

## Uso real: validação dupla

O sistema tem uso real (várias pessoas, possivelmente na internet). Toda modificação passa por **validação dupla, em loop**:

1. **Antes de mudar:** leia o código atual e confirme o comportamento que vai mudar (e o que depende dele). Não edite de memória.
2. **Depois de mudar, valide duas vezes:**
   - rodada 1: `bundle exec rake test` + teste de ponta a ponta no navegador numa instância separada;
   - corrija o que falhar e **repita tudo** (rodada 2) num banco zerado. Só commite quando as duas rodadas passarem sem falha.
3. Se algo falhou no caminho, registre em `desenvolvimento.md`.

## Contas de usuário

- Regras de conta ficam em `backend/lib/usuarios.rb`; as rotas (`backend/rotas/usuarios.rb`) só chamam essas funções.
- **Hash sempre:** senha com PBKDF2 (sal por usuário; não mude `ITERACOES`, as senhas gravadas dependem dele), CPF/CNPJ com HMAC da chave do servidor (guardado mascarado para exibir; o número completo nunca é gravado), tokens de link com SHA-256. Nada disso sai na API (`Usuarios.publico`).
- `data/segredo.key` (ou `DASHZON_SESSION_SECRET`) **não pode ser apagado nem trocado** sem necessidade: derruba as sessões e invalida os hashes de CPF/CNPJ.
- Não existe usuário padrão nem senha conhecida. Banco sem usuário pede para criar o primeiro, que nasce administrador.
- Sempre sobra pelo menos um administrador ativo; ninguém se exclui, se desativa ou tira o próprio perfil de administrador.
- Trocar senha, redefinir, desativar: a sessão da pessoa cai na hora (`sessao_versao`).
- Toda rota `/api/admin/*` é só de administrador (filtro no `app.rb`). Rota nova de administração vai nesse prefixo.
- Respostas de login e de "esqueci a senha" não revelam se um usuário existe.

## Boas práticas

### Arquitetura

- **Ruby é dono do banco e das regras; o C++ só faz conta.** O motor nunca abre o SQLite nem conhece módulos específicos. Busca e agregação pesadas vão para o motor, não para loops em Ruby ou JS.
- **Todo JSON de cadastro passa por `ModuleSchema`** (módulos, widgets, registros, templates). Não valide nem converta dados em outro lugar; estenda `ModuleSchema`.
- **Nada específico de um template no código.** Telas e rotas são genéricas e dirigidas pelo schema. Se algo só vale para "finanças", ele pertence ao JSON do template.
- Configuração de ambiente (host, porta, caminho do banco, motor, chave de sessão) sempre por `ENV`, com padrão para localhost. Nada fixo que impeça rodar num servidor.

### Backend (Ruby / Sinatra)

- SQL **sempre parametrizado** (`?`). Nunca interpole valores vindos do usuário numa string SQL.
- Acesse o banco só pelos helpers de `Database` (`rows`, `row`, `execute`, `insert`, `transaction`), que serializam a conexão única. Não abra outra conexão SQLite.
- Operações de várias escritas (instalar template, excluir módulo) ficam dentro de `Database.transaction`: ou tudo ou nada.
- Erros esperados levantam `ModuleSchema::Error` (vira **422** com mensagem em português). 404 para o que não existe, 401 sem login, 409 antes do setup. Nunca devolva stack trace ao navegador.
- Tabelas novas em bancos existentes: `CREATE TABLE IF NOT EXISTS` via `garantir_tabelas!`, sem subir `SCHEMA_VERSION` à toa. Subir a versão sem migração arquiva o banco do usuário.
- Mudança no **formato** de dados já gravados (como o registro compacto da v3) sobe `SCHEMA_VERSION` **e** vem com migração no lugar em `lib/migracao.rb`: cópia de segurança antes, uma única transação, falha vira `Migracao::Falha` (nunca "não configurado") e teste com um banco antigo de verdade (`test/migracao_test.rb`). Quem já tem dados jamais pode cair no `arquivar_versao_antiga!`.
- `registros.dados` é um array compacto (`RecordCodec`, posições em `schema.slots`). Leia e grave **só** por `Database.registros`, `registro`, `inserir_registro`, `atualizar_registro` e `remover_registro`; SQL direto nessa coluna lê/grava no formato errado. Datas de `registros` são inteiros (a API devolve ISO).
- Toda rota nova sob `/api` passa pelo filtro de login. Se uma rota precisar ser aberta, ela entra explicitamente em `ROTAS_ABERTAS` e é justificada no comentário.
- Limites em entradas do usuário (tamanho de texto, quantidade de linhas importadas, tamanho de upload).

### Frontend (HTML/CSS/JS sem build)

- Sem etapa de build e sem CDN: bibliotecas ficam em `frontend/vendor/` para funcionar offline.
- Um arquivo por tela no padrão `const X = (() => { ...; return { ... }; })()`; a ordem de carga está no `index.html` e no guia.
- **Todo texto vindo do usuário ou do banco passa por `Util.escapeHtml`** antes de ir para `innerHTML`. Prefira `textContent` quando não precisar de HTML.
- Chamadas HTTP só pelo `Api` (trata erro e 401). Mostre erros no próprio formulário (`form-erro`) ou com `Util.aviso`, nunca só no console.
- Cores só pelos tokens CSS (`--series-*`, `--text-*`...), que já cobrem tema claro e escuro. Nada de cor fixa em JS.
- `localStorage` só para preferências do navegador (privacidade, aba lembrada). Dados de verdade ficam no backend.
- Acessibilidade: botões de verdade (`<button>`), `aria-label` em ícones, foco visível, Esc fecha modais, e tudo usável pelo teclado.
- Valores em moeda recebem a classe `sensivel` (modo privacidade).

### Velocidade

- Toda chamada nova ao motor C++ passa por `CacheResultados.buscar(...)` (`lib/desempenho.rb`), com a chave incluindo tudo o que muda o resultado (módulo, schema, config/consulta). A validade vem de `Database.versao_dados`: não crie outro mecanismo de invalidação, e não grave no banco por fora da conexão do `Database` sem pensar no cache (outro processo é detectado pelo `PRAGMA data_version`).
- Respostas saem com gzip (`Rack::Deflater`) e os estáticos com cabeçalho de cache (`CacheEstaticos`): `vendor/` e `preview/` guardam por 1 dia, então **mude o nome do arquivo** ao atualizar uma biblioteca em `vendor/`.
- Puma só fora do Windows (`platforms: :ruby` no Gemfile; no Windows exigiria MSYS2); o Sinatra escolhe sozinho entre Puma e WEBrick.
- Não ligue o modo WAL do SQLite: o backup copia só o `dashzon.db`, e com WAL parte dos dados ficaria no `-wal`.
- Variáveis de ambiente se leem com `Ambiente["NOME", padrao]` (`lib/ambiente.rb`): o docker compose passa as opcionais vazias.

### Segurança

- Senhas só com hash (PBKDF2 com sal); nunca em log, resposta da API ou commit.
- Nada de segredo no repositório: `.env`, bancos (`*.db`), `data/` (inclui `segredo.key`), backups e JSON do usuário estão no `.gitignore`. Confira `git status` antes de commitar.
- A sessão usa cookie `httponly` e `same_site: strict`; atrás de HTTPS, `DASHZON_COOKIE_SEGURO=1`.
- Acesso por domínio (ex.: DuckDNS) só com o host listado em `DASHZON_HOSTS`. Na internet, só com HTTPS (Caddy); nunca exponha o WEBrick direto.
- Login e links têm limite de tentativas por IP. Rotas abertas novas também precisam desse limite.

### Testes e verificação

- Rode `cd backend; bundle exec rake test` antes de commitar mudanças no backend. Funcionalidade nova no backend vem com teste em `backend/test/`.
- Os testes usam um banco temporário (`DASHZON_DB_PATH`, definido em `test/test_helper.rb` antes de carregar o app). **Nunca teste contra `data/dashzon.db`**, o banco real do usuário.
- Para testar pela interface, suba uma instância separada (outra `PORT` e outro `DASHZON_DB_PATH`) com dados de exemplo.
- JS: `node --check frontend/js/*.js`. Ruby: `ruby -c` nos arquivos alterados.
- Se um teste manual criou dados no banco real, remova-os e diga isso ao usuário.

### Git e documentação

- Textos da interface, mensagens de erro, comentários e commits em português (pt-BR).
- Trabalhe na `desenvolvimento`; `main` é a estável e `producao` a do servidor.
- Um commit por parte pronta (`tipo(área): resumo`, ex.: `feat(backend): ...`, `fix(frontend): ...`, `docs: ...`, `test: ...`), com o README por último. Push só quando pedido.
- Mantenha `docs/DESENVOLVIMENTO.md` em dia quando a arquitetura, as rotas ou as funções principais mudarem.
- Comentários explicam o **porquê** (decisões e armadilhas), não repetem o que o código já diz.
- **Registre todo problema, bug ou limitação em `desenvolvimento.md`** (raiz do projeto, fora do git), seguindo o modelo do topo do arquivo: quando, onde, sintoma, causa, solução, commit e status. Os que interessam a quem usa o projeto também entram, resumidos, nas "Perguntas e respostas" do README.
