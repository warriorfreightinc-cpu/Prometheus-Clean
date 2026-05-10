param(
  [string]$PortableDrive = "A:",
  [string]$WorkspaceRoot = "C:\Prometheus-Clean",
  [string]$CodexHome = "$HOME\.codex"
)

$ErrorActionPreference = "Stop"

function Invoke-RobocopySafe {
  param(
    [string]$Source,
    [string]$Target
  )

  New-Item -ItemType Directory -Force -Path $Target | Out-Null
  robocopy $Source $Target /MIR /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -gt 7) {
    throw "Robocopy failed from $Source to $Target with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Path $PortableDrive)) {
  throw "Portable drive $PortableDrive was not found."
}

$portableRoot = Join-Path $PortableDrive "Prometheus-Recovery"
$workspaceTarget = Join-Path $portableRoot "Prometheus-Clean"
$codexTarget = Join-Path $portableRoot "codex-home"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

New-Item -ItemType Directory -Force -Path $portableRoot | Out-Null

$snapshotScript = Join-Path $WorkspaceRoot "deployment\PROMETHEUS-MACHINE-SNAPSHOT.ps1"
if (Test-Path $snapshotScript) {
  & $snapshotScript
}

Invoke-RobocopySafe -Source $WorkspaceRoot -Target $workspaceTarget

if (Test-Path $CodexHome) {
  Invoke-RobocopySafe -Source $CodexHome -Target $codexTarget
}

$manifest = @(
  "# Prometheus Portable Save"
  ""
  "Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
  "Portable root: $portableRoot"
  "Workspace saved from: $WorkspaceRoot"
  "Codex home saved from: $CodexHome"
  "Timestamp key: $timestamp"
) -join [Environment]::NewLine

$manifest | Set-Content (Join-Path $portableRoot "SAVE-MANIFEST.txt")

Write-Host "Portable save completed at $portableRoot" -ForegroundColor Green
