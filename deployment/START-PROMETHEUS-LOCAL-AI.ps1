<#
Starts the local LM Studio API server and loads the Prometheus local model.

This script is safe to rerun. It only updates OPENAI_BASE_URL and OPENAI_MODEL
in the backend .env file, leaving any existing API keys or secrets untouched.
#>

[CmdletBinding()]
param(
  [string]$ModelKey = "openai/gpt-oss-20b",
  [string]$Identifier = "prometheus-local",
  [int]$ContextLength = 8192,
  [string]$BackendEnvPath = "",
  [string]$BaseUrl = "http://127.0.0.1:1234/v1"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BackendEnvPath)) {
  $BackendEnvPath = Join-Path $PSScriptRoot "..\prometheus-backend\.env"
}

function Set-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Could not find backend env file: $Path"
  }

  $content = Get-Content -LiteralPath $Path -Raw
  $line = "$Name=$Value"
  $pattern = "(?m)^$([regex]::Escape($Name))=.*$"

  if ($content -match $pattern) {
    $content = [regex]::Replace($content, $pattern, $line)
  } else {
    if (-not $content.EndsWith("`n")) {
      $content += "`r`n"
    }
    $content += "$line`r`n"
  }

  Set-Content -LiteralPath $Path -Value $content -NoNewline
}

$lmsPath = Join-Path $env:USERPROFILE ".lmstudio\bin\lms.exe"
if (-not (Test-Path -LiteralPath $lmsPath)) {
  throw "LM Studio CLI was not found at $lmsPath. Open LM Studio once, then run this script again."
}

function Invoke-LmsCapture {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  $oldErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & $lmsPath @Arguments 2>&1 | ForEach-Object { $_.ToString() }
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $oldErrorActionPreference

  [pscustomobject]@{
    Output = ($output -join "`n")
    ExitCode = $exitCode
  }
}

Write-Host "Checking LM Studio server..."
$serverStatus = Invoke-LmsCapture -Arguments @("server", "status")
if ($serverStatus.ExitCode -ne 0 -or $serverStatus.Output -match "not running") {
  Write-Host "Starting LM Studio server..."
  $serverStart = Invoke-LmsCapture -Arguments @("server", "start")
  if ($serverStart.Output) {
    Write-Host $serverStart.Output
  }
  if ($serverStart.ExitCode -ne 0) {
    throw "Could not start LM Studio server."
  }
}

Write-Host "Checking loaded model..."
$loadedModels = Invoke-LmsCapture -Arguments @("ps")
if ($loadedModels.Output -notmatch [regex]::Escape($Identifier)) {
  Write-Host "Loading $ModelKey as $Identifier..."
  $loadResult = Invoke-LmsCapture -Arguments @("load", $ModelKey, "--identifier", $Identifier, "--context-length", $ContextLength.ToString(), "--yes")
  if ($loadResult.Output) {
    Write-Host $loadResult.Output
  }
  if ($loadResult.ExitCode -ne 0) {
    throw "Could not load $ModelKey as $Identifier."
  }
} else {
  Write-Host "$Identifier is already loaded."
}

Write-Host "Updating backend AI env settings..."
Set-DotEnvValue -Path $BackendEnvPath -Name "OPENAI_BASE_URL" -Value $BaseUrl
Set-DotEnvValue -Path $BackendEnvPath -Name "OPENAI_MODEL" -Value $Identifier

Write-Host "Verifying LM Studio model endpoint..."
$models = Invoke-RestMethod -Uri "$BaseUrl/models" -TimeoutSec 20
$ids = @($models.data | ForEach-Object { $_.id })
if ($ids -notcontains $Identifier) {
  throw "LM Studio is running, but $Identifier was not returned by $BaseUrl/models."
}

Write-Host "Prometheus local AI is ready: $Identifier at $BaseUrl"
