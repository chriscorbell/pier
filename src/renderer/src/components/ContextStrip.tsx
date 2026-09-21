import { Tip } from "@/components/ui";
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
