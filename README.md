<p align="center">
  <img src="assets/wakewait-cover.png" alt="WakeWait cover" width="900" />
</p>

# WakeWait

Efficient local waiting for agent CLIs.

WakeWait lets Codex or another agent stop spending model time while training jobs, downloads, evaluations, queues, or remote tasks are still running. It wraps simple local sleep in the `wakewait` CLI, automatically records wall-clock state for interrupted waits, polls deterministic rules for `wait-for`, and avoids calling the model during the wait loop.

WakeWait is not an intelligent scheduler. It is a small local waiting layer plus one Codex skill that helps the agent choose simple wait intervals.

After installation, the `wakewait` skill is intended to become Codex's default behavior for sleep, wait, pause, poll, training/download waits, and deterministic readiness checks.

## CLI Purpose

The `wakewait` CLI exists to make local waiting consistent and recoverable:

- Automatically read local time and record `startedAt`, `wakeAt`, and task state so an interrupted session can check elapsed/remaining time later.
- Store default wait state per project in `.codex-wait/tasks.json`.
- Clean completed sleep records after wake unless `--keep-record` is used.
- Sleep locally with near-native overhead: one CLI process, a state write before sleeping, and a final state update after wake.
- Keep a background local wait running after the CLI command returns.
- Poll a fixed rule such as file exists, file contains text, or command exits 0.
- Run fixed log health scans without model calls.
- Expose `wakewait status` and `wakewait cancel`.

The core is still simple: local sleep plus local if/else checks. The skill may advise shorter checks early and longer checks after a job looks stable, but that policy stays in the agent, not in the CLI.

WakeWait always uses real wall-clock timestamps for persisted waits. For example, if a one-hour sleep starts, the network drops after 30 minutes, and Codex is restarted two hours later, `wakewait status` compares the current time with the original `startedAt` and `wakeAt`; it will show the task as elapsed/overdue instead of pretending only the first 30 minutes counted.

Multiple projects are separated by default because each project uses its own `.codex-wait/tasks.json`. Use `--cwd <project>` or `--state <path>` only when you need to target a different project or storage file explicitly.

## One-Click Install

Give Codex this prompt:

```text
Install the latest WakeWait from https://github.com/yptang98/WakeWait.

Use the README, install Node.js 20+ if needed, run the correct installer for my OS, verify WakeWait by calling its installed launcher path directly, verify the `wakewait` skill was installed into my global Codex skills root, verify `npm run check`, then show me one `wakewait sleep` example and one `wakewait wait-for` example using the installed launcher path.
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
- installs the `wakewait` skill into all detected global Codex skill roots
- removes older WakeWait-managed legacy skill copies if present
- optionally patches detected Pi coding-agent runtimes with `/sleep` and `/wait-for`
- creates backups so uninstall can restore patched runtime files

Detected skill roots include `CODEX_HOME/skills`, `~/.codex/skills`, a sibling `codex/skills` directory when installing from a local clone, and common existing roots such as `D:\codex\skills` on Windows. To force a specific root, pass `--skills-root <path>` to the installer.

WakeWait does not modify user `PATH`. The skill tells Codex to call the installed launcher directly:

Windows PowerShell:

```powershell
& "$HOME\.wakewait\bin\wakewait.cmd" status
```

macOS / Linux:

```bash
"$HOME/.wakewait/bin/wakewait" status
```

If the launcher is missing, call the script directly with `node ~/.wakewait/scripts/wakewait.mjs status`.

## Usage

Check persisted waits:

Windows PowerShell:

```powershell
$ww = "$HOME\.wakewait\bin\wakewait.cmd"
& $ww status
```

macOS / Linux:

```bash
ww="$HOME/.wakewait/bin/wakewait"
"$ww" status
```

Sleep for a fixed time:

Windows PowerShell:

```powershell
& $ww sleep 60s
& $ww sleep 5m
& $ww sleep 1h
```

Completed sleep records are cleaned from state by default:

```powershell
& $ww sleep 10m --keep-record
```

Use `--keep-record` only when you want to inspect the completed sleep task later.

macOS / Linux:

```bash
"$ww" sleep 60s
"$ww" sleep 5m
"$ww" sleep 1h
```

WakeWait CLI records the sleep start time internally before waiting, then uses local wall-clock time for status and recovery. Use background mode when you need the wait to continue after the command returns.

Windows PowerShell:

```powershell
& $ww sleep 30m --background --on-ready "codex `"check logs/train.log and summarize progress`""
```

macOS / Linux:

```bash
"$ww" sleep 30m --background --on-ready "codex \"check logs/train.log and summarize progress\""
```

Wait for a file:

Windows PowerShell:

```powershell
& $ww wait-for --file outputs/done.json --every 5m --timeout 6h --background --on-ready "codex `"read outputs/done.json and summarize metrics`""
```

macOS / Linux:

```bash
"$ww" wait-for --file outputs/done.json --every 5m --timeout 6h --background --on-ready "codex \"read outputs/done.json and summarize metrics\""
```

Wait for a log rule:

Windows PowerShell:

```powershell
& $ww wait-for --contains logs/train.log "Evaluation complete" --every 5m --timeout 6h --background
```

macOS / Linux:

```bash
"$ww" wait-for --contains logs/train.log "Evaluation complete" --every 5m --timeout 6h --background
```

Run fixed health rules while waiting:

Windows PowerShell:

```powershell
& $ww wait-for --file outputs/done.json --every 5m --timeout 6h --background --health-log logs/train.log
```

macOS / Linux:

```bash
"$ww" wait-for --file outputs/done.json --every 5m --timeout 6h --background --health-log logs/train.log
```

Cancel one wait or all waits:

Windows PowerShell:

```powershell
& $ww cancel <id>
& $ww cancel all
```

macOS / Linux:

```bash
"$ww" cancel <id>
"$ww" cancel all
```

Useful flags:

| Flag | Purpose |
| --- | --- |
| `--background` | Optional background worker that continues after the CLI command exits |
| `--keep-record` | Preserve a completed sleep record instead of cleaning it after wake |
| `--on-ready "<command>"` | Optional command to run after sleep wakes, a condition succeeds, or a timeout occurs |
| `--file <path>` | Succeed when a file exists |
| `--contains <path> <text>` | Succeed when a file contains fixed text |
| `--condition "<command>"` | Succeed when a shell command exits 0 |
| `--health-log <path>` | Periodically scan a log with fixed built-in failure rules such as OOM, traceback, NaN/Inf loss, killed process |
| `--health-every 30m` | Frequency for fixed health-rule scans when `--health-log` is set |
| `--state <path>` | Store or inspect wait state somewhere other than `.codex-wait/tasks.json` |

## Optional Slash Commands

WakeWait works without host patching. If you use a Pi-compatible runtime and want `/sleep` and `/wait-for` slash commands, run:

Windows PowerShell:

```powershell
& $ww patch --root <pi-coding-agent-or-node_modules-path>
```

macOS / Linux:

```bash
"$ww" patch --root <pi-coding-agent-or-node_modules-path>
```

The patch is optional. It only modifies detected Pi runtime files and writes backups into `~/.wakewait/backups` for uninstall.

## Uninstall With Codex

Give Codex this prompt:

```text
Uninstall WakeWait from my local Codex setup.

Use the WakeWait uninstall script from ~/.wakewait, remove installed WakeWait skills, restore backed-up optional runtime files, verify the WakeWait launcher path is gone, and keep state only if I ask.
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
