# Colocando o DashZon no seu domínio (DuckDNS + HTTPS)

Tutorial para acessar o DashZon de qualquer lugar em `https://SEUNOME.duckdns.org:2444`, rodando no seu PC com Windows.

Tempo estimado: 30 a 40 minutos na primeira vez. Nos próximos dias é um comando só.

## Como vai ficar

```
Celular / outro PC (internet)
        │  https://SEUNOME.duckdns.org:2444   (criptografado, cadeado no navegador)
        ▼
Roteador da sua casa  ── redireciona a porta 2444 ──►  este PC
        ▼
Caddy (porta 2444): certificado HTTPS automático (Let's Encrypt)
        ▼
DashZon (só em 127.0.0.1:4567, nunca exposto direto)
```

- **DuckDNS** dá um nome fixo (`SEUNOME.duckdns.org`) para o IP da sua casa, que muda de tempos em tempos. Um script avisa o DuckDNS do IP novo a cada 5 minutos.
- **Caddy** cuida do HTTPS. Como só a porta 2444 fica aberta, o certificado é validado pelo DNS do DuckDNS (com o seu token), sem precisar abrir as portas 80 e 443.
- **O DashZon** continua escutando só dentro do PC. Quem vem de fora passa sempre pelo Caddy.

Tudo o que precisa já está na pasta `deploy/`:

| Arquivo | Para quê |
|---|---|
| `publico.env.example` | Modelo da configuração (domínio, token, porta) |
| `instalar.ps1` | Roda uma vez: baixa o Caddy, confere tudo, libera o firewall e agenda o DuckDNS |
| `iniciar-publico.ps1` | Coloca no ar (DashZon + Caddy) |
| `parar-publico.ps1` | Tira do ar |
| `duckdns-atualizar.ps1` | Atualiza o IP no DuckDNS (roda sozinho a cada 5 min) |
| `Caddyfile` | Configuração do Caddy |

---

## Passo 0: antes de tudo (5 min)

1. **Troque a senha do administrador.** Com o sistema na internet, qualquer pessoa pode tentar entrar. Se o seu usuário ainda é `admin` com senha `admin`, entre no DashZon, vá em **Minha conta → Trocar senha** e use uma senha forte (frase longa é ótimo: `cafe-com-pao-na-padaria-2026`).
2. **Faça um backup:** no DashZon, "Backup com dados (JSON)". Ou copie o arquivo `data\dashzon.db` para outro lugar com o servidor parado.
3. Confira que o DashZon roda normalmente em `http://127.0.0.1:4567` (veja o README).

## Passo 1: descobrir se dá para abrir porta na sua internet (CGNAT)

Muitas operadoras no Brasil usam **CGNAT**: vários clientes dividem o mesmo IP público, e aí redirecionar porta no roteador **não funciona**. Vale conferir antes de gastar tempo:

1. Abra https://api.ipify.org no navegador. Anote o número (é o seu IP público visto de fora).
2. Entre no painel do roteador (geralmente `http://192.168.0.1` ou `http://192.168.1.1`; usuário e senha costumam estar na etiqueta embaixo do aparelho) e procure o **IP da WAN / IP da internet / IP externo**.
3. Compare:
   - **São iguais:** ótimo, siga o tutorial.
   - **São diferentes**, ou o da WAN começa com `100.64.` a `100.127.`, `10.`, `172.16.` a `172.31.` ou `192.168.`: é CGNAT. Ligue na operadora e peça **"IP público" (ou IP válido / sair do CGNAT)**. Muitas liberam de graça para cliente residencial; algumas cobram. Sem isso, a alternativa é um túnel (Cloudflare Tunnel ou Tailscale), que não está coberto aqui.

## Passo 2: criar o domínio no DuckDNS (5 min)

1. Acesse https://www.duckdns.org e entre com Google, GitHub ou outra conta.
2. No campo **sub domain**, digite o nome que você quer (só letras minúsculas, números e hífen), por exemplo `painelzon`, e clique em **add domain**. Seu endereço será `painelzon.duckdns.org`.
3. No topo da página aparece o seu **token** (um código tipo `a7c4d0ad-114e-40ef-ba1d-d217904a50f2`). Ele é a senha do seu domínio: **não mande para ninguém nem cole em chat**.

## Passo 3: preencher a configuração (2 min)

1. Na pasta `C:\Projetos\DashZon\deploy`, copie `publico.env.example` e renomeie a cópia para `publico.env`.
2. Abra `publico.env` no Bloco de Notas e preencha:

