# Prefeitura DashZ: guia de desenvolvimento

Tutorial para quem vai mexer no código. A especificação completa (tabelas, rotas, limites, segurança) está no `Sistema.md`; os comandos de operação, no `CLAUDE.md`; o histórico, no `Log.md`; as decisões desta versão, no `relatorio-PDZ1.md`.

## 1. A ideia

Um painel para as secretarias da prefeitura. O que se controla (demandas, processos SEI, bases de dados, anotações) vem de **templates JSON**; o código só conhece tipos de campo genéricos. Por cima disso, a **estrutura da prefeitura** em árvore (secretaria > subsecretaria > departamento > divisão) define quem vê, quem altera e como os números somam.

```
Navegador (HTML/CSS/JS sem build)  --JSON-->  Ruby/Sinatra (regras, SQLite)  --stdin/stdout-->  motor C++ (conta)
```

## 2. Estrutura e permissões em cascata

| Conceito | Onde | Regra |
|---|---|---|
| Unidade | tabela `equipes` (`tipo`, `sigla`, `pai_id`) | Tipos: secretaria, subsecretaria, departamento, divisão, equipe. Filho nunca acima do pai (divisão não contém departamento). Sigla única. Excluir só sem unidades dentro |
| Papel | `equipe_membros.papel` | `membro` ou `gestor` |
| Escopo | `Acesso#escopo` | Unidades onde a pessoa é gestora e todas abaixo. Admin: todas |
| Alcance | `Acesso#alcance` | Suas unidades, as acima delas e o escopo: é o que ela enxerga do que foi compartilhado |
| Unidade do registro | campo declarado em `unidade` (pela sigla no começo do valor) ou, sem ele, a unidade de quem lançou (`registro_autores`) | ver abaixo |

Registros (`Acesso#registro_editavel?`):

| Quem | Editar | Excluir | Criar |
|---|---|---|---|
| Administrador, dono do módulo, gestor de unidade com que o módulo foi compartilhado | sim | sim | sim |
| Quem lançou | sim | sim | - |
| Gestor da unidade do registro ou de uma acima | sim | sim | na unidade |
| Membro da unidade do registro | sim | não | na unidade |
| Outros | não (403) | não (403) | não (403) |

Exemplo: a gestora da SUPLAN e da SURÇAM administra tudo abaixo das duas; o gestor do DGEO administra DGEO, DCAD, DTAD e DASI; o gerente (gestor) do DTAD, só o DTAD. Isso vale para pessoas (Minha equipe), registros, módulos e dashboards compartilhados com unidades (incluindo excluir um caderno de anotações).

Para mudar a regra, mexa só em `backend/lib/acesso.rb` e rode `test/prefeitura_test.rb`.

**Estrutura em texto** (`Equipes.criar_arvore!`, `POST /api/admin/equipes/arvore`, `POST /api/gestao/arvore`; tela em `js/estrutura.js`): uma unidade por linha, `SIGLA - Nome`, recuo = dentro, `| tipo` opcional (sem ele, o tipo desce um nível a cada recuo: secretaria, subsecretaria, departamento, divisão). Sigla existente é reaproveitada (não renomeia nem move). Tudo numa transação; o erro diz a linha. `GET /api/admin/equipes/texto[?raiz=id]` devolve o modelo SEMEC ou uma estrutura existente nesse formato (base para copiar). `DELETE /api/admin/equipes/:id?cascata=1` exclui a árvore inteira.

**Unidades do campo** (`PUT /api/modulos/:slug/unidades` com `raiz_id` e `nome` opcional): troca as opções do campo declarado em `unidade` por "SIGLA - Nome" das unidades da estrutura escolhida; opções que estão em registros ficam no fim.

## 3. Formato do template

```json
{
  "formato": "dashzon-template", "versao": 1, "id": "meu-template", "nome": "Meu template",
  "modulos": [ { "slug": "...", "nome": "...", "campos": [ ... ], "resumo": [ ... ], "seed": [ ... ] } ],
  "dashboards": [ { "nome": "Visão geral", "widgets": [ ... ] } ]
}
```

Campos: `texto`, `texto_longo`, `markdown`, `numero`, `moeda`, `data`, `hora`, `selecao` (com `opcoes`), `booleano`, `movimento`. `padrao` aceita `$hoje`, `$hoje-30`, `$hoje+7`.

Declarações opcionais do módulo:

| Chave | Exemplo | Efeito |
|---|---|---|
| `unidade` | `"divisao_responsavel"` | Liga o registro a uma unidade pela sigla do valor ("DTAD - Divisão de..." -> DTAD). Dá a permissão em cascata e a soma do painel |
| `produtividade` | `{"status": "status_tramitacao", "concluido": ["Deferido / Concluído"], "encerrado": ["Indeferido / Arquivado"], "prazo": "data_limite"}` | Põe o módulo no Painel do gestor |
| `ordenacao` | `[{"campo": "prazo", "direcao": "asc"}]` | Ordem padrão da tabela (o "Classificar por" da tela muda por pessoa) |
| `visao` | `{"tipo": "notas", "titulo": ..., "conteudo": ..., "pasta": ...}` | O módulo vira caderno de notas |
| `nota` | `{"modulo": "anotacoes", "titulo": "..."}` | Botão "Nota" em cada registro |
| `configuracoes` | `["divisao_responsavel"]` | Opções ajustáveis em Configurações > Módulos |

