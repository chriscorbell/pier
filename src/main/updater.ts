import { app, shell } from "electron";
import { EventEmitter } from "node:events";
import { createWriteStream, renameSync } from "node:fs";
import { mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { UpdateState } from "@shared/contract";
import { logError } from "./log";

const run = promisify(execFile);
const REPO = "chriscorbell/pier";
const CHECK_INTERVAL_MS = 60 * 1000;
/** Download progress is reported at most this often; the renderer animates between reports. */
const PROGRESS_INTERVAL_MS = 100;

interface Release {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}

function parseVersion(v: string): number[] {
  return v
    .replace(/^v/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}

function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Self-update for an unsigned macOS app. electron-updater needs a code-signed bundle, so this
 * checks GitHub Releases directly, downloads the arm64 zip, swaps the .app in place, and relaunches.
 * The download is written by Node, so the new bundle carries no quarantine flag.
 */
export class Updater extends EventEmitter<{ state: [UpdateState] }> {
  state: UpdateState = { status: "idle", currentVersion: app.getVersion() };
  private timer: NodeJS.Timeout | null = null;
  private release: Release | null = null;
  private installedPath: string | null = null;

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.emit("state", this.state);
  }

  start(): void {
    if (!app.isPackaged) return;
    if (this.renameBundleIfNeeded()) return;
    // Bundles displaced by earlier updates sit beside us. macOS App Management does not let an app
    // delete files inside another app bundle, but moving the bundle is allowed, so they go to the
    // Trash. The previous process may still be exiting as this one starts, hence the retries.
    const appPath = process.execPath.split(".app/")[0] + ".app";
    const parent = dirname(appPath);
    const prefix = `.${basename(appPath)}.old`;
    const sweep = async () => {
      const entries = await readdir(parent).catch(() => [] as string[]);
      for (const e of entries) {
        if (!e.startsWith(prefix)) continue;
        const path = join(parent, e);
        await shell.trashItem(path).catch(() => rm(path, { recursive: true, force: true }).catch(() => {}));
      }
    };
    for (const delay of [2000, 15000, 60000]) setTimeout(() => void sweep(), delay).unref();
    void this.check(true);
    this.timer = setInterval(() => void this.check(true), CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  /**
   * An update installed by an older build lands at the old bundle path, so after a product rename
   * the file on disk can be Pi.app while the app inside is Pier. Move it to its proper name and
   * relaunch from there. Returns true when a relaunch was started.
   */
  private renameBundleIfNeeded(): boolean {
    const appPath = process.execPath.split(".app/")[0] + ".app";
    const desired = join(dirname(appPath), `${app.name}.app`);
    if (appPath === desired) return false;
    try {
      renameSync(appPath, desired);
    } catch {
      return false;
    }
    execFile("open", ["-n", desired], () => app.exit(0));
    return true;
  }

  async check(silent = false): Promise<void> {
    if (this.state.status === "downloading" || this.state.status === "installing" || this.state.status === "ready") return;
    if (!app.isPackaged) {
      this.set({ status: "idle", error: "Updates apply to the installed app, not the dev build." });
      return;
    }
    // Only a manual check shows its spinner; the periodic one would tick the footer every minute.
    if (!silent) this.set({ status: "checking", error: undefined });
    try {
      // The check runs every minute, which would exhaust the unauthenticated API quota (60/hour).
      // The releases/latest page redirects to the tag without touching the API; only a newer tag
      // costs an API call for the asset list.
      const head = await fetch(`https://github.com/${REPO}/releases/latest`, {
        method: "HEAD",
        redirect: "manual",
        headers: { "User-Agent": `pier/${app.getVersion()}` },
      });
      const location = head.headers.get("location") ?? "";
      const tag = /\/releases\/tag\/([^/?#]+)/.exec(location)?.[1];
      if (!tag) throw new Error(`GitHub responded ${head.status} without a release tag`);
      const version = decodeURIComponent(tag).replace(/^v/, "");
      if (!isNewer(version, app.getVersion())) {
        this.set({ status: "idle", latestVersion: version, checkedAt: Date.now() });
        return;
      }
      if (this.release?.tag_name.replace(/^v/, "") !== version) {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: { Accept: "application/vnd.github+json", "User-Agent": `pier/${app.getVersion()}` },
        });
        if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
        this.release = (await res.json()) as Release;
      }
      const release = this.release;
      const asset = release.assets.find((a) => /arm64.*\.zip$/i.test(a.name));
      if (!asset) throw new Error(`Release ${release.tag_name} has no arm64 zip`);
      this.set({ status: "available", latestVersion: version, releaseUrl: release.html_url, checkedAt: Date.now() });
    } catch (err) {
      logError("update-check", err);
      this.set({ status: "idle", error: silent ? undefined : String((err as Error).message ?? err), checkedAt: Date.now() });
    }
  }

  async install(): Promise<void> {
    const release = this.release;
    if (!release || this.state.status !== "available") return;
    const asset = release.assets.find((a) => /arm64.*\.zip$/i.test(a.name))!;
    const appPath = join(process.execPath.split(".app/")[0] + ".app");
    const parent = dirname(appPath);
    this.set({ status: "downloading", progress: 0, error: undefined });
    let work: string | null = null;
    try {
      // The bundle's parent must be writable for the swap; /Applications usually is for the owner.
      await run("test", ["-w", parent]).catch(() => {
        throw new Error(`${parent} is not writable, move the app to a folder you own or install manually.`);
      });
      work = await mkdtemp(join(tmpdir(), "pi-update-"));
      const zipPath = join(work, asset.name);
      const res = await fetch(asset.browser_download_url, { headers: { "User-Agent": `pier/${app.getVersion()}` } });
      if (!res.ok || !res.body) throw new Error(`Download failed with ${res.status}`);
      let received = 0;
      let reportedAt = 0;
      const total = asset.size;
      const progress = new (await import("node:stream")).Transform({
        transform: (chunk, _enc, cb) => {
          received += chunk.length;
          const now = Date.now();
          if (total && now - reportedAt >= PROGRESS_INTERVAL_MS) {
            reportedAt = now;
            this.set({ progress: Math.min(1, received / total) });
          }
          cb(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(res.body as never), progress, createWriteStream(zipPath));
      const size = (await stat(zipPath)).size;
      if (total && size !== total) throw new Error(`Downloaded ${size} bytes, expected ${total}`);
      this.set({ status: "installing", progress: 1 });

      // ditto keeps symlinks and resource forks inside the bundle, unzip does not.
      const extractDir = join(work, "extracted");
      await run("ditto", ["-x", "-k", zipPath, extractDir]);
      const entries = await readdir(extractDir);
      const bundle = entries.find((e) => e.endsWith(".app"));
      if (!bundle) throw new Error("The zip did not contain an app bundle");
      const newApp = join(extractDir, bundle);

      // Swap: move the running bundle aside under a unique name, then move the new one into place
      // under its own name, which differs from ours only across a product rename.
      const targetApp = join(parent, bundle);
      const oldApp = join(parent, `.${basename(appPath)}.old-${Date.now()}`);
      await rename(appPath, oldApp);
      try {
        await rename(newApp, targetApp);
      } catch (err) {
        await rename(oldApp, appPath);
        throw err;
      }
      // The old bundle still backs the running process and cannot be fully deleted until we exit;
      // start() removes it on the next launch.
      this.installedPath = targetApp;
      this.set({ status: "ready", progress: 1 });
    } catch (err) {
      logError("update-install", err);
      this.set({ status: "available", error: String((err as Error).message ?? err), progress: undefined });
    } finally {
      if (work) await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }

  restart(): void {
    if (this.state.status !== "ready") return;
    const current = process.execPath.split(".app/")[0] + ".app";
    if (this.installedPath && this.installedPath !== current) {
      // relaunch() reuses our executable path, which no longer exists under that name.
      execFile("open", ["-n", this.installedPath], () => app.exit(0));
      return;
    }
    app.relaunch();
    app.exit(0);
  }

  openRelease(): void {
    if (this.state.releaseUrl) void shell.openExternal(this.state.releaseUrl);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
