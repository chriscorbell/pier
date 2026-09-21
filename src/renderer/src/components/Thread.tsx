import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useApp } from "@/store/app";
import { buildTranscript } from "@/lib/transcript";
import { MainHeader } from "@/components/MainHeader";
import { Transcript } from "@/components/Transcript";
import { Composer } from "@/components/Composer";
import { QueueList } from "@/components/QueueList";
import { Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

export function Thread() {
  const key = useApp((s) => s.selectedKey);
  const session = useApp((s) => (s.selectedKey ? s.sessions[s.selectedKey] : undefined));
  const live = useApp((s) => (s.selectedKey ? s.live[s.selectedKey] : undefined));
  const project = useApp((s) => s.projects.find((p) => p.cwd === session?.cwd));
  const restart = useApp((s) => s.restartSession);
  const abortRetry = useApp((s) => s.abortRetry);
  const projects = useApp((s) => s.projects);
  const openFolder = useApp((s) => s.openFolder);
  const openSession = useApp((s) => s.openSession);

  const items = useMemo(() => (session ? buildTranscript(session.entries, session.leafId) : []), [session?.entries, session?.leafId]);

  // Anchor to the bottom while the user is at the bottom. Scrolling up detaches; scrolling back
  // within 48px of the bottom reattaches. The listener is bound through a callback ref because the
  // scroll container only exists once the thread has content, not while the hero layout is showing.
  const scrollEl = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const onScroll = useCallback(() => {
    const el = scrollEl.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);
  const setScrollEl = useCallback(
    (el: HTMLDivElement | null) => {
      scrollEl.current?.removeEventListener("scroll", onScroll);
      scrollEl.current = el;
      if (el) {
        el.addEventListener("scroll", onScroll, { passive: true });
        // Height transitions (tool rows opening) finish after render; keep the anchor through them.
        el.addEventListener("transitionend", () => {
          if (stickToBottom.current) el.scrollTop = el.scrollHeight;
        });
        stickToBottom.current = true;
        el.scrollTop = el.scrollHeight;
      }
    },
    [onScroll],
  );
  useEffect(() => {
    const el = scrollEl.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => {
    stickToBottom.current = true;
    const el = scrollEl.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [key]);
  // Sending a prompt reattaches, the same way switching Sessions does.
  const userCount = items.filter((i) => i.kind === "user").length;
  useEffect(() => {
    stickToBottom.current = true;
    const el = scrollEl.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [userCount]);

  // Hooks run on every render, so the hero handoff is computed before the no-session return.
  const empty = !!session && items.every((i) => i.kind === "note") && !session.partial && !session.loading && live?.status !== "working";
  const { showHero, heroLeaving, heroAnimate } = useHeroHandoff(key ?? "", empty);

  if (!key || !session) {
    return (
      <div className="flex h-full flex-col">
        <MainHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-16 text-center">
          <div className="text-ui-[24px] font-medium tracking-tight">What should we build?</div>
          <div className="max-w-[340px] text-ui-[13.5px] text-fg-muted">Pick a session in the sidebar, start one in a project, or open a folder.</div>
          <div className="mt-2 flex gap-2">
            {projects[0] && (
              <Button variant="primary" onClick={() => void openSession(projects[0].cwd, null)}>
                New session in {projects[0].name}
              </Button>
            )}
            <Button onClick={() => void openFolder()}>Open folder</Button>
          </div>
        </div>
      </div>
    );
  }

  const widgetsAbove = Object.values(session.widgets);

  const composerBlock = (
    <>
      {widgetsAbove.length > 0 && (
        <div className="selectable mb-2 rounded-md border border-border bg-surface px-3 py-2 font-mono text-ui-[12.5px] leading-relaxed whitespace-pre-wrap text-fg-muted">
          {widgetsAbove.map((lines, i) => (
            <div key={i}>{lines.join("\n")}</div>
          ))}
        </div>
      )}
      <QueueList sessionKey={key} queue={session.queue} />
      <Composer sessionKey={key} />
    </>
  );

  return (
    <div key={key} className="anim-crossfade flex h-full min-h-0 flex-col">
      <MainHeader />
      {live?.crashed && (
        <div className="mx-6 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-ui-[13.5px]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={2} />
          <div className="selectable min-w-0 flex-1">
            <div className="font-medium">pi is not running for this session</div>
            <pre className="mt-1 max-h-24 overflow-auto font-mono text-ui-[12px] whitespace-pre-wrap text-fg-muted">{live.crashed}</pre>
          </div>
          <Button size="sm" onClick={() => void restart(key)}>
            <RotateCw className="h-3.5 w-3.5" strokeWidth={2} /> Restart
          </Button>
        </div>
      )}
      {showHero ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center pb-20">
          <div className={cn("w-full max-w-[760px] px-6", heroAnimate && "anim-fade-up")}>
            <h1 className={cn("mb-6 text-center text-ui-[26px] font-medium tracking-tight", heroLeaving && "anim-fade-out")}>
              What should we build in {project?.name ?? "this project"}?
            </h1>
            {composerBlock}
          </div>
        </div>
      ) : (
        <>
          <div ref={setScrollEl} className="anim-crossfade min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[860px] px-6 pt-2 pb-4">
              {session.loading && items.length === 0 ? (
                <div className="flex items-center gap-2 py-10 text-ui-[13.5px] text-fg-muted">
                  <Spinner /> Starting pi
                </div>
              ) : (
                <Transcript sessionKey={key} items={items} partial={session.partial} toolRuns={session.toolRuns} working={live?.status === "working"} />
              )}
              {session.compacting && (
                <div className="flex items-center gap-2 py-3 text-ui-[13px] text-fg-muted">
                  <Spinner /> Compacting context
                </div>
              )}
              {session.retry && (
                <div className="flex items-center gap-2 py-3 text-ui-[13px] text-warn">
                  <Spinner className="text-warn" />
                  <span className="min-w-0 flex-1 truncate">
                    Retrying ({session.retry.attempt}/{session.retry.maxAttempts}): {session.retry.error}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => void abortRetry(key)}>
                    Stop retrying
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="mx-auto w-full max-w-[860px] px-6 pb-5">{composerBlock}</div>
        </>
      )}
    </div>
  );
}

const heroShown = new Set<string>();

/**
 * The hero (headline plus centered composer) hands off to the thread layout when the first reply
 * starts. Instead of swapping instantly, the headline fades out for 180ms and then the transcript
 * fades in. The hero's own entrance plays once per Session, not on every return to the empty state.
 */
function useHeroHandoff(sessionKey: string, empty: boolean) {
  const [showHero, setShowHero] = useState(empty);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heroAnimate = !heroShown.has(sessionKey);
  useEffect(() => {
    if (empty) heroShown.add(sessionKey);
  }, [sessionKey, empty]);
  // Session switch: no transition, just the right layout.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setLeaving(false);
    setShowHero(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);
  useEffect(() => {
    if (empty) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setLeaving(false);
      setShowHero(true);
      return;
    }
    // Not empty: if the hero is up and not already leaving, fade it out, then switch.
    setShowHero((hero) => {
      if (hero && !timer.current) {
        setLeaving(true);
        timer.current = setTimeout(() => {
          timer.current = null;
          setLeaving(false);
          setShowHero(false);
        }, 180);
      }
      return hero;
    });
  }, [empty]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { showHero, heroLeaving: leaving, heroAnimate };
}
