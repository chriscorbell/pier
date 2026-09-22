import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { PenLine } from "lucide-react";
import { useApp } from "@/store/app";
import { Button, Kbd, Sheet } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Extension dialogs are plain strings over RPC. Extensions that fall back to these primitives
 * (ask_user_question, for one) pack structure into them: a `[Header]` prefix, paragraphs after a
 * blank line, numbered options with an em-dash description, a "(Recommended)" tag, and
 * `--- N. Label preview ---` blocks. Pier unpacks what it recognizes and shows the rest as text.
 */
interface ParsedTitle {
  eyebrow?: string;
  title: string;
  paragraphs: string[];
  /** Option index (1-based) to preview text. */
  previews: Map<number, string>;
}

function parseTitle(raw: string): ParsedTitle {
  const previews = new Map<number, string>();
  const marker = /^--- (\d+)\. .*? preview ---$/gm;
  let head = raw;
  const marks = [...raw.matchAll(marker)];
  if (marks.length) {
    head = raw.slice(0, marks[0].index).trimEnd();
    marks.forEach((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < marks.length ? marks[i + 1].index! : raw.length;
      previews.set(Number(m[1]), raw.slice(start, end).trim());
    });
  }
  let eyebrow: string | undefined;
  const tagged = /^\[([^\]\n]{1,40})\]\s+/.exec(head);
  if (tagged) {
    eyebrow = tagged[1];
    head = head.slice(tagged[0].length);
  }
  const [title, ...paragraphs] = head.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  return { eyebrow, title: title ?? "", paragraphs, previews };
}

interface ParsedOption {
  raw: string;
  label: string;
  description?: string;
  recommended: boolean;
  /** The extension's free-text escape row. */
  custom: boolean;
}

function parseOption(raw: string, index: number, count: number): ParsedOption {
  let text = raw.replace(/^\d+\.\s+/, "");
  let description: string | undefined;
  const dash = text.indexOf(" — ");
  if (dash >= 0) {
    description = text.slice(dash + 3).trim();
    text = text.slice(0, dash);
  }
  const rec = /\s*\((recommended)\)\s*$/i.exec(text);
  if (rec) text = text.slice(0, rec.index);
  const label = text.trim();
  const custom = index === count - 1 && !description && /^(type something\.?|other)$/i.test(label);
  return { raw, label, description, recommended: !!rec, custom };
}

/** A paragraph made only of numbered lines is an option list (multi-select prompts carry one). */
function numberedLines(paragraph: string): string[] | null {
  const lines = paragraph.split("\n");
  return lines.length > 0 && lines.every((l) => /^\d+\.\s/.test(l)) ? lines : null;
}

function Paragraphs({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {items.map((p, i) => {
        const list = numberedLines(p);
        if (list) {
          return (
            <ol key={i} className="flex flex-col gap-1">
              {list.map((line, j) => {
                const o = parseOption(line, j, list.length);
                return (
                  <li key={j} className="flex items-baseline gap-2">
                    <span className="w-4 shrink-0 text-right tabular-nums text-fg-faint">{j + 1}.</span>
                    <span>
                      <span className="text-fg">{o.label}</span>
                      {o.description && <span className="text-fg-muted"> {o.description}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          );
        }
        return (
          <p key={i} className="selectable whitespace-pre-wrap">
            {p}
          </p>
        );
      })}
    </div>
  );
}

/** Extension dialog requests (select, confirm, input, editor) for the selected Session. */
export function DialogSheet() {
  const key = useApp((s) => s.selectedKey);
  const dialog = useApp((s) => (s.selectedKey ? s.sessions[s.selectedKey]?.dialogs[0] : undefined));
  const respond = useApp((s) => s.respondDialog);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dialog) return;
    setText(dialog.method === "editor" ? dialog.prefill ?? "" : "");
    if (dialog.method === "select") requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }, [dialog?.id]);

  if (!key || !dialog) return null;
  const cancel = () => void respond(key, dialog.id, { cancelled: true });
  const parsed = parseTitle(dialog.title);
  const body = dialog.method === "confirm" ? [...parsed.paragraphs, ...(dialog.message ? [dialog.message] : [])] : parsed.paragraphs;
  const description = body.length ? <Paragraphs items={body} /> : undefined;

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (dialog.method !== "select") return;
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-option]") ?? [])];
    const n = Number(e.key);
    if (e.key >= "1" && e.key <= "9" && n <= dialog.options.length) {
      e.preventDefault();
      void respond(key, dialog.id, { value: dialog.options[n - 1] });
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown" ? Math.min(buttons.length - 1, i + 1) : Math.max(0, i - 1);
      buttons[next]?.focus();
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && cancel()}
      title={parsed.title}
      eyebrow={parsed.eyebrow}
      description={description}
      width={dialog.method === "editor" ? 640 : 480}
    >
      {dialog.method === "select" && (
        <div ref={listRef} onKeyDown={onListKey} className="flex flex-col gap-1.5">
          {dialog.options.map((raw, i) => {
            const o = parseOption(raw, i, dialog.options.length);
            const preview = parsed.previews.get(i + 1);
            return (
              <button
                key={raw}
                data-option
                onClick={() => void respond(key, dialog.id, { value: raw })}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-100 hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus",
                  o.custom ? "border-dashed border-border-strong text-fg-muted hover:text-fg" : "border-border",
                )}
              >
                <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center">
                  {o.custom ? <PenLine className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Kbd>{i + 1}</Kbd>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ui-[14px] font-medium leading-snug">
                    <span>{o.custom ? "Write your own answer" : o.label}</span>
                    {o.recommended && (
                      <span className="rounded-full bg-accent-soft px-1.5 text-ui-[11px] font-medium leading-4 text-fg">Recommended</span>
                    )}
                  </span>
                  {o.description && <span className="mt-0.5 block text-ui-[13px] leading-snug text-fg-muted">{o.description}</span>}
                  {preview && (
                    <pre className="selectable mt-2 max-h-40 overflow-auto rounded-md border border-border bg-code-bg px-2.5 py-2 font-mono text-ui-[12px] leading-[1.5] whitespace-pre-wrap text-fg-muted">
                      {preview}
                    </pre>
                  )}
                </span>
              </button>
            );
          })}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-ui-[12px] text-fg-faint">Press a number to choose, Esc to cancel</span>
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {dialog.method === "confirm" && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => void respond(key, dialog.id, { confirmed: false })}>
            No
          </Button>
          <Button variant="primary" autoFocus onClick={() => void respond(key, dialog.id, { confirmed: true })}>
            Yes
          </Button>
        </div>
      )}
      {(dialog.method === "input" || dialog.method === "editor") && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void respond(key, dialog.id, { value: text });
          }}
        >
          {dialog.method === "input" ? (
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={dialog.placeholder}
              className="h-9 w-full rounded-md border border-border-strong bg-bg-sunken px-2.5 text-ui-[14px] text-fg placeholder:text-fg-faint focus-visible:outline-none focus-visible:border-focus"
            />
          ) : (
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={14}
              className="w-full resize-y rounded-md border border-border-strong bg-bg-sunken p-2.5 font-mono text-ui-[13px] text-fg focus-visible:outline-none focus-visible:border-focus"
            />
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Submit
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
