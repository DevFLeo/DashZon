# Auditoria de responsividade do DashZon: 7 tamanhos de tela (320 a 1920px) x
# as telas principais (setup, login, dashboard, módulo, notas, as 4 abas de
# Configurações, admin, menu do celular e os modais), com print de cada uma e
# checagens medidas (auditar-responsivo.js):
#   erros:  rolagem horizontal, elemento fora da tela, alvo de toque < 24px,
#           texto maior que a caixa, modal que não cabe, card < 150px, botões sobrepostos;
#   avisos: alvo de toque < 36px, campo < 16px (zoom no iPhone), texto < 11px.
#
# Use numa instância SEPARADA e ZERADA (o script faz o setup com dados de
# exemplo; num sistema já configurado ele se recusa a rodar):
#   powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1 -Porta 4570 -Banco data\teste-responsivo.db
#   powershell -ExecutionPolicy Bypass -File scripts\auditar-responsivo.ps1 -Porta 4570
#   powershell -ExecutionPolicy Bypass -File scripts\rodar.ps1 -Porta 4570 -Parar   (e apague data\teste-responsivo.db)
#
# Precisa do Microsoft Edge (vem no Windows). Prints em log\responsivo\<data>\.
# Para repetir só algumas telas: -Telas dashboard,modulo
# Sai com código 1 se houver algum erro: corrija e rode de novo, até zerar.
param(
    [int]$Porta = 4567,
    [string]$Telas = '',
    [string]$Saida = ''
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
if (-not $Saida) { $Saida = Join-Path $raiz ("log\responsivo\" + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
New-Item -ItemType Directory -Force $Saida | Out-Null
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Host "ERRO: Microsoft Edge não encontrado."; exit 2 }
$perfil = Join-Path $env:TEMP ("dz-edge-" + [guid]::NewGuid().ToString('N'))
$portaCdp = 9334
$base = "http://127.0.0.1:$Porta/"
# String pura: o texto do Get-Content -Raw carrega propriedades extras que fazem o ConvertTo-Json levar minutos.
$AUDITORIA = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'auditar-responsivo.js'), [Text.Encoding]::UTF8)

try { $st = Invoke-RestMethod "$($base)api/status" -TimeoutSec 5 } catch { Write-Host "ERRO: nada respondendo em $base"; exit 2 }
if ($st.configured -ne $false) { Write-Host "ERRO: a instância em $base já está configurada. Use uma instância separada e zerada (veja o topo do script)."; exit 2 }

