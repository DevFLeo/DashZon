# Changelog do DashZon

Tudo o que entrou no projeto, pela data em que o commit entrou (a mais nova em cima) e, dentro de cada data, por tipo de commit. Gerado do `git log` por `scripts/gerar_changelog.py` (rode de novo depois de novos commits); o **porquê** de cada entrega está no `Log.md`, e os problemas no caminho, no `desenvolvimento.md` (fora do git).

## Metodologia de commit

O projeto segue o [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/):

```
tipo(escopo): descrição curta no imperativo/indicativo, em pt-BR

Corpo opcional: o que mudou e por quê (não o como).

Co-Authored-By: ... (quando houver)
```

| Tipo | Quando usar | Exemplo do projeto |
|---|---|---|
| `feat` | Funcionalidade nova para quem usa | `feat(tema): temas Floresta dia, tarde e noite` |
| `fix` | Correção de defeito | `fix(backend): template privado não grava nos módulos de todos` |
| `perf` | Mesmo resultado, mais rápido ou mais leve | |
| `refactor` | Muda o código sem mudar o comportamento | |
| `test` | Testes novos ou ajustados | `test(backend): suite com Minitest e Rack::Test em banco temporario` |
| `docs` | Só documentação (README, `Sistema.md`, `Log.md`, prints) | `docs: temas Floresta no Sistema.md e no Log.md` |
| `chore` | Manutenção que não muda o produto (dependências, configuração) | |

**Escopos usados:** `backend`, `frontend`, `engine-cpp`, `scripts`, `tema`, `prototipos`, `usuarios`, `readme`, `relatorio`, `log`, entre outros: a parte do sistema que o commit toca.

**Regras do projeto** (`Sistema.md`, seção 12.7):
- um commit por parte pronta (código, depois documentação; o README por último);
- validação dupla antes de commitar: `rake test` e teste no navegador numa instância separada, duas rodadas, banco zerado;
- nada de segredos no git (`.env`, `*.db`, `data/`, `segredo.key`); push só quando pedido;
- sem emojis em lugar nenhum, inclusive nas mensagens.

## Resumo

| Tipo | Commits |
|---|---|
| Novidades (`feat`) | 69 |
| Correções (`fix`) | 22 |
| Desempenho (`perf`) | 1 |
| Refatoração (`refactor`) | 2 |
| Testes (`test`) | 16 |
| Documentação (`docs`) | 73 |
| Manutenção (`chore`) | 4 |
| Fora do padrão | 3 |
| **Total** | **190** |

As **correções** (`fix`) são as issues resolvidas: cada uma descreve o defeito que deixou de existir.

## 2026-10-22

### Novidades (`feat`)

- **mobile:** dashboards e lembretes no app de celular (parte 2) (`af766fa`)
- **mobile:** app de celular em React Native (Expo), parte 1 (`c92afb0`)
- **prototipos:** Configurações com todos os temas e módulos no menu (`81d4b3d`)

### Refatoração (`refactor`)

- **prototipos:** lógica e temas em @dashzon/core, sem HTML nem CSS (`9b7669d`)

### Testes (`test`)

- **mobile:** testes do app com parâmetros, dentro de prototipos/mobile/testes (`7fd5e9c`)

### Documentação (`docs`)

- app de celular parte 2 (dashboards, lembretes, testes) no Sistema.md, Log.md e READMEs (`72422a2`)
- **readme:** app de celular, core e as branches novas (`2f78ffe`)
- **changelog:** commits do app de celular e do core (`cbb2195`)
- app de celular (parte 1) e @dashzon/core no Sistema.md, Log.md e READMEs (`d0f9b21`)
- **readme:** CHANGELOG.md na estrutura do projeto (`33dcde3`)
- CHANGELOG.md com os 179 commits e a metodologia de commit (`92e8246`)
- **prototipos:** README e prints das Configurações (`150b212`)
- Configurações dos protótipos no Sistema.md e no Log.md (`e126596`)

### Manutenção (`chore`)

- **scripts:** gerar_changelog.py monta o CHANGELOG.md do git log (`87b41e6`)

## 2026-10-21

### Novidades (`feat`)

