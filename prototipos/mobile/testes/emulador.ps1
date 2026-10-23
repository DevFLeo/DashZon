# Teste do app no emulador Android (o app nativo, no Expo Go), do começo ao fim:
#   1. liga o emulador (o aparelho virtual do Android Studio), se não houver
#      um aparelho conectado, e espera o Android terminar de iniciar;
#   2. adb reverse: no emulador, 127.0.0.1:8081 (Metro) e 127.0.0.1:<Porta>
#      (a instância de teste) apontam para este PC;
#   3. sobe o Metro (npx expo start) se a porta 8081 estiver livre;
#   4. em cada rodada: zera a instância de teste e roda testes\e2e-emulador.mjs.
#
#   powershell -ExecutionPolicy Bypass -File testes\emulador.ps1               # 2 rodadas
#   powershell -ExecutionPolicy Bypass -File testes\emulador.ps1 -Rodadas 1 -Avd Pixel_10
#   powershell -ExecutionPolicy Bypass -File testes\emulador.ps1 -Fechar       # desliga emulador e Metro no fim
#
# Precisa do Android Studio com um aparelho virtual (AVD). Os demais
# parâmetros (conta, templates, alvo de toque) ficam em testes\parametros.mjs.
param(
    [int]$Rodadas = 2,
    [int]$Porta = 4581,                # instância de teste; nunca a 4567 (a do banco real)
    [string]$Banco = 'data\teste-mobile.db',
    [string]$Avd = '',                 # vazio = DASHZON_TESTE_AVD ou o primeiro da lista
    [switch]$Fechar
)
$ErrorActionPreference = 'Stop'
$mobile = Split-Path $PSScriptRoot -Parent
$raiz = Split-Path (Split-Path $mobile -Parent) -Parent
$rodar = Join-Path $raiz 'scripts\rodar.ps1'
if ($Porta -eq 4567) { Write-Host 'ERRO: a porta 4567 é a do DashZon de verdade. Use outra (-Porta).'; exit 2 }
if ($Banco -match 'dashzon\.db$') { Write-Host 'ERRO: esse é o banco real. Use outro (-Banco).'; exit 2 }

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$emulador = Join-Path $sdk 'emulator\emulator.exe'
if (-not (Test-Path $adb)) { Write-Host "ERRO: adb não encontrado em $adb. Instale o Android Studio (SDK Platform-Tools)."; exit 2 }

# 1. Emulador
$conectados = (& $adb devices) -match "`tdevice$"
if (-not $conectados) {
    if (-not $Avd) { $Avd = if ($env:DASHZON_TESTE_AVD) { $env:DASHZON_TESTE_AVD } else { (& $emulador -list-avds | Select-Object -First 1) } }
    if (-not $Avd) { Write-Host 'ERRO: nenhum aparelho virtual. Crie um no Android Studio (Device Manager).'; exit 2 }
    Write-Host "== Ligando o emulador $Avd"
    Start-Process $emulador -ArgumentList @('-avd', $Avd, '-no-boot-anim', '-netdelay', 'none', '-netspeed', 'full') | Out-Null
    & $adb wait-for-device
}
for ($i = 0; $i -lt 120; $i++) { if ((& $adb shell getprop sys.boot_completed 2>$null) -match '1') { break }; Start-Sleep 2 }
Write-Host "== Aparelho pronto: $((& $adb devices) -match "`tdevice$" | Select-Object -First 1)"

# 2. Portas
& $adb reverse tcp:8081 tcp:8081 | Out-Null
& $adb reverse "tcp:$Porta" "tcp:$Porta" | Out-Null

# 3. Metro
$metro = $null
if (-not (Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue)) {
    Write-Host '== Subindo o Metro (npx expo start)'
    $log = Join-Path $PSScriptRoot 'resultados\metro.log'
    New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
    $metro = Start-Process cmd -ArgumentList '/c', "npx expo start --port 8081 > `"$log`" 2>&1" -WorkingDirectory $mobile -WindowStyle Hidden -PassThru
    for ($i = 0; $i -lt 60; $i++) { if (Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue) { break }; Start-Sleep 2 }
}

# 4. Rodadas
Push-Location $mobile
$falhas = 0
$data = Get-Date -Format 'yyyyMMdd-HHmmss'
try {
    for ($r = 1; $r -le $Rodadas; $r++) {
        Write-Host "== Rodada $r de ${Rodadas}: instância de teste zerada na porta $Porta"
        & powershell -ExecutionPolicy Bypass -File $rodar -Porta $Porta -Parar | Out-Null
        Remove-Item "$(Join-Path $raiz $Banco)*" -Force -ErrorAction SilentlyContinue
        & powershell -ExecutionPolicy Bypass -File $rodar -Porta $Porta -Banco $Banco
        $env:DASHZON_TESTE_API = "http://127.0.0.1:$Porta"
        $env:DASHZON_TESTE_SAIDA = Join-Path $PSScriptRoot "resultados\$data-emulador-rodada$r"
        & node testes/e2e-emulador.mjs
        if ($LASTEXITCODE -ne 0) { $falhas++ }
    }
} finally {
    & powershell -ExecutionPolicy Bypass -File $rodar -Porta $Porta -Parar | Out-Null
    Remove-Item "$(Join-Path $raiz $Banco)*" -Force -ErrorAction SilentlyContinue
    if ($Fechar) {
        if ($metro) { Stop-Process -Id $metro.Id -Force -ErrorAction SilentlyContinue }
        & $adb emu kill | Out-Null
    }
    Pop-Location
}
if ($falhas) { Write-Host "== $falhas rodada(s) com falha"; exit 1 }
Write-Host '== Tudo certo no emulador'
