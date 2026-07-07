<p align="center">
  <img src="assets/wakewait-cover.png" alt="WakeWait cover" width="900" />
</p>

# WakeWait

Efficient native shell sleep for Codex.

WakeWait is a small Codex skill that teaches agents to wait with the host shell's built-in sleep command instead of using custom CLIs, background schedulers, polling loops, or model-driven waiting. The goal is simple: when work is idle, sleep locally and cheaply, then print the wake time.

## What It Does

PowerShell:

```powershell
Start-Sleep -Seconds 600; Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
```

macOS / Linux:

```bash
sleep 600; date '+%Y-%m-%d %H:%M:%S %z'
```

The skill tells Codex to:

- use native shell sleep for fixed waits
- convert minutes/hours into seconds
- avoid model calls while sleeping
- print the local wake time
- perform any requested check after the sleep finishes

WakeWait v1.0 is intentionally skill-only. It does not install a `wakewait` CLI, write state files, patch runtimes, run background workers, or implement condition polling.

## Install

Give Codex this prompt:

```text
Install the latest WakeWait from https://github.com/yptang98/WakeWait.

Use the README, run the correct installer for my OS, verify the wakewait skill was installed into my global Codex skills root, and show me one PowerShell or POSIX native sleep example.
```

Manual one-line install:

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/yptang98/WakeWait/main/scripts/install.ps1 | iex
```

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/yptang98/WakeWait/main/scripts/install.sh | sh
```

The installer copies `skills/wakewait` into detected global Codex skill roots such as `CODEX_HOME/skills`, `~/.codex/skills`, or an existing `D:\codex\skills` on Windows. It also removes WakeWait-managed legacy `auto-sleep` and `deferred-wait` skill copies and cleans old WakeWait CLI launchers if present.

## Usage

Ask Codex to wait normally:

```text
Wait 10 minutes, then check the training log.
```

With WakeWait loaded, Codex should run something like:

PowerShell:

```powershell
Start-Sleep -Seconds 600; Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'; Get-Content .\logs\train.log -Tail 80
```

macOS / Linux:

```bash
sleep 600; date '+%Y-%m-%d %H:%M:%S %z'; tail -n 80 logs/train.log
```

## Uninstall

Windows PowerShell:

```powershell
& "$HOME\.wakewait\scripts\uninstall.ps1"
```

macOS / Linux:

```bash
sh "$HOME/.wakewait/scripts/uninstall.sh"
```

## Comparison

| Approach | Strength | Limit |
| --- | --- | --- |
| Raw native shell sleep | Fastest and simplest | The model may forget the best command or timestamp format |
| Python sleep wrapper | Portable | Starts Python and adds unnecessary ceremony |
| Timer/daemon/CLI tools | Can add persistence or background features | More moving parts than needed for simple waits |
| WakeWait v1.0 | Skill-only guidance for native shell sleep with a wake timestamp | Fixed sleeps only; no persistence, condition polling, or background recovery |

## License

MIT
