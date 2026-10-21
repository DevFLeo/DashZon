# Relatório de testes do DashZon

**Data:** 21/10/2026 · **Branch:** `desenvolvimento-empresa` · **Código testado:** até o commit `c5955ac`

**Onde:** numa cópia do banco real (`data/dashzon.db` + `segredo.key`) numa instância separada, na porta 4572. O banco real não foi tocado (regra do `CLAUDE.md`). O teste foi automatizado num navegador Chrome. As ações do admin foram feitas pelas telas, como uma pessoa faria. As verificações de permissão usaram a mesma API que as telas usam.

**Combinado:** onde algo deu errado, **foi só anotado, sem correção**. Os itens estão marcados assim:

- **OK:** está de acordo com o pedido.
- **PROBLEMA:** não está de acordo.
- **OBS:** comportamento que vale saber, mas não é erro.

## Correções (21/10/2026)

Os 9 problemas da lista do fim foram corrigidos. O mesmo cenário foi testado de novo numa cópia nova do banco real: 42 de 42 verificações deram certo. Depois vieram as duas rodadas de validação com banco zerado e a auditoria de responsividade, sem erros.

| # | Problema | Situação | Como ficou | Commits |
|---|---|---|---|---|
| 1 | Visibilidade por equipe | **Corrigido** | Dashboard tem "Só eu", "Equipes escolhidas" ou "Todos". No reteste, Teste 1 vê só o painel da Vermelha, Teste 2 vê Vermelha e Azul, Teste 3 vê só o da Azul, Teste 4 e 5 veem só o do lote. Painéis "Todos" (ex.: Finanças pessoais) continuam visíveis a todos, como escolhido. | `e85ed5b`, `1a777bf` |
| 2 | Módulos e registros de todos | **Corrigido** | Módulo tem dono e "quem vê" (só o dono, equipes ou todos). O que o admin cria nasce só dele, e "Criar > Lote" abre a escolha de quem vê. Quem vê um dashboard vê os módulos dos cards dele. Os módulos que já existiam ficaram "Todos", para ninguém perder acesso: o admin muda cada um em Painel do adm > "Módulos: quem vê". | `e85ed5b`, `1a777bf`, `1b4bacf` |
| 3 | Só visualiza, com aprovação | **Corrigido** | Perfil "Visualizador": não cria dashboards nem módulos. O que ele lança, edita ou apaga vira pedido. O dono do módulo (ou um admin) aprova ou nega na tela **Aprovações**, vendo o antes e o depois. No reteste, o Teste 5 pediu e o Teste 4 aprovou um pedido e negou outro. | `e85ed5b`, `f6538f1` |
| 4 | Login com espaço | **Corrigido** | "teste 1" é aceito (espaços a mais viram um); o campo explica o formato. | `b7a07df` |
| 5 | Troca obrigatória de senha no 1º acesso | **Corrigido** | O formulário tem "Pedir para trocar esta senha no primeiro acesso". Desmarcada, a pessoa entra direto com `123ZX456`. | `908441e` |
| 6 | Diário sem alterações | **Corrigido** | O diário registra quem criou, alterou ou excluiu usuários, equipes, dashboards, módulos, regras, templates e pedidos de aprovação, sem senha. O filtro mostra tudo, só alterações ou só acessos. | `bd29a27`, `779b287` |
| 7 | Lote duplicado | **Corrigido** | Com o lote instalado, "Criar > Lote de produção" abre o dashboard existente. | `5438590` |
| 8 | Exclusão com exemplos sem aviso | **Corrigido** | A janela avisa "Também usado por ..." e deixa "apagar exemplos" desmarcado. | `1e5fae9` |
| 9 | Usuário não vê as próprias equipes | **Corrigido** | Configurações > Conta mostra "Suas equipes" (com empresa e CNPJ mascarado). | `16ae400` |

Continuam como observação (não eram problemas da lista):

- **Gráfico de linha com um único mês:** mostra só pontos (E5).
- **Barras com mais de 8 opções:** o tema tem 8 cores, então da 9ª opção em diante as barras ficam cinza; escolher uma paleta resolve (E6).
- **Consulta de CNPJ por API:** continua só verificada, como pedido.

