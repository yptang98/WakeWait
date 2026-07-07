---
name: auto-sleep
description: Automatically decide when a long-running training, download, upload, queue, evaluation, remote job, or shell command should be deferred with WakeWait instead of keeping the model active. Use when Codex has started or observed work likely to take minutes or hours, repeated polling would waste model time, or persisted wait state should be checked after an interruption.
---

# Auto Sleep

Use this skill as the policy layer for automatic waiting. It must not introduce a new `/auto-sleep` command or replace existing behavior. Decide whether waiting is appropriate, then use `deferred-wait` for the exact mechanism.

Prefer a host-native `/sleep` or `/wait-for` command when it is visibly available in the current CLI. Otherwise use the independent WakeWait CLI:

```bash
wakewait sleep 30m --background --on-ready "<command>"
wakewait wait-for --condition "<shell command>" --every 5m --timeout 6h --background
```

## First Check

Before starting a new wait, run `wakewait status` when either is true:

- `.codex-wait/tasks.json` exists in the current project.
- The current task mentions resuming, interruption, previous wait, training progress, downloads, queues, or long-running jobs.

If a persisted task is overdue or marked `review due`, inspect the relevant condition, logs, tmux session, process, or outputs before sleeping again. If a task is still running with meaningful time remaining, continue from that state instead of creating a duplicate wait.

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

Prefer condition polling when a cheap command can decide readiness:

```bash
wakewait wait-for --condition "<shell command>" --every <duration> --timeout <duration> --background --review-every 30m --review "<health checks>"
```

Use timed sleep only when there is no reliable condition:

```bash
wakewait sleep <duration> --background --on-ready "<specific resume command>"
```

For training, downloads, queues, and remote jobs longer than about 10 minutes, keep persisted state; WakeWait does this by default. For waits longer than about 30 minutes, keep health reviews enabled unless the condition is low-risk.

Use `--background` only when the user wants the wait to continue after the current CLI command exits. It is not required for a host-native slash command that already pauses and resumes the agent session.

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

Before invoking WakeWait or a host sleep command, briefly state:

- What is still running.
- Which condition or delay will be used.
- Where the wait state will be visible.
- When health reviews or timeout will happen.
