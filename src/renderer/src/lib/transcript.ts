import type { AgentMessage, ContentBlock, SessionEntry } from "@shared/contract";
import { reasoningLabel } from "@/lib/utils";

export type ImageBlock = Extract<ContentBlock, { type: "image" }>;
export type ToolResultMsg = Extract<AgentMessage, { role: "toolResult" }>;
export type AssistantMsg = Extract<AgentMessage, { role: "assistant" }>;

export type TranscriptItem =
  | { kind: "user"; id: string; text: string; images: ImageBlock[]; timestamp: number }
  | { kind: "assistant"; id: string; message: AssistantMsg; results: Record<string, ToolResultMsg> }
  | { kind: "bash"; id: string; command: string; output: string; exitCode?: number }
  | { kind: "compaction"; id: string; summary: string; tokensBefore: number }
  | { kind: "custom"; id: string; customType: string; text: string }
  | { kind: "note"; id: string; text: string };

export function textOf(content: string | ContentBlock[] | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** The active branch, root first: from the leaf (or the last entry) back through parent links. */
export function activeBranch(entries: SessionEntry[], leafId: string | null): SessionEntry[] {
  if (!entries.length) return [];
  const byId = new Map<string, SessionEntry>();
  for (const e of entries) byId.set(e.id, e);
  const path: SessionEntry[] = [];
  let cur = leafId ? byId.get(leafId) : entries[entries.length - 1];
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path.reverse();
}

/** A task from the rpiv-todo extension. Every `todo` tool result carries the full list in `details.tasks`. */
export interface TodoTask {
  id: number;
  subject: string;
  description?: string;
  activeForm?: string;
  status: "pending" | "in_progress" | "completed" | "deleted";
  blockedBy?: number[];
  owner?: string;
}

/**
 * The latest todo list on the active branch: the last successful `todo` result's snapshot. This is
 * how the extension itself restores state after a reload, so no extra channel is needed.
 */
export function todoSnapshot(entries: SessionEntry[], leafId: string | null): TodoTask[] {
  const path = activeBranch(entries, leafId);
  for (let i = path.length - 1; i >= 0; i--) {
    const m = path[i].message;
    if (!m || m.role !== "toolResult" || m.toolName !== "todo" || m.isError) continue;
    const tasks = m.details?.tasks;
    if (Array.isArray(tasks)) return tasks as TodoTask[];
  }
  return [];
}

/** Walk the active branch (leaf to root) and turn it into renderable items in order. */
export function buildTranscript(entries: SessionEntry[], leafId: string | null): TranscriptItem[] {
  const path = activeBranch(entries, leafId);
  if (!path.length) return [];

  const items: TranscriptItem[] = [];
  const pendingResults = new Map<string, ToolResultMsg>();
  let lastAssistant: Extract<TranscriptItem, { kind: "assistant" }> | null = null;
  // The reasoning level in effect, once the branch has stated one; a model note names it.
  let reasoning: string | null = null;
  // Model and reasoning changes before the first prompt are session setup, not conversation.
  let conversationStarted = false;

  for (let i = 0; i < path.length; i++) {
    const e = path[i];
    if (e.type === "message" && e.message) {
      const m = e.message;
      switch (m.role) {
        case "user": {
          const images = typeof m.content === "string" ? [] : m.content.filter((b): b is ImageBlock => b.type === "image");
          items.push({ kind: "user", id: e.id, text: textOf(m.content), images, timestamp: m.timestamp });
          lastAssistant = null;
          conversationStarted = true;
          break;
        }
        case "assistant": {
          const item: Extract<TranscriptItem, { kind: "assistant" }> = { kind: "assistant", id: e.id, message: m, results: {} };
          for (const b of m.content) {
            if (b.type === "toolCall") {
              const r = pendingResults.get(b.id);
              if (r) {
                item.results[b.id] = r;
                pendingResults.delete(b.id);
              }
            }
          }
          items.push(item);
          lastAssistant = item;
          break;
        }
        case "toolResult": {
          if (lastAssistant && lastAssistant.message.content.some((b) => b.type === "toolCall" && b.id === m.toolCallId)) {
            lastAssistant.results[m.toolCallId] = m;
          } else {
            pendingResults.set(m.toolCallId, m);
          }
          break;
        }
        case "bashExecution":
          items.push({ kind: "bash", id: e.id, command: m.command, output: m.output, exitCode: m.exitCode });
          break;
        case "compactionSummary":
          items.push({ kind: "compaction", id: e.id, summary: m.summary, tokensBefore: m.tokensBefore });
          break;
        case "branchSummary":
          items.push({ kind: "note", id: e.id, text: "Branch summary: " + m.summary.slice(0, 200) });
          break;
        case "custom":
          if (m.display) items.push({ kind: "custom", id: e.id, customType: m.customType, text: textOf(m.content) });
          break;
      }
      continue;
    }
    switch (e.type) {
      case "compaction":
        items.push({ kind: "compaction", id: e.id, summary: e.summary ?? "", tokensBefore: e.tokensBefore ?? 0 });
        break;
      case "model_change": {
        // Switching models can re-clamp the reasoning level, which pi records as a second entry
        // right after this one. Fold it into the model note so one action reads as one line.
        const next = path[i + 1];
        if (next?.type === "thinking_level_change") {
          reasoning = next.thinkingLevel ?? reasoning;
          i++;
        }
        if (!conversationStarted) break;
        const level = reasoning ? (reasoning === "off" ? " with reasoning off" : ` with ${reasoningLabel(reasoning).toLowerCase()} reasoning`) : "";
        items.push({ kind: "note", id: e.id, text: `Model changed to ${e.provider}/${e.modelId}${level}` });
        break;
      }
      case "thinking_level_change":
        reasoning = e.thinkingLevel ?? null;
        if (conversationStarted) items.push({ kind: "note", id: e.id, text: `Reasoning level changed to ${reasoningLabel(e.thinkingLevel).toLowerCase()}` });
        break;
      case "custom_message":
        if (e.display) items.push({ kind: "custom", id: e.id, customType: e.customType ?? "extension", text: textOf(e.content) });
        break;
    }
  }
  return items;
}

/** User prompts on the active branch, oldest first, for ArrowUp recall. */
export function promptHistory(items: TranscriptItem[]): string[] {
  return items.filter((i): i is Extract<TranscriptItem, { kind: "user" }> => i.kind === "user").map((i) => i.text);
}
