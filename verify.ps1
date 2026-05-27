# verify.ps1 — snappy verification that backend/frontend/mobile dev servers
# come up and respond. Reuses already-running servers (cheap re-runs), starts
# them in the background if they're down. Leaves servers running on exit so
# subsequent verifications are instant. Exit code 0 = all checks passed.
#
#   .\verify.ps1                # backend + frontend (default)
#   .\verify.ps1 -Backend       # backend only
#   .\verify.ps1 -Mobile        # also start + check the Expo/Metro bundler
#   .\verify.ps1 -All           # backend + frontend + mobile
#   .\verify.ps1 -Stop          # kill servers this script previously started
#   .\verify.ps1 -TimeoutSec 60 # extend cold-start budget (default 45s)

[CmdletBinding()]
param(
    [switch]$Backend,
    [switch]$Frontend,
    [switch]$Mobile,
    [switch]$All,
    [switch]$Stop,
    [int]$TimeoutSec = 45
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pidFile = Join-Path $root '.verify-pids.json'

if (-not ($Backend -or $Frontend -or $Mobile -or $All -or $Stop)) {
    $Backend = $true; $Frontend = $true
}
if ($All) { $Backend = $true; $Frontend = $true; $Mobile = $true }

function Test-Port($port) {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync('127.0.0.1', $port)
        if ($task.Wait(100)) { return $client.Connected }
        return $false
    } catch { return $false } finally { $client.Close() }
}

function Wait-ForUrl($url, $timeoutSec) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -lt 500) { return $true }
        } catch {}
        Start-Sleep -Milliseconds 150
    }
    return $false
}

function Save-Pid($name, $procId) {
    $data = @{}
    if (Test-Path $pidFile) {
        try { $data = Get-Content $pidFile -Raw | ConvertFrom-Json } catch { $data = @{} }
    }
    $obj = [pscustomobject]@{}
    foreach ($p in $data.PSObject.Properties) { $obj | Add-Member -NotePropertyName $p.Name -NotePropertyValue $p.Value }
    if ($obj.PSObject.Properties.Name -contains $name) { $obj.$name = $procId }
    else { $obj | Add-Member -NotePropertyName $name -NotePropertyValue $procId }
    $obj | ConvertTo-Json | Set-Content $pidFile -Encoding utf8
}

function Stop-Tracked {
    if (-not (Test-Path $pidFile)) { Write-Host "no tracked servers"; return }
    $data = Get-Content $pidFile -Raw | ConvertFrom-Json
    foreach ($p in $data.PSObject.Properties) {
        $procId = $p.Value
        try {
            $proc = Get-Process -Id $procId -ErrorAction Stop
            # kill whole tree (uvicorn --reload and npm both spawn children)
            taskkill /PID $procId /T /F | Out-Null
            Write-Host "  stopped $($p.Name) (PID $procId)"
        } catch { Write-Host "  $($p.Name) (PID $procId) already gone" }
    }
    Remove-Item $pidFile -Force
}

if ($Stop) { Stop-Tracked; exit 0 }

$results = @()

