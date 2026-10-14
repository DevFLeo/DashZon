# Log de mudanças do DashZon

Registro do **que** foi feito, **quando** e **por quê**. A entrada mais nova fica no topo. Datas no horário local da máquina de desenvolvimento.

Como registrar: uma entrada por entrega (um ou mais commits), com data, branch, commits, o que mudou e a justificativa. Problemas e bugs encontrados no caminho vão para `desenvolvimento.md` (fora do git); aqui fica o resumo do que entrou no projeto.

---

## 2026-10-14 · `desenvolvimento` · Recusa de outro site sem derrubar a sessão e JSON com charset

**O que:**
- **Origem das escritas** (`lib/seguranca.rb`, `app.rb`):
  - o `Seguranca::Protecao` compara o `Origin` inteiro (esquema + host + porta) com o endereço da requisição, a mesma regra do `Rack::Protection::HttpOrigin`;
  - o `HttpOrigin` e o `RemoteToken` do Rack::Protection foram desligados; as demais proteções do Sinatra seguem.
- **Charset:** respostas JSON saem como `application/json;charset=utf-8`, inclusive os 403/413/429 dos middlewares.
- **Testes:** outra porta, http/https trocado, sufixo de domínio, Referer de outro site, acesso pelo Caddy (`X-Forwarded-Proto`), sessão de pé depois da recusa e `test_json_declara_utf8`.

**Por quê:** achados na validação antes da produção, com um roteiro pela API numa instância zerada.
- Uma escrita recusada por vir de outro site também derrubava a sessão de quem foi alvo: o Rack::Protection do Sinatra roda antes do nosso middleware e reage descartando a sessão. Com o cookie `SameSite=Strict` isso quase não acontece no navegador, mas recusar já basta, e o 403 em JSON com registro no diário continua só no nosso middleware. A comparação passou a incluir porta e esquema para não perder o que o `HttpOrigin` barrava.
- Sem `charset`, clientes como o PowerShell 5.1 liam o JSON como Latin-1 e estragavam os acentos (o navegador e o importador em Python não eram afetados).

**Validação:** `rake test` (143 testes) + auditoria de responsividade (109 telas, 0 erros) + roteiro pela API (35 verificações), duas rodadas, cada uma num banco zerado.

---

## 2026-10-09 · `desenvolvimento` · Módulo de segurança: força bruta, SQL injection, CSP, origem, sessão e diário

**O que** (`backend/lib/seguranca.rb` + Painel do adm):
- **Força bruta:**
  - contagem por IP (8 em 15 min) e, agora, **por conta** (10 em 15 min, de qualquer IP), o que pega ataques distribuídos;
  - as falhas ficam no banco (`eventos_seguranca`), então reiniciar o servidor não zera mais;
  - login inexistente conta igual e com a mesma mensagem;
  - o login digitado é gravado só como HMAC.
- **SQL injection:**
  - continua tudo parametrizado;
  - o teste novo `test_nenhum_sql_monta_texto_com_dado` varre o backend e falha se aparecer SQL com texto interpolado;
  - outro teste manda ataques clássicos pela API.
- **Middleware `Seguranca::Protecao`:**
  - CSP (`script-src 'self'`, sem inline nem eval; o script do `<head>` virou `js/antes.js`), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS em HTTPS e `Server` sem versão;
  - escrita vinda de outro site (`Origin`) recusada;
  - limite de requisições por IP (`DASHZON_LIMITE_POR_MINUTO`, 1200).
- **Senhas fracas** recusadas: comuns, sequências, repetidas, igual ao login.
- **Sessão** expira depois de 12 h sem uso e, no máximo, em 30 dias (`DASHZON_SESSAO_HORAS`/`_DIAS`).
- **Painel do adm → Segurança:** checagem da instalação (HTTPS, cookie seguro, admins, senhas temporárias, logins errados em 24 h, sessão), bloqueios em vigor com **Desbloquear**, e o diário (logins, falhas, bloqueios, trocas de senha, origem recusada, excesso).

