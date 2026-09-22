import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ChevronDown, FolderPlus, PanelLeft, RefreshCw, RotateCw, Search, Settings2, SquarePen, X } from "lucide-react";
import type { SessionStatus } from "@shared/contract";
import { keyForPath, useApp } from "@/store/app";
import { IconButton, Spinner } from "@/components/ui";
import { SessionContextMenu } from "@/components/SessionActions";
import { bridge } from "@/lib/bridge";
import { cn, relativeTime } from "@/lib/utils";

function StatusDot({ status }: { status: SessionStatus | "off" }) {
  // Keyed on status so each change re-runs the pop.
  if (status === "working") return <Spinner key="working" className="anim-pop h-3 w-3 text-fg-muted" />;
  if (status === "needs-input") return <span key="needs-input" className="anim-pop h-2 w-2 rounded-full bg-warn [animation:pop_150ms_cubic-bezier(0.16,1,0.3,1)_both,pulse-dot_1.4s_ease-in-out_150ms_infinite]" />;
  if (status === "unread") return <span key="unread" className="anim-pop h-2 w-2 rounded-full bg-accent" />;
  return null;
}

/** Session paths whose conversation text matches the query, fetched from main after a short pause in typing. */
function useContentSearch(query: string, paths: string[]): Set<string> {
  const [hits, setHits] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (query.length < 2) {
      setHits(new Set());
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void bridge.projects.search(paths, query).then((found) => {
        if (!cancelled) setHits(new Set(found));
      });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, paths]);
  return hits;
}

type DropSide = "before" | "after";

