# Prefeitura DashZ

Painel de gestão para as secretarias da prefeitura: demandas, processos SEI, bases de dados e anotações de cada unidade, com permissões em cascata (secretaria > subsecretaria > departamento > divisão) e um painel do gestor que soma a produtividade de baixo para cima. Derivado do DashZon (cadastros e dashboards montados a partir de templates JSON, motor C++ para as contas).

## O que dá para fazer

- **Estrutura da prefeitura em árvore, do jeito que você quiser.** Ex.: **SEMEC** (secretaria) / **SUPLAN** e **SURÇAM** (subsecretarias) / **DGEO**, **DIPLAD** e **DIPEI** (departamentos) / **DCAD**, **DTAD** e **DASI** (divisões do DGEO). Departamento pode ter departamentos e divisões dentro.
  - **Painel do adm > Criar > Nova estrutura (árvore)**: escreva a secretaria inteira como lista, uma unidade por linha (`SIGLA - Nome`), com recuo para o que fica dentro, e veja a prévia. Comece em branco (ex.: uma **SEMAGRIC**), do modelo SEMEC ou copiando uma estrutura que já existe e trocando as siglas.
  - Renomear: **Editar** na unidade (ex.: trocar SEMEC por outro nome). Excluir uma estrutura inteira: **Excluir** na unidade de cima.
  - O gestor também cria várias unidades de uma vez dentro da sua (Minha equipe > + Várias unidades).
- **Permissões em cascata.** Cada pessoa é **membro** ou **gestor** de uma ou mais unidades. O gestor administra a unidade e tudo abaixo:
  - a gestora da SUPLAN e da SURÇAM põe e tira pessoas, cria unidades e edita registros de tudo abaixo das duas;
  - o gestor do DGEO faz o mesmo no DGEO, DCAD, DTAD e DASI;
  - o gerente (gestor) do DTAD, só no DTAD.
  - Membro lança e edita os registros da própria unidade; excluir é do gestor (ou de quem lançou).
- **Minha equipe** (para gestores): pessoas e unidades do seu alcance, criar conta com senha temporária, mudar quem é gestor, desativar.
- **Painel do gestor** (função mestre): total de processos do DGEO alimenta o da SUPLAN, que alimenta o da SEMEC, com em andamento, concluídos, encerrados, atrasados, vencendo em 7 dias e taxa de conclusão. Mesmas regras para todas as unidades; baixa em CSV e imprime.
- **Gestão de Demandas - DGEO** (o JSON do pedido) e **Processos SEI**: número do processo, ciência, onde está, situação e prazo, de forma resumida. O botão **Unidades do campo** troca as divisões do exemplo pelas da sua estrutura (ex.: as demandas passam a ser da SEMAGRIC) e pode renomear o módulo.
- **Mapeamento de dados das unidades**: inventário de bases (origem, SEI!, LAI, LGPD, dados abertos, qualidade) e indicadores por unidade.
- **Anotações** em Markdown (estilo Obsidian), com excluir e compartilhar o caderno seguindo a mesma cascata.
- **Tabelas com "Classificar por"**: A-Z, data de criação, prazo mais próximo, prioridade (na ordem das opções) e outros.
- **Quadro estilo Trello por departamento**: colunas por status, arrastar (ou setas) para mudar, filtro por divisão.
- **Agenda e calendário com períodos**: -15/+15, -30, +30 e -30/+30 dias em volta de hoje.
- **Expansão da dashboard**: clicar numa barra (ex.: prioridade "Média"), fatia, linha da tabela ou dia do calendário abre os registros, com resumo por divisão e até quando vão os prazos.
- **Temas**: claro, suave, escuro e **floresta dia, tarde e noite**.
- Segurança do DashZon mantida: senhas em PBKDF2, SQL parametrizado, bloqueio por tentativas, CSP, diário de segurança; o "Sair" agora encerra a sessão mesmo que um cookie antigo volte.

## Começar

```powershell
powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1      # http://127.0.0.1:4567
```

No primeiro acesso, crie o administrador **ADMTOTAL** (o sistema começa sem módulos; instale só os que quiser) e, no Painel do adm, crie a estrutura (Nova estrutura) e as pessoas. Docker, domínio com HTTPS e DuckDNS: `servidor.md` e `docs/PUBLICAR-DUCKDNS.md`.

## Documentos

| Arquivo | Para quem |
|---|---|
| `servidor.md` | Quem instala e mantém no ar |
| `docs/PUBLICAR-DUCKDNS.md` | Publicar pelo PC de casa com HTTPS |
| `docs/DESENVOLVIMENTO.md` | Quem mexe no código (tutorial) |
| `Sistema.md` | Especificação técnica completa |
| `relatorio-PDZ1.md` | Relatório 1 PDZ: o que foi definido, como alterar, testes e riscos |
| `Log.md` | Histórico de mudanças |
| `CLAUDE.md` | Instruções para o assistente |

## Estrutura

```
backend/     Ruby (Sinatra) + SQLite: app.rb, rotas/, lib/, templates/, test/
engine-cpp/  motor C++ (busca e agregação)
frontend/    HTML/CSS/JS sem build
scripts/     rodar, testes de ponta a ponta, auditoria de responsividade, importador de planilhas
exemplos/    planilha modelo da Gestão de Demandas (xlsx e csv)
deploy/      Caddy, DuckDNS e scripts de publicação
prototipos/  experimento em React e Next.js (fora do sistema)
```

## Testes

```powershell
cd backend; bundle exec rake test                        # 212 testes
python -m unittest discover -s scripts -p "test_*.py"    # importador
node scripts\e2e-prefeitura.mjs --porta 4580             # navegador, numa instância de teste zerada
```
