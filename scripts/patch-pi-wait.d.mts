export interface PiWaitPatchOptions {
	dryRun?: boolean;
}

export interface PiWaitPatchFileResult {
	path: string;
	changed: boolean;
	missing: boolean;
}

export interface PiWaitPatchPackageResult {
	packageRoot: string;
	files: PiWaitPatchFileResult[];
}

export interface PiWaitState {
	version: number;
	tasks: Record<string, Record<string, unknown>>;
}

export interface PiWaitTaskSummary extends Record<string, unknown> {
	id?: string;
	status?: string;
	remainingMs?: number;
	nextCheckInMs?: number;
}

export function defaultPiWaitPatchRoots(cwd?: string): string[];
export function findPiCodingAgentPackageRoots(root: string): string[];
export function patchPiWaitRuntimeRoots(roots: string[], options?: PiWaitPatchOptions): PiWaitPatchPackageResult[];
export function defaultPiWaitStatePath(cwd?: string): string;
export function readPiWaitState(statePath?: string): PiWaitState;
export function writePiWaitState(statePath: string, state: PiWaitState): void;
export function listPiWaitTasks(statePath?: string, now?: number): PiWaitTaskSummary[];
export function cancelPiWaitTasks(ids: string[], statePath?: string, now?: Date): string[];
export function runPiWaitWorker(id: string, options?: { statePath?: string }): Promise<void>;
