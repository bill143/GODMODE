#requires -Version 5.1
<#
.SYNOPSIS
  GODMODE restore helper (Windows / PowerShell).

.DESCRIPTION
  DESTRUCTIVE: restoring overwrites live data. Runs as a DRY RUN by default
  and prints what it WOULD do. Pass -Confirm to actually perform the restore.

.EXAMPLE
  ./scripts/restore.ps1 -Source .\backups\20260610-120000            # dry run
  ./scripts/restore.ps1 -Source .\backups\20260610-120000 -Confirm   # apply

  See docs/backup-restore.md for details and operator-owned steps.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [switch]$Confirm,
  [string]$Project = $(if ($env:COMPOSE_PROJECT_NAME) { $env:COMPOSE_PROJECT_NAME } else { 'godmode' }),
  [string]$MongoContainer  = 'godmode-mongodb',
  [string]$QdrantContainer = 'godmode-qdrant',
  [string]$MeiliContainer  = 'godmode-meilisearch',
  [string]$CurlImage    = 'curlimages/curl:8.11.1',
  [string]$BusyboxImage = 'busybox:1.37'
)
$ErrorActionPreference = 'Stop'

function Log  ($m) { Write-Host "[restore] $m"       -ForegroundColor Cyan }
function Warn ($m) { Write-Host "[restore:warn] $m"  -ForegroundColor Yellow }
function Die  ($m) { Write-Host "[restore:error] $m" -ForegroundColor Red; exit 1 }
function Step([string]$desc, [scriptblock]$action) {
  if ($Confirm) { Log $desc; & $action }
  else { Write-Host "  would run: $desc" -ForegroundColor DarkGray }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die 'docker not found in PATH' }
if (-not (Test-Path $Source)) { Die "backup directory not found: $Source" }
$Source = (Resolve-Path $Source).Path

$RootDir = Split-Path -Parent $PSScriptRoot
$qKey = ''
$envFile = Join-Path $RootDir '.env'
if (Test-Path $envFile) {
  $line = Select-String -Path $envFile -Pattern '^QDRANT_API_KEY=' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($line) { $qKey = ($line.Line -replace '^QDRANT_API_KEY=', '').Trim() }
}
$qHeader = @(); if ($qKey) { $qHeader = @('-H', "api-key: $qKey") }

if ($Confirm) { Warn 'CONFIRM mode: this WILL overwrite live data in the GODMODE stack.' }
else { Log 'DRY RUN - no changes will be made. Re-run with -Confirm to apply.' }
Log "Restoring from: $Source"

# --- MongoDB --------------------------------------------------------------
$mongoArchive = Join-Path $Source 'mongodb.archive.gz'
if (Test-Path $mongoArchive) {
  Step "MongoDB: mongorestore --drop from mongodb.archive.gz" {
    docker cp $mongoArchive "${MongoContainer}:/tmp/godmode-restore.gz" | Out-Null
    docker exec $MongoContainer sh -c 'mongorestore --archive=/tmp/godmode-restore.gz --gzip --drop; rm -f /tmp/godmode-restore.gz' | Out-Null
  }
} else { Warn 'MongoDB: no mongodb.archive.gz in backup - skipping' }

# --- Qdrant ---------------------------------------------------------------
$snaps = Get-ChildItem -Path (Join-Path $Source 'qdrant') -Filter '*.snapshot' -ErrorAction SilentlyContinue
if ($snaps) {
  foreach ($s in $snaps) {
    $col = [System.IO.Path]::GetFileNameWithoutExtension($s.Name)
    Step "Qdrant: recover collection '$col' from $($s.Name) (priority=snapshot)" {
      docker run --rm --network "container:$QdrantContainer" -v "${Source}/qdrant:/in" $CurlImage -sf @qHeader -X POST -F "snapshot=@/in/${col}.snapshot" "http://127.0.0.1:6333/collections/$col/snapshots/upload?priority=snapshot" | Out-Null
    }
  }
} else { Warn 'Qdrant: no qdrant/*.snapshot files in backup - skipping' }

# --- Meilisearch (stop, replace volume, start) ----------------------------
if (Test-Path (Join-Path $Source 'meilisearch_data.tar.gz')) {
  Step "Meilisearch: stop, replace ${Project}_meili_data, start" {
    docker stop $MeiliContainer | Out-Null
    docker run --rm -v "${Project}_meili_data:/data" -v "${Source}:/backup:ro" $BusyboxImage sh -c 'rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null; tar xzf /backup/meilisearch_data.tar.gz -C /data' | Out-Null
    docker start $MeiliContainer | Out-Null
  }
} else { Warn 'Meilisearch: no meilisearch_data.tar.gz in backup - skipping' }

# --- LibreChat uploads ----------------------------------------------------
if (Test-Path (Join-Path $Source 'librechat_uploads.tar.gz')) {
  Step "LibreChat uploads: replace ${Project}_librechat_uploads" {
    docker run --rm -v "${Project}_librechat_uploads:/data" -v "${Source}:/backup:ro" $BusyboxImage sh -c 'rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null; tar xzf /backup/librechat_uploads.tar.gz -C /data' | Out-Null
  }
} else { Warn 'LibreChat uploads: no librechat_uploads.tar.gz in backup - skipping' }

if ($Confirm) { Log 'Restore complete. Verify: docker compose ps; docker compose logs --tail=50 librechat' }
else { Log 'Dry run complete. Re-run with -Confirm to apply the actions above.' }
