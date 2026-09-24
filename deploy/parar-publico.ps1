# Tira o DashZon do ar (Caddy e o servidor Ruby).
# Uso: powershell -ExecutionPolicy Bypass -File C:\Projetos\DashZon\deploy\parar-publico.ps1
param([string]$ArquivoConfig, [int]$PortaInterna = 4567)

. (Join-Path $PSScriptRoot "_comum.ps1")
$caddy = Caminho-Caddy
Get-Process caddy -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $caddy } | Stop-Process -Force
try {
    $cfg = if ($ArquivoConfig) { Ler-Config $ArquivoConfig } else { Ler-Config }
    Parar-Porta $cfg.Porta
} catch { }
Parar-Porta $PortaInterna
Write-Host "DashZon e Caddy parados. (A tarefa 'DashZon DuckDNS' continua atualizando o IP; para removê-la: schtasks /Delete /TN `"DashZon DuckDNS`" /F)"
