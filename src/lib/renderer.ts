import type { CaptionPage } from "./captions";

/**
 * Draws one 9:16 frame of a clip. The same function powers the live preview and the
 * exported video, so what you see is exactly what you download.
 */

export const W = 1080;
export const H = 1920;

export type CaptionStyle = "pop" | "box" | "minimal";

export const CAPTION_STYLES: { id: CaptionStyle; name: string }[] = [
  { id: "pop", name: "Pop" },
  { id: "box", name: "Box" },
  { id: "minimal", name: "Minimal" },
];

export type CaptionOptions = {
  size: "s" | "m" | "l";
  position: "top" | "middle" | "bottom";
  caps: boolean;
  /** A translucent box behind each caption line, for busy backgrounds. */
  background: boolean;
};

export const DEFAULT_CAPTION_OPTIONS: CaptionOptions = { size: "m", position: "bottom", caps: false, background: false };

const SIZE_SCALE = { s: 0.78, m: 1, l: 1.25 } as const;

export type FrameInput = {
  time: number;
  start: number;
  end: number;
  hook: string;
  pages: CaptionPage[];
  style: CaptionStyle;
  options: CaptionOptions;
  accent: string;
  background: HTMLCanvasElement;
  cover: HTMLImageElement | null;
  video: HTMLVideoElement | null;
  levels: Float32Array;
  title: string;
  subtitle: string;
};

let family = "system-ui, sans-serif";

export function resolveFontFamily() {
  const geist = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-sans").trim();
  family = `-apple-system, BlinkMacSystemFont, "SF Pro Display", ${geist ? geist + "," : ""} system-ui, sans-serif`;
}

const font = (weight: number, size: number) => `${weight} ${size}px ${family}`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "…");
  }
  return lines;
}

/** Blurred cover (or a generated gradient) pre-rendered once, since canvas blur is too costly per frame. */
export function makeBackground(cover: HTMLImageElement | null, accent: string) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0a0a0c";
  ctx.fillRect(0, 0, W, H);
  if (cover) {
    const s = Math.max(W / cover.width, H / cover.height) * 1.25;
    ctx.filter = "blur(70px) saturate(150%) brightness(0.6)";
    ctx.drawImage(cover, (W - cover.width * s) / 2, (H - cover.height * s) / 2, cover.width * s, cover.height * s);
    ctx.filter = "none";
  } else {
    const g = ctx.createRadialGradient(W * 0.2, H * 0.1, 0, W * 0.2, H * 0.1, H * 0.9);
    g.addColorStop(0, accent + "aa");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createRadialGradient(W, H * 0.8, 0, W, H * 0.8, H * 0.7);
    g2.addColorStop(0, "#bf5af288");
    g2.addColorStop(1, "transparent");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
  }
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,0.25)");
  shade.addColorStop(0.55, "rgba(0,0,0,0.35)");
  shade.addColorStop(1, "rgba(0,0,0,0.8)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  return c;
}

function drawHook(ctx: CanvasRenderingContext2D, hook: string, y: number) {
  if (!hook) return;
  ctx.font = font(750, 58);
  const lines = wrap(ctx, hook, 860, 2);
  const lh = 70;
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 88;
  const height = lines.length * lh + 52;
  const x = (W - width) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, x, y, width, height, 34);
  ctx.fillStyle = "rgba(28,28,32,0.72)";
  ctx.fill();
  ctx.restore();
  roundRect(ctx, x + 0.75, y + 0.75, width - 1.5, height - 1.5, 34);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 26 + lh / 2 + i * lh));
}

function drawCover(ctx: CanvasRenderingContext2D, input: FrameInput, y: number, size: number) {
  const x = (W - size) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 80;
  ctx.shadowOffsetY = 30;
  roundRect(ctx, x, y, size, size, 44);
  ctx.fillStyle = "#1c1c20";
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, size, size, 44);
  ctx.clip();
  if (input.cover) {
    ctx.drawImage(input.cover, x, y, size, size);
  } else {
    const g = ctx.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, input.accent);
    g.addColorStop(0.55, "#5e5ce6");
    g.addColorStop(1, "#bf5af2");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = font(800, size * 0.11);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    wrap(ctx, input.title, size - 100, 4).forEach((l, i) => ctx.fillText(l, x + 50, y + 110 + i * size * 0.13));
  }
  ctx.restore();
  roundRect(ctx, x + 1, y + 1, size - 2, size - 2, 43);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawWave(ctx: CanvasRenderingContext2D, levels: Float32Array, cy: number, accent: string) {
  const bars = levels.length;
  const bw = 12;
  const gap = 10;
  const total = bars * bw + (bars - 1) * gap;
  let x = (W - total) / 2;
  const g = ctx.createLinearGradient((W - total) / 2, 0, (W + total) / 2, 0);
  g.addColorStop(0, accent);
  g.addColorStop(1, "#bf5af2");
  ctx.fillStyle = g;
  for (let i = 0; i < bars; i++) {
    const h = 12 + levels[i] * 130;
    roundRect(ctx, x, cy - h / 2, bw, h, bw / 2);
    ctx.fill();
    x += bw + gap;
  }
}

