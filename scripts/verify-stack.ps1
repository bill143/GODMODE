#requires -Version 5.1
<#
.SYNOPSIS
  GODMODE runtime stack verification (Windows / PowerShell).

.DESCRIPTION
  Verifies the Docker Compose stack is configured correctly, reaches a minimum
  HEALTHY state, and that key local health endpoints respond. Prints a PASS/FAIL
  summary and exits non-zero on any failure.

  WHAT THIS PROVES:   the stack boots locally and internal health endpoints
                      answer (infrastructure + app startup verification).
  WHAT IT DOES NOT:   it does NOT call Anthropic/OpenAI, so it does not prove
                      real model responses (that needs real keys; see
                      docs/verification.md).

.EXAMPLE
  ./scripts/verify-stack.ps1                  # verify an already-running stack
  ./scripts/verify-stack.ps1 -Up -Build       # build + start full stack, verify
  ./scripts/verify-stack.ps1 -Core -Up -Build # only the key-independent core
  ./scripts/verify-stack.ps1 -Prod            # include docker-compose.prod.yml
  ./scripts/verify-stack.ps1 -Down            # tear down afterwards
#>
[CmdletBinding()]
param(
  [switch]$Up,
  [switch]$Build,
  [switch]$Down,
  [switch]$Core,
  [switch]$Prod,
  [int]$TimeoutSec = 240
)
$ErrorActionPreference = 'Continue'

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

$ComposeFiles = @('-f', 'docker-compose.yml')
if ($Prod) { $ComposeFiles += @('-f', 'docker-compose.prod.yml') }
function dc { docker compose @ComposeFiles @args }

function Log  ($m) { Write-Host "[verify] $m" -ForegroundColor Cyan }
function Pass ($m) { Write-Host "  PASS  $m" -ForegroundColor Green }
function Fail ($m) { Write-Host "  FAIL  $m" -ForegroundColor Red }
function Warn ($m) { Write-Host "  WARN  $m" -ForegroundColor Yellow }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Host 'docker not found in PATH'; exit 2 }

$CoreServices = @('mongodb', 'meilisearch', 'qdrant', 'vision-bridge')
$FullServices = @('mongodb', 'meilisearch', 'qdrant', 'rag_api', 'openmemory-mcp', 'vision-bridge', 'librechat')
$Targets = if ($Core) { $CoreServices } else { $FullServices }

$Endpoint = @{
  'mongodb' = 'mongosh ping'; 'meilisearch' = 'GET :7700/health'; 'qdrant' = 'tcp :6333'
  'rag_api' = 'GET :8000/health'; 'openmemory-mcp' = 'GET :8765/openapi.json'
  'vision-bridge' = 'GET :8000/health'; 'librechat' = 'GET :3080/health'
}
$Failures = New-Object System.Collections.Generic.List[string]

# =========================================================================
Log '1/4 Validating compose configuration ...'
dc config -q
if ($LASTEXITCODE -eq 0) { Pass 'docker compose config' } else { Fail 'docker compose config'; $Failures.Add('compose-config') }

# =========================================================================
if ($Build) {
  Log 'Building local images (vision-bridge) ...'
  dc build vision-bridge
  if ($LASTEXITCODE -ne 0) { Fail 'build vision-bridge'; $Failures.Add('build') }
}

if ($Up) {
  Log "2/4 Starting services: $($Targets -join ', ')"
  dc up -d --wait --wait-timeout $TimeoutSec @Targets
  if ($LASTEXITCODE -eq 0) { Pass 'compose up --wait (all requested services healthy)' }
  else { Warn 'compose up --wait reported not-all-healthy; continuing to per-service report' }
}
else {
  Log '2/4 Verifying against the already-running stack (no -Up given)'
}