## Protótipos em React e Next.js (21/10/2026)

Teste à parte, a pedido: como o DashZon ficaria com React e com Next.js (pasta `prototipos/`, só leitura, mesma API). Verificado:

| Verificação | Resultado |
|---|---|
| Compilação de produção dos dois (`vite build`, `next build`) | OK |
| Login pela tela, com a sessão do backend Ruby, nos dois | OK |
| Dashboards Estudos e Finanças, com todos os tipos de card | OK: os mesmos números do frontend atual |
| Tema claro e escuro; celular (390 px) | OK |
| Erros de JavaScript no navegador (atual, React e Next) | Nenhum |

Ajustes feitos durante o teste:

- as séries ficaram na ordem das opções do campo (Entrada antes de Saída), como no atual;
- os cards de número ficaram compactos no celular;
- a barra lateral ficou fixa na altura da página.

Os prints estão em `prototipos/prints/`, e a comparação está no `prototipos/README.md`.

O texto abaixo é o relatório original, de antes das correções.

---

## Resumo

| Parte | Resultado |
|---|---|
| A. Perfil admin: o que o admin cria aparece para os outros | **PROBLEMA**: módulos e registros são de todos; dashboards "da equipe" aparecem para todos |
| A. Criar > Equipe, Lote de produção e Empresa de teste | OK (com 1 OBS) |
| B. Criação dos usuários "teste 1" ... "teste 6" | **PROBLEMA**: login com espaço não é aceito |
| B. Criação de "leonardo" e das equipes | OK |
| C. Regras de visibilidade por equipe (Vermelha / Azul / Lote) | **PROBLEMA**: o sistema não tem visibilidade por equipe |
| C. Teste 4 edita e Teste 5 só visualiza, com aprovação | **PROBLEMA** parcial: não existe fluxo de aprovação |
| C. Teste 6: CNPJ | OK; consulta automática de CNPJ é viável (APIs públicas testadas) |
| D. Logs do Painel do adm | OK para acessos; **PROBLEMA**: criação e alteração não ficam registradas |
| D. Funções novas (2, 3 e 4) | OK |
| E. Gráficos | OK: nenhum card com erro, nenhum erro de JavaScript; 3 OBS |

---

## A. Dentro do perfil ADMIN

| # | Verificação | Resultado |
|---|---|---|
| A1 | Login do `admin` pela tela, com a senha nova | OK |
| A2 | Admin cria um dashboard (padrão: **privado**) | OK: nenhum outro usuário o vê |
| A3 | Admin cria um dashboard compartilhado ("da equipe") | OK no sistema atual, mas ele aparece para **todos** os usuários (ver C) |
| A4 | **Bug relatado:** "o que é criado no perfil do admin aparece nos outros usuários" | **PROBLEMA (confirmado em parte).** Dashboards **privados** do admin não aparecem para ninguém. Já **módulos e registros** são da instalação inteira: o Cronograma, as Anotações e os Lotes que o admin instalou aparecem no menu de **todos** os 7 usuários de teste, com todos os registros. Cada um só consegue "esconder" um módulo do próprio menu (Configurações > Módulos). Dashboard "da equipe" também aparece para todos. |
| A5 | Criar > **Equipe** (pela tela): "Equipe Vermelha", "Equipe Azul" e "Jhorjé Maüro" | OK: criadas; acentos (é, ü) gravados e exibidos certo |
| A6 | Criar > **Lote de produção** | OK: instala o módulo "Lotes de produção" (8 lotes de exemplo) e abre o dashboard "Produção", compartilhado com a equipe |
| A6.1 | Lote quando o módulo já existe | **OBS**: o módulo é reaproveitado (certo), mas **cada clique cria mais um dashboard** ("Produção (2)", "(3)"...). Na cópia já existia um "Produção" e ficou com dois. |
| A7 | Criar > **Empresa de teste** | OK: "Empresa Teste", marcada como empresa, CNPJ obrigatório, CNPJ fictício válido mostrado mascarado (`**.***.380/0001-**`) |

## B. Criação de usuários

Pedido: "teste 1" a "teste 6" e "leonardo", todos com a senha `123ZX456`. Teste 1 e 2 na equipe Vermelha; 2 e 3 na Azul; 4 e 5 no lote de produção "Jhorjé Maüro"; 6 na empresa de teste.

