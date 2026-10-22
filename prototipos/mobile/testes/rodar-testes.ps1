# Testes do app de celular, do começo ao fim:
#   1. testes de unidade (Node);
#   2. exporta a versão web (npx expo export --platform web);
#   3. em cada rodada: zera e sobe uma instância de TESTE do DashZon (outra
#      porta, outro banco) e roda o teste de ponta a ponta no navegador.
#
#   powershell -ExecutionPolicy Bypass -File testes\rodar-testes.ps1                 # 2 rodadas
#   powershell -ExecutionPolicy Bypass -File testes\rodar-testes.ps1 -Rodadas 1 -SemExport
#   powershell -ExecutionPolicy Bypass -File testes\rodar-testes.ps1 -SoUnidade
#
# Os demais parâmetros (usuário, senha, templates, telas, navegador) ficam em
# testes\parametros.mjs e podem vir de variáveis de ambiente.
param(
    [int]$Rodadas = 2,
    [int]$Porta = 4581,                # instância de teste; nunca a 4567 (a do banco real)
    [string]$Banco = 'data\teste-mobile.db',
    [switch]$SoUnidade,
    [switch]$SemExport
)
$ErrorActionPreference = 'Stop'
$mobile = Split-Path $PSScriptRoot -Parent
$raiz = Split-Path (Split-Path $mobile -Parent) -Parent
$rodar = Join-Path $raiz 'scripts\rodar.ps1'
if ($Porta -eq 4567) { Write-Host 'ERRO: a porta 4567 é a do DashZon de verdade. Use outra (-Porta).'; exit 2 }
if ($Banco -match 'dashzon\.db$') { Write-Host 'ERRO: esse é o banco real. Use outro (-Banco).'; exit 2 }

Push-Location $mobile
$falhas = 0
try {
    Write-Host '== Testes de unidade'
    & node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test testes/unidade.test.mjs
    if ($LASTEXITCODE -ne 0) { $falhas++ }
    if ($SoUnidade) { return }

    if (-not $SemExport) {
        Write-Host '== Exportando a versão web'
        & npx expo export --platform web | Select-Object -Last 1
        if ($LASTEXITCODE -ne 0) { throw 'O export da versão web falhou.' }
    }

    $data = Get-Date -Format 'yyyyMMdd-HHmmss'
    $arquivoBanco = Join-Path $raiz $Banco
    for ($r = 1; $r -le $Rodadas; $r++) {
        Write-Host "== Rodada $r de ${Rodadas}: instância de teste zerada na porta $Porta"
        & powershell -ExecutionPolicy Bypass -File $rodar -Porta $Porta -Parar | Out-Null
        Remove-Item "$arquivoBanco*" -Force -ErrorAction SilentlyContinue
        & powershell -ExecutionPolicy Bypass -File $rodar -Porta $Porta -Banco $Banco
        $env:DASHZON_TESTE_API = "http://127.0.0.1:$Porta"
        $env:DASHZON_TESTE_SAIDA = Join-Path $PSScriptRoot "resultados\$data-rodada$r"
        & node testes/e2e-web.mjs
        if ($LASTEXITCODE -ne 0) { $falhas++ }
    }
} finally {
    if (-not $SoUnidade) {
        & powershell -ExecutionPolicy Bypass -File $rodar -Porta $Porta -Parar | Out-Null
        Remove-Item "$(Join-Path $raiz $Banco)*" -Force -ErrorAction SilentlyContinue
    }
    Pop-Location
}
if ($falhas) { Write-Host "== $falhas etapa(s) com falha"; exit 1 }
Write-Host '== Tudo certo'