# =========================================================================
function Get-Cid([string]$svc) { (dc ps -q $svc 2>$null | Select-Object -First 1) }
function Get-Health([string]$cid) {
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $cid 2>$null
}
function Wait-Healthy([string]$cid) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $st = Get-Health $cid
    if ($st -eq 'healthy') { return $true }
    if ($st -eq 'unhealthy') { return $false }
    if ($st -eq 'running' -and -not $Up) { return $true }
    Start-Sleep -Seconds 3
  }
  return $false
}

Log '3/4 Checking compose health status ...'
$CidMap = @{}
foreach ($svc in $Targets) {
  $cid = Get-Cid $svc
  $CidMap[$svc] = $cid
  if (-not $cid) { Fail "${svc}: not running (no container)"; $Failures.Add($svc); continue }
  if (Wait-Healthy $cid) { Pass "${svc}: $(Get-Health $cid)" }
  else { Fail "${svc}: not healthy (status: $(Get-Health $cid))"; $Failures.Add($svc) }
}

# =========================================================================
Log '4/4 Probing local health endpoints ...'
function Test-Endpoint([string]$svc, [string]$cid) {
  switch ($svc) {
    'mongodb'        { (docker exec $cid mongosh --quiet --eval "db.runCommand('ping').ok" 2>$null) -match '1' }
    'meilisearch'    { (docker exec $cid wget -qO- http://127.0.0.1:7700/health 2>$null) -match 'available' }
    'qdrant'         { docker exec $cid bash -lc 'exec 3<>/dev/tcp/127.0.0.1/6333' 2>$null; $LASTEXITCODE -eq 0 }
    'rag_api'        { docker exec $cid python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=5).status==200 else 1)" 2>$null; $LASTEXITCODE -eq 0 }
    'openmemory-mcp' { docker exec $cid python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8765/openapi.json',timeout=5).status==200 else 1)" 2>$null; $LASTEXITCODE -eq 0 }
    'vision-bridge'  { docker exec $cid python -c "import urllib.request,json,sys; d=json.load(urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=5)); sys.exit(0 if d.get('status')=='ok' else 1)" 2>$null; $LASTEXITCODE -eq 0 }
    'librechat'      { docker exec $cid wget -qO- http://127.0.0.1:3080/health 2>$null | Out-Null; $LASTEXITCODE -eq 0 }
    default          { $true }
  }
}
foreach ($svc in $Targets) {
  $cid = $CidMap[$svc]
  if (-not $cid) { Fail "$svc endpoint ($($Endpoint[$svc])): container not running"; $Failures.Add("$svc-endpoint"); continue }
  if (Test-Endpoint $svc $cid) { Pass "$svc endpoint ($($Endpoint[$svc]))" }
  else { Fail "$svc endpoint ($($Endpoint[$svc]))"; $Failures.Add("$svc-endpoint") }
}

# =========================================================================
if ($Failures.Count -gt 0) {
  Write-Host ''
  Log 'Collecting logs for failed services to aid troubleshooting ...'
  dc ps
  $svcs = $Failures | ForEach-Object { ($_ -replace '-endpoint$', '') } | Where-Object { $_ -notin @('compose-config', 'build') } | Sort-Object -Unique
  foreach ($s in $svcs) {
    if (Get-Cid $s) { Write-Host "----- logs: $s (last 60) -----"; dc logs --no-color --tail=60 $s }
  }
}

if ($Down) { Log 'Tearing down (volumes preserved) ...'; dc down }

# =========================================================================
Write-Host ''
if ($Failures.Count -eq 0) {
  Write-Host '========== VERIFY PASS ==========' -ForegroundColor Green
  Write-Host "Verified: stack boots and local health endpoints respond for: $($Targets -join ', ')"
  Write-Host 'NOT verified: real Anthropic/OpenAI model responses (needs real keys; see docs/verification.md).'
  exit 0
}
else {
  Write-Host "========== VERIFY FAIL ($($Failures.Count)) ==========" -ForegroundColor Red
  Write-Host "Failed checks: $($Failures -join ', ')"
  Write-Host "See the per-service logs above, or run: docker compose $($ComposeFiles -join ' ') logs <service>"
  exit 1
}