- **frontend:** opção de excluir os módulos junto com o dashboard (`55f17d6`)
- **backend:** excluir o dashboard com os módulos (?modulos=1) (`c1d7e8a`)
- **tema:** temas Floresta dia, tarde e noite (`d7e4301`)
- **frontend:** apagar notas de exemplo e excluir o módulo nas Anotações (`9fef2d4`)
- **frontend:** "Quem vê este dashboard?" explícito ao criar (`6e43984`)
- **scripts:** rodar.ps1 aceita -Endereco (ex.: 127.0.0.2) (`35efb87`)
- **prototipos:** calendário com meses, teclado, dica e resumo do período (`783f4c7`)
- **prototipos:** registros, gaveta no celular e menu recolhivel no React e no Next (`6e45762`)
- **prototipos:** DashZon em React (Vite) e em Next.js, com prints de comparação (`0235c5e`)
- **admin:** lista "Módulos: quem vê" no Painel do adm (`1b4bacf`)

### Correções (`fix`)

- **engine-cpp:** compilar em Release por padrao (`d1ea919`)
- **backend:** template privado não grava nos módulos de todos (`1d079d3`)
- **admin:** consultas do diário em linhas próprias (teste anti-SQL-injection) (`779b287`)
- **admin:** diário registra quem criou, alterou ou excluiu o quê (`bd29a27`)
- **frontend:** perfil visualizador e tela de Aprovações (`f6538f1`)
- **frontend:** compartilhar dashboards e módulos com equipes escolhidas (`1a777bf`)
- **acesso:** visibilidade por equipe, módulos com dono e perfil visualizador (`e85ed5b`)
- **dashboards:** excluir com exemplos avisa de outro dashboard no mesmo módulo (`1e5fae9`)
- **admin:** Criar > Lote de produção abre o dashboard que já existe (`5438590`)
- **conta:** a pessoa vê as próprias equipes em Configurações > Conta (`16ae400`)
- **admin:** escolher se o usuário troca a senha no primeiro acesso (`908441e`)
- **usuarios:** login aceita espaço ("teste 1") e diz o que é aceito (`b7a07df`)

### Documentação (`docs`)

- **log:** motor C++ em Release por padrão de volta (`7ac390a`)
- excluir dashboard com os módulos no Sistema.md e no Log.md (`c1fe2c4`)
- temas Floresta no Sistema.md e no Log.md (`1a24ab7`)
- remover as Anotações e o teste com dois usuários no Sistema.md e no Log.md (`c51fa5d`)
- reaproveitamento de módulo pelo alcance e "Quem vê" no Sistema.md e no Log.md (`0f85139`)
- **prototipos:** README e prints do calendário novo (`97427a7`)
- calendário dos protótipos no Sistema.md e no Log.md (`79c46a7`)
- **prototipos:** README com registros, celular e prints novos (`ee73f7f`)
- protótipos com registros e celular no Sistema.md e no Log.md (`b774251`)
- **readme:** estrutura atualizada, protótipos, branch e próximos passos (`54b9984`)
- protótipos React/Next e publicação no Sistema.md, Log.md e CLAUDE.md (`8c66bff`)
- **relatorio:** teste dos protótipos React e Next (`4693d44`)
- **readme:** quem vê o quê, visualizador com aprovação e diário completo (`9958a5f`)
- acesso por equipe, módulos com dono, visualizador e diário no Sistema.md e no Log.md (`a978300`)
- **relatorio:** situação de cada problema depois das correções (`933ea2b`)
- **readme:** estudos no dashboard, cores, dados de exemplo e regras de senha (`c911865`)
- regras de senha, cores, cards de estudo e dados de exemplo no Sistema.md e no Log.md (`8b6c9d9`)
- relatorio.md com os testes do sistema (tópico 5) (`0b2657a`)

## 2026-10-20

### Novidades (`feat`)

- **frontend:** excluir dashboard oferece apagar os dados de exemplo (`c5955ac`)
- **backend:** dados de exemplo marcados e apagados junto com o dashboard (`e5070aa`)
- **templates:** dashboard Estudos com calendário, meta do mês e matérias (`c1aa520`)
- **frontend:** cards de pizza, calendário de estudo e meta com "quanto falta" (`af0fd65`)
- **backend:** cards de pizza, calendário e meta no card de número (`8f9f9e7`)
- **frontend:** passo "Cores" no editor de card, com "Surpreenda-me" (`84acb04`)
- **backend:** cores do card (paleta, cor por categoria e cor única) (`a2fc456`)
- **frontend:** bloco "Regras de senha" no Painel do adm (`5066834`)
- **backend:** regras de senha viram opções do administrador (`166dddb`)
- **frontend:** cubo 3D transparente girando ao lado da marca (`326b4b6`)

