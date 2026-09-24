# Prepara este PC para publicar o DashZon (rode UMA vez, como administrador):
#   1. baixa o Caddy com o plugin do DuckDNS (deploy\bin\caddy.exe);
#   2. confere o Caddyfile;
#   3. libera a porta pública no Firewall do Windows;
#   4. agenda a atualização do IP no DuckDNS a cada 5 minutos.
# Uso: clique com o botão direito no PowerShell > "Executar como administrador", e:
#   powershell -ExecutionPolicy Bypass -File C:\Projetos\DashZon\deploy\instalar.ps1
param([string]$ArquivoConfig, [switch]$SemFirewall, [switch]$SemAgendamento)

. (Join-Path $PSScriptRoot "_comum.ps1")
$cfg = if ($ArquivoConfig) { Ler-Config $ArquivoConfig } else { Ler-Config }
Write-Host "Preparando $($cfg.Url)`n"

# 1. Caddy (site oficial, com o módulo dns.providers.duckdns).
$caddy = Caminho-Caddy
if (-not (Test-Path $caddy)) {
    Write-Host "Baixando o Caddy (com o plugin do DuckDNS)..."
    New-Item -ItemType Directory -Force (Split-Path $caddy) | Out-Null
    $ProgressPreference = "SilentlyContinue"
    Invoke-WebRequest "https://caddyserver.com/api/download?os=windows&arch=amd64&p=github.com%2Fcaddy-dns%2Fduckdns" `
        -OutFile $caddy -UseBasicParsing -TimeoutSec 600
}
$modulos = & $caddy list-modules
if (-not ($modulos -match "dns.providers.duckdns")) { throw "O caddy.exe baixado não tem o plugin do DuckDNS. Apague deploy\bin\caddy.exe e rode de novo." }
Write-Host ("[ok] Caddy " + (& $caddy version).Split(" ")[0])

# 2. Caddyfile.
$env:DUCKDNS_DOMINIO = $cfg.Dominio
$env:DUCKDNS_TOKEN = $cfg.Token
$env:PORTA_PUBLICA = "$($cfg.Porta)"
$env:PORTA_INTERNA = "4567"
# O Caddy escreve até as mensagens normais na saída de erro; no PowerShell 5.1,
# com ErrorActionPreference=Stop, isso viraria uma exceção. Por isso, aqui, Continue.
Push-Location $Deploy
$ErrorActionPreference = "Continue"
$saida = & $caddy validate --config Caddyfile --adapter caddyfile 2>&1 | Out-String
$valido = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = "Stop"
Pop-Location
if (-not $valido) { throw "Caddyfile inválido:`n$saida" }
Write-Host "[ok] Caddyfile válido"

# 3. Firewall (precisa de administrador).
if (-not $SemFirewall) {
    $nome = "DashZon HTTPS (porta $($cfg.Porta))"
    if (-not (Eh-Admin)) {
        Write-Host "[!] Rode como administrador para liberar a porta $($cfg.Porta) no firewall (ou use -SemFirewall)." -ForegroundColor Yellow
    } elseif (Get-NetFirewallRule -DisplayName $nome -ErrorAction SilentlyContinue) {
        Write-Host "[ok] Firewall já liberado"
    } else {
        New-NetFirewallRule -DisplayName $nome -Direction Inbound -Protocol TCP -LocalPort $cfg.Porta -Action Allow -Profile Any | Out-Null
        Write-Host "[ok] Porta $($cfg.Porta) liberada no Firewall do Windows"
    }
}

# 4. Atualização do IP no DuckDNS a cada 5 minutos (tarefa do usuário atual).
if (-not $SemAgendamento) {
    $script = Join-Path $Deploy "duckdns-atualizar.ps1"
    $acao = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
    schtasks /Create /F /SC MINUTE /MO 5 /TN "DashZon DuckDNS" /TR $acao | Out-Null
    Write-Host "[ok] Tarefa agendada 'DashZon DuckDNS' (a cada 5 minutos)"
    & $script
}

Write-Host "`nPronto. Agora: redirecione a porta $($cfg.Porta) no roteador e rode deploy\iniciar-publico.ps1"
