import { create } from "zustand";
import type {
  ContentBlock,
  ExtensionUiRequest,
  ExtensionUiResponse,
  GuiSettings,
  PiCommandInfo,
  PiEvent,
  PiModel,
  PiState,
  ProjectSummary,
  SessionEntry,
  SessionLiveState,
  SessionStats,
  UpdateState,
} from "@shared/contract";
import { DEFAULT_SETTINGS } from "@shared/contract";
import { bridge } from "@/lib/bridge";

export interface ToolRun {
  status: "running" | "done";
  partial: string;
  isError?: boolean;
}

export interface PartialMessage {
  content: ContentBlock[];
  /** Raw argument JSON accumulated per content index while a tool call streams. */
  toolArgs: Record<number, string>;
}

export type DialogRequest = Extract<ExtensionUiRequest, { method: "select" | "confirm" | "input" | "editor" }>;

export interface SessionData {
  key: string;
  cwd: string;
  path: string | null;
  loading: boolean;
  entries: SessionEntry[];
  leafId: string | null;
  partial: PartialMessage | null;
  toolRuns: Record<string, ToolRun>;
  queue: { steering: string[]; followUp: string[] };
  state: PiState | null;
  models: PiModel[];
  thinkingLevels: string[];
  commands: PiCommandInfo[];
  stats: SessionStats | null;
  statuses: Record<string, string>;
  widgets: Record<string, string[]>;
  dialogs: DialogRequest[];
  editorText: string | null;
  retry: { attempt: number; maxAttempts: number; error: string } | null;
  compacting: boolean;
  draft: string;
}

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "warning" | "error";
  leaving?: boolean;
}

interface AppState {
  ready: boolean;
  settings: GuiSettings;
  projects: ProjectSummary[];
  live: Record<string, SessionLiveState>;
  sessions: Record<string, SessionData>;
  selectedKey: string | null;
  windowFocused: boolean;
  toasts: Toast[];
  settingsOpen: boolean;
  update: UpdateState;

  init: () => Promise<void>;
  updateSettings: (patch: Partial<GuiSettings>) => Promise<void>;
  refreshProjects: () => Promise<void>;
  openFolder: () => Promise<void>;
  openSession: (cwd: string, path: string | null) => Promise<void>;
  selectSession: (key: string | null) => Promise<void>;
  trashSession: (key: string, path: string) => Promise<void>;
  restartSession: (key: string) => Promise<void>;

  sendPrompt: (key: string, text: string, images: { data: string; mimeType: string }[]) => Promise<void>;
  abort: (key: string) => Promise<void>;
  abortRetry: (key: string) => Promise<void>;
  removeQueued: (key: string, kind: "steering" | "followUp", index: number) => Promise<void>;
  promoteToSteering: (key: string, index: number) => Promise<void>;
  setModel: (key: string, provider: string, modelId: string) => Promise<void>;
  setThinking: (key: string, level: string) => Promise<void>;
  compact: (key: string, instructions?: string) => Promise<void>;
  renameSession: (key: string, name: string) => Promise<void>;
  respondDialog: (key: string, id: string, response: ExtensionUiResponse) => Promise<void>;
  setDraft: (key: string, draft: string) => void;
  clearEditorText: (key: string) => void;

