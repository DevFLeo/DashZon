# Funções compartilhadas pelos scripts de publicação (não rode este arquivo sozinho).

$ErrorActionPreference = "Stop"
$Script:Deploy = $PSScriptRoot
$Script:Raiz = Split-Path $PSScriptRoot -Parent
$Script:Logs = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Force $Script:Logs | Out-Null

function Ler-Config([string]$Arquivo = (Join-Path $PSScriptRoot "publico.env")) {
    if (-not (Test-Path $Arquivo)) {
        throw "Não achei $Arquivo. Copie deploy\publico.env.example para deploy\publico.env e preencha (veja docs\PUBLICAR-DUCKDNS.md)."
    }
    $cfg = @{}
    foreach ($linha in Get-Content $Arquivo -Encoding UTF8) {
        $l = $linha.Trim()
        if ($l -eq "" -or $l.StartsWith("#")) { continue }
        $i = $l.IndexOf("=")
        if ($i -lt 1) { continue }
        $cfg[$l.Substring(0, $i).Trim()] = $l.Substring($i + 1).Trim()
    }

    $dominio = [string]$cfg["DUCKDNS_DOMINIO"]
    $dominio = $dominio -replace "\.duckdns\.org$", ""
    if ($dominio -notmatch "^[a-z0-9-]{1,63}$" -or $dominio -eq "meupainel") {
        throw "DUCKDNS_DOMINIO inválido em publico.env: use só o nome (ex.: meupainel), em minúsculas."
    }
    if ([string]$cfg["DUCKDNS_TOKEN"] -notmatch "^[0-9a-fA-F-]{30,}$") {
        throw "DUCKDNS_TOKEN parece errado em publico.env: copie o token do topo da página do duckdns.org."
    }
    $porta = 2444
    if ($cfg["PORTA_PUBLICA"]) { $porta = [int]$cfg["PORTA_PUBLICA"] }
    if ($porta -lt 1024 -or $porta -gt 65535) { throw "PORTA_PUBLICA deve estar entre 1024 e 65535." }

    [pscustomobject]@{
        Dominio = $dominio
        Host    = "$dominio.duckdns.org"
        Token   = $cfg["DUCKDNS_TOKEN"]
        Porta   = $porta
        Url     = "https://$dominio.duckdns.org:$porta"
    }
}

function Caminho-Caddy { Join-Path $PSScriptRoot "bin\caddy.exe" }

function Parar-Porta([int]$Porta) {
    Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

function Esperar-Porta([int]$Porta, [int]$Segundos = 30) {
    for ($i = 0; $i -lt $Segundos; $i++) {
        if (Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue) { return $true }
        Start-Sleep 1
    }
    return $false
}

function Eh-Admin {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
