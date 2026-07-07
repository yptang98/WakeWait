#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { patchPiInteractiveSleepSource, patchPiSlashCommandsSource } from "./lib/pi-sleep-patch.mjs";

const PI_SCOPES = ["@earendil-works", "@mariozechner"];
const PI_PACKAGE = "pi-coding-agent";
const WAIT_STATE_VERSION = 1;
const WAIT_STATE_DIR = ".codex-wait";
const WAIT_STATE_FILE = "tasks.json";
const WAIT_CONDITION_TIMEOUT_MS = 30 * 1000;
const WAIT_OUTPUT_LIMIT = 4000;
const HEALTH_OUTPUT_LIMIT = 64 * 1024;
const HEALTH_RULES = [
	{ id: "cuda-oom", pattern: /\bCUDA out of memory\b/i },
	{ id: "out-of-memory", pattern: /\bout of memory\b|\bOOM\b/i },
	{ id: "nan-loss", pattern: /\b(?:loss|grad|gradient)[^\n]{0,80}\b(?:nan|inf)\b|\b(?:nan|inf)[^\n]{0,80}\b(?:loss|grad|gradient)\b/i },
	{ id: "traceback", pattern: /\bTraceback \(most recent call last\):/i },
	{ id: "runtime-error", pattern: /\b(?:RuntimeError|Exception|ERROR|Error):\b/i },
	{ id: "process-killed", pattern: /\b(?:Killed|Segmentation fault|core dumped)\b/i },
];

function unique(values) {
	return Array.from(new Set(values.filter(Boolean).map((value) => resolve(value))));
}

function pushIfExists(values, path) {
	if (path && existsSync(path)) {
		values.push(path);
	}
}

