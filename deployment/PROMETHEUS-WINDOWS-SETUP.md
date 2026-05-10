# Prometheus Windows Recovery Kit

This folder is meant to be copied to a portable drive before reinstalling Windows.

## Is reinstalling Windows every week normal?

No. Most developers and designers do not reinstall Windows every week.

Normal pattern:
- keep clean workspaces
- use backup and restore scripts
- reinstall only when the machine is actually unstable, infected, or badly damaged by driver/tool conflicts

If Windows feels junky often, the better fix is usually:
- reduce plugin clutter
- keep one clean project workspace
- keep a recovery kit
- export your environment before major resets

## What this recovery kit gives you

- `PROMETHEUS-RECOVERY-KIT.ps1`
  Reinstalls the main software needed for Prometheus and local AI work.

- `PROMETHEUS-MACHINE-SNAPSHOT.ps1`
  Exports your current machine state, including drivers and core tool versions.

- `SAVE-PROMETHEUS-TO-PORTABLE.ps1`
  Copies the clean workspace and your Codex home to the portable drive.

- `RESTORE-PROMETHEUS-FROM-PORTABLE.ps1`
  Restores the clean workspace and your Codex home from the portable drive and runs the recovery kit.

- `START-PROMETHEUS-LOCAL-AI.ps1`
  Starts the LM Studio API server, loads `openai/gpt-oss-20b` as `prometheus-local`, and points the backend `.env` at it.

- `PROMETHEUS-PORTABLE-STEP-BY-STEP.md`
  Exact copy-paste commands for before and after reinstalling Windows.

## Software covered by the bootstrap

Core software installed by default:
- Git
- Node.js LTS
- MongoDB Server

Optional desktop tools installed only when `-InstallOptionalApps` is supplied:
- MongoDB Compass
- MongoDB Shell
- Google Chrome
- Visual Studio Code
- LM Studio
- Mailpit
- Codex desktop is attempted through Microsoft Store if available

## Drivers and hardware notes for this machine

Current detected critical hardware families:
- GPU: NVIDIA GeForce RTX 5060 Ti
- Audio: Realtek High Definition Audio and NVIDIA audio devices
- Network: Intel Wi-Fi 7 BE200 and Realtek PCIe 2.5GbE

Important note:
- Program installs can be automated.
- Driver reinstall is better handled by Windows Update and vendor tools.
- The snapshot script exports your current driver list before reinstall.

## Recommended use before reinstall

1. Copy the entire `C:\Prometheus-Clean\deployment` folder to your portable drive.
2. Run `PROMETHEUS-MACHINE-SNAPSHOT.ps1`
3. Save the created snapshot folder to the portable drive too.
4. Reinstall Windows if you still want to.

## Recommended use after reinstall

1. Copy the recovery kit back to the machine.
2. Run `PROMETHEUS-RECOVERY-KIT.ps1` as Administrator.
   - Default command: `& "C:\Prometheus-Clean\deployment\PROMETHEUS-RECOVERY-KIT.ps1"`
   - Optional desktop tools: add `-InstallOptionalApps`
3. Restore or copy your `C:\Prometheus-Clean` project folder.
4. Start local AI:
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Prometheus-Clean\deployment\START-PROMETHEUS-LOCAL-AI.ps1"`
5. Start backend and frontend.

## Good defaults for Prometheus

- Workspace root: `C:\Prometheus-Clean`
- Frontend: `C:\Prometheus-Clean\prometheus`
- Backend: `C:\Prometheus-Clean\prometheus-backend`
- Backend port: `3100`
- Frontend port: `4300`
- Local MongoDB: `mongodb://127.0.0.1:27017/prometheus_local`
- LM Studio local API: `http://127.0.0.1:1234/v1`
- Local AI model identifier: `prometheus-local`

## Suggested rule

Do not keep building Prometheus from mixed folders.

Use only:
- `C:\Prometheus-Clean`

Keep only as legacy reference:
- `C:\Prometheus-Clean`
