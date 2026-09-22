import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { IPC } from "@shared/contract";
import { LOG_FILE } from "./log";

export type MenuCommand =
  | "newSession"
  | "openFolder"
  | "toggleSidebar"
  | "togglePanel"
  | "openSettings"
  | "previousSession"
  | "nextSession"
  | "focusComposer"
  | "showChanges"
  | "showTerminal"
  | "find"
  | "findNext"
  | "findPrevious";

/** The macOS application menu. Commands that touch UI state are forwarded to the renderer. */
export function installMenu(getWindow: () => BrowserWindow | null, checkForUpdates: () => void): void {
  const send = (command: MenuCommand) => () => getWindow()?.webContents.send(IPC.menuCommand, command);
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { label: "Check for Updates…", click: checkForUpdates },
              { type: "separator" as const },
              { label: "Settings…", accelerator: "Cmd+,", click: send("openSettings") },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New Session", accelerator: "CmdOrCtrl+N", click: send("newSession") },
        { label: "Open Folder…", accelerator: "CmdOrCtrl+O", click: send("openFolder") },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "selectAll" },
        { type: "separator" },
        { label: "Find…", accelerator: "CmdOrCtrl+F", click: send("find") },
        { label: "Find Next", accelerator: "CmdOrCtrl+G", click: send("findNext") },
        { label: "Find Previous", accelerator: "CmdOrCtrl+Shift+G", click: send("findPrevious") },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Sidebar", accelerator: "CmdOrCtrl+B", click: send("toggleSidebar") },
        { label: "Toggle Side Panel", accelerator: "CmdOrCtrl+J", click: send("togglePanel") },
        { label: "Changes", accelerator: "CmdOrCtrl+Shift+D", click: send("showChanges") },
        { label: "Terminal", accelerator: "CmdOrCtrl+Shift+T", click: send("showTerminal") },
        { type: "separator" },
        { label: "Focus Composer", accelerator: "CmdOrCtrl+L", click: send("focusComposer") },
        { type: "separator" },
        ...(app.isPackaged
          ? []
          : [{ role: "reload" as const }, { role: "forceReload" as const }, { role: "toggleDevTools" as const }, { type: "separator" as const }]),
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Session",
      submenu: [
        { label: "Previous Session", accelerator: "CmdOrCtrl+Up", click: send("previousSession") },
        { label: "Next Session", accelerator: "CmdOrCtrl+Down", click: send("nextSession") },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac ? [{ type: "separator" as const }, { role: "front" as const }] : [{ role: "close" as const }]),
      ],
    },
    {
      role: "help",
      submenu: [
        { label: "Pier on GitHub", click: () => void shell.openExternal("https://github.com/chriscorbell/pier") },
        { label: "pi Documentation", click: () => void shell.openExternal("https://github.com/earendil-works/pi-mono") },
        { type: "separator" },
        { label: "Show Log File", click: () => shell.showItemInFolder(LOG_FILE) },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Right-click menu on the Dock icon. */
export function installDockMenu(getWindow: () => BrowserWindow | null): void {
  if (process.platform !== "darwin") return;
  app.dock?.setMenu(
    Menu.buildFromTemplate([
      { label: "New Session", click: () => getWindow()?.webContents.send(IPC.menuCommand, "newSession" satisfies MenuCommand) },
    ]),
  );
}
