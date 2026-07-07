<p align="center">
  <img src="assets/wakewait-cover.png" alt="WakeWait cover" width="900" />
</p>

# WakeWait

Low-token shell waiting for Codex.

WakeWait v2 is a tiny skill plus bundled shell scripts. It routes plain duration waits to native shell sleep, and uses scripts only for deterministic file/text/command readiness checks.

## Commands

Plain fixed-duration delay uses the shell directly:

PowerShell:

```powershell
Start-Sleep -Seconds 600; Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
```

macOS / Linux:

```bash
sleep 600; date '+%Y-%m-%d %H:%M:%S %z'
```

Rule waits use WakeWait:

PowerShell:

```powershell
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" wait-file -Path .\outputs\done.json -Every 30s -Timeout 2h
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" wait-contains -Path .\logs\train.log -Text "Evaluation complete" -Every 1m -Timeout 6h
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" wait-command -Command "python scripts/check_ready.py" -Every 1m -Timeout 2h
```

macOS / Linux:

```bash
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" wait-file --path outputs/done.json --every 30s --timeout 2h
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" wait-contains --path logs/train.log --text "Evaluation complete" --every 1m --timeout 6h
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" wait-command --command "python scripts/check_ready.py" --every 1m --timeout 2h
```

## Install

Give Codex this prompt:

```text
Install the latest WakeWait from https://github.com/yptang98/WakeWait.

Run the repository installer for my OS. Let the installer choose the canonical Codex skills root. Do not inspect skill files unless install fails; verify only that one wakewait skill folder exists.
```

The installer copies `skills/wakewait` into one canonical Codex skills root and removes other WakeWait-managed duplicates. This keeps discovery fast and avoids duplicate skill context.

## Design

- Plain fixed-duration delay stays native: `Start-Sleep` or `sleep`, followed by a timestamp.
- The skill body stays tiny so sleep/wait association does not add much context.
- Shell scripts do deterministic rule waits: wait-file, wait-contains, wait-command.
- Output stays quiet: ready/timeout lines for rule waits, no per-poll chatter.
- No Node runtime, background daemon, model polling loop, or persistent state.

## Uninstall

Give Codex this prompt:

```text
Uninstall WakeWait using its installed uninstall script and verify the wakewait skill folder is gone.
```

## License

MIT
