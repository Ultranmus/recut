"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CaptionPage } from "@/lib/captions";
import { toSrt } from "@/lib/captions";
import { download, duration, slugify, timecode } from "@/lib/format";
import {
  CAPTION_STYLES,
  DEFAULT_CAPTION_OPTIONS,
  H,
  W,
  drawFrame,
  makeBackground,
  pickMimeType,
  resolveFontFamily,
  updateLevels,
  type CaptionOptions,
  type CaptionStyle,
} from "@/lib/renderer";
import type { Clip, Project, Word } from "@/lib/types";
import { IconDownload, IconFilm, IconPause, IconPlay, IconText, IconWave } from "../icons";

type Graph = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  dest: MediaStreamAudioDestinationNode;
  freq: Uint8Array<ArrayBuffer>;
};

export type PlayerHandle = {
  seek: (t: number) => void;
  play: () => void;
  /** For the studio chat: switch preview, restyle 9:16 captions, start an export. */
  setView: (v: "original" | "social") => void;
  setLook: (look: { style?: CaptionStyle; options?: Partial<CaptionOptions> }) => void;
  exportVideo: () => void;
};

const ACCENTS = ["#0a84ff", "#bf5af2", "#30d158", "#ff375f", "#ff9f0a"];

type View = "original" | "social";

