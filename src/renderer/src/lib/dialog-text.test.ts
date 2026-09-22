import { describe, expect, it } from "vitest";
import { numberedLines, parseOption, parseTitle } from "./dialog-text";

describe("parseTitle", () => {
  it("lifts a [Header] prefix into the eyebrow", () => {
    expect(parseTitle("[List type] What should the list be about?")).toMatchObject({ eyebrow: "List type", title: "What should the list be about?", paragraphs: [] });
  });

  it("splits paragraphs after the title and keeps them in order", () => {
    const t = parseTitle("Which areas?\n\n1. Parser — AST.\n2. Emitter — Codegen.\n\nEnter the numbers.");
    expect(t.title).toBe("Which areas?");
    expect(t.paragraphs).toEqual(["1. Parser — AST.\n2. Emitter — Codegen.", "Enter the numbers."]);
  });

  it("peels preview blocks off the title and keys them by option number", () => {
    const t = parseTitle("[Style] Which style?\n\n--- 1. Conventional preview ---\nfeat: x\n\nCloses #1\n\n--- 2. Plain preview ---\nAdd x");
    expect(t.title).toBe("Which style?");
    expect(t.paragraphs).toEqual([]);
    expect(t.previews.get(1)).toBe("feat: x\n\nCloses #1");
    expect(t.previews.get(2)).toBe("Add x");
  });
});

describe("parseOption", () => {
  it("splits number, label, description, and the recommended tag", () => {
    expect(parseOption("1. Weekend chores (Recommended) — A simple list.", 0, 4)).toEqual({
      raw: "1. Weekend chores (Recommended) — A simple list.",
      label: "Weekend chores",
      description: "A simple list.",
      recommended: true,
      custom: false,
    });
  });

  it("marks the trailing free-text escape row as custom", () => {
    expect(parseOption("4. Type something.", 3, 4).custom).toBe(true);
    expect(parseOption("2. Type something.", 1, 4).custom).toBe(false);
  });

  it("leaves unnumbered options intact", () => {
    expect(parseOption("Yes", 0, 2)).toMatchObject({ label: "Yes", description: undefined, recommended: false, custom: false });
  });
});

describe("numberedLines", () => {
  it("recognizes a paragraph made only of numbered lines", () => {
    expect(numberedLines("1. a\n2. b")).toEqual(["1. a", "2. b"]);
    expect(numberedLines("1. a\nnot numbered")).toBeNull();
  });
});
