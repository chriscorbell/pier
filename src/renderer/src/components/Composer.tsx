import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Brain, ChevronDown, Cpu, Paperclip, Square, X } from "lucide-react";
import { useApp } from "@/store/app";
import { bridge } from "@/lib/bridge";
import { buildTranscript, promptHistory } from "@/lib/transcript";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui";
import { ContextMeter, WarmIndicator } from "@/components/ContextStrip";
import { ImageThumb } from "@/components/Lightbox";
import { cn, formatTokens, reasoningLabel } from "@/lib/utils";

interface Attachment {
  id: number;
  data: string;
  mimeType: string;
  url: string;
}

interface Popup {
  kind: "command" | "file";
  anchor: number; // index in text where the trigger character sits
  query: string;
}

let attachSeq = 0;

function fuzzy(items: string[], q: string, limit: number): string[] {
  if (!q) return items.slice(0, limit);
  const lower = q.toLowerCase();
  const scored: { s: string; score: number }[] = [];
  for (const s of items) {
    const l = s.toLowerCase();
    const idx = l.indexOf(lower);
    if (idx >= 0) scored.push({ s, score: idx + (l.length - lower.length) / 100 });
    else {
      // subsequence match
      let i = 0;
      for (const ch of l) if (ch === lower[i]) i++;
      if (i === lower.length) scored.push({ s, score: 100 + l.length });
    }
    if (scored.length > 400) break;
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((x) => x.s);
}

export function Composer({ sessionKey }: { sessionKey: string }) {
  const session = useApp((s) => s.sessions[sessionKey]);
  const live = useApp((s) => s.live[sessionKey]);
  const sendPrompt = useApp((s) => s.sendPrompt);
  const abort = useApp((s) => s.abort);
  const setDraft = useApp((s) => s.setDraft);
  const clearEditorText = useApp((s) => s.clearEditorText);
  const pushToast = useApp((s) => s.pushToast);
  const setModel = useApp((s) => s.setModel);
  const setThinking = useApp((s) => s.setThinking);
  const fileInput = useRef<HTMLInputElement>(null);

  const [text, setText] = useState(session?.draft ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [popupIndex, setPopupIndex] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  textRef.current = text;

  const working = live?.status === "working";
  const canSend = (text.trim().length > 0 || attachments.length > 0) && live?.running;

  // Per-session draft survives switching Sessions.
  useEffect(() => {
    setText(session?.draft ?? "");
    setAttachments([]);
    setPopup(null);
    setHistoryIndex(null);
    ref.current?.focus();
  }, [sessionKey]);
  // Persist the draft only when the composer unmounts or the Session changes, never per keystroke.
  useEffect(() => () => setDraft(sessionKey, textRef.current), [sessionKey, setDraft]);

  // An Extension asked to prefill the editor.
  useEffect(() => {
    if (session?.editorText != null) {
      setText(session.editorText);
      clearEditorText(sessionKey);
      ref.current?.focus();
    }
  }, [session?.editorText, sessionKey, clearEditorText]);

  // Auto-grow.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    // +1 absorbs sub-pixel rounding of the line height, which otherwise leaves a scrollbar on an empty field.
    const needed = el.scrollHeight + 1;
    el.style.height = Math.min(320, needed) + "px";
    el.style.overflowY = needed > 320 ? "auto" : "hidden";
  }, [text]);

  const history = useMemo(() => (session ? promptHistory(buildTranscript(session.entries, session.leafId)) : []), [session?.entries, session?.leafId]);

  const commandItems = useMemo(() => {
    if (!popup || popup.kind !== "command" || !session) return [];
    const names = session.commands.map((c) => c.name);
    return fuzzy(names, popup.query, 12).map((n) => session.commands.find((c) => c.name === n)!);
  }, [popup, session?.commands]);
  const fileItems = useMemo(() => (popup?.kind === "file" ? fuzzy(files, popup.query, 12) : []), [popup, files]);
  const popupCount = popup?.kind === "command" ? commandItems.length : fileItems.length;

  useEffect(() => {
    if (popup?.kind === "file" && files.length === 0 && session) void bridge.projects.files(session.cwd).then(setFiles);
  }, [popup?.kind, files.length, session?.cwd]);
  useEffect(() => setPopupIndex(0), [popup?.query, popup?.kind]);
  // Keep the highlighted row inside the popup's scroll box as the arrow keys move it.
  const popupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    popupRef.current?.children[popupIndex]?.scrollIntoView({ block: "nearest" });
  }, [popupIndex, popupCount]);

  const updateText = (next: string, caret: number) => {
    setText(next);
    // Detect a trigger character at the start of the current word.
    const before = next.slice(0, caret);
    const m = /(^|\s)([/@])([^\s]*)$/.exec(before);
    if (m) {
      const anchor = caret - m[3].length - 1;
      if (m[2] === "/" && anchor !== 0) {
        setPopup(null);
        return;
      }
      setPopup({ kind: m[2] === "/" ? "command" : "file", anchor, query: m[3] });
    } else {
      setPopup(null);
    }
  };

  const applyPopup = (index: number) => {
    if (!popup) return;
    const chosen = popup.kind === "command" ? commandItems[index]?.name : fileItems[index];
    if (chosen == null) return;
    const end = popup.anchor + 1 + popup.query.length;
    const insert = popup.kind === "command" ? `/${chosen} ` : `@${chosen} `;
    const next = text.slice(0, popup.anchor) + insert + text.slice(end);
    setText(next);
    setPopup(null);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        const pos = popup.anchor + insert.length;
        el.setSelectionRange(pos, pos);
        el.focus();
      }
    });
  };

  const send = async () => {
    if (!canSend) return;
    const body = text;
    const imgs = attachments.map((a) => ({ data: a.data, mimeType: a.mimeType }));
    setText("");
    textRef.current = "";
    setAttachments([]);
    setPopup(null);
    setHistoryIndex(null);
    setDraft(sessionKey, "");
    await sendPrompt(sessionKey, body, imgs);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popup && popupCount > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPopupIndex((i) => (i + 1) % popupCount);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPopupIndex((i) => (i - 1 + popupCount) % popupCount);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        applyPopup(popupIndex);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPopup(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
      return;
    }
    const el = e.currentTarget;
    if (e.key === "ArrowUp" && !e.metaKey && (text === "" || historyIndex !== null) && history.length && el.selectionStart === 0) {
      e.preventDefault();
      const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setText(history[next]);
      return;
    }
    if (e.key === "ArrowDown" && !e.metaKey && historyIndex !== null) {
      e.preventDefault();
      const next = historyIndex + 1;
      if (next >= history.length) {
        setHistoryIndex(null);
        setText("");
      } else {
        setHistoryIndex(next);
        setText(history[next]);
      }
    }
  };

  const addFiles = async (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 8 * 1024 * 1024) {
        pushToast(`${file.name} is larger than 8 MB`, "warning");
        continue;
      }
      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const data = btoa(bin);
      setAttachments((a) => [...a, { id: ++attachSeq, data, mimeType: file.type, url: URL.createObjectURL(file) }]);
    }
  };

  const supportsImages = session?.state?.model?.input?.includes("image") ?? true;
  const model = session?.state?.model;
  const byProvider = new Map<string, NonNullable<typeof session>["models"]>();
  for (const m of session?.models ?? []) {
    const list = byProvider.get(m.provider) ?? [];
    list.push(m);
    byProvider.set(m.provider, list);
  }

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-surface shadow-[0_1px_2px_oklch(0_0_0/0.2)] transition-[border-color,box-shadow] duration-150 focus-within:border-border-strong focus-within:shadow-[0_0_0_3px_var(--accent-soft),0_1px_2px_oklch(0_0_0/0.2)]",
        "border-border",
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void addFiles(e.dataTransfer.files);
      }}
    >
      {popup && popupCount > 0 && (
        <div ref={popupRef} className="anim-fade-up absolute right-0 bottom-full left-0 z-20 mb-1.5 max-h-[280px] overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-[var(--shadow)]">
          {popup.kind === "command"
            ? commandItems.map((c, i) => (
                <button
                  key={c.name}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyPopup(i)}
                  className={cn("flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-ui-[13.5px]", i === popupIndex ? "bg-hover" : "")}
                >
                  <span className="font-mono">/{c.name}</span>
                  <span className="min-w-0 flex-1 truncate text-fg-muted">{c.description}</span>
                  <span className="text-ui-[11.5px] text-fg-faint">{c.source}</span>
                </button>
              ))
            : fileItems.map((f, i) => (
                <button
                  key={f}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyPopup(i)}
                  className={cn("flex w-full items-center rounded-md px-2 py-1.5 text-left font-mono text-ui-[13px]", i === popupIndex ? "bg-hover" : "")}
                >
                  <span className="truncate">{f}</span>
                </button>
              ))}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((a) => (
            <ImageThumb key={a.id} src={a.url} size={56}>
              <button
                onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remove image"
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </ImageThumb>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        data-composer
        value={text}
        rows={1}
        placeholder={working ? "Queue a follow-up for when this turn ends" : "Ask for changes, send follow-ups, or attach images"}
        onChange={(e) => {
          setHistoryIndex(null);
          updateText(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
          if (imgs.length && supportsImages) {
            e.preventDefault();
            void addFiles(imgs);
          }
        }}
        className="selectable block w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1 text-ui-[14.5px] leading-[1.5] text-fg placeholder:text-fg-faint focus:outline-none"
      />
      <div className="flex items-center justify-between px-1.5 pb-1.5">
        <div className="flex items-center gap-0.5">
          <Menu>
            <MenuTrigger asChild>
              <button className="no-drag flex h-7 items-center gap-1.5 rounded-md px-2 text-ui-[13px] text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:bg-hover focus-visible:text-fg">
                <Cpu className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="max-w-[220px] truncate">{model ? model.name || model.id : "No model"}</span>
                <ChevronDown className="h-3 w-3 text-fg-faint" strokeWidth={2} />
              </button>
            </MenuTrigger>
            <MenuContent align="start" className="max-h-[360px] overflow-y-auto">
              {[...byProvider.entries()].map(([provider, models]) => (
                <div key={provider}>
                  <MenuLabel>{provider}</MenuLabel>
                  {models.map((m) => (
                    <MenuItem key={m.id} onSelect={() => void setModel(sessionKey, m.provider, m.id)} className={cn(model?.id === m.id && model.provider === m.provider && "text-accent")}>
                      <span className="min-w-0 flex-1 truncate">{m.name || m.id}</span>
                      <span className="text-ui-[11.5px] text-fg-faint">{formatTokens(m.contextWindow)}</span>
                    </MenuItem>
                  ))}
                </div>
              ))}
              {(session?.models.length ?? 0) === 0 && <MenuItem disabled>No models configured</MenuItem>}
            </MenuContent>
          </Menu>
          <Menu>
            <MenuTrigger asChild>
              <button className="no-drag flex h-7 items-center gap-1.5 rounded-md px-2 text-ui-[13px] text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:bg-hover focus-visible:text-fg">
                <Brain className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{reasoningLabel(session?.state?.thinkingLevel)}</span>
                <ChevronDown className="h-3 w-3 text-fg-faint" strokeWidth={2} />
              </button>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuLabel>Reasoning</MenuLabel>
              {(session?.thinkingLevels ?? []).map((l) => (
                <MenuItem key={l} onSelect={() => void setThinking(sessionKey, l)} className={cn(session?.state?.thinkingLevel === l && "text-accent")}>
                  {reasoningLabel(l)}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          {session?.stats?.contextUsage && (
            <div className="ml-1.5 flex h-7 items-center text-ui-[12px] text-fg-muted">
              <ContextMeter percent={session.stats.contextUsage.percent} tokens={session.stats.contextUsage.tokens} window={session.stats.contextUsage.contextWindow} />
            </div>
          )}
          {session?.statuses.warm && (
            <div className="ml-2 flex h-7 items-center text-ui-[12px] text-fg-muted">
              <WarmIndicator text={session.statuses.warm} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {working && (
            <button
              onClick={() => void abort(sessionKey)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ui-[13px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <Square className="h-3 w-3 fill-current" strokeWidth={2} /> Stop
            </button>
          )}
          {supportsImages && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInput.current?.click()}
                aria-label="Attach image"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg"
              >
                <Paperclip className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </>
          )}
          <button
            onClick={() => void send()}
            disabled={!canSend}
            aria-label="Send"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-fg transition-[opacity,transform] duration-100 hover:brightness-110 active:scale-95 disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
