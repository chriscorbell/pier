import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null) return "–";
  if (n < 1000) return String(n);
  if (n < 100_000) return `${(n / 1000).toFixed(1)}K`;
  return `${Math.round(n / 1000)}K`;
}

export function formatCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

export function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** Display name for a pi thinking level: "xhigh" reads as "Extra high". */
export function reasoningLabel(level: string | null | undefined): string {
  switch ((level ?? "off").toLowerCase()) {
    case "xhigh":
      return "Extra high";
    case "off":
      return "Off";
    default:
      return level!.charAt(0).toUpperCase() + level!.slice(1);
  }
}
