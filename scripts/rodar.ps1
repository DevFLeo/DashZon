# "Rode o projeto": deixa o DashZon no ar com um comando, fazendo só o que falta.
#   powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1            sobe (ou diz que já está no ar)
#   powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1 -Reiniciar  para e sobe de novo
#   powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1 -Parar      para
#
# Pensado para gastar pouco (tempo e tokens de quem roda pelo assistente): cada
# etapa é pulada se já estiver pronta, e a saída normal é UMA linha. Só em caso
# de erro aparecem mais linhas (o final do log).
param(
    [int]$Porta = 4567,
    [switch]$Reiniciar,
    [switch]$Parar,
    [string]$Banco   # outro arquivo .db (testes); padrão: data\dashzon.db
)

$ErrorActionPreference = "Stop"
$Raiz = Split-Path $PSScriptRoot -Parent
$Backend = Join-Path $Raiz "backend"
$Logs = Join-Path $Raiz "log"
New-Item -ItemType Directory -Force $Logs | Out-Null
$url = "http://127.0.0.1:$Porta"

function Falhar([string]$msg, [string]$log) {
    Write-Host "ERRO: $msg" -ForegroundColor Red
    if ($log -and (Test-Path $log)) { Get-Content $log -Tail 8 | ForEach-Object { Write-Host "  $_" } }
    exit 1
}
function Respondendo {
    try { return (Invoke-WebRequest "$url/api/status" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { return $false }
}
# Para só o Ruby que escuta na porta: outro programa que esteja nela não é
# derrubado (avisa e sai; use -Porta para escolher outra).
function Parar-Servidor {
    Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
            $p = Get-Process -Id $_ -ErrorAction SilentlyContinue
            if (-not $p) { return }
            if ($p.ProcessName -in @("ruby", "rubyw")) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
            else { Falhar "A porta $Porta está com outro programa ($($p.ProcessName), PID $($p.Id)); não foi parado. Use -Porta." }
        }
}
function Porta-Ocupada {
    [bool](Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue)
}
# Programas nativos que escrevem na saída de erro não podem derrubar o script.
function Rodar-Quieto([string]$exe, [string[]]$argumentos, [string]$log) {
    $ErrorActionPreference = "Continue"
    & $exe @argumentos *> $log
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    return $codigo
}

if ($Parar) { Parar-Servidor; Write-Host "DashZon parado."; exit 0 }
if ($Reiniciar) { Parar-Servidor; Start-Sleep 1 }
elseif (Respondendo) { Write-Host "DashZon já está no ar: $url"; exit 0 }
elseif (Porta-Ocupada) {
    # Algo escuta na porta mas /api/status não deu 200: pode ser o DashZon com
    # erro (ex.: migração do banco que falhou). Subir outro só daria "porta em uso".
    Falhar "A porta $Porta já está em uso, mas $url/api/status não respondeu 200. Veja o log abaixo; depois use -Reiniciar (ou -Porta)." (Join-Path $Logs "dashzon.log")
}

# 1. Ruby (PATH ou o local padrão do RubyInstaller).
$ruby = (Get-Command ruby -ErrorAction SilentlyContinue).Source
if (-not $ruby) { $ruby = "C:\Ruby34-x64\bin\ruby.exe" }
if (-not (Test-Path $ruby)) { Falhar "Ruby não encontrado. Instale com: winget install RubyInstallerTeam.Ruby.3.4" }
$env:Path = (Split-Path $ruby) + ";" + $env:Path
$bundle = Join-Path (Split-Path $ruby) "bundle.bat"

# 2. Gems: só instala se faltar alguma.
Push-Location $Backend
try {
    if ((Rodar-Quieto $bundle @("check") (Join-Path $Logs "bundle.log")) -ne 0) {
        Write-Host "Instalando dependências do Ruby (só na primeira vez)..."
        if ((Rodar-Quieto $bundle @("install", "--quiet") (Join-Path $Logs "bundle.log")) -ne 0) {
            Falhar "bundle install falhou." (Join-Path $Logs "bundle.log")
        }
    }
} finally { Pop-Location }

# 3. Motor C++: compila só se não existir ou se o código for mais novo.
$motor = Join-Path $Raiz "engine-cpp\build\Release\dashzon_engine.exe"
$fonte = Get-ChildItem (Join-Path $Raiz "engine-cpp\src") -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not (Test-Path $motor) -or $fonte.LastWriteTime -gt (Get-Item $motor).LastWriteTime) {
    $cmake = (Get-Command cmake -ErrorAction SilentlyContinue).Source
    if (-not $cmake) { $cmake = "C:\Program Files\CMake\bin\cmake.exe" }
    if (-not (Test-Path $cmake)) { Falhar "CMake não encontrado. Instale com: winget install Kitware.CMake (e o Visual Studio Build Tools com C++)" }
    Write-Host "Compilando o motor C++ (só quando o código muda)..."
    $log = Join-Path $Logs "motor.log"
    $build = Join-Path $Raiz "engine-cpp\build"
    if (-not (Test-Path (Join-Path $build "CMakeCache.txt"))) {
        if ((Rodar-Quieto $cmake @("-S", (Join-Path $Raiz "engine-cpp"), "-B", $build) $log) -ne 0) { Falhar "cmake (configurar) falhou." $log }
    }
    if ((Rodar-Quieto $cmake @("--build", $build, "--config", "Release") $log) -ne 0) { Falhar "Compilação do motor falhou." $log }
}

# 4. Sobe o servidor (ruby direto com o bundler: ~0,5 s mais rápido que bundle exec).
# Caminho relativo vale a partir da raiz do projeto (o servidor roda em backend\,
# e lá "data\x.db" viraria backend\data\x.db).
if ($Banco) {
    if (-not [IO.Path]::IsPathRooted($Banco)) { $Banco = Join-Path $Raiz $Banco }
    $env:DASHZON_DB_PATH = $Banco
}
$env:PORT = "$Porta"
$erros = Join-Path $Logs "dashzon.log"
Start-Process -FilePath $ruby -ArgumentList "-rbundler/setup", "app.rb" -WorkingDirectory $Backend -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Logs "dashzon-saida.log") -RedirectStandardError $erros | Out-Null
for ($i = 0; $i -lt 60; $i++) {
    if (Respondendo) { Write-Host "DashZon no ar: $url"; exit 0 }
    Start-Sleep -Milliseconds 500
}
Falhar "O servidor não respondeu em 30 s." $erros
