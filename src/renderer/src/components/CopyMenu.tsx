import { useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Check, Copy } from "lucide-react";
import { useApp } from "@/store/app";
import { bridge } from "@/lib/bridge";
import { cn } from "@/lib/utils";

const itemClass =
  "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-ui-[13.5px] text-fg outline-none data-[highlighted]:bg-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-40";

/** Write to the clipboard through main; the web clipboard needs a focused document, Electron's does not. */
export async function copyText(text: string, toast: (m: string) => void): Promise<void> {
  try {
    await bridge.clipboard.write(text);
  } catch {
    toast("Could not write to the clipboard");
  }
}
const copy = copyText;

/**
 * Right-click menu for a message: Copy the current text selection, or Copy message for the
 * whole thing. `text` is the full message as plain text or Markdown source.
 */
export function CopyMenu({ text, label = "Copy message", children }: { text: string; label?: string; children: React.ReactNode }) {
  const pushToast = useApp((s) => s.pushToast);
  const [selection, setSelection] = useState("");
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild onContextMenu={() => setSelection(window.getSelection()?.toString() ?? "")}>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="anim-fade-up z-50 min-w-[180px] overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-[var(--shadow)]">
          <ContextMenu.Item className={itemClass} disabled={!selection} onSelect={() => void copy(selection, (m) => pushToast(m, "warning"))}>
            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} /> Copy
          </ContextMenu.Item>
          <ContextMenu.Item className={itemClass} onSelect={() => void copy(text, (m) => pushToast(m, "warning"))}>
            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} /> {label}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** Small copy button that appears on hover in a message's corner. Shows a check for a moment after copying. */
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const pushToast = useApp((s) => s.pushToast);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        void copy(text, (m) => pushToast(m, "warning")).then(() => {
          setDone(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setDone(false), 1200);
        });
      }}
      aria-label="Copy message"
      title="Copy message"
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-faint opacity-0 transition-[opacity,color,background-color] duration-100 group-hover:opacity-100 hover:bg-hover hover:text-fg focus-visible:opacity-100",
        done && "opacity-100 text-ok",
        className,
      )}
    >
      {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.25} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />}
    </button>
  );
}
