---
name: wakewait
description: Default efficient waiting skill for Codex using the WakeWait CLI, wall-clock state files, and deterministic if/else wait rules. Use this skill first whenever the user asks Codex to sleep, wait, pause, poll, wait for a file/log/command, wait for training/download/evaluation/queue/remote work, reduce model calls during idle time, or resume/cancel persisted wait state after interruption. Prefer WakeWait over raw shell sleep unless the user explicitly asks for a bare native sleep command.
---

# WakeWait

Use WakeWait to make waiting cheap and quiet. The core idea is simple:

- Treat WakeWait as the default for sleep/wait/poll tasks.
- Use the installed WakeWait CLI for fixed time waits.
- Before sleeping, record `startedAt`, `wakeAt`, and task state in `.codex-wait/tasks.json`.
- Sleep locally with a lightweight timer that behaves like native sleep and does not call the model.
- For `wait-for`, loop locally over a fixed rule such as file exists, file contains text, or command exits 0.
- Do not call the model during the wait loop. Only return to the model after the wait is done, timed out, cancelled, or a fixed health rule fails.

## CLI Path

Do not ask the user to add WakeWait to `PATH`. Prefer the installed launcher path:

PowerShell:

```powershell
& "$HOME\.wakewait\bin\wakewait.cmd" status
```

POSIX shell:

```bash
"$HOME/.wakewait/bin/wakewait" status
```

If the launcher is missing, call the script directly with Node:

```bash
node "$HOME/.wakewait/scripts/wakewait.mjs" status
```

It is fine to use plain `wakewait` only when the current shell already resolves it.

## Default Policy

Prefer WakeWait when the task is about waiting:

- Use WakeWait for "sleep 60 seconds", "wait 10 minutes", "check again later", and similar fixed waits.
- Use WakeWait `wait-for` for file existence, log text, or command-success readiness checks.
- Use direct shell `Start-Sleep`, `sleep`, or Python `time.sleep` only when the user explicitly asks for that bare native command or WakeWait is not installed.
- Do not add WakeWait to the user `PATH`; call the installed launcher directly.

## Sleep

Use the WakeWait CLI for fixed foreground waits:

```powershell
& "$HOME\.wakewait\bin\wakewait.cmd" sleep 60s
& "$HOME\.wakewait\bin\wakewait.cmd" sleep 5m
& "$HOME\.wakewait\bin\wakewait.cmd" sleep 1h
```

Use background mode only when the wait should continue after the command returns:

```powershell
& "$HOME\.wakewait\bin\wakewait.cmd" sleep 30m --background --on-ready "<resume command>"
```

WakeWait intentionally keeps sleep primitive: it writes state first, waits locally, and checks real wall-clock time later. If a one-hour wait is interrupted after 30 minutes and Codex restarts two hours later, `wakewait status` should report that the original target time has already passed.

Check persisted sleep state:

```powershell
& "$HOME\.wakewait\bin\wakewait.cmd" status
```

The overhead versus direct shell sleep is intentionally small: one CLI process, one state write before the wait, and a final state update after wake. There are no model calls and no periodic model messages while sleeping.

## WakeWait CLI Purpose

Use the `wakewait` CLI to provide a consistent local waiting surface:

- The wait should keep state in `.codex-wait/tasks.json`.
- The wait may be interrupted and later resumed by checking elapsed time.
- A background process should continue waiting after the CLI exits.
- A fixed readiness rule should be polled without model calls.
- A final `--on-ready` command should run after success, timeout, or fixed health failure.

WakeWait CLI is still just local waiting. It is not responsible for choosing clever intervals or doing intelligent diagnosis.

## Rule Waits

Prefer the simplest deterministic rule:

```bash
"$HOME/.wakewait/bin/wakewait" wait-for --file outputs/done.json --every 5m --timeout 6h --background
"$HOME/.wakewait/bin/wakewait" wait-for --contains logs/train.log "Evaluation complete" --every 5m --timeout 6h --background
"$HOME/.wakewait/bin/wakewait" wait-for --condition "python scripts/check_queue_empty.py" --every 10m --timeout 6h --background
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
"$HOME/.wakewait/bin/wakewait" wait-for --file outputs/done.json --every 5m --timeout 6h --background --health-log logs/train.log
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
- The WakeWait sleep duration or fixed wait rule.
- Whether local state will be persisted.
- The timeout or next expected check.
