# Prometheus Portable Drive Steps

Portable drive letter:
- `A:`

PC drive letter:
- `C:`

## Before reinstalling Windows

### 1. Connect the portable drive

Make sure your portable drive appears as:
- `A:`

### 2. Open PowerShell as Administrator

### 3. Run this exact command

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
& "C:\Prometheus-Clean\deployment\SAVE-PROMETHEUS-TO-PORTABLE.ps1"
```

### 4. What this saves

The script copies:
- the full `C:\Prometheus-Clean` workspace
- your Codex home from `C:\Users\david\.codex`
- the machine snapshot

Saved target:
- `A:\Prometheus-Recovery`

## After reinstalling Windows

### 1. Connect the portable drive

Make sure it is still:
- `A:`

### 2. Open PowerShell as Administrator

### 3. Run this exact command

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
& "A:\Prometheus-Recovery\Prometheus-Clean\deployment\RESTORE-PROMETHEUS-FROM-PORTABLE.ps1"
```

### 4. If you want it to restore and immediately start backend and frontend

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
& "A:\Prometheus-Recovery\Prometheus-Clean\deployment\RESTORE-PROMETHEUS-FROM-PORTABLE.ps1" -StartDev
```

## What the restore does

- copies the Prometheus workspace back to `C:\Prometheus-Clean`
- restores your Codex home to `C:\Users\david\.codex`
- installs core required software with Winget
- restores the backend `.env` from `.env.example` if needed
- ensures MongoDB is running
- installs npm packages
- optionally starts the backend and frontend
- local AI can be started with `START-PROMETHEUS-LOCAL-AI.ps1`

Optional desktop tools such as MongoDB Compass, Chrome, VS Code, LM Studio, Mailpit, and Codex desktop are skipped by default so one GUI installer cannot block the core restore. To install them later, open Administrator PowerShell and run:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
& "C:\Prometheus-Clean\deployment\PROMETHEUS-RECOVERY-KIT.ps1" -SkipNpm -InstallOptionalApps
```

## One-click files involved

- Save now:
  `C:\Prometheus-Clean\deployment\SAVE-PROMETHEUS-TO-PORTABLE.ps1`

- Restore later:
  `A:\Prometheus-Recovery\Prometheus-Clean\deployment\RESTORE-PROMETHEUS-FROM-PORTABLE.ps1`

- Software bootstrap:
  `C:\Prometheus-Clean\deployment\PROMETHEUS-RECOVERY-KIT.ps1`

- Local AI startup:
  `C:\Prometheus-Clean\deployment\START-PROMETHEUS-LOCAL-AI.ps1`

- Machine snapshot:
  `C:\Prometheus-Clean\deployment\PROMETHEUS-MACHINE-SNAPSHOT.ps1`

## Important local AI step after restore

Run this after LM Studio is installed:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Prometheus-Clean\deployment\START-PROMETHEUS-LOCAL-AI.ps1"
```

It starts the local OpenAI-compatible server on `http://127.0.0.1:1234/v1`, loads `openai/gpt-oss-20b` as `prometheus-local`, and updates the backend `.env` model setting.

If Codex desktop does not install automatically through Microsoft Store, reinstall it manually and your restored `.codex` folder will still be in place.