**Por quê:** pedido de "módulos de segurança para impedir SQL injection, brute force e afins".
- O SQL já era parametrizado. O que faltava era uma trava contra regressão: um filtro de texto que bloqueasse `' OR 1=1` quebraria notas legítimas sobre SQL sem proteger nada a mais.
- A força bruta só era contada por IP e em memória: um ataque de muitos IPs, ou um reinício, passava.
- Não havia CSP.

**Bug achado pelos testes:** o hash da conta (hexdigest do OpenSSL) tem codificação binária, e o driver do SQLite o gravava como BLOB. Como BLOB nunca é igual a TEXT, o desbloqueio pelo adm não zerava a contagem. Agora tudo vai como texto UTF-8 (`Seguranca.texto`), com teste próprio. O IP vindo do WEBrick tinha o mesmo risco.

**Validação:**
- `rake test` 142/142 (15 testes novos em `seguranca_test.rb`; os testes de limite antigos passaram para o banco);
- auditoria de responsividade: 109 telas, 0 erros e 0 avisos;
- Edge: 46 checagens de notas, configurações e painel de segurança, com **nenhuma violação de CSP** em todo o roteiro (gráficos, notas, importação, `.zip`), mais 15 de fonte;
- ponta a ponta, 47/47 em duas rodadas com banco zerado;
- o importador Python (sem `Origin`) segue funcionando.

---

## 2026-10-09 · `desenvolvimento` · Configurações com abas, módulos ligáveis e Anotações em Markdown (estilo Obsidian)

**O que:**
- **Configurações** viraram uma página com abas (`#/config/<aba>`): Conta, Aparência, Segurança e **Módulos**, no lugar do modal "Minha conta". Os formulários são os mesmos.
- **Aba Módulos:**
  - cada pessoa liga ou desliga os módulos (preferência `modulos_ocultos`). Desligado, o módulo sai do menu dela; os dados, os cards e os outros usuários não mudam;
  - as **opções de um módulo** só aparecem quando ele está ligado, a partir do que o módulo declara em `configuracoes`. No Cronograma: matérias, atividades (uma por linha, com a que já vem marcada), duração e horário padrão;
  - "Adicionar módulos" instala da galeria o que ainda falta.
- **Anotações em Markdown (template `anotacoes`, também incluído no "Cronograma de estudos"):**
  - tipo de campo `markdown` (até 100 mil caracteres);
  - declaração `visao: notas`: a tela do módulo vira um caderno com pastas e subpastas, tags, busca, editor com prévia (Ler, Editar, Lado a lado), gravação automática, `[[links]]` (que criam a nota se ela não existir), tarefas clicáveis, "Mencionada em", importar `.md` ou uma pasta (cofre do Obsidian) e baixar `.md` ou `.zip`;
  - Markdown renderizado por `js/markdown.js`, sem biblioteca: escapa tudo antes de formatar e só aceita links seguros.
- **Ligação sessão → nota:** declaração `nota` no Cronograma. Cada sessão tem o botão **Nota**, que abre a anotação do assunto ou cria uma na pasta da matéria. Com as Anotações desligadas, o botão some.
- **Editor de estrutura (JSON)** genérico: mostra tudo o que o módulo declara (antes, chaves novas se perderiam ao salvar).
- **Auditoria de responsividade:**
  - passa pelas 4 abas de Configurações e pela tela de notas (109 telas);
  - links dentro de texto Markdown ficam fora da medida de alvo de toque (exceção "inline" da WCAG 2.5.8).

**Por quê:**
- **Pedido:** "melhore as configurações", um módulo específico para estudo e anotações separadas em Markdown como no Obsidian, e o cronograma aparecer nas configurações só quando o módulo estiver selecionado.
- **Escolhas confirmadas com o usuário:** página com abas; ligar módulos nas configurações; notas tipo Obsidian **e** ligação nota ↔ sessão.
- **Por que genérico:** tudo é declarado no JSON do módulo (`visao`, `nota`, `configuracoes`), sem código específico de template (Sistema.md 12.5).

