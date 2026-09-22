import { useEffect, useRef, useState } from "react";
import { ChevronRight, FileEdit, FilePlus, FileText, FolderSearch, ListTodo, Search, Terminal, Wrench, Check, X } from "lucide-react";
import type { ContentBlock } from "@shared/contract";
import type { ToolRun } from "@/store/app";
import type { ToolResultMsg } from "@/lib/transcript";
import { textOf } from "@/lib/transcript";
import { Spinner } from "@/components/ui";
import { CopyMenu } from "@/components/CopyMenu";
import { cn } from "@/lib/utils";

type ToolCall = Extract<ContentBlock, { type: "toolCall" }>;

function iconFor(name: string) {
  switch (name) {
    case "bash":
      return Terminal;
    case "read":
      return FileText;
    case "edit":
      return FileEdit;
    case "write":
      return FilePlus;
    case "grep":
      return Search;
    case "find":
    case "ls":
      return FolderSearch;
    case "todo":
      return ListTodo;
    default:
      return Wrench;
  }
}

function summary(call: ToolCall): string {
  const a = call.arguments as Record<string, unknown>;
  switch (call.name) {
    case "bash":
      return String(a.command ?? "");
    case "read": {
      const range = a.offset != null || a.limit != null ? ` (${a.offset ?? 1}${a.limit != null ? `, ${a.limit} lines` : ""})` : "";
      return `${a.path ?? ""}${range}`;
    }
    case "edit":
    case "write":
      return String(a.path ?? "");
    case "grep":
      return `${a.pattern ?? ""}${a.path ? ` in ${a.path}` : ""}`;
    case "find":
      return `${a.pattern ?? ""}${a.path ? ` in ${a.path}` : ""}`;
    case "ls":
      return String(a.path ?? ".");
    case "todo": {
      const ref = a.id != null ? `#${a.id}` : "";
      switch (a.action) {
        case "create":
          return `create ${a.subject ?? ""}`;
        case "update":
          return `update ${ref}${a.status ? ` → ${String(a.status).replace("_", " ")}` : ""}`;
        case "list":
          return `list${a.status ? ` ${a.status}` : ""}`;
        default:
          return `${a.action ?? ""} ${ref}`.trim();
      }
    }
    default: {
      const keys = Object.keys(a);
      if (keys.length === 0) return "";
      const first = a[keys[0]];
      return typeof first === "string" ? first : JSON.stringify(a).slice(0, 160);
    }
  }
}

function tail(text: string, lines: number): string {
  const arr = text.split("\n");
  return arr.length <= lines ? text : arr.slice(-lines).join("\n");
}

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="selectable max-h-[420px] overflow-auto px-3 py-2 font-mono text-ui-[12.5px] leading-[1.5]">
      {diff.split("\n").map((line, i) => {
        const tone = line.startsWith("+") ? "bg-ok/12 text-fg" : line.startsWith("-") ? "bg-danger/12 text-fg" : line.startsWith("@@") ? "text-accent" : "text-fg-muted";
        return (
          <div key={i} className={cn("px-1 -mx-1 whitespace-pre-wrap", tone)}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}

export function ToolCallRow({ call, result, run, pendingArgs }: { call: ToolCall; result?: ToolResultMsg; run?: ToolRun; pendingArgs?: string }) {
  const running = !result && (run?.status === "running" || (!run && pendingArgs !== undefined));
  const preparing = !result && !run && Object.keys(call.arguments).length === 0;
  const isError = result?.isError ?? run?.isError ?? false;
  const details = (result?.details ?? {}) as Record<string, unknown>;
  const diff = typeof details.diff === "string" ? details.diff : null;
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? (call.name === "edit" && !!diff);
  // Rows that start open (edit diffs) must not animate on first paint, or the transcript shuffles mid-stream.
  const instant = useRef(true);
  useEffect(() => {
    const id = requestAnimationFrame(() => (instant.current = false));
    return () => cancelAnimationFrame(id);
  }, []);
  const [everOpened, setEverOpened] = useState(expanded);
  useEffect(() => {
    if (expanded) setEverOpened(true);
  }, [expanded]);
  const Icon = iconFor(call.name);
  const resultText = result ? textOf(result.content) : run?.partial ?? "";
  const hasBody = Boolean(resultText) || Boolean(diff) || (call.name === "write" && typeof call.arguments.content === "string");

  const copyText = diff ?? (call.name === "write" && typeof call.arguments.content === "string" ? call.arguments.content : resultText);
  return (
    <CopyMenu text={copyText} label={diff ? "Copy diff" : "Copy output"}>
    <div className={cn("rounded-md border bg-bg-sunken", isError ? "border-danger/40" : "border-border")}>
      <button
        onClick={() => hasBody && setOpen(!expanded)}
        className={cn("flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-ui-[13px]", hasBody && "cursor-pointer")}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {running || preparing ? <Spinner /> : isError ? <X className="h-3.5 w-3.5 text-danger" strokeWidth={2.25} /> : <Icon className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />}
        </span>
        <span className="shrink-0 font-medium text-fg-muted">{call.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-ui-[12.5px] text-fg">{preparing ? "preparing" : summary(call)}</span>
        {result && !isError && call.name !== "edit" && <Check className="h-3.5 w-3.5 shrink-0 text-fg-faint" strokeWidth={2} />}
        {hasBody && <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-fg-faint transition-transform duration-150", expanded && "rotate-90")} strokeWidth={2} />}
      </button>
      {!expanded && running && resultText && call.name === "bash" && (
        <pre className="max-h-20 overflow-hidden border-t border-border px-3 py-1.5 font-mono text-ui-[12px] leading-[1.45] text-fg-muted whitespace-pre-wrap">{tail(resultText, 4)}</pre>
      )}
      {hasBody && (
        <div className="disclosure" data-open={expanded} data-instant={instant.current}>
          <div>
            {everOpened && (
              <div className="border-t border-border">
                {diff ? (
                  <DiffView diff={diff} />
                ) : call.name === "write" && typeof call.arguments.content === "string" ? (
                  <pre className="selectable max-h-[420px] overflow-auto px-3 py-2 font-mono text-ui-[12.5px] leading-[1.5] text-fg-muted whitespace-pre-wrap">{call.arguments.content}</pre>
                ) : (
                  <pre className={cn("selectable max-h-[420px] overflow-auto px-3 py-2 font-mono text-ui-[12.5px] leading-[1.5] whitespace-pre-wrap", isError ? "text-danger" : "text-fg-muted")}>
                    {resultText}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </CopyMenu>
  );
}
