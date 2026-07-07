#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
	defaultPiWaitPatchRoots,
	defaultPiWaitStatePath,
	listPiWaitTasks,
	cancelPiWaitTasks,
	patchPiWaitRuntimeRoots,
	readPiWaitState,
	runPiWaitWorker,
	writePiWaitState,
} from "./patch-pi-wait.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const patchScriptPath = resolve(repoRoot, "scripts", "patch-pi-wait.mjs");
const MAX_WAIT_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_WAIT_EVERY_MS = 60 * 1000;
const DEFAULT_HEALTH_EVERY_MS = 30 * 60 * 1000;

function formatDuration(ms) {
	const sign = ms < 0 ? "-" : "";
	const totalSeconds = Math.max(0, Math.round(Math.abs(ms) / 1000));
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const parts = [];
	if (days) parts.push(`${days}d`);
	if (hours) parts.push(`${hours}h`);
	if (minutes) parts.push(`${minutes}m`);
	if (seconds || parts.length === 0) parts.push(`${seconds}s`);
	return sign + parts.join(" ");
}

function parseDuration(value) {
	const match = String(value ?? "").trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i);
	if (!match) return undefined;
	const amount = Number(match[1]);
	const unit = match[2].toLowerCase();
	const scale = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
	const ms = Math.round(amount * scale);
	return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

function parseWakeTime(parts, now = new Date()) {
	const text = parts.join(" ").trim();
	if (!text) return undefined;
	if (/^until\s+/i.test(text)) {
		const target = text.replace(/^until\s+/i, "").trim();
		const hhmm = target.match(/^(\d{1,2}):(\d{2})$/);
		if (hhmm) {
			const date = new Date(now);
			date.setHours(Number(hhmm[1]), Number(hhmm[2]), 0, 0);
			if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 1);
			return date;
		}
		const parsed = new Date(target);
		return Number.isFinite(parsed.getTime()) ? parsed : undefined;
	}
	const durationMs = parseDuration(text);
	if (durationMs !== undefined) return new Date(now.getTime() + durationMs);
	const parsed = new Date(text);
	return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function makeTaskId(prefix) {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseCommon(argv) {
	const options = { rest: [] };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--state") {
			const next = argv[++i];
			if (!next) throw new Error("Missing path after --state.");
			options.statePath = resolve(next);
		} else if (arg === "--cwd") {
			const next = argv[++i];
			if (!next) throw new Error("Missing path after --cwd.");
			options.cwd = resolve(next);
		} else if (arg === "--id") {
			const next = argv[++i];
			if (!next) throw new Error("Missing value after --id.");
			options.id = next;
		} else if (arg === "--on-ready") {
			const next = argv[++i];
			if (!next) throw new Error("Missing command after --on-ready.");
			options.onReady = next;
		} else if (arg === "--background") {
			options.background = true;
		} else if (arg === "--foreground") {
			options.foreground = true;
		} else if (arg === "--json") {
			options.json = true;
		} else {
			options.rest.push(arg);
		}
	}
	return options;
}

function parseSleepArgs(argv) {
	const options = parseCommon(argv);
	let thenIndex = options.rest.findIndex((arg) => arg.toLowerCase() === "then");
	if (thenIndex === -1) thenIndex = options.rest.length;
	const scheduleParts = options.rest.slice(0, thenIndex);
	const promptParts = options.rest.slice(thenIndex + 1);
	const wakeAt = parseWakeTime(scheduleParts);
	if (!wakeAt) throw new Error("Usage: wakewait sleep <30s|5m|2h|until HH:MM|date> [then prompt]");
	const delayMs = wakeAt.getTime() - Date.now();
	if (delayMs < 0) throw new Error("Wake time is already in the past.");
	if (delayMs > MAX_WAIT_MS) throw new Error("WakeWait caps a single wait at 7 days.");
	return { ...options, wakeAt, delayMs, prompt: promptParts.join(" ").trim() };
}

