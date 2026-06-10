#requires -Version 5.1
<#
.SYNOPSIS
  GODMODE backup helper (Windows / PowerShell). NON-DESTRUCTIVE: only reads
  data and writes archive files.

.DESCRIPTION
  Backs up MongoDB (mongodump), Qdrant (per-collection snapshot API),
  Meilisearch (data volume) and LibreChat uploads (volume).

.EXAMPLE
  ./scripts/backup.ps1
  ./scripts/backup.ps1 -BackupDir D:\backups

  See docs/backup-restore.md for the restore procedure.
#>
[CmdletBinding()]
param(
  [string]$BackupDir,
  [string]$Project = $(if ($env:COMPOSE_PROJECT_NAME) { $env:COMPOSE_PROJECT_NAME } else { 'godmode' }),
  [string]$MongoContainer  = 'godmode-mongodb',
  [string]$QdrantContainer = 'godmode-qdrant',
  [string]$CurlImage    = 'curlimages/curl:8.11.1',
  [string]$BusyboxImage = 'busybox:1.37'
)
$ErrorActionPreference = 'Stop'

function Log  ($m) { Write-Host "[backup] $m"        -ForegroundColor Cyan }
function Warn ($m) { Write-Host "[backup:warn] $m"   -ForegroundColor Yellow }
function Die  ($m) { Write-Host "[backup:error] $m"  -ForegroundColor Red; exit 1 }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die 'docker not found in PATH' }

$RootDir = Split-Path -Parent $PSScriptRoot
if (-not $BackupDir) { $BackupDir = Join-Path $RootDir 'backups' }
$ts   = Get-Date -Format 'yyyyMMdd-HHmmss'
$dest = Join-Path $BackupDir $ts
New-Item -ItemType Directory -Force -Path $dest | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dest 'qdrant') | Out-Null
Log "Writing backup to: $dest"

# Optional Qdrant API key (only if Qdrant auth is enabled)
$qKey = ''
$envFile = Join-Path $RootDir '.env'
if (Test-Path $envFile) {
  $line = Select-String -Path $envFile -Pattern '^QDRANT_API_KEY=' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($line) { $qKey = ($line.Line -replace '^QDRANT_API_KEY=', '').Trim() }
}
$qHeader = @(); if ($qKey) { $qHeader = @('-H', "api-key: $qKey") }

function Test-Running($name) { (docker ps --format '{{.Names}}') -contains $name }

# --- 1. MongoDB (dump to a file in-container, then copy out) ---------------
function Backup-Mongo {
  if (-not (Test-Running $MongoContainer)) { Die "container '$MongoContainer' is not running" }
  $has = docker exec $MongoContainer sh -c 'command -v mongodump >/dev/null 2>&1 && echo yes'
  if ($has -ne 'yes') { Die "mongodump not present in '$MongoContainer' - see docs/backup-restore.md for the cold volume-copy fallback" }
  Log 'MongoDB: running mongodump ...'
  docker exec $MongoContainer sh -c 'mongodump --archive=/tmp/godmode-mongo.gz --gzip' | Out-Null
  docker cp "${MongoContainer}:/tmp/godmode-mongo.gz" (Join-Path $dest 'mongodb.archive.gz') | Out-Null
  docker exec $MongoContainer sh -c 'rm -f /tmp/godmode-mongo.gz' | Out-Null
  Log 'MongoDB: done'
}

# --- 2. Qdrant (official per-collection snapshot API) ----------------------
function Invoke-QCurl([string[]]$CurlArgs) {
  docker run --rm --network "container:$QdrantContainer" $CurlImage -s @qHeader @CurlArgs
}
function Backup-Qdrant {
  if (-not (Test-Running $QdrantContainer)) { Warn 'Qdrant container not running - skipping'; return }
  $json = Invoke-QCurl @('http://127.0.0.1:6333/collections') | ConvertFrom-Json
  $cols = @($json.result.collections.name)
  if (-not $cols -or $cols.Count -eq 0) { Log 'Qdrant: no collections found - nothing to snapshot'; return }
  foreach ($c in $cols) {
    Log "Qdrant: snapshotting collection '$c' ..."
    $snapJson = Invoke-QCurl @('-X', 'POST', "http://127.0.0.1:6333/collections/$c/snapshots") | ConvertFrom-Json
    $snap = $snapJson.result.name
    if (-not $snap) { Warn "Qdrant: no snapshot name returned for '$c' - skipping"; continue }
    docker run --rm --network "container:$QdrantContainer" -v "${dest}/qdrant:/out" $CurlImage -sf @qHeader -o "/out/${c}.snapshot" "http://127.0.0.1:6333/collections/$c/snapshots/$snap" | Out-Null
    Log "Qdrant: saved qdrant/${c}.snapshot"
  }
}

# --- 3/4. Read-only volume archives ---------------------------------------
function Backup-Volume([string]$vol, [string]$out) {
  docker volume inspect $vol *> $null
  if ($LASTEXITCODE -ne 0) { Warn "volume '$vol' not found - skipping"; return }
  docker run --rm -v "${vol}:/data:ro" -v "${dest}:/backup" $BusyboxImage tar czf "/backup/$out" -C /data . | Out-Null
  Log "Archived '$vol' -> $out"
}

Backup-Mongo
Backup-Qdrant
Log 'Meilisearch: archiving data volume ...'
Backup-Volume "${Project}_meili_data" 'meilisearch_data.tar.gz'
Log 'LibreChat: archiving uploads volume ...'
Backup-Volume "${Project}_librechat_uploads" 'librechat_uploads.tar.gz'

@"
GODMODE backup
created : $ts
project : $Project
contents:
  mongodb.archive.gz        mongodump --archive --gzip (whole instance)
  qdrant/*.snapshot         per-collection Qdrant snapshots (official API)
  meilisearch_data.tar.gz   Meilisearch data volume (${Project}_meili_data)
  librechat_uploads.tar.gz  user-uploaded files (${Project}_librechat_uploads)

restore: ./scripts/restore.ps1 -Source "$dest"   (see docs/backup-restore.md)
"@ | Set-Content -Path (Join-Path $dest 'MANIFEST.txt') -Encoding utf8

Log 'Backup complete.'
Get-ChildItem -Recurse $dest | Select-Object FullName, Length
