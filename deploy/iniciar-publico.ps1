# Sobe o DashZon para acesso pela internet:
#   DashZon (Ruby) só em 127.0.0.1:4567  <-  Caddy (HTTPS) em 0.0.0.0:2444  <-  internet
# Uso: powershell -ExecutionPolicy Bypass -File C:\Projetos\DashZon\deploy\iniciar-publico.ps1
#
# Parâmetros para testes (não precisa usar no dia a dia):
#   -ArquivoConfig  outro .env;  -PortaInterna  porta do DashZon;  -Banco  outro arquivo .db
#   -Caddyfile      outro Caddyfile;  -SemDuckDns  não chama o duckdns.org
param(
    [string]$ArquivoConfig,
    [int]$PortaInterna = 4567,
    [string]$Banco,
    [string]$Caddyfile = "Caddyfile",
    [switch]$SemDuckDns
)

. (Join-Path $PSScriptRoot "_comum.ps1")
$cfg = if ($ArquivoConfig) { Ler-Config $ArquivoConfig } else { Ler-Config }
$caddy = Caminho-Caddy
if (-not (Test-Path $caddy)) { throw "Caddy não instalado. Rode antes: deploy\instalar.ps1" }
$bundle = (Get-Command bundle -ErrorAction SilentlyContinue).Source
if (-not $bundle) { $bundle = "C:\Ruby34-x64\bin\bundle.bat" }
if (-not (Test-Path $bundle)) { throw "Não achei o bundle do Ruby. Instale o Ruby 3.4 (veja o README)." }
# O bundle chama o `ruby` pelo PATH; num terminal aberto antes da instalação do
# Ruby (ou numa tarefa agendada), ele não estaria lá.
$env:Path = (Split-Path $bundle) + ";" + $env:Path

# 0. IP atualizado no DuckDNS.
if (-not $SemDuckDns) { & (Join-Path $Deploy "duckdns-atualizar.ps1") $ArquivoConfig }

# 1. Para o que estiver rodando nessas portas (um DashZon local, um Caddy antigo).
Parar-Porta $PortaInterna
Parar-Porta $cfg.Porta
Get-Process caddy -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $caddy } | Stop-Process -Force
Start-Sleep 1

# 2. DashZon com as variáveis de uso público.
$env:DASHZON_HOST = "127.0.0.1"                 # nunca exposto direto: só o Caddy chega nele
$env:PORT = "$PortaInterna"
$env:DASHZON_HOSTS = $cfg.Host                  # aceita o domínio (além de localhost)
$env:DASHZON_COOKIE_SEGURO = "1"                # cookie de login só por HTTPS
$env:DASHZON_URL_PUBLICA = $cfg.Url             # links de e-mail/redefinição
if ($Banco) {
    # Relativo à raiz do projeto (o servidor roda em backend\).
    if (-not [IO.Path]::IsPathRooted($Banco)) { $Banco = Join-Path $Raiz $Banco }
    $env:DASHZON_DB_PATH = $Banco
}
Start-Process -FilePath $bundle -ArgumentList "exec", "ruby", "app.rb" -WorkingDirectory (Join-Path $Raiz "backend") `
    -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Logs "dashzon-saida.log") -RedirectStandardError (Join-Path $Logs "dashzon.log")
if (-not (Esperar-Porta $PortaInterna 40)) { throw "O DashZon não subiu. Veja deploy\logs\dashzon.log" }
Write-Host "[ok] DashZon em 127.0.0.1:$PortaInterna"

# 3. Caddy (HTTPS na porta pública, certificado pelo DuckDNS).
$env:DUCKDNS_DOMINIO = $cfg.Dominio
$env:DUCKDNS_TOKEN = $cfg.Token
$env:PORTA_PUBLICA = "$($cfg.Porta)"
$env:PORTA_INTERNA = "$PortaInterna"
Start-Process -FilePath $caddy -ArgumentList "run", "--config", $Caddyfile, "--adapter", "caddyfile" -WorkingDirectory $Deploy `
    -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Logs "caddy-saida.log") -RedirectStandardError (Join-Path $Logs "caddy.log")
if (-not (Esperar-Porta $cfg.Porta 30)) { throw "O Caddy não subiu. Veja deploy\logs\caddy.log" }
Write-Host "[ok] Caddy em 0.0.0.0:$($cfg.Porta)"

Write-Host "`nNo ar: $($cfg.Url)"
Write-Host "Na primeira vez o certificado pode levar 1 a 2 minutos (acompanhe deploy\logs\caddy.log)."
Write-Host "Para parar: deploy\parar-publico.ps1"
