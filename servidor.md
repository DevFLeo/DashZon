# Servidor do DashZon: passo a passo

Como colocar o DashZon para rodar e deixar funcionando: neste PC com Windows, com Docker (em qualquer máquina) ou num servidor na internet com domínio próprio.

| Onde vai rodar | Caminho | Seção |
|---|---|---|
| Qualquer lugar, pelo Claude Code | diga **"rode o projeto"** | [Para quem vai ativar o servidor](#para-quem-vai-ativar-o-servidor) |
| Este PC (Windows), sem Docker | `scripts\rodar.ps1` | [Opção 1](#opção-1-este-pc-com-windows-sem-docker) |
| Qualquer máquina com Docker | `docker compose up -d --build` | [Opção 2](#opção-2-docker) |
| Servidor na internet com domínio (VPS) | Docker + Caddy (HTTPS) | [Opção 3](#opção-3-servidor-na-internet-com-domínio-próprio) |
| Em casa, pelo DuckDNS (porta 2444) | scripts de `deploy/` | [Opção 4](#opção-4-em-casa-pelo-duckdns) |

---

## Para quem vai ativar o servidor

Abra o **Claude Code** na pasta do projeto e diga:

> **rode o projeto**

O assistente segue as instruções do `CLAUDE.md`: roda um único script, que instala só o que falta (gems do Ruby, motor C++), sobe o servidor e responde com o endereço. Se já estiver no ar, ele só avisa. Não precisa explicar mais nada.

Outros pedidos que funcionam do mesmo jeito: **"pare o projeto"** e **"reinicie o projeto"**.

Sem o assistente, os comandos são estes (PowerShell, na pasta do projeto):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1              # sobe (ou avisa que já está no ar)
powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1 -Reiniciar   # para e sobe de novo
powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1 -Parar       # para
```

Depois é só abrir **http://127.0.0.1:4567**. No primeiro acesso aparece o assistente de configuração: quem fizer o cadastro vira o **administrador**.

---

## Opção 1: este PC com Windows, sem Docker

### Pré-requisitos (uma vez)

No PowerShell:

```powershell
winget install RubyInstallerTeam.Ruby.3.4     # Ruby
winget install Kitware.CMake                  # para compilar o motor C++
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Feche e abra o terminal depois de instalar (para o PATH atualizar).

### Rodar

```powershell
cd C:\Projetos\DashZon
powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1
```

Na primeira vez ele instala as gems e compila o motor (1 a 2 minutos). Nas próximas, sobe em uns 2 segundos. A saída normal é uma linha só:

```
DashZon no ar: http://127.0.0.1:4567
```

- Os dados ficam em `data\dashzon.db` e a chave do servidor em `data\segredo.key` (**não apague**: ela derruba as sessões e o sistema deixa de reconhecer CPF/CNPJ repetidos).
- Os registros de funcionamento ficam em `log\dashzon.log`.
- O servidor roda sem janela. Para parar: `scripts\rodar.ps1 -Parar`.

---

## Opção 2: Docker

Serve para qualquer máquina (Windows, Linux, Mac) e é o jeito mais simples num servidor: não precisa instalar Ruby nem compilador. A imagem já vem com o motor C++ compilado, roda sem usuário root e se reinicia sozinha se cair ou se a máquina religar.

### 2.1 Instalar o Docker

**Windows** (PowerShell como administrador):

```powershell
wsl --install                         # se o WSL 2 ainda não estiver instalado (pede reiniciar)
winget install Docker.DockerDesktop
```

Abra o **Docker Desktop** uma vez e espere aparecer "Engine running". Em Configurações → General, marque "Start Docker Desktop when you sign in" para ele subir junto com o Windows.

**Linux** (Ubuntu/Debian):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER        # para usar docker sem sudo (saia e entre de novo)
```

Conferir: `docker --version` e `docker compose version`.

### 2.2 Subir

Na pasta do projeto:

```bash
docker compose up -d --build
```

A primeira vez leva uns 2 a 3 minutos (monta a imagem). Depois:

```bash
docker compose ps          # deve aparecer "healthy"
```

Abra **http://127.0.0.1:4567**. Por segurança, a porta só responde na própria máquina; para acessar de fora, use a Opção 3 ou a 4.

Para usar outra porta local: crie um `.env` na raiz com `DASHZON_PORTA=8080` (veja o `.env.example`).

### 2.3 Dia a dia

| Quero... | Comando |
|---|---|
| Ver se está rodando | `docker compose ps` |
| Ver os registros (logs) | `docker compose logs -f dashzon` |
| Parar | `docker compose stop` |
| Subir de novo | `docker compose start` |
| Atualizar para a versão nova do código | `git pull` e `docker compose up -d --build` (os dados continuam) |

Os dados (banco + chave do servidor) ficam no volume **`dashzon_dashzon-dados`**. Eles continuam lá quando você para, atualiza ou recria o container. **Nunca rode `docker compose down -v`** (o `-v` apaga o volume, e com ele todos os dados).

### 2.4 Backup e restauração

Rode na pasta onde quer guardar o arquivo. Os comandos são iguais no PowerShell e no bash.

**Fazer backup** (gera `dashzon-backup.tgz`):

```bash
docker compose -f C:/Projetos/DashZon/docker-compose.yml stop dashzon
docker run --rm -v "dashzon_dashzon-dados:/dados" -v "${PWD}:/backup" alpine tar czf /backup/dashzon-backup.tgz -C /dados .
docker compose -f C:/Projetos/DashZon/docker-compose.yml start dashzon
```

**Restaurar** um backup (substitui tudo o que está no volume):

```bash
docker compose -f C:/Projetos/DashZon/docker-compose.yml stop dashzon
docker run --rm -v "dashzon_dashzon-dados:/dados" -v "${PWD}:/backup" alpine sh -c "find /dados -mindepth 1 -delete && tar xzf /backup/dashzon-backup.tgz -C /dados && chown -R 1000:1000 /dados"
docker compose -f C:/Projetos/DashZon/docker-compose.yml start dashzon
```

(No Linux, troque `C:/Projetos/DashZon` pelo caminho do projeto no servidor.)

O backup leva o banco **e** a chave do servidor juntos: restaurado, tudo volta a funcionar, inclusive os logins. Guarde o arquivo em outro lugar (outro disco, nuvem).

Também dá para exportar pelo próprio DashZon, em "Backup com dados (JSON)", mas esse arquivo não leva as contas de usuário nem as senhas.

---

## Opção 3: servidor na internet com domínio próprio

Para um servidor (VPS) com Linux, IP público e um domínio seu (ex.: `painel.suaempresa.com.br`). O Caddy tira o certificado HTTPS sozinho (Let's Encrypt).

1. **Instale o Docker** no servidor (2.1, parte Linux) e copie o projeto (`git clone`).
2. **DNS:** no painel do seu domínio, crie um registro **A** apontando `painel.suaempresa.com.br` para o IP do servidor. Espere propagar (confira com `ping painel.suaempresa.com.br`).
3. **Firewall:** libere as portas **80 e 443** (TCP) no servidor e no painel da hospedagem. Não abra a 4567.
4. **Configuração:** copie o modelo e preencha:

```bash
cp .env.example .env
nano .env
```

```ini
DASHZON_DOMINIO=painel.suaempresa.com.br
DASHZON_COOKIE_SEGURO=1
DASHZON_URL_PUBLICA=https://painel.suaempresa.com.br
```

5. **Suba com o Caddy** (perfil `https`):

```bash
docker compose --profile https up -d --build
docker compose --profile https ps
```

6. Abra **https://painel.suaempresa.com.br**. O certificado leva de alguns segundos a 1 minuto na primeira vez (`docker compose logs -f caddy` mostra quando sai).

Para atualizar: `git pull` e `docker compose --profile https up -d --build`.

**E-mail (opcional):** para mandar os links de confirmação de e-mail e de "esqueci a senha" por e-mail, preencha as variáveis `DASHZON_SMTP_*` no `.env` (no Gmail, use uma "senha de app") e rode o `up` de novo. Sem isso, o administrador confirma os e-mails à mão e manda os links de senha por outro canal.

---

## Opção 4: em casa, pelo DuckDNS

Para acessar de fora usando o PC de casa com um endereço grátis (`SEUNOME.duckdns.org:2444`), sem abrir as portas 80/443: siga o tutorial **[docs/PUBLICAR-DUCKDNS.md](docs/PUBLICAR-DUCKDNS.md)**.

---

## Antes de liberar para outras pessoas

- [ ] Senha forte no administrador e **pelo menos dois administradores**.
- [ ] Contas criadas no **Painel do adm** (cada pessoa com o seu login; nada de senha compartilhada).
- [ ] Na internet, só com **HTTPS** (Opção 3 ou 4). Nunca exponha a porta 4567.
- [ ] Um backup feito e **testado** (restaurado em algum lugar) antes do primeiro uso real.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| `rodar.ps1` diz "Ruby não encontrado" | Instale o Ruby (Opção 1) e abra um terminal novo |
| `rodar.ps1` diz "CMake não encontrado" ou a compilação do motor falha | Instale o CMake e o Build Tools (Opção 1); o erro completo está em `log\motor.log` |
| "O servidor não respondeu" | Veja o fim de `log\dashzon.log`; a porta 4567 pode estar ocupada (use `-Porta 4568`) |
| `docker: command not found` / "Cannot connect to the Docker daemon" | Docker não instalado ou o Docker Desktop fechado: abra e espere "Engine running" |
| Container "unhealthy" ou reiniciando | `docker compose logs dashzon` mostra o erro |
| `Host not permitted` | Acessou por um endereço que não está em `DASHZON_DOMINIO` (Opção 3) |
| O certificado HTTPS não sai (Opção 3) | Confira o DNS (registro A) e se as portas 80 e 443 estão abertas; `docker compose logs caddy` |
| Todo mundo caiu para a tela de login de uma vez | A chave do servidor foi trocada ou apagada (`segredo.key`); restaure do backup |
| Esqueci a senha do único administrador | Veja "Esqueci a senha do administrador" em `docs/DESENVOLVIMENTO.md` |
