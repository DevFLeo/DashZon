# Gera o CHANGELOG.md do DashZon a partir do git log (Conventional Commits).
# Uso, de qualquer pasta: python scripts/gerar_changelog.py
# Grava o CHANGELOG.md na raiz em UTF-8 (o ">" do PowerShell 5.1 gravaria em
# UTF-16, por isso o arquivo é escrito aqui e não pela saída padrão).
import re
import subprocess
import sys
from collections import OrderedDict, defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

SEP = "\x1f"
saida = subprocess.run(
    ["git", "-C", str(RAIZ), "log", f"--format=%h{SEP}%cd{SEP}%s", "--date=short"],
    capture_output=True, text=True, encoding="utf-8", check=True,
).stdout.strip().splitlines()
sys.stdout = open(RAIZ / "CHANGELOG.md", "w", encoding="utf-8", newline="\n")

PADRAO = re.compile(r"^(?P<tipo>[a-z]+)(?:\((?P<escopo>[^)]*)\))?(?P<quebra>!)?: (?P<desc>.+)$")
TIPOS = OrderedDict([
    ("feat", "Novidades (`feat`)"),
    ("fix", "Correções (`fix`)"),
    ("perf", "Desempenho (`perf`)"),
    ("refactor", "Refatoração (`refactor`)"),
    ("test", "Testes (`test`)"),
    ("docs", "Documentação (`docs`)"),
    ("chore", "Manutenção (`chore`)"),
    ("outro", "Fora do padrão"),
])

por_data = OrderedDict()
contagem = defaultdict(int)
for linha in saida:
    h, data, assunto = linha.split(SEP, 2)
    m = PADRAO.match(assunto)
    if m and m["tipo"] in TIPOS:
        tipo = m["tipo"]
        escopo = f"**{m['escopo']}:** " if m["escopo"] else ""
        texto = f"{escopo}{m['desc']}"
    else:
        tipo = "outro"
        texto = f"`{assunto[:90]}{'…' if len(assunto) > 90 else ''}`"
    contagem[tipo] += 1
    por_data.setdefault(data, defaultdict(list))[tipo].append(f"- {texto} (`{h}`)")

total = sum(contagem.values())
print("""# Changelog do DashZon

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
""")
print("| Tipo | Commits |\n|---|---|")
for tipo, nome in TIPOS.items():
    if contagem[tipo]:
        print(f"| {nome} | {contagem[tipo]} |")
print(f"| **Total** | **{total}** |\n")
print("As **correções** (`fix`) são as issues resolvidas: cada uma descreve o defeito que deixou de existir.\n")

for data, grupos in sorted(por_data.items(), reverse=True):
    print(f"## {data}\n")
    for tipo, nome in TIPOS.items():
        if grupos.get(tipo):
            print(f"### {nome}\n")
            print("\n".join(grupos[tipo]))
            print()
