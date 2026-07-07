<p align="center">
  <img src="assets/wakewait-cover.png" alt="WakeWait cover" width="900" />
</p>

# WakeWait

Independent auto sleep and long waits for agent CLIs.

WakeWait lets Codex or another agent stop spending model time while training jobs, downloads, evaluations, queues, or remote tasks are still running. It can sleep locally, poll a cheap condition, persist wait state, expose status/cancel commands, and optionally wake through a background command.

`v1` is a standalone CLI. Pi slash-command support is optional and can be patched later with `wakewait patch`.

## One-Click Install

Give Codex this prompt:

```text
Install WakeWait v1 from https://github.com/yptang98/WakeWait.

Use the README, install Node.js 20+ if needed, run the correct installer for my OS, verify `wakewait status` and `npm run check`, then show me one `wakewait sleep` example and one `wakewait wait-for` example.
```

Codex can clone the repo, run the installer, install the WakeWait skills, verify the CLI, and report the commands you can use.

## Manual One-Line Install

Use these only if you do not want Codex to run the install.

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/yptang98/WakeWait/main/scripts/install.ps1 | iex
```

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/yptang98/WakeWait/main/scripts/install.sh | sh
```

The installer:

- installs helper files under `~/.wakewait`
- creates `wakewait` and `pi-wait-patch` launchers under `~/.wakewait/bin`
- installs `auto-sleep` and `deferred-wait` into `~/.codex/skills`
- optionally patches detected Pi coding-agent runtimes with `/sleep` and `/wait-for`
- creates backups so uninstall can restore patched runtime files

If `wakewait` is not found in a new shell, add `~/.wakewait/bin` to `PATH`, or call the script directly with `node ~/.wakewait/scripts/wakewait.mjs`.

## Usage

Check persisted waits:

```bash
wakewait status
```

Sleep for a fixed time:

```bash
wakewait sleep 30m --background --on-ready "codex \"check logs/train.log and summarize progress\""
```

Wait for a condition:

```bash
wakewait wait-for --condition "python -c \"from pathlib import Path; raise SystemExit(0 if Path('outputs/done.json').exists() else 1)\"" --every 5m --timeout 6h --background --review-every 30m --review "check logs/train.log for OOM, CUDA errors, NaN loss, stalled progress, or missing checkpoints" --on-ready "codex \"read outputs/done.json and summarize metrics\""
```

Cancel one wait or all waits:

```bash
wakewait cancel <id>
wakewait cancel all
```

Useful flags:

| Flag | Purpose |
| --- | --- |
| `--background` | Optional background worker that continues after the CLI command exits |
| `--on-ready "<command>"` | Optional command to run after sleep wakes, a condition succeeds, or a timeout occurs |
| `--review-every 30m` | Marks long polling tasks for health review; default is `30m` for `wait-for` |
| `--review "<prompt>"` | Records exactly which logs, sessions, hosts, and failure modes should be checked |
| `--on-review "<command>"` | Optional command to run when a background poll reaches the review interval |
| `--state <path>` | Store or inspect wait state somewhere other than `.codex-wait/tasks.json` |

## Optional Slash Commands

WakeWait works without host patching. If you use a Pi-compatible runtime and want `/sleep` and `/wait-for` slash commands, run:

```bash
wakewait patch --root <pi-coding-agent-or-node_modules-path>
```

The patch is optional. It only modifies detected Pi runtime files and writes backups into `~/.wakewait/backups` for uninstall.

## Uninstall With Codex

Give Codex this prompt:

```text
Uninstall WakeWait from my local Codex setup.

Use the WakeWait uninstall script from ~/.wakewait, remove installed WakeWait skills, restore backed-up optional runtime files, verify `wakewait` is gone or explain if PATH still points at it, and keep state only if I ask.
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

Add `--keep-state` if you want to preserve `~/.wakewait`.

## Plugin Structure

WakeWait is packaged as a Codex-style plugin and standalone CLI:

```text
.codex-plugin/plugin.json
skills/auto-sleep
skills/deferred-wait
scripts/wakewait.mjs
scripts/patch-pi-wait.mjs
scripts/install.*
scripts/uninstall.*
```

## Comparison

| Approach | Strength | Limit |
| --- | --- | --- |
| Python or shell `sleep` | Universal and predictable | Blocks the agent turn and has no resume prompt, persisted state, or health review |
| Timer-only skills | Easy fixed reminders | Usually cannot poll job-specific readiness conditions |
| `Long Waits`-style skills | Good model policy for deciding when to wait | Depends on the host runtime for actual scheduling and recovery |
| `Execution Timer`-style MCP tools | Reusable across clients and callable as tools | Adds a service and may not know the local agent session, resume prompt, or project wait state |
| Cron or watchdog scripts | Durable production automation | Separate from the chat workflow; prompts and recovery must be wired manually |
| WakeWait v1 | Independent CLI, Codex skills, local sleep, condition polling, persisted state, status/cancel, health reviews, optional background worker, and optional slash-command patching | Requires Node.js; true automatic model wake-up still depends on the `--on-ready` command or host integration |

## License

MIT