  pushToast: (message: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;
  setSettingsOpen: (open: boolean) => void;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  restartForUpdate: () => Promise<void>;
}

/** Host key for a Session file path: the live entry that owns that path, else the path itself. */
export function keyForPath(live: Record<string, SessionLiveState>, path: string): string {
  for (const s of Object.values(live)) if (s.path === path) return s.key;
  return path;
}

function emptySession(key: string, cwd: string, path: string | null): SessionData {
  return {
    key,
    cwd,
    path,
    loading: true,
    entries: [],
    leafId: null,
    partial: null,
    toolRuns: {},
    queue: { steering: [], followUp: [] },
    state: null,
    models: [],
    thinkingLevels: [],
    commands: [],
    stats: null,
    statuses: {},
    widgets: {},
    dialogs: [],
    editorText: null,
    retry: null,
    compacting: false,
    draft: "",
  };
}

let toastSeq = 0;
// StrictMode mounts App twice in dev; the bridge listeners must only ever be attached once.
let initStarted = false;

// Text deltas arrive many times per second. Buffer them and flush once per frame.
const deltaBuffer = new Map<string, { index: number; kind: "text" | "thinking" | "toolArgs"; text: string }[]>();
let flushScheduled = false;

export const useApp = create<AppState>((set, get) => {
  const patchSession = (key: string, patch: Partial<SessionData> | ((s: SessionData) => Partial<SessionData>)) => {
    set((st) => {
      const s = st.sessions[key];
      if (!s) return st;
      const p = typeof patch === "function" ? patch(s) : patch;
      return { sessions: { ...st.sessions, [key]: { ...s, ...p } } };
    });
  };

  const flushDeltas = () => {
    flushScheduled = false;
    for (const [key, deltas] of deltaBuffer) {
      patchSession(key, (s) => {
        if (!s.partial) return {};
        const content = s.partial.content.slice();
        const toolArgs = { ...s.partial.toolArgs };
        for (const d of deltas) {
          if (d.kind === "toolArgs") {
            toolArgs[d.index] = (toolArgs[d.index] ?? "") + d.text;
            continue;
          }
          const block = content[d.index];
          if (d.kind === "text") {
            content[d.index] = { type: "text", text: (block?.type === "text" ? block.text : "") + d.text };
          } else {
            content[d.index] = { type: "thinking", thinking: (block?.type === "thinking" ? block.thinking : "") + d.text };
          }
        }
        return { partial: { content, toolArgs } };
      });
    }
    deltaBuffer.clear();
  };

  const queueDelta = (key: string, d: { index: number; kind: "text" | "thinking" | "toolArgs"; text: string }) => {
    let list = deltaBuffer.get(key);
    if (!list) deltaBuffer.set(key, (list = []));
    list.push(d);
    if (!flushScheduled) {
      flushScheduled = true;
      requestAnimationFrame(flushDeltas);
    }
  };

  const refreshEntries = async (key: string) => {
    const s = get().sessions[key];
    if (!s) return;
    const since = s.entries.length ? s.entries[s.entries.length - 1].id : undefined;
    const res = await bridge.pi.command<{ entries: SessionEntry[]; leafId: string | null }>(key, {
      type: "get_entries",
      ...(since ? { since } : {}),
    });
    if (!res.success || !res.data) {
      if (since) {
        // The cursor is unknown to pi (session switched or compacted away). Reload from scratch.
        const full = await bridge.pi.command<{ entries: SessionEntry[]; leafId: string | null }>(key, { type: "get_entries" });
        if (full.success && full.data) patchSession(key, { entries: full.data.entries, leafId: full.data.leafId });
      }
      return;
    }
    const data = res.data;
    patchSession(key, (cur) => {
      if (!since) return { entries: data.entries, leafId: data.leafId };
      // Two refreshes can overlap (message_end and turn_end); never append an id twice.
      const seen = new Set(cur.entries.map((e) => e.id));
      return { entries: [...cur.entries, ...data.entries.filter((e) => !seen.has(e.id))], leafId: data.leafId };
    });
  };

  const refreshState = async (key: string) => {
    const res = await bridge.pi.command<PiState>(key, { type: "get_state" });
    if (res.success && res.data) patchSession(key, { state: res.data, path: res.data.sessionFile ?? get().sessions[key]?.path ?? null });
  };

  const refreshStats = async (key: string) => {
    const res = await bridge.pi.command<SessionStats>(key, { type: "get_session_stats" });
    if (res.success && res.data) patchSession(key, { stats: res.data });
  };

  const refreshThinkingLevels = async (key: string) => {
    const res = await bridge.pi.command<{ levels: string[] }>(key, { type: "get_available_thinking_levels" });
    if (res.success && res.data) patchSession(key, { thinkingLevels: res.data.levels });
  };

  const handleEvent = (key: string, event: PiEvent) => {
    const s = get().sessions[key];
    if (!s) return;
    switch (event.type) {
      case "message_start": {
        const msg = event.message as { role?: string } | undefined;
        if (msg?.role === "assistant") patchSession(key, { partial: { content: [], toolArgs: {} } });
        break;
      }
      case "message_update": {
        const ev = event.assistantMessageEvent as Record<string, unknown> | undefined;
        if (!ev) break;
        const index = ev.contentIndex as number;
        switch (ev.type) {
          case "text_start":
            queueDelta(key, { index, kind: "text", text: "" });
            break;
          case "text_delta":
            queueDelta(key, { index, kind: "text", text: ev.delta as string });
            break;
          case "thinking_start":
            queueDelta(key, { index, kind: "thinking", text: "" });
            break;
          case "thinking_delta":
            queueDelta(key, { index, kind: "thinking", text: ev.delta as string });
            break;
          case "toolcall_start":
            flushDeltas();
            patchSession(key, (cur) => {
              if (!cur.partial) return {};
              const content = cur.partial.content.slice();
              content[index] = { type: "toolCall", id: ev.id as string, name: ev.toolName as string, arguments: {} };
              return { partial: { ...cur.partial, content } };
            });
            break;
          case "toolcall_delta":
            queueDelta(key, { index, kind: "toolArgs", text: ev.delta as string });
            break;
          case "toolcall_end":
            flushDeltas();
            patchSession(key, (cur) => {
              if (!cur.partial) return {};
              const content = cur.partial.content.slice();
              const tc = ev.toolCall as { id: string; name: string; arguments: Record<string, unknown> };
              content[index] = { type: "toolCall", id: tc.id, name: tc.name, arguments: tc.arguments };
              return { partial: { ...cur.partial, content } };
            });
            break;
        }
        break;
      }
      case "message_end": {
        flushDeltas();
        const msg = event.message as { role?: string } | undefined;
        if (msg?.role === "assistant") {
          patchSession(key, { partial: null });
          // Usage arrives with the finished response, so the context meter can move now instead of at turn end.
          void refreshStats(key);
        }
        void refreshEntries(key);
        break;
      }
      case "tool_execution_start":
        patchSession(key, (cur) => ({
          toolRuns: { ...cur.toolRuns, [event.toolCallId as string]: { status: "running", partial: "" } },
        }));
        break;
      case "tool_execution_update": {
        const pr = event.partialResult as { content?: { type: string; text?: string }[] } | undefined;
        const text = pr?.content?.map((c) => (c.type === "text" ? c.text ?? "" : "")).join("") ?? "";
        patchSession(key, (cur) => ({
          toolRuns: { ...cur.toolRuns, [event.toolCallId as string]: { status: "running", partial: text } },
        }));
        break;
      }
      case "tool_execution_end":
        patchSession(key, (cur) => ({
          toolRuns: {
            ...cur.toolRuns,
            [event.toolCallId as string]: { status: "done", partial: "", isError: event.isError === true },
          },
        }));
        break;
      case "queue_update":
        patchSession(key, {
          queue: { steering: (event.steering as string[]) ?? [], followUp: (event.followUp as string[]) ?? [] },
        });
        break;
      case "agent_start":
        patchSession(key, { retry: null });
        void refreshState(key);
        break;
      case "turn_end":
        void refreshEntries(key);
        void refreshStats(key);
        break;
      case "agent_settled":
        flushDeltas();
        patchSession(key, { partial: null, retry: null });
        void refreshEntries(key);
        void refreshState(key);
        void refreshStats(key);
        break;
      case "compaction_start":
        patchSession(key, { compacting: true });
        break;
      case "compaction_end":
        patchSession(key, { compacting: false });
        void refreshEntries(key);
        void refreshStats(key);
        break;
      case "auto_retry_start":
        patchSession(key, {
          retry: { attempt: event.attempt as number, maxAttempts: event.maxAttempts as number, error: String(event.errorMessage ?? "") },
        });
        break;
      case "auto_retry_end":
        if (event.success === false) get().pushToast(`Gave up after ${event.attempt} retries: ${String(event.finalError ?? "")}`, "error");
        patchSession(key, { retry: null });
        break;
      case "extension_error":
        get().pushToast(`Extension error (${String(event.event)}): ${String(event.error)}`, "error");
        break;
      case "extension_ui_request": {
        const req = event as unknown as ExtensionUiRequest;
        switch (req.method) {
          case "select":
          case "confirm":
          case "input":
          case "editor":
            patchSession(key, (cur) => ({ dialogs: [...cur.dialogs, req] }));
            break;
          case "notify":
            get().pushToast(req.message, req.notifyType ?? "info");
            break;
          case "setStatus":
            patchSession(key, (cur) => {
              const statuses = { ...cur.statuses };
              if (req.statusText) statuses[req.statusKey] = req.statusText;
              else delete statuses[req.statusKey];
              return { statuses };
            });
            break;
          case "setWidget":
            patchSession(key, (cur) => {
              const widgets = { ...cur.widgets };
              if (req.widgetLines && req.widgetLines.length) widgets[req.widgetKey] = req.widgetLines;
              else delete widgets[req.widgetKey];
              return { widgets };
            });
            break;
          case "set_editor_text":
            patchSession(key, { editorText: req.text });
            break;
          case "setTitle":
            break;
        }
        break;
      }
    }
  };

  return {
    ready: false,
    settings: DEFAULT_SETTINGS,
    projects: [],
    live: {},
    sessions: {},
    selectedKey: null,
    windowFocused: true,
    toasts: [],
    settingsOpen: false,
    update: { status: "idle", currentVersion: "" },

    init: async () => {
      if (initStarted) return;
      initStarted = true;
      const [settings, projects, liveList] = await Promise.all([bridge.settings.get(), bridge.projects.list(), bridge.session.live()]);
      const live: Record<string, SessionLiveState> = {};
      for (const l of liveList) live[l.key] = l;
      set({ settings, projects, live, ready: true });

      bridge.events.onPiEvent(({ key, event }) => handleEvent(key, event));
      bridge.events.onLive((state) => {
        set((st) => ({ live: { ...st.live, [state.key]: state } }));
        const s = get().sessions[state.key];
        if (s && state.path && s.path !== state.path) patchSession(state.key, { path: state.path });
      });
      bridge.events.onProjectsChanged(() => void get().refreshProjects());
      bridge.events.onWindowFocus((focused) => set({ windowFocused: focused }));
      void bridge.update.state().then((update) => set({ update }));
      let announced: string | null = null;
      let lastError: string | undefined;
      bridge.events.onUpdateChanged((update) => {
        set({ update });
        if (update.status === "available" && update.latestVersion && announced !== update.latestVersion) {
          announced = update.latestVersion;
          get().pushToast(`Pier ${update.latestVersion} is available. Install it from the sidebar or the Pier menu.`, "info");
        }
        // State is re-emitted on every progress tick; only a new error message deserves a toast.
        if (update.error && update.error !== lastError) get().pushToast(update.error, "warning");
        lastError = update.error;
      });

      // Reopen the last Session if its file still exists.
      const last = settings.lastSessionKey;
      if (last) {
        const found = projects.flatMap((p) => p.sessions).find((s) => s.path === last);
        if (found) await get().openSession(found.cwd, found.path);
      }
    },

    updateSettings: async (patch) => {
      const settings = await bridge.settings.set(patch);
      set({ settings });
    },

    refreshProjects: async () => {
      const projects = await bridge.projects.list();
      set({ projects });
    },

    openFolder: async () => {
      const cwd = await bridge.projects.openFolder();
      if (!cwd) return;
      await get().refreshProjects();
      await get().openSession(cwd, null);
    },

    openSession: async (cwd, path) => {
      const existingKey = path ? keyForPath(get().live, path) : null;
      if (existingKey && get().sessions[existingKey]) {
        await get().selectSession(existingKey);
        const liveState = get().live[existingKey];
        if (liveState && !liveState.running) await get().restartSession(existingKey);
        return;
      }
      const live = path ? await bridge.session.open(cwd, path) : await bridge.session.create(cwd);
      set((st) => ({
        live: { ...st.live, [live.key]: live },
        sessions: { ...st.sessions, [live.key]: emptySession(live.key, cwd, live.path) },
      }));
      await get().selectSession(live.key);
      await Promise.all([
        refreshEntries(live.key),
        refreshState(live.key),
        refreshStats(live.key),
        refreshThinkingLevels(live.key),
        bridge.pi.command<{ models: PiModel[] }>(live.key, { type: "get_available_models" }).then((r) => {
          if (r.success && r.data) patchSession(live.key, { models: r.data.models });
        }),
        bridge.pi.command<{ commands: PiCommandInfo[] }>(live.key, { type: "get_commands" }).then((r) => {
          if (r.success && r.data) patchSession(live.key, { commands: r.data.commands });
        }),
      ]);
      patchSession(live.key, { loading: false });
      if (!path) void get().refreshProjects();
    },

    selectSession: async (key) => {
      set({ selectedKey: key });
      const cwd = key ? get().sessions[key]?.cwd ?? null : null;
      await bridge.session.select(key, cwd);
    },

    trashSession: async (key, path) => {
      await bridge.session.trash(key, path);
      set((st) => {
        const sessions = { ...st.sessions };
        delete sessions[key];
        const live = { ...st.live };
        delete live[key];
        return { sessions, live, selectedKey: st.selectedKey === key ? null : st.selectedKey };
      });
      await get().refreshProjects();
    },

    restartSession: async (key) => {
      const live = await bridge.session.restart(key);
      if (!live) return;
      set((st) => ({ live: { ...st.live, [key]: live } }));
      patchSession(key, { entries: [], leafId: null, partial: null, toolRuns: {}, dialogs: [], statuses: {}, widgets: {} });
      await Promise.all([refreshEntries(key), refreshState(key), refreshStats(key), refreshThinkingLevels(key)]);
    },

    sendPrompt: async (key, text, images) => {
      const s = get().sessions[key];
      if (!s) return;
      const streaming = s.state?.isStreaming || get().live[key]?.status === "working";
      const isCommand = text.trimStart().startsWith("/");
      const imgs = images.map((i) => ({ type: "image", data: i.data, mimeType: i.mimeType }));
      const command: Record<string, unknown> =
        streaming && !isCommand
          ? { type: "follow_up", message: text, ...(imgs.length ? { images: imgs } : {}) }
          : { type: "prompt", message: text, ...(imgs.length ? { images: imgs } : {}), ...(streaming ? { streamingBehavior: "followUp" } : {}) };
      const res = await bridge.pi.command(key, command);
      if (!res.success) get().pushToast(res.error ?? "pi rejected the message", "error");
      else if (!streaming) void refreshEntries(key);
    },

    abort: async (key) => {
      // Clear the queue first so pi does not deliver queued messages after the abort,
      // then hand the cleared text back to the composer, the way the TUI does on Escape.
      const cleared = await bridge.pi.command<{ steering: string[]; followUp: string[] }>(key, { type: "clear_queue" });
      await bridge.pi.command(key, { type: "abort" });
      const restored = cleared.success && cleared.data ? [...cleared.data.steering, ...cleared.data.followUp] : [];
      if (restored.length) patchSession(key, { editorText: restored.join("\n\n") });
    },

    abortRetry: async (key) => {
      await bridge.pi.command(key, { type: "abort_retry" });
    },

    removeQueued: async (key, kind, index) => {
      const res = await bridge.pi.command<{ steering: string[]; followUp: string[] }>(key, { type: "clear_queue" });
      if (!res.success || !res.data) return;
      const steering = res.data.steering.filter((_, i) => !(kind === "steering" && i === index));
      const followUp = res.data.followUp.filter((_, i) => !(kind === "followUp" && i === index));
      for (const m of steering) await bridge.pi.command(key, { type: "steer", message: m });
      for (const m of followUp) await bridge.pi.command(key, { type: "follow_up", message: m });
    },

    promoteToSteering: async (key, index) => {
      const res = await bridge.pi.command<{ steering: string[]; followUp: string[] }>(key, { type: "clear_queue" });
      if (!res.success || !res.data) return;
      const promoted = res.data.followUp[index];
      const followUp = res.data.followUp.filter((_, i) => i !== index);
      for (const m of res.data.steering) await bridge.pi.command(key, { type: "steer", message: m });
      if (promoted !== undefined) await bridge.pi.command(key, { type: "steer", message: promoted });
      for (const m of followUp) await bridge.pi.command(key, { type: "follow_up", message: m });
    },

    setModel: async (key, provider, modelId) => {
      const res = await bridge.pi.command(key, { type: "set_model", provider, modelId });
      if (!res.success) get().pushToast(res.error ?? "Could not switch model", "error");
      await Promise.all([refreshState(key), refreshThinkingLevels(key), refreshEntries(key)]);
    },

    setThinking: async (key, level) => {
      const res = await bridge.pi.command(key, { type: "set_thinking_level", level });
      if (!res.success) get().pushToast(res.error ?? "Could not set thinking level", "error");
      await Promise.all([refreshState(key), refreshEntries(key)]);
    },

    compact: async (key, instructions) => {
      const res = await bridge.pi.command(key, { type: "compact", ...(instructions ? { customInstructions: instructions } : {}) });
      if (!res.success) get().pushToast(res.error ?? "Compaction failed", "error");
    },

    renameSession: async (key, name) => {
      await bridge.pi.command(key, { type: "set_session_name", name });
      await refreshState(key);
      await get().refreshProjects();
    },

    respondDialog: async (key, id, response) => {
      await bridge.pi.respond(key, id, response);
      patchSession(key, (cur) => ({ dialogs: cur.dialogs.filter((d) => d.id !== id) }));
    },

    setDraft: (key, draft) => patchSession(key, { draft }),
    clearEditorText: (key) => patchSession(key, { editorText: null }),

    pushToast: (message, kind = "info") => {
      const id = ++toastSeq;
      set((st) => ({ toasts: [...st.toasts, { id, message, kind }] }));
      setTimeout(() => get().dismissToast(id), kind === "error" ? 9000 : 5000);
    },
    dismissToast: (id) => {
      // Fade out first, then drop it once the exit animation has played.
      set((st) => ({ toasts: st.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }));
      setTimeout(() => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })), 190);
    },
    setSettingsOpen: (open) => set({ settingsOpen: open }),
    checkForUpdates: () => bridge.update.check(),
    installUpdate: () => bridge.update.install(),
    restartForUpdate: () => bridge.update.restart(),
  };
});
