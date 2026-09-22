// The one contract between the UI and the process that hosts pi.
// Everything crosses this boundary as plain JSON so the transport can change later.

export type SessionStatus = "working" | "needs-input" | "unread" | "idle";

export interface SessionSummary {
  /** Absolute path of the session JSONL file. The stable identity of a Session. */
  path: string;
  id: string;
  cwd: string;
  /** Session name set through pi, or the first user message, or null for an empty session. */
  title: string | null;
  createdAt: string;
  modifiedAt: string;
}

export interface ProjectSummary {
  cwd: string;
  name: string;
  sessions: SessionSummary[];
  lastActivity: string;
}

export interface SessionLiveState {
  key: string;
  status: SessionStatus;
  /** True while a pi process is alive for this Session. */
  running: boolean;
  cwd: string;
  path: string | null;
  crashed: string | null;
}

export type ThemePreference = "system" | "light" | "dark";

export interface GuiSettings {
  theme: ThemePreference;
  thinkingExpanded: boolean;
  reduceMotion: boolean;
  muted: boolean;
  piPath: string | null;
  diffStyle: "unified" | "split";
  sidebarWidth: number;
  panelWidth: number;
  sidebarCollapsed: boolean;
  panelCollapsed: boolean;
  panelTab: "changes" | "terminal";
  collapsedProjects: string[];
  /** Sidebar order of project cwds; projects not listed follow in recency order. */
  projectOrder: string[];
  /** The todo panel above the composer shows only its heading. */
  todosCollapsed: boolean;
  lastSessionKey: string | null;
  /** Interface font family; null means the system font. */
  uiFont: string | null;
  /** Base interface size in px; every UI size scales from 14. */
  uiFontSize: number;
  /** Terminal font family; null means the default monospace stack. */
  terminalFont: string | null;
  terminalFontSize: number;
  /** Theme ids from the renderer registry; "default" keeps the built-in palette. */
  darkTheme: string;
  lightTheme: string;
  /** A theme id, or "match" to follow the interface theme. */
  terminalTheme: string;
}

export interface SystemFont {
  family: string;
  monospace: boolean;
}

export const DEFAULT_SETTINGS: GuiSettings = {
  theme: "system",
  thinkingExpanded: false,
  reduceMotion: false,
  muted: false,
  piPath: null,
  diffStyle: "unified",
  sidebarWidth: 236,
  panelWidth: 440,
  sidebarCollapsed: false,
  panelCollapsed: true,
  panelTab: "changes",
  collapsedProjects: [],
  projectOrder: [],
  todosCollapsed: false,
  lastSessionKey: null,
  uiFont: null,
  uiFontSize: 14,
  terminalFont: null,
  terminalFontSize: 13,
  darkTheme: "default",
  lightTheme: "default",
  terminalTheme: "match",
};

// ---- pi RPC shapes we rely on (subset, kept loose on purpose) ----

export interface PiModel {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  input: string[];
}

export interface PiUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens?: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "thinking"; thinking: string }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> };

export type AgentMessage =
  | { role: "user"; content: string | ContentBlock[]; timestamp: number }
  | {
      role: "assistant";
      content: ContentBlock[];
      provider: string;
      model: string;
      usage: PiUsage;
      stopReason: "stop" | "length" | "toolUse" | "error" | "aborted" | "pending";
      errorMessage?: string;
      timestamp: number;
    }
  | {
      role: "toolResult";
      toolCallId: string;
      toolName: string;
      content: ContentBlock[];
      details?: Record<string, unknown>;
      isError: boolean;
      timestamp: number;
    }
  | {
      role: "bashExecution";
      command: string;
      output: string;
      exitCode?: number;
      cancelled: boolean;
      truncated: boolean;
      timestamp: number;
    }
  | { role: "custom"; customType: string; content: string | ContentBlock[]; display: boolean; timestamp: number }
  | { role: "branchSummary"; summary: string; fromId: string; timestamp: number }
  | { role: "compactionSummary"; summary: string; tokensBefore: number; timestamp: number };

