# Log de mudanças do Prefeitura DashZ

Registro do **que** foi feito, **quando** e **por quê**. A entrada mais nova fica no topo. O histórico do DashZon (antes desta versão) continua no git (`git log desenvolvimento-empresa`).

Como registrar: uma entrada por entrega, com data, branch, commits, o que mudou e por quê. Problemas encontrados no caminho vão para `desenvolvimento.md` (fora do git).

---

## 2026-10-21 · `desenvolvimento-ideiamarvin` · Calendário com zoom, sistema sem módulos

**O que:**
- Período do calendário (-15/+15, -30, +30, -30/+30) virou um **zoom do mesmo calendário do ano**, no lugar da faixa de quadros: mesmas cores, meses e legenda, quadradinhos maiores com o número do dia, hoje contornado. O seletor foi para o cabeçalho do card. Os calendários do template ficaram com 4 linhas de altura para o zoom mostrar os números.
- Card "Demandas DASI (Outras Secretarias)" renomeado para "Demandas" (o filtro da DASI continua).
- Sistema real sem módulos e sem dashboards; o setup da tela não vem mais com modelo marcado nem com dados de exemplo.

**Por quê:** pedidos do usuário ("não gostei que veio com os módulos criados"; "o calendário apenas um zoom, igual ao do ano"; "deixe apenas como Demandas").

---

## 2026-10-21 · `desenvolvimento-ideiamarvin` · Prefeitura DashZ (versão 1)

**Commits:** `9f6c4d9` (motor), `27a0688` e `e7d8fbe` (backend e testes), `32b6edc` (frontend e scripts), seguidos dos de documentação.

**O que:**
- **Escopo:** saem finanças pessoais, fluxo de caixa empresarial, cronograma de estudos e lote de produção (templates, atalhos do adm, ajuda, prévias e exemplos). Ficam só como dados de teste (`backend/test/fixtures/`), porque cobrem tipos genéricos do motor (saldo, hora, checklist, calendário, pizza). Nome: **Prefeitura DashZ**.
- **Estrutura da prefeitura:** equipes viram unidades (secretaria, subsecretaria, departamento, divisão, equipe) com sigla e unidade superior; membro ou gestor; estrutura modelo da SEMEC.
- **Permissões em cascata** (`lib/acesso.rb`): o gestor administra a unidade e tudo abaixo (pessoas, registros, módulos e dashboards compartilhados com elas). Registros pela unidade do campo declarado em `unidade` ou de quem lançou (`registro_autores`).
- **Minha equipe** (`rotas/gestao.rb`, `js/gestao.js`): gestor cria contas, põe e tira pessoas, cria unidades dentro, muda quem é gestor.
- **Função mestre** (`lib/produtividade.rb`) e **Painel do gestor**: DGEO -> SUPLAN -> SEMEC, com indicadores iguais para todas as unidades.
- **Templates:** Gestão de Demandas - DGEO (JSON do pedido + `unidade`, `produtividade`, Nº SEI), **Processos SEI**, Mapeamento de dados das unidades (LAI/LGPD), Anotações da unidade.
- **Tela:** Classificar por; Quadro estilo Trello por departamento; Agenda e calendário com -15/+15, -30, +30, -30/+30; expansão da dashboard (clicar e ver os registros); excluir e compartilhar caderno de anotações; temas floresta dia, tarde e noite.
- **Correções:** motor não executava com a pasta do projeto com espaços (todo card dava 500); `Start-Process` do Caddy com caminho com espaços; CSV com vírgula decimal no importador; "Sair" não encerrava a sessão se um cookie antigo voltasse de uma requisição em voo.
- **Testes:** 207 no Ruby (novo `prefeitura_test.rb`), 13 do importador, 73 checagens de ponta a ponta (`scripts/e2e-prefeitura.mjs`, duas rodadas com banco zerado), 151 auditorias de responsividade (0 erros).
- **Banco:** o banco anterior foi apagado, a pedido; o sistema começa zerado, só com o ADMTOTAL.

**Por quê:** pedido de adaptar o sistema para a prefeitura (SEMEC / SUPLAN / DGEO), com cascata de privilégios por unidade, produtividade imparcial por unidade e as melhorias de visualização. Decisões e riscos no `relatorio-PDZ1.md`.
