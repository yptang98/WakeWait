const SLEEP_SLASH_COMMAND_MARKER = '{ name: "sleep", description: "Sleep locally, optionally resuming with a prompt" }';
const WAIT_FOR_SLASH_COMMAND_MARKER = '{ name: "wait-for", description: "Poll a local condition, then resume with a prompt" }';

const WAIT_HELPER = `
const FEYNMAN_WAIT_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const FEYNMAN_WAIT_DEFAULT_EVERY_MS = 60 * 1000;
const FEYNMAN_WAIT_DEFAULT_REVIEW_EVERY_MS = 30 * 60 * 1000;
const FEYNMAN_WAIT_CONDITION_TIMEOUT_MS = 30 * 1000;
const FEYNMAN_WAIT_OUTPUT_LIMIT = 4000;
const FEYNMAN_WAIT_STATE_VERSION = 1;
const FEYNMAN_WAIT_STATE_DIR = ".codex-wait";
const FEYNMAN_WAIT_STATE_FILE = "tasks.json";

function splitFeynmanSleepContinuation(input) {
    const match = input.match(/\\s(?:then|--|=>)\\s/i);
    if (!match || match.index === undefined) {
        return { schedule: input.trim(), prompt: undefined };
    }
    return {
        schedule: input.slice(0, match.index).trim(),
        prompt: input.slice(match.index + match[0].length).trim() || undefined,
    };
}

function parseFeynmanWaitDuration(value) {
    const compact = value.trim().toLowerCase().replace(/\\s+/g, "");
    if (!compact) {
        return undefined;
    }
    const matches = [...compact.matchAll(/(\\d+(?:\\.\\d+)?)(ms|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)/g)];
    if (matches.length === 0 || matches.map((match) => match[0]).join("") !== compact) {
        return undefined;
    }
    const unitMs = {
        ms: 1,
        s: 1000,
        sec: 1000,
        secs: 1000,
        second: 1000,
        seconds: 1000,
        m: 60 * 1000,
        min: 60 * 1000,
        mins: 60 * 1000,
        minute: 60 * 1000,
        minutes: 60 * 1000,
        h: 60 * 60 * 1000,
        hr: 60 * 60 * 1000,
        hrs: 60 * 60 * 1000,
        hour: 60 * 60 * 1000,
        hours: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
    };
    return matches.reduce((total, match) => total + Number(match[1]) * unitMs[match[2]], 0);
}

function parseFeynmanSleepWakeTime(value, now = new Date()) {
    const trimmed = value.trim();
    const timeMatch = trimmed.match(/^(?:until\\s+)?(\\d{1,2}):(\\d{2})(?::(\\d{2}))?$/i);
    if (timeMatch) {
        const hours = Number(timeMatch[1]);
        const minutes = Number(timeMatch[2]);
        const seconds = timeMatch[3] ? Number(timeMatch[3]) : 0;
        if (hours > 23 || minutes > 59 || seconds > 59) {
            return undefined;
        }
        const wakeAt = new Date(now);
        wakeAt.setHours(hours, minutes, seconds, 0);
        if (wakeAt.getTime() <= now.getTime()) {
            wakeAt.setDate(wakeAt.getDate() + 1);
        }
        return wakeAt;
    }
    const isoCandidate = trimmed.replace(/^until\\s+/i, "").trim();
    const parsed = Date.parse(isoCandidate);
    if (!Number.isNaN(parsed)) {
        return new Date(parsed);
    }
    return undefined;
}

function parseFeynmanSleepCommand(text, now = new Date()) {
    let raw = text.replace(/^\\/sleep\\b/i, "").trim();
    if (!raw) {
        return { error: "Usage: /sleep [--persist] [--id <id>] <30s|5m|2h|until HH:MM|date> [then prompt]" };
    }
    let persist = false;
    let persistId;
    let background = false;
    let onReady;
    while (true) {
        const persistMatch = raw.match(/^--persist\\b\\s*/i);
        if (persistMatch) {
            persist = true;
            raw = raw.slice(persistMatch[0].length).trim();
            continue;
        }
        const backgroundMatch = raw.match(/^--background\\b\\s*/i);
        if (backgroundMatch) {
            background = true;
            persist = true;
            raw = raw.slice(backgroundMatch[0].length).trim();
            continue;
        }
        const idMatch = raw.match(/^--id\\s+(\\S+)\\s*/i);
        if (idMatch) {
            persistId = idMatch[1];
            raw = raw.slice(idMatch[0].length).trim();
            continue;
        }
        const onReadyMatch = raw.match(/^--on-ready\\s+(?:"([^"]*)"|'([^']*)'|(\\S+))\\s*/i);
        if (onReadyMatch) {
            onReady = onReadyMatch[1] ?? onReadyMatch[2] ?? onReadyMatch[3];
            background = true;
            persist = true;
            raw = raw.slice(onReadyMatch[0].length).trim();
            continue;
        }
        break;
    }
    const { schedule, prompt } = splitFeynmanSleepContinuation(raw);
    const durationMs = parseFeynmanWaitDuration(schedule);
    let wakeAt = durationMs === undefined ? parseFeynmanSleepWakeTime(schedule, now) : new Date(now.getTime() + durationMs);
    if (!wakeAt) {
        return { error: "Usage: /sleep [--persist] [--id <id>] <30s|5m|2h|until HH:MM|date> [then prompt]" };
    }
    const delayMs = wakeAt.getTime() - now.getTime();
    if (delayMs <= 0) {
        return { error: "Sleep target must be in the future." };
    }
    if (delayMs > FEYNMAN_WAIT_MAX_MS) {
        return { error: "Sleep duration is too long. Use 7 days or less." };
    }
    return { delayMs, wakeAt, prompt, persist, persistId, background, onReady };
}

function formatFeynmanWaitDuration(ms) {
    const totalSeconds = Math.max(1, Math.round(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (days) parts.push(\`\${days}d\`);
    if (hours) parts.push(\`\${hours}h\`);
    if (minutes) parts.push(\`\${minutes}m\`);
    if (seconds || parts.length === 0) parts.push(\`\${seconds}s\`);
    return parts.join(" ");
}

function feynmanSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function feynmanWaitStatePath(cwd) {
    return process.env.PI_WAIT_STATE_PATH || process.env.CODEX_WAIT_STATE_PATH || path.join(cwd, FEYNMAN_WAIT_STATE_DIR, FEYNMAN_WAIT_STATE_FILE);
}

function readFeynmanWaitState(cwd) {
    const statePath = feynmanWaitStatePath(cwd);
    try {
        const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
        return {
            path: statePath,
            state: {
                version: FEYNMAN_WAIT_STATE_VERSION,
                tasks: parsed && typeof parsed.tasks === "object" && parsed.tasks ? parsed.tasks : {},
            },
        };
    }
    catch {
        return { path: statePath, state: { version: FEYNMAN_WAIT_STATE_VERSION, tasks: {} } };
    }
}

function writeFeynmanWaitState(cwd, state) {
    const statePath = feynmanWaitStatePath(cwd);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ version: FEYNMAN_WAIT_STATE_VERSION, tasks: state.tasks ?? {} }, null, 2) + "\\n", "utf8");
}

function makeFeynmanWaitTaskId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function makeFeynmanWaitResumeConfig(cwd) {
    if (!process.env.FEYNMAN_BIN_PATH) {
        return undefined;
    }
    return {
        type: "feynman",
        node: process.env.FEYNMAN_NODE_EXECUTABLE || process.execPath,
        bin: process.env.FEYNMAN_BIN_PATH,
        cwd,
    };
}

function feynmanWaitPatchScriptPath() {
    if (process.env.PI_WAIT_PATCH_BIN || process.env.CODEX_WAIT_PATCH_BIN) {
        return process.env.PI_WAIT_PATCH_BIN || process.env.CODEX_WAIT_PATCH_BIN;
    }
    const wakewaitHome = process.env.WAKEWAIT_HOME || (process.env.USERPROFILE || process.env.HOME ? path.join(process.env.USERPROFILE || process.env.HOME, ".wakewait") : undefined);
    if (wakewaitHome) {
        const wakewaitScript = path.join(wakewaitHome, "scripts", "patch-pi-wait.mjs");
        if (fs.existsSync(wakewaitScript)) return wakewaitScript;
    }
    if (process.env.FEYNMAN_BIN_PATH) {
        return path.resolve(path.dirname(process.env.FEYNMAN_BIN_PATH), "..", "scripts", "patch-pi-wait.mjs");
    }
    return undefined;
}

function startFeynmanWaitBackgroundWorker(cwd, taskId) {
    const statePath = feynmanWaitStatePath(cwd);
    const scriptPath = feynmanWaitPatchScriptPath();
    let child;
    if (scriptPath && fs.existsSync(scriptPath)) {
        child = spawn(process.execPath, [scriptPath, "worker", taskId, "--state", statePath], {
            cwd,
            detached: true,
            stdio: "ignore",
            windowsHide: true,
        });
    }
    else {
        child = spawn("pi-wait-patch", ["worker", taskId, "--state", statePath], {
            cwd,
            detached: true,
            shell: true,
            stdio: "ignore",
            windowsHide: true,
        });
    }
    child.unref();
    return child.pid;
}

function upsertFeynmanWaitTask(cwd, task) {
    const { path: statePath, state } = readFeynmanWaitState(cwd);
    state.tasks[task.id] = {
        ...(state.tasks[task.id] ?? {}),
        ...task,
        updatedAt: new Date().toISOString(),
    };
    writeFeynmanWaitState(cwd, state);
    return statePath;
}

function getFeynmanWaitTask(cwd, id) {
    return readFeynmanWaitState(cwd).state.tasks[id];
}

function findFeynmanWaitKeyword(input, keyword) {
    let quote = "";
    let escaped = false;
    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === "\\\\") {
            escaped = true;
            continue;
        }
        if (quote) {
            if (char === quote) quote = "";
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (input.slice(i, i + keyword.length).toLowerCase() !== keyword) {
            continue;
        }
        const before = i === 0 ? " " : input[i - 1];
        const after = i + keyword.length >= input.length ? " " : input[i + keyword.length];
        if (/\\s/.test(before) && /\\s/.test(after)) {
            return i;
        }
    }
    return -1;
}

function splitFeynmanWaitKeyword(input, keyword) {
    const index = findFeynmanWaitKeyword(input, keyword);
    if (index === -1) {
        return { before: input.trim(), after: undefined };
    }
    return {
        before: input.slice(0, index).trim(),
        after: input.slice(index + keyword.length).trim() || undefined,
    };
}

function tokenizeFeynmanWaitArgs(input) {
    const tokens = [];
    let current = "";
    let quote = "";
    let escaped = false;
    let quoted = false;
    for (const char of input) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }
        if (char === "\\\\") {
            escaped = true;
            continue;
        }
        if (quote) {
            if (char === quote) {
                quote = "";
            }
            else {
                current += char;
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            quoted = true;
            continue;
        }
        if (/\\s/.test(char)) {
            if (current || quoted) {
                tokens.push({ value: current, quoted });
                current = "";
                quoted = false;
            }
            continue;
        }
        current += char;
    }
    if (quote) {
        return { error: "Unclosed quote in /wait-for command." };
    }
    if (escaped) {
        current += "\\\\";
    }
    if (current || quoted) {
        tokens.push({ value: current, quoted });
    }
    return { tokens };
}

function parseFeynmanWaitForOptions(optionsText) {
    const tokenized = tokenizeFeynmanWaitArgs(optionsText);
    if (tokenized.error) {
        return { error: tokenized.error };
    }
    const tokens = tokenized.tokens;
    let condition;
    let everyMs = FEYNMAN_WAIT_DEFAULT_EVERY_MS;
    let reviewEveryMs = FEYNMAN_WAIT_DEFAULT_REVIEW_EVERY_MS;
    let reviewPrompt;
    let persist = false;
    let persistId;
    let background = false;
    let onReady;
    let verbose = false;
    let timeoutMs;
    const positional = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i].value;
        if (token === "--condition" || token === "-c") {
            const next = tokens[++i];
            if (!next) return { error: "Usage: /wait-for --condition \\"<command>\\" --every 1m --timeout 1h then <prompt>" };
            condition = next.value;
            continue;
        }
        if (token === "--every" || token === "-e") {
            const next = tokens[++i];
            if (!next) return { error: "Missing duration after --every." };
            const parsed = parseFeynmanWaitDuration(next.value);
            if (!parsed || parsed < 1000) return { error: "--every must be at least 1s." };
            everyMs = parsed;
            continue;
        }
        if (token === "--review-every" || token === "--health-every") {
            const next = tokens[++i];
            if (!next) return { error: "Missing duration after --review-every." };
            const normalized = next.value.trim().toLowerCase();
            if (normalized === "off" || normalized === "none" || normalized === "never" || normalized === "0") {
                reviewEveryMs = undefined;
                continue;
            }
            const parsed = parseFeynmanWaitDuration(next.value);
            if (!parsed || parsed < 1000) return { error: "--review-every must be at least 1s, or off." };
            if (parsed > FEYNMAN_WAIT_MAX_MS) return { error: "--review-every is too long. Use 7 days or less." };
            reviewEveryMs = parsed;
            continue;
        }
        if (token === "--review" || token === "--health-check") {
            const next = tokens[++i];
            if (!next) return { error: "Missing prompt after --review." };
            reviewPrompt = next.value;
            continue;
        }
        if (token === "--persist") {
            persist = true;
            continue;
        }
        if (token === "--background") {
            background = true;
            persist = true;
            continue;
        }
        if (token === "--id") {
            const next = tokens[++i];
            if (!next) return { error: "Missing id after --id." };
            persistId = next.value;
            persist = true;
            continue;
        }
        if (token === "--on-ready") {
            const next = tokens[++i];
            if (!next) return { error: "Missing command after --on-ready." };
            onReady = next.value;
            background = true;
            persist = true;
            continue;
        }
        if (token === "--verbose" || token === "-v") {
            verbose = true;
            continue;
        }
        if (token === "--quiet" || token === "-q") {
            verbose = false;
            continue;
        }
        if (token === "--timeout" || token === "-t") {
            const next = tokens[++i];
            if (!next) return { error: "Missing duration after --timeout." };
            const parsed = parseFeynmanWaitDuration(next.value);
            if (!parsed || parsed <= 0) return { error: "--timeout must be a positive duration." };
            timeoutMs = parsed;
            continue;
        }
        positional.push(tokens[i].value);
    }
    if (!condition && positional.length > 0) {
        condition = positional.join(" ");
    }
    if (!condition) {
        return { error: "Usage: /wait-for --condition \\"<command>\\" --every 1m --timeout 1h then <prompt>" };
    }
    if (!timeoutMs) {
        return { error: "/wait-for requires --timeout so it cannot poll forever." };
    }
    if (timeoutMs > FEYNMAN_WAIT_MAX_MS) {
        return { error: "Wait timeout is too long. Use 7 days or less." };
    }
    return { condition, everyMs, timeoutMs, reviewEveryMs, reviewPrompt, persist, persistId, background, onReady, verbose };
}

function parseFeynmanWaitForCommand(text) {
    const raw = text.replace(/^\\/wait-for\\b/i, "").trim();
    if (!raw) {
        return { error: "Usage: /wait-for --condition \\"<command>\\" --every 1m --timeout 1h then <prompt> [else <prompt>]" };
    }
    const thenSplit = splitFeynmanWaitKeyword(raw, "then");
    const elseSplit = splitFeynmanWaitKeyword(thenSplit.after ?? "", "else");
    const parsedOptions = parseFeynmanWaitForOptions(thenSplit.before);
    if (parsedOptions.error) {
        return parsedOptions;
    }
    return {
        ...parsedOptions,
        successPrompt: elseSplit.before || undefined,
        timeoutPrompt: elseSplit.after,
    };
}

function appendFeynmanWaitOutput(output, chunk) {
    if (!chunk) return output;
    const combined = output + chunk.toString();
    return combined.length > FEYNMAN_WAIT_OUTPUT_LIMIT
        ? combined.slice(combined.length - FEYNMAN_WAIT_OUTPUT_LIMIT)
        : combined;
}

function runFeynmanWaitCondition(command, cwd) {
    return new Promise((resolve) => {
        const isWindows = process.platform === "win32";
        const child = isWindows
            ? spawn("cmd.exe", ["/d", "/s", "/c", command], { cwd, windowsHide: true })
            : spawn("sh", ["-c", command], { cwd });
        let output = "";
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ ...result, output: output.trim() });
        };
        const timer = setTimeout(() => {
            child.kill();
            finish({ ok: false, timedOut: true, exitCode: undefined });
        }, FEYNMAN_WAIT_CONDITION_TIMEOUT_MS);
        child.stdout?.on("data", (chunk) => {
            output = appendFeynmanWaitOutput(output, chunk);
        });
        child.stderr?.on("data", (chunk) => {
            output = appendFeynmanWaitOutput(output, chunk);
        });
        child.on("error", (error) => {
            output = appendFeynmanWaitOutput(output, error instanceof Error ? error.message : String(error));
            finish({ ok: false, timedOut: false, exitCode: undefined });
        });
        child.on("close", (code) => {
            finish({ ok: code === 0, timedOut: false, exitCode: code ?? undefined });
        });
    });
}

function buildFeynmanWaitReviewPrompt(parsed, attempt, startedAt, deadline, result) {
    const reason = result.timedOut ? "condition command timed out" : "exit " + (result.exitCode ?? "unknown");
    const lines = [
        "Run a brief health review for this deferred /wait-for task.",
        "Condition: " + parsed.condition,
        "Polling interval: " + formatFeynmanWaitDuration(parsed.everyMs),
        "Deadline: " + new Date(deadline).toLocaleString(),
        "Last attempt: " + attempt + " (" + reason + ")",
    ];
    if (result.output) {
        lines.push("Last condition output:\\n" + result.output);
    }
    if (parsed.reviewPrompt) {
        lines.push("User review instructions:\\n" + parsed.reviewPrompt);
    }
    lines.push("Inspect whether the underlying training, download, queue, or job appears healthy. Check relevant logs or status if needed. If there is a problem, explain it and take the next safe corrective step. If it is healthy but unfinished, say that briefly; the local wait loop will continue automatically.");
    return lines.join("\\n");
}

async function handleFeynmanSleepCommand(mode, text) {
    if (mode.session.isStreaming || mode.session.isCompacting || mode.session.isBashRunning) {
        mode.showWarning("Wait for the current operation to finish before sleeping.");
        return;
    }
    const parsed = parseFeynmanSleepCommand(text);
    if (parsed.error) {
        mode.showWarning(parsed.error);
        return;
    }
    const wakeText = parsed.wakeAt.toLocaleString();
    const cwd = mode.sessionManager.getCwd();
    const taskId = parsed.persist ? (parsed.persistId || makeFeynmanWaitTaskId("sleep")) : undefined;
    mode.editor.addToHistory?.(text);
    if (taskId) {
        const statePath = upsertFeynmanWaitTask(cwd, {
            id: taskId,
            kind: "sleep",
            status: "running",
            cwd,
            commandText: text,
            startedAt: new Date().toISOString(),
            wakeAt: parsed.wakeAt.toISOString(),
            deadlineAt: parsed.wakeAt.toISOString(),
            prompt: parsed.prompt,
            background: parsed.background,
            onReady: parsed.onReady,
            resume: makeFeynmanWaitResumeConfig(cwd),
        });
        mode.showStatus("Persistent sleep task " + taskId + " saved to " + statePath + ".");
        if (parsed.background) {
            const pid = startFeynmanWaitBackgroundWorker(cwd, taskId);
            upsertFeynmanWaitTask(cwd, {
                id: taskId,
                status: "background",
                workerPid: pid,
                workerStartedAt: new Date().toISOString(),
            });
            mode.showStatus("Background sleep task " + taskId + " started" + (pid ? " (pid " + pid + ")" : "") + ".");
            return;
        }
    }
    mode.showStatus(\`Sleeping for \${formatFeynmanWaitDuration(parsed.delayMs)}. Wake time: \${wakeText}\`);
    await feynmanSleep(parsed.delayMs);
    if (taskId && getFeynmanWaitTask(cwd, taskId)?.status === "cancelled") {
        mode.showWarning("Persistent sleep task " + taskId + " was cancelled.");
        return;
    }
    mode.showStatus(parsed.prompt ? \`Woke up. Resuming with scheduled prompt.\` : \`Woke up at \${new Date().toLocaleString()}.\`);
    if (taskId) {
        upsertFeynmanWaitTask(cwd, {
            id: taskId,
            status: "completed",
            completedAt: new Date().toISOString(),
        });
    }
    if (parsed.prompt) {
        mode.flushPendingBashComponents();
        await mode.session.prompt(parsed.prompt);
    }
}

async function handleFeynmanWaitForCommand(mode, text) {
    if (mode.session.isStreaming || mode.session.isCompacting || mode.session.isBashRunning) {
        mode.showWarning("Wait for the current operation to finish before waiting on a condition.");
        return;
    }
    const parsed = parseFeynmanWaitForCommand(text);
    if (parsed.error) {
        mode.showWarning(parsed.error);
        return;
    }
    mode.editor.addToHistory?.(text);
    const cwd = mode.sessionManager.getCwd();
    const startedAt = Date.now();
    const deadline = startedAt + parsed.timeoutMs;
    const deadlineText = new Date(deadline).toLocaleString();
    let attempt = 0;
    let nextReviewAt = parsed.reviewEveryMs ? startedAt + parsed.reviewEveryMs : undefined;
    const taskId = parsed.persist ? (parsed.persistId || makeFeynmanWaitTaskId("wait")) : undefined;
    if (taskId) {
        const statePath = upsertFeynmanWaitTask(cwd, {
            id: taskId,
            kind: "wait-for",
            status: "running",
            cwd,
            commandText: text,
            condition: parsed.condition,
            everyMs: parsed.everyMs,
            timeoutMs: parsed.timeoutMs,
            reviewEveryMs: parsed.reviewEveryMs,
            reviewPrompt: parsed.reviewPrompt,
            successPrompt: parsed.successPrompt,
            timeoutPrompt: parsed.timeoutPrompt,
            background: parsed.background,
            onReady: parsed.onReady,
            resume: makeFeynmanWaitResumeConfig(cwd),
            startedAt: new Date(startedAt).toISOString(),
            deadlineAt: new Date(deadline).toISOString(),
            nextCheckAt: new Date(startedAt).toISOString(),
            nextReviewAt: nextReviewAt ? new Date(nextReviewAt).toISOString() : undefined,
        });
        mode.showStatus("Persistent wait task " + taskId + " saved to " + statePath + ".");
        if (parsed.background) {
            const pid = startFeynmanWaitBackgroundWorker(cwd, taskId);
            upsertFeynmanWaitTask(cwd, {
                id: taskId,
                status: "background",
                workerPid: pid,
                workerStartedAt: new Date().toISOString(),
            });
            mode.showStatus("Background wait task " + taskId + " started" + (pid ? " (pid " + pid + ")" : "") + ".");
            return;
        }
    }
    const reviewText = parsed.reviewEveryMs ? \`, health review every \${formatFeynmanWaitDuration(parsed.reviewEveryMs)}\` : ", health reviews disabled";
    mode.showStatus(\`Waiting for condition every \${formatFeynmanWaitDuration(parsed.everyMs)}\${reviewText} until \${deadlineText}: \${parsed.condition}\`);
    while (Date.now() <= deadline) {
        if (taskId && getFeynmanWaitTask(cwd, taskId)?.status === "cancelled") {
            mode.showWarning("Persistent wait task " + taskId + " was cancelled.");
            return;
        }
        attempt++;
        const result = await runFeynmanWaitCondition(parsed.condition, cwd);
        if (result.ok) {
            const suffix = result.output ? \` Output: \${result.output}\` : "";
            mode.showStatus(\`Condition satisfied after attempt \${attempt}.\${suffix}\`);
            if (taskId) {
                upsertFeynmanWaitTask(cwd, {
                    id: taskId,
                    status: "satisfied",
                    completedAt: new Date().toISOString(),
                    attempts: attempt,
                    lastOutput: result.output,
                });
            }
            if (parsed.successPrompt) {
                mode.flushPendingBashComponents();
                await mode.session.prompt(parsed.successPrompt);
            }
            return;
        }
        const now = Date.now();
        if (now >= deadline) {
            break;
        }
        const reason = result.timedOut ? "condition command timed out" : \`exit \${result.exitCode ?? "unknown"}\`;
        const output = result.output ? \` Output: \${result.output}\` : "";
        if (nextReviewAt && now >= nextReviewAt) {
            mode.showStatus(\`Running scheduled wait health review.\${output}\`);
            mode.flushPendingBashComponents();
            await mode.session.prompt(buildFeynmanWaitReviewPrompt(parsed, attempt, startedAt, deadline, result));
            nextReviewAt = Date.now() + parsed.reviewEveryMs;
        }
        const afterReviewNow = Date.now();
        if (afterReviewNow >= deadline) {
            break;
        }
        const delay = Math.min(parsed.everyMs, nextReviewAt ? Math.max(0, nextReviewAt - afterReviewNow) : parsed.everyMs, deadline - afterReviewNow);
        if (taskId) {
            upsertFeynmanWaitTask(cwd, {
                id: taskId,
                status: "running",
                attempts: attempt,
                lastAttemptAt: new Date(now).toISOString(),
                lastExitCode: result.exitCode,
                lastTimedOut: result.timedOut,
                lastOutput: result.output,
                nextCheckAt: new Date(afterReviewNow + delay).toISOString(),
                nextReviewAt: nextReviewAt ? new Date(nextReviewAt).toISOString() : undefined,
            });
        }
        if (parsed.verbose) {
            mode.showStatus(\`Condition not met on attempt \${attempt} (\${reason}). Next check in \${formatFeynmanWaitDuration(delay)}.\${output}\`);
        }
        await feynmanSleep(delay);
    }
    mode.showWarning(\`Timed out waiting for condition after \${formatFeynmanWaitDuration(parsed.timeoutMs)}: \${parsed.condition}\`);
    if (taskId) {
        upsertFeynmanWaitTask(cwd, {
            id: taskId,
            status: "timed_out",
            completedAt: new Date().toISOString(),
            attempts: attempt,
        });
    }
    if (parsed.timeoutPrompt) {
        mode.flushPendingBashComponents();
        await mode.session.prompt(parsed.timeoutPrompt);
    }
}
`;