export interface SessionEntry {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  message?: AgentMessage;
  // model_change
  provider?: string;
  modelId?: string;
  // thinking_level_change
  thinkingLevel?: string;
  // compaction
  summary?: string;
  tokensBefore?: number;
  // session_info
  name?: string;
  // label
  label?: string;
  targetId?: string;
  // custom_message
  customType?: string;
  content?: string | ContentBlock[];
  display?: boolean;
}

export interface PiState {
  model: PiModel | null;
  thinkingLevel: string;
  isStreaming: boolean;
  isCompacting: boolean;
  sessionFile: string | null;
  sessionId: string;
  sessionName?: string;
  messageCount: number;
  pendingMessageCount: number;
}

export interface PiCommandInfo {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill";
  location?: string;
}

export interface SessionStats {
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: number;
  contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null };
}

export type ExtensionUiRequest =
  | { type: "extension_ui_request"; id: string; method: "select"; title: string; options: string[]; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "confirm"; title: string; message?: string; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "input"; title: string; placeholder?: string; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "editor"; title: string; prefill?: string; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "notify"; message: string; notifyType?: "info" | "warning" | "error" }
  | { type: "extension_ui_request"; id: string; method: "setStatus"; statusKey: string; statusText?: string }
  | { type: "extension_ui_request"; id: string; method: "setWidget"; widgetKey: string; widgetLines?: string[]; widgetPlacement?: "aboveEditor" | "belowEditor" }
  | { type: "extension_ui_request"; id: string; method: "setTitle"; title: string }
  | { type: "extension_ui_request"; id: string; method: "set_editor_text"; text: string };

export type ExtensionUiResponse =
  | { value: string }
  | { confirmed: boolean }
  | { cancelled: true };

/** Any event line pi writes to stdout that is not a command response. */
export interface PiEvent {
  type: string;
  [key: string]: unknown;
}

export interface PiCommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ---- updates ----

export interface UpdateState {
  status: "idle" | "checking" | "available" | "downloading" | "ready";
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  progress?: number;
  error?: string;
  checkedAt?: number;
}

// ---- git ----

export interface ChangedFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked";
  oldPath?: string;
}

// ---- IPC channel names ----

export const IPC = {
  // renderer -> main (invoke)
  settingsGet: "settings:get",
  settingsSet: "settings:set",
  projectsList: "projects:list",
  projectOpenFolder: "project:openFolder",
  projectFiles: "project:files",
  sessionsSearch: "sessions:search",
  sessionOpen: "session:open",
  sessionNew: "session:new",
  sessionClose: "session:close",
  sessionTrash: "session:trash",
  sessionSelect: "session:select",
  sessionLive: "session:live",
  sessionRestart: "session:restart",
  piCommand: "pi:command",
  piUiRespond: "pi:uiRespond",
  gitChanges: "git:changes",
  gitPatch: "git:patch",
  gitBranch: "git:branch",
  terminalOpen: "terminal:open",
  terminalWrite: "terminal:write",
  terminalResize: "terminal:resize",
  terminalClose: "terminal:close",
  updateState: "update:state",
  updateCheck: "update:check",
  updateInstall: "update:install",
  updateRestart: "update:restart",
  updateOpenRelease: "update:openRelease",
  clipboardWrite: "clipboard:write",
  piLocate: "pi:locate",
  fontsList: "fonts:list",
  // main -> renderer (send)
  piEvent: "pi:event",
  sessionLiveChanged: "session:liveChanged",
  projectsChanged: "projects:changed",
  gitChanged: "git:changed",
  windowFocus: "window:focus",
  menuCommand: "menu:command",
  updateChanged: "update:changed",
  terminalData: "terminal:data",
  terminalExit: "terminal:exit",
} as const;
