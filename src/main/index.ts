import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, nativeTheme } from "electron";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { readdir, rmdir } from "node:fs/promises";
import { dirname } from "node:path";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { IPC, type ExtensionUiResponse, type GuiSettings, type ChangedFile } from "@shared/contract";
import { loadSettings, saveSettings } from "./settings";
import { scanProjects, SESSIONS_DIR } from "./sessions/scan";
import { searchSessions } from "./sessions/search";
import { SessionHost } from "./pi/session-host";
import { changedFiles, currentBranch, patchFor } from "./git";
import { locatePi } from "./pi/locate";
import { TerminalHost } from "./terminal";
import { installDockMenu, installMenu } from "./menu";
import { Updater } from "./updater";
import { listSystemFonts } from "./fonts";

// The dev binary is Electron.app, whose bundle name shows in the menu bar; the name here fixes
// app.getName(), the About panel, the user-data folder, and the menu labels in both dev and packaged builds.
app.setName("Pier");
app.setAboutPanelOptions({
  applicationName: "Pier",
  applicationVersion: app.getVersion(),
  version: "",
  copyright: "MIT License",
  credits: "A desktop client for the pi coding agent.",
});

const host = new SessionHost();
const terminals = new TerminalHost();
const updater = new Updater();
const openedFolders = new Set<string>();
let win: BrowserWindow | null = null;

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function applyTheme(theme: GuiSettings["theme"]): void {
  nativeTheme.themeSource = theme;
}

function updateBadge(): void {
  if (process.platform !== "darwin") return;
  const n = host.attentionCount();
  app.dock?.setBadge(n > 0 ? String(n) : "");
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 560,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#101011" : "#fafafa",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
    },
  });
  win.once("ready-to-show", () => win?.show());
  if (!app.isPackaged) {
    // Surface renderer errors in the dev server log.
    win.webContents.on("console-message", (event) => {
      if (event.level === "error" || event.level === "warning") console.log(`[renderer:${event.level}] ${event.message}`);
    });
  }
  win.on("focus", () => {
    host.setWindowFocused(true);
    send(IPC.windowFocus, true);
    updateBadge();
  });
  win.on("blur", () => {
    host.setWindowFocused(false);
    send(IPC.windowFocus, false);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// ---- watchers ----

let sessionsWatcher: FSWatcher | null = null;
let sessionsTimer: NodeJS.Timeout | null = null;
function watchSessions(): void {
  if (!existsSync(SESSIONS_DIR)) return;
  sessionsWatcher = watch(SESSIONS_DIR, { recursive: true }, () => {
    if (sessionsTimer) clearTimeout(sessionsTimer);
    sessionsTimer = setTimeout(() => send(IPC.projectsChanged, null), 400);
  });
}

let gitWatcher: FSWatcher | null = null;
let gitWatchedCwd: string | null = null;
let gitTimer: NodeJS.Timeout | null = null;
function watchGit(cwd: string | null): void {
  if (cwd === gitWatchedCwd) return;
  gitWatcher?.close();
  gitWatcher = null;
  gitWatchedCwd = cwd;
  if (!cwd || !existsSync(cwd)) return;
  try {
    gitWatcher = watch(cwd, { recursive: true }, (_event, filename) => {
      const f = String(filename ?? "");
      if (f.startsWith(".git/") || f.includes("/.git/") || f.includes("node_modules")) return;
      if (gitTimer) clearTimeout(gitTimer);
      gitTimer = setTimeout(() => send(IPC.gitChanged, cwd), 500);
    });
  } catch {
    gitWatcher = null;
  }
}

// ---- IPC ----

function registerIpc(): void {
  ipcMain.handle(IPC.settingsGet, () => loadSettings());
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<GuiSettings>) => {
    const next = saveSettings(patch);
    if (patch.theme) applyTheme(patch.theme);
    return next;
  });

  ipcMain.handle(IPC.projectsList, () => scanProjects([...openedFolders]));
  ipcMain.handle(IPC.projectOpenFolder, async () => {
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"] });
    if (res.canceled || res.filePaths.length === 0) return null;
    const cwd = res.filePaths[0];
    openedFolders.add(cwd);
    return cwd;
  });
  ipcMain.handle(IPC.projectFiles, async (_e, cwd: string) => listProjectFiles(cwd));
  ipcMain.handle(IPC.projectTrash, async (_e, cwd: string) => trashProject(cwd));
  ipcMain.handle(IPC.sessionsSearch, (_e, paths: string[], query: string) => searchSessions(paths, query));

  ipcMain.handle(IPC.sessionOpen, (_e, cwd: string, path: string) => host.open(cwd, path));
  ipcMain.handle(IPC.sessionNew, (_e, cwd: string) => host.open(cwd, null));
  ipcMain.handle(IPC.sessionClose, (_e, key: string) => host.close(key));
  ipcMain.handle(IPC.sessionSelect, (_e, key: string | null, cwd: string | null) => {
    host.select(key);
    watchGit(cwd);
    updateBadge();
    // Remember the file path when known so the Session can be reopened after a restart.
    if (key) saveSettings({ lastSessionKey: host.live(key)?.path ?? key });
  });
  ipcMain.handle(IPC.sessionLive, () => host.liveStates());
  ipcMain.handle(IPC.sessionTrash, async (_e, key: string, path: string) => {
    host.forget(key);
    terminals.close(key);
    await shell.trashItem(path);
    updateBadge();
  });
  ipcMain.handle(IPC.sessionRestart, (_e, key: string) => host.restart(key));

  ipcMain.handle(IPC.piCommand, (_e, key: string, command: Record<string, unknown>) => host.command(key, command));
  ipcMain.handle(IPC.piUiRespond, (_e, key: string, id: string, response: ExtensionUiResponse) => {
    host.respondToDialog(key, id, response);
    updateBadge();
  });
  ipcMain.handle(IPC.piLocate, () => locatePi(loadSettings().piPath));

  ipcMain.handle(IPC.gitChanges, (_e, cwd: string) => changedFiles(cwd));
  ipcMain.handle(IPC.gitPatch, (_e, cwd: string, file: ChangedFile) => patchFor(cwd, file));
  ipcMain.handle(IPC.gitBranch, (_e, cwd: string) => currentBranch(cwd));

  ipcMain.handle(IPC.terminalOpen, (_e, id: string, cwd: string, cols: number, rows: number) => terminals.open(id, cwd, cols, rows));
  ipcMain.handle(IPC.terminalWrite, (_e, id: string, data: string) => terminals.write(id, data));
  ipcMain.handle(IPC.terminalResize, (_e, id: string, cols: number, rows: number) => terminals.resize(id, cols, rows));
  ipcMain.handle(IPC.terminalClose, (_e, id: string) => terminals.close(id));

  ipcMain.handle(IPC.updateState, () => updater.state);
  ipcMain.handle(IPC.updateCheck, () => updater.check(false));
  ipcMain.handle(IPC.updateInstall, () => updater.install());
  ipcMain.handle(IPC.updateRestart, () => updater.restart());
  ipcMain.handle(IPC.updateOpenRelease, () => updater.openRelease());
  // The async web clipboard needs a focused document; Electron's clipboard does not.
  ipcMain.handle(IPC.clipboardWrite, (_e, text: string) => clipboard.writeText(text));
  ipcMain.handle(IPC.fontsList, () => listSystemFonts());
}