const WAIT_FOR_UPGRADE_HELPER = `
const FEYNMAN_WAIT_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const FEYNMAN_WAIT_DEFAULT_EVERY_MS = 60 * 1000;
const FEYNMAN_WAIT_DEFAULT_REVIEW_EVERY_MS = 30 * 60 * 1000;
const FEYNMAN_WAIT_CONDITION_TIMEOUT_MS = 30 * 1000;
const FEYNMAN_WAIT_OUTPUT_LIMIT = 4000;
const FEYNMAN_WAIT_STATE_VERSION = 1;
const FEYNMAN_WAIT_STATE_DIR = ".codex-wait";
const FEYNMAN_WAIT_STATE_FILE = "tasks.json";
const feynmanWaitSleep = typeof feynmanSleep === "function"
    ? feynmanSleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseFeynmanWaitDuration(value) {
    const compact = value.trim().toLowerCase().replace(/\\s+/g, "");
    if (!compact) {
        return undefined;
    }
    const matches = [...compact.matchAll(/(\\d+(?:\\.\\d+)?)(ms|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)/g)];
    if (matches.length === 0 || matches.map((match) => match[0]).join("") !== compact) {
        return undefined;
    }
    const unitMs = {
        ms: 1,
        s: 1000,
        sec: 1000,
        secs: 1000,
        second: 1000,
        seconds: 1000,
        m: 60 * 1000,
        min: 60 * 1000,
        mins: 60 * 1000,
        minute: 60 * 1000,
        minutes: 60 * 1000,
        h: 60 * 60 * 1000,
        hr: 60 * 60 * 1000,
        hrs: 60 * 60 * 1000,
        hour: 60 * 60 * 1000,
        hours: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
    };
    return matches.reduce((total, match) => total + Number(match[1]) * unitMs[match[2]], 0);
}

function formatFeynmanWaitDuration(ms) {
    const totalSeconds = Math.max(1, Math.round(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (days) parts.push(\`\${days}d\`);
    if (hours) parts.push(\`\${hours}h\`);
    if (minutes) parts.push(\`\${minutes}m\`);
    if (seconds || parts.length === 0) parts.push(\`\${seconds}s\`);
    return parts.join(" ");
}

function feynmanWaitStatePath(cwd) {
    return process.env.PI_WAIT_STATE_PATH || process.env.CODEX_WAIT_STATE_PATH || path.join(cwd, FEYNMAN_WAIT_STATE_DIR, FEYNMAN_WAIT_STATE_FILE);
}

function readFeynmanWaitState(cwd) {
    const statePath = feynmanWaitStatePath(cwd);
    try {
        const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
        return {
            path: statePath,
            state: {
                version: FEYNMAN_WAIT_STATE_VERSION,
                tasks: parsed && typeof parsed.tasks === "object" && parsed.tasks ? parsed.tasks : {},
            },
        };
    }
    catch {
        return { path: statePath, state: { version: FEYNMAN_WAIT_STATE_VERSION, tasks: {} } };
    }
}

function writeFeynmanWaitState(cwd, state) {
    const statePath = feynmanWaitStatePath(cwd);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ version: FEYNMAN_WAIT_STATE_VERSION, tasks: state.tasks ?? {} }, null, 2) + "\\n", "utf8");
}

function makeFeynmanWaitTaskId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function makeFeynmanWaitResumeConfig(cwd) {
    if (!process.env.FEYNMAN_BIN_PATH) {
        return undefined;
    }
    return {
        type: "feynman",
        node: process.env.FEYNMAN_NODE_EXECUTABLE || process.execPath,
        bin: process.env.FEYNMAN_BIN_PATH,
        cwd,
    };
}

function feynmanWaitPatchScriptPath() {
    if (process.env.PI_WAIT_PATCH_BIN || process.env.CODEX_WAIT_PATCH_BIN) {
        return process.env.PI_WAIT_PATCH_BIN || process.env.CODEX_WAIT_PATCH_BIN;
    }
    const wakewaitHome = process.env.WAKEWAIT_HOME || (process.env.USERPROFILE || process.env.HOME ? path.join(process.env.USERPROFILE || process.env.HOME, ".wakewait") : undefined);
    if (wakewaitHome) {
        const wakewaitScript = path.join(wakewaitHome, "scripts", "patch-pi-wait.mjs");
        if (fs.existsSync(wakewaitScript)) return wakewaitScript;
    }
    if (process.env.FEYNMAN_BIN_PATH) {
        return path.resolve(path.dirname(process.env.FEYNMAN_BIN_PATH), "..", "scripts", "patch-pi-wait.mjs");
    }
    return undefined;
}

function startFeynmanWaitBackgroundWorker(cwd, taskId) {
    const statePath = feynmanWaitStatePath(cwd);
    const scriptPath = feynmanWaitPatchScriptPath();
    let child;
    if (scriptPath && fs.existsSync(scriptPath)) {
        child = spawn(process.execPath, [scriptPath, "worker", taskId, "--state", statePath], {
            cwd,
            detached: true,
            stdio: "ignore",
            windowsHide: true,
        });
    }
    else {
        child = spawn("pi-wait-patch", ["worker", taskId, "--state", statePath], {
            cwd,
            detached: true,
            shell: true,
            stdio: "ignore",
            windowsHide: true,
        });
    }
    child.unref();
    return child.pid;
}

function upsertFeynmanWaitTask(cwd, task) {
    const { path: statePath, state } = readFeynmanWaitState(cwd);
    state.tasks[task.id] = {
        ...(state.tasks[task.id] ?? {}),
        ...task,
        updatedAt: new Date().toISOString(),
    };
    writeFeynmanWaitState(cwd, state);
    return statePath;
}

function getFeynmanWaitTask(cwd, id) {
    return readFeynmanWaitState(cwd).state.tasks[id];
}

function findFeynmanWaitKeyword(input, keyword) {
    let quote = "";
    let escaped = false;
    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === "\\\\") {
            escaped = true;
            continue;
        }
        if (quote) {
            if (char === quote) quote = "";
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (input.slice(i, i + keyword.length).toLowerCase() !== keyword) {
            continue;
        }
        const before = i === 0 ? " " : input[i - 1];
        const after = i + keyword.length >= input.length ? " " : input[i + keyword.length];
        if (/\\s/.test(before) && /\\s/.test(after)) {
            return i;
        }
    }
    return -1;
}

function splitFeynmanWaitKeyword(input, keyword) {
    const index = findFeynmanWaitKeyword(input, keyword);
    if (index === -1) {
        return { before: input.trim(), after: undefined };
    }
    return {
        before: input.slice(0, index).trim(),
        after: input.slice(index + keyword.length).trim() || undefined,
    };
}

function tokenizeFeynmanWaitArgs(input) {
    const tokens = [];
    let current = "";
    let quote = "";
    let escaped = false;
    let quoted = false;
    for (const char of input) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }
        if (char === "\\\\") {
            escaped = true;
            continue;
        }
        if (quote) {
            if (char === quote) quote = "";
            else current += char;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            quoted = true;
            continue;
        }
        if (/\\s/.test(char)) {
            if (current || quoted) {
                tokens.push({ value: current, quoted });
                current = "";
                quoted = false;
            }
            continue;
        }
        current += char;
    }
    if (quote) {
        return { error: "Unclosed quote in /wait-for command." };
    }
    if (escaped) current += "\\\\";
    if (current || quoted) {
        tokens.push({ value: current, quoted });
    }
    return { tokens };
}

function parseFeynmanWaitForOptions(optionsText) {
    const tokenized = tokenizeFeynmanWaitArgs(optionsText);
    if (tokenized.error) {
        return { error: tokenized.error };
    }
    const tokens = tokenized.tokens;
    let condition;
    let everyMs = FEYNMAN_WAIT_DEFAULT_EVERY_MS;
    let reviewEveryMs = FEYNMAN_WAIT_DEFAULT_REVIEW_EVERY_MS;
    let reviewPrompt;
    let persist = false;
    let persistId;
    let background = false;
    let onReady;
    let verbose = false;
    let timeoutMs;
    const positional = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i].value;
        if (token === "--condition" || token === "-c") {
            const next = tokens[++i];
            if (!next) return { error: "Usage: /wait-for --condition \\"<command>\\" --every 1m --timeout 1h then <prompt>" };
            condition = next.value;
            continue;
        }
        if (token === "--every" || token === "-e") {
            const next = tokens[++i];
            if (!next) return { error: "Missing duration after --every." };
            const parsed = parseFeynmanWaitDuration(next.value);
            if (!parsed || parsed < 1000) return { error: "--every must be at least 1s." };
            everyMs = parsed;
            continue;
        }
        if (token === "--review-every" || token === "--health-every") {
            const next = tokens[++i];
            if (!next) return { error: "Missing duration after --review-every." };
            const normalized = next.value.trim().toLowerCase();
            if (normalized === "off" || normalized === "none" || normalized === "never" || normalized === "0") {
                reviewEveryMs = undefined;
                continue;
            }
            const parsed = parseFeynmanWaitDuration(next.value);
            if (!parsed || parsed < 1000) return { error: "--review-every must be at least 1s, or off." };
            if (parsed > FEYNMAN_WAIT_MAX_MS) return { error: "--review-every is too long. Use 7 days or less." };
            reviewEveryMs = parsed;
            continue;
        }
        if (token === "--review" || token === "--health-check") {
            const next = tokens[++i];
            if (!next) return { error: "Missing prompt after --review." };
            reviewPrompt = next.value;
            continue;
        }
        if (token === "--persist") {
            persist = true;
            continue;
        }
        if (token === "--background") {
            background = true;
            persist = true;
            continue;
        }
        if (token === "--id") {
            const next = tokens[++i];
            if (!next) return { error: "Missing id after --id." };
            persistId = next.value;
            persist = true;
            continue;
        }
        if (token === "--on-ready") {
            const next = tokens[++i];
            if (!next) return { error: "Missing command after --on-ready." };
            onReady = next.value;
            background = true;
            persist = true;
            continue;
        }
        if (token === "--verbose" || token === "-v") {
            verbose = true;
            continue;
        }
        if (token === "--quiet" || token === "-q") {
            verbose = false;
            continue;
        }
        if (token === "--timeout" || token === "-t") {
            const next = tokens[++i];
            if (!next) return { error: "Missing duration after --timeout." };
            const parsed = parseFeynmanWaitDuration(next.value);
            if (!parsed || parsed <= 0) return { error: "--timeout must be a positive duration." };
            timeoutMs = parsed;
            continue;
        }
        positional.push(tokens[i].value);
    }
    if (!condition && positional.length > 0) {
        condition = positional.join(" ");
    }
    if (!condition) {
        return { error: "Usage: /wait-for --condition \\"<command>\\" --every 1m --timeout 1h then <prompt>" };
    }
    if (!timeoutMs) {
        return { error: "/wait-for requires --timeout so it cannot poll forever." };
    }
    if (timeoutMs > FEYNMAN_WAIT_MAX_MS) {
        return { error: "Wait timeout is too long. Use 7 days or less." };
    }
    return { condition, everyMs, timeoutMs, reviewEveryMs, reviewPrompt, persist, persistId, background, onReady, verbose };
}

function parseFeynmanWaitForCommand(text) {
    const raw = text.replace(/^\\/wait-for\\b/i, "").trim();
    if (!raw) {
        return { error: "Usage: /wait-for --condition \\"<command>\\" --every 1m --timeout 1h then <prompt> [else <prompt>]" };
    }
    const thenSplit = splitFeynmanWaitKeyword(raw, "then");
    const elseSplit = splitFeynmanWaitKeyword(thenSplit.after ?? "", "else");
    const parsedOptions = parseFeynmanWaitForOptions(thenSplit.before);
    if (parsedOptions.error) {
        return parsedOptions;
    }
    return {
        ...parsedOptions,
        successPrompt: elseSplit.before || undefined,
        timeoutPrompt: elseSplit.after,
    };
}

function appendFeynmanWaitOutput(output, chunk) {
    if (!chunk) return output;
    const combined = output + chunk.toString();
    return combined.length > FEYNMAN_WAIT_OUTPUT_LIMIT
        ? combined.slice(combined.length - FEYNMAN_WAIT_OUTPUT_LIMIT)
        : combined;
}

function runFeynmanWaitCondition(command, cwd) {
    return new Promise((resolve) => {
        const isWindows = process.platform === "win32";
        const child = isWindows
            ? spawn("cmd.exe", ["/d", "/s", "/c", command], { cwd, windowsHide: true })
            : spawn("sh", ["-c", command], { cwd });
        let output = "";
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ ...result, output: output.trim() });
        };
        const timer = setTimeout(() => {
            child.kill();
            finish({ ok: false, timedOut: true, exitCode: undefined });
        }, FEYNMAN_WAIT_CONDITION_TIMEOUT_MS);
        child.stdout?.on("data", (chunk) => {
            output = appendFeynmanWaitOutput(output, chunk);
        });
        child.stderr?.on("data", (chunk) => {
            output = appendFeynmanWaitOutput(output, chunk);
        });
        child.on("error", (error) => {
            output = appendFeynmanWaitOutput(output, error instanceof Error ? error.message : String(error));
            finish({ ok: false, timedOut: false, exitCode: undefined });
        });
        child.on("close", (code) => {
            finish({ ok: code === 0, timedOut: false, exitCode: code ?? undefined });
        });
    });
}

function buildFeynmanWaitReviewPrompt(parsed, attempt, startedAt, deadline, result) {
    const reason = result.timedOut ? "condition command timed out" : "exit " + (result.exitCode ?? "unknown");
    const lines = [
        "Run a brief health review for this deferred /wait-for task.",
        "Condition: " + parsed.condition,
        "Polling interval: " + formatFeynmanWaitDuration(parsed.everyMs),
        "Deadline: " + new Date(deadline).toLocaleString(),
        "Last attempt: " + attempt + " (" + reason + ")",
    ];
    if (result.output) {
        lines.push("Last condition output:\\n" + result.output);
    }
    if (parsed.reviewPrompt) {
        lines.push("User review instructions:\\n" + parsed.reviewPrompt);
    }
    lines.push("Inspect whether the underlying training, download, queue, or job appears healthy. Check relevant logs or status if needed. If there is a problem, explain it and take the next safe corrective step. If it is healthy but unfinished, say that briefly; the local wait loop will continue automatically.");
    return lines.join("\\n");
}

async function handleFeynmanWaitForCommand(mode, text) {
    if (mode.session.isStreaming || mode.session.isCompacting || mode.session.isBashRunning) {
        mode.showWarning("Wait for the current operation to finish before waiting on a condition.");
        return;
    }
    const parsed = parseFeynmanWaitForCommand(text);
    if (parsed.error) {
        mode.showWarning(parsed.error);
        return;
    }
    mode.editor.addToHistory?.(text);
    const cwd = mode.sessionManager.getCwd();
    const startedAt = Date.now();
    const deadline = startedAt + parsed.timeoutMs;
    const deadlineText = new Date(deadline).toLocaleString();
    let attempt = 0;
    let nextReviewAt = parsed.reviewEveryMs ? startedAt + parsed.reviewEveryMs : undefined;
    const taskId = parsed.persist ? (parsed.persistId || makeFeynmanWaitTaskId("wait")) : undefined;
    if (taskId) {
        const statePath = upsertFeynmanWaitTask(cwd, {
            id: taskId,
            kind: "wait-for",
            status: "running",
            cwd,
            commandText: text,
            condition: parsed.condition,
            everyMs: parsed.everyMs,
            timeoutMs: parsed.timeoutMs,
            reviewEveryMs: parsed.reviewEveryMs,
            reviewPrompt: parsed.reviewPrompt,
            successPrompt: parsed.successPrompt,
            timeoutPrompt: parsed.timeoutPrompt,
            background: parsed.background,
            onReady: parsed.onReady,
            resume: makeFeynmanWaitResumeConfig(cwd),
            startedAt: new Date(startedAt).toISOString(),
            deadlineAt: new Date(deadline).toISOString(),
            nextCheckAt: new Date(startedAt).toISOString(),
            nextReviewAt: nextReviewAt ? new Date(nextReviewAt).toISOString() : undefined,
        });
        mode.showStatus("Persistent wait task " + taskId + " saved to " + statePath + ".");
        if (parsed.background) {
            const pid = startFeynmanWaitBackgroundWorker(cwd, taskId);
            upsertFeynmanWaitTask(cwd, {
                id: taskId,
                status: "background",
                workerPid: pid,
                workerStartedAt: new Date().toISOString(),
            });
            mode.showStatus("Background wait task " + taskId + " started" + (pid ? " (pid " + pid + ")" : "") + ".");
            return;
        }
    }
    const reviewText = parsed.reviewEveryMs ? \`, health review every \${formatFeynmanWaitDuration(parsed.reviewEveryMs)}\` : ", health reviews disabled";
    mode.showStatus(\`Waiting for condition every \${formatFeynmanWaitDuration(parsed.everyMs)}\${reviewText} until \${deadlineText}: \${parsed.condition}\`);
    while (Date.now() <= deadline) {
        if (taskId && getFeynmanWaitTask(cwd, taskId)?.status === "cancelled") {
            mode.showWarning("Persistent wait task " + taskId + " was cancelled.");
            return;
        }
        attempt++;
        const result = await runFeynmanWaitCondition(parsed.condition, cwd);
        if (result.ok) {
            const suffix = result.output ? \` Output: \${result.output}\` : "";
            mode.showStatus(\`Condition satisfied after attempt \${attempt}.\${suffix}\`);
            if (taskId) {
                upsertFeynmanWaitTask(cwd, {
                    id: taskId,
                    status: "satisfied",
                    completedAt: new Date().toISOString(),
                    attempts: attempt,
                    lastOutput: result.output,
                });
            }
            if (parsed.successPrompt) {
                mode.flushPendingBashComponents();
                await mode.session.prompt(parsed.successPrompt);
            }
            return;
        }
        const now = Date.now();
        if (now >= deadline) {
            break;
        }
        const reason = result.timedOut ? "condition command timed out" : \`exit \${result.exitCode ?? "unknown"}\`;
        const output = result.output ? \` Output: \${result.output}\` : "";
        if (nextReviewAt && now >= nextReviewAt) {
            mode.showStatus(\`Running scheduled wait health review.\${output}\`);
            mode.flushPendingBashComponents();
            await mode.session.prompt(buildFeynmanWaitReviewPrompt(parsed, attempt, startedAt, deadline, result));
            nextReviewAt = Date.now() + parsed.reviewEveryMs;
        }
        const afterReviewNow = Date.now();
        if (afterReviewNow >= deadline) {
            break;
        }
        const delay = Math.min(parsed.everyMs, nextReviewAt ? Math.max(0, nextReviewAt - afterReviewNow) : parsed.everyMs, deadline - afterReviewNow);
        if (taskId) {
            upsertFeynmanWaitTask(cwd, {
                id: taskId,
                status: "running",
                attempts: attempt,
                lastAttemptAt: new Date(now).toISOString(),
                lastExitCode: result.exitCode,
                lastTimedOut: result.timedOut,
                lastOutput: result.output,
                nextCheckAt: new Date(afterReviewNow + delay).toISOString(),
                nextReviewAt: nextReviewAt ? new Date(nextReviewAt).toISOString() : undefined,
            });
        }
        if (parsed.verbose) {
            mode.showStatus(\`Condition not met on attempt \${attempt} (\${reason}). Next check in \${formatFeynmanWaitDuration(delay)}.\${output}\`);
        }
        await feynmanWaitSleep(delay);
    }
    mode.showWarning(\`Timed out waiting for condition after \${formatFeynmanWaitDuration(parsed.timeoutMs)}: \${parsed.condition}\`);
    if (taskId) {
        upsertFeynmanWaitTask(cwd, {
            id: taskId,
            status: "timed_out",
            completedAt: new Date().toISOString(),
            attempts: attempt,
        });
    }
    if (parsed.timeoutPrompt) {
        mode.flushPendingBashComponents();
        await mode.session.prompt(parsed.timeoutPrompt);
    }
}
`;

