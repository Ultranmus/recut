"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { addLearnings, addRules, getLearnings, getRules, useBrandRules, useLearnings } from "@/lib/brand-memory";
import { addDays, isoDate, parseIso, schedule, startOfWeek, useCalendar } from "@/lib/calendar";
import { enforceRules, type BrandRule } from "@/lib/brand-rules";
import { paginate, wordsInRange } from "@/lib/captions";
import { duration } from "@/lib/format";
import { DEMO_ID, getProject, saveProject } from "@/lib/projects";
import { briefAI, learnAI, rerankAI, rewriteAI } from "@/lib/studio-client";
import type { ParsedBrief, RewriteMode, RewriteResult } from "@/lib/studio-ai";
import { PLATFORMS, type Clip, type PlatformId, type Project, type Segment } from "@/lib/types";
import { IconChevronLeft, IconFilm, IconScissors, IconWave } from "../icons";
import { TopBar } from "../top-bar";
import { ClipPreview, type PlayerHandle } from "./clip-preview";
import { BrandMemoryPanel } from "./brand-memory-panel";
import { CalendarView, outcomeBadge } from "./calendar-view";
import { CaptionPanel, ClipDetails, ClipList, EpisodeTimeline, TranscriptPanel, type ClipBadges, type PendingChange } from "./panels";
import { ScheduleDialog } from "./schedule-dialog";
import { sendBrief, TalkToStudio, type BriefState } from "./talk-box";

const ALL_PLATFORMS = PLATFORMS.map((p) => p.id);
type Tab = "captions" | "brand" | "transcript";

// Versioned so edits saved against an older caption schema are ignored.
const DEMO_EDITS = "recut:demo-clips:v2";

function loadDemoEdits(): Clip[] | null {
  try {
    const raw = localStorage.getItem(DEMO_EDITS);
    return raw ? (JSON.parse(raw) as Clip[]) : null;
  } catch {
    return null;
  }
}

