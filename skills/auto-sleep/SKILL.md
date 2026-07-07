---
name: auto-sleep
description: Automatically decide when a long-running training, download, upload, queue, evaluation, remote job, or shell command should be deferred instead of keeping the model active. Use when Codex has started or observed work that is likely to take minutes or hours, when repeated polling would waste model time, or when persisted wait state should be checked after an interruption.
---

# Auto Sleep

Use this skill as the policy layer for automatic waiting. It must not introduce a new `/auto-sleep` command or replace existing behavior. Choose the existing `/sleep` or `/wait-for` runtime commands when waiting is the right next action.

If both `auto-sleep` and `deferred-wait` apply, use `auto-sleep` to decide whether to defer and use `deferred-wait` as the mechanism reference for exact `/sleep` or `/wait-for` syntax.

## First Check

Before starting a new wait, run `pi-wait-patch status` when either is true:

- `.codex-wait/tasks.json` exists in the current project.
- The current task mentions resuming, interruption, previous wait, training progress, downloads, queues, or long-running jobs.

If a persisted task is overdue, inspect the relevant condition, logs, or outputs instead of sleeping again blindly. If a task is still running with meaningful time remaining, continue from that state rather than creating a duplicate wait.

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

Prefer `/wait-for` when a concrete condition can be checked:

```text
/wait-for --condition "<shell command>" --every <duration> --timeout <duration> --persist --review-every 30m --review "<health checks>" then <success action> else <timeout diagnosis>
```

Use `/sleep` only when there is no reliable condition:

```text
/sleep --persist <duration> then <specific resume action>
```

For training, downloads, queues, and remote jobs longer than about 10 minutes, prefer `--persist`. For waits longer than about 30 minutes, keep health reviews enabled unless the condition is low-risk.

Use `--background` only when the user explicitly wants the wait to continue after the CLI exits. It implies `--persist` and starts a detached worker. Do not add it by default.

```text
/wait-for --condition "<shell command>" --every 5m --timeout 6h --background --review-every 30m then <resume prompt> else <timeout prompt>
```

If a custom recovery command is needed, add `--on-ready "<command>"`. Otherwise Feynman-backed runtimes use the saved resume prompt when possible; generic runtimes mark the task `ready` for `pi-wait-patch status`.

## Condition Heuristics

Use robust, cheap checks:

- Output file exists: `python -c "from pathlib import Path; raise SystemExit(0 if Path('outputs/done.json').exists() else 1)"`
- Log contains completion marker: `python -c "from pathlib import Path; p=Path('logs/train.log'); raise SystemExit(0 if p.exists() and 'Evaluation complete' in p.read_text(errors='ignore') else 1)"`
- Directory has result files: `python -c "from pathlib import Path; raise SystemExit(0 if any(Path('outputs').glob('*.json')) else 1)"`

Use platform-appropriate shell syntax. On Windows or mixed environments, prefer short Python one-liners over POSIX-only `test` or `grep`.

## Review Prompt

Make `--review` concrete. Name the logs, process, host, tmux session, expected progress signal, and likely failure modes.

Good:

```text
--review "tail logs/train.log; check for OOM, CUDA errors, NaN loss, repeated identical progress, or missing checkpoints"
```

Weak:

```text
--review "check if okay"
```

## User Status

Before invoking `/sleep` or `/wait-for`, briefly state:

- What is still running.
- Which condition or delay will be used.
- Whether the wait is persisted.
- When health reviews or timeout will happen.

Avoid blocking waits such as Python `time.sleep()` or shell `sleep` inside a tool call when `/sleep` or `/wait-for` is available.