const WAIT_SUBMIT_BLOCK = `            if (text === "/wait-for" || text.startsWith("/wait-for ")) {
                this.editor.setText("");
                await handleFeynmanWaitForCommand(this, text);
                return;
            }
`;

const SLEEP_SUBMIT_BLOCK = `            if (text === "/sleep" || text.startsWith("/sleep ")) {
                this.editor.setText("");
                await handleFeynmanSleepCommand(this, text);
                return;
            }
`;

export function patchPiSlashCommandsSource(source) {
	let patched = source;
	const marker = '    { name: "quit", description: `Quit ${APP_NAME}` },';
	if (!patched.includes(marker)) {
		return source;
	}
	if (!patched.includes(SLEEP_SLASH_COMMAND_MARKER)) {
		patched = patched.replace(marker, `    ${SLEEP_SLASH_COMMAND_MARKER},\n${marker}`);
	}
	if (!patched.includes(WAIT_FOR_SLASH_COMMAND_MARKER)) {
		patched = patched.replace(marker, `    ${WAIT_FOR_SLASH_COMMAND_MARKER},\n${marker}`);
	}
	return patched;
}

export function patchPiInteractiveSleepSource(source) {
	let patched = source;
	const classMarker = "export class InteractiveMode {";
	if (!patched.includes(classMarker)) {
		return source;
	}
	const sleepContinuationCount = (patched.match(/function splitFeynmanSleepContinuation\(/g) ?? []).length;
	if (
		(patched.includes("function parseFeynmanWaitForCommand(") &&
			!patched.includes("FEYNMAN_WAIT_STATE_VERSION")) ||
		sleepContinuationCount > 1
	) {
		const legacySleepAndWaitPattern = /\nconst FEYNMAN_SLEEP_MAX_MS =[\s\S]*?\nasync function handleFeynmanWaitForCommand\(mode, text\) \{[\s\S]*?\n\s*export class InteractiveMode \{/;
		const oldHelperPattern = /\nconst FEYNMAN_WAIT_MAX_MS =[\s\S]*?\nasync function handleFeynmanWaitForCommand\(mode, text\) \{[\s\S]*?\n\s*export class InteractiveMode \{/;
		if (legacySleepAndWaitPattern.test(patched)) {
			patched = patched.replace(legacySleepAndWaitPattern, `${WAIT_HELPER}\n${classMarker}`);
		}
		else if (oldHelperPattern.test(patched)) {
			patched = patched.replace(oldHelperPattern, `${WAIT_HELPER}\n${classMarker}`);
		}
		else if (!patched.includes("const FEYNMAN_WAIT_MAX_MS")) {
			patched = patched.replace(classMarker, `${WAIT_FOR_UPGRADE_HELPER}\n${classMarker}`);
		}
	}
	if (!patched.includes("function parseFeynmanSleepCommand(")) {
		patched = patched.replace(classMarker, `${WAIT_HELPER}\n${classMarker}`);
	}
	else if (!patched.includes("function parseFeynmanWaitForCommand(")) {
		patched = patched.replace(classMarker, `${WAIT_FOR_UPGRADE_HELPER}\n${classMarker}`);
	}
	if (!patched.includes("await handleFeynmanWaitForCommand(this, text);")) {
		const submitMarker = '            if (text === "/settings") {';
		if (!patched.includes(submitMarker)) {
			return source;
		}
		patched = patched.replace(submitMarker, `${WAIT_SUBMIT_BLOCK}${submitMarker}`);
	}
	if (!patched.includes("await handleFeynmanSleepCommand(this, text);")) {
		const waitSubmitMarker = '            if (text === "/wait-for" || text.startsWith("/wait-for ")) {';
		const settingsSubmitMarker = '            if (text === "/settings") {';
		const marker = patched.includes(waitSubmitMarker) ? waitSubmitMarker : settingsSubmitMarker;
		if (!patched.includes(marker)) {
			return source;
		}
		patched = patched.replace(marker, `${SLEEP_SUBMIT_BLOCK}${marker}`);
	}
	return patched;
}