function parseWaitForArgs(argv) {
	const options = parseCommon(argv);
	options.everyMs = DEFAULT_WAIT_EVERY_MS;
	options.timeoutMs = undefined;
	options.healthLogs = [];
	options.healthEveryMs = DEFAULT_HEALTH_EVERY_MS;
	for (let i = 0; i < options.rest.length; i += 1) {
		const arg = options.rest[i];
		if (arg === "--condition") {
			options.condition = options.rest[++i];
		} else if (arg === "--file") {
			options.file = options.rest[++i];
		} else if (arg === "--contains") {
			options.containsPath = options.rest[++i];
			options.containsText = options.rest[++i];
			if (!options.containsPath || options.containsText === undefined) throw new Error("--contains expects <path> <text>.");
		} else if (arg === "--every") {
			const parsed = parseDuration(options.rest[++i]);
			if (parsed === undefined) throw new Error("--every expects a duration such as 30s, 5m, or 1h.");
			options.everyMs = parsed;
		} else if (arg === "--timeout") {
			const parsed = parseDuration(options.rest[++i]);
			if (parsed === undefined) throw new Error("--timeout expects a duration such as 30s, 5m, or 1h.");
			options.timeoutMs = parsed;
		} else if (arg === "--health-every" || arg === "--review-every") {
			const next = options.rest[++i];
			if (String(next).toLowerCase() === "off") {
				options.healthEveryMs = 0;
			} else {
				const parsed = parseDuration(next);
				if (parsed === undefined) throw new Error("--health-every expects a duration or off.");
				options.healthEveryMs = parsed;
			}
		} else if (arg === "--health-log") {
			const next = options.rest[++i];
			if (!next) throw new Error("--health-log expects a path.");
			options.healthLogs.push(next);
		} else if (arg === "--review" || arg === "--on-review") {
			i += 1;
		} else if (arg === "then") {
			const elseIndex = options.rest.findIndex((value, index) => index > i && value.toLowerCase() === "else");
			const successEnd = elseIndex === -1 ? options.rest.length : elseIndex;
			options.successPrompt = options.rest.slice(i + 1, successEnd).join(" ").trim();
			if (elseIndex !== -1) options.timeoutPrompt = options.rest.slice(elseIndex + 1).join(" ").trim();
			break;
		} else {
			throw new Error(`Unexpected wait-for argument: ${arg}`);
		}
	}
	const ruleCount = [options.condition, options.file, options.containsPath].filter(Boolean).length;
	if (ruleCount !== 1) throw new Error("wait-for requires exactly one rule: --file <path>, --contains <path> <text>, or --condition <shell command>.");
	if (!options.timeoutMs) throw new Error("wait-for requires --timeout <duration>.");
	if (options.timeoutMs > MAX_WAIT_MS) throw new Error("WakeWait caps a single wait at 7 days.");
	return options;
}

function upsertTask(statePath, task) {
	const state = readPiWaitState(statePath);
	state.tasks[task.id] = {
		...(state.tasks[task.id] ?? {}),
		...task,
		updatedAt: new Date().toISOString(),
	};
	writePiWaitState(statePath, state);
}

function launchWorker(id, statePath, cwd) {
	const worker = existsSync(patchScriptPath) ? patchScriptPath : scriptPath;
	const args = worker === scriptPath
		? ["worker", id, "--state", statePath]
		: ["worker", id, "--state", statePath];
	const child = spawn(process.execPath, [worker, ...args], {
		cwd,
		detached: true,
		stdio: "ignore",
		windowsHide: true,
	});
	child.unref();
	return child.pid;
}

