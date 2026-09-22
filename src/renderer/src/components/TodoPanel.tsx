import { ChevronDown, Circle, CircleCheck, Link2 } from "lucide-react";
import type { TodoTask } from "@/lib/transcript";
import { useApp } from "@/store/app";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * The rpiv-todo task list, in the slot where the TUI draws its overlay: above the composer. pi runs
 * headless under Pier, so the extension registers no widget and the list is read from the session
 * instead. The heading collapses the rows; the choice persists in settings.
 */
export function TodoPanel({ tasks, working }: { tasks: TodoTask[]; working: boolean }) {
  const collapsed = useApp((s) => s.settings.todosCollapsed);
  const update = useApp((s) => s.updateSettings);
  const visible = tasks.filter((t) => t.status !== "deleted");
  if (visible.length === 0) return null;
  const done = visible.filter((t) => t.status === "completed").length;
  const current = visible.find((t) => t.status === "in_progress");

  return (
    <div className="anim-item mb-2 rounded-md border border-border bg-surface text-ui-[13px]">
      <button
        onClick={() => void update({ todosCollapsed: !collapsed })}
        className="flex h-8 w-full items-center gap-2 px-2.5 text-left"
        aria-expanded={!collapsed}
      >
        <span className="font-medium text-fg-muted">Todos</span>
        <span className="tabular-nums text-fg-faint">
          {done}/{visible.length}
        </span>
        {collapsed && current && <span className="min-w-0 flex-1 truncate text-fg-faint">{current.activeForm ?? current.subject}</span>}
        {!collapsed && <span className="flex-1" />}
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-fg-faint transition-transform duration-150", collapsed && "-rotate-90")} strokeWidth={2} />
      </button>
      <div className="disclosure" data-open={!collapsed}>
        <div>
          <ul className="max-h-[220px] overflow-y-auto border-t border-border px-1.5 py-1" inert={collapsed}>
            {visible.map((t) => (
              <TodoRow key={t.id} task={t} spinning={working} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TodoRow({ task, spinning }: { task: TodoTask; spinning: boolean }) {
  const active = task.status === "in_progress";
  const done = task.status === "completed";
  const blocked = (task.blockedBy ?? []).filter((id) => id !== task.id);
  return (
    <li className={cn("flex items-start gap-2 rounded px-1.5 py-1", active && "text-fg", done && "text-fg-faint", task.status === "pending" && "text-fg-muted")} title={task.description}>
      <span className="flex h-5 w-4 shrink-0 items-center justify-center">
        {done ? (
          <CircleCheck className="h-3.5 w-3.5 text-ok" strokeWidth={2} />
        ) : active && spinning ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : active ? (
          <Circle className="h-3.5 w-3.5 fill-current" strokeWidth={2} />
        ) : (
          <Circle className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
      </span>
      <span className="min-w-0 flex-1 leading-5">
        <span className={cn(done && "line-through decoration-fg-faint/60")}>{task.subject}</span>
        {active && task.activeForm && <span className="ml-2 text-fg-faint">{task.activeForm}</span>}
      </span>
      {blocked.length > 0 && !done && (
        <span className="flex shrink-0 items-center gap-1 pt-0.5 text-ui-[11.5px] text-fg-faint" title={`Blocked by ${blocked.map((id) => `#${id}`).join(", ")}`}>
          <Link2 className="h-3 w-3" strokeWidth={2} />
          {blocked.map((id) => `#${id}`).join(" ")}
        </span>
      )}
    </li>
  );
}
