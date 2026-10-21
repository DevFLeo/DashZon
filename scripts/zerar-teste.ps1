# Zera a instância de TESTE (nunca o banco real): para o servidor da porta,
# apaga só o arquivo do banco de teste e sobe de novo, vazio. A segredo.key
# da pasta não é tocada.
#   powershell -ExecutionPolicy Bypass -File scripts\zerar-teste.ps1 -Porta 4580 -Banco data\teste-pdz.db
# Recusa data\dashzon.db (o banco de verdade).
param(
    [int]$Porta = 4580,
    [string]$Banco = 'data\teste-pdz.db'
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$caminho = if ([IO.Path]::IsPathRooted($Banco)) { $Banco } else { Join-Path $raiz $Banco }
if ((Split-Path $caminho -Leaf) -eq 'dashzon.db') { Write-Host 'ERRO: este script não mexe no banco real (dashzon.db).'; exit 2 }

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'rodar.ps1') -Porta $Porta -Parar | Out-Null
Start-Sleep -Milliseconds 800
foreach ($f in @($caminho, "$caminho-journal")) { if (Test-Path $f) { Remove-Item $f -Force } }
Start-Process powershell -ArgumentList @('-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'rodar.ps1'), '-Porta', $Porta, '-Banco', $Banco) -WindowStyle Hidden
for ($i = 0; $i -lt 60; $i++) {
    try { $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Porta/api/status" -TimeoutSec 2; if ($r.Content -match '"configured":false') { Write-Host "Zerada e no ar: http://127.0.0.1:$Porta"; exit 0 } } catch { }
    Start-Sleep -Milliseconds 500
}
Write-Host 'ERRO: a instância não voltou zerada em 30 s (veja log\dashzon.log).'
exit 1
