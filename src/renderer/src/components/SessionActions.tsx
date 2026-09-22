import * as ContextMenu from "@radix-ui/react-context-menu";
import { Layers, Pencil, RotateCw, SquarePen, Trash2 } from "lucide-react";
import { create } from "zustand";
import { useApp } from "@/store/app";
import { ConfirmSheet, PromptSheet } from "@/components/PromptSheet";
import { cn } from "@/lib/utils";

export interface SessionTarget {
  key: string;
  cwd: string;
  path: string | null;
  title: string;
}

type Pending =
  | { kind: "rename" | "compact" | "trash"; target: SessionTarget }
  | { kind: "trashMany"; targets: SessionTarget[] }
  | { kind: "trashProject"; cwd: string; name: string; count: number }
  | null;

const usePending = create<{ pending: Pending; set: (p: Pending) => void }>((set) => ({ pending: null, set: (pending) => set({ pending }) }));

/** Open the Session if no process is attached yet, and return the key that owns it now. */
async function ensureOpen(target: SessionTarget): Promise<string> {
  const app = useApp.getState();
  if (app.sessions[target.key]) return target.key;
  await app.openSession(target.cwd, target.path);
  const live = useApp.getState().live;
  for (const s of Object.values(live)) if (target.path && s.path === target.path) return s.key;
  return target.key;
}

const itemClass =
  "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-ui-[13.5px] text-fg outline-none data-[highlighted]:bg-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-40";

const contentClass = "anim-fade-up z-50 min-w-[180px] overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-[var(--shadow)]";

/**
 * Wrap a sidebar row to give it the session actions on right-click. With a multi-row `selection`
 * that includes this row, the menu acts on the whole selection and offers only the bulk action.
 */
export function SessionContextMenu({ target, selection, children }: { target: SessionTarget; selection?: SessionTarget[]; children: React.ReactNode }) {
  const setPending = usePending((s) => s.set);
  const restart = useApp((s) => s.restartSession);
  const bulk = selection && selection.length > 1 && selection.some((t) => t.key === target.key) ? selection : null;
  if (bulk) {
    const trashable = bulk.filter((t) => t.path);
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className={contentClass}>
            <ContextMenu.Label className="px-2 py-1 text-ui-[11.5px] uppercase tracking-wide text-fg-faint">{bulk.length} sessions selected</ContextMenu.Label>
            <ContextMenu.Item
              className={cn(itemClass, "text-danger data-[highlighted]:bg-danger-soft")}
              disabled={trashable.length === 0}
              onSelect={() => setPending({ kind: "trashMany", targets: trashable })}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> Move {trashable.length} to Trash
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    );
  }
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={contentClass}>
          <ContextMenu.Item className={itemClass} onSelect={() => setPending({ kind: "rename", target })}>
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} /> Rename
          </ContextMenu.Item>
          <ContextMenu.Item className={itemClass} onSelect={() => setPending({ kind: "compact", target })}>
            <Layers className="h-3.5 w-3.5" strokeWidth={1.75} /> Compact context
          </ContextMenu.Item>
          <ContextMenu.Item
            className={itemClass}
            onSelect={() => {
              void ensureOpen(target).then((key) => restart(key));
            }}
          >
            <RotateCw className="h-3.5 w-3.5" strokeWidth={1.75} /> Restart pi
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextMenu.Item
            className={cn(itemClass, "text-danger data-[highlighted]:bg-danger-soft")}
            disabled={!target.path}
            onSelect={() => setPending({ kind: "trash", target })}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> Move to Trash
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** Right-click menu on a project header. */
export function ProjectContextMenu({ cwd, name, count, children }: { cwd: string; name: string; count: number; children: React.ReactNode }) {
  const setPending = usePending((s) => s.set);
  const openSession = useApp((s) => s.openSession);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={contentClass}>
          <ContextMenu.Item className={itemClass} onSelect={() => void openSession(cwd, null)}>
            <SquarePen className="h-3.5 w-3.5" strokeWidth={1.75} /> New session
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextMenu.Item className={cn(itemClass, "text-danger data-[highlighted]:bg-danger-soft")} onSelect={() => setPending({ kind: "trashProject", cwd, name, count })}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> Remove project
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** The sheets the context menu opens. Mounted once at the app root. */
export function SessionActionSheets() {
  const pending = usePending((s) => s.pending);
  const setPending = usePending((s) => s.set);
  const rename = useApp((s) => s.renameSession);
  const compact = useApp((s) => s.compact);
  const trash = useApp((s) => s.trashSession);
  const trashProject = useApp((s) => s.trashProject);
  const single = pending && "target" in pending ? pending.target : undefined;
  const currentName = useApp((s) => (single ? s.sessions[single.key]?.state?.sessionName : undefined));
  const close = () => setPending(null);
  const t = single;
  const many = pending?.kind === "trashMany" ? pending.targets : [];
  const project = pending?.kind === "trashProject" ? pending : null;
  return (
    <>
      <PromptSheet
        open={pending?.kind === "rename"}
        title="Rename session"
        initial={currentName ?? (t?.title === "New session" || t?.title === "Empty session" ? "" : t?.title ?? "")}
        placeholder="Session name"
        onClose={close}
        onSubmit={(name) => {
          close();
          if (t) void ensureOpen(t).then((key) => rename(key, name));
        }}
      />
      <PromptSheet
        open={pending?.kind === "compact"}
        title="Compact context"
        placeholder="Optional: what the summary should keep"
        submitLabel="Compact"
        onClose={close}
        onSubmit={(instructions) => {
          close();
          if (t) void ensureOpen(t).then((key) => compact(key, instructions.trim() || undefined));
        }}
      />
      <ConfirmSheet
        open={pending?.kind === "trash"}
        title={`Move "${t?.title ?? "this session"}" to the Trash?`}
        message="The session file goes to the macOS Trash. pi will no longer list it."
        confirmLabel="Move to Trash"
        danger
        onClose={close}
        onConfirm={() => {
          close();
          if (t?.path) void trash(t.key, t.path);
        }}
      />
      <ConfirmSheet
        open={pending?.kind === "trashMany"}
        title={`Move ${many.length} sessions to the Trash?`}
        message="Their session files go to the macOS Trash. pi will no longer list them."
        confirmLabel={`Move ${many.length} to Trash`}
        danger
        onClose={close}
        onConfirm={() => {
          close();
          void (async () => {
            for (const target of many) if (target.path) await trash(target.key, target.path);
          })();
        }}
      />
      <ConfirmSheet
        open={pending?.kind === "trashProject"}
        title={`Remove "${project?.name ?? "this project"}" from Pier?`}
        message={
          project && project.count > 0
            ? `Its ${project.count === 1 ? "session file goes" : `${project.count} session files go`} to the macOS Trash. The folder itself is not touched.`
            : "The project leaves the sidebar. Its folder is not touched."
        }
        confirmLabel="Remove project"
        danger
        onClose={close}
        onConfirm={() => {
          close();
          if (project) void trashProject(project.cwd);
        }}
      />
    </>
  );
}