Templates padrão (`backend/templates/`): `gestao-demandas` (Gestão de Demandas - DGEO, com o JSON do pedido, e Processos SEI), `mapeamento-setor` (inventário de dados com LAI/LGPD e indicadores) e `anotacoes`. Para um template novo aparecer na galeria, salve em `backend/templates/` e libere no `.gitignore`. Valide antes com `POST /api/templates/validar`.

## 4. Função mestre (Painel do gestor)

`backend/lib/produtividade.rb`: para cada módulo com `unidade` + `produtividade`, uma consulta `multi` ao motor conta por valor da unidade e status, e por prazo. Cada valor vira uma unidade (`Unidades.resolver`); o total de uma unidade é o dela mais o de todas as de dentro. Indicadores: total, em andamento, concluídos, encerrados, atrasados, vencem em 7 dias, sem prazo e taxa de conclusão. Rota: `GET /api/produtividade[?modulo=slug]` (gestores e admin; o gestor vê só o escopo). Detalhes e como alterar: `relatorio-PDZ1.md`.

## 5. Arquivos

| Arquivo | O que faz |
|---|---|
| `backend/app.rb` | Rotas de módulos, registros (com permissão por unidade e "Classificar por"), dashboards, widgets, templates, setup, produtividade, diário |
| `backend/rotas/usuarios.rb` | Login, conta, painel do adm (usuários com unidades e gestor) |
| `backend/rotas/equipes.rb` | Estrutura no painel do adm (CRUD, membros e gestores, estrutura modelo) |
| `backend/rotas/gestao.rb` | Minha equipe: o gestor dentro do escopo |
| `backend/lib/unidades.rb` | Árvore: descendentes, ancestrais, caminho, resolver sigla |
| `backend/lib/equipes.rb` | Validação e gravação das unidades e dos membros |
| `backend/lib/acesso.rb` | Quem vê e quem altera (cascata) |
| `backend/lib/produtividade.rb` | Função mestre |
| `backend/lib/module_schema.rb` | Validação de módulos, widgets, consultas e registros (trechos `REGRA:` protegidos) |
| `engine-cpp/src/main.cpp` | Motor: `aggregate`, `multi`, `search` (protegido) |
| `frontend/js/gestao.js` | Painel do gestor e Minha equipe |
| `frontend/js/quadro.js` | Quadro (Trello por departamento) e Agenda |
| `frontend/js/expandir.js` | Expansão de card (registros por trás de uma barra, fatia, linha ou dia) |
| `frontend/js/dashboards.js` | Dashboards (protegido; a expansão e os períodos do calendário entraram a pedido) |
| `frontend/js/modulos.js` | Tela do módulo, Classificar por, troca de visão, formulário |
| `frontend/js/admin.js` | Painel do adm |
| `frontend/js/tema.js` | Temas, inclusive floresta dia, tarde e noite |

## 6. Manutenção

**Rodar do zero:**

```powershell
cmake -S engine-cpp -B engine-cpp/build; cmake --build engine-cpp/build --config Release
cd backend; bundle install; bundle exec ruby app.rb      # http://127.0.0.1:4567
```

**Testes (validação dupla, antes de todo commit):**

```powershell
cd backend; bundle exec rake test                               # Minitest, banco temporário
python -m unittest discover -s scripts -p "test_*.py"           # importador de planilhas
```

Os templates antigos (finanças, lote, cronograma) ficaram só como dados de teste em `backend/test/fixtures/` (cobrem saldo, hora, checklist, calendário e pizza); a variável `DASHZON_TEMPLATES_EXTRA`, definida só pelos testes, carrega essa pasta.

**Ponta a ponta no navegador** (instância separada e zerada; Chrome ou Edge):

```powershell
$env:DASHZON_DB_PATH = "$PWD\data\teste-pdz.db"; $env:PORT = "4580"; cd backend; ruby -rbundler/setup app.rb   # outro terminal
node scripts\e2e-prefeitura.mjs --porta 4580          # 73 checagens; prints em log\e2e\<data>\
```

`scripts\zerar-teste.ps1 -Porta 4580 -Banco data\teste-pdz.db` zera a instância de teste (recusa o `dashzon.db`). Rode duas vezes, com o banco zerado entre as rodadas.

**Responsividade** (mudou a interface): numa instância zerada, `scripts\auditar-responsivo.ps1 -Porta <porta> [-Navegador <chrome.exe>]` até 0 erros, e revise os prints em `log\responsivo\`.

**Esqueci a senha do único admin:** comando no `CLAUDE.md` ("Se falhar").

**Importar planilha:** `python scripts\importar_planilha.py exemplos\demandas-dgeo.xlsx --modulo demandas --usuario ADMTOTAL --simular` (tire o `--simular` para gravar). O separador do CSV vem do cabeçalho; vírgula decimal funciona.

**Branches:** esta versão está em `desenvolvimento-ideiamarvin` (a partir de `desenvolvimento-empresa`). Commits em pt-BR, um por parte, `feat(área)`, `fix(área)`, `docs`. Sem emojis.
