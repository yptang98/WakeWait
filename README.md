<p align="center">
  <img src="assets/wakewait-cover.png" alt="WakeWait cover" width="900" />
</p>

# WakeWait

Auto sleep and long waits for agent CLIs.

WakeWait lets an agent stop spending model time while training jobs, downloads, evaluations, queues, or remote tasks are still running. The agent can sleep locally, poll a cheap condition, persist wait state, and wake with a specific resume prompt.

`v0` is built for [Feynman](https://feynman.is) / Pi as the first supported host.

## Quick Install

### 1. Install Feynman

Use the official Feynman install page: https://feynman.is/docs/getting-started/installation

macOS / Linux:

```bash
curl -fsSL https://feynman.is/install | bash
```

Windows PowerShell:

```powershell
irm https://feynman.is/install.ps1 | iex
```

### 2. Ask Codex to install WakeWait

After Feynman is installed, give Codex this command:

```bash
codex "Install WakeWait from https://github.com/yptang98/WakeWait. Use the WakeWait README, run the correct installer for my OS, verify pi-wait-patch status and the bundled checks, then tell me how to use /sleep and /wait-for."
```

This lets Codex clone WakeWait, run the installer, patch the local Pi runtime, install the skills, and verify the result.

## Install WakeWait Manually

Use this if Feynman is already installed and you do not want Codex to run the install for you.

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/yptang98/WakeWait/main/scripts/install.ps1 | iex
```

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/yptang98/WakeWait/main/scripts/install.sh | sh
```

The installer:

- installs WakeWait helper files under `~/.wakewait`
- installs `auto-sleep` and `deferred-wait` into `~/.feynman/agent/skills`
- also installs those skills into `~/.codex/skills` when Codex is present
- patches detected Pi coding-agent runtimes with `/sleep` and `/wait-for`
- creates backups so `wakewait-uninstall` can restore patched files

## Uninstall With Codex

Give Codex this prompt:

```text
Uninstall WakeWait from my local Feynman/Codex setup.

Use the WakeWait uninstall script from ~/.wakewait, remove the installed skills, restore backed-up Pi runtime files, verify pi-wait-patch is no longer installed, and report anything that needs a Feynman update or restart.
```

## Manual Uninstall

Windows PowerShell:

```powershell
& "$HOME\.wakewait\scripts\uninstall.ps1"
```

macOS / Linux:

```bash
sh "$HOME/.wakewait/scripts/uninstall.sh"
```

## Usage

Use `/sleep` when time passing is the only useful next step:

```text
/sleep 30m then check the latest training logs and summarize progress
/sleep until 02:00 then verify the download completed and report failed files
```

Use `/wait-for` when a cheap command can tell whether the job is ready:

```text
/wait-for --condition "python -c \"from pathlib import Path; raise SystemExit(0 if Path('outputs/done.json').exists() else 1)\"" --every 5m --timeout 6h --persist --review-every 30m --review "check logs/train.log for OOM, CUDA errors, NaN loss, stalled progress, or missing checkpoints" then read outputs/done.json and summarize metrics else inspect logs/train.log and explain the current state
```

Useful flags:

| Flag | Purpose |
| --- | --- |
| `--persist` | Write wait state to `.codex-wait/tasks.json` so an interrupted session can inspect elapsed time and continue correctly |
| `--review-every 30m` | Periodically wake the model to inspect logs or status; default is `30m` for `/wait-for` |
| `--review "<prompt>"` | Tell the health review exactly which logs, sessions, hosts, and failure modes to check |
| `--background` | Optional, non-default background wait that continues after the CLI exits |
| `--on-ready "<command>"` | Optional recovery command for background waits after success, wake, or timeout |

Check persisted waits:

```bash
pi-wait-patch status
```

Cancel one wait or all waits:

```bash
pi-wait-patch cancel <id>
pi-wait-patch cancel all
```

## Plugin Structure

WakeWait is packaged as a Codex-style plugin:

```text
.codex-plugin/plugin.json
skills/auto-sleep
skills/deferred-wait
scripts/patch-pi-wait.mjs
scripts/install.*
scripts/uninstall.*
```

`v0` uses Feynman/Pi as the first supported host because it already packages the agent runtime and skill discovery. The WakeWait code is kept separate from Feynman so it can grow into a fully standalone runtime integration later.

## Comparison

| Approach | Strength | Limit |
| --- | --- | --- |
| Python or shell `sleep` | Universal and predictable | Blocks the agent turn and has no resume prompt, persisted state, or health review |
| Timer-only skills | Easy fixed reminders | Usually cannot poll job-specific readiness conditions |
| `Long Waits`-style skills | Good model policy for deciding when to wait | Depends on the host runtime for actual scheduling and recovery |
| `Execution Timer`-style MCP tools | Reusable across clients and callable as tools | Adds a service and may not know the local agent session, resume prompt, or project wait state |
| Cron or watchdog scripts | Durable production automation | Separate from the chat workflow; prompts and recovery must be wired manually |
| WakeWait | Local sleep, condition polling, persisted state, status/cancel, health reviews, optional background worker, and agent skills | `v0` is packaged through Feynman/Pi; fully standalone distribution is future work |

## License

MIT