| # | Verificação | Resultado |
|---|---|---|
| B1 | Criar "teste 1" ... "teste 6" pelo Painel do adm | **PROBLEMA.** Os 6 **não foram criados**. O login aceita só letras, números, ponto, hífen e `_` (de 3 a 40), sem espaço. O formulário nem envia; o navegador mostra um balão "É preciso que o formato corresponda ao exigido.", sem dizer o que é aceito. |
| B1.1 | Para continuar o teste | Criados como `teste1` ... `teste6` (sem espaço). **Nada foi mudado no sistema.** |
| B2 | Senha `123ZX456` | OK: aceita (com as regras de senha novas, só o mínimo de 8 vale por padrão) |
| B3 | Criar "leonardo" | OK |
| B4 | Equipes marcadas no cadastro | OK: teste1 = Vermelha; teste2 = Azul e Vermelha; teste3 = Azul; teste4 e teste5 = Jhorjé Maüro; teste6 = Empresa Teste; leonardo = Nenhuma |
| B5 | Tabela do adm mostra a coluna Equipes | OK: mostra as equipes de cada um ou "Nenhuma" |
| B6 | Primeiro acesso | **PROBLEMA (de uso).** Usuário criado pelo painel com senha informada é obrigado a trocar a senha no 1º acesso, e o sistema **não deixa repetir** a mesma senha ("A senha nova precisa ser diferente da atual"). Então ninguém fica com `123ZX456`: no teste, todos trocaram para `123ZX456b`. O formulário não tem a opção "não exigir troca", embora a API aceite `deve_trocar_senha: false`. |
| B7 | "Lote de produção (Jhorjé Maüro)" | **OBS**: "Lote de produção" no sistema é um módulo com um dashboard, não um grupo de pessoas. Por isso foi criada uma equipe "Jhorjé Maüro" para o Teste 4 e o Teste 5, e o dashboard "Produção" ficou como o painel do lote. |

## C. Dentro dos perfis de usuários

**Antes, o que o sistema oferece hoje.** Um dashboard tem só duas opções de compartilhamento:

- **privado:** só o dono vê;
- **da equipe:** **todos os usuários** veem.

Não existe compartilhar com uma equipe específica: as equipes servem hoje só para agrupar pessoas no Painel do adm. Módulos e registros não têm dono: todos veem e todos podem lançar, editar e apagar.

O admin criou "Painel da Equipe Vermelha" e "Painel da Equipe Azul" (como "da equipe", a única opção para compartilhar).

| Usuário | Regra pedida | O que ele vê | Resultado |
|---|---|---|---|
| Teste 1 | só o da Vermelha | Vermelha **e Azul**, Produção, Produção (2), Finanças pessoais, Painel do Admin (equipe) | **PROBLEMA** |
| Teste 2 | Vermelha e Azul | os mesmos 6 | **PROBLEMA** (vê também os do lote) |
| Teste 3 | só o da Azul | os mesmos 6 | **PROBLEMA** |
| Teste 4 | só o painel do lote | os mesmos 6 | **PROBLEMA** |
| Teste 5 | só o painel do lote | os mesmos 6 | **PROBLEMA** |
| Teste 6 | (empresa de teste) | os mesmos 6 | OBS: nada a esconder dele, mas vê tudo |
| Todos | não ver o privado do admin | não veem | OK |
| Todos | módulos | os 9 módulos (Lançamentos, Orçamento, Contas, Demandas, Inventário, Indicadores, Lotes, Cronograma, Anotações) | **PROBLEMA** (é o bug do item A4) |

**Teste 4 e Teste 5 (lote):**

| # | Verificação | Resultado |
|---|---|---|
| C1 | Teste 4 (dono do dashboard "Produção") renomeia, cria card e cria dashboard | OK |
| C2 | Teste 5 tenta renomear o painel do lote ou criar card nele | OK: recusado (403, só leitura) |
| C3 | Teste 5 lança e apaga registros do lote | **PROBLEMA.** Lançou (201) e apagou (200) na hora. Não existe fluxo de "enviar para o Teste 4 aprovar ou negar": registros não têm dono nem aprovação. |
| C4 | Teste 5 cria um dashboard próprio (deveria só visualizar) | **PROBLEMA**: criou (201). Não existe um perfil "só visualiza": todo usuário pode criar os próprios dashboards e lançar registros. |

