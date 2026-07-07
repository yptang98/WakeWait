#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findPiCodingAgentPackageRoots, patchPiWaitRuntimeRoots } from "./patch-pi-wait.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wakewaitHome = resolve(process.env.WAKEWAIT_HOME || join(homedir(), ".wakewait"));
const manifestPath = join(wakewaitHome, "install-manifest.json");
const defaultCodexHome = resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));

function log(message) {
	console.log(`[wakewait] ${message}`);
}

function readJson(path, fallback) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return fallback;
	}
}

function writeJson(path, value) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function copyDir(source, target) {
	rmSync(target, { recursive: true, force: true });
	mkdirSync(dirname(target), { recursive: true });
	cpSync(source, target, { recursive: true });
}

function copyManagedSkill(skillName, targetRoot, manifest) {
	const source = join(repoRoot, "skills", skillName);
	const target = join(targetRoot, skillName);
	copyDir(source, target);
	writeFileSync(join(target, ".wakewait-managed"), "managed by WakeWait\n", "utf8");
	manifest.installedPaths.push(target);
	manifest.installedSkillRoots.push(targetRoot);
}

function removeManagedSkill(skillName, targetRoot) {
	const target = join(targetRoot, skillName);
	if (existsSync(join(target, ".wakewait-managed"))) {
		rmSync(target, { recursive: true, force: true });
	}
}

