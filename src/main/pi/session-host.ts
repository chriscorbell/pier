import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { ExtensionUiResponse, PiCommandResult, PiEvent, PiState, SessionLiveState, SessionStatus } from "@shared/contract";
import { RpcClient } from "./rpc-client";
import { locatePi, piVersionProblem } from "./locate";
import { loadSettings } from "../settings";
import { logError } from "../log";
import { play } from "../sound";

const POOL_SIZE = 3;
const SOUND_MIN_SECONDS = 15;

interface Host {
  key: string;
  cwd: string;
  path: string | null;
  client: RpcClient | null;
  working: boolean;
  pendingDialogs: Set<string>;
  unread: boolean;
  crashed: string | null;
  lastUsed: number;
  runStartedAt: number | null;
  evicting: boolean;
}

export interface SessionHostEvents {
  event: [{ key: string; event: PiEvent }];
  live: [SessionLiveState];
}

/**
 * Owns every pi process. One process per open Session, a small pool of idle ones kept warm.
 * Also the single place that knows which Session is selected and whether the window is focused,
 * which is what Unread and the sounds depend on.
 */
export class SessionHost extends EventEmitter<SessionHostEvents> {
  private hosts = new Map<string, Host>();
  private selectedKey: string | null = null;
  private windowFocused = true;

  // ---- focus & selection ----

  setWindowFocused(focused: boolean): void {
    this.windowFocused = focused;
    if (focused && this.selectedKey) this.markRead(this.selectedKey);
  }

  select(key: string | null): void {
    this.selectedKey = key;
    if (key) {
      const h = this.hosts.get(key);
      if (h) h.lastUsed = Date.now();
      if (this.windowFocused) this.markRead(key);
    }
  }

  private isViewing(key: string): boolean {
    return this.windowFocused && this.selectedKey === key;
  }

  private markRead(key: string): void {
    const h = this.hosts.get(key);
    if (h?.unread) {
      h.unread = false;
      this.emitLive(h);
    }
  }

  // ---- queries ----

  liveStates(): SessionLiveState[] {
    return [...this.hosts.values()].map((h) => this.toLive(h));
  }

  live(key: string): SessionLiveState | null {
    const h = this.hosts.get(key);
    return h ? this.toLive(h) : null;
  }

  attentionCount(): number {
    let n = 0;
    for (const h of this.hosts.values()) if (h.unread || h.pendingDialogs.size > 0) n++;
    return n;
  }

  private status(h: Host): SessionStatus {
    if (h.pendingDialogs.size > 0) return "needs-input";
    if (h.working) return "working";
    if (h.unread) return "unread";
    return "idle";
  }

  private toLive(h: Host): SessionLiveState {
    return {
      key: h.key,
      status: this.status(h),
      running: h.client?.alive === true,
      cwd: h.cwd,
      path: h.path,
      crashed: h.crashed,
    };
  }

  private emitLive(h: Host): void {
    this.emit("live", this.toLive(h));
  }

  // ---- lifecycle ----

  /** Open an existing Session file, or start a new Session in `cwd` when `path` is null. */
  async open(cwd: string, path: string | null): Promise<SessionLiveState> {
    const existing = path ? this.hosts.get(path) : undefined;
    if (existing) {
      existing.lastUsed = Date.now();
      if (!existing.client?.alive) await this.spawn(existing);
      return this.toLive(existing);
    }
    const host: Host = {
      key: path ?? `pending:${randomUUID()}`,
      cwd,
      path,
      client: null,
      working: false,
      pendingDialogs: new Set(),
      unread: false,
      crashed: null,
      lastUsed: Date.now(),
      runStartedAt: null,
      evicting: false,
    };
    this.hosts.set(host.key, host);
    await this.spawn(host);
    return this.toLive(host);
  }

