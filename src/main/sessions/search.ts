import { readFileSync, statSync } from "node:fs";

/**
 * Full-text search over session conversations. The searchable text of each file (user and
 * assistant text, bash commands, the session name) is extracted once and cached by mtime and
 * size, so only files that changed since the last search are read again.
 */
interface Indexed {
  mtimeMs: number;
  size: number;
  text: string;
}

const cache = new Map<string, Indexed>();
const MAX_TEXT = 4 * 1024 * 1024;

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const block of content) {
    if (block && block.type === "text" && typeof block.text === "string") out += block.text + "\n";
  }
  return out;
}

function extract(path: string): string {
  const parts: string[] = [];
  let total = 0;
  const push = (t: string) => {
    if (!t || total >= MAX_TEXT) return;
    parts.push(t);
    total += t.length;
  };
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || total >= MAX_TEXT) continue;
    // Cheap prefilter: only message and session_info entries carry conversation text.
    if (!line.includes('"type":"message"') && !line.includes('"session_info"')) continue;
    let entry: { type?: string; name?: string; message?: { role?: string; content?: unknown; command?: string } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type === "session_info" && typeof entry.name === "string") push(entry.name);
    const msg = entry.message;
    if (!msg) continue;
    if (msg.role === "user" || msg.role === "assistant") push(textOf(msg.content));
    else if (msg.role === "bashExecution" && typeof msg.command === "string") push(msg.command);
  }
  return parts.join("\n").toLowerCase();
}

function indexed(path: string): string | null {
  let st;
  try {
    st = statSync(path);
  } catch {
    cache.delete(path);
    return null;
  }
  const hit = cache.get(path);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.text;
  try {
    const text = extract(path);
    cache.set(path, { mtimeMs: st.mtimeMs, size: st.size, text });
    return text;
  } catch {
    return null;
  }
}

/** The given session files whose conversation contains `query`, case-insensitively. */
export function searchSessions(paths: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: string[] = [];
  for (const path of paths) {
    const text = indexed(path);
    if (text && text.includes(q)) hits.push(path);
  }
  const keep = new Set(paths);
  for (const path of cache.keys()) if (!keep.has(path)) cache.delete(path);
  return hits;
}
