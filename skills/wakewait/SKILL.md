---
name: wakewait
description: Default efficient fixed-sleep skill for Codex using the host shell only. Use this skill first whenever the user asks Codex to sleep, wait, pause, wait a fixed amount of time, check again later after a delay, or reduce model calls during idle time. Prefer direct shell sleep commands over custom CLIs, background schedulers, polling loops, Python sleep wrappers, or model-driven waiting unless the user explicitly asks for those.
---

# WakeWait

Use WakeWait for fixed-duration waiting with the host shell. Keep it primitive and cheap:

- Use native shell sleep directly.
- Do not use a WakeWait CLI.
- Do not write state files.
- Do not run polling loops.
- Do not call the model while sleeping.
- Print the local time after waking so the user can see when the wait ended.

## Default Commands

PowerShell:

```powershell
Start-Sleep -Seconds 600; Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
```

POSIX shell:

```bash
sleep 600; date '+%Y-%m-%d %H:%M:%S %z'
```

Use the command for the active shell. Convert user durations to whole seconds:

- `30s` -> `30`
- `10m` -> `600`
- `1h` -> `3600`

For fractional durations, round up to the next whole second unless the user asks for millisecond precision.

## Agent Policy

Use direct shell sleep for:

- "sleep 10 minutes"
- "wait 60 seconds"
- "pause and check again"
- "training/download still running, wait a bit"
- "reduce context/model use while idle"

After the shell command returns, continue with the next requested check or summary.

Do not add wrappers, local state, timers, daemons, background workers, or custom CLIs. If the user asks to wait for a condition, prefer a simple fixed sleep followed by one explicit check after waking. If more waiting is needed, choose another fixed sleep interval.

## Examples

Wait 10 minutes on Windows:

```powershell
Start-Sleep -Seconds 600; Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
```

Wait 5 minutes then inspect a log:

```powershell
Start-Sleep -Seconds 300; Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'; Get-Content .\logs\train.log -Tail 80
```

Wait 10 minutes on macOS/Linux:

```bash
sleep 600; date '+%Y-%m-%d %H:%M:%S %z'
```

Wait 5 minutes then inspect a log:

```bash
sleep 300; date '+%Y-%m-%d %H:%M:%S %z'; tail -n 80 logs/train.log
```

## Before Sleeping

Briefly state:

- The wait duration in seconds or minutes.
- The shell command being run.
- What will be checked after waking, if anything.
