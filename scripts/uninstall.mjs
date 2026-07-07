#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const wakewaitHome = resolve(process.env.WAKEWAIT_HOME || join(homedir(), ".wakewait"));
const manifestPath = join(wakewaitHome, "install-manifest.json");
const codexHome = resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));

function log(message) {
	console.log(`[wakewait] ${message}`);
}

function readManifest() {
	try {
		return JSON.parse(readFileSync(manifestPath, "utf8"));
	} catch {
		return { installedPaths: [], backups: [] };
	}
}

function removeSkillCopies() {
	const codexSkills = join(codexHome, "skills");
	for (const skill of ["auto-sleep", "deferred-wait"]) {
		const target = join(codexSkills, skill);
		if (existsSync(join(target, ".wakewait-managed"))) {
			rmSync(target, { recursive: true, force: true });
			log(`removed ${target}`);
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
removeSkillCopies();
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
