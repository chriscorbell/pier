/**
 * Extension dialogs are plain strings over RPC. Extensions that fall back to these primitives
 * (ask_user_question, for one) pack structure into them: a `[Header]` prefix, paragraphs after a
 * blank line, numbered options with an em-dash description, a "(Recommended)" tag, and
 * `--- N. Label preview ---` blocks. Pier unpacks what it recognizes and shows the rest as text.
 */
export interface ParsedTitle {
  eyebrow?: string;
  title: string;
  paragraphs: string[];
  /** Option index (1-based) to preview text. */
  previews: Map<number, string>;
}

export function parseTitle(raw: string): ParsedTitle {
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

export interface ParsedOption {
  raw: string;
  label: string;
  description?: string;
  recommended: boolean;
  /** The extension's free-text escape row. */
  custom: boolean;
}

export function parseOption(raw: string, index: number, count: number): ParsedOption {
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
export function numberedLines(paragraph: string): string[] | null {
  const lines = paragraph.split("\n");
  return lines.length > 0 && lines.every((l) => /^\d+\.\s/.test(l)) ? lines : null;
}