/**
 * Remove a project from the sidebar: stop its live Sessions, move every session file to the Trash,
 * drop the emptied session folder, and forget the folder if it was opened by hand.
 */
async function trashProject(cwd: string): Promise<void> {
  for (const l of host.liveStates()) {
    if (l.cwd !== cwd) continue;
    host.forget(l.key);
    terminals.close(l.key);
  }
  const project = scanProjects([...openedFolders]).find((p) => p.cwd === cwd);
  const dirs = new Set<string>();
  for (const s of project?.sessions ?? []) {
    await shell.trashItem(s.path);
    dirs.add(dirname(s.path));
  }
  for (const dir of dirs) {
    const left = await readdir(dir).catch(() => null);
    if (left && left.length === 0) await rmdir(dir).catch(() => {});
  }
  openedFolders.delete(cwd);
  updateBadge();
}

function listProjectFiles(cwd: string): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([]);
        resolve(stdout.split("\0").filter(Boolean).slice(0, 20000));
      },
    );
  });
}

updater.on("state", (state) => send(IPC.updateChanged, state));
terminals.on("data", (p) => send(IPC.terminalData, p));
terminals.on("exit", (p) => send(IPC.terminalExit, p));

host.on("event", (payload) => {
  send(IPC.piEvent, payload);
});
host.on("live", (state) => {
  send(IPC.sessionLiveChanged, state);
  updateBadge();
});

app.whenReady().then(() => {
  if (!app.isPackaged && process.platform === "darwin") {
    app.dock?.setIcon(join(__dirname, "../../build/icon.png"));
  }
  applyTheme(loadSettings().theme);
  installMenu(() => win, () => void updater.check(false));
  installDockMenu(() => win);
  updater.start();
  registerIpc();
  createWindow();
  watchSessions();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  sessionsWatcher?.close();
  gitWatcher?.close();
  host.shutdown();
  terminals.shutdown();
  updater.stop();
});
