# Regras do projeto DashZon

## Regra fixa: não alterar a lógica dos dashboards e gráficos

**Não altere a lógica de funcionamento nem a fórmula de organização dos dashboards e gráficos**, a menos que o pedido seja explicitamente sobre isso. Isso vale para:

- **Motor C++** (`engine-cpp/src/main.cpp`): `aggregate`, `multi`, `search`, a forma de agrupar, somar, contar, calcular saldo e montar séries, e o formato da resposta (`result`, `series_keys`, `total_*`).
- **Consulta** (`backend/lib/module_schema.rb`): `normalize_consulta!`, `normalize_widget!` e `engine_query`, ou seja, o formato do `config` de um widget (`agregacao`, `campo`, `agrupar_por`, `formato_grupo`, `serie_por`, `filtro`).
- **Desenho e ordem** (`frontend/js/dashboards.js`): `valorDe`, `formatador`, `descricao`, `ordenar`, `renderKpi`, `renderTabela`, `renderGrafico` (cores por identidade, séries lado a lado até 2 e empilhadas acima disso, limite de grupos) e o layout do GridStack (12 colunas, `salvarLayout` só com posição/tamanho, `TAMANHO` padrão por tipo).

Melhorias de **como o usuário alimenta** os dashboards (formulários, sugestões, pré-visualização, atalhos de lançamento) são permitidas, desde que **gerem o mesmo `config`** e reaproveitem as funções acima em vez de reimplementá-las. A pré-visualização do criador de card roda a mesma consulta no mesmo motor, só que sobre registros fictícios.

Os trechos protegidos têm um comentário `REGRA:` no código apontando para este arquivo.

## Regras de domínio

- JSON do usuário (templates importados, exportações) vai para a tabela `jsons` do banco, nunca para arquivos versionados. Só os templates padrão em `backend/templates/` ficam no git.
- Nomes de módulo são únicos (sem diferenciar maiúsculas); instalar um template reaproveita o módulo que já tem o mesmo nome.
- O banco só nasce no setup. Nenhuma rota pode criar `data/dashzon.db` antes disso.
- Um banco de schema antigo nunca é apagado: vira `.bak` (`arquivar_versao_antiga!`).

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
- Tabelas novas em bancos existentes: `CREATE TABLE IF NOT EXISTS` via `garantir_tabelas!`, sem subir `SCHEMA_VERSION` à toa. Subir a versão arquiva o banco do usuário.
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

### Segurança

- Senhas só com hash (PBKDF2 com sal); nunca em log, resposta da API ou commit.
- Nada de segredo no repositório: `.env`, bancos (`*.db`), backups e JSON do usuário estão no `.gitignore`. Confira `git status` antes de commitar.
- A sessão usa cookie `httponly` e `same_site: strict`. Em servidor, defina `DASHZON_SESSION_SECRET`.

### Testes e verificação

- Rode `cd backend; bundle exec rake test` antes de commitar mudanças no backend. Funcionalidade nova no backend vem com teste em `backend/test/`.
- Os testes usam um banco temporário (`DASHZON_DB_PATH`). **Nunca teste contra `data/dashzon.db`**, o banco real do usuário.
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