```ini
DUCKDNS_DOMINIO=painelzon
DUCKDNS_TOKEN=a7c4d0ad-114e-40ef-ba1d-d217904a50f2
PORTA_PUBLICA=2444
```

- `DUCKDNS_DOMINIO`: **só o nome**, sem `.duckdns.org`.
- O `publico.env` está no `.gitignore`: o token nunca vai para o GitHub.

## Passo 4: deixar o IP deste PC fixo na rede de casa (5 min)

O roteador vai mandar a porta 2444 para **um IP interno** (tipo `192.168.0.25`). Se o PC trocar de IP interno, o redirecionamento quebra.

1. Descubra o IP interno do PC: abra o PowerShell e rode `ipconfig`. Anote o **Endereço IPv4** do adaptador que você usa (Wi-Fi ou Ethernet), por exemplo `192.168.0.25`.
2. No painel do roteador, procure **DHCP → Reserva de endereço / IP fixo / Address Reservation** e reserve esse IP para este PC (ele aparece na lista de dispositivos conectados).

## Passo 5: redirecionar a porta no roteador (5 min)

No painel do roteador, procure uma destas opções (o nome muda por marca): **Redirecionamento de portas**, **Encaminhamento de portas**, **Port Forwarding**, **NAT**, **Servidor Virtual / Virtual Server**.

Crie uma regra assim:

| Campo | Valor |
|---|---|
| Nome | DashZon |
| Protocolo | TCP |
| Porta externa | 2444 |
| IP interno / destino | o IP do Passo 4 (ex.: `192.168.0.25`) |
| Porta interna | 2444 |

Salve (alguns roteadores pedem para reiniciar).

> **Não** redirecione a porta 4567. Só a 2444, que é a do Caddy com HTTPS.

## Passo 6: instalar (uma vez, 3 min)

1. Abra o menu Iniciar, digite **PowerShell**, clique com o botão direito e escolha **Executar como administrador** (é para liberar a porta no firewall).
2. Rode:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Projetos\DashZon\deploy\instalar.ps1
```

O esperado é algo assim:

```
Preparando https://painelzon.duckdns.org:2444

[ok] Caddy v2.11.4
[ok] Caddyfile válido
[ok] Porta 2444 liberada no Firewall do Windows
[ok] Tarefa agendada 'DashZon DuckDNS' (a cada 5 minutos)
DuckDNS atualizado: painelzon.duckdns.org

Pronto. Agora: redirecione a porta 2444 no roteador e rode deploy\iniciar-publico.ps1
```

O que ele faz: baixa o Caddy com o plugin do DuckDNS do site oficial (`deploy\bin\caddy.exe`), confere o `Caddyfile`, cria a regra "DashZon HTTPS (porta 2444)" no Firewall do Windows, agenda a atualização do IP a cada 5 minutos e já atualiza uma vez.

Se aparecer `DuckDNS respondeu 'KO'`, o domínio ou o token no `publico.env` está errado.

## Passo 7: colocar no ar

Pode ser num PowerShell normal (não precisa ser administrador):

```powershell
powershell -ExecutionPolicy Bypass -File C:\Projetos\DashZon\deploy\iniciar-publico.ps1
```

```
DuckDNS atualizado: painelzon.duckdns.org
[ok] DashZon em 127.0.0.1:4567
[ok] Caddy em 0.0.0.0:2444

No ar: https://painelzon.duckdns.org:2444
```

- Se o DashZon já estava rodando (do jeito normal, `bundle exec ruby app.rb`), o script **para e sobe de novo** com as configurações de uso público.
- Se o Windows perguntar se permite o **caddy.exe** acessar a rede, clique em **Permitir** (redes privadas e públicas).
- **Na primeira vez**, o Caddy leva de 1 a 2 minutos para conseguir o certificado. Acompanhe em `deploy\logs\caddy.log`: quando aparecer `certificate obtained successfully`, está pronto.

## Passo 8: testar de fora

Teste **pelo celular no 4G (Wi-Fi desligado)**: abra `https://painelzon.duckdns.org:2444`.

- Apareceu a tela de login com o **cadeado** no navegador: funcionou.
- Dentro de casa, pelo PC, use `http://127.0.0.1:4567` (continua funcionando normalmente). Muitos roteadores não deixam acessar o próprio domínio de dentro da rede ("NAT loopback"), então testar pelo Wi-Fi de casa pode enganar.

Pronto: agora é só criar as contas das pessoas no **Painel do adm** e mandar o endereço.

---