function Verify-Backend {
    $port = 8000
    $base = "http://127.0.0.1:$port"
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $startedHere = $false

    if (-not (Test-Port $port)) {
        Write-Host "[backend] starting uvicorn..."
        $uvicorn = Join-Path $root 'backend\backend\.venv\Scripts\uvicorn.exe'
        if (-not (Test-Path $uvicorn)) {
            $uvicorn = Join-Path $root 'backend\.venv\Scripts\uvicorn.exe'
        }
        $proc = Start-Process -FilePath $uvicorn `
            -ArgumentList 'main:app','--host','127.0.0.1','--port',$port `
            -WorkingDirectory (Join-Path $root 'backend') `
            -RedirectStandardOutput (Join-Path $root 'backend_dev.log') `
            -RedirectStandardError  (Join-Path $root 'backend_dev.err.log') `
            -PassThru -WindowStyle Hidden
        Save-Pid 'backend' $proc.Id
        $startedHere = $true
    } else {
        Write-Host "[backend] reusing server on :$port"
    }

    if (-not (Wait-ForUrl "$base/" $TimeoutSec)) {
        $sw.Stop()
        Write-Host "[backend] FAIL - no response in $TimeoutSec s" -ForegroundColor Red
        return @{ name='backend'; ok=$false; ms=$sw.ElapsedMilliseconds }
    }

    # Public checks: root + /health. /recipes/ now requires auth and 401s without a
    # session cookie — we verify that 401 separately to confirm the gate is wired.
    $checks = @(
        @{ url = "$base/";         expectKey = 'status'; expectCode = 200 },
        @{ url = "$base/health";   expectKey = 'status'; expectCode = 200 },
        @{ url = "$base/recipes/"; expectKey = $null;   expectCode = 401 }
    )
    $ok = $true
    foreach ($c in $checks) {
        $status = $null
        $content = $null
        try {
            $r = Invoke-WebRequest -Uri $c.url -UseBasicParsing -TimeoutSec 5
            $status = [int]$r.StatusCode
            $content = $r.Content
        } catch {
            # PS 5.1: non-2xx throws. Pull the real status code off the exception.
            if ($_.Exception.Response) {
                $status = [int]$_.Exception.Response.StatusCode
            } else {
                $ok = $false
                Write-Host "  [FAIL] $($c.url) -- $($_.Exception.Message)" -ForegroundColor Red
                continue
            }
        }
        if ($status -ne $c.expectCode) {
            $ok = $false
            Write-Host "  [FAIL] expected $($c.expectCode) got $status  $($c.url)" -ForegroundColor Red
            continue
        }
        if ($c.expectKey -and $content) {
            try {
                $json = $content | ConvertFrom-Json
                if (-not ($json.PSObject.Properties.Name -contains $c.expectKey)) {
                    $ok = $false
                    Write-Host "  [FAIL] $($c.url) missing key '$($c.expectKey)'" -ForegroundColor Red
                    continue
                }
            } catch {
                $ok = $false
                Write-Host "  [FAIL] $($c.url) -- bad JSON" -ForegroundColor Red
                continue
            }
        }
        Write-Host "  [OK]   $status $($c.url)" -ForegroundColor Green
    }
    $sw.Stop()
    $tag = if ($ok) { 'PASS' } else { 'FAIL' }
    $col = if ($ok) { 'Green' } else { 'Red' }
    Write-Host "[backend] $tag in $($sw.ElapsedMilliseconds)ms$(if($startedHere){' (cold start)'})" -ForegroundColor $col
    return @{ name='backend'; ok=$ok; ms=$sw.ElapsedMilliseconds }
}

function Verify-Frontend {
    $port = 3000
    $base = "http://127.0.0.1:$port"
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $startedHere = $false

    if (-not (Test-Port $port)) {
        Write-Host "[frontend] starting next dev..."
        $proc = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' `
            -WorkingDirectory (Join-Path $root 'frontend') `
            -RedirectStandardOutput (Join-Path $root 'frontend_dev.log') `
            -RedirectStandardError  (Join-Path $root 'frontend_dev.err.log') `
            -PassThru -WindowStyle Hidden
        Save-Pid 'frontend' $proc.Id
        $startedHere = $true
    } else {
        Write-Host "[frontend] reusing server on :$port"
    }

    # next dev can take a while on first compile — give it the full budget
    $budget = if ($startedHere) { [Math]::Max($TimeoutSec, 60) } else { $TimeoutSec }
    if (-not (Wait-ForUrl "$base/" $budget)) {
        $sw.Stop()
        Write-Host "[frontend] FAIL - no response in $budget s" -ForegroundColor Red
        return @{ name='frontend'; ok=$false; ms=$sw.ElapsedMilliseconds }
    }
    try {
        $r = Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 10
        $ok = $r.StatusCode -eq 200
        Write-Host "  [$(if($ok){'OK'}else{'FAIL'})]   $($r.StatusCode) $base/" -ForegroundColor $(if($ok){'Green'}else{'Red'})
    } catch {
        $ok = $false
        Write-Host "  [FAIL] $base/ -- $($_.Exception.Message)" -ForegroundColor Red
    }
    $sw.Stop()
    $tag = if ($ok) { 'PASS' } else { 'FAIL' }
    $col = if ($ok) { 'Green' } else { 'Red' }
    Write-Host "[frontend] $tag in $($sw.ElapsedMilliseconds)ms$(if($startedHere){' (cold start)'})" -ForegroundColor $col
    return @{ name='frontend'; ok=$ok; ms=$sw.ElapsedMilliseconds }
}

function Verify-Mobile {
    $port = 8081
    $base = "http://127.0.0.1:$port"
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $startedHere = $false

    if (-not (Test-Port $port)) {
        Write-Host "[mobile] starting expo (metro)..."
        $proc = Start-Process -FilePath 'npx.cmd' -ArgumentList 'expo','start','--port',$port `
            -WorkingDirectory (Join-Path $root 'mobile') `
            -RedirectStandardOutput (Join-Path $root 'mobile_dev.log') `
            -RedirectStandardError  (Join-Path $root 'mobile_dev.err.log') `
            -PassThru -WindowStyle Hidden
        Save-Pid 'mobile' $proc.Id
        $startedHere = $true
    } else {
        Write-Host "[mobile] reusing metro on :$port"
    }

    # Metro responds at /status with the literal text "packager-status:running".
    # In PS 5.1 -UseBasicParsing returns Content as byte[] when there is no text/*
    # Content-Type, which makes -match silently miss. Decode explicitly.
    $deadline = (Get-Date).AddSeconds([Math]::Max($TimeoutSec, 60))
    $ok = $false
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri "$base/status" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            $body = if ($r.Content -is [byte[]]) {
                [System.Text.Encoding]::UTF8.GetString($r.Content)
            } else { [string]$r.Content }
            if ($body -match 'packager-status:running') { $ok = $true; break }
        } catch {}
        Start-Sleep -Milliseconds 200
    }
    $sw.Stop()
    if ($ok) {
        Write-Host "  [OK]   metro $base/status" -ForegroundColor Green
        Write-Host "[mobile] PASS in $($sw.ElapsedMilliseconds)ms$(if($startedHere){' (cold start)'})" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] metro $base/status did not report running" -ForegroundColor Red
        Write-Host "[mobile] FAIL in $($sw.ElapsedMilliseconds)ms" -ForegroundColor Red
    }
    return @{ name='mobile'; ok=$ok; ms=$sw.ElapsedMilliseconds }
}

$total = [Diagnostics.Stopwatch]::StartNew()
if ($Backend)  { $results += Verify-Backend }
if ($Frontend) { $results += Verify-Frontend }
if ($Mobile)   { $results += Verify-Mobile }
$total.Stop()

Write-Host ""
Write-Host "--- summary ($($total.ElapsedMilliseconds)ms total) ---"
foreach ($r in $results) {
    $tag = if ($r.ok) { 'PASS' } else { 'FAIL' }
    $col = if ($r.ok) { 'Green' } else { 'Red' }
    Write-Host ("  {0,-9} {1,5}ms  {2}" -f $r.name, $r.ms, $tag) -ForegroundColor $col
}

if ($results | Where-Object { -not $_.ok }) { exit 1 } else { exit 0 }
