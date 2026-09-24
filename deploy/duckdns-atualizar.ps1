# Avisa o DuckDNS qual é o IP público desta casa. A internet residencial troca
# de IP de tempos em tempos; o instalar.ps1 agenda este script a cada 5 minutos.
# Uso manual: powershell -ExecutionPolicy Bypass -File deploy\duckdns-atualizar.ps1
param([string]$ArquivoConfig)

. (Join-Path $PSScriptRoot "_comum.ps1")
$cfg = if ($ArquivoConfig) { Ler-Config $ArquivoConfig } else { Ler-Config }
$log = Join-Path $Logs "duckdns.log"

try {
    # ip= vazio: o DuckDNS usa o IP de onde veio a chamada (o público da casa).
    $url = "https://www.duckdns.org/update?domains=$($cfg.Dominio)&token=$($cfg.Token)&ip="
    $resposta = (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 20).Content.Trim()
} catch {
    $resposta = "ERRO: $($_.Exception.Message)"
}

$linha = "{0:yyyy-MM-dd HH:mm:ss}  {1}  {2}" -f (Get-Date), $cfg.Host, $resposta
Add-Content -Path $log -Value $linha -Encoding UTF8
# Mantém o log pequeno (últimas 500 linhas).
$todas = Get-Content $log -Encoding UTF8
if ($todas.Count -gt 500) { $todas | Select-Object -Last 500 | Set-Content $log -Encoding UTF8 }

if ($resposta -eq "OK") {
    Write-Host "DuckDNS atualizado: $($cfg.Host)"
} else {
    Write-Host "DuckDNS respondeu '$resposta'. Confira o domínio e o token em deploy\publico.env." -ForegroundColor Yellow
    exit 1
}
