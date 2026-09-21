import { useEffect, useState } from "react";
import { Spinner, Tip } from "@/components/ui";
import { cn, formatTokens } from "@/lib/utils";

export function ContextMeter({ percent, tokens, window }: { percent: number | null; tokens: number | null; window: number }) {
  const p = percent ?? 0;
  const tone = p >= 80 ? "bg-danger" : p >= 60 ? "bg-warn" : "bg-fg-muted";
  return (
    <Tip label={`Context: ${formatTokens(tokens)} of ${formatTokens(window)} tokens${percent == null ? " (estimating)" : ""}`}>
      <div className="flex items-center gap-1.5 tabular-nums">
        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-border-strong/60">
          <div className={cn("h-full rounded-full transition-[width] duration-300", tone)} style={{ width: `${Math.min(100, p)}%` }} />
        </div>
        <span>{percent == null ? "–" : `${Math.round(p)}%`}</span>
      </div>
    </Tip>
  );
}

/**
 * Progress for an Extension's cache warm-up, driven by its status text. The llm-server extension
 * writes "warming prefix cache (reason) ~12 s"; the estimate paces the bar, which holds near the
 * end until the status clears.
 */
export function WarmIndicator({ text }: { text: string }) {
  const estimate = Number(/~(\d+(?:\.\d+)?)\s*s\b/.exec(text)?.[1]) || 0;
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = (now - startedAt) / 1000;
  const percent = estimate > 0 ? Math.min(96, (elapsed / estimate) * 100) : 0;
  return (
    <Tip label={`${text}${estimate > 0 ? ` (${Math.round(elapsed)} s elapsed)` : ""}`}>
      <div className="anim-crossfade flex items-center gap-1.5 tabular-nums">
        <Spinner className="h-3 w-3 text-fg-faint" />
        <span>Warming</span>
        {estimate > 0 && (
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-border-strong/60">
            <div className="h-full rounded-full bg-warn transition-[width] duration-200" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
    </Tip>
  );
}
