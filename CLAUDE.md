# Regras do projeto DashZon

## Regra fixa: não alterar a lógica dos dashboards e gráficos

**Não altere a lógica de funcionamento nem a fórmula de organização dos dashboards e gráficos**, a menos que o pedido seja explicitamente sobre isso. Isso vale para:

- **Motor C++** (`engine-cpp/src/main.cpp`): `aggregate`, `multi`, `search`, a forma de agrupar, somar, contar, calcular saldo e montar séries, e o formato da resposta (`result`, `series_keys`, `total_*`).
- **Consulta** (`backend/lib/module_schema.rb`): `normalize_consulta!`, `normalize_widget!` e `engine_query`, ou seja, o formato do `config` de um widget (`agregacao`, `campo`, `agrupar_por`, `formato_grupo`, `serie_por`, `filtro`).
- **Desenho e ordem** (`frontend/js/dashboards.js`): `valorDe`, `formatador`, `descricao`, `ordenar`, `renderKpi`, `renderTabela`, `renderGrafico` (cores por identidade, séries lado a lado até 2 e empilhadas acima disso, limite de grupos) e o layout do GridStack (12 colunas, `salvarLayout` só com posição/tamanho, `TAMANHO` padrão por tipo).

Melhorias de **como o usuário alimenta** os dashboards (formulários, sugestões, pré-visualização, atalhos de lançamento) são permitidas, desde que **gerem o mesmo `config`** e reaproveitem as funções acima em vez de reimplementá-las. A pré-visualização do criador de card roda a mesma consulta no mesmo motor, só que sobre registros fictícios.

Os trechos protegidos têm um comentário `REGRA:` no código apontando para este arquivo.

## Outras convenções

- Textos da interface, mensagens de erro e commits em português (pt-BR).
- Um commit por parte pronta (`tipo(área): resumo`), com o README por último. Push só quando pedido.
- Mantenha `docs/DESENVOLVIMENTO.md` em dia quando a arquitetura mudar.
- JSON do usuário (templates importados, exportações) vai para a tabela `jsons` do banco, nunca para arquivos versionados. Só os templates padrão em `backend/templates/` ficam no git.
- Nomes de módulo são únicos (sem diferenciar maiúsculas); instalar um template reaproveita o módulo que já tem o mesmo nome.