function npmRootGlobal() {
	const result = spawnSync("npm", ["root", "-g"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
	if (result.status !== 0) {
		return undefined;
	}
	return result.stdout.trim() || undefined;
}

export function defaultPiWaitPatchRoots(cwd = process.cwd()) {
	const roots = [cwd];
	pushIfExists(roots, resolve(cwd, "node_modules"));
	pushIfExists(roots, resolve(cwd, ".feynman", "npm", "node_modules"));
	pushIfExists(roots, process.env.PI_RUNTIME_ROOT);
	pushIfExists(roots, process.env.CODEX_RUNTIME_ROOT);
	pushIfExists(roots, process.env.npm_config_prefix ? resolve(process.env.npm_config_prefix, "lib", "node_modules") : undefined);
	pushIfExists(roots, npmRootGlobal());
	return unique(roots);
}

export function findPiCodingAgentPackageRoots(root) {
	const packageRoots = [];
	const absoluteRoot = resolve(root);
	const directSlashCommands = resolve(absoluteRoot, "dist", "core", "slash-commands.js");
	const directInteractiveMode = resolve(absoluteRoot, "dist", "modes", "interactive", "interactive-mode.js");
	if (basename(absoluteRoot) === PI_PACKAGE && existsSync(directSlashCommands) && existsSync(directInteractiveMode)) {
		packageRoots.push(absoluteRoot);
	}
	for (const nodeModulesRoot of [
		absoluteRoot,
		resolve(absoluteRoot, "node_modules"),
		resolve(absoluteRoot, ".feynman", "npm", "node_modules"),
		resolve(absoluteRoot, "lib", "node_modules"),
	]) {
		for (const scope of PI_SCOPES) {
			const candidate = resolve(nodeModulesRoot, scope, PI_PACKAGE);
			if (existsSync(resolve(candidate, "dist", "core", "slash-commands.js")) &&
				existsSync(resolve(candidate, "dist", "modes", "interactive", "interactive-mode.js"))) {
				packageRoots.push(candidate);
			}
		}
	}
	return unique(packageRoots);
}

function patchFile(path, patchSource, options) {
	if (!existsSync(path)) {
		return { path, changed: false, missing: true };
	}
	const source = readFileSync(path, "utf8");
	const patched = patchSource(source);
	if (patched === source) {
		return { path, changed: false, missing: false };
	}
	if (!options.dryRun) {
		writeFileSync(path, patched, "utf8");
	}
	return { path, changed: true, missing: false };
}

export function patchPiWaitRuntimeRoots(roots, options = {}) {
	const packageRoots = unique(roots.flatMap((root) => findPiCodingAgentPackageRoots(root)));
	const results = [];
	for (const packageRoot of packageRoots) {
		const slashCommandsPath = resolve(packageRoot, "dist", "core", "slash-commands.js");
		const interactiveModePath = resolve(packageRoot, "dist", "modes", "interactive", "interactive-mode.js");
		results.push({
			packageRoot,
			files: [
				patchFile(slashCommandsPath, patchPiSlashCommandsSource, options),
				patchFile(interactiveModePath, patchPiInteractiveSleepSource, options),
			],
		});
	}
	return results;
}

export function defaultPiWaitStatePath(cwd = process.cwd()) {
	return resolve(process.env.PI_WAIT_STATE_PATH || process.env.CODEX_WAIT_STATE_PATH || resolve(cwd, WAIT_STATE_DIR, WAIT_STATE_FILE));
}

export function readPiWaitState(statePath = defaultPiWaitStatePath()) {
	try {
		const parsed = JSON.parse(readFileSync(statePath, "utf8"));
		return {
			version: WAIT_STATE_VERSION,
			tasks: parsed && typeof parsed.tasks === "object" && parsed.tasks ? parsed.tasks : {},
		};
	} catch {
		return { version: WAIT_STATE_VERSION, tasks: {} };
	}
}

export function writePiWaitState(statePath, state) {
	mkdirSync(dirname(statePath), { recursive: true });
	writeFileSync(statePath, JSON.stringify({ version: WAIT_STATE_VERSION, tasks: state.tasks ?? {} }, null, 2) + "\n", "utf8");
}

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

function taskStatus(task, now = Date.now()) {
	const status = task.status ?? "unknown";
	if (status !== "running" && status !== "background") {
		return task.status ?? "unknown";
	}
	const deadlineMs = Date.parse(task.deadlineAt ?? task.wakeAt ?? "");
	if (Number.isFinite(deadlineMs) && deadlineMs <= now) {
		return "overdue";
	}
	return status;
}

export function listPiWaitTasks(statePath = defaultPiWaitStatePath(), now = Date.now()) {
	const state = readPiWaitState(statePath);
	return Object.values(state.tasks).map((task) => {
		const deadlineMs = Date.parse(task.deadlineAt ?? task.wakeAt ?? "");
		const startedMs = Date.parse(task.startedAt ?? task.createdAt ?? "");
		const nextCheckMs = Date.parse(task.nextCheckAt ?? "");
		const healthEveryMs = Number(task.healthEveryMs ?? task.reviewEveryMs) || 0;
		const healthBaseMs = Date.parse(task.lastHealthCheckAt ?? task.startedAt ?? task.createdAt ?? "");
		const nextHealthMs = healthEveryMs > 0 && Number.isFinite(healthBaseMs) ? healthBaseMs + healthEveryMs : undefined;
		const status = taskStatus(task, now);
		return {
			...task,
			status,
			elapsedMs: Number.isFinite(startedMs) ? now - startedMs : undefined,
			remainingMs: Number.isFinite(deadlineMs) ? deadlineMs - now : undefined,
			overdueMs: Number.isFinite(deadlineMs) && deadlineMs <= now ? now - deadlineMs : undefined,
			nextCheckInMs: Number.isFinite(nextCheckMs) ? nextCheckMs - now : undefined,
			nextHealthInMs: nextHealthMs === undefined ? undefined : nextHealthMs - now,
			healthDue: nextHealthMs !== undefined && nextHealthMs <= now && (status === "running" || status === "background"),
		};
	}).sort((left, right) => String(left.updatedAt ?? "").localeCompare(String(right.updatedAt ?? "")));
}

export function cancelPiWaitTasks(ids, statePath = defaultPiWaitStatePath(), now = new Date()) {
	const state = readPiWaitState(statePath);
	const idSet = new Set(ids);
	const cancelled = [];
	for (const [id, task] of Object.entries(state.tasks)) {
		if (!idSet.has("all") && !idSet.has(id)) continue;
		if (task.status === "cancelled") continue;
		state.tasks[id] = {
			...task,
			status: "cancelled",
			cancelledAt: now.toISOString(),
			updatedAt: now.toISOString(),
		};
		cancelled.push(id);
	}
	writePiWaitState(statePath, state);
	return cancelled;
}

function updatePiWaitTask(statePath, id, patch) {
	const state = readPiWaitState(statePath);
	const existing = state.tasks[id];
	if (!existing) return undefined;
	state.tasks[id] = {
		...existing,
		...patch,
		updatedAt: new Date().toISOString(),
	};
	writePiWaitState(statePath, state);
	return state.tasks[id];
}

function removePiWaitTask(statePath, id) {
	const state = readPiWaitState(statePath);
	if (!state.tasks[id]) return false;
	delete state.tasks[id];
	writePiWaitState(statePath, state);
	return true;
}

function sleep(ms) {
	return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function appendOutput(output, chunk) {
	if (!chunk) return output;
	const combined = output + chunk.toString();
	return combined.length > WAIT_OUTPUT_LIMIT ? combined.slice(combined.length - WAIT_OUTPUT_LIMIT) : combined;
}

function runCondition(command, cwd) {
	return new Promise((resolvePromise) => {
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
			resolvePromise({ ...result, output: output.trim() });
		};
		const timer = setTimeout(() => {
			child.kill();
			finish({ ok: false, timedOut: true, exitCode: undefined });
		}, WAIT_CONDITION_TIMEOUT_MS);
		child.stdout?.on("data", (chunk) => {
			output = appendOutput(output, chunk);
		});
		child.stderr?.on("data", (chunk) => {
			output = appendOutput(output, chunk);
		});
		child.on("error", (error) => {
			output = appendOutput(output, error instanceof Error ? error.message : String(error));
			finish({ ok: false, timedOut: false, exitCode: undefined });
		});
		child.on("close", (code) => {
			finish({ ok: code === 0, timedOut: false, exitCode: code ?? undefined });
		});
	});
}

function tailText(path) {
	try {
		const text = readFileSync(path, "utf8");
		return text.length > HEALTH_OUTPUT_LIMIT ? text.slice(text.length - HEALTH_OUTPUT_LIMIT) : text;
	} catch {
		return "";
	}
}

function firstMatchingLine(text, pattern) {
	return text.split(/\r?\n/).find((line) => pattern.test(line)) || "";
}

function checkHealthLogs(task) {
	const healthLogs = Array.isArray(task.healthLogs)
		? task.healthLogs
		: (task.healthLog ? [task.healthLog] : []);
	for (const logPath of healthLogs.filter(Boolean)) {
		const absolutePath = resolve(task.cwd || process.cwd(), String(logPath));
		if (!existsSync(absolutePath)) continue;
		const text = tailText(absolutePath);
		for (const rule of HEALTH_RULES) {
			rule.pattern.lastIndex = 0;
			if (rule.pattern.test(text)) {
				return {
					ok: false,
					rule: rule.id,
					path: absolutePath,
					line: firstMatchingLine(text, rule.pattern).trim().slice(0, 500),
				};
			}
		}
	}
	return { ok: true };
}

async function runWaitRule(task) {
	const cwd = task.cwd || process.cwd();
	if (task.file) {
		const path = resolve(cwd, String(task.file));
		return { ok: existsSync(path), output: path, exitCode: existsSync(path) ? 0 : 1 };
	}
	if (task.contains?.path && task.contains?.text !== undefined) {
		const path = resolve(cwd, String(task.contains.path));
		const text = existsSync(path) ? tailText(path) : "";
		const needle = String(task.contains.text);
		return { ok: text.includes(needle), output: path, exitCode: text.includes(needle) ? 0 : 1 };
	}
	if (task.condition) {
		return runCondition(task.condition, cwd);
	}
	return { ok: false, output: "no wait rule configured", exitCode: 2 };
}

function launchDetached(command, args, options = {}) {
	const child = spawn(command, args, {
		cwd: options.cwd,
		detached: true,
		env: options.env,
		shell: options.shell,
		stdio: "ignore",
		windowsHide: true,
	});
	child.unref();
	return child.pid;
}

function launchReadyAction(task, outcome) {
	const env = {
		...process.env,
		PI_WAIT_TASK_ID: task.id ?? "",
		PI_WAIT_OUTCOME: outcome,
		PI_WAIT_STATE_PATH: task.statePath ?? "",
		WAKEWAIT_TASK_ID: task.id ?? "",
		WAKEWAIT_OUTCOME: outcome,
		WAKEWAIT_STATE_PATH: task.statePath ?? "",
	};
	if (typeof task.onReady === "string" && task.onReady.trim()) {
		return launchDetached(task.onReady, [], { cwd: task.cwd, env, shell: true });
	}
	const prompt = outcome === "timed_out" ? task.timeoutPrompt : (task.successPrompt || task.prompt);
	if (task.resume?.type === "feynman" && prompt) {
		const node = task.resume.node || process.execPath;
		const bin = task.resume.bin;
		if (bin) {
			return launchDetached(node, [bin, "--cwd", task.cwd || process.cwd(), "--continue", "--prompt", prompt], { cwd: task.cwd, env });
		}
	}
	return undefined;
}

async function markReadyAndLaunch(statePath, id, outcome, patch = {}) {
	const task = updatePiWaitTask(statePath, id, {
		...patch,
		status: "ready",
		outcome,
		readyAt: new Date().toISOString(),
	});
	if (!task) return;
	const pid = launchReadyAction({ ...task, statePath }, outcome);
	updatePiWaitTask(statePath, id, {
		status: pid ? "resuming" : "ready",
		resumePid: pid,
		resumeStartedAt: pid ? new Date().toISOString() : undefined,
	});
	if (task.cleanupOnReady === true) {
		removePiWaitTask(statePath, id);
	}
}

export async function runPiWaitWorker(id, options = {}) {
	const statePath = options.statePath || defaultPiWaitStatePath();
	while (true) {
		const task = readPiWaitState(statePath).tasks[id];
		if (!task) {
			throw new Error(`No persisted wait task found: ${id}`);
		}
		if (task.status === "cancelled") {
			return;
		}
		const now = Date.now();
		const deadlineMs = Date.parse(task.deadlineAt ?? task.wakeAt ?? "");
		if (task.kind === "sleep") {
			if (Number.isFinite(deadlineMs) && deadlineMs > now) {
				updatePiWaitTask(statePath, id, {
					status: "background",
					nextCheckAt: new Date(deadlineMs).toISOString(),
				});
				await sleep(deadlineMs - now);
				continue;
			}
			await markReadyAndLaunch(statePath, id, "woke");
			return;
		}
		if (task.kind === "wait-for") {
			if (Number.isFinite(deadlineMs) && deadlineMs <= now) {
				await markReadyAndLaunch(statePath, id, "timed_out");
				return;
			}
			const result = await runWaitRule(task);
			if (result.ok) {
				await markReadyAndLaunch(statePath, id, "satisfied", {
					lastOutput: result.output,
					lastAttemptAt: new Date().toISOString(),
				});
				return;
			}
			const healthEveryMs = Number(task.healthEveryMs ?? task.reviewEveryMs) || 0;
			const healthBaseMs = Date.parse(task.lastHealthCheckAt ?? task.startedAt ?? task.createdAt ?? "");
			const healthDue = healthEveryMs > 0 && Number.isFinite(healthBaseMs) && Date.now() - healthBaseMs >= healthEveryMs;
			const healthResult = healthDue ? checkHealthLogs(task) : { ok: true };
			if (!healthResult.ok) {
				await markReadyAndLaunch(statePath, id, "health_failed", {
					lastOutput: result.output,
					lastAttemptAt: new Date().toISOString(),
					lastHealthCheckAt: new Date().toISOString(),
					healthIssue: healthResult,
				});
				return;
			}
			const delay = Math.max(1000, Math.min(
				Number(task.everyMs) || 60 * 1000,
				Number.isFinite(deadlineMs) ? deadlineMs - Date.now() : 60 * 1000,
			));
			updatePiWaitTask(statePath, id, {
				status: "background",
				lastAttemptAt: new Date().toISOString(),
				lastExitCode: result.exitCode,
				lastTimedOut: result.timedOut,
				lastOutput: result.output,
				nextCheckAt: new Date(Date.now() + delay).toISOString(),
				lastHealthCheckAt: healthDue ? new Date().toISOString() : task.lastHealthCheckAt,
				healthStatus: healthDue ? "ok" : task.healthStatus,
			});
			await sleep(delay);
			continue;
		}
		throw new Error(`Unsupported wait task kind: ${task.kind}`);
	}
}

function printWaitStatus(options) {
	const statePath = options.statePath || defaultPiWaitStatePath();
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
		const timing = task.status === "overdue"
			? `overdue by ${formatDuration(task.overdueMs ?? -(task.remainingMs ?? 0))}`
			: active
				? `remaining ${formatDuration(task.remainingMs ?? 0)}`
				: task.completedAt || task.cancelledAt || task.updatedAt || "";
		const label = task.kind === "sleep"
			? (task.wakeAt || task.deadlineAt || "")
			: (task.file || (task.contains ? `${task.contains.path} contains ${JSON.stringify(task.contains.text)}` : task.condition || ""));
		console.log(`${task.id} [${task.status}] ${timing}`);
		if (task.elapsedMs !== undefined && active) console.log(`  elapsed ${formatDuration(task.elapsedMs)}`);
		if (label) console.log(`  ${label}`);
		if (task.nextCheckInMs !== undefined && active && task.status !== "overdue") {
			console.log(`  next check in ${formatDuration(task.nextCheckInMs)}`);
		}
		if (task.healthIssue) {
			console.log(`  health issue: ${task.healthIssue.rule} ${task.healthIssue.path}`);
			if (task.healthIssue.line) console.log(`  ${task.healthIssue.line}`);
		}
	}
}

function parseStateCommandArgs(argv) {
	const ids = [];
	let statePath;
	let json = false;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--state") {
			const next = argv[++i];
			if (!next) throw new Error("Missing path after --state.");
			statePath = resolve(next);
			continue;
		}
		if (arg === "--json") {
			json = true;
			continue;
		}
		ids.push(arg);
	}
	return { ids, statePath, json };
}

