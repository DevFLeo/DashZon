# Publicar o Prefeitura DashZ pelo DuckDNS (HTTPS, PC com Windows)

Para acessar de qualquer lugar em `https://SEUNOME.duckdns.org:2444`, com o sistema rodando num PC com Windows. Primeira vez: 30 a 40 minutos. Depois, um comando.

```
Celular / outro PC  --https://SEUNOME.duckdns.org:2444-->  roteador (porta 2444)  -->  este PC
   Caddy (porta 2444, certificado Let's Encrypt pelo DNS do DuckDNS)  -->  sistema em 127.0.0.1:4567
```

O sistema nunca fica exposto direto: só o Caddy, com HTTPS. Tudo o que precisa está em `deploy/`:

| Arquivo | Para quê |
|---|---|
| `publico.env.example` | Modelo da configuração (domínio, token, porta) |
| `instalar.ps1` | Uma vez, como administrador: baixa o Caddy, libera o firewall, agenda o DuckDNS |
| `iniciar-publico.ps1` / `parar-publico.ps1` | Põe no ar / tira do ar |
| `duckdns-atualizar.ps1` | Atualiza o IP (a cada 5 min, pela tarefa agendada) |
| `Caddyfile` | Configuração do Caddy |

Os comandos abaixo rodam **na pasta do projeto** (o caminho tem espaços: use aspas se for digitar o caminho completo).

## Passo 0: antes de publicar

1. Faça o **primeiro acesso (setup) com o ADMTOTAL** em `http://127.0.0.1:4567` antes de abrir para a internet, com senha forte.
2. Faça um backup (copie `data\dashzon.db` e `data\segredo.key` com o servidor parado).

## Passo 1: a internet permite abrir porta? (CGNAT)

Compare o IP de https://api.ipify.org com o "IP da WAN" no painel do roteador. Se forem diferentes, ou o da WAN começar com `100.64.`–`100.127.`, `10.`, `172.16.`–`172.31.` ou `192.168.`, é CGNAT: peça **IP público** à operadora (sem isso, use um túnel, fora deste guia).

## Passo 2: domínio no DuckDNS

Em https://www.duckdns.org, entre, crie o subdomínio (ex.: `semec-painel`) e copie o **token** (é a senha do domínio: não mande para ninguém).

## Passo 3: configuração

Copie `deploy\publico.env.example` para `deploy\publico.env` e preencha (domínio **sem** `.duckdns.org`):

```ini
DUCKDNS_DOMINIO=semec-painel
DUCKDNS_TOKEN=seu-token-aqui
PORTA_PUBLICA=2444
```

O `publico.env` está no `.gitignore`.

## Passo 4: IP fixo do PC na rede e porta no roteador

1. `ipconfig` e anote o IPv4 (ex.: `192.168.0.25`); reserve esse IP para o PC no DHCP do roteador.
2. No roteador (Redirecionamento de portas / Port Forwarding / NAT): **TCP 2444 externa -> 192.168.0.25:2444**. Nunca a 4567.

## Passo 5: instalar (uma vez)

PowerShell **como administrador**, na pasta do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\instalar.ps1
```

Esperado: `[ok] Caddy`, `[ok] Caddyfile válido`, `[ok] Porta 2444 liberada`, `[ok] Tarefa agendada`, `DuckDNS atualizado`. `DuckDNS respondeu 'KO'` = domínio ou token errado.

## Passo 6: pôr no ar e testar

```powershell
powershell -ExecutionPolicy Bypass -File deploy\iniciar-publico.ps1
```

Na primeira vez o certificado leva 1 a 2 minutos (`deploy\logs\caddy.log` mostra `certificate obtained successfully`). Teste **pelo celular no 4G** (Wi-Fi desligado): `https://semec-painel.duckdns.org:2444` deve abrir o login com o cadeado. Em casa, use `http://127.0.0.1:4567` (muitos roteadores não fazem "NAT loopback").

## Dia a dia

| Quero... | Comando / arquivo |
|---|---|
| Pôr no ar (também depois de reiniciar o PC) | `deploy\iniciar-publico.ps1` |
| Tirar do ar | `deploy\parar-publico.ps1` |
| Acessos / erros / IP | `deploy\logs\caddy-acessos.log`, `deploy\logs\dashzon.log`, `deploy\logs\duckdns.log` |

O PC precisa ficar ligado e sem suspender.

## Segurança

- [ ] ADMTOTAL com senha forte e um segundo administrador.
- [ ] Só a porta 2444 no roteador; token só no `deploy\publico.env`.
- [ ] Não apague `data\segredo.key`. Faça backups.
- [ ] Quem sair da prefeitura: **Desativar** (Painel do adm, ou o gestor em Minha equipe).

Já vem pronto: HTTPS, cookie só por HTTPS, bloqueio por tentativas (8 erros do mesmo IP ou 10 contra a mesma conta em 15 min), cabeçalhos de segurança, escrita só do próprio site, sessão que expira e encerra no "Sair", e o diário de segurança no Painel do adm.

## Deu problema?

| Sintoma | O que fazer |
|---|---|
| Do celular não abre | Passos 1 e 4; teste a porta 2444 em https://www.yougetsignal.com/tools/open-ports/ com o sistema no ar |
| "Conexão não é segura" | Espere o certificado (2 min) e veja `deploy\logs\caddy.log`; erro com `duckdns`/`TXT` = token |
| `Host not permitted` | Use exatamente o endereço do `publico.env` |
| `O Caddy não subiu` | Porta 2444 ocupada (troque `PORTA_PUBLICA` e o roteador) ou veja `deploy\logs\caddy.log` |
| Scripts bloqueados | Rode sempre com `powershell -ExecutionPolicy Bypass -File ...` |

## Desfazer tudo

1. `deploy\parar-publico.ps1`
2. `schtasks /Delete /TN "DashZon DuckDNS" /F`
3. Como administrador: `Remove-NetFirewallRule -DisplayName "DashZon HTTPS (porta 2444)"`
4. Apague o redirecionamento no roteador (e, se quiser, o domínio no DuckDNS).
