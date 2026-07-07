<p align="center">
  <img src="assets/wakewait-cover.png" alt="WakeWait cover" width="900" />
</p>

# WakeWait

Low-token shell waiting for Codex.

WakeWait v2 is a skill plus bundled shell scripts. Codex reads a tiny skill, then calls the script for sleep or deterministic waiting. The script handles duration parsing, sleeping, polling, timeouts, and timestamps, so the model does not burn tokens or pollute context while idle.

## Commands

PowerShell:

```powershell
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" sleep -Duration 10m
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" wait-file -Path .\outputs\done.json -Every 30s -Timeout 2h
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" wait-contains -Path .\logs\train.log -Text "Evaluation complete" -Every 1m -Timeout 6h
& "$HOME\.codex\skills\wakewait\scripts\wakewait.ps1" wait-command -Command "python scripts/check_ready.py" -Every 1m -Timeout 2h
```

macOS / Linux:

```bash
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" sleep --duration 10m
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" wait-file --path outputs/done.json --every 30s --timeout 2h
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" wait-contains --path logs/train.log --text "Evaluation complete" --every 1m --timeout 6h
sh "$HOME/.codex/skills/wakewait/scripts/wakewait.sh" wait-command --command "python scripts/check_ready.py" --every 1m --timeout 2h
```

## Install

Give Codex this prompt:

```text
Install the latest WakeWait from https://github.com/yptang98/WakeWait.

Use the README, run the correct installer for my OS, verify the wakewait skill and bundled scripts were installed into my global Codex skills root, then show me one sleep and one wait-file example.
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

The installer copies `skills/wakewait` into detected global Codex skill roots such as `CODEX_HOME/skills`, `~/.codex/skills`, or an existing `D:\codex\skills` on Windows.

## Design

- Skill stays short: just invocation policy and examples.
- Shell scripts do the real work: sleep, wait-file, wait-contains, wait-command.
- Output stays quiet: start line, ready/woke/timeout line, no per-poll chatter.
- No Node runtime, background daemon, model polling loop, or persistent state.

## Uninstall

Windows PowerShell:

```powershell
& "$HOME\.wakewait\scripts\uninstall.ps1"
```

macOS / Linux:

```bash
sh "$HOME/.wakewait/scripts/uninstall.sh"
```

## License

MIT