### Refatoração (`refactor`)

- tira o painel "Contribuições do GitHub" (`5a5e53d`)

### Testes (`test`)

- dashboard Estudos do template agora tem 11 cards (`2d574ec`)

## 2026-10-19

### Novidades (`feat`)

- **frontend:** barra lateral em cascata, fixar pelo botão direito, equipes e GitHub (`7de9bff`)
- **backend:** equipes, contribuições do GitHub e ordem do menu (`d4184ae`)
- **scripts:** auditoria de responsividade com -TamanhoFonte (`79e0efd`)
- **frontend:** tamanho do texto em Configuracoes > Aparencia (`240da46`)
- **backend:** preferencia de tamanho do texto (tamanho_fonte) (`cd8e95e`)
- **scripts:** verificador de dashboards para producao e auditoria com Chrome (`9d58b45`)
- **frontend:** fixar ou liberar o layout e compartilhar dashboards (`5a85e72`)

### Correções (`fix`)

- equipe recém-criada não duplica ao salvar de novo; cache do GitHub com limite (`def4e82`)
- **backend:** dashboards por usuario (dono e visibilidade) e layout fixo (`55d265b`)

### Testes (`test`)

- **backend:** isolamento de dashboards entre usuarios e layout fixo (`50c41fa`)

### Documentação (`docs`)

- **readme:** menu lateral, fixar pelo botão direito, equipes e GitHub (`753af25`)
- regra sem emojis, equipes, GitHub e barra lateral no Sistema.md e no Log.md (`200edf2`)
- tamanho do texto no Sistema.md e no Log.md (`18e4840`)
- dashboards por usuario e layout fixo no Sistema.md e no Log.md (`2314653`)

## 2026-10-14

### Correções (`fix`)

- **backend:** recusa de outro site sem derrubar a sessao e JSON com charset utf-8 (`f7ae2f0`)

### Testes (`test`)

- **backend:** origem com porta, esquema e Caddy, sessao apos a recusa e charset do JSON (`3a2f43d`)

### Documentação (`docs`)

- origem das escritas e charset no Sistema.md e Log.md (`dbbefa4`)

## 2026-10-10

### Fora do padrão

- `git pull --rebase origin desenvolvimento` (`ba50991`)

## 2026-10-09

### Novidades (`feat`)

- **frontend:** secao Seguranca no Painel do adm e script do head em arquivo (CSP) (`c32d7e9`)
- **backend:** modulo de seguranca contra forca bruta, CSRF, abuso e senhas fracas (`6a47a42`)
- **frontend:** Configuracoes com abas, modulos ligaveis e caderno de notas em Markdown (`ead3f63`)
- **templates:** Anotacoes em Markdown e cronograma ligado as notas (`b3f2b0b`)
- **backend:** tipo markdown, declaracoes visao/nota/configuracoes e modulos ocultos por usuario (`c5af6c5`)
- **frontend:** troca de fonte em Minha conta, curvas suaves e cantos arredondados (`c876475`)
- **frontend:** fontes Inter, Nunito e Atkinson Hyperlegible offline (`14a69ae`)
- **backend:** preferencia de fonte na conta (`72b1f76`)
- **scripts:** importador de planilhas .xlsx/.csv em Python e planilha de exemplo (`f40689c`)
- **frontend:** checklist na tabela, campo de horario, Carregar mais e edicao lida do banco (`9a18122`)
- **templates:** cronograma de estudos com checklist do que foi estudado (`21bc605`)
- **backend:** tipo hora, ordenacao do modulo, lista paginada e GET/PATCH de um registro (`fe4cea6`)

### Correções (`fix`)

- **scripts:** parar so processos do DashZon e avisar porta ocupada com erro (`c6fd2a2`)
- **backend:** tempo maximo do motor, limite do corpo e da troca de senha (`3b0df37`)
- **scripts:** -Banco relativo resolvido a partir da raiz do projeto (`74ef8e0`)
- **frontend:** opcao removida preservada no formulario e busca sem resposta fora de ordem (`853298d`)
- **backend:** validacao de cadastro, respostas 400/404 e links de uso unico (`5ee890c`)

### Testes (`test`)

