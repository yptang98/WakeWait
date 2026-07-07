<p align="center">
  <img src="assets/wakewait-cover.png" alt="WakeWait cover" width="900" />
</p>

# WakeWait

Efficient local waiting for agent CLIs.

WakeWait lets Codex or another agent stop spending model time while training jobs, downloads, evaluations, queues, or remote tasks are still running. It wraps simple local sleep in the `wakewait` CLI, records wall-clock state for interrupted waits, polls deterministic rules for `wait-for`, and avoids calling the model during the wait loop.

WakeWait is not an intelligent scheduler. It is a small local waiting layer plus one Codex skill that helps the agent choose simple wait intervals.

## CLI Purpose

The `wakewait` CLI exists to make local waiting consistent and recoverable:

- Record `startedAt`, `wakeAt`, and task state so an interrupted session can check elapsed/remaining time later.
- Sleep locally with near-native overhead: one CLI process, a state write before sleeping, and a final state update after wake.
- Keep a background local wait running after the CLI command returns.
- Poll a fixed rule such as file exists, file contains text, or command exits 0.
- Run fixed log health scans without model calls.
- Expose `wakewait status` and `wakewait cancel`.

The core is still simple: local sleep plus local if/else checks. The skill may advise shorter checks early and longer checks after a job looks stable, but that policy stays in the agent, not in the CLI.

WakeWait always uses real wall-clock timestamps for persisted waits. For example, if a one-hour sleep starts, the network drops after 30 minutes, and Codex is restarted two hours later, `wakewait status` compares the current time with the original `startedAt` and `wakeAt`; it will show the task as elapsed/overdue instead of pretending only the first 30 minutes counted.

## One-Click Install

Give Codex this prompt:

```text
Install the latest WakeWait from https://github.com/yptang98/WakeWait.

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
- installs the `wakewait` skill into `~/.codex/skills`
- removes older WakeWait-managed legacy skill copies if present
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
wakewait sleep 60s
wakewait sleep 5m
wakewait sleep 1h
```

WakeWait records the sleep start time before waiting, then uses local wall-clock time for status and recovery. Use background mode when you need the wait to continue after the command returns:

```bash
wakewait sleep 30m --background --on-ready "codex \"check logs/train.log and summarize progress\""
```

Wait for a file:

```bash
wakewait wait-for --file outputs/done.json --every 5m --timeout 6h --background --on-ready "codex \"read outputs/done.json and summarize metrics\""
```

Wait for a log rule:

```bash
wakewait wait-for --contains logs/train.log "Evaluation complete" --every 5m --timeout 6h --background
```

Run fixed health rules while waiting:

```bash
wakewait wait-for --file outputs/done.json --every 5m --timeout 6h --background --health-log logs/train.log
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
| `--file <path>` | Succeed when a file exists |
| `--contains <path> <text>` | Succeed when a file contains fixed text |
| `--condition "<command>"` | Succeed when a shell command exits 0 |
| `--health-log <path>` | Periodically scan a log with fixed built-in failure rules such as OOM, traceback, NaN/Inf loss, killed process |
| `--health-every 30m` | Frequency for fixed health-rule scans when `--health-log` is set |
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
skills/wakewait
scripts/wakewait.mjs
scripts/patch-pi-wait.mjs
scripts/install.*
scripts/uninstall.*
```

## Comparison

| Approach | Strength | Limit |
| --- | --- | --- |
| Python or shell `sleep` | Universal and predictable | Blocks the agent turn and has no resume prompt or persisted state |
| Timer-only skills | Easy fixed reminders | Usually cannot poll job-specific readiness conditions |
| `Long Waits`-style skills | Good model policy for deciding when to wait | Depends on the host runtime for actual scheduling and recovery |
| `Execution Timer`-style MCP tools | Reusable across clients and callable as tools | Adds a service and may not know the local agent session, resume prompt, or project wait state |
| Cron or watchdog scripts | Durable production automation | Separate from the chat workflow; prompts and recovery must be wired manually |
| WakeWait | One skill plus a local CLI: near-native local sleep with wall-clock state, deterministic rule polling, status/cancel, fixed health rules, optional background worker, and optional slash-command patching | Requires Node.js for the CLI; interval choice remains the agent's responsibility |

## License

MIT
