---
name: wakewait
description: Low-token wait/sleep router for Codex. Use when asked to wait, sleep, pause, check later, or wait for training/download/evaluation readiness. Plain duration waits use native shell sleep; file/text/command readiness uses bundled WakeWait scripts. No model polling.
---

# WakeWait

Use the cheapest deterministic path.

Plain duration wait:

- PowerShell: `Start-Sleep -Seconds <n>; Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'`
- POSIX: `sleep <n>; date '+%Y-%m-%d %H:%M:%S %z'`

Rule wait:

- PowerShell: `$HOME\.codex\skills\wakewait\scripts\wakewait.ps1`
- POSIX: `$HOME/.codex/skills/wakewait/scripts/wakewait.sh`

Actions: `wait-file`, `wait-contains`, `wait-command`. No model polling or progress chatter.
