#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const wakewaitHome = resolve(process.env.WAKEWAIT_HOME || join(homedir(), ".wakewait"));
const manifestPath = join(wakewaitHome, "install-manifest.json");
const defaultCodexHome = resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));

function log(message) {
	console.log(`[wakewait] ${message}`);
}

function readManifest() {
	try {
		return JSON.parse(readFileSync(manifestPath, "utf8"));
	} catch {
		return { installedPaths: [], installedSkillRoots: [], backups: [] };
	}
}

function pushIfExists(values, path) {
	if (path && existsSync(path)) values.push(path);
}

function splitPathList(value) {
	return String(value || "")
		.split(process.platform === "win32" ? ";" : ":")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function detectedCodexSkillRoots(manifest) {
	const explicit = [
		...(manifest.installedSkillRoots || []),
		...splitPathList(process.env.WAKEWAIT_CODEX_SKILLS),
		...splitPathList(process.env.CODEX_SKILLS_ROOT),
	];
	const roots = [
		...explicit,
		join(defaultCodexHome, "skills"),
		join(homedir(), ".codex", "skills"),
	];
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

function removeSkillCopies(manifest) {
	const skillRoots = detectedCodexSkillRoots(manifest);
	for (const skill of ["wakewait", "auto-sleep", "deferred-wait"]) {
		for (const codexSkills of skillRoots) {
			const target = join(codexSkills, skill);
			if (existsSync(join(target, ".wakewait-managed"))) {
				rmSync(target, { recursive: true, force: true });
				log(`removed ${target}`);
			}
		}
	}
}

function restoreBackups(manifest) {
	for (const backup of manifest.backups || []) {
		if (!backup.path || !backup.backupPath || !existsSync(backup.backupPath)) continue;
		mkdirSync(dirname(backup.path), { recursive: true });
		cpSync(backup.backupPath, backup.path);
		log(`restored ${backup.path}`);
	}
}

const keepState = process.argv.includes("--keep-state");
const manifest = readManifest();
restoreBackups(manifest);
removeSkillCopies(manifest);
for (const path of manifest.installedPaths || []) {
	rmSync(path, { recursive: true, force: true });
}
if (!keepState) {
	rmSync(wakewaitHome, { recursive: true, force: true });
	log("removed WakeWait home");
} else {
	log(`kept state under ${wakewaitHome}`);
}
log("WakeWait uninstalled. Restart Codex to refresh loaded skills.");
