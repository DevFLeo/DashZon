# Relatório 1 PDZ (Prefeitura DashZ)

Data: 21/10/2026 · Branch: `desenvolvimento-ideiamarvin` (criada a partir de `desenvolvimento-empresa`).

O que foi definido, como foi definido, como alterar, como foi testado, onde deu erro e onde ainda pode dar.

---

## 1. O que foi pedido e onde está

| # | Pedido | Onde ficou |
|---|---|---|
| 0 | Tirar finanças pessoais, fluxo de caixa, cronograma de estudos e lote de produção | Templates, botões do adm, ajuda, prévias e exemplos removidos. Os 3 templates usados nos testes ficaram só em `backend/test/fixtures/` (não aparecem no sistema) |
| 0 | Nome Prefeitura DashZ | Telas, título, setup, documentos. Nomes internos (`DASHZON_*`, `dashzon.db`, `dashzon_engine`) mantidos para não quebrar Docker, scripts e dados |
| 0 | Mapeamento de dados e Gestão de demandas para a prefeitura | `mapeamento-setor.json` (unidades, SEI!, LAI, LGPD, dados abertos) e `gestao-demandas.json` |
| 0 | SEI! (ciência, número, como está) | Módulo **Processos SEI** (nº, assunto, tipo, unidade, situação, ciência e data, onde está, prazo, último andamento, link) e campo "Nº Processo SEI" nas demandas |
| 0 | Banco zerado e ADMTOTAL | Banco anterior guardado como `.bak` (seção 6); sistema novo só com o ADMTOTAL |
| 1 | Secretaria / subsecretaria / departamento / divisão e cascata de privilégios | Estrutura em árvore + papel membro/gestor; regras em `backend/lib/acesso.rb` |
| 2 | Excluir a aba de Anotações com a mesma regra | Botão **Excluir caderno** (e Compartilhar) no caderno; vale a cascata |
| 3 | Tema floresta dia, tarde e noite | Configurações > Aparência e o botão do tema |
| 4 | JSON das demandas do DGEO | Template `gestao-demandas` (seção 2) |
| 4 | Função mestre DGEO -> SUPLAN -> SEMEC | `backend/lib/produtividade.rb` (seção 3) |
| 5 | Tabela de acesso fácil para o gestor | **Painel do gestor** (`#/produtividade`), com CSV e impressão |
| 6 | Classificar por | Tela do módulo: A-Z, criação, alteração, prazo, prioridade, valores |
| 6.1 | Calendário -15/+15, +30, -30, -30/+30 | Botões no card de calendário e na **Agenda** do módulo |
| 6.2 | Trello por departamento | **Quadro** na tela do módulo (filtro de departamento, arrastar ou setas) |
| 7 | Expansão da dashboard | Clicar em barra, fatia, linha ou dia; botão de expandir em todo card |
| 8 | Testes, entidades de teste 2 de cada, relatório, rodar com ADMTOTAL | Seções 4 a 6 |

## 2. O JSON das demandas: o que foi acrescentado

O JSON enviado entrou com os mesmos campos, nomes, opções e resumo. Acréscimos (todos opcionais, explicados no próprio template):

| Acréscimo | Por quê |
|---|---|
| `"unidade": "divisao_responsavel"` | Liga a demanda à unidade pela sigla do começo da opção ("DTAD - Divisão de Tecnologia e Dados" -> DTAD). É isso que faz o Eduardo editar só o DTAD e que alimenta a soma do painel |
| `"produtividade": {...}` | Diz ao painel o que é concluído (`Deferido / Concluído`), o que é encerrado sem conclusão (`Indeferido / Arquivado`) e qual é o prazo (`data_limite`) |
| campo `processo_sei` ("Nº Processo SEI", fora da tabela) | Liga a demanda ao processo no SEI! |
| `configuracoes` | Ajustar opções (divisões, servidores, status, prioridade) em Configurações > Módulos sem editar JSON |
| ícone `oficio_tramitacao` | Guardado como veio; a interface não mostra ícone de módulo |
| dados de exemplo e dois dashboards (Demandas DGEO e Processos SEI) | Só se marcar "com dados de exemplo"; o banco real começou sem eles |

## 3. Função mestre: o que foi definido, como e como alterar

**Regra.** Para cada módulo com `unidade` e `produtividade`:

1. O motor C++ conta os registros por valor do campo de unidade e por status, e por prazo (consulta `multi`, com cache; o motor não mudou).
2. Cada valor vira uma unidade pela sigla (`Unidades.resolver`: sigla exata, primeira palavra antes de " - ", nome exato ou sigla entre parênteses no fim). "DGEO - Gabinete do Diretor" conta no próprio DGEO.
3. O total de uma unidade = o que é dela + tudo das unidades de dentro. Ex.: DGEO = DCAD + DTAD + DASI + gabinete; SUPLAN = DGEO + DIPLAD + DIPEI + o dela; SEMEC = SUPLAN + SURÇAM + o dela.

