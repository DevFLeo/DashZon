# Log de mudanças do DashZon

Registro do **que** foi feito, **quando** e **por quê**. A entrada mais nova fica no topo. Datas no horário local da máquina de desenvolvimento.

Como registrar: uma entrada por entrega (um ou mais commits), com data, branch, commits, o que mudou e a justificativa. Problemas e bugs encontrados no caminho vão para `desenvolvimento.md` (fora do git); aqui fica o resumo do que entrou no projeto.

---

## 2026-10-09 · `desenvolvimento` · Revisão, parte 2: tempo máximo do motor, limites e scripts que não derrubam outros programas

**O que:**
- **Motor:** cada chamada tem tempo máximo (`DASHZON_ENGINE_TIMEOUT`, padrão 60 s). Passou disso, o processo é encerrado e a requisição recebe 500. A saída do motor não muda; só a forma de chamá-lo (`EngineClient.executar`, com entrada e saídas em threads).
- **Corpo da requisição:** até 64 MB (`LimiteCorpo`, 413 acima disso).
- **`PUT /api/eu/senha`:** senha atual errada conta no mesmo limite de tentativas do login.
- **Variáveis:** `DASHZON_SMTP_*` e `DASHZON_COOKIE_SEGURO` lidas por `Ambiente[...]` (só espaços = não definida); `DASHZON_SESSION_SECRET` curta demais gera aviso no log. O valor da chave continua sendo usado exatamente como veio.
- **Scripts:**
  - `rodar.ps1` e `deploy/_comum.ps1` só param processos do DashZon (`ruby`, e `caddy` no deploy); outro programa na porta gera um aviso, sem ser derrubado;
  - `rodar.ps1` com a porta ocupada por um servidor que responde erro (ex.: migração que falhou) mostra o log, em vez de tentar subir um segundo processo.

**Por quê:** restos dos itens 19, 23 e 25 do `desenvolvimento.md`. `Stop-Process -Force` em qualquer dono da porta podia fechar um programa da pessoa.

**Validação:**
- `rake test` 105/105 (5 testes novos: limite na troca de senha, 413, motor travado encerrado, pipes com 4 MB sem travar, SMTP só com espaços);
- ponta a ponta na instância separada, 47/47 em duas rodadas com banco zerado;
- `rodar.ps1` conferido em quatro casos: já no ar, `-Reiniciar`, `-Parar` com outro programa na porta (avisa e não derruba) e subir com a porta ocupada.

---

## 2026-10-09 · `desenvolvimento` · Correções da revisão geral (validação, erros, links e docs)

**O que:**
- **API:**
  - corpo que não é objeto JSON dá 400, e não 500;
  - dashboard ou card inexistente dá 404 (`PUT /api/dashboards/:id`, `POST /api/dashboards/:id/widgets`, `PUT /api/widgets/:id`);
  - erro inesperado responde "Erro interno" e o detalhe vai só para o log (a falha de migração continua mostrando a causa e a cópia).
- **"Remover template"** confere o tipo: não apaga mais uma exportação do histórico.
- **Validação:**
  - `padrao` de campo validado ao salvar a estrutura;
  - números em formato simples (`0x1A` e `1_000` recusados);
  - moeda conferida também no setup;
  - limites de tamanho no módulo (nome, descrição, ícone, campos, opções, ajuda) e no nome do dashboard.
- **Links de uso único:** marcados como usados de forma atômica (duas requisições com o mesmo link: só uma passa).
- **Limite de tentativas:** IP sem falhas na janela sai da memória.
- **Formulário de registro:**
  - um valor de seleção cuja opção saiu da estrutura aparece como "(opção removida)", em vez de ser trocado ou apagado sem aviso;
  - a busca descarta respostas fora de ordem.
