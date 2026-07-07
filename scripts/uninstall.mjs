#!/usr/bin/env node
import { existsSync, readFileSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const wakewaitHome = resolve(process.env.WAKEWAIT_HOME || join(homedir(), ".wakewait"));
const manifestPath = join(wakewaitHome, "install-manifest.json");
const feynmanHome = resolve(process.env.FEYNMAN_HOME || join(homedir(), ".feynman"));
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
  for (const root of [
    join(feynmanHome, "agent", "skills"),
    join(codexHome, "skills")
  ]) {
    for (const skill of ["auto-sleep", "deferred-wait"]) {
      rmSync(join(root, skill), { recursive: true, force: true });
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
}
log("WakeWait uninstalled. Restart Feynman/Codex to refresh loaded skills and runtime files.");
