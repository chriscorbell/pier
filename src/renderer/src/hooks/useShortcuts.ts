import { useEffect } from "react";
import { useApp } from "@/store/app";
import { bridge } from "@/lib/bridge";

/** Fired on window with detail +1 or -1 when the Find Next / Find Previous menu items are used. */
export const FIND_STEP_EVENT = "pier:find-step";

/** Menu accelerators arrive from main as commands; only keys that do not belong in a menu stay here. */
function runCommand(command: string): void {
  const app = useApp.getState();
  const rows = () => app.projects.flatMap((p) => p.sessions.map((s) => ({ cwd: p.cwd, path: s.path })));
  const step = (delta: number) => {
    const list = rows();
    if (!list.length) return;
    const currentPath = app.selectedKey ? app.sessions[app.selectedKey]?.path : null;
    const idx = list.findIndex((r) => r.path === currentPath);
    const next = Math.min(list.length - 1, Math.max(0, idx + delta));
    const row = list[next];
    if (row && row.path !== currentPath) void app.openSession(row.cwd, row.path);
  };
  switch (command) {
    case "newSession": {
      const cwd = app.selectedKey ? app.sessions[app.selectedKey]?.cwd : app.projects[0]?.cwd;
      if (cwd) void app.openSession(cwd, null);
      break;
    }
    case "openFolder":
      void app.openFolder();
      break;
    case "toggleSidebar":
      void app.updateSettings({ sidebarCollapsed: !app.settings.sidebarCollapsed });
      break;
    case "togglePanel":
      void app.updateSettings({ panelCollapsed: !app.settings.panelCollapsed });
      break;
    case "showChanges":
      void app.updateSettings({ panelCollapsed: false, panelTab: "changes" });
      break;
    case "showTerminal":
      void app.updateSettings({ panelCollapsed: false, panelTab: "terminal" });
      break;
    case "openSettings":
      app.setSettingsOpen(true);
      break;
    case "previousSession":
      step(-1);
      break;
    case "nextSession":
      step(1);
      break;
    case "focusComposer":
      document.querySelector<HTMLTextAreaElement>("textarea[data-composer]")?.focus();
      break;
    case "find":
      if (app.selectedKey) app.openFind();
      break;
    case "findNext":
    case "findPrevious":
      if (app.find.open) window.dispatchEvent(new CustomEvent(FIND_STEP_EVENT, { detail: command === "findNext" ? 1 : -1 }));
      break;
  }
}

export function useShortcuts(): void {
  useEffect(() => bridge.events.onMenuCommand(runCommand), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const app = useApp.getState();
      if (!app.selectedKey) return;
      const s = app.sessions[app.selectedKey];
      const live = app.live[app.selectedKey];
      if (s && s.dialogs.length === 0 && live?.status === "working") {
        e.preventDefault();
        void app.abort(app.selectedKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
