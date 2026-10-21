# Log de mudanças do DashZon

Registro do **que** foi feito, **quando** e **por quê**. A entrada mais nova fica no topo. Datas no horário local da máquina de desenvolvimento.

Como registrar: uma entrada por entrega (um ou mais commits), com data, branch, commits, o que mudou e a justificativa. Problemas e bugs encontrados no caminho vão para `desenvolvimento.md` (fora do git); aqui fica o resumo do que entrou no projeto.

---

## 2026-10-21 · `desenvolvimentoUI-UX` · Dashboard de teste não mistura com os dados de todos

**O que:**
- **Backend:** instalar um template só reaproveita um módulo com o mesmo alcance do dashboard. Privado reaproveita só módulo privado de quem instala; para todos, só módulo de todos. Senão cria "Nome (2)" com os dados de exemplo, e as próximas instalações privadas reaproveitam essa cópia. Dois testes novos em `acesso_test.rb`.
- **Frontend:** na janela "Novo dashboard", "Quem vê este dashboard?" (Só eu / Todos veem) fica no topo, com "Só eu" marcado sempre que ela abre; a confirmação do template diz a escolha.

**Validação:** `rake test` 199/199 duas vezes; roteiro de ponta a ponta com o admin e uma conta comum (10 passos) duas vezes em instância zerada; `auditar-responsivo.ps1` 109 auditorias, 0 erros, 0 avisos.

**Por quê:** o admin criava dashboards de teste privados, mas o template reaproveitava os módulos de todos (Lançamentos): os testes gravavam nos dados compartilhados, outra conta via o resultado, e os dados de exemplo não vinham. Pedido: compartilhar com todos deve ser uma escolha de cada vez, porque às vezes é só teste.

**Não mudou:** o que já estava no banco. Dashboards já criados continuam ligados aos módulos de antes.

---

## 2026-10-21 · `desenvolvimentoUI-UX` · Endereço local no `rodar.ps1`

**O que:** `scripts/rodar.ps1` ganhou `-Endereco` (padrão: `DASHZON_HOST` ou `127.0.0.1`). O script passa o endereço ao servidor (`DASHZON_HOST`, que o `app.rb` já lia) e confere o `/api/status` nele, em vez do `127.0.0.1` fixo.

**Por quê:** pedido de rodar o DashZon em `http://127.0.0.2:4567`. O padrão não mudou, porque o Caddy do modo DuckDNS aponta para `127.0.0.1:4567`.

---

## 2026-10-21 · `desenvolvimentoUI-UX` · Calendário dos protótipos

**O que:** o card de calendário do React e do Next foi refeito a partir do oficial: semanas que cabem na largura, meses, dias da semana, legenda e sequências, com os mesmos números. Por cima disso, pensando em usabilidade, acessibilidade, desejabilidade e utilidade:
- hoje marcado e dica imediata com o valor e a data;
- teclado (Tab cai em hoje; setas, Home, End) e cada dia com rótulo para leitor de tela;
- células arredondadas, transição suave (sem animação com `prefers-reduced-motion`);
- resumo do período: total, dias ativos, sequência atual, maior sequência e melhor dia.

**Validação:** dois passos novos no roteiro de ponta a ponta (desktop e celular), 21 por app; duas rodadas, a segunda com banco zerado: 42/42, zero erros na auditoria responsiva.

**Por quê:** o calendário do protótipo estava pior que o do sistema atual (colunas espaçadas, sem meses nem legenda). Pedido de deixá-lo melhor com os conceitos de UX.

---

## 2026-10-21 · `desenvolvimentoUI-UX` · Protótipos React e Next: registros e celular

