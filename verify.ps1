# verify.ps1 — snappy verification that backend/frontend/mobile dev servers
# come up and respond. Reuses already-running servers (cheap re-runs), starts
# them in the background if they're down. Leaves servers running on exit so
# subsequent verifications are instant.
#
# Designed so Claude never needs a big tool timeout:
#   - the blocking path FAILS FAST — if a server process exits or a build error
#     shows up in its log, it returns in ~1s with the error tail instead of
#     waiting out the whole budget.
#   - `-Check` is a probe-only health check (never starts anything, sub-second).
#   - `-Start` launches what's down and returns immediately (non-blocking).
#
# Recommended responsive workflow (no long-blocking call):
#   .\verify.ps1 -Start         # kick off downed servers, returns fast
#   .\verify.ps1 -Check         # poll this until exit 0 (pass) or 1 (fail)
#
# Exit codes:
#   0  all selected services healthy
#   1  at least one service is up but FAILING its checks  (real breakage)
#   2  (-Check only) a service isn't listening yet — still warming / not started
#
# Usage:
#   .\verify.ps1                # backend + frontend, blocking + fail-fast (default)
#   .\verify.ps1 -Backend       # backend only
#   .\verify.ps1 -Mobile        # also start + check the Expo/Metro bundler
#   .\verify.ps1 -All           # backend + frontend + mobile
#   .\verify.ps1 -Check         # probe-only: report health of running servers, never start
#   .\verify.ps1 -Start         # start downed servers and return immediately
#   .\verify.ps1 -Stop          # kill servers this script previously started
#   .\verify.ps1 -TimeoutSec 60 # extend cold-start budget for the blocking path (default 45s)

[CmdletBinding()]
param(
    [switch]$Backend,
    [switch]$Frontend,
    [switch]$Mobile,
    [switch]$All,
    [switch]$Check,
    [switch]$Start,
    [switch]$Stop,
    [int]$TimeoutSec = 45
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pidFile = Join-Path $root '.verify-pids.json'

if (-not ($Backend -or $Frontend -or $Mobile -or $All)) {
    $Backend = $true; $Frontend = $true
}
if ($All) { $Backend = $true; $Frontend = $true; $Mobile = $true }

# Mode: 'check' (probe only), 'start' (launch + return), 'full' (block w/ fail-fast)
$mode = if ($Check) { 'check' } elseif ($Start) { 'start' } else { 'full' }

function Test-Port($port, $timeoutMs = 1000) {
    # 1s, not 100ms: a localhost connect under load can take >100ms, and a tight
    # timeout produces false "NOT UP" reports that mislead more than they speed up.
    $client = New-Object Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync('127.0.0.1', $port)
        if ($task.Wait($timeoutMs)) { return $client.Connected }
        return $false
    } catch { return $false } finally { $client.Close() }
}

function Get-LogTail($paths, $n = 25) {
    $lines = @()
    foreach ($p in $paths) {
        if ($p -and (Test-Path $p)) {
            try {
                $t = Get-Content $p -Tail $n -ErrorAction Stop
                if ($t) { $lines += "--- $([IO.Path]::GetFileName($p)) ---"; $lines += $t }
            } catch {}
        }
    }
    return $lines
}

# Wait until $url responds (<500), OR fail fast if the process died / a build
# error appears in the logs. Returns @{ ready; failed; reason; log }.
function Wait-ForReady {
    param(
        [string]$url,
        [int]$timeoutSec,
        $proc,                      # process we started (nullable); HasExited => fail fast
        [string[]]$logPaths = @(),
        [string[]]$errorPatterns = @(),
        [string]$contentMatch = $null  # readiness also requires body to match this
    )
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        # 1. ready?
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ([int]$r.StatusCode -lt 500) {
                if ($contentMatch) {
                    $body = if ($r.Content -is [byte[]]) {
                        [Text.Encoding]::UTF8.GetString($r.Content)
                    } else { [string]$r.Content }
                    if ($body -match $contentMatch) { return @{ ready = $true } }
                    # up but not reporting ready yet — keep waiting
                } else {
                    return @{ ready = $true }
                }
            }
        } catch {
            # PS 5.1: non-2xx throws. A 4xx means the server is up (e.g. 401 gate).
            # A 5xx means it's up but erroring — don't call that ready; the log
            # scan below catches real build failures.
            if ($_.Exception.Response -and -not $contentMatch) {
                $code = [int]$_.Exception.Response.StatusCode
                if ($code -lt 500) { return @{ ready = $true } }
            }
        }
        # 2. process died — fail immediately
        if ($proc -and $proc.HasExited) {
            return @{ ready = $false; failed = $true
                      reason = "process exited (code $($proc.ExitCode))"
                      log = (Get-LogTail $logPaths) }
        }
        # 3. build error in the log — fail immediately
        if ($errorPatterns.Count) {
            $tail = Get-LogTail $logPaths 60
            foreach ($pat in $errorPatterns) {
                if ($tail | Select-String -Pattern $pat -SimpleMatch -Quiet) {
                    return @{ ready = $false; failed = $true
                              reason = "build error in log: '$pat'"; log = $tail }
                }
            }
        }
        Start-Sleep -Milliseconds 200
    }
    return @{ ready = $false; failed = $false
              reason = "no response in ${timeoutSec}s"; log = (Get-LogTail $logPaths) }
}

