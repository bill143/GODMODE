param(
  [string]$RootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
$envExample = Join-Path $RootPath ".env.example"
$envFile = Join-Path $RootPath ".env"

if (-not (Test-Path $envExample)) {
  throw "Missing file: $envExample"
}

if (-not (Test-Path $envFile)) {
  Copy-Item $envExample $envFile
  Write-Host "Created $envFile from .env.example"
}

function Get-RandomHex([int]$bytes) {
  $buffer = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  -join ($buffer | ForEach-Object { $_.ToString("x2") })
}

$content = Get-Content $envFile -Raw

function Set-EnvValue([string]$key, [string]$value) {
  if ($script:content -match "(?m)^$key=") {
    $script:content = [regex]::Replace($script:content, "(?m)^$key=.*$", "$key=$value")
  } else {
    if (-not $script:content.EndsWith("`n")) {
      $script:content += "`n"
    }
    $script:content += "$key=$value`n"
  }
}

function Ensure-GeneratedSecret([string]$key, [int]$bytes) {
  $pattern = "(?m)^$key=(.*)$"
  $match = [regex]::Match($script:content, $pattern)
  $current = if ($match.Success) { $match.Groups[1].Value.Trim() } else { "" }

  if ([string]::IsNullOrWhiteSpace($current) -or $current.StartsWith("replace_with_")) {
    Set-EnvValue $key (Get-RandomHex $bytes)
    Write-Host "Generated $key"
  }
}

Ensure-GeneratedSecret "CREDS_KEY" 32
Ensure-GeneratedSecret "CREDS_IV" 16
Ensure-GeneratedSecret "JWT_SECRET" 32
Ensure-GeneratedSecret "JWT_REFRESH_SECRET" 32
Ensure-GeneratedSecret "MEILI_MASTER_KEY" 32

$requiredLines = Get-Content $envExample | Where-Object { $_ -match '^[A-Z0-9_]+=' }
$requiredVars = $requiredLines | ForEach-Object { ($_ -split '=', 2)[0] }

foreach ($line in $requiredLines) {
  $key = ($line -split '=', 2)[0]
  if (-not ($content -match "(?m)^$key=")) {
    if (-not $content.EndsWith("`n")) {
      $content += "`n"
    }
    $content += "$line`n"
    Write-Host "Added missing variable from .env.example: $key"
  }
}

$envLines = $content -split "`r?`n"
$missing = @()
foreach ($key in $requiredVars) {
  if (-not ($envLines -match "^$key=")) {
    $missing += $key
  }
}

if ($missing.Count -gt 0) {
  $missingText = $missing -join ', '
  throw "Missing required variables in .env: $missingText"
}

Set-Content -Path $envFile -Value $content -NoNewline

Write-Host "Environment bootstrap complete."
Write-Host "Next step: edit .env and set real API keys manually before startup."