  private async spawn(host: Host): Promise<void> {
    this.evictIdle();
    const piPath = locatePi(loadSettings().piPath);
    if (!piPath) {
      host.crashed = "pi was not found. Set its path in settings.";
      this.emitLive(host);
      return;
    }
    const problem = await piVersionProblem(piPath);
    if (problem) {
      host.crashed = problem;
      this.emitLive(host);
      return;
    }
    host.crashed = null;
    const args = host.path ? ["--session", host.path] : [];
    const client = new RpcClient(piPath, host.cwd, args);
    host.client = client;
    client.on("event", (event) => this.onEvent(host, event));
    client.on("exit", ({ code, signal, stderr }) => {
      if (host.client !== client) return;
      host.client = null;
      host.working = false;
      host.pendingDialogs.clear();
      if (!host.evicting) {
        host.crashed = `pi exited (${signal ?? code ?? "unknown"}).${stderr ? "\n" + stderr.trim() : ""}`;
        logError("pi", `${host.cwd}: ${host.crashed}`);
      }
      host.evicting = false;
      this.emitLive(host);
    });
    // Learn the session file and whether a turn is already running.
    const state = await client.send({ type: "get_state" });
    if (state.success) {
      const data = state.data as PiState;
      if (data.sessionFile) host.path = data.sessionFile;
      host.working = data.isStreaming;
    }
    this.emitLive(host);
  }

  /** Keep at most POOL_SIZE idle processes alive. The selected Session and working ones are never evicted. */
  private evictIdle(): void {
    const idle = [...this.hosts.values()].filter(
      (h) => h.client?.alive && !h.working && h.pendingDialogs.size === 0 && h.key !== this.selectedKey,
    );
    idle.sort((a, b) => a.lastUsed - b.lastUsed);
    while (idle.length >= POOL_SIZE) {
      const victim = idle.shift()!;
      this.stop(victim);
    }
  }

  private stop(host: Host): void {
    if (!host.client) return;
    host.evicting = true;
    host.client.kill();
  }

  close(key: string): void {
    const h = this.hosts.get(key);
    if (!h) return;
    this.stop(h);
  }

  /** Forget a Session entirely (after its file was trashed). */
  forget(key: string): void {
    const h = this.hosts.get(key);
    if (!h) return;
    this.stop(h);
    this.hosts.delete(key);
    if (this.selectedKey === key) this.selectedKey = null;
  }

  async restart(key: string): Promise<SessionLiveState | null> {
    const h = this.hosts.get(key);
    if (!h) return null;
    this.stop(h);
    await this.spawn(h);
    return this.toLive(h);
  }

  shutdown(): void {
    for (const h of this.hosts.values()) this.stop(h);
  }

  // ---- commands ----

  async command(key: string, command: Record<string, unknown>): Promise<PiCommandResult> {
    const h = this.hosts.get(key);
    if (!h?.client?.alive) return { success: false, error: "pi is not running for this session" };
    h.lastUsed = Date.now();
    const result = await h.client.send(command);
    if (command.type === "get_state" && result.success) {
      const data = result.data as PiState;
      if (data.sessionFile && data.sessionFile !== h.path) {
        h.path = data.sessionFile;
        this.emitLive(h);
      }
    }
    return result;
  }

  respondToDialog(key: string, id: string, response: ExtensionUiResponse): void {
    const h = this.hosts.get(key);
    if (!h?.client) return;
    h.client.write({ type: "extension_ui_response", id, ...response });
    if (h.pendingDialogs.delete(id)) this.emitLive(h);
  }

  // ---- events ----

  private onEvent(host: Host, event: PiEvent): void {
    let changed = false;
    switch (event.type) {
      case "agent_start":
        if (!host.working) {
          host.working = true;
          host.runStartedAt = Date.now();
          changed = true;
        }
        break;
      case "agent_settled": {
        host.working = false;
        changed = true;
        const elapsed = host.runStartedAt ? (Date.now() - host.runStartedAt) / 1000 : 0;
        host.runStartedAt = null;
        if (!this.isViewing(host.key)) {
          host.unread = true;
          if (elapsed >= SOUND_MIN_SECONDS) play("turnEnd");
        }
        break;
      }
      case "extension_ui_request": {
        const method = event.method as string;
        if (method === "select" || method === "confirm" || method === "input" || method === "editor") {
          host.pendingDialogs.add(event.id as string);
          changed = true;
          if (!this.isViewing(host.key)) play("needsInput");
        }
        break;
      }
    }
    this.emit("event", { key: host.key, event });
    if (changed) this.emitLive(host);
  }
}