**Teste 6 (empresa de teste e CNPJ):**

| # | Verificação | Resultado |
|---|---|---|
| C5 | CNPJ com dígito verificador errado | OK: recusado ("CNPJ inválido") |
| C6 | Empresa com CNPJ obrigatório e sem CNPJ | OK: recusado ("Informe o CNPJ...") |
| C7 | Empresa com CNPJ opcional e sem CNPJ | OK: criada |
| C8 | CNPJ válido (Banco do Brasil, 00.000.000/0001-91) | OK: criada, mostrado mascarado (`**.***.000/0001-**`) |
| C9 | O mesmo CNPJ em outra equipe | OK: recusado ("Este CNPJ já está cadastrado na equipe 'Empresa BB'") |
| C10 | CNPJ só com números iguais | OK: recusado |
| C11 | O que o Teste 6 vê da empresa no próprio perfil | **OBS**: nada. Nem a equipe nem o CNPJ aparecem para ele (o `/api/eu` não traz equipes). O Painel do adm é recusado (403), como deve. |

**Consulta de CNPJ por API (só verificado; nada foi alterado):**

| API | Chave | Teste com 00000000000191 | O que traz |
|---|---|---|---|
| BrasilAPI (`brasilapi.com.br/api/cnpj/v1/{cnpj}`) | não | OK com `User-Agent` (sem ele, 403) | razão social, nome fantasia, situação, abertura, CNAE, endereço, porte, capital social, sócios (QSA) |
| CNPJ.ws (`publica.cnpj.ws/cnpj/{cnpj}`) | não (limite de consultas por minuto) | OK | o mesmo, com atualização recente |
| ReceitaWS (`receitaws.com.br/v1/cnpj/{cnpj}`) | não (plano grátis com limite) | OK | o mesmo, em formato mais simples |

**Viável, com três pontos de atenção:**

1. **O CNPJ não fica guardado legível.** Hoje o sistema guarda o CNPJ das equipes só como HMAC (um código irreversível) mais a máscara. Então a consulta teria de ser feita **na hora do cadastro**, com o CNPJ digitado, ou seria preciso passar a guardar o CNPJ legível. CNPJ é dado público de empresa, mas a regra atual de guardar só o HMAC teria de mudar para isso.
2. **A chamada tem de sair do servidor**, porque a CSP só deixa o navegador falar com o próprio DashZon. Precisaria de limite de chamadas, um cache e um tempo máximo de espera.
3. **O que preencher no dashboard:** razão social, nome fantasia, situação, CNAE, cidade/UF, porte, capital e data de abertura caberiam como campos de um módulo "Empresas", com cards de situação e atividade.

## D. Painel do admin (parte 2)

| # | Verificação | Resultado |
|---|---|---|
| D1 | Login com senha errada aparece no diário | OK: "Login errado", com IP e o login identificado (gravado só como HMAC no banco) |
| D2 | Os logins dos 7 usuários de teste aparecem | OK: 14 eventos "Entrou" |
| D3 | Trocas de senha aparecem | OK: 7 eventos "Senha trocada" |
| D4 | Tipos de evento nos últimos 100 | 14 entrou, 18 logins errados (inclui o histórico da cópia), 7 senhas trocadas, 1 bloqueio |
| D5 | Checagens da instalação | OK, com um **alerta esperado**: "Administradores ativos: 1" (recomenda ter outro admin). HTTPS e cookie aparecem como "info" porque o acesso foi local. |
| D6 | O diário registra criar e alterar usuário, equipe, dashboard ou permissão? | **PROBLEMA**: não. O diário só tem eventos de acesso (login, senha, bloqueio). Quem criou ou alterou o quê não fica registrado. |

**Funções novas:**

