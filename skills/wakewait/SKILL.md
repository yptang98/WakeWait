---
name: wakewait
description: Efficient local waiting for Codex using native shell sleep, WakeWait state files, and deterministic if/else wait rules. Use when the user asks Codex to wait, sleep, pause, poll for a file or log rule, wait for training/download/evaluation/queue/remote work, reduce model calls during idle time, or resume/cancel persisted wait state after interruption.
---

# WakeWait

Use WakeWait to make waiting cheap and quiet. The core idea is simple:

- For short foreground waits, run the host shell's native sleep command.
- For persisted waits, record start time and target time in local state, then sleep locally.
- For `wait-for`, loop locally over a fixed rule such as file exists, file contains text, or command exits 0.
- Do not call the model during the wait loop. Only return to the model after the wait is done, timed out, cancelled, or a fixed health rule fails.

## Fast Path

Use native shell sleep for simple foreground waits, especially seconds or a few minutes.

PowerShell:

```powershell
Start-Sleep -Seconds 60; Get-Date -Format o
```

POSIX shell:

```bash
sleep 60; date -Iseconds
```

This is the preferred path for "wait 60 seconds", "sleep 5 minutes", "pause and tell me the time", or any pure time delay that does not need background recovery or persisted state.

## WakeWait CLI Purpose

Use the `wakewait` CLI when native foreground sleep is not enough:

- The wait should keep state in `.codex-wait/tasks.json`.
- The wait may be interrupted and later resumed by checking elapsed time.
- A background process should continue waiting after the CLI exits.
- A fixed readiness rule should be polled without model calls.
- A final `--on-ready` command should run after success, timeout, or fixed health failure.

WakeWait CLI is still just local waiting. It is not responsible for choosing clever intervals or doing intelligent diagnosis.

## Persisted Sleep

Use `wakewait sleep` when state or background recovery matters:

```bash
wakewait sleep 30m --background --on-ready "<resume command>"
```

If the session is interrupted, run:

```bash
wakewait status
```

Use the reported remaining/overdue time to decide whether to sleep again, inspect outputs, or continue.

## Rule Waits

Prefer the simplest deterministic rule:

```bash
wakewait wait-for --file outputs/done.json --every 5m --timeout 6h --background
wakewait wait-for --contains logs/train.log "Evaluation complete" --every 5m --timeout 6h --background
wakewait wait-for --condition "python scripts/check_queue_empty.py" --every 10m --timeout 6h --background
```

Rules:

- `--file <path>` succeeds when the path exists.
- `--contains <path> <text>` succeeds when the file contains fixed text.
- `--condition <command>` succeeds when the shell command exits with code 0.
- Always include `--timeout`; do not poll forever.
- Use a polling interval that matches the expected cadence.

## Fixed Health Rules

Use fixed health checks only when helpful:

```bash
wakewait wait-for --file outputs/done.json --every 5m --timeout 6h --background --health-log logs/train.log
```

`--health-log` scans built-in failure patterns such as CUDA OOM, generic OOM, NaN/Inf loss, traceback, runtime errors, killed process, and segmentation fault. It does not ask the model to judge health.

## Interval Advice

The agent should choose intervals pragmatically:

- Early uncertain stage: short checks, such as 30s to 2m.
- Stable training/download stage: longer checks, such as 5m to 30m.
- Known checkpoint/eval cadence: check shortly after the expected artifact time.
- Repeated healthy waits: lengthen the interval rather than adding model review.

This is advice for agent behavior, not a responsibility of the WakeWait CLI.

## Before Waiting

Briefly state what will happen:

- The job or task being waited on.
- The native sleep duration or fixed wait rule.
- Whether local state will be persisted.
- The timeout or next expected check.