function npmRootGlobal() {
	const result = spawnSync("npm", ["root", "-g"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
	return result.status === 0 ? result.stdout.trim() : "";
}

function pushIfExists(values, path) {
	if (path && existsSync(path)) values.push(path);
}

function pushPath(values, path) {
	if (path) values.push(path);
}

function splitPathList(value) {
	return String(value || "")
		.split(process.platform === "win32" ? ";" : ":")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function detectedCodexSkillRoots(explicitRoots = []) {
	const explicit = [
		...explicitRoots,
		...splitPathList(process.env.WAKEWAIT_CODEX_SKILLS),
		...splitPathList(process.env.CODEX_SKILLS_ROOT),
	];
	if (explicit.length > 0) {
		return Array.from(new Set(explicit.map((root) => resolve(root))));
	}

	const roots = [];
	pushPath(roots, join(defaultCodexHome, "skills"));
	pushPath(roots, join(homedir(), ".codex", "skills"));
	pushIfExists(roots, join(dirname(repoRoot), "skills"));
	pushIfExists(roots, join(process.cwd(), "skills"));
	if (process.platform === "win32") {
		for (let code = 67; code <= 90; code += 1) {
			pushIfExists(roots, `${String.fromCharCode(code)}:\\codex\\skills`);
		}
	} else {
		pushIfExists(roots, "/codex/skills");
		pushIfExists(roots, "/workspace/codex/skills");
	}
	return Array.from(new Set(roots.map((root) => resolve(root))));
}

function candidateRoots(extraRoots) {
	const roots = [...extraRoots, process.cwd(), repoRoot];
	pushIfExists(roots, process.env.PI_RUNTIME_ROOT);
	pushIfExists(roots, process.env.CODEX_RUNTIME_ROOT);
	pushIfExists(roots, join(repoRoot, "node_modules"));
	pushIfExists(roots, process.env.npm_config_prefix ? join(process.env.npm_config_prefix, "lib", "node_modules") : undefined);
	pushIfExists(roots, npmRootGlobal());
	return Array.from(new Set(roots.map((root) => resolve(root))));
}

function backupFile(path, manifest) {
	if (!existsSync(path)) return;
	if (manifest.backups.some((entry) => entry.path === path)) return;
	const backupName = Buffer.from(path).toString("base64url");
	const backupPath = join(wakewaitHome, "backups", backupName);
	mkdirSync(dirname(backupPath), { recursive: true });
	cpSync(path, backupPath);
	manifest.backups.push({ path, backupPath });
}

function writeLauncher(binDir, name, scriptName, manifest) {
	if (process.platform === "win32") {
		const cmdPath = join(binDir, `${name}.cmd`);
		writeFileSync(cmdPath, `@echo off\r\n"${process.execPath}" "${join(wakewaitHome, "scripts", scriptName)}" %*\r\n`, "utf8");
		manifest.installedPaths.push(cmdPath);
		return;
	}
	const shPath = join(binDir, name);
	writeFileSync(shPath, `#!/usr/bin/env sh\nexec "${process.execPath}" "${join(wakewaitHome, "scripts", scriptName)}" "$@"\n`, { mode: 0o755 });
	manifest.installedPaths.push(shPath);
}

function installHelperBin(manifest) {
	const binDir = join(wakewaitHome, "bin");
	mkdirSync(binDir, { recursive: true });
	writeLauncher(binDir, "wakewait", "wakewait.mjs", manifest);
	writeLauncher(binDir, "pi-wait-patch", "patch-pi-wait.mjs", manifest);
	return binDir;
}

function parseArgs(argv) {
	const roots = [];
	const skillRoots = [];
	let installCodexSkills = true;
	let patchRuntime = true;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--root") roots.push(argv[++i]);
		else if (arg === "--codex-home") skillRoots.push(join(resolve(argv[++i]), "skills"));
		else if (arg === "--skills-root") skillRoots.push(resolve(argv[++i]));
		else if (arg === "--no-codex-skills") installCodexSkills = false;
		else if (arg === "--no-patch") patchRuntime = false;
		else if (arg === "--help") {
			console.log("Usage: node scripts/install.mjs [--root <path>] [--codex-home <path>] [--skills-root <path>] [--no-codex-skills] [--no-patch]");
			process.exit(0);
		}
	}
	return { roots, skillRoots, installCodexSkills, patchRuntime };
}

const options = parseArgs(process.argv.slice(2));
const manifest = readJson(manifestPath, { version: 1, installedPaths: [], backups: [] });
manifest.version = 1;
manifest.installedAt = new Date().toISOString();
manifest.installedPaths = Array.from(new Set(manifest.installedPaths || []));
manifest.installedSkillRoots = Array.from(new Set(manifest.installedSkillRoots || []));
manifest.backups = manifest.backups || [];

mkdirSync(wakewaitHome, { recursive: true });
copyDir(join(repoRoot, "scripts"), join(wakewaitHome, "scripts"));
copyDir(join(repoRoot, "skills"), join(wakewaitHome, "skills"));
const binDir = installHelperBin(manifest);
const launcherPath = join(binDir, process.platform === "win32" ? "wakewait.cmd" : "wakewait");

if (options.installCodexSkills) {
	const skillRoots = detectedCodexSkillRoots(options.skillRoots);
	for (const codexSkills of skillRoots) {
		mkdirSync(codexSkills, { recursive: true });
		removeManagedSkill("auto-sleep", codexSkills);
		removeManagedSkill("deferred-wait", codexSkills);
		copyManagedSkill("wakewait", codexSkills, manifest);
		log(`installed wakewait skill to ${codexSkills}`);
	}
}

let results = [];
if (options.patchRuntime) {
	const roots = candidateRoots(options.roots);
	const packageRoots = Array.from(new Set(roots.flatMap((root) => findPiCodingAgentPackageRoots(root))));
	for (const packageRoot of packageRoots) {
		backupFile(join(packageRoot, "dist", "core", "slash-commands.js"), manifest);
		backupFile(join(packageRoot, "dist", "modes", "interactive", "interactive-mode.js"), manifest);
	}
	results = patchPiWaitRuntimeRoots(roots, { verbose: false });
}

manifest.installedPaths = Array.from(new Set(manifest.installedPaths || []));
manifest.installedSkillRoots = Array.from(new Set(manifest.installedSkillRoots || []));
writeJson(manifestPath, manifest);

if (!options.patchRuntime) {
	log("skipped optional Pi runtime patch");
} else if (results.length === 0) {
	log("no Pi runtime was patched. This is fine; WakeWait CLI and Codex skills are installed.");
	log(`to add optional /sleep and /wait-for slash commands later, run: ${launcherPath} patch --root <runtime-or-node_modules-path>`);
} else {
	for (const result of results) {
		const changed = result.files.some((file) => file.changed);
		log(`${changed ? "patched" : "already current"} optional Pi runtime ${result.packageRoot}`);
	}
}

log(`installed helper files to ${wakewaitHome}`);
log(`launcher directory: ${binDir}`);
log(`use the CLI directly from ${launcherPath}`);
log("restart Codex before relying on newly installed WakeWait skills.");