| Tópico | Verificação | Resultado |
|---|---|---|
| 2 | Com "senha forte" ligada, `12345678` é recusada; desligada, é aceita | OK ("Essa senha é muito comum...") |
| 2 | Mínimo 10 + símbolo: a senha temporária gerada cumpre as regras | OK (12 caracteres, com símbolo) |
| 2 | Bloco "Regras de senha" no Painel do adm | OK |
| 3 | Salvar card com a paleta Neon e uma cor escolhida | OK |
| 3 | "Surpreenda-me" no editor de card | OK (ex.: combinação "Fim de tarde") |
| 4 | Dashboard Estudos novo: calendário, meta do mês e pizza | OK: 11 cards, calendário com 368 dias, "8 de 40 · Faltam 32 para a meta deste mês · 20%", pizza desenhada, nenhum erro |
| 4 | Painel do GitHub removido | OK (`/api/github/contribuicoes` responde 404) |
| 4 | Excluir o dashboard Estudos levando os dados de exemplo | OK: 12 apagados, módulo com 0 registros |
| 4 | Dados de exemplo **já existentes no banco real** foram reconhecidos? | OK: os 9 módulos tiveram todos os registros reconhecidos como exemplo (as quantidades batem com as dos templates; o seu banco hoje só tem dados de exemplo) |
| 4 | **OBS** | O módulo "Cronograma de estudos" era usado por dois dashboards ("Estudos" antigo e o novo). Excluir um deles com "apagar exemplos" esvaziou o módulo, e o outro ficou "Sem dados". A janela de exclusão lista os módulos afetados, mas não avisa que outro dashboard usa o mesmo módulo. |
| 4 | **OBS** | Dashboards "Estudos" que já existiam não ganham os cards novos sozinhos: é preciso criá-los no editor (tipos Pizza, Calendário e Número com meta) ou instalar o template de novo. |

## E. Gráficos (charts)

Todos os dashboards visíveis de cada perfil (admin e os 7 usuários) foram abertos, mais o celular (390 px).

| # | Verificação | Resultado |
|---|---|---|
| E1 | Cards com erro, em todos os dashboards de todos os perfis | OK: nenhum |
| E2 | Gráficos sem tamanho (canvas vazio) | OK: nenhum |
| E3 | Erros de JavaScript no navegador | OK: nenhum. Os avisos no console foram só as respostas 422/403 provocadas pelo próprio teste. |
| E4 | Celular: dashboard Produção | OK: sem rolagem horizontal, 3 gráficos desenhados |
| E5 | **OBS:** gráfico de linha com um único mês (ex.: "Horas por mês" logo depois de instalar) | Mostra só pontos soltos, sem linha (não há dois pontos para ligar) |
| E6 | **OBS:** barras coloridas por uma seleção com mais de 8 opções | Da 9ª opção em diante a cor é cinza (o tema tem 8 cores de série). Escolher uma paleta ou cores no editor resolve. Na pizza isso já foi tratado: sem paleta, uma cor por fatia. |
| E7 | **OBS:** dashboards novos vazios | Mostram "Dashboard vazio" com o botão de criar card (esperado) |

---

## Lista de problemas (nada corrigido)

1. **Visibilidade por equipe não existe.** Dashboard compartilhado é visto por todos; não dá para compartilhar com uma equipe específica (C).
2. **Módulos e registros são de todos.** O que o admin cria aparece no menu e nos dados de todos os usuários (A4). É o bug relatado.
3. **Não existe perfil "só visualiza" nem aprovação.** Qualquer usuário lança, edita e apaga registros e cria dashboards; não há "enviar para aprovar" (C3, C4).
4. **Login com espaço** ("teste 1") é recusado. O formulário só mostra um aviso genérico do navegador, sem dizer o que é aceito (B1).
5. **Primeiro acesso:** criado com senha pelo painel, o usuário precisa trocá-la e não pode repetir a mesma; o formulário não tem "não exigir troca" (B6).
6. **Diário do adm** não registra criação nem alteração de usuários, equipes, dashboards e permissões (D6).
7. **Criar > Lote de produção** cria um dashboard a mais a cada clique quando o módulo já existe (A6.1).
8. **Excluir dashboard com exemplos** não avisa quando outro dashboard usa o mesmo módulo (D, tópico 4).
9. **O usuário não vê as próprias equipes** nem a empresa no perfil (C11).