function drawCaptions(ctx: CanvasRenderingContext2D, input: FrameInput, cy: number) {
  const { time, pages, style, accent, options } = input;
  const page = pages.find((p) => time >= p.start - 0.05 && time <= p.end + 0.15);
  if (!page) return;

  const size = Math.round((style === "minimal" ? 62 : 82) * SIZE_SCALE[options.size]);
  const weight = style === "minimal" ? 650 : 850;
  ctx.font = font(weight, size);
  const space = ctx.measureText(" ").width * (style === "pop" ? 1.4 : 1);
  const tokens = page.words.map((w) => ({
    w,
    text: style === "pop" || options.caps ? w.word.toUpperCase() : w.word,
  }));
  // Lay out words into centered lines.
  const maxWidth = 900;
  const lines: { items: typeof tokens; width: number }[] = [{ items: [], width: 0 }];
  for (const t of tokens) {
    const tw = ctx.measureText(t.text).width;
    const line = lines[lines.length - 1];
    if (line.items.length && line.width + space + tw > maxWidth) lines.push({ items: [], width: 0 });
    const l = lines[lines.length - 1];
    l.width += (l.items.length ? space : 0) + tw;
    l.items.push(t);
  }
  const lh = size * 1.18;
  let y = cy - ((lines.length - 1) * lh) / 2;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";

  for (const line of lines) {
    let x = (W - line.width) / 2;
    if (options.background) {
      roundRect(ctx, x - 26, y - size * 0.7, line.width + 52, size * 1.4, 22);
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.fill();
    }
    for (const t of line.items) {
      const tw = ctx.measureText(t.text).width;
      const active = time >= t.w.start - 0.03 && time < t.w.end + 0.05;
      const spoken = time >= t.w.start - 0.03;

      if (style === "box" && active) {
        roundRect(ctx, x - 14, y - size * 0.62, tw + 28, size * 1.24, 18);
        ctx.fillStyle = accent;
        ctx.fill();
      }

      ctx.save();
      if (style === "pop" && active) {
        ctx.translate(x + tw / 2, y);
        ctx.scale(1.08, 1.08);
        ctx.translate(-(x + tw / 2), -y);
      }
      if (style !== "minimal") {
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.lineWidth = style === "pop" ? 14 : 10;
        ctx.strokeText(t.text, x, y);
      } else {
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 18;
      }
      ctx.fillStyle =
        style === "pop"
          ? active
            ? "#ffd60a"
            : "#ffffff"
          : style === "minimal"
            ? spoken
              ? "#ffffff"
              : "rgba(255,255,255,0.45)"
            : "#ffffff";
      ctx.fillText(t.text, x, y);
      ctx.restore();
      x += tw + space;
    }
    y += lh;
  }
}

function drawProgress(ctx: CanvasRenderingContext2D, input: FrameInput) {
  const p = Math.min(1, Math.max(0, (input.time - input.start) / (input.end - input.start)));
  const w = 880;
  const x = (W - w) / 2;
  const y = H - 92;
  roundRect(ctx, x, y, w, 8, 4);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fill();
  roundRect(ctx, x, y, Math.max(8, w * p), 8, 4);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

/** Where captions sit: below the hook, the middle of the frame, or the usual lower third. */
function captionY(options: CaptionOptions, bottom: number) {
  return options.position === "top" ? 430 : options.position === "middle" ? H / 2 : bottom;
}

export function drawFrame(ctx: CanvasRenderingContext2D, input: FrameInput) {
  const v = input.video;
  if (v && v.videoWidth) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const s = Math.max(W / v.videoWidth, H / v.videoHeight);
    ctx.drawImage(v, (W - v.videoWidth * s) / 2, (H - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
    const top = ctx.createLinearGradient(0, 0, 0, 520);
    top.addColorStop(0, "rgba(0,0,0,0.55)");
    top.addColorStop(1, "transparent");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, 520);
    const bottom = ctx.createLinearGradient(0, H * 0.55, 0, H);
    bottom.addColorStop(0, "transparent");
    bottom.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = bottom;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
    drawHook(ctx, input.hook, 170);
    drawCaptions(ctx, input, captionY(input.options, 1460));
  } else {
    ctx.drawImage(input.background, 0, 0);
    drawHook(ctx, input.hook, 170);
    drawCover(ctx, input, 420, 600);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fff";
    ctx.font = font(700, 42);
    ctx.fillText(wrap(ctx, input.title, 900, 1)[0] ?? "", W / 2, 1110);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = font(500, 32);
    ctx.fillText(wrap(ctx, input.subtitle, 900, 1)[0] ?? "", W / 2, 1160);
    drawWave(ctx, input.levels, 1290, input.accent);
    drawCaptions(ctx, input, captionY(input.options, 1540));
  }
  drawProgress(ctx, input);
}

/** Smooths analyser frequency data into a fixed number of bars (0..1). */
export function updateLevels(levels: Float32Array, freq: Uint8Array<ArrayBuffer> | null, playing: boolean, t: number) {
  const n = levels.length;
  for (let i = 0; i < n; i++) {
    // Mirror so the waveform is symmetric around the center.
    const k = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
    let target: number;
    if (freq && playing) {
      const bin = Math.floor(2 + k * 70);
      target = Math.pow(freq[bin] / 255, 1.6) * (1 - k * 0.35);
    } else {
      target = 0.05 + 0.04 * Math.sin(t * 2 + i * 0.5);
    }
    levels[i] += (target - levels[i]) * (target > levels[i] ? 0.5 : 0.15);
  }
}

export function pickMimeType() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) ?? "";
}
