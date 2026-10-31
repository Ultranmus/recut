"use client";

import { useEffect, useRef, useState } from "react";
import type { CaptionPage } from "@/lib/captions";
import { toSrt } from "@/lib/captions";
import { download, slugify, timecode } from "@/lib/format";
import {
  CAPTION_STYLES,
  H,
  W,
  drawFrame,
  makeBackground,
  pickMimeType,
  resolveFontFamily,
  updateLevels,
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

export type PlayerHandle = { seek: (t: number) => void; play: () => void };

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
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [showHook, setShowHook] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(clip.start);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isVideo = project.kind === "video";
  const subtitle = project.source?.show ?? (isVideo ? "" : "Podcast");

  // Latest values for the render loop, which runs outside React's render cycle.
  const live = useRef({ clip, pages, style, accent, showHook, onTime, view });
  useEffect(() => {
    live.current = { clip, pages, style, accent, showHook, onTime, view };
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
        if (!isVideo) drawMiniWave(waveRef.current, levels.current, L.accent);
      } else if (background.current) {
        drawFrame(ctx, {
          time: t,
          start: L.clip.start,
          end: L.clip.end,
          hook: L.showHook ? L.clip.hook : "",
          pages: L.pages,
          style: L.style,
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

  useEffect(() => () => void graph.current?.ctx.close(), []);

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
    void m.play();
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

  useEffect(() => {
    playerRef.current = { seek, play };
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

  function nudge(edge: "start" | "end", dir: -1 | 1) {
    if (edge === "start") {
      const list = dir < 0 ? [...words].reverse() : words;
      const w = list.find((x) => (dir < 0 ? x.start < clip.start - 0.05 : x.start > clip.start + 0.05));
      if (w && clip.end - w.start >= 5) onTrim(w.start, clip.end);
    } else {
      const list = dir < 0 ? [...words].reverse() : words;
      const w = list.find((x) => (dir < 0 ? x.end < clip.end - 0.05 : x.end > clip.end + 0.05));
      if (w && w.end - clip.start >= 5) onTrim(clip.start, w.end);
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
          <button
            onClick={toggle}
            aria-label={playing ? "Pause original" : "Play original"}
            className="group relative block w-full max-w-[560px] overflow-hidden rounded-2xl bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/12 outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {isVideo ? (
              <video
                ref={mediaRef}
                src={mediaUrl}
                playsInline
                preload="auto"
                className="block max-h-[max(14rem,calc(100vh-640px))] min-h-48 w-full object-contain"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onLoadedMetadata={(e) => (e.currentTarget.currentTime = clip.start)}
              />
            ) : (
              <span className="flex flex-col items-center gap-5 bg-gradient-to-b from-white/[0.06] to-transparent px-6 pb-6 pt-7">
                <span className="relative grid size-36 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-accent via-accent-2 to-accent-3 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {project.cover ? <img src={project.cover} alt="" className="size-full object-cover" /> : <IconWave size={40} />}
                </span>
                <canvas ref={waveRef} width={1040} height={160} className="h-16 w-full max-w-[420px]" />
                <span className="text-xs text-fg-3">
                  Original audio · {timecode(clip.start)} → {timecode(clip.end)} of {timecode(project.transcript.duration)}
                </span>
              </span>
            )}
            {!playing && isVideo ? playOverlay : null}
          </button>
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
      <div className="mt-5 w-full max-w-md">
        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            disabled={exporting}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-black transition-transform active:scale-95 disabled:opacity-40"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <IconPause size={15} /> : <IconPlay size={15} className="translate-x-px" />}
          </button>
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
          <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-fg-2">
            {timecode(Math.max(0, time - clip.start))} / {timecode(dur)}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <TrimControl label="Start" value={clip.start} onDec={() => nudge("start", -1)} onInc={() => nudge("start", 1)} />
          {view === "social" ? (
            <div className="segmented" role="radiogroup" aria-label="Caption style">
              {CAPTION_STYLES.map((s) => (
                <button key={s.id} data-active={style === s.id} onClick={() => setStyle(s.id)} role="radio" aria-checked={style === s.id}>
                  {s.name}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-center text-[11px] leading-tight text-fg-3">
              Trim snaps
              <br />
              to word edges
            </span>
          )}
          <TrimControl label="End" value={clip.end} onDec={() => nudge("end", -1)} onInc={() => nudge("end", 1)} />
        </div>

        {view === "social" ? (
          <>
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
        ) : (
          <p className="mt-4 text-center text-[11px] text-fg-3">
            Plays the original file from {timecode(clip.start)} to {timecode(clip.end)}. Nothing is cut.
          </p>
        )}
        {error ? <p className="mt-2 text-center text-xs text-danger">{error}</p> : null}
      </div>
    </div>
  );
}

/** Small live waveform for the original-audio view. */
function drawMiniWave(canvas: HTMLCanvasElement | null, levels: Float32Array, accent: string) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const n = levels.length;
  const gap = 12;
  const bw = (w - gap * (n - 1)) / n;
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, accent);
  g.addColorStop(1, "#bf5af2");
  ctx.fillStyle = g;
  for (let i = 0; i < n; i++) {
    const bh = 10 + levels[i] * (h - 14);
    ctx.beginPath();
    ctx.roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, bw / 2);
    ctx.fill();
  }
}

function TrimControl({ label, value, onDec, onInc }: { label: string; value: number; onDec: () => void; onInc: () => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-hairline bg-white/[0.03] p-0.5">
      <button className="btn btn-ghost h-7 w-7 p-0 text-base" onClick={onDec} aria-label={`${label} one word earlier`}>
        ‹
      </button>
      <div className="w-14 text-center leading-none">
        <p className="text-[10px] text-fg-3">{label}</p>
        <p className="font-mono text-[11px] tabular-nums">{timecode(value)}</p>
      </div>
      <button className="btn btn-ghost h-7 w-7 p-0 text-base" onClick={onInc} aria-label={`${label} one word later`}>
        ›
      </button>
    </div>
  );
}
