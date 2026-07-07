---
name: deferred-wait
description: Defer long-running work with WakeWait's independent local sleep, wait-for-condition, persisted status/cancel, optional background recovery, and periodic health-review flows. Use when waiting for training, evaluation, downloads, uploads, queues, remote jobs, checkpoint creation, dataset preparation, file creation, command success, or repeated status polling would otherwise keep the model active.
---

# Deferred Wait

Use WakeWait when the useful next step is time passing or a condition becoming true rather than more reasoning. WakeWait is a standalone local CLI. It provides:

- `wakewait sleep` for timed waits.
- `wakewait wait-for` for condition polling.
- `wakewait status` and `wakewait cancel` for persisted wait state.
- `wakewait patch` as an optional Pi runtime integration that can add `/sleep` and `/wait-for` slash commands.

If the host CLI already exposes `/sleep` or `/wait-for`, those commands are usually more ergonomic because the host can pause and resume the agent session directly. Otherwise use the `wakewait` CLI.

## Decision Rule

Prefer deferred sleep when all are true:

- A background process, remote job, download, upload, queue, or training run is already started.
- The next meaningful observation is expected later, not immediately.
- Polling now would likely produce the same incomplete status.
- Sleeping will not hide a failure that should be handled now.

Do not sleep when:

- The user asked for immediate status only.
- A command is actively streaming and needs intervention.
- The next check is less than about 30 seconds away.
- You can make useful progress now, such as inspecting existing logs, preparing scripts, or fixing an observed error.
- The task is high-risk and needs user confirmation before leaving it unattended.

## Timed Sleep

Use a host slash command if available:

```text
/sleep <duration> then <resume prompt>
```

Otherwise use WakeWait:

```bash
wakewait sleep <duration> --background --on-ready "<resume command>"
```

Examples:

```bash
wakewait sleep 20m --background --on-ready "codex \"check the latest training logs and summarize next steps\""
wakewait sleep "until 02:00" --background --on-ready "codex \"verify the download completed and report failed files\""
```

Choose a duration from the evidence:

- Known ETA or queue delay: sleep until just after the ETA.
- Training/eval with periodic checkpoints: sleep until shortly after the next expected checkpoint or validation interval.
- Download or data prep with measurable progress: estimate from current throughput and add a small buffer.
- Unknown runtime: choose a conservative first interval, usually 5-15 minutes, then reassess.
- Very long jobs: use staged checks rather than one huge delay; keep each wait under 7 days.

## Conditional Wait

Use a host slash command if available:

```text
/wait-for --condition "<shell command>" --every <duration> --timeout <duration> [--persist] [--review-every <duration>] [--review "<health-check prompt>"] then <success prompt> else <timeout prompt>
```

Otherwise use WakeWait:

```bash
wakewait wait-for --condition "<shell command>" --every <duration> --timeout <duration> --background --review-every 30m --review "<health-check prompt>" --on-ready "<resume command>"
```

Examples:

```bash
wakewait wait-for --condition "python -c \"from pathlib import Path; raise SystemExit(0 if Path('outputs/done.json').exists() else 1)\"" --every 2m --timeout 1h --background --on-ready "codex \"read outputs/done.json and summarize the result\""
wakewait wait-for --condition "python scripts/check_queue_empty.py" --every 10m --timeout 6h --background --on-ready "codex \"start the deferred eval job\"" --on-review "codex \"check queue health and report errors only\""
```

Condition rules:

- The condition succeeds when the shell command exits with code 0.
- Always include `--timeout`; do not poll forever.
- Use `--every` values that match the expected cadence. Avoid busy polling.
- For waits longer than about 30 minutes, keep the default health review or set `--review-every` explicitly.
- Use `--review` to record which logs, tmux sessions, queues, or metrics should be inspected.
- Use `--on-review "<command>"` only when an external command should run during background health reviews.
- Use `--review-every off` only when the condition is low-risk and intermediate failures do not need diagnosis.
- Quote multi-word conditions.
- Conditions run in the local shell. For portable file checks, prefer short Python one-liners over POSIX-only commands when the user's machine may be Windows.

## Persistent State

WakeWait writes task state to `.codex-wait/tasks.json` in the current working directory unless `PI_WAIT_STATE_PATH`, `CODEX_WAIT_STATE_PATH`, or `--state` sets another path.

Useful commands:

```bash
wakewait status
wakewait cancel <id>
wakewait cancel all
```

If a task is overdue or marked `review due` after an interruption, inspect the condition/logs instead of blindly sleeping again. A live wait loop exits when it next observes that its task was cancelled.

## Resume Prompt

The resume command or prompt must be specific enough to continue without relying on hidden memory. Include:

- What to inspect.
- Where the process is running if known, such as tmux session, working directory, log path, or host.
- Success criteria.
- What to do if still running or failed.

Good:

```text
check tmux session train-a on GPU22, tail logs/train.log, report loss/checkpoint status, and wait again for 30m if it is still healthy and unfinished
```

Weak:

```text
continue
```
