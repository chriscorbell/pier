import {
  IPC,
  type ChangedFile,
  type ExtensionUiResponse,
  type GuiSettings,
  type PiCommandResult,
  type PiEvent,
  type ProjectSummary,
  type SessionLiveState,
  type SystemFont,
  type UpdateState,
} from "@shared/contract";

const { invoke, on } = window.pi;

export const bridge = {
  settings: {
    get: () => invoke(IPC.settingsGet) as Promise<GuiSettings>,
    set: (patch: Partial<GuiSettings>) => invoke(IPC.settingsSet, patch) as Promise<GuiSettings>,
  },
  projects: {
    list: () => invoke(IPC.projectsList) as Promise<ProjectSummary[]>,
    openFolder: () => invoke(IPC.projectOpenFolder) as Promise<string | null>,
    files: (cwd: string) => invoke(IPC.projectFiles, cwd) as Promise<string[]>,
    trash: (cwd: string) => invoke(IPC.projectTrash, cwd) as Promise<void>,
    /** The given session files whose conversation text contains the query. */
    search: (paths: string[], query: string) => invoke(IPC.sessionsSearch, paths, query) as Promise<string[]>,
  },
  session: {
    open: (cwd: string, path: string) => invoke(IPC.sessionOpen, cwd, path) as Promise<SessionLiveState>,
    create: (cwd: string) => invoke(IPC.sessionNew, cwd) as Promise<SessionLiveState>,
    close: (key: string) => invoke(IPC.sessionClose, key) as Promise<void>,
    trash: (key: string, path: string) => invoke(IPC.sessionTrash, key, path) as Promise<void>,
    select: (key: string | null, cwd: string | null) => invoke(IPC.sessionSelect, key, cwd) as Promise<void>,
    live: () => invoke(IPC.sessionLive) as Promise<SessionLiveState[]>,
    restart: (key: string) => invoke(IPC.sessionRestart, key) as Promise<SessionLiveState | null>,
  },
  pi: {
    command: <T = unknown>(key: string, command: Record<string, unknown>) =>
      invoke(IPC.piCommand, key, command) as Promise<PiCommandResult<T>>,
    respond: (key: string, id: string, response: ExtensionUiResponse) =>
      invoke(IPC.piUiRespond, key, id, response) as Promise<void>,
    locate: () => invoke(IPC.piLocate) as Promise<string | null>,
  },
  fonts: {
    list: () => invoke(IPC.fontsList) as Promise<SystemFont[]>,
  },
  git: {
    changes: (cwd: string) => invoke(IPC.gitChanges, cwd) as Promise<ChangedFile[]>,
    patch: (cwd: string, file: ChangedFile) => invoke(IPC.gitPatch, cwd, file) as Promise<string>,
    branch: (cwd: string) => invoke(IPC.gitBranch, cwd) as Promise<string | null>,
  },
  terminal: {
    open: (id: string, cwd: string, cols: number, rows: number) =>
      invoke(IPC.terminalOpen, id, cwd, cols, rows) as Promise<{ id: string; created: boolean }>,
    write: (id: string, data: string) => invoke(IPC.terminalWrite, id, data) as Promise<void>,
    resize: (id: string, cols: number, rows: number) => invoke(IPC.terminalResize, id, cols, rows) as Promise<void>,
    close: (id: string) => invoke(IPC.terminalClose, id) as Promise<void>,
  },
  clipboard: {
    write: (text: string) => invoke(IPC.clipboardWrite, text) as Promise<void>,
  },
  update: {
    state: () => invoke(IPC.updateState) as Promise<UpdateState>,
    check: () => invoke(IPC.updateCheck) as Promise<void>,
    install: () => invoke(IPC.updateInstall) as Promise<void>,
    restart: () => invoke(IPC.updateRestart) as Promise<void>,
    openRelease: () => invoke(IPC.updateOpenRelease) as Promise<void>,
  },
  events: {
    onPiEvent: (cb: (p: { key: string; event: PiEvent }) => void) => on(IPC.piEvent, cb as (p: unknown) => void),
    onLive: (cb: (s: SessionLiveState) => void) => on(IPC.sessionLiveChanged, cb as (p: unknown) => void),
    onProjectsChanged: (cb: () => void) => on(IPC.projectsChanged, cb),
    onGitChanged: (cb: (cwd: string) => void) => on(IPC.gitChanged, cb as (p: unknown) => void),
    onWindowFocus: (cb: (focused: boolean) => void) => on(IPC.windowFocus, cb as (p: unknown) => void),
    onMenuCommand: (cb: (command: string) => void) => on(IPC.menuCommand, cb as (p: unknown) => void),
    onUpdateChanged: (cb: (s: UpdateState) => void) => on(IPC.updateChanged, cb as (p: unknown) => void),
    onTerminalData: (cb: (p: { id: string; data: string }) => void) => on(IPC.terminalData, cb as (p: unknown) => void),
    onTerminalExit: (cb: (p: { id: string; exitCode: number }) => void) => on(IPC.terminalExit, cb as (p: unknown) => void),
  },
};