$proc = Start-Process $edge -PassThru -ArgumentList @('--headless=new', "--remote-debugging-port=$portaCdp", "--user-data-dir=$perfil",
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-gpu', 'about:blank')
try {
    $alvos = $null
    for ($i = 0; $i -lt 40; $i++) { try { $alvos = Invoke-RestMethod "http://127.0.0.1:$portaCdp/json" -TimeoutSec 2; if ($alvos) { break } } catch { Start-Sleep -Milliseconds 300 } }
    $pagina = $alvos | Where-Object { $_.type -eq 'page' -and $_.url -eq 'about:blank' } | Select-Object -First 1
    if (-not $pagina) { $pagina = $alvos | Where-Object { $_.type -eq 'page' } | Select-Object -First 1 }
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ws.ConnectAsync([Uri]$pagina.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
    $script:id = 0

    function Receber {
        $buf = New-Object byte[] 1048576; $sb = New-Object System.Text.StringBuilder
        do {
            $seg = New-Object 'System.ArraySegment[byte]' -ArgumentList @(,$buf)
            $cts = New-Object Threading.CancellationTokenSource 30000
            $r = $ws.ReceiveAsync($seg, $cts.Token).Result
            [void]$sb.Append([System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
        } while (-not $r.EndOfMessage)
        return $sb.ToString() | ConvertFrom-Json
    }
    function Cdp($metodo, $params = @{}) {
        $script:id++; $meu = $script:id
        $bytes = [System.Text.Encoding]::UTF8.GetBytes((@{ id = $meu; method = $metodo; params = $params } | ConvertTo-Json -Depth 10 -Compress))
        $seg = New-Object 'System.ArraySegment[byte]' -ArgumentList @(,$bytes)
        $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
        while ($true) { $m = Receber; if ($m.PSObject.Properties.Name -contains 'id' -and $m.id -eq $meu) { return $m } }
    }
    function Js($expr) {
        $r = Cdp 'Runtime.evaluate' @{ expression = $expr; returnByValue = $true; awaitPromise = $true }
        if ($r.result.exceptionDetails) { return "EXC: " + $r.result.exceptionDetails.exception.description }
        return $r.result.result.value
    }
    function Esperar($expr, $seg = 12) { $sw = [Diagnostics.Stopwatch]::StartNew(); while ($sw.Elapsed.TotalSeconds -lt $seg) { if ((Js $expr) -eq $true) { return $true }; Start-Sleep -Milliseconds 200 }; return $false }
    function Print($nome) { $r = Cdp 'Page.captureScreenshot' @{ format = 'png' }; [IO.File]::WriteAllBytes((Join-Path $Saida "$nome.png"), [Convert]::FromBase64String($r.result.data)) }

    $telasVp = @(
        @{ n = '320';  w = 320;  h = 640;  m = $true },
        @{ n = '360';  w = 360;  h = 780;  m = $true },
        @{ n = '390';  w = 390;  h = 844;  m = $true },
        @{ n = '768';  w = 768;  h = 1024; m = $true },
        @{ n = '1024'; w = 1024; h = 768;  m = $false },
        @{ n = '1366'; w = 1366; h = 768;  m = $false },
        @{ n = '1920'; w = 1920; h = 1080; m = $false }
    )
    function Tamanho($vp) {
        [void](Cdp 'Emulation.setDeviceMetricsOverride' @{ width = $vp.w; height = $vp.h; deviceScaleFactor = 1; mobile = $vp.m })
        [void](Cdp 'Emulation.setTouchEmulationEnabled' @{ enabled = $vp.m; maxTouchPoints = 5 })
        [void](Js "window.dispatchEvent(new Event('resize')); 0")
        Start-Sleep -Milliseconds 500
    }
    $resultado = New-Object System.Collections.ArrayList
    function Auditar($tela, $vp) {
        Start-Sleep -Milliseconds 350
        $json = Js $AUDITORIA
        try { $o = $json | ConvertFrom-Json } catch { $o = [pscustomobject]@{ erros = @("auditoria falhou: $json"); avisos = @() } }
        Print "$($vp.n)-$tela"
        [void]$resultado.Add([pscustomobject]@{ tela = $tela; vp = $vp.n; erros = @($o.erros); avisos = @($o.avisos) })
    }
    $fecharModais = "document.querySelectorAll('.modal-overlay.open').forEach(o => o.classList.remove('open')); 0"
    function Quer($t) { return (-not $Telas) -or ($Telas -split ',' -contains $t) }

    [void](Cdp 'Page.enable'); [void](Cdp 'Runtime.enable')
    Tamanho $telasVp[2]
    [void](Cdp 'Page.navigate' @{ url = $base })
    [void](Esperar "document.getElementById('setup') && document.getElementById('setup').classList.contains('open') && document.querySelectorAll('#setup-galeria .tpl-card').length >= 1" 20)
    if (Quer 'setup') { foreach ($vp in $telasVp) { Tamanho $vp; Auditar 'setup' $vp } }

    # Setup com todos os templates e dados de exemplo (só nesta instância zerada).
    [void](Js "fetch('/api/templates').then(r => r.json()).then(ts => fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org_name: 'Empresa Exemplo Ltda', moeda: 'BRL', usuario: 'auditoria', senha: 'auditoria-responsiva-1', templates: ts.map(t => t.id), com_exemplos: true }) })).then(r => r.status)")
    [void](Cdp 'Page.navigate' @{ url = $base })
    [void](Esperar "document.getElementById('app').classList.contains('ready')" 20)

    foreach ($vp in $telasVp) {
        Tamanho $vp
        if (Quer 'dashboard') {
            [void](Js "location.hash = '#/d/1'; 0"); [void](Esperar "document.querySelectorAll('.grid-stack-item').length >= 1"); Start-Sleep -Milliseconds 900
            Auditar 'dashboard' $vp
        }
        if (Quer 'card') {
            [void](Js "location.hash = '#/d/1'; 0"); [void](Esperar "document.querySelectorAll('.grid-stack-item').length >= 1")
            [void](Js "document.getElementById('btn-add-widget').click(); 0"); [void](Esperar "document.getElementById('modal-widget').classList.contains('open')"); Start-Sleep -Milliseconds 700
            Auditar 'modal-card' $vp; [void](Js $fecharModais)
        }
        if (Quer 'modulo') {
            [void](Js "location.hash = '#/m/' + encodeURIComponent(App.modulos()[0].slug); 0"); [void](Esperar "!!document.querySelector('#mod-tabela table.data tbody tr')")
            Auditar 'modulo' $vp
        }
        if (Quer 'registro') {
            [void](Js "document.getElementById('btn-novo-registro').click(); 0"); [void](Esperar "document.getElementById('modal-registro').classList.contains('open')")
            Auditar 'modal-registro' $vp; [void](Js $fecharModais)
        }
        if (Quer 'estrutura') {
            [void](Js "document.getElementById('btn-estrutura').click(); 0"); [void](Esperar "document.getElementById('modal-estrutura').classList.contains('open')")
            Auditar 'modal-estrutura' $vp; [void](Js $fecharModais)
        }
        if (Quer 'addmodulo') {
            [void](Js "document.getElementById('btn-add-modulo').click(); 0"); [void](Esperar "document.getElementById('modal-add-modulo').classList.contains('open')"); Start-Sleep -Milliseconds 400
            Auditar 'modal-add-modulo' $vp; [void](Js $fecharModais)
        }
        if (Quer 'config') {
            # Configurações: as 4 abas (a de Módulos lista os módulos, as opções do Cronograma e a galeria).
            foreach ($aba in @('conta', 'aparencia', 'seguranca', 'modulos')) {
                [void](Js "location.hash = '#/config/$aba'; 0")
                [void](Esperar "document.getElementById('view-config').classList.contains('active') && !document.querySelector('[data-painel=$aba]').hidden && (('$aba' !== 'modulos') || document.querySelectorAll('#cfg-modulos .cfg-modulo').length > 0)")
                Start-Sleep -Milliseconds 300
                Auditar "config-$aba" $vp
            }
        }
        if (Quer 'notas') {
            # Caderno de notas (módulo com "visao": notas): lista + uma nota aberta lado a lado.
            [void](Js "location.hash = '#/m/anotacoes'; 0"); [void](Esperar "document.querySelectorAll('#notas-arvore .nota-item').length > 0")
            Auditar 'notas-lista' $vp
            [void](Js "document.querySelector('#notas-arvore .nota-item').click(); 0"); [void](Esperar "!document.getElementById('nota-painel').hidden && document.getElementById('nota-previa').children.length > 0")
            Start-Sleep -Milliseconds 300
            Auditar 'notas-nota' $vp
        }
        if ((Quer 'menu') -and $vp.w -le 800) {
            [void](Js "document.getElementById('btn-menu').click(); 0"); [void](Esperar "document.getElementById('app').classList.contains('menu-aberto')")
            Auditar 'menu-aberto' $vp
            [void](Js "document.getElementById('btn-menu').click(); 0")
        }
        if (Quer 'admin') {
            [void](Js "location.hash = '#/admin'; 0"); [void](Esperar "document.getElementById('view-admin').classList.contains('active')"); Start-Sleep -Milliseconds 500
            Auditar 'admin' $vp
        }
    }
    if (Quer 'login') {
        [void](Js "fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.status)")
        [void](Cdp 'Page.navigate' @{ url = $base })
        [void](Esperar "document.getElementById('login').classList.contains('open')" 15)
        foreach ($vp in $telasVp) { Tamanho $vp; Auditar 'login' $vp }
    }

    $erros = ($resultado | ForEach-Object { $_.erros.Count } | Measure-Object -Sum).Sum
    $avisos = ($resultado | ForEach-Object { $_.avisos.Count } | Measure-Object -Sum).Sum
    Write-Host "$($resultado.Count) auditorias, $erros erros, $avisos avisos. Prints em $Saida"
    foreach ($r in $resultado) {
        if ($r.erros.Count -or $r.avisos.Count) {
            Write-Host ("[{0,-17} {1,4}px]" -f $r.tela, $r.vp)
            foreach ($e in $r.erros) { Write-Host "    ERRO  $e" }
            foreach ($a in $r.avisos) { Write-Host "    aviso $a" }
        }
    }
    if ($erros -gt 0) { exit 1 }
} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    Start-Sleep -Milliseconds 400
    Remove-Item $perfil -Recurse -Force -ErrorAction SilentlyContinue
}