function parseWorkerArgs(argv) {
	let id;
	let statePath;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--state") {
			const next = argv[++i];
			if (!next) throw new Error("Missing path after --state.");
			statePath = resolve(next);
			continue;
		}
		if (!id) {
			id = arg;
			continue;
		}
		throw new Error(`Unexpected worker argument: ${arg}`);
	}
	if (!id) throw new Error("worker requires a task id.");
	return { id, statePath };
}

function parseArgs(argv) {
	const roots = [];
	let dryRun = false;
	let check = false;
	let verbose = false;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--root" || arg === "-r") {
			const next = argv[++i];
			if (!next) throw new Error("Missing path after --root.");
			roots.push(next);
			continue;
		}
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (arg === "--check") {
			check = true;
			dryRun = true;
			continue;
		}
		if (arg === "--verbose" || arg === "-v") {
			verbose = true;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			return { help: true };
		}
		roots.push(arg);
	}
	return { roots, dryRun, check, verbose };
}

function usage() {
	return [
		"Usage: pi-wait-patch [--root <path>] [--dry-run] [--check] [--verbose]",
		"       pi-wait-patch status [--state <path>] [--json]",
		"       pi-wait-patch cancel <id|all> [--state <path>]",
		"       pi-wait-patch worker <id> [--state <path>]",
		"",
		"Patches a Pi coding-agent runtime with local /sleep and /wait-for support.",
		"Also inspects or cancels persisted /sleep --persist and /wait-for --persist tasks.",
		"Pass a project root, node_modules root, or pi-coding-agent package root.",
		"If no root is provided, common local and global npm roots are scanned.",
	].join("\n");
}

