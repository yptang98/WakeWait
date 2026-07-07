---
name: wakewait
description: Low-token deterministic wait skill for Codex. Use for file, text, or command readiness checks during training, downloads, evaluations, or queued work. Prefer bundled scripts over model polling, Python wrappers, custom CLIs, or ad hoc loops.
---

# WakeWait

Use WakeWait only for rule waits.

Plain fixed-duration delay, if this skill is already loaded:

- PowerShell: `Start-Sleep -Seconds <n>; Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'`
- POSIX: `sleep <n>; date '+%Y-%m-%d %H:%M:%S %z'`

Rule-wait scripts:

- PowerShell: `$HOME\.codex\skills\wakewait\scripts\wakewait.ps1`
- POSIX: `$HOME/.codex/skills/wakewait/scripts/wakewait.sh`

Actions: `wait-file`, `wait-contains`, `wait-command`. No model polling. No per-poll progress.