## Dia a dia

| Quero... | Comando (PowerShell) |
|---|---|
| Colocar no ar | `powershell -ExecutionPolicy Bypass -File C:\Projetos\DashZon\deploy\iniciar-publico.ps1` |
| Tirar do ar | `powershell -ExecutionPolicy Bypass -File C:\Projetos\DashZon\deploy\parar-publico.ps1` |
| Ver os acessos | `deploy\logs\caddy-acessos.log` |
| Ver erros do DashZon | `deploy\logs\dashzon.log` |
| Ver o histórico do IP | `deploy\logs\duckdns.log` |

- O PC precisa estar **ligado e sem hibernar** para o site ficar no ar. Em Configurações → Sistema → Energia, deixe "Suspender" em **Nunca** (pelo menos na tomada).
- Depois de reiniciar o PC, rode o `iniciar-publico.ps1` de novo. (A tarefa do DuckDNS volta sozinha.)

## Segurança (confira uma vez)

- [ ] Senha do administrador forte, e **pelo menos dois administradores** (se um esquecer a senha, o outro gera uma temporária).
- [ ] Só a porta **2444** redirecionada no roteador. Nunca a 4567.
- [ ] Token do DuckDNS só no `deploy\publico.env` (não mande por chat, não suba para o GitHub).
- [ ] Não apague `data\segredo.key`: ele derruba todas as sessões e o sistema deixa de reconhecer CPF/CNPJ repetidos.
- [ ] Faça backup de vez em quando ("Backup com dados (JSON)" ou cópia do `data\dashzon.db`).
- [ ] Quem sair da empresa: **Desativar** no Painel do adm (a pessoa cai na hora).
- O que já vem pronto: HTTPS com cadeado, cookie de login só por HTTPS, limite de tentativas de senha (8 erros em 15 min bloqueiam aquele IP), cabeçalhos de segurança, e o DashZon aceita só o seu domínio (qualquer outro nome recebe "Host not permitted").

## Deu problema?

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Do celular não abre nada (demora e dá erro) | Porta não redirecionada, IP interno errado, firewall ou CGNAT | Confira os Passos 1, 4 e 5. Teste se a porta está aberta em https://www.yougetsignal.com/tools/open-ports/ (porta 2444) **com o `iniciar-publico.ps1` rodando** |
| Abre, mas o navegador diz que a conexão não é segura | O certificado ainda não saiu | Espere 2 minutos e veja `deploy\logs\caddy.log`. Mensagem de erro com `duckdns` ou `TXT`: confira o token |
| `DuckDNS respondeu 'KO'` | Domínio ou token errado | Corrija o `deploy\publico.env` (domínio **sem** `.duckdns.org`) |
| `Host not permitted` | Acessou por um endereço que não é o do `publico.env` | Use exatamente `https://SEUNOME.duckdns.org:2444` |
| Pelo Wi-Fi de casa o domínio não abre, mas no 4G abre | O roteador não faz "NAT loopback" | Normal. Em casa, use `http://127.0.0.1:4567` |
| `O DashZon não subiu` | Erro no Ruby ou porta 4567 ocupada | Veja `deploy\logs\dashzon.log` |
| `O Caddy não subiu` | Porta 2444 ocupada por outro programa | Veja `deploy\logs\caddy.log`; ou troque `PORTA_PUBLICA` (e o redirecionamento no roteador) |
| `não pode ser carregado porque a execução de scripts foi desabilitada` | Política de execução do Windows | Rode sempre com `powershell -ExecutionPolicy Bypass -File ...`, como nos exemplos |
| Funcionou ontem e hoje não | O IP mudou e o PC estava desligado, ou o PC reiniciou | Rode o `iniciar-publico.ps1` (ele atualiza o DuckDNS antes de subir) |
| Muitas tentativas / 429 | 8 erros de senha do mesmo IP em 15 min | Espere 15 minutos |

## Desfazer tudo

1. `powershell -ExecutionPolicy Bypass -File C:\Projetos\DashZon\deploy\parar-publico.ps1`
2. Apague a tarefa do DuckDNS: `schtasks /Delete /TN "DashZon DuckDNS" /F`
3. Remova a regra do firewall (PowerShell como administrador): `Remove-NetFirewallRule -DisplayName "DashZon HTTPS (porta 2444)"`
4. Apague o redirecionamento da porta 2444 no roteador.
5. (Opcional) Apague o domínio no site do DuckDNS.

O DashZon continua funcionando normalmente em `http://127.0.0.1:4567`.
