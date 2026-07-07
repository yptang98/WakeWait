---
name: deferred-wait
description: Decide when to defer long-running work with Feynman's local sleep/resume, wait-for-condition, and periodic health-review flows. Use when waiting for training, evaluation, downloads, uploads, queues, remote jobs, long shell commands, checkpoint creation, dataset preparation, file creation, command success, or repeated status polling would otherwise keep the model active.
---

# Deferred Wait

Use Feynman's local `/sleep` and `/wait-for` commands when the useful next step is time passing or a condition becoming true rather than more reasoning.

For long waits, `/wait-for` can wake the model periodically for health reviews while the local polling loop keeps running. The default review cadence is 30 minutes. Use `--persist` for waits that should survive session interruptions as inspectable state.

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

## Choose The Mechanism

Use `/wait-for` when there is a concrete local condition to poll, such as a file appearing, a command succeeding, a log line existing, or an output directory becoming non-empty.

Use `/sleep` when there is no reliable condition and the next check should happen after a fixed interval or wall-clock time.

Prefer `/wait-for` over repeated `/sleep` when a shell condition is easy to express.

## Timed Sleep

Use the REPL command form:

```text
/sleep <duration> then <resume prompt>
```

Examples:

```text
/sleep 20m then check whether the training job finished, inspect the latest logs, and summarize next steps
/sleep 2h then check GPU22 tmux status and evaluate the newest checkpoint if one exists
/sleep until 02:00 then verify the download completed and report any failed files
```

Choose a duration from the evidence:

- Known ETA or queue delay: sleep until just after the ETA.
- Training/eval with periodic checkpoints: sleep until shortly after the next expected checkpoint or validation interval.
- Download or data prep with measurable progress: estimate from current throughput and add a small buffer.
- Unknown runtime: choose a conservative first interval, usually 5-15 minutes, then reassess.
- Very long jobs: use staged checks rather than one huge delay; keep each sleep under 7 days.

## Conditional Wait

Use the REPL command form:

```text
/wait-for --condition "<shell command>" --every <duration> --timeout <duration> [--persist] [--review-every <duration>] [--review "<health-check prompt>"] then <success prompt> else <timeout prompt>
```

Examples:

```text
/wait-for --condition "test -f outputs/done.json" --every 2m --timeout 1h then read outputs/done.json and summarize the result else inspect logs and explain why the output did not appear
/wait-for --condition "grep -q 'Evaluation complete' logs/train.log" --every 5m --timeout 3h --persist --review-every 30m --review "tail logs/train.log and check for CUDA, OOM, NaN, or stalled progress" then parse the final metric from logs/train.log else tail logs/train.log and report current progress
/wait-for --condition "python scripts/check_queue_empty.py" --every 10m --timeout 6h then start the deferred eval job else report that the queue did not clear
```

Condition rules:

- The condition succeeds when the shell command exits with code 0.
- Always include `--timeout`; do not poll forever.
- Use `--every` values that match the expected cadence. Avoid busy polling.
- For waits longer than about 30 minutes, keep the default health review or set `--review-every` explicitly.
- For waits that may be interrupted by terminal restarts, use `--persist`. On resume, run `pi-wait-patch status` from the project directory before starting a new wait.
- Use `--review` to tell the model which logs, tmux sessions, queues, or metrics to inspect during health checks.
- Use `--review-every off` only when the condition is low-risk and intermediate failures do not need diagnosis.
- Quote multi-word conditions.
- Include an `else` prompt when failure or timeout needs diagnosis.
- Conditions run in the local shell. For portable file checks, prefer short Python one-liners over POSIX-only commands when the user's machine may be Windows.

Persistent wait state:

- `--persist` writes task state to `.codex-wait/tasks.json` in the current working directory unless `PI_WAIT_STATE_PATH` or `CODEX_WAIT_STATE_PATH` is set.
- `pi-wait-patch status` shows running, overdue, cancelled, satisfied, and timed-out waits with remaining time.
- If a task is overdue after an interruption, inspect the condition/logs instead of blindly sleeping again.
- `pi-wait-patch cancel <id>` marks a task cancelled; a live wait loop exits when it next checks the state file.
- `pi-wait-patch cancel all` cancels every persisted wait in that state file.
- `--background` is optional and not default. It implies `--persist`, starts a detached worker, and allows the wait to continue after the CLI exits.
- `--on-ready "<command>"` is optional with `--background`; use it only when a specific recovery command should run after wake/success/timeout.

## Resume Prompt

The `then` prompt must be specific enough to continue without relying on hidden memory. Include:

- What to inspect.
- Where the process is running if known, such as tmux session, working directory, log path, or host.
- Success criteria.
- What to do if still running or failed.

Good:

```text
/sleep 30m then inspect tmux session train-a on GPU22, tail logs/train.log, report loss/checkpoint status, and sleep again for 30m if it is still healthy and unfinished
```

Weak:

```text
/sleep 30m then continue
```

## Before Sleeping

Leave a short user-visible status before invoking sleep:

- State what is still running.
- State when the next check will happen.
- State the exact resume action.

Avoid blocking shell sleeps such as `sleep 3600` or Python `time.sleep()` inside a tool call when `/sleep` or `/wait-for` is available; those keep the agent turn occupied instead of using Feynman's local pause/resume flow.