**O que:**
- **Branch nova** `desenvolvimentoUI-UX`, a partir da `desenvolvimento-empresa`, para a interface dos protótipos.
- **Tela do módulo** (React e Next, mesmo código em `prototipos/ui/Registros.jsx`): resumo, busca, filtros, checklist, "Carregar mais" e criar/editar/excluir registro, com o formulário montado pelo schema e as mesmas regras do `frontend/js/modulos.js`.
- **Peças de interface** (`ui/Base.jsx`): ícones SVG (sem emojis), avisos que somem sozinhos e janela `<dialog>` com Esc, foco no primeiro campo e confirmação própria no lugar do `confirm()`.
- **Moldura:** seções do menu que abrem e fecham, barra recolhida com siglas, ordem e módulos ocultos da conta, tema que segue o sistema.
- **Celular:** barra no topo e menu em gaveta até 800px; dashboard empilhado na ordem da posição salva e registros em cartões até 640px; formulário em tela cheia.
- **Next:** a moldura virou o layout do grupo `(app)`, então trocar de tela não recarrega a sessão nem pisca "Carregando…".
- **Prints** novos em `prototipos/prints/` (formulário, módulo e menu no celular) e os de login, Finanças, módulo e celular refeitos.

**Validação:** roteiro de ponta a ponta no Chrome headless com 19 passos por app (login, busca, filtro, criar, validar, editar, checklist, excluir, Esc, tema, barra recolhida, gaveta, ordem no celular, auditoria responsiva em 1280/768/390px sem erros, nenhum erro de JavaScript), em duas rodadas, a segunda com banco zerado; `rake test` 197/197 (backend sem mudança).

**Por quê:** pedido de dar continuidade aos protótipos em React e Next numa branch de UI/UX. A lógica dos cards não mudou (REGRA do `CLAUDE.md`): só a apresentação no celular, que lê o layout salvo sem alterá-lo.

---

## 2026-10-21 · `desenvolvimento-empresa` · Protótipos em React e Next.js; publicação

**O que:**
- **Protótipos** em `prototipos/`: o DashZon em React (Vite) e em Next.js (App Router), usando a mesma API Ruby por proxy e os mesmos componentes (`prototipos/ui`):
  - login, barra lateral com o cubo e tema claro/escuro;
  - os cards (número, meta, barras, linha, pizza, tabela, calendário) na grade de 12 colunas;
  - lista de registros de um módulo.
  São só leitura. O frontend oficial não muda e continua sem build.
- **Prints** das mesmas telas no atual, no React e no Next, em `prototipos/prints/`: login, Estudos, Finanças, tema claro, módulo e celular. Nenhum erro de JavaScript nas três versões.
- **Publicação:**
  - a branch `desenvolvimento-empresa` foi enviada ao GitHub (44 commits, conferidos sem banco, `.env`, `data/` nem `segredo.key`);
  - uma página privada compara as três versões lado a lado.
- Medido na compilação: React ~126 KB de JS (gzip); Next ~174 KB na primeira carga.

**Por quê:** pedido de uma versão de teste de como o DashZon ficaria com React e com Next, com prints para comparar, e de publicar o resultado.

---

## 2026-10-21 · `desenvolvimento-empresa` · Correções do relatório de testes

**O que** (os 9 problemas do `relatorio.md`):
1. **Dashboard por equipe:** além de "só eu" e "todos", "equipes escolhidas".
2. **Módulos com dono e "quem vê"** (só o dono, equipes ou todos). O que se cria nasce privado; quem vê um dashboard vê os módulos dos cards dele. Os módulos antigos ficaram "todos" e o Painel do adm ganhou "Módulos: quem vê" para mudar cada um.
3. **Perfil Visualizador** com **Aprovações:** o que ele lança, edita ou apaga vira pedido que o dono do módulo (ou um admin) aprova ou nega, vendo o antes e o depois.
4. Login aceita espaço ("teste 1").
5. Opção "pedir para trocar a senha no primeiro acesso".
6. Diário do adm registra criações, alterações e exclusões, com filtro.
7. "Criar > Lote de produção" abre o dashboard que já existe.
8. Excluir dashboard com exemplos avisa de outro dashboard no mesmo módulo.
9. A pessoa vê as próprias equipes em Configurações > Conta.
- Testes: 197 no backend (novo `acesso_test`); o cenário do relatório repetido numa cópia do banco real: 42/42; ponta a ponta 61/61 em duas rodadas com banco zerado; responsividade 109 telas, 0 erros.

