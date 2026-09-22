import { useMemo, useState } from "react";
import { ArrowDownToLine, ChevronDown, FolderPlus, PanelLeft, RefreshCw, RotateCw, Search, Settings2, SquarePen, X } from "lucide-react";
import type { SessionStatus } from "@shared/contract";
import { keyForPath, useApp } from "@/store/app";
import { IconButton, Spinner } from "@/components/ui";
import { SessionContextMenu } from "@/components/SessionActions";
import { cn, relativeTime } from "@/lib/utils";

function StatusDot({ status }: { status: SessionStatus | "off" }) {
  // Keyed on status so each change re-runs the pop.
  if (status === "working") return <Spinner key="working" className="anim-pop h-3 w-3 text-fg-muted" />;
  if (status === "needs-input") return <span key="needs-input" className="anim-pop h-2 w-2 rounded-full bg-warn [animation:pop_150ms_cubic-bezier(0.16,1,0.3,1)_both,pulse-dot_1.4s_ease-in-out_150ms_infinite]" />;
  if (status === "unread") return <span key="unread" className="anim-pop h-2 w-2 rounded-full bg-accent" />;
  return null;
}

export function Sidebar() {
  const projects = useApp((s) => s.projects);
  const live = useApp((s) => s.live);
  const sessions = useApp((s) => s.sessions);
  const selectedKey = useApp((s) => s.selectedKey);
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const openSession = useApp((s) => s.openSession);
  const selectSession = useApp((s) => s.selectSession);
  const openFolder = useApp((s) => s.openFolder);
  const refreshProjects = useApp((s) => s.refreshProjects);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const upd = useApp((s) => s.update);
  const installUpdate = useApp((s) => s.installUpdate);
  const restartForUpdate = useApp((s) => s.restartForUpdate);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // Sessions that exist only as a live process (new, no file listed yet).
  const pendingByCwd = useMemo(() => {
    const listed = new Set(projects.flatMap((p) => p.sessions.map((s) => s.path)));
    const out: Record<string, { key: string }[]> = {};
    for (const l of Object.values(live)) {
      if (l.path && listed.has(l.path)) continue;
      if (!sessions[l.key]) continue;
      (out[l.cwd] ??= []).push({ key: l.key });
    }
    return out;
  }, [projects, live, sessions]);

  const allCwds = useMemo(() => {
    const set = new Set(projects.map((p) => p.cwd));
    for (const cwd of Object.keys(pendingByCwd)) set.add(cwd);
    return [...set];
  }, [projects, pendingByCwd]);

  const collapsed = new Set(settings.collapsedProjects);
  const toggle = (cwd: string) => {
    const next = new Set(collapsed);
    if (next.has(cwd)) next.delete(cwd);
    else next.add(cwd);
    void update({ collapsedProjects: [...next] });
  };

  const q = query.trim().toLowerCase();
  const currentCwd = selectedKey ? sessions[selectedKey]?.cwd : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="drag flex h-[52px] shrink-0 items-center pl-[98px] pr-2">
        <IconButton label="Hide sidebar (Cmd+B)" className="ml-auto" onClick={() => void update({ sidebarCollapsed: true })}>
          <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
      </div>

      <div className="px-2">
        <div className="flex items-center gap-1">
          {searching ? (
            <div className="flex h-8 flex-1 items-center gap-2 rounded-md bg-hover px-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-fg-faint" strokeWidth={2} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setQuery("");
                    setSearching(false);
                  }
                }}
                placeholder="Search sessions"
                className="min-w-0 flex-1 bg-transparent text-ui-[13.5px] text-fg placeholder:text-fg-faint focus:outline-none"
              />
              <button
                onClick={() => {
                  setQuery("");
                  setSearching(false);
                }}
                className="text-fg-faint hover:text-fg"
                aria-label="Close search"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearching(true)}
              className="flex h-8 flex-1 items-center gap-2 rounded-md px-2 text-ui-[13.5px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <Search className="h-3.5 w-3.5" strokeWidth={2} />
              Search
            </button>
          )}
          <IconButton
            label="New session (Cmd+N)"
            className="h-8 w-8"
            disabled={!currentCwd && allCwds.length === 0}
            onClick={() => {
              const cwd = currentCwd ?? allCwds[0];
              if (cwd) void openSession(cwd, null);
            }}
          >
            <SquarePen className="h-4 w-4" strokeWidth={1.75} />
          </IconButton>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <button
            onClick={() => {
              const all = allCwds.every((c) => collapsed.has(c));
              void update({ collapsedProjects: all ? [] : allCwds });
            }}
            className="flex h-8 flex-1 items-center gap-2 rounded-md px-2 text-ui-[13.5px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <FolderPlus className="h-3.5 w-3.5 opacity-0" strokeWidth={2} />
            <span className="flex-1 text-left">All projects</span>
            <ChevronDown className="h-3.5 w-3.5 text-fg-faint" strokeWidth={2} />
          </button>
          <IconButton label="Open folder" className="h-8 w-8" onClick={() => void openFolder()}>
            <FolderPlus className="h-4 w-4" strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto px-2 pb-4">
        {allCwds.length === 0 && <div className="px-2 pt-8 text-center text-ui-[13px] text-fg-faint">No sessions yet</div>}
        {allCwds.map((cwd) => {
          const project = projects.find((p) => p.cwd === cwd);
          const name = project?.name ?? cwd.split("/").filter(Boolean).pop() ?? cwd;
          const pending = pendingByCwd[cwd] ?? [];
          let rows = [
            ...pending.map((p) => ({ key: p.key, path: null as string | null, title: "New session", modifiedAt: null as string | null })),
            ...(project?.sessions ?? []).map((s) => ({ key: keyForPath(live, s.path), path: s.path, title: s.title, modifiedAt: s.modifiedAt })),
          ];
          if (q) rows = rows.filter((r) => (r.title ?? "").toLowerCase().includes(q) || name.toLowerCase().includes(q));
          if (q && rows.length === 0) return null;
          const isCollapsed = !q && collapsed.has(cwd);
          const attention = rows.filter((r) => {
            const st = live[r.key]?.status;
            return st === "unread" || st === "needs-input";
          }).length;
          return (
            <div key={cwd} className="mb-1">
              <div className="group flex h-7 items-center gap-1 rounded-md pr-1 pl-2 text-ui-[12.5px] hover:bg-hover">
                <button onClick={() => toggle(cwd)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" title={cwd}>
                  <span className="truncate font-medium text-fg-faint">{name}</span>
                  {isCollapsed && attention > 0 && (
                    <span key={attention} className="anim-pop rounded-full bg-accent px-1.5 text-ui-[11px] font-semibold leading-4 text-accent-fg">{attention}</span>
                  )}
                  <ChevronDown className={cn("h-3 w-3 shrink-0 text-fg-faint transition-transform duration-150", isCollapsed && "-rotate-90")} strokeWidth={2} />
                </button>
                <IconButton label="New session here" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => void openSession(cwd, null)}>
                  <SquarePen className="h-3.5 w-3.5" strokeWidth={2} />
                </IconButton>
              </div>
              {!isCollapsed && (
                <div className="mt-0.5 flex flex-col gap-px">
                  {rows.length === 0 && <div className="px-2 py-1 text-ui-[13px] text-fg-faint">No sessions</div>}
                  {rows.map((r) => {
                    const st = live[r.key];
                    const status: SessionStatus | "off" = st ? st.status : "off";
                    const selected = selectedKey === r.key;
                    const emphasized = status === "unread" || status === "needs-input";
                    return (
                      <SessionContextMenu key={r.key} target={{ key: r.key, cwd, path: r.path, title: r.title ?? "Empty session" }}>
                      <button
                        onClick={() => {
                          if (sessions[r.key]) void selectSession(r.key);
                          else if (r.path) void openSession(cwd, r.path);
                        }}
                        className={cn(
                          "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-ui-[13.5px] transition-colors duration-100",
                          selected ? "bg-active text-fg" : "text-fg-muted hover:bg-hover hover:text-fg",
                          emphasized && !selected && "text-fg",
                        )}
                      >
                        <span className={cn("min-w-0 flex-1 truncate", emphasized && "font-medium")}>{r.title ?? "Empty session"}</span>
                        {status !== "off" && status !== "idle" ? (
                          <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                            <StatusDot status={status} />
                          </span>
                        ) : (
                          r.modifiedAt && <span className="shrink-0 text-ui-[11.5px] tabular-nums text-fg-faint">{relativeTime(r.modifiedAt)}</span>
                        )}
                      </button>
                      </SessionContextMenu>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(upd.status === "available" || upd.status === "downloading" || upd.status === "ready") && (
        <div className="anim-item mx-2 mb-2 rounded-md border border-border bg-surface px-2.5 py-2 text-ui-[12.5px]">
          {upd.status === "ready" ? (
            <button onClick={() => void restartForUpdate()} className="flex w-full items-center gap-2 text-left text-fg hover:text-accent">
              <RotateCw className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span className="flex-1">Restart to finish updating to {upd.latestVersion}</span>
            </button>
          ) : upd.status === "downloading" ? (
            <div>
              <div className="flex items-center gap-2 text-fg-muted">
                <ArrowDownToLine className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                <span className="flex-1">Downloading {upd.latestVersion}</span>
                <span className="tabular-nums">{Math.round((upd.progress ?? 0) * 100)}%</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border-strong/60">
                <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${(upd.progress ?? 0) * 100}%` }} />
              </div>
            </div>
          ) : (
            <button onClick={() => void installUpdate()} className="flex w-full items-center gap-2 text-left text-fg hover:text-accent">
              <ArrowDownToLine className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span className="flex-1">Pier {upd.latestVersion} is available</span>
              <span className="text-accent">Install</span>
            </button>
          )}
        </div>
      )}
      <div className="flex h-10 shrink-0 items-center justify-between border-t border-border px-2">
        <IconButton label="Settings (Cmd+,)" onClick={() => setSettingsOpen(true)}>
          <Settings2 className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
        <IconButton label="Refresh sessions" onClick={() => void refreshProjects()}>
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}
