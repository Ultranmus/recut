export type Word = { word: string; start: number; end: number };

export type Segment = { id: number; start: number; end: number; text: string };

export type Transcript = {
  language: string;
  duration: number;
  text: string;
  segments: Segment[];
  words: Word[];
};

/**
 * Caption targets per platform. `limit` is the platform's hard cap; `visible` is roughly how many
 * characters show before the feed truncates ("more" / "see more"), which is where the hook must land.
 */
export const PLATFORMS = [
  {
    id: "reels",
    name: "Instagram Reels",
    short: "Reels",
    limit: 2200,
    visible: 125,
    color: "#e1306c",
    tone: "Casual, hook-first, a few emojis, 3–5 hashtags",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    short: "LinkedIn",
    limit: 3000,
    visible: 210,
    color: "#0a84ff",
    tone: "Professional insight with a takeaway and a question",
  },
  {
    id: "x",
    name: "X",
    short: "X",
    limit: 280,
    visible: 280,
    color: "#e5e5ea",
    tone: "Punchy single post, one idea, 0–1 hashtag",
  },
  {
    id: "shorts",
    name: "YouTube Shorts",
    short: "Shorts",
    limit: 100,
    visible: 100,
    color: "#ff3b30",
    tone: "Searchable, curiosity-driven title ending in #Shorts",
  },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]["id"];

export type Clip = {
  id: string;
  title: string;
  start: number;
  end: number;
  hook: string;
  why: string;
  score: number;
  /** The AI's original score, kept when performance learnings re-rank the clip. */
  baseScore?: number;
  /** Why learnings moved this clip's score. */
  rankNote?: string;
  captions: Record<PlatformId, string>;
  hashtags: string[];
};

export type Analysis = {
  title: string;
  summary: string;
  topics: string[];
  clips: Clip[];
};

export type MediaKind = "audio" | "video";

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  kind: MediaKind;
  transcript: Transcript;
  analysis: Analysis;
  /** Present for uploads (stored in IndexedDB); demo uses a static URL. */
  file?: Blob;
  mediaUrl?: string;
  cover?: string;
  source?: { show: string; episode: string; url: string; credit: string };
  /** Set when the AI clip finder failed and heuristic picks were used. */
  notice?: string;
};