- **backend:** varredura contra SQL montado com texto, ataques de SQL pela API, forca bruta, CSP, origem, sessao e senhas (`487f722`)
- **scripts:** auditoria passa pelas abas de Configuracoes e pela tela de notas (`45436d1`)
- **backend:** markdown, declaracoes do modulo, kit de estudos e modulos ocultos (`3005a9d`)
- **backend:** fonte salva na conta e cada fonte com arquivo e regra no CSS (`4e5c638`)
- **backend:** hora, ordenacao, template do cronograma, checklist, leitura do banco e paginacao (`2cb69fe`)
- **backend:** tempo maximo do motor, pipes grandes, 413, limite da troca de senha e SMTP vazio (`2834a72`)
- **backend:** correcoes da revisao e mensagem da falha de migracao (`d06ac88`)

### Documentação (`docs`)

- README com a seguranca em camadas (`1d0c330`)
- seguranca no Sistema.md, guia, DuckDNS, CLAUDE.md e Log.md (`8796223`)
- README com as Anotacoes em Markdown e a pagina de Configuracoes (`7f0f9bf`)
- Configuracoes, modulos ligaveis, Anotacoes e declaracoes do modulo no Sistema.md, guia e Log.md (`bd3bdb5`)
- README com a escolha de fonte e o visual arredondado (`b56db5b`)
- fonte, curvas e cantos no Sistema.md, guia e Log.md (`bddbebb`)
- README com o cronograma de estudos, o checklist e o importador de planilhas (`ead2539`)
- tipo hora, ordenacao, checklist, paginacao e importador no Sistema.md, guia e Log.md (`e95c19d`)
- README lista DASHZON_ENGINE_TIMEOUT (`129bdd0`)
- Sistema.md e Log.md com o tempo maximo do motor, o 413 e os scripts (`5283160`)
- README lista os modulos que faltavam na estrutura (`2dda9c1`)
- limites, codigos de erro, setup antes de publicar e Log.md da revisao (`886eefd`)

## 2026-10-08

### Novidades (`feat`)

- **scripts:** auditoria de responsividade em 7 tamanhos de tela (`7a5996a`)
- **frontend:** interface responsiva para celular, tablet e telas grandes (`af329ac`)
- **backend:** JSON do usuario guardado comprimido na tabela jsons (`ebec5a2`)

### Testes (`test`)

- **backend:** JSON guardado comprimido e migracao das linhas antigas (`3d14479`)

### Documentação (`docs`)

- README cita o uso no celular e a auditoria de responsividade (`58a33e2`)
- responsividade no guia, Sistema.md, CLAUDE.md e Log.md (`b441220`)
- README lista CLAUDE.md, Sistema.md e Log.md (`6208b8d`)
- CLAUDE.md enxuto para operar, Sistema.md tecnico e Log.md de mudancas (`00d6672`)
- README cita a compressao das exportacoes guardadas no banco (`e57b1e0`)
- guia e CLAUDE.md descrevem o JSON do usuario comprimido (`4238259`)

## 2026-10-07

### Novidades (`feat`)

- **backend:** registros compactos e migracao automatica do banco v2 para v3 (`6a6ba66`)

### Testes (`test`)

- **backend:** formato compacto dos registros e migracao do banco v2 (`62e07f4`)

### Documentação (`docs`)

- README explica o formato compacto e a copia de seguranca da migracao (`0dc3444`)
- guia, servidor.md e CLAUDE.md cobrem o banco compacto e a migracao (`b14f9f0`)

## 2026-09-24

### Novidades (`feat`)

- **scripts:** rodar.ps1 sobe/reinicia/para instalando so o que falta (`212b3d2`)
- **docker:** imagem com motor C++ compilado, Puma e Caddy opcional (`c9e056d`)
- **frontend:** tema suave (por do sol) entre o claro e o escuro (`4a606c9`)
- **backend:** preferencia de tema aceita 'suave' (`cee349a`)
- **deploy:** publicacao no DuckDNS com HTTPS pelo Caddy (`c073d9b`)
- **frontend:** botao de tema sol/lua e mais configuracoes em Minha conta (`f98e0a3`)
- **backend:** preferencias da conta e sair dos outros dispositivos (`ebbf4f0`)
- **frontend:** painel do adm, minha conta e troca obrigatoria de senha (`7afb928`)
- **backend:** contas de usuario, painel do adm e hash de dados sensiveis (`5a0fac1`)
- **frontend:** criador de card com previa, lancar pelo dashboard e ajuda (?) (`82db283`)
- **frontend:** prints de previa de cada modulo e tipo de card (`24f4f84`)
- **frontend:** tela de login, botao Sair e novo dashboard por template (`559866b`)
- **backend:** login simulado e JSON do usuario guardado no banco (`77eebb1`)

