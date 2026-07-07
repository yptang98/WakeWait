---
name: auto-sleep
description: Automatically decide when to wait, sleep, pause, or defer work without keeping the model active. Use when the user asks Codex to wait/sleep for seconds or minutes, when a long-running training/download/upload/queue/evaluation/remote job is running, when repeated polling would waste model time, or when persisted wait state should be checked after an interruption.
---

# Auto Sleep

Use this skill as the policy layer for automatic waiting. It must not introduce a new `/auto-sleep` command or replace existing behavior. Decide whether waiting is appropriate, then choose the lightest mechanism.

## Fast Path

For simple foreground waits, use the host shell directly. This is the default for "wait 60 seconds", "sleep 5 minutes", "pause and tell me the time", or any short pure time delay that does not need persistence.

PowerShell:

```powershell
Start-Sleep -Seconds 60; Get-Date -Format o
```

POSIX shell:

```bash
sleep 60; date -Iseconds
```

Use this native path for short waits because it is already installed, obvious in the CLI, does not call the model while waiting, and avoids WakeWait setup friction on a new machine.

Prefer a host-native `/sleep` or `/wait-for` command when it is visibly available in the current CLI. Otherwise use the independent WakeWait CLI. Keep waiting deterministic so the model is not called during the wait loop:

```bash
wakewait sleep 30m --background --on-ready "<command>"
wakewait wait-for --file outputs/done.json --every 5m --timeout 6h --background
```

## First Check

Before starting a new wait, run `wakewait status` when either is true:

- `.codex-wait/tasks.json` exists in the current project.
- The current task mentions resuming, interruption, previous wait, training progress, downloads, queues, or long-running jobs.

If a persisted task is overdue or marked `health_failed`, inspect the relevant condition, logs, tmux session, process, or outputs before sleeping again. If a task is still running with meaningful time remaining, continue from that state instead of creating a duplicate wait.

Do not run `wakewait status` before a simple native sleep unless there is evidence of persisted WakeWait state.

## Auto-Sleep Decision

Automatically defer when all are true:

- A background job, training run, evaluation, download, upload, queue, or remote command is already running or has just been launched.
- The next useful observation is expected after at least about 30 seconds.
- There is no useful local work to do immediately.
- The user did not ask for immediate status only and did not forbid waiting.

Do not defer when:

- A command is still actively streaming in the current tool call.
- The next check is under about 30 seconds away.
- Logs already show an error that should be diagnosed now.
- User confirmation is needed before leaving work unattended.
- The wait would hide a risky operation, destructive command, or credential prompt.

## Choose Command

Keep simple timed waits simple. For short foreground delays, prefer native shell sleep over `wakewait sleep`. Use `wakewait sleep` only when background recovery, persisted state, or an explicit `--on-ready` command is useful.

Prefer simple rules when they can decide readiness:

```bash
wakewait wait-for --file <path> --every <duration> --timeout <duration> --background
wakewait wait-for --contains <path> "<fixed text>" --every <duration> --timeout <duration> --background
wakewait wait-for --condition "<shell command>" --every <duration> --timeout <duration> --background
```

Use timed sleep when there is no reliable condition, or when the user simply asked to pause and resume later:

```bash
wakewait sleep <duration> --background --on-ready "<specific resume command>"
```

For training, downloads, queues, and remote jobs longer than about 10 minutes, keep persisted state; WakeWait does this by default. Health checks belong to `wait-for`, not plain `sleep`, and should use fixed rules such as `--health-log logs/train.log`.

Use `--background` only when the user wants the wait to continue after the current CLI command exits. It is not required for a host-native slash command that already pauses and resumes the agent session.

## Condition Heuristics

Use robust, cheap checks in this order:

- Output file exists: `wakewait wait-for --file outputs/done.json --every 5m --timeout 6h --background`
- Log contains completion marker: `wakewait wait-for --contains logs/train.log "Evaluation complete" --every 5m --timeout 6h --background`
- Directory has result files: `python -c "from pathlib import Path; raise SystemExit(0 if any(Path('outputs').glob('*.json')) else 1)"`

Use platform-appropriate shell syntax. On Windows or mixed environments, prefer short Python one-liners over POSIX-only `test` or `grep`.

## Fixed Health Rules

Use `--health-log <path>` when the wait should fail early on fixed failure patterns. WakeWait scans for built-in rules such as CUDA OOM, generic OOM, NaN/Inf loss, traceback, runtime errors, killed process, and segmentation fault.

Do not call the model for periodic health reviews. The point is to reduce model calls and avoid adding repeated status summaries to context.

```bash
wakewait wait-for --file outputs/done.json --every 5m --timeout 6h --background --health-log logs/train.log
```

## User Status

Before invoking WakeWait or a host sleep command, briefly state:

- What is still running.
- Which condition or delay will be used.
- Where the wait state will be visible.
- Which fixed health log, if any, will be scanned.