**Indicadores** (iguais para todas as unidades, para a comparação ser imparcial):

| Indicador | Definição |
|---|---|
| Total | Todos os registros |
| Concluídos | Status em `concluido` |
| Encerrados | Status em `encerrado` (arquivado, indeferido) |
| Em andamento | Total - concluídos - encerrados |
| Atrasados | Em andamento com prazo antes de hoje |
| Vencem em 7 dias | Em andamento com prazo de hoje a hoje + 7 |
| Sem prazo | Em andamento sem data |
| Conclusão | (concluídos + encerrados) / total |

**Quem vê:** administradores (todas as unidades, e uma linha "Sem unidade reconhecida" com os valores que não bateram com nenhuma sigla) e gestores (só o escopo: o Eduardo vê só o DTAD; a Larissa, SUPLAN e SURÇAM e o que há dentro). Membro comum não vê o painel.

**Como alterar:**

| Quero... | Onde |
|---|---|
| Mudar o que é "concluído", "encerrado" ou o prazo | Estrutura (JSON) do módulo, chave `produtividade` |
| Pôr outro módulo no painel | No JSON dele: `unidade` (campo cujo valor começa pela sigla) e `produtividade` |
| Mudar a janela de "vencem em" (7 dias) | `JANELA_VENCIMENTO` em `backend/lib/produtividade.rb` |
| Novo indicador (ex.: tempo médio) | `INDICADORES` e `contar` em `produtividade.rb`, e a coluna em `COLUNAS` de `frontend/js/gestao.js`. Tempo médio precisa de uma data de conclusão no módulo |
| Quem vê o painel | `get "/api/produtividade"` em `app.rb` (hoje: `acesso.gestor?`) |

## 4. Permissões em cascata: o que foi definido

| Papel | Pode |
|---|---|
| Administrador (ADMTOTAL) | Tudo, em todas as unidades. Exceção mantida do DashZon: dashboards e módulos **privados** de outra pessoa continuam só do dono |
| Gestor de uma unidade | Na unidade e em todas abaixo: criar contas (usuário ou visualizador), pôr e tirar pessoas, mudar quem é gestor, desativar, gerar senha temporária, excluir conta de quem está só no seu alcance, criar unidades dentro, editar e excluir as de baixo; editar e excluir registros; alterar módulos e dashboards compartilhados com essas unidades (inclusive excluir caderno de anotações) |
| Membro | Ver o que é compartilhado com a unidade dele (ou com as de cima); lançar e editar registros da própria unidade; excluir só o que ele mesmo lançou |

Para mudar: `backend/lib/acesso.rb` (registros e módulos) e `backend/rotas/gestao.rb` (pessoas e unidades). Cada regra tem teste em `backend/test/prefeitura_test.rb`.

## 5. Testes

| Bateria | Resultado |
|---|---|
| Ruby (`bundle exec rake test`) | **207 testes, 1628 checagens, 0 falhas** (eram 197; entraram 11 novos da prefeitura, saiu 1 que comparava os templates removidos) |
| Importador de planilhas (Python) | **13 testes, 0 falhas** (exemplos agora são demandas do DGEO) |
| Ponta a ponta no navegador (`scripts/e2e-prefeitura.mjs`) | **73 checagens, 0 falhas, duas rodadas com o banco zerado**, sem erro de JavaScript |
| Responsividade (`scripts/auditar-responsivo.ps1`, 7 larguras) | **151 auditorias, 0 erros**, 8 avisos (7 antigos: rótulos "seg/qua/sex" do calendário com 10px) |

**Entidades de teste (2 de cada)** criadas e cruzadas no teste de ponta a ponta e no `prefeitura_test.rb`: `secretariasteste1/2` (SECTESTE1/2), `subsecretariateste1/2`, `departamentoteste1/2`, `divisaoteste1/2`, e os usuários `usuariosecretariateste1/2`, `usuariosubsecretariateste1/2`, `usuariodepartamentoteste1/2` (gestores) e `usuariodivisaoteste1/2` (membros), além de Larissa, Marvin, Eduardo, Hayrine e Davi na estrutura SEMEC. Resultado da interação:

- a divisão 1 lança na divisão 1 e recebe 403 na divisão 2; a divisão 2 não altera a 1;
- o gestor do departamento 1 altera a divisão 1 (cascata) e não a 2; o painel dele mostra só DEPTESTE1 e DIVTESTE1;
- a secretaria 1 soma 1 registro (atrasado) e não enxerga a árvore 2; a secretaria 2 soma 1 concluído (100%);
- Marvin cria pessoa no DCAD pela tela e recebe 403 na SURÇAM; Larissa vê SUPLAN, SURÇAM e tudo abaixo (sem a SEMEC) e desativa a pessoa criada pelo Marvin; Eduardo vê só o DTAD e não lança no DCAD; Hayrine só tem o DCAD no formulário e não exclui demanda de outra pessoa;
- o Marvin exclui pela tela o caderno de anotações que o Eduardo criou e compartilhou com o DTAD.

