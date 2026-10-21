# DashZon: instruções para o assistente

Gaste o mínimo. Para **instalar, rodar, subir, parar ou atualizar**, use os comandos abaixo: não explore o repositório, não leia outros arquivos, não rode testes e não abra o navegador. Responda com uma linha (ex.: `No ar: http://127.0.0.1:4567`).
Para **mudar código**, leia antes o `Sistema.md` (arquitetura e regras completas).

## Local, Windows (padrão desta máquina)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/rodar.ps1              # instala só o que falta (gems, motor C++) e sobe
powershell -ExecutionPolicy Bypass -File scripts/rodar.ps1 -Reiniciar   # -Parar | -Porta 4568 | -Banco outro.db
```

Se o script disser que falta algo: `winget install RubyInstallerTeam.Ruby.3.4`; `winget install Kitware.CMake` + Visual Studio Build Tools (C++). Abra um terminal novo e rode de novo.

## Local, Linux/macOS (sem Docker)

```bash
cmake -S engine-cpp -B engine-cpp/build && cmake --build engine-cpp/build
cd backend && bundle install && bundle exec ruby app.rb        # http://127.0.0.1:4567
```

## Docker (local ou servidor Linux)

```bash
docker compose up -d --build && docker compose ps               # "healthy"; escuta só em 127.0.0.1:4567
docker compose stop | start | logs --tail 30 dashzon
git pull && docker compose up -d --build                         # atualizar (dados ficam no volume)
```

- **Servidor com domínio e HTTPS:** `cp .env.example .env` e preencher `DASHZON_DOMINIO`, `DASHZON_COOKIE_SEGURO=1`, `DASHZON_URL_PUBLICA`; DNS tipo A apontando para o servidor; portas 80 e 443 abertas; então `docker compose --profile https up -d --build`.
- **PC de casa via DuckDNS (Windows):** `deploy/publico.env` (modelo `deploy/publico.env.example`), uma vez `deploy/instalar.ps1` como administrador, depois `deploy/iniciar-publico.ps1` ou `deploy/parar-publico.ps1`.
- Passo a passo para pessoas: `servidor.md` e `docs/PUBLICAR-DUCKDNS.md`.

## Protótipos React e Next (experimento)

```powershell
cd prototipos; npm install
npm run react    # http://localhost:5173 (só localhost)
npm run next     # http://localhost:3000
```

Usam a API da instância de **teste** (`DASHZON_API`, padrão `http://127.0.0.1:4571`), nunca o banco real. O frontend oficial continua em `frontend/`, sem build. Detalhes: `prototipos/README.md`.

## Se falhar

A saída do `rodar.ps1` já traz o fim do log. Se precisar, leia só a cauda de `log/dashzon.log` ou `docker compose logs --tail 30 dashzon`.

| Sintoma | Causa ou ação |
|---|---|
| Ruby ou CMake não encontrado | Instale (acima) e abra um terminal novo |
| Porta ocupada | `-Porta 4568` ou `DASHZON_PORTA` no `.env` |
| `Host not permitted` | Domínio em `DASHZON_HOSTS` (no Docker: `DASHZON_DOMINIO`) |
| 429 "Muitas tentativas" no login | Bloqueio por força bruta (15 min). Outro administrador desbloqueia em Painel do adm > Segurança |
| 1ª partida após atualizar demora | Normal: migração automática do banco (cópia em `dashzon.db.v2-*.bak`) |
| Tudo 500 e o log fala em "migrar o banco" | A migração falhou e **nada foi alterado**. Não apague nada; mostre a mensagem do log ao usuário |
| Esqueceu a senha do único admin | `cd backend; bundle exec ruby -e 'require_relative "lib/usuarios"; id = Usuarios.por_login_ou_email("LOGIN")["id"]; Usuarios.definir_senha!(id, "senha-temporaria-123", deve_trocar: true)'` (Docker: prefixe com `docker compose exec dashzon`) |

## Nunca

- Apagar ou mover `data/` (banco + `segredo.key`), arquivos `*.bak`, ou rodar `docker compose down -v`.
- Testar contra `data/dashzon.db`: use outra `PORT` e outro `DASHZON_DB_PATH`.
- Expor a porta 4567 na internet: só atrás do Caddy, com HTTPS.
- Ligar o modo WAL do SQLite (o backup copia só o `dashzon.db`).
- **REGRA:** alterar a lógica ou a organização dos dashboards e gráficos sem pedido explícito: o motor C++ (`engine-cpp/src/main.cpp`), `normalize_consulta!`, `normalize_widget!` e `engine_query` (`backend/lib/module_schema.rb`), e o desenho e layout em `frontend/js/dashboards.js`. Os trechos protegidos têm comentário `REGRA:`; detalhes no `Sistema.md`.
- Fazer push sem pedido, ou commitar segredos (`.env`, `*.db`, `data/`).
- **REGRA:** usar emojis, na interface, no código, nos comentários, nos docs ou nas mensagens de commit. Ícones são SVG (`Util.icone` em `frontend/js/util.js`) ou texto. O teste `test_interface_sem_emojis` barra emojis no frontend e nos templates.

## Ao mudar código

Leia o `Sistema.md` (seção "Regras de desenvolvimento"). O essencial:

- validação dupla antes de commitar: `cd backend; bundle exec rake test` + teste no navegador numa instância separada, duas rodadas, banco zerado;
- mexeu na interface: `scripts/auditar-responsivo.ps1 -Porta <instância zerada>` até 0 erros (instruções no topo do script);
- registre o que fez em `Log.md` (quando, o quê, por quê) e os problemas em `desenvolvimento.md` (fora do git);
- trabalhe na branch `desenvolvimento`.
