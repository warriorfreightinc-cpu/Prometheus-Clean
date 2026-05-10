param(
  [string]$OutputRoot = "C:\Prometheus-Clean\deployment\machine-snapshots"
)

$ErrorActionPreference = "Stop"

function Get-CommandVersion {
  param(
    [string]$CommandName,
    [scriptblock]$VersionCommand
  )

  if (Get-Command $CommandName -ErrorAction SilentlyContinue) {
    return (& $VersionCommand 2>$null | Select-Object -First 1)
  }

  return "not-installed"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $OutputRoot $timestamp
New-Item -ItemType Directory -Force -Path $target | Out-Null

$machineSummary = @()
$machineSummary += "# Prometheus Machine Snapshot"
$machineSummary += ""
$machineSummary += "Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
$machineSummary += ""
$machineSummary += "## Core tools"
$machineSummary += "- Node: $(Get-CommandVersion -CommandName 'node' -VersionCommand { node -v })"
$machineSummary += "- npm: $(Get-CommandVersion -CommandName 'npm' -VersionCommand { npm -v })"
$machineSummary += "- Git: $(Get-CommandVersion -CommandName 'git' -VersionCommand { git --version })"
$machineSummary += ""
$machineSummary += "## Graphics"
$machineSummary += (Get-CimInstance Win32_VideoController | ForEach-Object { "- $($_.Name) | driver $($_.DriverVersion)" })
$machineSummary += ""
$machineSummary += "## Audio"
$machineSummary += (Get-CimInstance Win32_SoundDevice | ForEach-Object { "- $($_.Name) | $($_.Manufacturer)" })
$machineSummary += ""
$machineSummary += "## Physical network adapters"
$machineSummary += (
  Get-CimInstance Win32_NetworkAdapter |
    Where-Object { $_.PhysicalAdapter -eq $true } |
    ForEach-Object { "- $($_.Name) | $($_.Manufacturer)" }
)

$machineSummary | Set-Content (Join-Path $target "MACHINE-SUMMARY.md")

driverquery /FO CSV | Set-Content (Join-Path $target "driverquery.csv")

$programs = @()
$programs += "Node: $(Get-CommandVersion -CommandName 'node' -VersionCommand { node -v })"
$programs += "npm: $(Get-CommandVersion -CommandName 'npm' -VersionCommand { npm -v })"
$programs += "Git: $(Get-CommandVersion -CommandName 'git' -VersionCommand { git --version })"
$programs += "MongoDB service: $((Get-Service MongoDB -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status) -as [string])"
$programs | Set-Content (Join-Path $target "tool-versions.txt")

try {
  winget export -o (Join-Path $target "winget-packages.json") --accept-source-agreements | Out-Null
} catch {
  "winget export failed on this machine." | Set-Content (Join-Path $target "winget-export-error.txt")
}

Write-Host "Machine snapshot written to $target" -ForegroundColor Green