async function runOrSchedule(task, options, statePath) {
	upsertTask(statePath, task);
	if (options.background) {
		const pid = launchWorker(task.id, statePath, task.cwd);
		upsertTask(statePath, {
			id: task.id,
			status: "background",
			workerPid: pid,
			workerStartedAt: new Date().toISOString(),
		});
		console.log(`scheduled ${task.kind} task ${task.id} in background (pid ${pid})`);
		console.log(`state: ${statePath}`);
		return;
	}
	console.log(`running ${task.kind} task ${task.id} in foreground; Ctrl+C stops this worker but keeps state`);
	console.log(`state: ${statePath}`);
	await runPiWaitWorker(task.id, { statePath });
	const latest = readPiWaitState(statePath).tasks[task.id];
	console.log(`${task.id} ${latest?.status ?? "unknown"}${latest?.outcome ? ` (${latest.outcome})` : ""}`);
}

async function sleepCommand(argv) {
	const options = parseSleepArgs(argv);
	const cwd = options.cwd || process.cwd();
	const statePath = options.statePath || defaultPiWaitStatePath(cwd);
	const id = options.id || makeTaskId("sleep");
	const startedAt = new Date().toISOString();
	const task = {
		id,
		kind: "sleep",
		status: "running",
		cwd,
		durationMs: options.delayMs,
		startedAt,
		wakeAt: options.wakeAt.toISOString(),
		deadlineAt: options.wakeAt.toISOString(),
		prompt: options.prompt || undefined,
		onReady: options.onReady,
		createdAt: startedAt,
	};
	console.log(`wake time: ${options.wakeAt.toISOString()} (${formatDuration(options.delayMs)})`);
	await runOrSchedule(task, options, statePath);
}

async function waitForCommand(argv) {
	const options = parseWaitForArgs(argv);
	const cwd = options.cwd || process.cwd();
	const statePath = options.statePath || defaultPiWaitStatePath(cwd);
	const id = options.id || makeTaskId("wait");
	const deadline = new Date(Date.now() + options.timeoutMs);
	const task = {
		id,
		kind: "wait-for",
		status: "running",
		cwd,
		condition: options.condition,
		file: options.file,
		contains: options.containsPath ? { path: options.containsPath, text: options.containsText } : undefined,
		everyMs: options.everyMs,
		healthEveryMs: options.healthLogs.length > 0 ? options.healthEveryMs : 0,
		healthLogs: options.healthLogs,
		deadlineAt: deadline.toISOString(),
		successPrompt: options.successPrompt,
		timeoutPrompt: options.timeoutPrompt,
		onReady: options.onReady,
		createdAt: new Date().toISOString(),
		startedAt: new Date().toISOString(),
	};
	if (options.file) console.log(`file: ${options.file}`);
	else if (options.containsPath) console.log(`contains: ${options.containsPath} includes ${JSON.stringify(options.containsText)}`);
	else console.log(`condition: ${options.condition}`);
	console.log(`polling: every ${formatDuration(options.everyMs)} until ${deadline.toISOString()}`);
	if (task.healthEveryMs) console.log(`health rules: every ${formatDuration(task.healthEveryMs)} on ${options.healthLogs.join(", ")}`);
	await runOrSchedule(task, options, statePath);
}

function statusCommand(argv) {
	const options = parseCommon(argv);
	const statePath = options.statePath || defaultPiWaitStatePath(options.cwd || process.cwd());
	const tasks = listPiWaitTasks(statePath);
	if (options.json) {
		console.log(JSON.stringify({ path: statePath, tasks }, null, 2));
		return;
	}
	console.log(`state: ${statePath}`);
	if (tasks.length === 0) {
		console.log("no persisted wait tasks");
		return;
	}
	for (const task of tasks) {
		const active = task.status === "running" || task.status === "background" || task.status === "overdue";
		let timing = "";
		if (task.status === "overdue") {
			timing = `overdue by ${formatDuration(task.overdueMs ?? -(task.remainingMs ?? 0))}`;
		} else if (active && task.remainingMs !== undefined) {
			timing = `remaining ${formatDuration(task.remainingMs)}`;
		}
		const outcome = task.outcome ? ` (${task.outcome})` : "";
		console.log(`${task.id} [${task.status}${outcome}] ${timing}`.trim());
		if (active && task.elapsedMs !== undefined) console.log(`  elapsed ${formatDuration(task.elapsedMs)}`);
		if (task.kind === "wait-for" && task.condition) console.log(`  condition: ${task.condition}`);
		if (task.kind === "wait-for" && task.file) console.log(`  file: ${task.file}`);
		if (task.kind === "wait-for" && task.contains) console.log(`  contains: ${task.contains.path} includes ${JSON.stringify(task.contains.text)}`);
		if (task.kind === "sleep" && task.wakeAt) console.log(`  wake: ${task.wakeAt}`);
		if (active && task.status !== "overdue" && task.nextCheckInMs !== undefined) console.log(`  next check in ${formatDuration(task.nextCheckInMs)}`);
		if (task.healthDue) console.log("  health check due: fixed rules will run in the worker");
		if (task.healthIssue) console.log(`  health issue: ${task.healthIssue.rule} ${task.healthIssue.path}`);
	}
}

