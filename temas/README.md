# Temas do DashZon

Todos os temas ficam aqui, em `temas.json`: é a **única fonte**. Um tema novo neste arquivo aparece em todas as partes do sistema, sem mudar código:

| Quem lê | Como |
|---|---|
| Backend (Ruby) | `backend/lib/temas.rb`: valida a preferência da conta (`Usuarios::TEMAS`) e gera `/temas.css` (as cores) e `/temas.js` (a lista) |
| Frontend oficial (sem build) | `/temas.css` e `/temas.js`, carregados no `<head>` do `index.html`; `js/tema.js` e o seletor da Aparência usam a lista |
| Protótipos web (React e Next) | `prototipos/core/temas.js` importa o JSON; `cssDosTemas()` gera o CSS |
| App de celular (React Native) | o mesmo `prototipos/core/temas.js` (o Metro observa esta pasta: `metro.config.js`) |

## Como criar um tema

Acrescente um objeto em `temas` (a ordem do arquivo é a ordem das telas):

```json
{
  "id": "meu_tema",          // vai para preferencias.tema (letras, números e _)
  "nome": "Meu tema",
  "grupo": "Básicos",        // o botão do topo gira dentro do grupo
  "desc": "Uma frase curta",
  "fase": "dia",             // ícone do botão: "dia" (sol), "tarde" (pôr do sol) ou "noite" (lua)
  "escuro": false,           // fundo escuro? (color-scheme e barra de status do celular)
  "atributo": "meu-tema",    // valor de data-theme no oficial
  "tokens": { ... }          // as 26 cores, com os nomes do oficial (copie de um tema parecido)
}
```

Os 26 tokens: `surface-1` (cartões), `page-plane` (fundo), `text-primary`, `text-secondary`, `text-muted`, `gridline`, `baseline`, `border`, `border-strong`, `hover`, `series-1` a `series-8` (gráficos: a 1 é a principal/entrada, a 8 é a saída), `accent` (destaque), `accent-ink` (texto sobre o destaque), `status-good`, `status-warning`, `status-serious`, `status-critical`, `success-text`, `critical-text`.

**Contraste mínimo** (WCAG): texto (`text-*`, `success-text`, `critical-text`) 4,5:1 sobre `surface-1` e `page-plane`; `accent-ink` 4,5:1 sobre `accent`; cada série 3:1 sobre `surface-1`. As 8 séries precisam ser distinguíveis entre si.

Depois de mudar o JSON: reinicie o servidor (o backend lê o arquivo na partida) e rode os testes (`rake test`, o roteiro de temas e `npm run teste` em `prototipos/mobile`).

## Automáticos

Em `automaticos` ficam as escolhas que viram um tema conforme algo de fora:

- `sistema`: o claro ou o escuro, conforme o modo do aparelho (`"claro"` e `"escuro"` dizem quais).

O JSON não aceita comentários: os `//` acima são só explicação.
