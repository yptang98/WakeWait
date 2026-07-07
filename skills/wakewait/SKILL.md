---
name: wakewait
description: "Low-token quiet wait/sleep router for Codex. Use for wait, sleep, pause, check later, training/download/eval waits. Fixed sleep uses the exact shell one-liner in this skill. File/text/command readiness uses bundled scripts. No model polling."
---

# WakeWait

Sleep first:
- PowerShell: `Start-Sleep -Seconds <n>; Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'`
- POSIX: `sleep <n>; date '+%Y-%m-%d %H:%M:%S %z'`

Condition wait: run `$HOME/.codex/skills/wakewait/scripts/wakewait.sh` or `$HOME\.codex\skills\wakewait\scripts\wakewait.ps1` with `wait-file`, `wait-contains`, or `wait-command`.

During wait: keep one shell/session running; use stdin/status polling if available, not chat/progress. Answer only after exit or user interrupt. No model polling.