- **`-Banco` relativo** no `rodar.ps1` e no `iniciar-publico.ps1`: resolvido a partir da raiz do projeto (antes caía em `backend\`).
- **Docs:**
  - rota `#/verificar-email`;
  - limites e códigos no Sistema.md;
  - estrutura do README;
  - aviso de fazer o setup antes de publicar (servidor.md e DuckDNS);
  - `admin/admin` removido do passo 0.

**Por quê:** revisão geral dos .md e do código (itens 12 a 25 do `desenvolvimento.md`). Ficaram fora, à espera de decisão:
- o arredondamento de números no motor (item 12, **crítico**) e a busca com acento (13), ambos em código protegido pela REGRA;
- a paginação (14);
- o fechamento do setup (15).

**Validação:**
- `rake test` 100/100 (10 testes novos em `revisao_test.rb`; o teste de falha de migração passou a conferir a mensagem);
- ponta a ponta numa instância separada (porta 4570, banco temporário), 47/47 em duas rodadas com banco zerado, incluindo "layout salvo intacto";
- auditoria de responsividade: 74 telas, 0 erros e 0 avisos.

---

## 2026-10-08 · `desenvolvimento` · Interface responsiva (celular, tablet e telas grandes)

**O que:**
- **Celular (até 800px):** barra fixa no topo (☰, marca, tema) e o menu numa gaveta, em vez de ~270px de menus em rolagem horizontal antes de qualquer conteúdo.
- **Dashboard no celular (até 640px):**
  - cards empilhados em ordem de leitura, com os KPIs dois por linha (`js/responsivo.js` + CSS);
  - arrastar e redimensionar desligados nessa faixa;
  - **o layout de 12 colunas e o layout salvo não são tocados** (o script só lê `gs-x/gs-y/gs-w/gs-h`).
- **Modais:** em tela cheia no celular, com o rodapé de botões fixo; "×" no topo de todo modal que pode ser fechado.
- **Toque e campos:**
  - alvos de toque de 36–44px (o (?) ganhou área de 36px com o mesmo círculo);
  - campos com 16px, porque abaixo disso o iPhone dá zoom ao tocar;
  - filtros do módulo dois por linha.
- **Cards:**
  - valores dos KPIs se ajustam à largura do card (*container queries*);
  - as ferramentas do card não ocupam espaço quando escondidas (os títulos dos KPIs apareciam como "Recei..." até em 1024px);
  - no toque, as ferramentas ficam sempre visíveis.
- **Organização do CSS:** o bloco de responsividade foi para o fim do `style.css`, porque regras-base posteriores o anulavam.
- **Auditoria versionada:** `scripts/auditar-responsivo.ps1` + `.js`, com prints e erros medidos em 7 larguras × 11 telas.

**Por quê:**
- Pedido de melhorar a UI/UX com teste de responsividade em loop.
- A auditoria inicial mediu 18 erros e 52 avisos:
  - 6 de 8 cards do dashboard com menos de 150px no celular, ilegíveis;
  - valores de KPI vazando do card;
  - (?) com 18px de área de toque;
  - campos que disparam zoom no iPhone;
  - menus pequenos para o dedo.
- A revisão dos prints achou o que a medição não pega: menu ocupando um terço da tela, títulos cortados, modal em tela cheia sem botão de fechar no topo.

**Loop:**
- Iteração 0: 18 erros / 52 avisos.
- Iteração 1: 4 / 20.
- Iteração 2: 0 / 4.
- Iterações 3, 4 e 5: 0 / 0, com correções visuais entre elas a partir dos prints.

**Validação:** `rake test` 90/90 e navegador 41/41 (35 checagens anteriores + 6 novas de celular, incluindo "layout salvo intacto") nas duas rodadas. No computador (1366px) a tela continua igual à anterior.

---

## 2026-10-08 · `desenvolvimento` · Documentação enxuta para o assistente (`CLAUDE.md`, `Sistema.md`, `Log.md`)

**O que:**
- `CLAUDE.md` reescrito: 119 → ~60 linhas, só com operação (instalar e subir local, Docker, servidor com domínio, DuckDNS), diagnóstico rápido e as proibições críticas.
- As regras completas de desenvolvimento foram para o `Sistema.md`, junto com a especificação técnica (arquitetura, stack, configuração, banco, migração, motor, API, segurança, frontend, implantação, testes).
- Criado este `Log.md`.

**Por quê:**
- O `CLAUDE.md` é carregado em **toda** sessão do assistente. Antes, um pedido simples como "rode o projeto" pagava ~120 linhas de regras de desenvolvimento que não usava. Agora o caminho comum custa pouco, e as regras só são lidas quando há código a mudar.
- A regra dos dashboards (referenciada pelos comentários `REGRA:` no código) continua resumida no `CLAUDE.md`, para essas referências seguirem válidas.
- O `Sistema.md` dá ao assistente e a quem mantém uma referência técnica única, sem o tom de tutorial do `docs/DESENVOLVIMENTO.md`.
- O `Log.md` guarda o histórico com justificativa, o que o `git log` sozinho não traz.

---

## 2026-10-08 · `desenvolvimento` · JSON do usuário comprimido no banco

**Commits:** `ebec5a2` feat(backend) · `3d14479` test(backend) · `4238259` docs · `e57b1e0` docs (README)

**O que:**
- `jsons.conteudo` passou a ser gravado com zlib (módulo `JsonGuardado`), num BLOB na mesma coluna, sem mudar o schema.
- A leitura aceita o texto antigo. A deduplicação de templates compara o texto descomprimido.
- A migração v2 → v3 comprime as linhas antigas na mesma transação, coberta pela mesma cópia de segurança.

**Por quê:**
- Cada "Backup com dados (JSON)" guardava no banco uma cópia completa e verbosa de todos os registros: uma exportação ocupava tanto quanto todos os dados juntos, e o arquivo crescia a cada backup.
- Isso apareceu medindo a migração: o arquivo cresceu enquanto a tabela `registros` encolhia. JSON comprime ~10x.
- Num banco v2 real, a tabela `jsons` foi de 118.784 para 32.768 bytes (−72%), e todas as exportações guardadas baixam idênticas.

**Validação:** `rake test` 90/90 e navegador 35/35, nas duas rodadas. A checagem de mutação detectou as 4 quebras propositais.

---

## 2026-10-07 · `desenvolvimento` · Registros compactos e migração automática do banco (schema v3)

**Commits:** `6a6ba66` feat(backend) · `62e07f4` test(backend) · `b14f9f0` docs · `0dc3444` docs (README)

**O que:**
- `registros.dados` virou array JSON posicional (`RecordCodec`): datas em dias, booleano/movimento em 0/1, inteiros sem `.0`. As posições ficam em `modulos.schema.slots` e só crescem.
- Datas de `registros` viraram inteiros; `atualizado_em` fica nulo enquanto o registro não é editado.
- Novo índice `widgets(dashboard_id)`; `auto_vacuum` incremental (excluir um módulo devolve o espaço); PRAGMAs de cache e mmap. WAL continua desligado.
- Resumos e cards enviam ao motor só os campos usados pela consulta.
- Trocar o tipo de um campo reconverte os registros.
- Datas inexistentes e números infinitos passam a dar 422.
- `lib/migracao.rb` converte um banco v2 no lugar, já na partida do servidor:
  - cópia `dashzon.db.v2-*.bak` antes de alterar;
  - uma única transação, depois `VACUUM`;
  - uma falha vira erro explícito, nunca "não configurado", que arquivaria o banco do usuário;
  - sem nova tentativa a cada requisição.

**Por quê:**
- Pedido: estruturar o banco para ocupar menos espaço e ser eficiente num servidor próprio.
- O formato antigo repetia o nome de todos os campos em todas as linhas, e as datas iam em texto ISO.
- A migração precisava ser automática e segura porque a branch tem uso real: subir a versão do schema sem migração arquivaria o banco de quem já usa.

**Resultado medido:**
- 50 mil lançamentos: 10,5 MB → 4,3 MB; card sem cache de 1,37 s → 0,82 s.
- 100 mil registros migram em 5,6 s (19,7 MB → 8,6 MB), com 0 divergências.
- Um banco v2 criado pelo código anterior da branch voltou idêntico em todos os endpoints depois de migrar.

**Validação:** `rake test` 83/83 e navegador 34/34, nas duas rodadas, mais a checagem de mutação.

**Não portado:** o login feito antes na `main`. A `desenvolvimento` já tinha um sistema de contas mais completo (abaixo), e portá-lo seria retrocesso.

---

## 2026-10-07 · `main` · Login no banco, schema v3 e README (feito a partir da `main` antiga)

**Commits:** `c8ac28f` fix(engine-cpp) · `b5178b9` feat(backend) · `4496d32` feat(frontend) · `a91f9ae` docs · `140fe9c` docs (README), enviados ao GitHub.

**O que:**
- Login com tabelas `usuarios` e `sessoes` (PBKDF2, token de sessão guardado só como SHA-256, papéis leitor/editor/admin, bloqueio por tentativas, `bin/redefinir-senha`).
- Primeira versão do formato compacto e do schema v3.
- Tela de login e conta do admin no primeiro acesso.
- README e guia reescritos.
- `CMakeLists.txt` compilando em Release por padrão: sem isso, em Linux saía `-O0`.

**Por quê:** pedido de melhorar o README, salvar o login no banco e otimizar o banco. A `main` local não tinha nenhum login.

**Atenção:** só depois descobri que a `desenvolvimento` estava 10 commits à frente, com contas próprias. Por isso `main` e `desenvolvimento` divergem: o merge dá conflito em 10 arquivos. A receita para resolver está em `desenvolvimento.md` (manter a versão da `desenvolvimento`).

---

## 2026-09-24 · `desenvolvimento` · Velocidade, Docker e "rode o projeto"

*Reconstruído do histórico do git.*

**Commits:** `9f698dc` perf(backend) · `26b4f05` test · `c9e056d` feat(docker) · `212b3d2` feat(scripts) · `e2d3b23` `3fe6822` `fc0f777` `744c221` docs

**O que:**
- gzip nas respostas e cache de arquivos estáticos;
- cache das respostas do motor C++ (`CacheResultados`);
- Puma fora do Windows;
- imagem Docker (motor compilado, Caddy opcional);
- `scripts/rodar.ps1` (instala só o que falta e sobe com uma linha de saída);
- `servidor.md`.

**Por quê** (segundo os comentários do código e os docs):
- Abrir o processo do motor custa ~10 ms por chamada no Windows, e um dashboard com 8 cards abria 8 processos.
- A interface transferia ~375 KB sem compressão; caiu para ~116 KB.
- Era preciso subir em servidor sem depender do Windows.

## 2026-09-24 · `desenvolvimento` · Temas e preferências

*Reconstruído do histórico do git.*

**Commits:** `ebbf4f0` `17dd65c` `f98e0a3` `cee349a` `4a606c9` `ddd96a0` `30a63b3`

**O que:** botão de tema sol/lua e tema "suave" (fundo creme, contraste menor); preferências salvas na conta (tema, página inicial, privacidade); "sair dos outros dispositivos".

**Por quê:** conforto visual e configurações que acompanham o usuário em qualquer navegador.

## 2026-09-24 · `desenvolvimento` · Publicação na internet (DuckDNS + Caddy)

*Reconstruído do histórico do git.*

**Commits:** `fb053ce` fix(backend) · `c073d9b` feat(deploy) · `b8d0e53` `fc099bd` `b0a1a38` docs

**O que:**
- Scripts para publicar a partir de um PC com Windows, com HTTPS pelo Caddy na porta 2444 e o IP atualizado no DuckDNS.
- Cookie `Secure` decidido por requisição.

**Por quê:** acessar o painel de fora de casa sem servidor pago e sem expor o WEBrick. Com `Secure` em tudo, o acesso local por HTTP deixava de funcionar.

## 2026-09-24 · `desenvolvimento` · Contas de usuário de verdade e testes automatizados

*Reconstruído do histórico do git.*

**Commits:** `5a0fac1` feat(backend) · `bd531e8` test(backend) · `7afb928` feat(frontend) · `f839d02` `a34a2cb` `44fe1ca` docs

**O que:**
- Contas com perfis admin/usuário, painel do administrador e troca obrigatória de senha.
- Hash de senha (PBKDF2), CPF/CNPJ (HMAC) e tokens (SHA-256).
- Suíte Minitest + Rack::Test num banco temporário.
- `CLAUDE.md` com validação dupla.

**Por quê:** o sistema passou a ter uso real por várias pessoas. O login simulado não protegia nada, e mudanças sem teste arriscavam dados reais.

## 2026-09-24 · `desenvolvimento` · Login simulado, JSON no banco, criador de card e regra dos gráficos

*Reconstruído do histórico do git.*

**Commits:** `77eebb1` `559866b` `b814cc0` `ef084c4` · `ed7be85` · `f791bf2` · `24f4f84` `82db283` `9468ccc` `b0e223b` · `c73a51a` · `623bdf2` · `abcf75c`

**O que:**
- Login simulado.
- JSON do usuário (templates importados e exportações) guardado no banco.
- **Regra do projeto:** não alterar a lógica e a organização dos dashboards e gráficos.
- Correção de módulos duplicados.
- Prints de prévia, criador de card com prévia, "Lançar" pelo dashboard e ajuda (?).
- README com perguntas e respostas.
- `desenvolvimento.md` ignorado pelo git.
- Atualização das gems.

**Por quê:**
- Tirar JSON do usuário de arquivos versionados.
- Proteger a lógica dos gráficos depois de ajustada.
- Facilitar a criação de cards sem quebrar essa lógica.

## 2026-09-23 · `main` / `desenvolvimento` · Base do projeto

*Reconstruído do histórico do git.*

**Commits:**
- `64b957f` `843dced` `927d050` `3d24993` `87ecec0`: primeira versão com telas fixas.
- `e955252` `20d695f` `834ab62` `9c055cc` `c75f327`: módulos e templates JSON (`c75f327` é o que está na `producao`).
- `efe1b4a` `42db011` `14337c0` `5d9307a` `1ac47a7` `3a394b5` `f971d23`: interface por módulos.

**O que:**
- Motor C++ de busca e agregação; API Sinatra + SQLite.
- Primeira interface (demandas e fluxo de caixa fixos), depois trocada pelo sistema de módulos e templates JSON.
- 4 templates padrão; interface genérica (setup com galeria, tela de módulo gerada pelo schema, construtor de dashboards).
- Guia de desenvolvimento e README.

**Por quê:** um painel único e multiuso (finanças, caixa, demandas, mapeamento de dados), em que cada área é descrita em JSON em vez de código novo, com as contas pesadas num binário rápido e sem dependências.
