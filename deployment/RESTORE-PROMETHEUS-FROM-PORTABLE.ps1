param(
  [string]$PortableDrive = "A:",
  [string]$TargetRoot = "C:\Prometheus-Clean",
  [string]$CodexTarget = "$HOME\.codex",
  [switch]$StartDev
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

$portableRoot = Join-Path $PortableDrive "Prometheus-Recovery"
$workspaceSource = Join-Path $portableRoot "Prometheus-Clean"
$codexSource = Join-Path $portableRoot "codex-home"

if (-not (Test-Path $workspaceSource)) {
  throw "Portable Prometheus workspace was not found at $workspaceSource"
}

Invoke-RobocopySafe -Source $workspaceSource -Target $TargetRoot

if (Test-Path $codexSource) {
  Invoke-RobocopySafe -Source $codexSource -Target $CodexTarget
}

$recoveryKit = Join-Path $TargetRoot "deployment\PROMETHEUS-RECOVERY-KIT.ps1"
if (-not (Test-Path $recoveryKit)) {
  throw "Recovery kit not found at $recoveryKit"
}

& $recoveryKit -WorkspaceRoot $TargetRoot -StartDev:$StartDev

Write-Host "Prometheus restore completed." -ForegroundColor Green