Prints das duas rodadas em `log/e2e/` e da auditoria em `log/responsivo/` (fora do git).

## 6. Banco de dados e ADMTOTAL

- O banco anterior (`data/dashzon.db`, do DashZon) **não foi apagado**: foi renomeado para `data/dashzon.db.antes-prefeitura-*.bak`, porque o `CLAUDE.md` proíbe apagar banco e as outras branches ainda usam esses dados. Se não precisar mais dele, apague o `.bak` você mesmo.
- O sistema novo começou zerado: setup com o login **ADMTOTAL** (administrador, acesso a tudo), os três modelos instalados **sem** dados de exemplo e nenhuma unidade (crie em Painel do adm > Criar > Estrutura modelo, ou à mão).
- A `segredo.key` foi mantida (ela é por pasta, não por banco).

## 7. Onde deu erro (e foi corrigido)

| Erro | Causa | Correção |
|---|---|---|
| 30 testes falhando antes de qualquer mudança; todo card e toda busca davam 500 | A pasta do projeto tem espaços ("DashZon - Prefeitura DashZ") e existe a pasta irmã `C:\Projetos\DashZon`: o Ruby quebrava o caminho do motor e tentava executar a pasta (EACCES) | `EngineClient.executar` chama o binário sem passar pela linha de comando |
| Publicação pelo DuckDNS quebraria nesta pasta | `Start-Process` do PowerShell 5.1 não põe aspas nos argumentos (caminho do Caddyfile) | Aspas em `deploy/iniciar-publico.ps1` |
| Importador lia a planilha de demandas com o separador errado | O "sniffer" do CSV escolhia "," por causa de "18500,00" | Separador decidido pelo cabeçalho |
| Depois de "Sair", a pessoa podia continuar logada | Sessão em cookie: uma requisição ainda em voo regravava o cookie antigo depois do logout (achado no teste de ponta a ponta) | Cada sessão tem um id; o "Sair" o encerra no servidor (`sessoes_encerradas`) |
| Botões de período do calendário sumiam e o modal de expansão saía estreito | CSS (encolhimento no flex e `max-width` do modal) | Ajustado e conferido nos prints |
| "Data de criação" empatava no mesmo segundo | Datas em segundos | Desempate pelo id |

## 8. Onde ainda pode dar erro

| Risco | Quando acontece | O que fazer |
|---|---|---|
| Demanda sem unidade reconhecida | Uma opção do campo de unidade que não começa pela sigla de nenhuma unidade (ex.: renomear "DTAD - ..." para "Tecnologia") ou unidade ainda não criada | Manter o padrão "SIGLA - Nome". O painel do admin mostra a linha "Sem unidade reconhecida" com os valores. Sem unidade, o registro segue a regra antiga (quem lançou, admin, dono do módulo) |
| Opções "chumbadas" no JSON | Divisões e servidores do JSON das demandas são texto fixo; uma unidade nova não entra sozinha na lista | Configurações > Módulos (campo `configuracoes`) ou Estrutura (JSON). Próximo passo sugerido: um tipo de campo "unidade" que liste a árvore |
| Siglas com acento (SURÇAM) | Digitar "SURCAM" num campo não liga à SURÇAM | Usar a sigla exatamente igual |
| Gestor que também é membro de outra secretaria | Não pode desativar/excluir quem também está fora do alcance dele (de propósito) | Pedir a um administrador |
| Visualizador | Continua no fluxo de aprovação (o dono do módulo ou um admin aprova); a cascata não decide pedidos | Se quiser que o gestor aprove, mudar `Solicitacoes.pode_decidir?` |
| Todos veem os registros de um módulo "Todos veem" | A cascata limita **alterar**, não **ver** (transparência entre as divisões) | Para esconder, compartilhar o módulo só com as unidades (Compartilhar > Unidades escolhidas) |
| Painel com muitos valores | O painel faz uma consulta por valor do campo de unidade (centenas de opções = consultas maiores) | Com cache e projeção de campos; medir se passar de ~100 mil registros |
| Protótipos React/Next | Continuam com a marca e as telas do DashZon | Atualizar se forem seguir |
| Caminhos com espaços em outros scripts | Corrigidos o motor e o Caddy; outros comandos manuais precisam de aspas | Usar aspas nos caminhos |
| Calendário: rótulos "seg/qua/sex" com 10px | Aviso antigo da auditoria | Sem impacto funcional |
| Servidor iniciado pelo assistente cai quando a sessão termina | Limitação do ambiente | `scripts\rodar.ps1`, tarefa do Windows ou Docker |

## 9. Próximos passos sugeridos

1. Tipo de campo `unidade` (lista a árvore em vez de opções fixas).
2. Data de conclusão nas demandas, para "tempo médio de atendimento" no painel.
3. Gestor aprovando os pedidos dos visualizadores da sua unidade.
4. Atualizar os protótipos React/Next com as telas da prefeitura, se forem seguir.
