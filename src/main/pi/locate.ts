import { accessSync, constants, existsSync, readdirSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { delimiter, dirname, join } from "node:path";
import { homedir } from "node:os";

const KNOWN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".local/bin"), join(homedir(), ".npm-global/bin")];

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Directories where a Node runtime tends to live when it is not on the login PATH. */
function nodeDirs(): string[] {
  const dirs: string[] = [];
  const nvm = join(homedir(), ".nvm/versions/node");
  if (existsSync(nvm)) {
    const versions = readdirSync(nvm).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of versions) dirs.push(join(nvm, v, "bin"));
  }
  const volta = join(homedir(), ".volta/bin");
  if (existsSync(volta)) dirs.push(volta);
  const brewOpt = "/opt/homebrew/opt";
  if (existsSync(brewOpt)) {
    for (const e of readdirSync(brewOpt)) if (e === "node" || e.startsWith("node@")) dirs.push(join(brewOpt, e, "bin"));
  }
  return dirs;
}

function searchDirs(): string[] {
  return [...(process.env.PATH ?? "").split(delimiter), ...KNOWN_DIRS, ...nodeDirs()].filter(Boolean);
}

/** Find the pi binary. An explicit override wins; otherwise PATH plus the usual macOS locations. */
export function locatePi(override: string | null): string | null {
  if (override && executable(override)) return override;
  for (const dir of searchDirs()) {
    const candidate = join(dir, "pi");
    if (executable(candidate)) return candidate;
  }
  return null;
}

/**
 * Environment for a pi process. A Dock-launched app has the bare system PATH, and `pi` is a
 * script that asks `env` for `node`, so the PATH is widened with pi's own directory and the
 * places Node is installed. The user's PATH keeps precedence.
 */
export function piEnv(piPath: string): NodeJS.ProcessEnv {
  const extra = [dirname(piPath), ...KNOWN_DIRS, ...nodeDirs()];
  const seen = new Set<string>();
  const path = [...(process.env.PATH ?? "").split(delimiter), ...extra].filter((d) => d && !seen.has(d) && seen.add(d)).join(delimiter);
  return { ...process.env, PATH: path, PI_GUI: "1" };
}

/** The oldest pi whose RPC protocol Pier understands. */
export const MIN_PI_VERSION = "0.85.0";

const versionCache = new Map<string, { mtimeMs: number; version: string | null }>();

function parseVersion(v: string): number[] {
  return v.split(".").map((n) => parseInt(n, 10) || 0);
}

function olderThan(version: string, min: string): boolean {
  const a = parseVersion(version);
  const b = parseVersion(min);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) < (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) > (b[i] ?? 0)) return false;
  }
  return false;
}

/** The version `pi --version` reports, cached until the binary changes on disk. Null when it cannot be read. */
export function piVersion(piPath: string): Promise<string | null> {
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(piPath).mtimeMs;
  } catch {
    return Promise.resolve(null);
  }
  const hit = versionCache.get(piPath);
  if (hit && hit.mtimeMs === mtimeMs) return Promise.resolve(hit.version);
  return new Promise((resolve) => {
    execFile(piPath, ["--version"], { env: piEnv(piPath), timeout: 10000 }, (err, stdout) => {
      const version = err ? null : (/(\d+\.\d+\.\d+)/.exec(stdout)?.[1] ?? null);
      versionCache.set(piPath, { mtimeMs, version });
      resolve(version);
    });
  });
}

/** A message explaining why this pi cannot be used, or null when it is new enough. */
export async function piVersionProblem(piPath: string): Promise<string | null> {
  const version = await piVersion(piPath);
  if (version === null) return `Could not read the version of pi at ${piPath}. Pier needs pi ${MIN_PI_VERSION} or newer.`;
  if (olderThan(version, MIN_PI_VERSION)) return `pi ${version} at ${piPath} is too old. Pier needs pi ${MIN_PI_VERSION} or newer.`;
  return null;
}