# Brief, web-free watch for an INSTANT crash after launch (used by -Start so it
# returns fast). Only touches the process handle + log files — no HTTP.
function Watch-Crash {
    param($proc, [string[]]$logPaths = @(), [string[]]$errorPatterns = @(), [double]$sec = 2.5)
    $deadline = (Get-Date).AddSeconds($sec)
    while ((Get-Date) -lt $deadline) {
        if ($proc -and $proc.HasExited) {
            return @{ failed = $true; reason = "process exited (code $($proc.ExitCode))"; log = (Get-LogTail $logPaths) }
        }
        if ($errorPatterns.Count) {
            $tail = Get-LogTail $logPaths 60
            foreach ($pat in $errorPatterns) {
                if ($tail | Select-String -Pattern $pat -SimpleMatch -Quiet) {
                    return @{ failed = $true; reason = "build error in log: '$pat'"; log = $tail }
                }
            }
        }
        Start-Sleep -Milliseconds 200
    }
    return @{ failed = $false }
}

function Show-FailLog($info) {
    if ($info.reason) { Write-Host "         $($info.reason)" -ForegroundColor Red }
    if ($info.log) {
        foreach ($l in $info.log) { Write-Host "         | $l" -ForegroundColor DarkGray }
    }
}

function Save-Pid($name, $procId) {
    # Keep entries in a hashtable and serialize via [pscustomobject] so the JSON
    # only ever contains real name->pid pairs. (Serializing a raw @{} directly
    # leaks .NET members like Keys/Values/Count into the file.)
    $map = @{}
    if (Test-Path $pidFile) {
        try {
            $j = Get-Content $pidFile -Raw | ConvertFrom-Json
            foreach ($p in $j.PSObject.Properties) {
                if ($p.Value -as [int]) { $map[$p.Name] = [int]$p.Value }
            }
        } catch {}
    }
    $map[$name] = $procId
    [pscustomobject]$map | ConvertTo-Json | Set-Content $pidFile -Encoding utf8
}

