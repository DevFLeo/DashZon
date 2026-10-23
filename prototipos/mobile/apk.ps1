# Gera um APK testável do app (Android), no PC, sem conta na Expo:
#   1. expo prebuild: gera a pasta android/ (projeto nativo, fora do git);
#   2. gradlew assembleRelease: o JS vai dentro do APK (não precisa do Metro
#      nem do Expo Go), assinado com a chave de debug (serve para teste, não
#      para a Play Store);
#   3. copia para apk\dashzon-<versão>.apk e, com -Instalar, instala no
#      aparelho conectado (emulador ou celular com depuração USB).
#
#   powershell -ExecutionPolicy Bypass -File apk.ps1                 # só HTTPS
#   powershell -ExecutionPolicy Bypass -File apk.ps1 -Http -Instalar # libera http:// (teste na rede local)
#
# Precisa do Android Studio (traz o Java e o SDK). O primeiro build demora:
# baixa o Gradle e as dependências.
param(
    [switch]$Http,       # libera http:// (só para teste)
    [switch]$Instalar,   # adb install no aparelho conectado
    [switch]$Limpo       # recria a pasta android/ do zero
)
$ErrorActionPreference = 'Stop'
$mobile = $PSScriptRoot
if (-not $env:JAVA_HOME) {
    $jbr = 'C:\Program Files\Android\Android Studio\jbr'
    if (-not (Test-Path $jbr)) { Write-Host 'ERRO: Java não encontrado. Instale o Android Studio ou defina JAVA_HOME.'; exit 2 }
    $env:JAVA_HOME = $jbr
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path $env:ANDROID_HOME)) { Write-Host "ERRO: SDK do Android não encontrado em $env:ANDROID_HOME."; exit 2 }
$env:DASHZON_APK_HTTP = if ($Http) { '1' } else { '0' }

Push-Location $mobile
try {
    Write-Host "== expo prebuild (http:// $(if ($Http) { 'liberado' } else { 'bloqueado' }))"
    # O prebuild aplica o app.config.js; --clean garante que a troca de -Http vale.
    $args_ = @('expo', 'prebuild', '--platform', 'android', '--no-install')
    if ($Limpo -or (Test-Path 'android')) { $args_ += '--clean' }
    # O prebuild troca os scripts "android" e "ios" do package.json; devolve como estava.
    $pacote = Join-Path $mobile 'package.json'
    $original = [IO.File]::ReadAllText($pacote)
    try { & npx @args_ } finally { [IO.File]::WriteAllText($pacote, $original, (New-Object Text.UTF8Encoding $false)) }
    if ($LASTEXITCODE -ne 0) { throw 'expo prebuild falhou' }

    # O ninja que vem com o CMake do SDK (1.10) não aceita caminhos de mais de
    # 260 caracteres no Windows, e o build do C++ das dependências passa disso.
    # Usa uma cópia do CMake do SDK com o ninja 1.12 (fora do SDK, que fica intacto).
    $cmakeSdk = Get-ChildItem (Join-Path $env:ANDROID_HOME 'cmake') -Directory | Sort-Object Name | Select-Object -Last 1
    $cmake = Join-Path $env:LOCALAPPDATA 'DashZon\cmake-android'
    if (-not (Test-Path (Join-Path $cmake 'bin\cmake.exe'))) {
        Write-Host "== Preparando o CMake com o ninja 1.12 em $cmake"
        Copy-Item $cmakeSdk.FullName $cmake -Recurse -Force
        $zip = Join-Path $env:TEMP 'ninja-win.zip'
        Invoke-WebRequest 'https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip' -OutFile $zip -UseBasicParsing
        Expand-Archive $zip (Join-Path $cmake 'bin') -Force
    }
    $barra = { param($p) $p.Replace('\', '/') }
    Set-Content 'android\local.properties' "sdk.dir=$(& $barra $env:ANDROID_HOME)`ncmake.dir=$(& $barra $cmake)" -Encoding ascii

    Write-Host '== gradlew assembleRelease'
    Push-Location android
    # arm64-v8a: os celulares; x86_64: o emulador. As outras arquiteturas só aumentam o APK.
    try { & .\gradlew.bat assembleRelease --console=plain '-PreactNativeArchitectures=arm64-v8a,x86_64'; if ($LASTEXITCODE -ne 0) { throw 'gradlew falhou' } } finally { Pop-Location }

    $versao = (Get-Content app.json -Raw | ConvertFrom-Json).expo.version
    New-Item -ItemType Directory -Force apk | Out-Null
    $destino = Join-Path $mobile "apk\dashzon-$versao$(if ($Http) { '-http' }).apk"
    Copy-Item 'android\app\build\outputs\apk\release\app-release.apk' $destino -Force
    Write-Host "== APK: $destino ($([math]::Round((Get-Item $destino).Length / 1MB, 1)) MB)"

    if ($Instalar) {
        $adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
        & $adb install -r $destino
        if ($LASTEXITCODE -ne 0) { throw 'adb install falhou (há um aparelho conectado?)' }
        Write-Host '== Instalado (com.dashzon.app)'
    }
} finally { Pop-Location }