**Por quê:** pedido de resolver os problemas anotados no relatório de testes.

---

## 2026-10-21 · `desenvolvimento-empresa` · Cubo animado, regras de senha, cores, estudos no dashboard e relatório de testes

**O que:**
- **Cubo 3D:** virou um cubo transparente de verdade (seis faces em CSS 3D), girando devagar, com um núcleo que pulsa; parado para quem pede menos movimento.
- **Senha:** só o tamanho mínimo é regra (6 a 64, padrão 8). "Senha forte" (sem as mais comuns, sequências e igual ao login), maiúsculas, números e símbolo viraram opções no Painel do adm, desligadas por padrão. A senha temporária cumpre as regras; as telas mostram o mínimo em vigor.
- **Cores dos cards:** passo "Cores" no editor, com 9 paletas, cor por categoria e "Surpreenda-me". Sem escolha, os gráficos ficam como antes; o resultado do motor é o mesmo (testado).
- **Estudos dentro do dashboard:** o painel do GitHub saiu. Entraram os cards Calendário (um quadradinho por dia), Pizza e Número com meta (do mês ou da semana, com quanto falta), e o dashboard "Estudos" do template ganhou "Calendário de estudo", "Meta de horas do mês" e "Matérias estudadas".
- **Dados de exemplo:** marcados na instalação (e reconhecidos nos bancos que já existiam). Excluir um dashboard oferece apagá-los junto; o módulo tem "Apagar dados de exemplo".
- **Relatório:** `relatorio.md` com os testes pedidos (perfil admin, criação de usuários e equipes, regras por perfil, CNPJ, logs, funções novas, gráficos), feitos numa cópia do banco real. Os problemas encontrados foram só anotados.
- Testes: 188 no backend; ponta a ponta com 61 checagens em duas rodadas com banco zerado; auditoria de responsividade: 109 telas, 0 erros, 0 avisos.

**Por quê:** pedidos do dia: cubo transparente em movimento, senhas fáceis permitidas (forte como opção), cores fáceis de escolher nos cards, acompanhamento de estudos (horas, meta, matérias) no próprio dashboard em vez do GitHub, poder apagar os dados de exemplo junto com o dashboard e um relatório de testes do sistema.

---

## 2026-10-19 · `desenvolvimento-empresa` · Equipes, GitHub, barra lateral em cascata e sem emojis

**O que:**
- **Equipes** (Painel do adm > Criar > Equipe): grupos de usuários; uma equipe pode ser **empresa**, com **CNPJ obrigatório ou não** (guardado só em HMAC + máscara, único). Um usuário fica em nenhuma, uma ou várias equipes; dá para criar o usuário já dentro de equipes ("+ Usuário" na equipe, ou as caixas no formulário) e mudar depois. A tabela de usuários ganhou a coluna **Equipes** ("Nenhuma" quando não está em nenhuma). O menu "Criar" também tem Lote de produção (template novo) e Empresa de teste (CNPJ fictício).
- **Contribuições do GitHub** (seção Estudos do menu): calendário do último ano, como no perfil, com total, dias ativos, sequência atual e maior, e últimos 30 dias. O usuário do GitHub fica na conta; o servidor lê a página pública e guarda por 30 min.
- **Barra lateral:** seções em **cascata** (abrem e fecham pelo título); **arrastar e soltar** dashboards e módulos pela alça, com mouse, dedo ou Alt + seta, numa ordem que fica na conta (`ordem_menu`); botão para **recolher** a barra numa coluna com siglas (só no computador).
- **Botão direito num dashboard** (no menu ou na tela dele), ou toque longo no celular: **"Fixar" / "Fixado"**. O botão do painel continua lá ("Fixar layout" / "Fixado"), sincronizado; o menu mostra um alfinete nos fixados.
- **Celular:** alça sempre visível e com área de toque, toque longo para o menu, cascata sem fechar a gaveta, menu de contexto dentro da tela.
- **Sem emojis:** ícones viraram SVG (`Util.icone`); regra no `CLAUDE.md` e teste `test_interface_sem_emojis`. Símbolo **cubo 3D** à esquerda de "DashZon".
- Revisão: salvar de novo uma equipe recém-criada (se a gravação dos membros falhou) edita a mesma em vez de tentar criar outra; o cache do GitHub guarda no máximo 200 usuários (sai o mais antigo), porque qualquer conta pode consultar qualquer nome.
- Testes: 184 no backend (novos: ordem do menu, sem emojis, equipes, GitHub, limite do cache); ponta a ponta com 61 checagens em duas rodadas com banco zerado (inclui o layout salvo dos dashboards idêntico); auditoria de responsividade: 109 telas, 0 erros, 0 avisos.