function Stop-Tracked {
    if (-not (Test-Path $pidFile)) { Write-Host "no tracked servers"; return }
    $data = Get-Content $pidFile -Raw | ConvertFrom-Json
    foreach ($p in $data.PSObject.Properties) {
        $procId = $p.Value
        if (-not ($procId -as [int])) { continue }   # skip any non-pid leftovers
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

# ---- per-service HTTP checks (used by both -Check and the blocking path) ----

function Invoke-BackendChecks($base) {
    # root + /health are public 200s; /recipes/ requires auth and must 401 —
    # that 401 confirms the auth gate is wired.
    $checks = @(
        @{ url = "$base/";         expectKey = 'status'; expectCode = 200 },
        @{ url = "$base/health";   expectKey = 'status'; expectCode = 200 },
        @{ url = "$base/recipes/"; expectKey = $null;    expectCode = 401 }
    )
    $ok = $true
    foreach ($c in $checks) {
        $status = $null; $content = $null
        try {
            $r = Invoke-WebRequest -Uri $c.url -UseBasicParsing -TimeoutSec 5
            $status = [int]$r.StatusCode; $content = $r.Content
        } catch {
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
    return $ok
}

function Invoke-FrontendChecks($base) {
    try {
        $r = Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 10
        $ok = $r.StatusCode -eq 200
        Write-Host "  [$(if($ok){'OK'}else{'FAIL'})]   $($r.StatusCode) $base/" -ForegroundColor $(if($ok){'Green'}else{'Red'})
        return $ok
    } catch {
        Write-Host "  [FAIL] $base/ -- $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Invoke-MobileChecks($base) {
    # Metro answers /status with literal text "packager-status:running".
    # PS 5.1 -UseBasicParsing returns Content as byte[] when there's no text/*
    # Content-Type, so decode explicitly before matching.
    try {
        $r = Invoke-WebRequest -Uri "$base/status" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        $body = if ($r.Content -is [byte[]]) {
            [Text.Encoding]::UTF8.GetString($r.Content)
        } else { [string]$r.Content }
        $ok = $body -match 'packager-status:running'
        Write-Host "  [$(if($ok){'OK'}else{'FAIL'})]   metro $base/status" -ForegroundColor $(if($ok){'Green'}else{'Red'})
        return $ok
    } catch {
        Write-Host "  [FAIL] metro $base/status -- $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# ---- generic service driver ----

# $svc = @{ name; port; readyUrl; contentMatch; errorPatterns; logPaths; start (scriptblock); check (scriptblock) }
function Invoke-Service($svc) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $base = "http://127.0.0.1:$($svc.port)"
    $up = Test-Port $svc.port

    # ---- check mode: never start ----
    if ($mode -eq 'check') {
        if (-not $up) {
            $sw.Stop()
            Write-Host "[$($svc.name)] NOT UP on :$($svc.port)" -ForegroundColor Yellow
            return @{ name = $svc.name; status = 'NOT_UP'; ms = $sw.ElapsedMilliseconds }
        }
        $ok = & $svc.check $base
        $sw.Stop()
        $st = if ($ok) { 'PASS' } else { 'FAIL' }
        Write-Host "[$($svc.name)] $st in $($sw.ElapsedMilliseconds)ms" -ForegroundColor $(if($ok){'Green'}else{'Red'})
        return @{ name = $svc.name; status = $st; ms = $sw.ElapsedMilliseconds }
    }

    # ---- start / full: launch if down ----
    $proc = $null; $startedHere = $false
    if (-not $up) {
        Write-Host "[$($svc.name)] starting..."
        $proc = & $svc.start
        if ($proc) { Save-Pid $svc.name $proc.Id }
        $startedHere = $true
    } else {
        Write-Host "[$($svc.name)] reusing server on :$($svc.port)"
    }

    # ---- start mode: non-blocking. Watch only for an instant crash (no HTTP), return ----
    if ($mode -eq 'start') {
        if (-not $startedHere) {
            $sw.Stop()
            Write-Host "[$($svc.name)] already up on :$($svc.port) (poll with -Check)" -ForegroundColor Yellow
            return @{ name = $svc.name; status = 'WARMING'; ms = $sw.ElapsedMilliseconds }
        }
        $c = Watch-Crash -proc $proc -logPaths $svc.logPaths -errorPatterns $svc.errorPatterns -sec 2.5
        $sw.Stop()
        if ($c.failed) {
            Write-Host "[$($svc.name)] FAIL (fast)" -ForegroundColor Red
            Show-FailLog $c
            return @{ name = $svc.name; status = 'FAIL'; ms = $sw.ElapsedMilliseconds }
        }
        Write-Host "[$($svc.name)] launched in $($sw.ElapsedMilliseconds)ms (poll with -Check)" -ForegroundColor Green
        return @{ name = $svc.name; status = 'WARMING'; ms = $sw.ElapsedMilliseconds }
    }

    # ---- full mode: block up to budget, but fail fast on crash / build error ----
    # cold starts (esp. next dev first compile) need headroom
    $budget = if ($startedHere) { [Math]::Max($TimeoutSec, 60) } else { $TimeoutSec }

    $wait = Wait-ForReady -url $svc.readyUrl -timeoutSec $budget -proc $proc `
        -logPaths $svc.logPaths -errorPatterns $svc.errorPatterns -contentMatch $svc.contentMatch

    if ($wait.failed) {
        $sw.Stop()
        Write-Host "[$($svc.name)] FAIL (fast)" -ForegroundColor Red
        Show-FailLog $wait
        return @{ name = $svc.name; status = 'FAIL'; ms = $sw.ElapsedMilliseconds }
    }

    if (-not $wait.ready) {
        $sw.Stop()
        Write-Host "[$($svc.name)] FAIL - $($wait.reason)" -ForegroundColor Red
        Show-FailLog $wait
        return @{ name = $svc.name; status = 'FAIL'; ms = $sw.ElapsedMilliseconds }
    }

    # ready — run the real checks
    $ok = & $svc.check $base
    $sw.Stop()
    $st = if ($ok) { 'PASS' } else { 'FAIL' }
    $col = if ($ok) { 'Green' } else { 'Red' }
    Write-Host "[$($svc.name)] $st in $($sw.ElapsedMilliseconds)ms$(if($startedHere){' (cold start)'})" -ForegroundColor $col
    return @{ name = $svc.name; status = $st; ms = $sw.ElapsedMilliseconds }
}

# ---- service definitions ----

$svcBackend = @{
    name = 'backend'; port = 8000
    readyUrl = 'http://127.0.0.1:8000/'
    contentMatch = $null
    errorPatterns = @('Traceback (most recent call last)', 'Address already in use', 'ImportError', 'ModuleNotFoundError')
    logPaths = @((Join-Path $root 'backend_dev.err.log'), (Join-Path $root 'backend_dev.log'))
    check = { param($base) Invoke-BackendChecks $base }
    start = {
        $uvicorn = Join-Path $root 'backend\backend\.venv\Scripts\uvicorn.exe'
        if (-not (Test-Path $uvicorn)) { $uvicorn = Join-Path $root 'backend\.venv\Scripts\uvicorn.exe' }
        Start-Process -FilePath $uvicorn `
            -ArgumentList 'main:app','--host','127.0.0.1','--port','8000' `
            -WorkingDirectory (Join-Path $root 'backend') `
            -RedirectStandardOutput (Join-Path $root 'backend_dev.log') `
            -RedirectStandardError  (Join-Path $root 'backend_dev.err.log') `
            -PassThru -WindowStyle Hidden
    }
}

$svcFrontend = @{
    name = 'frontend'; port = 3000
    readyUrl = 'http://127.0.0.1:3000/'
    contentMatch = $null
    errorPatterns = @('Failed to compile', 'Module not found', 'Build error occurred', 'SyntaxError')
    logPaths = @((Join-Path $root 'frontend_dev.err.log'), (Join-Path $root 'frontend_dev.log'))
    check = { param($base) Invoke-FrontendChecks $base }
    start = {
        Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' `
            -WorkingDirectory (Join-Path $root 'frontend') `
            -RedirectStandardOutput (Join-Path $root 'frontend_dev.log') `
            -RedirectStandardError  (Join-Path $root 'frontend_dev.err.log') `
            -PassThru -WindowStyle Hidden
    }
}

$svcMobile = @{
    name = 'mobile'; port = 8081
    readyUrl = 'http://127.0.0.1:8081/status'
    contentMatch = 'packager-status:running'
    errorPatterns = @('Unable to resolve module', 'Failed to construct transformer')
    logPaths = @((Join-Path $root 'mobile_dev.err.log'), (Join-Path $root 'mobile_dev.log'))
    check = { param($base) Invoke-MobileChecks $base }
    start = {
        Start-Process -FilePath 'npx.cmd' -ArgumentList 'expo','start','--port','8081' `
            -WorkingDirectory (Join-Path $root 'mobile') `
            -RedirectStandardOutput (Join-Path $root 'mobile_dev.log') `
            -RedirectStandardError  (Join-Path $root 'mobile_dev.err.log') `
            -PassThru -WindowStyle Hidden
    }
}

$total = [Diagnostics.Stopwatch]::StartNew()
$results = @()
if ($Backend)  { $results += Invoke-Service $svcBackend }
if ($Frontend) { $results += Invoke-Service $svcFrontend }
if ($Mobile)   { $results += Invoke-Service $svcMobile }
$total.Stop()

Write-Host ""
Write-Host "--- summary ($($total.ElapsedMilliseconds)ms total, mode=$mode) ---"
foreach ($r in $results) {
    $col = switch ($r.status) { 'PASS' { 'Green' } 'WARMING' { 'Yellow' } 'NOT_UP' { 'Yellow' } default { 'Red' } }
    Write-Host ("  {0,-9} {1,6}ms  {2}" -f $r.name, $r.ms, $r.status) -ForegroundColor $col
}

# exit: 1 if anything is up-but-failing; 2 if (check) something isn't up yet; else 0
if ($results | Where-Object { $_.status -eq 'FAIL' }) { exit 1 }
if ($results | Where-Object { $_.status -eq 'NOT_UP' }) { exit 2 }
exit 0