export function ClipPreview({
  project,
  mediaUrl,
  clip,
  pages,
  words,
  onTrim,
  onTime,
  playerRef,
}: {
  project: Project;
  mediaUrl: string;
  clip: Clip;
  pages: CaptionPage[];
  words: Word[];
  onTrim: (start: number, end: number) => void;
  onTime: (t: number) => void;
  playerRef: React.RefObject<PlayerHandle | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const graph = useRef<Graph | null>(null);
  const background = useRef<HTMLCanvasElement | null>(null);
  const cover = useRef<HTMLImageElement | null>(null);
  const levels = useRef(new Float32Array(29));
  const exportingRef = useRef(false);
  const cancelRef = useRef(false);

  const [view, setView] = useState<View>("original");
  const [style, setStyle] = useState<CaptionStyle>("pop");
  const [capOpts, setCapOpts] = useState<CaptionOptions>(DEFAULT_CAPTION_OPTIONS);
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [showHook, setShowHook] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(clip.start);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isVideo = project.kind === "video";
  const subtitle = project.source?.show ?? (isVideo ? "" : "Podcast");

  // A speech-shaped waveform for the clip, from word timings, so it reads before anything plays.
  const bars = useMemo(() => speechBars(words, clip.start, clip.end), [words, clip.start, clip.end]);

  // Latest values for the render loop, which runs outside React's render cycle.
  const live = useRef({ clip, pages, style, capOpts, accent, showHook, onTime, view, bars });
  useEffect(() => {
    live.current = { clip, pages, style, capOpts, accent, showHook, onTime, view, bars };
  });

  useEffect(() => {
    resolveFontFamily();
    background.current = makeBackground(null, accent);
    if (!project.cover) return;
    const img = new Image();
    img.src = project.cover;
    img.onload = () => {
      cover.current = img;
      background.current = makeBackground(img, accent);
    };
  }, [project.cover, accent]);

  useEffect(() => {
    const ctx = canvasRef.current!.getContext("2d")!;
    let raf = 0;
    let lastReported = -1;
    const loop = (ts: number) => {
      const m = mediaRef.current;
      const L = live.current;
      const t = m?.currentTime ?? L.clip.start;
      if (m && !m.paused && !exportingRef.current && t >= L.clip.end) {
        m.pause();
        m.currentTime = L.clip.start;
      }
      const g = graph.current;
      if (g) g.analyser.getByteFrequencyData(g.freq);
      updateLevels(levels.current, g?.freq ?? null, Boolean(m && !m.paused), ts / 1000);
      if (L.view === "original") {
        if (!isVideo) drawScrubWave(waveRef.current, L.bars, (t - L.clip.start) / (L.clip.end - L.clip.start), levels.current, Boolean(m && !m.paused), L.accent);
      } else if (background.current) {
        drawFrame(ctx, {
          time: t,
          start: L.clip.start,
          end: L.clip.end,
          hook: L.showHook ? L.clip.hook : "",
          pages: L.pages,
          style: L.style,
          options: L.capOpts,
          accent: L.accent,
          background: background.current,
          cover: cover.current,
          video: isVideo ? m : null,
          levels: levels.current,
          title: project.name,
          subtitle,
        });
      }
      if (Math.abs(t - lastReported) > 0.04) {
        lastReported = t;
        setTime(t);
        L.onTime(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isVideo, project.name, subtitle]);

  // Jump to the start of a newly selected clip.
  useEffect(() => {
    const m = mediaRef.current;
    if (!m || exportingRef.current) return;
    m.pause();
    m.currentTime = clip.start;
  }, [clip.id, clip.start]);

  // Suspend rather than close: Next keeps this page alive when you navigate away, and the media element
  // stays wired to this AudioContext for good, so a closed context would leave playback silent on return.
  // play() resumes it.
  useEffect(
    () => () => {
      const ctx = graph.current?.ctx;
      if (ctx && ctx.state === "running") void ctx.suspend().catch(() => {});
    },
    []
  );

  function ensureGraph() {
    const m = mediaRef.current;
    if (!m) return null;
    if (!graph.current) {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(m);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      const dest = ctx.createMediaStreamDestination();
      src.connect(analyser);
      analyser.connect(ctx.destination);
      src.connect(dest);
      graph.current = { ctx, analyser, dest, freq: new Uint8Array(analyser.frequencyBinCount) };
    }
    if (graph.current.ctx.state === "suspended") void graph.current.ctx.resume();
    return graph.current;
  }

  function play() {
    const m = mediaRef.current;
    if (!m) return;
    ensureGraph();
    if (m.currentTime < clip.start - 0.1 || m.currentTime >= clip.end - 0.1) m.currentTime = clip.start;
    m.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Playback was blocked by the browser. Tap play again.");
    });
  }

  function toggle() {
    const m = mediaRef.current;
    if (!m || exportProgress !== null) return;
    if (m.paused) play();
    else m.pause();
  }

  function seek(t: number) {
    const m = mediaRef.current;
    if (!m || exportProgress !== null) return;
    m.currentTime = Math.min(clip.end - 0.05, Math.max(clip.start, t));
  }

  // Refreshed after every render on purpose; the setters inside only run later, when the chat asks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    playerRef.current = {
      seek,
      play,
      setView,
      setLook: ({ style: st, options }) => {
        if (st) setStyle(st);
        if (options) setCapOpts((o) => ({ ...o, ...options }));
      },
      exportVideo: () => {
        setView("social");
        // Let the 9:16 canvas mount before recording starts.
        setTimeout(() => void exportVideo(), 150);
      },
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.code !== "Space" || el.closest("input, textarea, button, [contenteditable]")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Latest trim, updated as soon as a nudge happens: key repeat can fire several presses before
  // React re-renders, and each press must step from the previous one, not from the stale prop.
  const trim = useRef({ id: clip.id, start: clip.start, end: clip.end });
  useEffect(() => {
    trim.current = { id: clip.id, start: clip.start, end: clip.end };
  }, [clip.id, clip.start, clip.end]);

  function nudge(edge: "start" | "end", dir: -1 | 1) {
    const { start, end } = trim.current.id === clip.id ? trim.current : clip;
    const list = dir < 0 ? [...words].reverse() : words;
    if (edge === "start") {
      const w = list.find((x) => (dir < 0 ? x.start < start - 0.05 : x.start > start + 0.05));
      if (w && end - w.start >= 5) {
        trim.current = { id: clip.id, start: w.start, end };
        onTrim(w.start, end);
      }
    } else {
      const w = list.find((x) => (dir < 0 ? x.end < end - 0.05 : x.end > end + 0.05));
      if (w && w.end - start >= 5) {
        trim.current = { id: clip.id, start, end: w.end };
        onTrim(start, w.end);
      }
    }
  }

  async function exportVideo() {
    const m = mediaRef.current;
    const canvas = canvasRef.current;
    const g = ensureGraph();
    if (!m || !canvas || !g) return;
    const mimeType = pickMimeType();
    if (!mimeType) {
      setError("This browser can't record video. Try Chrome, Edge or Safari.");
      return;
    }
    setError(null);
    setView("social");
    cancelRef.current = false;
    exportingRef.current = true;
    setExportProgress(0);
    try {
      const stream = new MediaStream([
        ...canvas.captureStream(30).getVideoTracks(),
        ...g.dest.stream.getAudioTracks(),
      ]);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise((r) => (recorder.onstop = r));

      m.pause();
      m.currentTime = clip.start;
      await new Promise((r) => m.addEventListener("seeked", r, { once: true }));
      recorder.start(250);
      await m.play();
      await new Promise<void>((resolve) => {
        const id = setInterval(() => {
          const p = (m.currentTime - clip.start) / (clip.end - clip.start);
          setExportProgress(Math.min(1, p));
          if (m.currentTime >= clip.end || m.ended || cancelRef.current) {
            clearInterval(id);
            resolve();
          }
        }, 100);
      });
      m.pause();
      recorder.stop();
      await stopped;
      stream.getVideoTracks().forEach((t) => t.stop());
      if (!cancelRef.current) {
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        download(new Blob(chunks, { type: mimeType.split(";")[0] }), `${slugify(clip.title)}.${ext}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      exportingRef.current = false;
      setExportProgress(null);
      m.currentTime = clip.start;
    }
  }

  const dur = clip.end - clip.start;
  const pct = Math.min(100, Math.max(0, ((time - clip.start) / dur) * 100));
  const exporting = exportProgress !== null;
  const audioOriginal = view === "original" && !isVideo;

  const offscreen = "pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0";
  const playOverlay = (
    <span className="absolute inset-0 grid place-items-center bg-black/10 transition-colors group-hover:bg-black/25">
      <span className="grid size-16 place-items-center rounded-full bg-white/18 text-white shadow-lg ring-1 ring-white/25 backdrop-blur-xl transition-transform duration-300 group-hover:scale-105">
        <IconPlay size={24} className="translate-x-0.5" />
      </span>
    </span>
  );

  return (
    <div className="flex h-full flex-col items-center">
      <div className="segmented mb-5" role="tablist" aria-label="Preview mode">
        <button role="tab" aria-selected={view === "original"} data-active={view === "original"} onClick={() => setView("original")} disabled={exporting}>
          Original
        </button>
        <button role="tab" aria-selected={view === "social"} data-active={view === "social"} onClick={() => setView("social")} disabled={exporting}>
          9:16 Social
        </button>
      </div>

      {isVideo ? null : (
        <audio
          ref={mediaRef}
          src={mediaUrl}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(e) => (e.currentTarget.currentTime = clip.start)}
          onError={() => setError("Couldn't load this episode's media. Refresh the page, or re-upload the file if it was removed.")}
        />
      )}

      <div className="relative w-full">
        <div
          aria-hidden
          className="absolute inset-x-[15%] -inset-y-6 -z-10 rounded-[60px] opacity-50 blur-3xl transition-colors duration-700"
          style={{ background: `radial-gradient(closest-side, ${accent}55, transparent)` }}
        />

        {/* Original: plays the source file itself, limited to the clip's start/end. Nothing is cut. */}
        <div className={view === "original" ? "flex justify-center" : offscreen} aria-hidden={view !== "original"}>
          {isVideo ? (
          <button
            onClick={toggle}
            aria-label={playing ? "Pause original" : "Play original"}
            className="group relative block w-full max-w-[560px] overflow-hidden rounded-2xl bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/12 outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <video
                ref={mediaRef}
                src={mediaUrl}
                playsInline
                preload="auto"
                className="block max-h-[max(14rem,calc(100vh-640px))] min-h-48 w-full object-contain"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onLoadedMetadata={(e) => (e.currentTarget.currentTime = clip.start)}
                onError={() => setError("Couldn't load this episode's media. Refresh the page, or re-upload the file if it was removed.")}
              />
            {!playing ? playOverlay : null}
          </button>
          ) : (
            <div className="w-full max-w-[560px] rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-4 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/10 sm:p-5">
              <div className="flex items-center gap-4">
                <button
                  onClick={toggle}
                  aria-label={playing ? "Pause original" : "Play original"}
                  className="group relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-accent via-accent-2 to-accent-3 shadow-[0_14px_34px_-12px_rgba(0,0,0,0.9)] ring-1 ring-white/10 outline-none focus-visible:ring-2 focus-visible:ring-accent sm:size-24"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {project.cover ? <img src={project.cover} alt="" className="absolute inset-0 size-full object-cover" /> : <IconWave size={34} />}
                  <span
                    className={`absolute inset-0 grid place-items-center bg-black/35 transition-opacity ${
                      playing ? "opacity-0 group-hover:opacity-100" : "opacity-100 group-hover:bg-black/45"
                    }`}
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-white/20 text-white ring-1 ring-white/30 backdrop-blur-md">
                      {playing ? <IconPause size={17} /> : <IconPlay size={17} className="translate-x-px" />}
                    </span>
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-accent">
                    {playing ? <EqBars /> : null}
                    {playing ? "Playing original audio" : "Original audio"}
                  </p>
                  <p className="mt-0.5 truncate text-[15px] font-semibold tracking-tight">{clip.title}</p>
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-fg-3">
                    {timecode(clip.start)} → {timecode(clip.end)} · {duration(dur)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-fg-3">From the {timecode(project.transcript.duration)} episode. Nothing is cut.</p>
                </div>
              </div>

              <div
                role="slider"
                tabIndex={0}
                aria-label="Seek within clip"
                aria-valuemin={0}
                aria-valuemax={Math.round(dur)}
                aria-valuenow={Math.round(Math.max(0, time - clip.start))}
                aria-valuetext={`${timecode(Math.max(0, time - clip.start))} of ${timecode(dur)}`}
                className="mt-4 cursor-pointer touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const r = e.currentTarget.getBoundingClientRect();
                  seek(clip.start + ((e.clientX - r.left) / r.width) * dur);
                }}
                onPointerMove={(e) => {
                  if (!e.buttons) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  seek(clip.start + ((e.clientX - r.left) / r.width) * dur);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    seek(time + (e.key === "ArrowLeft" ? -2 : 2));
                  }
                }}
              >
                <canvas ref={waveRef} width={1120} height={150} className="block h-[75px] w-full" />
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[11px] tabular-nums text-fg-3">
                <span>{timecode(Math.max(0, time - clip.start))}</span>
                <span>-{timecode(Math.max(0, clip.end - time))}</span>
              </div>
            </div>
          )}
        </div>

        {/* 9:16 social render: same media, drawn to a canvas with hook and captions. */}
        <div className={view === "social" ? "flex justify-center" : "hidden"}>
          <button
            onClick={toggle}
            aria-label={playing ? "Pause preview" : "Play preview"}
            className="group relative block overflow-hidden rounded-[30px] bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/12 outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ width: "min(320px, 72vw, max(220px, calc((100vh - 560px) * 9 / 16)))", aspectRatio: "9 / 16" }}
          >
            <canvas ref={canvasRef} width={W} height={H} className="size-full" />
            {!playing && !exporting ? playOverlay : null}
            {exporting ? (
              <span className="absolute inset-x-4 top-4 rounded-full bg-black/60 px-3 py-1.5 text-center text-xs font-medium text-white backdrop-blur-md">
                ● Recording {Math.round((exportProgress ?? 0) * 100)}%
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* Transport */}
      <div className="mt-5 w-full max-w-[560px]">
        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            disabled={exporting}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.1] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_8px_22px_-8px_rgba(0,0,0,0.9)] ring-1 ring-inset ring-white/15 backdrop-blur-xl transition-[background-color,transform] duration-200 hover:bg-white/[0.17] active:scale-95 disabled:opacity-40"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <IconPause size={16} /> : <IconPlay size={16} className="translate-x-px" />}
          </button>
          {audioOriginal ? (
            <span className="font-mono text-xs tabular-nums text-fg-2">
              {timecode(Math.max(0, time - clip.start))} <span className="text-fg-3">/ {timecode(dur)}</span>
            </span>
          ) : (
            <>
              <div
                className="group relative h-6 flex-1 cursor-pointer"
                onPointerDown={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  seek(clip.start + ((e.clientX - r.left) / r.width) * dur);
                }}
              >
                <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/12">
                  <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
                </div>
                <div
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
                  style={{ left: `${pct}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-fg-2">
                {timecode(Math.max(0, time - clip.start))} <span className="text-fg-3">/ {timecode(dur)}</span>
              </span>
            </>
          )}
          <span className="ml-auto hidden text-[11px] text-fg-3 sm:inline">
            <kbd className="rounded border border-hairline-strong bg-white/5 px-1 font-sans text-[10px] text-fg-2">Space</kbd> play / pause
          </span>
        </div>

        <TrimStrip
          words={words}
          start={clip.start}
          end={clip.end}
          total={project.transcript.duration}
          time={time}
          disabled={exporting}
          onTrim={onTrim}
          onNudge={nudge}
        />

        {view === "social" ? (
          <>
            <div className="mt-4 space-y-2.5 rounded-xl border border-hairline bg-white/[0.02] p-3">
              <p className="label">Captions</p>
              <OptionRow label="Style">
                <div className="segmented w-full" role="radiogroup" aria-label="Caption style">
                  {CAPTION_STYLES.map((s) => (
                    <button key={s.id} className="flex-1" data-active={style === s.id} onClick={() => setStyle(s.id)} role="radio" aria-checked={style === s.id}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </OptionRow>
              <OptionRow label="Size">
                <div className="segmented w-full" role="radiogroup" aria-label="Caption size">
                  {(
                    [
                      ["s", "Small"],
                      ["m", "Medium"],
                      ["l", "Large"],
                    ] as const
                  ).map(([v, label]) => (
                    <button key={v} className="flex-1" data-active={capOpts.size === v} onClick={() => setCapOpts((o) => ({ ...o, size: v }))} role="radio" aria-checked={capOpts.size === v}>
                      {label}
                    </button>
                  ))}
                </div>
              </OptionRow>
              <OptionRow label="Position">
                <div className="segmented w-full" role="radiogroup" aria-label="Caption position">
                  {(
                    [
                      ["top", "Top"],
                      ["middle", "Middle"],
                      ["bottom", "Bottom"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      className="flex-1"
                      data-active={capOpts.position === v}
                      onClick={() => setCapOpts((o) => ({ ...o, position: v }))}
                      role="radio"
                      aria-checked={capOpts.position === v}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </OptionRow>
              <OptionRow label="Text">
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ["caps", "ALL CAPS"],
                      ["background", "Background box"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      aria-pressed={capOpts[k]}
                      onClick={() => setCapOpts((o) => ({ ...o, [k]: !o[k] }))}
                      disabled={k === "caps" && style === "pop"}
                      title={k === "caps" && style === "pop" ? "Pop is always in capitals" : undefined}
                      className={`h-8 rounded-[0.6rem] border px-2 text-[0.78rem] font-medium transition-colors disabled:opacity-40 ${
                        capOpts[k] || (k === "caps" && style === "pop")
                          ? "border-accent bg-accent/15 text-fg"
                          : "border-hairline text-fg-2 hover:border-hairline-strong hover:text-fg"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </OptionRow>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Accent color">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setAccent(c)}
                    aria-label={`Accent ${c}`}
                    aria-checked={accent === c}
                    role="radio"
                    className={`size-5 rounded-full transition-transform hover:scale-110 ${accent === c ? "ring-2 ring-white ring-offset-2 ring-offset-bg" : ""}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-2">
                <input type="checkbox" checked={showHook} onChange={(e) => setShowHook(e.target.checked)} className="accent-accent" />
                Show hook
              </label>
            </div>

            <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
              {exporting ? (
                <button className="btn btn-secondary" onClick={() => (cancelRef.current = true)}>
                  Cancel export
                </button>
              ) : (
                <button className="btn btn-primary" onClick={exportVideo}>
                  <IconFilm size={15} /> Export 9:16 video
                </button>
              )}
              <button
                className="btn btn-secondary"
                disabled={exporting}
                onClick={() =>
                  download(new Blob([toSrt(pages, clip.start)], { type: "text/plain" }), `${slugify(clip.title)}.srt`)
                }
              >
                <IconText size={15} /> SRT
              </button>
            </div>
            {exporting ? (
              <p className="mt-2 text-center text-[11px] text-fg-3">Recording in real time. Keep this tab visible.</p>
            ) : (
              <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-fg-3">
                <IconDownload size={12} /> Optional · 1080×1920 · rendered in your browser
              </p>
            )}
          </>
        ) : audioOriginal ? null : (
          <p className="mt-4 text-center text-[11px] text-fg-3">
            Plays the original file from {timecode(clip.start)} to {timecode(clip.end)}. Nothing is cut.
          </p>
        )}
        {error ? <p className="mt-2 text-center text-xs text-danger">{error}</p> : null}
      </div>
    </div>
  );
}

/** Bar heights shaped like the clip's speech: busier where more words are spoken, low in pauses. */
function speechBars(words: Word[], start: number, end: number, n = 96) {
  const out = new Float32Array(n);
  const step = (end - start) / n;
  for (const w of words) {
    if (w.end <= start || w.start >= end) continue;
    const a = Math.max(0, Math.floor((w.start - start) / step));
    const b = Math.min(n - 1, Math.floor((w.end - start) / step));
    for (let k = a; k <= b; k++) out[k] += 0.6 + Math.min(w.word.length, 10) / 12;
  }
  const max = Math.max(...out, 0.001);
  for (let k = 0; k < n; k++) {
    // Fixed per-bar jitter so the shape looks like audio but stays the same between renders.
    const jitter = ((Math.sin(k * 12.9898 + start) * 43758.5453) % 1 + 1) % 1;
    out[k] = 0.1 + 0.9 * Math.sqrt(out[k] / max) * (0.7 + 0.3 * jitter);
  }
  return out;
}

/** The scrubber: played bars in the accent gradient, the rest dim, nudged by the live audio level. */
function drawScrubWave(
  canvas: HTMLCanvasElement | null,
  bars: Float32Array,
  progress: number,
  levels: Float32Array,
  playing: boolean,
  accent: string
) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const n = bars.length;
  const gap = 4;
  const bw = (w - gap * (n - 1)) / n;
  const p = Math.min(1, Math.max(0, progress));
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, accent);
  g.addColorStop(1, "#bf5af2");
  let level = 0;
  for (const l of levels) level += l;
  level /= levels.length;
  for (let i = 0; i < n; i++) {
    const played = (i + 0.5) / n <= p;
    const near = playing && Math.abs((i + 0.5) / n - p) < 0.05;
    const bh = Math.max(6, bars[i] * (h - 8) * (near ? 0.85 + level * 0.6 : 1));
    ctx.fillStyle = played ? g : "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, bw / 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(Math.round(p * w) - 2, 0, 4, h);
}

function EqBars() {
  return (
    <span className="flex h-2.5 items-end gap-px" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-[3px] origin-bottom rounded-sm bg-accent" style={{ height: "100%", animation: `eq 0.${5 + i}s ease-in-out ${i * 0.12}s infinite alternate` }} />
      ))}
    </span>
  );
}

/** One caption setting: a fixed label column, then a control that fills the rest, so rows line up. */
function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-3">
      <span className="text-[11px] text-fg-3">{label}</span>
      {children}
    </div>
  );
}

const MIN_CLIP = 5;

/** 833.03 → "13:53.0". Trim moves a word at a time, often under a second, so show tenths. */
function preciseTime(t: number) {
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
}

/**
 * Trim by dragging: the clip sits highlighted inside a waveform of the audio around it, with a
 * handle at each end. Handles snap to word edges so a clip never starts or ends mid-word, and the
 * arrow keys move a focused handle one word at a time.
 */
function TrimStrip({
  words,
  start,
  end,
  total,
  time,
  disabled,
  onTrim,
  onNudge,
}: {
  words: Word[];
  start: number;
  end: number;
  total: number;
  time: number;
  disabled: boolean;
  onTrim: (start: number, end: number) => void;
  onNudge: (edge: "start" | "end", dir: -1 | 1) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ edge: "start" | "end"; from: number; to: number } | null>(null);
  // Pointer moves can arrive before React re-renders with `drag`, so the handlers read these refs.
  const dragging = useRef<{ edge: "start" | "end"; from: number; span: number; x: number; moved: boolean } | null>(null);
  // The visible window is frozen while dragging, so the track doesn't slide under the pointer.
  const pad = Math.max(12, (end - start) * 0.6);
  const from = drag?.from ?? Math.max(0, start - pad);
  const to = drag?.to ?? Math.min(total, end + pad);
  const span = to - from;
  const bars = useMemo(() => speechBars(words, from, to, 110), [words, from, to]);
  const x = (t: number) => `${((t - from) / span) * 100}%`;
  const inside = words.filter((w) => w.start >= start - 0.05 && w.end <= end + 0.05);
  const firstWord = inside.slice(0, 3).map((w) => w.word).join(" ");
  const lastWord = inside.slice(-3).map((w) => w.word).join(" ");

  function timeAt(clientX: number) {
    const r = track.current!.getBoundingClientRect();
    const d = dragging.current ?? { from, span };
    return d.from + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * d.span;
  }

  function move(edge: "start" | "end", t: number) {
    if (edge === "start") {
      const candidates = words.filter((w) => w.start <= end - MIN_CLIP);
      const w = nearest(candidates, t, "start");
      if (w && w.start !== start) onTrim(w.start, end);
    } else {
      const candidates = words.filter((w) => w.end >= start + MIN_CLIP);
      const w = nearest(candidates, t, "end");
      if (w && w.end !== end) onTrim(start, w.end);
    }
  }

  const handle = (edge: "start" | "end") => (
    <button
      role="slider"
      aria-label={edge === "start" ? "Clip start" : "Clip end"}
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={Math.round(edge === "start" ? start : end)}
      aria-valuetext={preciseTime(edge === "start" ? start : end)}
      title={edge === "start" ? `Starts on “${firstWord}”` : `Ends on “${lastWord}”`}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // preventDefault (which stops text selection while dragging) also skips the browser's
        // focus-on-press, so focus explicitly: the arrow keys only work on a focused handle.
        e.currentTarget.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = { edge, from, span, x: e.clientX, moved: false };
        setDrag({ edge, from, to });
      }}
      onPointerMove={(e) => {
        const d = dragging.current;
        if (d?.edge !== edge) return;
        // A plain click (to focus the handle for the arrow keys) shouldn't nudge the trim.
        if (!d.moved && Math.abs(e.clientX - d.x) < 3) return;
        d.moved = true;
        move(edge, timeAt(e.clientX));
      }}
      onPointerUp={(e) => {
        if (dragging.current?.edge === edge && dragging.current.moved) move(edge, timeAt(e.clientX));
        dragging.current = null;
        setDrag(null);
      }}
      onPointerCancel={() => {
        dragging.current = null;
        setDrag(null);
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onNudge(edge, e.key === "ArrowLeft" ? -1 : 1);
      }}
      className={`absolute inset-y-0 z-20 flex w-3.5 cursor-ew-resize touch-none items-center justify-center bg-accent outline-none transition-colors hover:bg-[#3d9eff] focus-visible:ring-2 focus-visible:ring-white ${
        edge === "start" ? "-translate-x-full rounded-l-md" : "rounded-r-md"
      }`}
      style={{ left: x(edge === "start" ? start : end) }}
    >
      <span className="h-4 w-[3px] rounded-full bg-white/80" />
    </button>
  );

  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="label">Trim</span>
        <span className="text-[11px] text-fg-3">Drag the handles · snaps to word edges</span>
      </div>
      <div className="px-3.5">
        <div ref={track} className="relative h-14 select-none">
          <div className="absolute inset-0 flex items-center gap-[2px] overflow-hidden rounded-md bg-white/[0.03]">
            {Array.from(bars, (h, i) => {
              const t = from + ((i + 0.5) / bars.length) * span;
              const inside = t >= start && t <= end;
              return (
                <span
                  key={i}
                  className={`flex-1 rounded-full ${inside ? "bg-accent/75" : "bg-white/15"}`}
                  style={{ height: `${Math.max(8, h * 82)}%` }}
                />
              );
            })}
          </div>
          {/* Selected range frame */}
          <div
            className={`pointer-events-none absolute inset-y-0 z-10 border-y-2 border-accent ${drag ? "bg-accent/10" : ""}`}
            style={{ left: x(start), width: `${((end - start) / span) * 100}%` }}
          />
          {time >= from && time <= to ? (
            <span className="pointer-events-none absolute -inset-y-1 z-10 w-0.5 rounded-full bg-white shadow-[0_0_6px_white]" style={{ left: x(time) }} />
          ) : null}
          {handle("start")}
          {handle("end")}
        </div>
      </div>
      <div className="mt-2 flex items-start justify-between gap-3 text-[11px]">
        <span className="min-w-0">
          <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono tabular-nums text-fg-2">
            <span className="font-sans text-fg-3">Start </span>
            {preciseTime(start)}
          </span>
          <span className="mt-1 block truncate text-fg-3">“{firstWord}…”</span>
        </span>
        <span className="shrink-0 pt-0.5 font-mono tabular-nums text-fg-3">{(end - start).toFixed(1)}s selected</span>
        <span className="min-w-0 text-right">
          <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono tabular-nums text-fg-2">
            <span className="font-sans text-fg-3">End </span>
            {preciseTime(end)}
          </span>
          <span className="mt-1 block truncate text-fg-3">“…{lastWord}”</span>
        </span>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-fg-3">Click a handle, then use ← → to move it one word at a time.</p>
    </div>
  );
}

function nearest(words: Word[], t: number, key: "start" | "end") {
  let best: Word | undefined;
  for (const w of words) if (!best || Math.abs(w[key] - t) < Math.abs(best[key] - t)) best = w;
  return best;
}
