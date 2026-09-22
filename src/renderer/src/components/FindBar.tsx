import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useApp } from "@/store/app";
import { FIND_STEP_EVENT } from "@/hooks/useShortcuts";
import { IconButton } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Find in the current thread, browser style: matches are painted through the CSS Custom Highlight
 * API (no DOM edits, so the transcript keeps streaming underneath), the active match scrolls into
 * view, Enter steps forward and Shift+Enter back. Text inside collapsed disclosures is skipped
 * because it cannot be scrolled to.
 */
export function FindBar({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  const { open, seq } = useApp((s) => s.find);
  const closeFind = useApp((s) => s.closeFind);
  const sessionKey = useApp((s) => s.selectedKey);
  const [query, setQuery] = useState("");
  const [count, setCount] = useState(0);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const ranges = useRef<Range[]>([]);
  // The active index lives in a ref too so the scan (which runs outside React's render) can keep it.
  const activeRef = useRef(0);

  // Switching sessions drops the bar; its matches belong to the old transcript.
  useEffect(() => closeFind(), [sessionKey, closeFind]);

  // Each open request focuses the input and selects its text, so typing replaces the last query.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open, seq]);

  useEffect(() => {
    if (!open) {
      clearHighlights();
      ranges.current = [];
      return;
    }
    const root = scrollRef.current;
    if (!root) return;

    const paint = () => {
      const found = ranges.current;
      const idx = Math.min(activeRef.current, Math.max(0, found.length - 1));
      activeRef.current = idx;
      CSS.highlights.set("find-match", new Highlight(...found));
      CSS.highlights.set("find-active", new Highlight(...(found[idx] ? [found[idx]] : [])));
      setCount(found.length);
      setActive(found.length ? idx : 0);
    };

    const scan = (resetActive: boolean) => {
      const q = query.trim().toLowerCase();
      ranges.current = q ? collectMatches(root, q) : [];
      if (resetActive) {
        // Start from the first match at or below the top of the viewport, like a browser does.
        const top = root.getBoundingClientRect().top;
        const i = ranges.current.findIndex((r) => r.getBoundingClientRect().bottom >= top);
        activeRef.current = i < 0 ? 0 : i;
      }
      paint();
      if (resetActive) revealActive(root, ranges.current[activeRef.current]);
    };

    scan(true);
    // The transcript keeps changing while a reply streams; re-scan a beat after it settles.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => scan(false), 120);
    });
    observer.observe(root, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["data-open"] });

    const step = (delta: number) => {
      const n = ranges.current.length;
      if (!n) return;
      activeRef.current = (activeRef.current + delta + n) % n;
      paint();
      revealActive(root, ranges.current[activeRef.current]);
    };
    const onStep = (e: Event) => step((e as CustomEvent<number>).detail);
    window.addEventListener(FIND_STEP_EVENT, onStep);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      window.removeEventListener(FIND_STEP_EVENT, onStep);
    };
  }, [open, query, scrollRef]);

  if (!open) return null;

  const step = (delta: number) => window.dispatchEvent(new CustomEvent(FIND_STEP_EVENT, { detail: delta }));
  const none = query.trim().length > 0 && count === 0;

  return (
    <div
      data-find
      className="anim-item absolute top-1.5 right-4 z-20 flex h-9 items-center gap-1 rounded-lg border border-border bg-surface-raised pr-1 pl-2.5 shadow-[var(--shadow)]"
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation(); // the global Escape aborts a working session; not while finding
            closeFind();
          }
        }}
        placeholder="Find in thread"
        spellCheck={false}
        className="w-[200px] bg-transparent text-ui-[13.5px] text-fg placeholder:text-fg-faint focus:outline-none"
      />
      <span className={cn("min-w-[52px] text-right text-ui-[12px] tabular-nums", none ? "text-danger" : "text-fg-faint")}>
        {query.trim() ? (count ? `${active + 1} of ${count}` : "No matches") : ""}
      </span>
      <div className="ml-1 h-4 w-px bg-border" />
      <IconButton label="Previous match (Shift+Enter)" className="h-7 w-7" disabled={count === 0} onClick={() => step(-1)}>
        <ChevronUp className="h-4 w-4" strokeWidth={2} />
      </IconButton>
      <IconButton label="Next match (Enter)" className="h-7 w-7" disabled={count === 0} onClick={() => step(1)}>
        <ChevronDown className="h-4 w-4" strokeWidth={2} />
      </IconButton>
      <IconButton label="Close (Esc)" className="h-7 w-7" onClick={closeFind}>
        <X className="h-4 w-4" strokeWidth={2} />
      </IconButton>
    </div>
  );
}

function clearHighlights() {
  CSS.highlights.delete("find-match");
  CSS.highlights.delete("find-active");
}

/** Every occurrence of `q` (already lower-cased) inside visible text nodes under `root`, in document order. */
function collectMatches(root: HTMLElement, q: string): Range[] {
  const out: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const el = node.parentElement;
      if (!el || !node.nodeValue || node.nodeValue.trim() === "") return NodeFilter.FILTER_REJECT;
      if (el.closest('.disclosure[data-open="false"], [inert], [data-find]')) return NodeFilter.FILTER_REJECT;
      if (!el.checkVisibility({ checkVisibilityCSS: true })) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue!.toLowerCase();
    let from = 0;
    let at: number;
    while ((at = text.indexOf(q, from)) >= 0) {
      const range = new Range();
      range.setStart(node, at);
      range.setEnd(node, at + q.length);
      out.push(range);
      from = at + q.length;
    }
  }
  return out;
}

/** Scroll the container so the match sits in its upper third, unless it is already fully visible. */
function revealActive(root: HTMLElement, range: Range | undefined) {
  if (!range) return;
  const rect = range.getBoundingClientRect();
  const box = root.getBoundingClientRect();
  if (rect.top >= box.top + 8 && rect.bottom <= box.bottom - 8) return;
  const target = root.scrollTop + (rect.top - box.top) - box.height / 3;
  const reduce = document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.scrollTo({ top: Math.max(0, target), behavior: reduce ? "auto" : "smooth" });
}