function cancelCommand(argv) {
	const options = parseCommon(argv);
	const ids = options.rest;
	if (ids.length === 0) throw new Error("cancel requires a task id or all.");
	const statePath = options.statePath || defaultPiWaitStatePath(options.cwd || process.cwd());
	const cancelled = cancelPiWaitTasks(ids, statePath);
	console.log(cancelled.length ? `cancelled ${cancelled.length} wait task(s): ${cancelled.join(", ")}` : "no matching wait tasks cancelled");
}

function patchCommand(argv) {
	const roots = [];
	let dryRun = false;
	let check = false;
	let verbose = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--root" || arg === "-r") roots.push(argv[++i]);
		else if (arg === "--dry-run") dryRun = true;
		else if (arg === "--check") {
			check = true;
			dryRun = true;
		} else if (arg === "--verbose" || arg === "-v") verbose = true;
		else roots.push(arg);
	}
	const results = patchPiWaitRuntimeRoots(roots.length ? roots : defaultPiWaitPatchRoots(), { dryRun, verbose });
	if (results.length === 0) {
		console.log("no Pi coding-agent runtime found; pass --root <path> to patch optional /sleep and /wait-for commands");
		if (check) process.exitCode = 1;
		return;
	}
	let changed = 0;
	for (const result of results) {
		const isChanged = result.files.some((file) => file.changed);
		if (isChanged) changed += 1;
		console.log(`${isChanged ? (dryRun ? "would patch" : "patched") : "already current"}: ${result.packageRoot}`);
	}
	if (check && changed > 0) process.exitCode = 1;
}

function usage() {
	return [
		"Usage:",
		"  wakewait sleep <30s|5m|2h|until HH:MM|date> [then prompt] [--background] [--on-ready <command>]",
		"  wakewait wait-for (--file <path> | --contains <path> <text> | --condition <command>) --every <duration> --timeout <duration> [--background] [--health-log <path>] [--health-every <duration|off>]",
		"  wakewait status [--state <path>] [--json]",
		"  wakewait cancel <id|all> [--state <path>]",
		"  wakewait worker <id> [--state <path>]",
		"  wakewait patch [--root <path>] [--dry-run] [--check]",
	].join("\n");
}

async function main() {
	const [command, ...argv] = process.argv.slice(2);
	if (!command || command === "--help" || command === "-h") {
		console.log(usage());
		return;
	}
	if (command === "sleep") return sleepCommand(argv);
	if (command === "wait-for") return waitForCommand(argv);
	if (command === "status") return statusCommand(argv);
	if (command === "cancel") return cancelCommand(argv);
	if (command === "patch") return patchCommand(argv);
	if (command === "worker") {
		const options = parseCommon(argv);
		const id = options.rest[0];
		if (!id) throw new Error("worker requires a task id.");
		return runPiWaitWorker(id, { statePath: options.statePath });
	}
	throw new Error(`Unknown command: ${command}\n${usage()}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