### Correções (`fix`)

- **backend:** cookie Secure por requisicao no modo publico (`fb053ce`)
- **backend:** modulos com o mesmo nome nao sao mais duplicados (`f791bf2`)

### Desempenho (`perf`)

- **backend:** gzip, cache de resultados do motor e Puma fora do Windows (`9f698dc`)

### Testes (`test`)

- **backend:** cache de resultados, gzip e variaveis de ambiente vazias (`26b4f05`)
- **backend:** preferencias da conta e sair dos outros dispositivos (`17dd65c`)
- **backend:** suite com Minitest e Rack::Test em banco temporario (`bd531e8`)

### Documentação (`docs`)

- README aponta para o servidor.md, Docker e rodar.ps1 (`744c221`)
- guia cobre velocidade, Docker e senha do admin no container (`fc0f777`)
- CLAUDE.md com o "rode o projeto" economico e regras de velocidade (`3fe6822`)
- servidor.md com o passo a passo do servidor e do Docker (`e2d3b23`)
- README cita o tema suave (`30a63b3`)
- guia descreve o tema suave e as tres paletas (`ddd96a0`)
- README com tema sol/lua, preferencias e link do tutorial do dominio (`b0a1a38`)
- guia cobre tema sol/lua, preferencias da conta e publicacao (`fc099bd`)
- tutorial para rodar o DashZon no seu dominio DuckDNS (`b8d0e53`)
- README com contas de usuario, painel do adm e novas perguntas e respostas (`44fe1ca`)
- guia cobre contas de usuario, painel do adm, hash, testes e recuperacao de senha (`a34a2cb`)
- CLAUDE.md com validacao dupla, regras de contas e seguranca (`f839d02`)
- README mais informal, com perguntas e respostas dos perrengues (`c73a51a`)
- README descreve criador de card, Lancar, ajuda (?) e a regra do projeto (`b0e223b`)
- guia cobre a regra, modulos sem duplicar, criador de card, Lancar e ajuda (?) (`9468ccc`)
- regra para nao alterar a logica e a organizacao dos dashboards e graficos (`ed7be85`)
- README descreve login, JSON do usuario no banco e novo dashboard (`ef084c4`)
- guia cobre login simulado, tabela jsons e novo dashboard por template (`b814cc0`)

### Manutenção (`chore`)

- ignora o log local de problemas (desenvolvimento.md) (`623bdf2`)

### Fora do padrão

- `git add backend/Gemfile git add backend/Gemfile.lock git commit -m "Atualiza dependências …` (`abcf75c`)

## 2026-09-23

### Novidades (`feat`)

- **frontend:** construtor de dashboards ligado aos modulos (`1ac47a7`)
- **frontend:** tela generica de modulo gerada pelo schema JSON (`5d9307a`)
- **frontend:** assistente de setup com galeria de templates e navegacao (`14337c0`)
- **frontend:** base visual e utilitarios para a interface por modulos (`42db011`)
- **templates:** templates padrao de financas, caixa, demandas e mapeamento (`834ab62`)
- **backend:** sistema de modulos e templates definidos em JSON (`20d695f`)
- **engine-cpp:** agregacao e busca genericas para qualquer modulo (`e955252`)
- **frontend:** shell da SPA, design system e libs vendorizadas (`3d24993`)
- **backend:** API Sinatra + SQLite para demandas, fluxo de caixa e dashboards (`927d050`)
- **engine-cpp:** motor de busca e agregacao rapida em C++ (`843dced`)

### Documentação (`docs`)

- README descreve a interface nova e os proximos passos (`f971d23`)
- guia de desenvolvimento cobre a nova interface por modulos (`3a394b5`)
- README com visao geral, execucao local/servidor e branches (`c75f327`)
- guia de desenvolvimento com logica, funcoes e tutorial (`9c055cc`)

### Manutenção (`chore`)

- amplia o .gitignore para banco, ambiente, build e editores (`efe1b4a`)
- inicializa repositorio e gitignore (`64b957f`)

### Fora do padrão

- `git add .vscode/launch.json git add .vscode/settings.json git add .vscode/tasks.json git a…` (`87ecec0`)

