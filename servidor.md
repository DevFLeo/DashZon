# Prefeitura DashZ: como colocar no ar

Passo a passo para quem vai instalar e manter o sistema: neste PC com Windows, com Docker (qualquer máquina) ou num servidor na internet com domínio.

| Onde vai rodar | Caminho |
|---|---|
| Pelo Claude Code | diga **"rode o projeto"** |
| Este PC (Windows), sem Docker | `scripts\rodar.ps1` ([Opção 1](#opção-1-windows-sem-docker)) |
| Qualquer máquina com Docker | `docker compose up -d --build` ([Opção 2](#opção-2-docker)) |
| Servidor na internet com domínio | Docker + Caddy, HTTPS ([Opção 3](#opção-3-servidor-com-domínio-e-https)) |
| PC de casa, pelo DuckDNS (porta 2444) | [docs/PUBLICAR-DUCKDNS.md](docs/PUBLICAR-DUCKDNS.md) |

## Primeiro acesso: o ADMTOTAL

No primeiro acesso aparece o assistente. Quem faz o cadastro vira o **administrador**: use o login **`ADMTOTAL`**, uma senha forte e os três modelos (Demandas e Processos SEI, Mapeamento de dados, Anotações). Depois:

1. **Painel do adm > Criar > Estrutura modelo (SEMEC)** cria SEMEC / SUPLAN e SURÇAM / DGEO, DIPLAD e DIPEI / DCAD, DTAD e DASI, sem pessoas. Ou crie as suas unidades em **Criar > Unidade**.
2. **Criar > Usuário** para cada pessoa, marcando em cada unidade se ela é **membro** ou **gestor**. O gestor administra a unidade e tudo abaixo (veja o README).
3. Crie **um segundo administrador**: se o ADMTOTAL esquecer a senha, o outro gera uma temporária.

## Opção 1: Windows, sem Docker

Pré-requisitos (uma vez, depois abra um terminal novo):

```powershell
winget install RubyInstallerTeam.Ruby.3.4
winget install Kitware.CMake
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Na pasta do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1              # sobe (instala só o que falta)
powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1 -Reiniciar   # para e sobe de novo
powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1 -Parar       # para
```

Abra **http://127.0.0.1:4567**. Dados em `data\dashzon.db`, chave do servidor em `data\segredo.key` (**não apague**: derruba as sessões e o sistema deixa de reconhecer CPF/CNPJ repetidos). Log em `log\dashzon.log`.

## Opção 2: Docker

Instale o Docker (Windows: `winget install Docker.DockerDesktop`; Linux: `curl -fsSL https://get.docker.com | sudo sh`). Na pasta do projeto:

```bash
docker compose up -d --build     # 2 a 3 min na primeira vez
docker compose ps                # deve mostrar "healthy"
```

| Quero... | Comando |
|---|---|
| Ver os logs | `docker compose logs --tail 30 dashzon` |
| Parar / subir | `docker compose stop` / `docker compose start` |
| Atualizar o código | `git pull && docker compose up -d --build` (os dados ficam) |

Os dados ficam no volume `dashzon_dashzon-dados`. **Nunca rode `docker compose down -v`** (apaga o volume).

**Backup** (gera `dashzon-backup.tgz` na pasta atual; troque o caminho do projeto):

```bash
docker compose -f "CAMINHO/docker-compose.yml" stop dashzon
docker run --rm -v "dashzon_dashzon-dados:/dados" -v "${PWD}:/backup" alpine tar czf /backup/dashzon-backup.tgz -C /dados .
docker compose -f "CAMINHO/docker-compose.yml" start dashzon
```

**Restaurar**: o mesmo, com `sh -c "find /dados -mindepth 1 -delete && tar xzf /backup/dashzon-backup.tgz -C /dados && chown -R 1000:1000 /dados"` no lugar do `tar czf`. O backup leva o banco e a chave juntos. O "Backup com dados (JSON)" da tela não leva contas nem senhas.

## Opção 3: servidor com domínio e HTTPS

1. Docker no servidor (Linux) e o projeto clonado.
2. **DNS**: registro **A** do domínio (ex.: `painel.prefeitura.gov.br`) para o IP do servidor.
3. **Firewall**: portas **80 e 443** abertas. Nunca a 4567.
4. `cp .env.example .env` e preencha:

```ini
DASHZON_DOMINIO=painel.prefeitura.gov.br
DASHZON_COOKIE_SEGURO=1
DASHZON_URL_PUBLICA=https://painel.prefeitura.gov.br
```

5. `docker compose --profile https up -d --build`. O Caddy tira o certificado sozinho. **Faça o primeiro acesso (ADMTOTAL) logo em seguida**: antes do setup, quem abrir primeiro cria o administrador. (Para fazer o setup antes de publicar, suba sem o perfil `https` e use um túnel: `ssh -L 4567:127.0.0.1:4567 usuario@servidor`.)

E-mail (opcional): variáveis `DASHZON_SMTP_*` no `.env`. Sem elas, o administrador confirma os e-mails à mão e entrega os links de senha.

## Antes de liberar para as secretarias

- [ ] ADMTOTAL com senha forte e **um segundo administrador**.
- [ ] Estrutura criada e cada pessoa na sua unidade, com o papel certo (membro/gestor).
- [ ] Na internet, só com **HTTPS** (Opção 3 ou DuckDNS).
- [ ] Um backup feito **e testado** antes do uso real.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Ruby ou CMake não encontrado | Instale (Opção 1) e abra um terminal novo |
| "O servidor não respondeu" | Fim de `log\dashzon.log`; porta ocupada: `-Porta 4568` |
| Toda consulta dá 500 com "Permission denied" no motor | Corrigido nesta versão (caminho com espaços). Se voltar, compile de novo: `cmake --build engine-cpp/build --config Release` |
| `Host not permitted` | Domínio fora de `DASHZON_DOMINIO` / `DASHZON_HOSTS` |
| 429 "Muitas tentativas" | Bloqueio de 15 min; outro admin desbloqueia em Painel do adm > Segurança |
| "Você só pode lançar registros da sua unidade" | É a regra: a pessoa não está na unidade escolhida nem gere uma acima dela. Ajuste em Painel do adm ou Minha equipe |
| Esqueceu a senha do único admin | Comando em `CLAUDE.md` ("Se falhar") |
