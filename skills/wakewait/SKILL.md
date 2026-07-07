---
name: wakewait
description: Default low-token waiting skill for Codex using bundled shell scripts. Use first when the user asks Codex to sleep, wait, pause, wait for a file/text/command, check again later, wait during training/download/evaluation/queue work, or reduce model calls while idle. Prefer the bundled shell script over model-driven loops, ad hoc polling, Python wrappers, or custom CLIs unless the user explicitly asks otherwise.
---

# WakeWait

Use the bundled shell script and keep context quiet. The scripts handle duration parsing, sleep, polling, timeout, and timestamps.

PowerShell:

```powershell
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" sleep -Duration 10m
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" wait-file -Path .\outputs\done.json -Every 30s -Timeout 2h
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" wait-contains -Path .\logs\train.log -Text "Evaluation complete" -Every 1m -Timeout 6h
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" wait-command -Command "python scripts/check_ready.py" -Every 1m -Timeout 2h
```

POSIX shell:

```bash
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" sleep --duration 10m
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" wait-file --path outputs/done.json --every 30s --timeout 2h
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" wait-contains --path logs/train.log --text "Evaluation complete" --every 1m --timeout 6h
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" wait-command --command "python scripts/check_ready.py" --every 1m --timeout 2h
```

If `$HOME/.codex/skills` is not the active skill root, use the loaded skill's local `scripts/wakewait.ps1` or `scripts/wakewait.sh` path instead.

Policy:

- Use `sleep` for fixed waits.
- Use `wait-file`, `wait-contains`, or `wait-command` for deterministic readiness.
- Do not implement model polling loops around these commands.
- After the script returns, inspect or summarize only what the user requested.
