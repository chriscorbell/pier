import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@shared/contract";
import { buildTranscript, todoSnapshot } from "./transcript";

let seq = 0;
function entry(partial: Partial<SessionEntry> & { type: string }, parentId: string | null): SessionEntry {
  return { id: `e${++seq}`, parentId, timestamp: "2026-09-22T00:00:00.000Z", ...partial };
}

/** A linear branch: each entry's parent is the one before it. */
function branch(...parts: (Partial<SessionEntry> & { type: string })[]): SessionEntry[] {
  const out: SessionEntry[] = [];
  for (const p of parts) out.push(entry(p, out.length ? out[out.length - 1].id : null));
  return out;
}

const user = (text: string) => ({ type: "message", message: { role: "user" as const, content: text, timestamp: 1 } });
const model = (provider: string, modelId: string) => ({ type: "model_change", provider, modelId });
const level = (thinkingLevel: string) => ({ type: "thinking_level_change", thinkingLevel });
const todoResult = (tasks: unknown[] | undefined, isError = false) => ({
  type: "message",
  message: { role: "toolResult" as const, toolCallId: "t", toolName: "todo", content: [], details: tasks ? { tasks } : {}, isError, timestamp: 1 },
});

describe("buildTranscript notes", () => {
  it("hides model and reasoning changes before the first prompt", () => {
    const entries = branch(model("a", "m1"), level("high"), user("hi"));
    expect(buildTranscript(entries, null).map((i) => i.kind)).toEqual(["user"]);
  });

  it("names the level in effect on a later model note", () => {
    const entries = branch(level("xhigh"), user("hi"), model("openai", "gpt"));
    const notes = buildTranscript(entries, null).filter((i) => i.kind === "note");
    expect(notes.map((n) => n.text)).toEqual(["Model changed to openai/gpt with extra high reasoning"]);
  });

  it("folds a reasoning re-clamp that follows a model change into one note", () => {
    const entries = branch(user("hi"), level("xhigh"), model("anthropic", "opus"), level("medium"));
    const notes = buildTranscript(entries, null).filter((i) => i.kind === "note");
    expect(notes.map((n) => n.text)).toEqual(["Reasoning level changed to extra high", "Model changed to anthropic/opus with medium reasoning"]);
  });

  it("follows the active branch from the leaf", () => {
    const entries = branch(user("root"), user("left"));
    const right = entry(user("right"), entries[0].id);
    const all = [...entries, right];
    expect(buildTranscript(all, right.id).map((i) => (i.kind === "user" ? i.text : i.kind))).toEqual(["root", "right"]);
  });
});

describe("todoSnapshot", () => {
  it("takes the latest successful todo result on the branch", () => {
    const entries = branch(user("hi"), todoResult([{ id: 1, subject: "a", status: "pending" }]), todoResult([{ id: 1, subject: "a", status: "completed" }]));
    expect(todoSnapshot(entries, null)).toEqual([{ id: 1, subject: "a", status: "completed" }]);
  });

  it("skips errored results and results without a snapshot", () => {
    const entries = branch(user("hi"), todoResult([{ id: 1, subject: "a", status: "pending" }]), todoResult(undefined), todoResult([{ id: 9, subject: "bad", status: "pending" }], true));
    expect(todoSnapshot(entries, null)).toEqual([{ id: 1, subject: "a", status: "pending" }]);
  });

  it("is empty when no todo tool ran", () => {
    expect(todoSnapshot(branch(user("hi")), null)).toEqual([]);
  });
});
