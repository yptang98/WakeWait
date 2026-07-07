---
name: wakewait
description: Default low-token waiting skill for Codex. Use first when the user asks Codex to sleep, wait, pause, wait for a file/text/command, check again later, wait during training/download/evaluation/queue work, or reduce model calls while idle. For fixed-duration sleep, use native shell sleep directly. For file/text/command readiness, use the bundled shell scripts instead of model polling, Python wrappers, custom CLIs, or ad hoc loops.
---

# WakeWait

Keep waiting quiet. For fixed waits, use the native shell sleep command directly. For deterministic readiness, use the bundled shell script.

Fixed sleep:

PowerShell:

```powershell
Start-Sleep -Seconds 600; Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
```

POSIX shell:

```bash
sleep 600; date '+%Y-%m-%d %H:%M:%S %z'
```

Rule waits:

PowerShell:

```powershell
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" wait-file -Path .\outputs\done.json -Every 30s -Timeout 2h
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" wait-contains -Path .\logs\train.log -Text "Evaluation complete" -Every 1m -Timeout 6h
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" wait-command -Command "python scripts/check_ready.py" -Every 1m -Timeout 2h
```

POSIX shell:

```bash
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" wait-file --path outputs/done.json --every 30s --timeout 2h
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" wait-contains --path logs/train.log --text "Evaluation complete" --every 1m --timeout 6h
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" wait-command --command "python scripts/check_ready.py" --every 1m --timeout 2h
```

If `$HOME/.codex/skills` is not the active skill root, use the loaded skill's local `scripts/wakewait.ps1` or `scripts/wakewait.sh` path instead.

Policy:

- Use native `Start-Sleep` or `sleep` for fixed waits.
- Use `wait-file`, `wait-contains`, or `wait-command` for deterministic readiness.
- Do not implement model polling loops around these commands.
- Do not emit progress updates during a fixed sleep. A terminal UI may show command elapsed time; treat that as shell execution status, not model activity.
- After the script returns, inspect or summarize only what the user requested.
