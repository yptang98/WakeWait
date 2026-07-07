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

Use the README and repository scripts to install it for my OS. Verify the wakewait skill and bundled scripts were installed into my global Codex skills root. After install, future wait, sleep, pause, check-later, training, download, and evaluation waits should prefer WakeWait's low-token routing: native shell sleep for plain duration waits, bundled scripts for file/text/command readiness. Keep the loaded skill context small.
```

The installer copies `skills/wakewait` into detected global Codex skill roots such as `CODEX_HOME/skills`, `~/.codex/skills`, or an existing `D:\codex\skills` on Windows.

## Design

- Plain fixed-duration delay stays native: `Start-Sleep` or `sleep`, followed by a timestamp.
- The skill body stays tiny so sleep/wait association does not add much context.
- Shell scripts do deterministic rule waits: wait-file, wait-contains, wait-command.
- Output stays quiet: ready/timeout lines for rule waits, no per-poll chatter.
- No Node runtime, background daemon, model polling loop, or persistent state.

## Uninstall

Give Codex this prompt:

```text
Uninstall WakeWait from my global Codex skills roots using the uninstall script installed by WakeWait. Verify the wakewait skill folder is gone.
```

## License

MIT