const EMPTY_DRAG_IMAGE = new Image();
EMPTY_DRAG_IMAGE.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

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
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const upd = useApp((s) => s.update);
  const checkForUpdates = useApp((s) => s.checkForUpdates);
  const installUpdate = useApp((s) => s.installUpdate);
  const restartForUpdate = useApp((s) => s.restartForUpdate);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ cwd: string; side: DropSide } | null>(null);
  // The drop target is also kept in a ref so dragend (which may fire without a drop) can commit it.
  const dropRef = useRef<{ cwd: string; side: DropSide } | null>(null);
  const placeDrop = (next: { cwd: string; side: DropSide } | null) => {
    dropRef.current = next;
    setDrop((cur) => (cur?.cwd === next?.cwd && cur?.side === next?.side ? cur : next));
  };
  // FLIP: when groups change order, each one slides from where it was to where it is now.
  const groupEls = useRef(new Map<string, HTMLDivElement>());
  const groupTops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    for (const [cwd, el] of groupEls.current) {
      const top = el.getBoundingClientRect().top;
      const prev = groupTops.current.get(cwd);
      groupTops.current.set(cwd, top);
      // Only reorders slide. Other layout shifts (a group above collapsing) are already animated by the disclosure.
      if (!dragging || prev === undefined || prev === top) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${prev - top}px)`;
      void el.offsetHeight; // flush so the jump lands before the transition is restored
      el.style.transition = "";
      el.style.transform = "";
    }
  });
  const finishDrag = (from: string) => {
    const target = dropRef.current;
    if (target && target.cwd !== from) moveProject(from, target.cwd, target.side);
    setDragging(null);
    placeDrop(null);
  };
  // Collapse toggles animate; the first paint and search filtering snap into place.
  const instant = useRef(true);
  useEffect(() => {
    instant.current = false;
  }, []);

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

  // Pinned order first, then anything new in recency order.
  const allCwds = useMemo(() => {
    const set = new Set(projects.map((p) => p.cwd));
    for (const cwd of Object.keys(pendingByCwd)) set.add(cwd);
    const rank = new Map(settings.projectOrder.map((cwd, i) => [cwd, i]));
    return [...set].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
  }, [projects, pendingByCwd, settings.projectOrder]);

  const collapsed = new Set(settings.collapsedProjects);
  const toggle = (cwd: string) => {
    const next = new Set(collapsed);
    if (next.has(cwd)) next.delete(cwd);
    else next.add(cwd);
    void update({ collapsedProjects: [...next] });
  };

  const reordered = (from: string, to: string, side: DropSide): string[] => {
    const order = allCwds.filter((c) => c !== from);
    const at = order.indexOf(to) + (side === "after" ? 1 : 0);
    order.splice(at, 0, from);
    return order;
  };
  const moveProject = (from: string, to: string, side: DropSide) => {
    if (from === to) return;
    void update({ projectOrder: reordered(from, to, side) });
  };
  // While a drag is in flight the list shows where the group will land instead of drawing a marker.
  const shownCwds = dragging && drop && drop.cwd !== dragging ? reordered(dragging, drop.cwd, drop.side) : allCwds;

  const q = query.trim().toLowerCase();
  const allPaths = useMemo(() => projects.flatMap((p) => p.sessions.map((s) => s.path)), [projects]);
  const contentHits = useContentSearch(q, allPaths);
  const currentCwd = selectedKey ? sessions[selectedKey]?.cwd : undefined;

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        if (!dragging) return;
        // Every point in the sidebar is a valid drop, so the cursor never shows "no drop" and the drop always fires.
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const over = (e.target as HTMLElement).closest<HTMLElement>("[data-cwd]");
        if (over?.dataset.cwd === dragging) return; // hovering the moved group itself: keep the current target
        if (over) {
          const box = over.getBoundingClientRect();
          placeDrop({ cwd: over.dataset.cwd!, side: e.clientY < box.top + box.height / 2 ? "before" : "after" });
          return;
        }
        // Gaps, the run-out below the last group, the toolbar above the first: nearest boundary by pointer position.
        const groups = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-cwd]")].filter((el) => el.dataset.cwd !== dragging);
        if (groups.length === 0) return;
        for (const el of groups) {
          const box = el.getBoundingClientRect();
          if (e.clientY < box.top + box.height / 2) {
            placeDrop({ cwd: el.dataset.cwd!, side: "before" });
            return;
          }
        }
        placeDrop({ cwd: groups[groups.length - 1].dataset.cwd!, side: "after" });
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (dragging) finishDrag(dragging);
      }}
    >
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
          <IconButton label="Open folder" className="h-8 w-8" onClick={() => void openFolder()}>
            <FolderPlus className="h-4 w-4" strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto px-2 pb-4">
        {allCwds.length === 0 && <div className="px-2 pt-8 text-center text-ui-[13px] text-fg-faint">No sessions yet</div>}
        {shownCwds.map((cwd) => {
          const project = projects.find((p) => p.cwd === cwd);
          const name = project?.name ?? cwd.split("/").filter(Boolean).pop() ?? cwd;
          const pending = pendingByCwd[cwd] ?? [];
          let rows = [
            ...pending.map((p) => ({ key: p.key, path: null as string | null, title: "New session", modifiedAt: null as string | null })),
            ...(project?.sessions ?? []).map((s) => ({ key: keyForPath(live, s.path), path: s.path, title: s.title, modifiedAt: s.modifiedAt })),
          ];
          if (q) {
            const nameHit = name.toLowerCase().includes(q);
            rows = rows.filter((r) => nameHit || (r.title ?? "").toLowerCase().includes(q) || (r.path !== null && contentHits.has(r.path)));
          }
          if (q && rows.length === 0) return null;
          const isCollapsed = !q && collapsed.has(cwd);
          const attention = rows.filter((r) => {
            const st = live[r.key]?.status;
            return st === "unread" || st === "needs-input";
          }).length;
          return (
            <div
              key={cwd}
              data-cwd={cwd}
              ref={(el) => {
                if (el) groupEls.current.set(cwd, el);
                else groupEls.current.delete(cwd);
              }}
              className={cn("project-group mb-1", dragging === cwd && "opacity-40")}
            >
              <div
                draggable={!q}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("application/x-pier-project", cwd);
                  // The list itself previews the move; no floating snapshot of the row.
                  e.dataTransfer.setDragImage(EMPTY_DRAG_IMAGE, 0, 0);
                  setDragging(cwd);
                }}
                onDragEnd={() => finishDrag(cwd)}
                className="group flex h-7 items-center gap-1 rounded-md pr-1 pl-2 text-ui-[12.5px] hover:bg-hover"
              >
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
              <div className="disclosure" data-open={!isCollapsed} data-instant={instant.current || !!q}>
                <div
                  inert={isCollapsed}
                  className={cn("flex flex-col gap-px pt-0.5 transition-opacity duration-150", isCollapsed && "opacity-0")}
                >
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
              </div>
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
        <IconButton label="Check for updates" disabled={upd.status === "checking"} onClick={() => void checkForUpdates()}>
          <RefreshCw className={cn("h-3.5 w-3.5", upd.status === "checking" && "anim-spin")} strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}
