#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findPiCodingAgentPackageRoots, patchPiWaitRuntimeRoots } from "./patch-pi-wait.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wakewaitHome = resolve(process.env.WAKEWAIT_HOME || join(homedir(), ".wakewait"));
const manifestPath = join(wakewaitHome, "install-manifest.json");
const feynmanHome = resolve(process.env.FEYNMAN_HOME || join(homedir(), ".feynman"));
const codexHome = resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));

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
}

function npmRootGlobal() {
  const result = spawnSync("npm", ["root", "-g"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 ? result.stdout.trim() : "";
}

function pushIfExists(values, path) {
  if (path && existsSync(path)) values.push(path);
}

function childrenMatching(parent, prefix) {
  if (!parent || !existsSync(parent)) return [];
  return readdirSync(parent)
    .map((name) => join(parent, name))
    .filter((path) => {
      try {
        return statSync(path).isDirectory() && basename(path).startsWith(prefix);
      } catch {
        return false;
      }
    });
}

function candidateRoots(extraRoots) {
  const roots = [...extraRoots, process.cwd(), repoRoot];
  pushIfExists(roots, join(feynmanHome, "npm-global", "lib", "node_modules"));
  pushIfExists(roots, join(feynmanHome, "npm", "node_modules"));
  pushIfExists(roots, npmRootGlobal());
  if (process.platform === "win32") {
    for (const bundle of childrenMatching(join(process.env.LOCALAPPDATA || "", "Programs", "feynman"), "feynman-")) {
      pushIfExists(roots, join(bundle, "app", "node_modules"));
      pushIfExists(roots, join(bundle, "app", ".feynman", "npm", "node_modules"));
      pushIfExists(roots, join(bundle, "app"));
    }
  } else {
    for (const bundle of childrenMatching(join(homedir(), ".local", "share", "feynman"), "feynman-")) {
      pushIfExists(roots, join(bundle, "app", "node_modules"));
      pushIfExists(roots, join(bundle, "app", ".feynman", "npm", "node_modules"));
      pushIfExists(roots, join(bundle, "app"));
    }
  }
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

function installHelperBin(manifest) {
  const binDir = join(wakewaitHome, "bin");
  mkdirSync(binDir, { recursive: true });
  if (process.platform === "win32") {
    const cmdPath = join(binDir, "pi-wait-patch.cmd");
    writeFileSync(cmdPath, `@echo off\r\n"${process.execPath}" "${join(wakewaitHome, "scripts", "patch-pi-wait.mjs")}" %*\r\n`, "utf8");
    manifest.installedPaths.push(cmdPath);
  } else {
    const shPath = join(binDir, "pi-wait-patch");
    writeFileSync(shPath, `#!/usr/bin/env sh\nexec "${process.execPath}" "${join(wakewaitHome, "scripts", "patch-pi-wait.mjs")}" "$@"\n`, { mode: 0o755 });
    manifest.installedPaths.push(shPath);
  }
}

function installRuntimeCompanionFiles(manifest) {
  const appRoots = [];
  if (process.platform === "win32") {
    for (const bundle of childrenMatching(join(process.env.LOCALAPPDATA || "", "Programs", "feynman"), "feynman-")) {
      pushIfExists(appRoots, join(bundle, "app"));
    }
  } else {
    for (const bundle of childrenMatching(join(homedir(), ".local", "share", "feynman"), "feynman-")) {
      pushIfExists(appRoots, join(bundle, "app"));
    }
  }
  for (const appRoot of appRoots) {
    const scriptTarget = join(appRoot, "scripts", "patch-pi-wait.mjs");
    const libTarget = join(appRoot, "scripts", "lib", "pi-sleep-patch.mjs");
    backupFile(scriptTarget, manifest);
    backupFile(libTarget, manifest);
    mkdirSync(dirname(scriptTarget), { recursive: true });
    mkdirSync(dirname(libTarget), { recursive: true });
    cpSync(join(repoRoot, "scripts", "patch-pi-wait.mjs"), scriptTarget);
    cpSync(join(repoRoot, "scripts", "lib", "pi-sleep-patch.mjs"), libTarget);
    manifest.installedPaths.push(scriptTarget, libTarget);
  }
}

function parseArgs(argv) {
  const roots = [];
  let installCodexSkills = true;
  let installFeynmanSkills = true;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") roots.push(argv[++i]);
    else if (arg === "--no-codex-skills") installCodexSkills = false;
    else if (arg === "--no-feynman-skills") installFeynmanSkills = false;
    else if (arg === "--help") {
      console.log("Usage: node scripts/install.mjs [--root <path>] [--no-codex-skills] [--no-feynman-skills]");
      process.exit(0);
    }
  }
  return { roots, installCodexSkills, installFeynmanSkills };
}

const options = parseArgs(process.argv.slice(2));
const manifest = readJson(manifestPath, { version: 1, installedPaths: [], backups: [] });
manifest.version = 1;
manifest.installedAt = new Date().toISOString();
manifest.installedPaths = Array.from(new Set(manifest.installedPaths || []));
manifest.backups = manifest.backups || [];

mkdirSync(wakewaitHome, { recursive: true });
copyDir(join(repoRoot, "scripts"), join(wakewaitHome, "scripts"));
copyDir(join(repoRoot, "skills"), join(wakewaitHome, "skills"));
installHelperBin(manifest);

if (options.installFeynmanSkills) {
  const feynmanSkills = join(feynmanHome, "agent", "skills");
  mkdirSync(feynmanSkills, { recursive: true });
  copyManagedSkill("auto-sleep", feynmanSkills, manifest);
  copyManagedSkill("deferred-wait", feynmanSkills, manifest);
  log(`installed Feynman skills to ${feynmanSkills}`);
}

if (options.installCodexSkills) {
  const codexSkills = join(codexHome, "skills");
  mkdirSync(codexSkills, { recursive: true });
  copyManagedSkill("auto-sleep", codexSkills, manifest);
  copyManagedSkill("deferred-wait", codexSkills, manifest);
  log(`installed Codex skills to ${codexSkills}`);
}

const roots = candidateRoots(options.roots);
const packageRoots = Array.from(new Set(roots.flatMap((root) => findPiCodingAgentPackageRoots(root))));
for (const packageRoot of packageRoots) {
  backupFile(join(packageRoot, "dist", "core", "slash-commands.js"), manifest);
  backupFile(join(packageRoot, "dist", "modes", "interactive", "interactive-mode.js"), manifest);
}
installRuntimeCompanionFiles(manifest);
const results = patchPiWaitRuntimeRoots(roots, { verbose: false });
writeJson(manifestPath, manifest);

if (results.length === 0) {
  log("no Pi runtime was patched. Feynman may need to be launched once, or pass --root <path>.");
} else {
  for (const result of results) {
    const changed = result.files.some((file) => file.changed);
    log(`${changed ? "patched" : "already current"} ${result.packageRoot}`);
  }
}
log(`installed helper files to ${wakewaitHome}`);
log("restart Feynman/Codex before using WakeWait.");