**Validação:**
- `rake test` 127/127 (8 testes novos em `anotacoes_test.rb`, entre eles um que garante o módulo Anotações idêntico nos dois templates);
- `unittest` do importador 13/13;
- auditoria: 109 telas, 0 erros e 0 avisos;
- Edge, 43 checagens:
  - abas de Configurações;
  - desligar e religar um módulo (some e volta no menu e nas opções, e continua desligado depois de recarregar);
  - editar as opções do Cronograma e conferir no banco;
  - árvore de pastas, tags, prévia com tabela e tarefas, "Mencionada em";
  - Markdown sem executar HTML nem `javascript:`;
  - tarefa clicada e texto editado gravados sozinhos;
  - link que cria a nota, voltar do navegador, filtro por tag, busca;
  - criar, renomear e excluir nota;
  - importar `.md` duas vezes (atualiza, não duplica);
  - `.zip` aberto pelo `zipfile` do Python;
  - botão Nota abrindo a nota existente, criando a nova e sumindo com as Anotações desligadas;
  - celular (lista, nota em tela cheia, "← Notas");
- 15 checagens de fonte (agora na aba Aparência);
- ponta a ponta, 47/47 em duas rodadas com banco zerado.

---

## 2026-10-09 · `desenvolvimento` · Fonte nas configurações, curvas mais suaves e cantos arredondados

**O que:**
- **Fonte escolhida em Minha conta → Preferências:**
  - opções: Inter (padrão novo), a do sistema (a de antes), Nunito (arredondada) e Atkinson Hyperlegible (leitura fácil);
  - a escolha fica salva na conta (`preferencias.fonte`, validada) e no navegador; um script no `<head>` aplica antes de desenhar, sem piscar;
  - uma amostra mostra a fonte antes de salvar;
  - os gráficos usam a mesma fonte da tela (antes o Chart.js desenhava em Helvetica/Arial) e são redesenhados quando a fonte carrega.
- **Arquivos das fontes** em `frontend/vendor/fonts/`: offline (regra "sem CDN"), só o subconjunto latino (~120 KB ao todo), licença OFL ao lado, versão no nome do arquivo.
- **Números alinhados** (`tabular-nums`) em KPIs e colunas numéricas.
- **Curvas dos gráficos** (`dashboards.js`, código protegido pela REGRA, alterado **a pedido**; dados, ordem, cores e organização iguais):
  - linhas `monotone`: suaves, mas sem passar acima ou abaixo dos pontos. A curva antiga, com tensão, fazia barrigas e podia descer abaixo de zero entre dois meses;
  - traço um pouco mais grosso, com pontas arredondadas;
  - barras com topo arredondado (raio 6);
  - legenda com bolinhas e tooltip arredondado.
- **Cantos da interface:** botões e campos 6 → 8px, cartões 10 → 14px, janelas 14 → 20px (tokens `--radius-*`).

**Por quê:** pedido de melhorar as curvas (linhas dos gráficos e cantos, as duas coisas) e a fonte, com a troca de fonte nas configurações.

**Também neste pedido (dados, não código):** o nome da organização "Finguia web" foi apagado do banco local (`data/dashzon.db`), pela própria função `Database.atualizar_config!`, a pedido.
- A tela mostra só "DashZon".
- Era o único lugar com esse nome: não havia módulo, dashboard, usuário nem exportação ligados a ele.
- Cópia de antes: `data/dashzon.db.antes-de-tirar-nome-20261009202049.bak`.

**Validação:**
- `rake test` 119/119 (2 testes novos: a fonte salva na conta, e cada fonte com arquivo e regra no CSS);
- auditoria de responsividade: 74 telas com a Inter e os cantos novos, 0 erros e 0 avisos;
- Edge, 15 checagens:
  - login já em Inter;
  - gráficos na fonte da tela e linha `monotone`;
  - amostra muda antes de salvar;
  - salvar troca a tela e os gráficos;
  - a fonte vem da conta num navegador limpo;
  - auditoria do dashboard Estudos nas fontes Nunito, sistema e Inter, em 390 e 1366px;
- prints revisados.

---