async function main() {
	try {
		const argv = process.argv.slice(2);
		const command = argv[0];
		if (command === "status") {
			printWaitStatus(parseStateCommandArgs(argv.slice(1)));
			return;
		}
		if (command === "cancel") {
			const options = parseStateCommandArgs(argv.slice(1));
			if (options.ids.length === 0) throw new Error("cancel requires a task id or all.");
			const statePath = options.statePath || defaultPiWaitStatePath();
			const cancelled = cancelPiWaitTasks(options.ids, statePath);
			if (cancelled.length === 0) {
				console.log("no matching wait tasks cancelled");
			}
			else {
				console.log(`cancelled ${cancelled.length} wait task(s): ${cancelled.join(", ")}`);
			}
			return;
		}
		if (command === "worker") {
			const options = parseWorkerArgs(argv.slice(1));
			await runPiWaitWorker(options.id, { statePath: options.statePath });
			return;
		}
		const options = parseArgs(argv);
		if (options.help) {
			console.log(usage());
			return;
		}
		const roots = options.roots.length > 0 ? unique(options.roots) : defaultPiWaitPatchRoots();
		const results = patchPiWaitRuntimeRoots(roots, options);
		const changedFiles = results.flatMap((result) => result.files.filter((file) => file.changed));
		if (results.length === 0) {
			console.error("pi-wait-patch: no pi-coding-agent runtime found. Pass --root <path> to the runtime or node_modules directory.");
			process.exitCode = 2;
			return;
		}
		for (const result of results) {
			const changed = result.files.some((file) => file.changed);
			const status = changed ? (options.dryRun ? "would patch" : "patched") : "already current";
			console.log(`${status}: ${result.packageRoot}`);
			if (options.verbose) {
				for (const file of result.files) {
					console.log(`  ${file.changed ? "changed" : "ok"} ${file.path}`);
				}
			}
		}
		if (options.check && changedFiles.length > 0) {
			process.exitCode = 1;
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		console.error(usage());
		process.exitCode = 1;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
