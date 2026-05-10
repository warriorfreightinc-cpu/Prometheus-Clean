param(
  [string]$WorkspaceRoot = "C:\Prometheus-Clean",
  [switch]$SkipNpm,
  [switch]$StartDev,
  [switch]$InstallOptionalApps,
  [int]$WingetInstallTimeoutMinutes = 15
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-WingetPackageInstalled {
  param([string]$Id)
  $result = winget list --id $Id --exact --accept-source-agreements --disable-interactivity 2>$null | Out-String
  return $result -match [regex]::Escape($Id)
}

function Update-ProcessPathFromRegistry {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = (($machinePath, $userPath) | Where-Object { $_ }) -join ";"
}

function Invoke-NpmCi {
  param(
    [string]$ProjectPath,
    [switch]$LegacyPeerDeps
  )

  Push-Location $ProjectPath
  try {
    if ($LegacyPeerDeps) {
      npm ci --legacy-peer-deps
    } else {
      npm ci
    }

    if ($LASTEXITCODE -ne 0) {
      throw "npm ci failed in $ProjectPath with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function Ensure-WingetPackage {
  param(
    [string]$Id,
    [string]$Label,
    [string]$Source,
    [switch]$Optional
  )

  if (Test-WingetPackageInstalled -Id $Id) {
    Write-Host "$Label already installed." -ForegroundColor DarkGray
    return
  }

  Write-Host "Installing $Label..." -ForegroundColor Yellow

  $arguments = @(
    "install",
    "--id", $Id,
    "--exact",
    "--accept-package-agreements",
    "--accept-source-agreements",
    "--silent",
    "--disable-interactivity"
  )

  if ($Source) {
    $arguments += @("--source", $Source)
  }

  try {
    $process = Start-Process -FilePath "winget" -ArgumentList $arguments -PassThru -WindowStyle Hidden
    if (-not $process.WaitForExit($WingetInstallTimeoutMinutes * 60 * 1000)) {
      $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $process.Id }
      foreach ($child in $children) {
        Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue
      }
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      throw "$Label installation did not finish within $WingetInstallTimeoutMinutes minutes."
    }

    if ($process.ExitCode -ne 0) {
      throw "$Label installation failed with exit code $($process.ExitCode)."
    }
  } catch {
    if ($Optional) {
      Write-Host "Skipping optional package ${Label}: $($_.Exception.Message)" -ForegroundColor Yellow
      return
    }

    throw
  }

  Update-ProcessPathFromRegistry
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw "winget is required for this recovery kit. Install App Installer from Microsoft Store first."
}

Write-Step "Installing Prometheus core software prerequisites"

$corePackages = @(
  @{ Id = "Git.Git"; Label = "Git" },
  @{ Id = "OpenJS.NodeJS.20"; Label = "Node.js 20 LTS" },
  @{ Id = "MongoDB.Server"; Label = "MongoDB Server" }
)

$optionalPackages = @(
  @{ Id = "MongoDB.Compass.Full"; Label = "MongoDB Compass" },
  @{ Id = "MongoDB.Shell"; Label = "MongoDB Shell" },
  @{ Id = "Google.Chrome"; Label = "Google Chrome" },
  @{ Id = "Microsoft.VisualStudioCode"; Label = "Visual Studio Code" },
  @{ Id = "ElementLabs.LMStudio"; Label = "LM Studio" },
  @{ Id = "axllent.mailpit"; Label = "Mailpit" }
)

foreach ($package in $corePackages) {
  Ensure-WingetPackage -Id $package.Id -Label $package.Label
}

Update-ProcessPathFromRegistry

if ($InstallOptionalApps) {
  Write-Step "Installing optional desktop tools"

  foreach ($package in $optionalPackages) {
    Ensure-WingetPackage -Id $package.Id -Label $package.Label -Optional
  }

  Write-Step "Trying optional Codex desktop install"

  try {
    Ensure-WingetPackage -Id "9PLM9XGG6VKS" -Label "Codex desktop" -Source "msstore" -Optional
  } catch {
    Write-Host "Codex desktop was not installed automatically. Restore your .codex folder and install the app manually if needed." -ForegroundColor Yellow
  }
} else {
  Write-Host "Skipping optional desktop tools. Re-run with -InstallOptionalApps from an Administrator PowerShell if you want Compass, Chrome, VS Code, LM Studio, Mailpit, and Codex desktop." -ForegroundColor DarkGray
}

Write-Step "Preparing clean workspace folders"

$folders = @(
  $WorkspaceRoot,
  (Join-Path $WorkspaceRoot "prometheus"),
  (Join-Path $WorkspaceRoot "prometheus-backend"),
  (Join-Path $WorkspaceRoot "docs"),
  (Join-Path $WorkspaceRoot "backups"),
  (Join-Path $WorkspaceRoot "legacy-notes"),
  (Join-Path $WorkspaceRoot "deployment")
)

foreach ($folder in $folders) {
  New-Item -ItemType Directory -Force -Path $folder | Out-Null
}

$backendEnvExample = Join-Path $WorkspaceRoot "prometheus-backend\.env.example"
$backendEnv = Join-Path $WorkspaceRoot "prometheus-backend\.env"

if ((Test-Path $backendEnvExample) -and -not (Test-Path $backendEnv)) {
  Copy-Item $backendEnvExample $backendEnv
  Write-Host "Created backend .env from .env.example" -ForegroundColor Green
}

Write-Step "Ensuring MongoDB service is running"

$mongoService = Get-Service MongoDB -ErrorAction SilentlyContinue
if ($mongoService) {
  try {
    Set-Service -Name MongoDB -StartupType Automatic
  } catch {
    Write-Host "Could not change MongoDB startup type from this shell: $($_.Exception.Message)" -ForegroundColor Yellow
  }

  if ($mongoService.Status -ne "Running") {
    try {
      Start-Service MongoDB
    } catch {
      throw "MongoDB is installed but could not be started from this shell. Re-run PowerShell as Administrator or start the MongoDB service manually."
    }
  }
  Write-Host "MongoDB service is ready." -ForegroundColor Green
} else {
  Write-Host "MongoDB service was not found. Install or verify MongoDB Server." -ForegroundColor Yellow
}

if (-not $SkipNpm) {
  Write-Step "Installing frontend and backend npm dependencies"

  Update-ProcessPathFromRegistry

  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is not available after installing Node.js. Open a new PowerShell window or verify the Node.js installation."
  }

  $frontend = Join-Path $WorkspaceRoot "prometheus"
  $backend = Join-Path $WorkspaceRoot "prometheus-backend"

  if (Test-Path (Join-Path $frontend "package-lock.json")) {
    Invoke-NpmCi -ProjectPath $frontend
  }

  if (Test-Path (Join-Path $backend "package-lock.json")) {
    Invoke-NpmCi -ProjectPath $backend -LegacyPeerDeps
  }
}

if ($StartDev) {
  Write-Step "Starting Prometheus dev servers"

  $frontend = Join-Path $WorkspaceRoot "prometheus"
  $backend = Join-Path $WorkspaceRoot "prometheus-backend"

  Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backend'; npm run start:dev"
  Start-Sleep -Seconds 2
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontend'; npm start"
}

Write-Step "Recovery kit finished"

Write-Host "Next manual checks:" -ForegroundColor Green
Write-Host "1. Open LM Studio and start the local OpenAI-compatible server on http://127.0.0.1:1234/v1"
Write-Host "2. Load your Prometheus local model in LM Studio"
Write-Host "3. Confirm backend .env values are correct"
Write-Host "4. If you did not use -StartDev, run backend: npm run start:dev"
Write-Host "5. If you did not use -StartDev, run frontend: npm start"