## 2026-10-09 · `desenvolvimento` · Cronograma de estudos, checklist, tipo `hora`, paginação e importador de planilhas (Python)

**O que:**
- **Template "Cronograma de estudos"** (`backend/templates/cronograma-estudos.json`):
  - campos: data, horário, matéria, assunto, atividade, duração, **Estudado** e anotações;
  - KPIs: sessões, estudadas, pendentes, horas planejadas e horas estudadas;
  - dashboard "Estudos": horas por matéria e por mês (estudadas × pendentes), sessões por atividade, pendentes por matéria;
  - 12 sessões de exemplo, relativas a hoje.
- **Tipo de campo `hora`** (`HH:MM`; guardado como minutos desde 00:00): `<input type="time">` no formulário. Não agrupa nem filtra cards: a REGRA dos gráficos não mudou.
- **`ordenacao` do módulo** (até 3 critérios): a lista do cronograma segue a ordem do calendário, por data e horário. Sem ela, nada muda (mais novo primeiro).
- **Checklist:** todo campo sim/não aparece na tabela como caixa de marcar. O clique grava só aquele campo (`PATCH /api/modulos/:slug/registros/:id`), atualiza os KPIs e se desfaz em caso de erro.
- **Editar lê do banco** (`GET /api/modulos/:slug/registros/:id`): antes o formulário partia da lista devolvida pelo motor.
  - Isso **tira o risco de corromper dados do item 12** do `desenvolvimento.md` (o motor arredonda números para 6 algarismos).
  - A exibição arredondada na lista continua até o motor ser corrigido.
- **Paginação (item 14):** a lista vem de 200 em 200 (`inicio`/`limite`), com "Carregar mais", e o cache guarda só a página.
- **Importador de planilhas em Python** (`scripts/importar_planilha.py`, só biblioteca padrão):
  - lê `.xlsx` (zip + XML) ou `.csv` (`;`/`,`, UTF-8 ou cp1252);
  - casa as colunas com os campos pelo nome ou id, sem diferenciar acentos e maiúsculas;
  - converte pelo tipo do campo (data e hora do Excel, `DD/MM/AAAA`, `19h30`, `Sim`/`x`/`✓`, `1,5`, `R$ 1.234,56`);
  - grava pela API, com a mesma validação da tela;
  - relata cada linha recusada com o número e o motivo; tem `--simular`.
- **Planilha de exemplo:** `exemplos/cronograma-estudos.xlsx` e `.csv` (14 linhas), geradas por `exemplos/gerar_exemplos.py`. O cabeçalho é o modelo que o módulo espera.

**Por quê:** pedido de uma opção em Python para ler tabelas de Excel/CSV, com uma tabela de exemplo, e de um módulo de cronograma de estudos com tabela, ligado a data e hora, e com acesso ao que foi estudado como checklist.
- O importador fala com a API em vez de abrir o banco, porque o Ruby é o dono do banco e das regras (Sistema.md §1).
- Usar só a biblioteca padrão evita exigir `pip install` de quem só quer importar uma planilha.

**Validação:**
- `rake test` 117/117 (11 testes novos em `cronograma_test.rb`, 1 de paginação);
- `unittest` do importador 13/13 (com Python 3.12);
- ponta a ponta na instância separada, 47/47 em duas rodadas com banco zerado;
- navegador (Edge, instância zerada), 26 checagens:
  - "Carregar mais" até o fim, sem linhas repetidas;
  - ordem de calendário;
  - marcar e desmarcar atualizando o KPI e gravando no banco;
  - filtro Estudado;
  - horário no formulário de edição;
  - registro novo com horário entrando no lugar certo;
- auditoria de responsividade: 74 telas, mais o cronograma e o "Carregar mais" em 390 e 1366px, 0 erros e 0 avisos;
- importador contra o servidor: `.xlsx` e `.csv` com 14/14 cada, CSV com 4 linhas ruins (recusadas com o motivo, as boas gravadas), módulo inexistente, senha errada e servidor fora do ar;
- o `.xlsx` gerado abre no Excel (data, hora, `1,5` e VERDADEIRO/FALSO).

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