export function Studio({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("captions");
  const [time, setTime] = useState(0);
  const player = useRef<PlayerHandle | null>(null);

  const rules = useBrandRules();
  const [brief, setBrief] = useState<ParsedBrief | null>(null);
  const [briefState, setBriefState] = useState<BriefState>("idle");
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefClipId, setBriefClipId] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  /** Suggested caption changes awaiting review, keyed by clip id then platform. */
  const [pending, setPending] = useState<Record<string, Partial<Record<PlatformId, PendingChange>>>>({});
  const [learning, setLearning] = useState<PlatformId | null>(null);
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<"studio" | "calendar">("studio");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [highlight, setHighlight] = useState<string[]>([]);
  const [summary, setSummary] = useState<string[]>([]);
  const [reranking, setReranking] = useState(false);
  const learnings = useLearnings();
  const calendar = useCalendar();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    let url: string | null = null;
    getProject(id).then((p) => {
      setProject(p);
      if (!p) return;
      const initial = (p.id === DEMO_ID && loadDemoEdits()) || p.analysis.clips;
      setClips(initial);
      setSelectedId(initial[0]?.id ?? "");
      url = p.file ? URL.createObjectURL(p.file) : (p.mediaUrl ?? null);
      setMediaUrl(url);
    });
    return () => {
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [id]);

  // Persist edits: demo edits stay in this browser, uploads update their IndexedDB record.
  useEffect(() => {
    if (!project || !clips.length) return;
    const t = setTimeout(() => {
      if (project.id === DEMO_ID) {
        try {
          localStorage.setItem(DEMO_EDITS, JSON.stringify(clips));
        } catch {}
      } else {
        void saveProject({ ...project, analysis: { ...project.analysis, clips } });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [clips, project]);

  const clip = clips.find((c) => c.id === selectedId) ?? clips[0];
  const clipWords = useMemo(
    () => (project && clip ? wordsInRange(project.transcript.words, clip.start, clip.end) : []),
    [project, clip]
  );
  const pages = useMemo(() => paginate(clipWords), [clipWords]);

  /** This week, unless nothing is left on it and a later post exists: then that post's week. */
  function weekWithNextPost() {
    const thisWeek = startOfWeek(new Date());
    const today = isoDate(new Date());
    const upcoming = calendar.map((e) => e.date).filter((d) => d >= today).sort();
    const endOfWeek = isoDate(addDays(thisWeek, 6));
    if (!upcoming.length || upcoming[0] <= endOfWeek) return thisWeek;
    return startOfWeek(parseIso(upcoming[0]));
  }

  const badges: ClipBadges = {};
  if (project) {
    for (const l of learnings) if (l.projectId === project.id) (badges[l.clipId] ??= {}).learning = outcomeBadge(l);
    for (const e of calendar) {
      if (e.projectId !== project.id) continue;
      const day = parseIso(e.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      (badges[e.clipId] ??= {}).scheduled ??= `📅 ${day}`;
    }
  }

  const scheduledLabel = (clipId: string) => badges[clipId]?.scheduled?.replace("📅 ", "");

  /** Brings the first suggested rewrite into view and pulses it, so "Review captions" visibly lands. */
  function revealSuggestion() {
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>("[data-suggestion]");
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.animate(
        [{ boxShadow: "0 0 0 0 rgba(10,132,255,0.8)" }, { boxShadow: "0 0 0 6px rgba(10,132,255,0)" }],
        { duration: 700, iterations: 2, easing: "ease-out" }
      );
    }, 120);
  }

  function updateClip(next: Clip) {
    setClips((cs) => cs.map((c) => (c.id === next.id ? next : c)));
  }

  function clipText(c: Clip) {
    return project ? wordsInRange(project.transcript.words, c.start, c.end).map((w) => w.word).join(" ") : "";
  }

  /** Queues every caption the model actually changed as a before/after for review. */
  function queueChanges(c: Clip, result: RewriteResult, source: PendingChange["source"]) {
    let count = 0;
    const next: Partial<Record<PlatformId, PendingChange>> = {};
    for (const [platform, r] of Object.entries(result) as [PlatformId, { text: string; reason: string }][]) {
      const before = c.captions[platform] ?? "";
      if (!r || r.text.trim() === before.trim()) continue;
      next[platform] = { before, after: r.text, reason: r.reason, source };
      count++;
    }
    setPending((p) => ({ ...p, [c.id]: { ...p[c.id], ...next } }));
    return count;
  }

  async function rewrite(c: Clip, mode: RewriteMode, platforms: PlatformId[], extra: { tone?: string; topic?: string; instructions?: string } = {}) {
    const result = await rewriteAI({
      mode,
      clipText: clipText(c),
      captions: Object.fromEntries(platforms.map((p) => [p, c.captions[p] ?? ""])),
      platforms,
      rules: getRules(),
      ...extra,
    });
    return queueChanges(c, result, mode === "brief" ? "brief" : "rule");
  }

  /** Re-scores this episode's clips against all performance learnings and re-sorts them. */
  async function applyLearnings() {
    const all = getLearnings();
    if (!all.length || !clips.length) return 0;
    setReranking(true);
    try {
      const result = await rerankAI(
        clips.map((c) => ({ id: c.id, title: c.title, hook: c.hook, start: c.start, end: c.end, why: c.why, score: c.baseScore ?? c.score })),
        all
      );
      let moved = 0;
      setClips((cs) =>
        cs
          .map((c) => {
            const r = result[c.id];
            if (!r) return c;
            const base = c.baseScore ?? c.score;
            if (r.score !== base) moved++;
            return { ...c, baseScore: base, score: r.score, rankNote: r.reason || undefined };
          })
          .sort((x, y) => y.score - x.score)
      );
      return Object.values(result).filter((r) => r.reason).length || moved;
    } finally {
      setReranking(false);
    }
  }

  async function runBrief(raw: string) {
    if (!clip || !project) return;
    setBriefError(null);
    setSummary([]);
    setBriefClipId(null);
    setBriefState("parsing");
    try {
      const b = await briefAI(
        raw,
        clips.map(({ id, title, hook, start, end }) => ({ id, title, hook, start, end })),
        getRules()
      );
      setBrief(b);
      setBriefState("writing");
      const done: string[] = [];
      const added = addRules(b.rules.map((text) => ({ text, source: "voice" as const, scope: "all" as const })));
      if (added.length) done.push(`${added.length} rule${added.length === 1 ? "" : "s"} saved`);
      const byId = new Map(clips.map((c) => [c.id, c]));

      // Calendar: put each scheduled clip on its day and jump to that week.
      const entries = schedule(
        b.schedule
          .filter((s) => byId.has(s.clipId))
          .map((s) => {
            const c = byId.get(s.clipId)!;
            return {
              projectId: project.id,
              projectName: project.name,
              clipId: c.id,
              clipTitle: c.title,
              hook: c.hook,
              platforms: s.platforms,
              date: s.date,
              time: s.time,
              source: "voice" as const,
            };
          })
      );
      if (entries.length) {
        setHighlight(entries.map((e) => e.id));
        setTimeout(() => setHighlight([]), 6000);
        setWeekStart(startOfWeek(parseIso(entries[0].date)));
        setView("calendar");
        done.push(`${entries.length} post${entries.length === 1 ? "" : "s"} added to the calendar`);
      }

      // Performance feedback becomes learnings, which immediately re-rank this episode.
      const saved = addLearnings(
        b.feedback
          .map((f) => ({ ...f, clipId: f.clipId || (b.feedback.length === 1 ? b.clipIds[0] ?? "" : "") }))
          .filter((f) => byId.has(f.clipId))
          .map((f) => {
            const c = byId.get(f.clipId)!;
            return {
              projectId: project.id,
              clipId: c.id,
              clipTitle: c.title,
              hook: c.hook,
              why: c.why,
              platform: f.platform,
              views: f.views,
              outcome: f.outcome,
              metric: f.metric,
              lesson: f.lesson,
            };
          })
      );
      if (saved.length) {
        done.push(`${saved.length} learning${saved.length === 1 ? "" : "s"} saved`);
        const moved = await applyLearnings();
        if (moved) done.push(`${moved} clip${moved === 1 ? "" : "s"} re-ranked`);
      }

      // Captions: write them when asked; otherwise show how any new rules change this clip.
      const target = clips.find((c) => c.id === b.clipIds[0]) ?? clip;
      const onlyLogistics = (entries.length || saved.length || b.schedule.length || b.feedback.length) && !b.wantsCaptions;
      if (b.wantsCaptions || (!onlyLogistics && (b.tone || b.platforms.length || b.topic))) {
        setBriefClipId(target.id);
        setSelectedId(target.id);
        setTab("captions");
        const briefed = b.platforms.length ? b.platforms : ALL_PLATFORMS;
        let n = await rewrite(target, "brief", briefed, { tone: b.tone, topic: b.topic, instructions: b.cleaned });
        // New rules apply everywhere: show how they change this clip's other platforms too.
        const others = ALL_PLATFORMS.filter((p) => !briefed.includes(p));
        if (added.length && others.length) n += await rewrite(target, "rules", others);
        done.push(n ? `${n} caption${n === 1 ? "" : "s"} ready to review` : "captions already match");
        if (!entries.length) setView("studio");
      } else if (added.length) {
        const n = await rewrite(target, "rules", ALL_PLATFORMS);
        if (n) {
          setSelectedId(target.id);
          setTab("captions");
          done.push(`${n} caption${n === 1 ? "" : "s"} to review`);
        }
      }
      if (!done.length) done.push("Nothing to change");
      setSummary(done);
      setBriefState("done");
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : "Couldn't understand that brief.");
      setBriefState("error");
    }
  }

  /** After the rule set changes, show how it would change this clip's captions. */
  async function recheck(c: Clip, skip?: PlatformId) {
    setChecking(true);
    try {
      const n = await rewrite(c, "rules", ALL_PLATFORMS.filter((p) => p !== skip));
      setTab("captions");
      setToast(n ? `${n} caption${n === 1 ? "" : "s"} would change. Review the before and after.` : "All captions already follow your rules.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Couldn't check captions.");
    } finally {
      setChecking(false);
    }
  }

  function onRulesAdded(added: BrandRule[]) {
    setToast(`Saved to Brand Memory: ${added.map((r) => r.text).join(" ")}`);
    if (clip) void recheck(clip);
  }

  async function learnFromEdit(platform: PlatformId, before: string, after: string) {
    if (!clip || before.trim() === after.trim()) return;
    // Drop a suggestion the creator just overrode by hand.
    setPending((p) => {
      const forClip = { ...p[clip.id] };
      delete forClip[platform];
      return { ...p, [clip.id]: forClip };
    });
    setLearning(platform);
    try {
      const rule = await learnAI(platform, before, after, getRules());
      if (!rule) return;
      const added = addRules([{ text: rule.text, scope: rule.scope, source: "edit", example: { platform, before, after } }]);
      if (!added.length) return;
      setToast(`Learned from your edit: “${rule.text}”`);
      await recheck(clip, platform);
    } catch {
      // Learning is best-effort; the edit itself is already saved.
    } finally {
      setLearning(null);
    }
  }

  function resolvePending(platform: PlatformId, accept: boolean) {
    if (!clip) return;
    const change = pending[clip.id]?.[platform];
    if (accept && change) updateClip({ ...clip, captions: { ...clip.captions, [platform]: change.after } });
    setPending((p) => {
      const forClip = { ...p[clip.id] };
      delete forClip[platform];
      return { ...p, [clip.id]: forClip };
    });
  }

  function acceptAll() {
    if (!clip) return;
    const forClip = pending[clip.id] ?? {};
    const captions = { ...clip.captions };
    for (const [p, ch] of Object.entries(forClip) as [PlatformId, PendingChange][]) captions[p] = ch.after;
    updateClip({ ...clip, captions });
    setPending((p) => ({ ...p, [clip.id]: {} }));
  }

  function jumpToSegment(s: Segment) {
    if (!project) return;
    const existing = clips.find((c) => s.start >= c.start && s.start < c.end);
    if (existing) {
      setSelectedId(existing.id);
      setTimeout(() => player.current?.seek(s.start), 0);
      return;
    }
    // Start a custom clip at this line, ending on the line boundary nearest 30 seconds later.
    const segs = project.transcript.segments;
    const end = segs.find((x) => x.end >= s.start + 30)?.end ?? segs[segs.length - 1].end;
    const text = wordsInRange(project.transcript.words, s.start, end)
      .map((w) => w.word)
      .join(" ");
    const quote = (text.match(/^[^.!?]+[.!?]/)?.[0] ?? text).slice(0, 200);
    const n = clips.filter((c) => c.id.startsWith("custom")).length + 1;
    const custom: Clip = {
      id: `custom-${Date.now()}`,
      title: `Custom clip ${n}`,
      start: s.start,
      end,
      hook: quote.split(/\s+/).slice(0, 8).join(" "),
      why: "",
      score: 0,
      captions: {
        reels: `${quote}\n\nSave this and follow for more.\n\n#podcast #reels`,
        linkedin: `"${quote}"\n\nA moment from this episode worth sharing. What's your take?`,
        x: `"${quote.slice(0, 250)}"`,
        shorts: `${quote.slice(0, 80)} #Shorts`,
      },
      hashtags: [],
    };
    for (const p of ALL_PLATFORMS) custom.captions[p] = enforceRules(custom.captions[p], getRules(), p);
    setClips((cs) => [...cs, custom]);
    setSelectedId(custom.id);
    setTab("captions");
  }

  if (project === undefined) return <StudioSkeleton />;
  if (project === null) {
    return (
      <>
        <TopBar />
        <div className="grid flex-1 place-items-center p-6">
          <div className="glass max-w-sm rounded-2xl p-8 text-center">
            <h1 className="text-lg font-semibold">Project not found</h1>
            <p className="mt-2 text-sm text-fg-2">Uploads are saved in this browser only. It may have been cleared.</p>
            <Link href="/" className="btn btn-primary mt-6">
              Back home
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-1 flex-col xl:h-dvh xl:min-h-0 xl:flex-none xl:overflow-hidden">
      <TopBar>
        <div className="flex min-w-0 items-center gap-1.5 border-l border-hairline pl-2 text-sm sm:gap-2 sm:pl-4">
          <Link href="/" className="btn btn-ghost h-7 gap-1 px-1.5 text-xs sm:px-2" aria-label="Back to home">
            <IconChevronLeft size={14} /> <span className="hidden sm:inline">Home</span>
          </Link>
          <span className="hidden truncate font-medium text-fg-2 sm:inline">{project.name}</span>
          <div className="segmented shrink-0 sm:ml-2" role="tablist" aria-label="View">
            {(
              [
                ["studio", "Studio"],
                ["calendar", "Calendar"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                data-active={view === v}
                onClick={() => {
                  if (v === "calendar" && view !== "calendar") setWeekStart(weekWithNextPost());
                  setView(v);
                }}
              >
                {label}
                {v === "calendar" && calendar.length ? <span className="ml-1.5 text-fg-3">{calendar.length}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </TopBar>

      {project.notice ? (
        <div className="border-b border-warning/20 bg-warning/10 px-5 py-2 text-center text-xs text-warning">{project.notice}</div>
      ) : null}

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-3 pb-20 sm:p-4 sm:pb-20 xl:min-h-0 xl:overflow-hidden xl:pb-4">
      {view === "calendar" ? (
        <CalendarView
          project={project}
          clips={clips}
          entries={calendar}
          learnings={learnings}
          highlight={highlight}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
          busy={briefState === "parsing" || briefState === "writing"}
          onOpenClip={(id) => {
            setSelectedId(id);
            setView("studio");
          }}
          onFeedback={(_, sentence) => sendBrief(sentence)}
        />
      ) : (
      <main className="grid flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:min-h-0 xl:grid-cols-[300px_minmax(0,1fr)_380px] xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden">
        {/* Left: episode + clips */}
        <aside className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl">
          <div className="border-b border-hairline p-4">
            <div className="flex gap-3">
              <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-accent via-accent-2 to-accent-3 ring-1 ring-white/10">
                {project.cover ? (
                  <Image src={project.cover} alt="" fill sizes="56px" className="object-cover" />
                ) : project.kind === "video" ? (
                  <IconFilm size={22} />
                ) : (
                  <IconWave size={22} />
                )}
              </div>
              <div className="min-w-0">
                {project.source ? <p className="truncate text-[11px] font-medium text-accent">{project.source.show}</p> : null}
                <h1 className="truncate text-sm font-semibold">{project.name}</h1>
                <p className="mt-0.5 text-[11px] text-fg-3">
                  {duration(project.transcript.duration)} · {project.transcript.words.length.toLocaleString()} words
                </p>
              </div>
            </div>
            {project.analysis.summary ? (
              <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-fg-2">{project.analysis.summary}</p>
            ) : null}
            {project.source ? (
              <a href={project.source.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] text-fg-3 hover:text-accent">
                {project.source.credit} ↗
              </a>
            ) : null}
          </div>
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <h2 className="label">Clips</h2>
            <span className="text-[11px] text-fg-3">{clips.length} moments · ranked</span>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-16 max-lg:max-h-96 lg:max-xl:max-h-[46rem]">
            <ClipList clips={clips} selectedId={clip?.id ?? ""} onSelect={setSelectedId} badges={badges} />
            <p className="mt-3 flex items-center gap-1.5 px-2 text-[11px] text-fg-3">
              <IconScissors size={12} /> Make your own from any line in Transcript.
            </p>
          </div>
        </aside>

        {/* Center: preview */}
        <section className="glass flex min-h-0 flex-col rounded-2xl px-3 py-5 scroll-thin sm:px-4 sm:py-6 xl:overflow-y-auto xl:overscroll-contain">
          {clip && mediaUrl ? (
            <div className="flex flex-col gap-5">
              <ClipDetails
                clip={clip}
                rank={clip.score ? clips.indexOf(clip) + 1 : 0}
                scheduled={scheduledLabel(clip.id)}
                onChange={updateClip}
                onSchedule={() => setScheduling(clip.id)}
              />
              <ClipPreview
                project={project}
                mediaUrl={mediaUrl}
                clip={clip}
                pages={pages}
                words={project.transcript.words}
                onTrim={(start, end) => updateClip({ ...clip, start, end })}
                onTime={setTime}
                playerRef={player}
              />
              <EpisodeTimeline
                total={project.transcript.duration}
                clips={clips}
                selectedId={clip.id}
                time={time}
                onSelect={setSelectedId}
              />
            </div>
          ) : (
            <p className="m-auto text-sm text-fg-3">No clips in this project.</p>
          )}
        </section>

        {/* Right: inspector */}
        <aside className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl lg:col-span-2 xl:col-span-1">
          <div className="border-b border-hairline px-3 py-3">
            <div className="segmented w-full gap-1 p-1" role="tablist" aria-label="Inspector">
              {(
                [
                  ["captions", "Captions"],
                  ["brand", "Brand memory"],
                  ["transcript", "Transcript"],
                ] as const
              ).map(([t, label]) => (
                <button
                  key={t}
                  data-active={tab === t}
                  onClick={() => setTab(t)}
                  className="flex h-8 flex-1 items-center justify-center gap-2 whitespace-nowrap px-3 text-[13px]"
                  role="tab"
                  aria-selected={tab === t}
                >
                  {label}
                  {t === "brand" && rules.length + learnings.length ? (
                    <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-3/85 px-1.5 text-[10px] font-semibold tabular-nums text-white">
                      {rules.length + learnings.length}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
          <div data-scroll className="scroll-thin min-h-0 flex-1 p-4 xl:overflow-y-auto xl:overscroll-contain">
            {clip ? (
              tab === "captions" ? (
                <CaptionPanel
                  key={clip.id}
                  clip={clip}
                  onChange={updateClip}
                  pending={pending[clip.id] ?? {}}
                  learning={learning}
                  onAccept={(p) => resolvePending(p, true)}
                  onReject={(p) => resolvePending(p, false)}
                  onAcceptAll={acceptAll}
                  onCommitEdit={learnFromEdit}
                />
              ) : tab === "brand" ? (
                <BrandMemoryPanel
                  rules={rules}
                  learnings={learnings}
                  checking={checking}
                  reranking={reranking}
                  onRulesAdded={onRulesAdded}
                  onRecheck={() => recheck(clip)}
                  onRerank={async () => {
                    const n = await applyLearnings().catch(() => 0);
                    setToast(n ? `Re-ranked ${n} clip${n === 1 ? "" : "s"} using your results.` : "No clip resembles your past results closely enough to move.");
                  }}
                />
              ) : (
                <TranscriptPanel
                  clip={clip}
                  words={project.transcript.words}
                  segments={project.transcript.segments}
                  time={time}
                  onSeek={(t) => player.current?.seek(t)}
                  onSelectSegment={jumpToSegment}
                />
              )
            ) : null}
          </div>
        </aside>
      </main>
      )}
      </div>

      <TalkToStudio
        state={briefState}
        error={briefError}
        brief={brief}
        clips={clips}
        targetClip={clips.find((c) => c.id === briefClipId) ?? null}
        summary={summary}
        onSubmit={runBrief}
        onNavigate={(target, id) => {
          if (id) setSelectedId(id);
          // The brief already moved the calendar to the week it scheduled into.
          if (target === "calendar") setView("calendar");
          else {
            setView("studio");
            setTab(target);
            if (target === "captions") revealSuggestion();
          }
        }}
        onClear={() => {
          setBrief(null);
          setSummary([]);
          setBriefError(null);
          setBriefState("idle");
        }}
      />

      {scheduling && project ? (
        <ScheduleDialog
          clips={clips}
          clipId={scheduling}
          onClose={() => setScheduling(null)}
          onSchedule={({ clip: c, date, time, platforms }) => {
            const [entry] = schedule([
              { projectId: project.id, projectName: project.name, clipId: c.id, clipTitle: c.title, hook: c.hook, platforms, date, time, source: "manual" },
            ]);
            setScheduling(null);
            setHighlight([entry.id]);
            setTimeout(() => setHighlight([]), 6000);
            setWeekStart(startOfWeek(parseIso(date)));
            setToast(`Scheduled “${c.title}” for ${parseIso(date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}. See it in Calendar.`);
          }}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          className="window rise fixed bottom-6 left-1/2 z-50 max-w-[min(92vw,34rem)] -translate-x-1/2 rounded-full px-4 py-2.5 text-center text-xs font-medium"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

export function StudioSkeleton() {
  return (
    <>
      <div className="h-13 border-b border-hairline" />
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 p-4 xl:h-[calc(100vh-52px)] xl:grid-cols-[300px_minmax(0,1fr)_380px]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass animate-pulse rounded-2xl opacity-60 max-xl:h-64" />
        ))}
      </div>
    </>
  );
}