**Por quê:** pedido de grupos de usuários (equipe/empresa, CNPJ opcional), de acompanhar os estudos pelo GitHub, de uma barra lateral reorganizável e recolhível, de fixar pelo botão direito e de tirar os emojis da interface.

---

## 2026-10-19 · `desenvolvimento` · Tamanho do texto

**O que:**
- Configurações > Aparência ganha **Tamanho do texto**: Pequeno (90%), Normal, Grande (115%) e Muito grande (130%), com a amostra mudando antes de salvar. Fica na conta (vale em qualquer computador) e no navegador (abre já no tamanho certo).
- Os 74 tamanhos de texto do CSS passaram a seguir a escala `--fs`; os gráficos acompanham (`Chart.defaults.font.size`).
- Só o texto muda: a grade e o layout dos dashboards não mudam (conferido por teste). Os números dos KPIs continuam cabendo no card (só o teto cresce); campos no celular nunca abaixo de 16px.
- `auditar-responsivo.ps1 -TamanhoFonte` para auditar com o texto maior ou menor.

**Por quê:** pedido de "adicionar tamanho de fonte". Também ajuda quem enxerga pior ou usa tela pequena.

---

## 2026-10-18 · `desenvolvimento` · Dashboards por usuário e opção de fixar o layout

**O que:**
- **Correção:** dashboards passam a ter **dono** e **visibilidade**. Um dashboard novo é só de quem criou; dá para **compartilhar com a equipe** (todos veem, só o dono ou um admin alteram). O privado de outra pessoa não aparece nem pelo link (404). Cards, layout e exclusão conferem o acesso pelo dashboard. Admin pode transferir um dashboard para outra conta; excluir uma conta passa os dashboards dela para quem excluiu; a exportação leva só os visíveis.
- **Migração:** os dashboards que já existiam viram "da equipe", do primeiro administrador. Ninguém perde acesso, e o admin pode transferir cada um para quem o criou ou torná-lo privado.
- **Fixar layout:** botão "Fixar layout" / "Liberar movimentação" no dashboard (hoje "Fixar layout" / "Fixado"). Fixado, os cards não se movem nem mudam de tamanho (o servidor também recusa, 409). Quem não pode alterar sempre vê travado e sem editar/remover.
- Na tela: selo "Só você vê" / "Da equipe · criado por X · só leitura", marcas de cadeado/equipe no menu, botão "Compartilhar" (com troca de dono para admin) e a opção "Compartilhar com a equipe" ao criar.
- Abrir o link de um dashboard recém-compartilhado funciona sem recarregar a página (a lista é buscada de novo).
- `scripts/verificar-dashboards.js`: verificador para produção com uma conta comum. `auditar-responsivo.ps1` aceita Chrome (`-Navegador`) quando não há Edge.
- Testes: `test/dashboards_acesso_test.rb` (13); teste de ponta a ponta com 3 pessoas; auditoria de responsividade 0 erros.

**Por quê:** um funcionário criou um dashboard e ele apareceu para o administrador: todos os dashboards eram de todo mundo (a tabela não tinha dono). Também foi pedido poder fixar ou movimentar a organização do dashboard.

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
- **Celular (até 800px):** barra fixa no topo (botão de menu, marca, tema) e o menu numa gaveta, em vez de ~270px de menus em rolagem horizontal antes de qualquer conteúdo.
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
