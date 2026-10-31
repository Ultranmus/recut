import { srtTime } from "./format";
import type { Word } from "./types";

export type CaptionPage = { start: number; end: number; words: Word[] };

export function wordsInRange(words: Word[], start: number, end: number) {
  return words.filter((w) => w.start >= start - 0.05 && w.end <= end + 0.05);
}

/** Groups words into short on-screen caption "pages" (a few words each), breaking at punctuation and pauses. */
export function paginate(words: Word[], maxWords = 4, maxChars = 22): CaptionPage[] {
  const pages: CaptionPage[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) pages.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = cur[cur.length - 1];
    const chars = cur.reduce((n, x) => n + x.word.length + 1, 0) + w.word.length;
    if (cur.length && (cur.length >= maxWords || chars > maxChars || (prev && w.start - prev.end > 0.6))) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.word) || (/[,;:]$/.test(w.word) && cur.length >= 2)) flush();
  }
  flush();
  // Hold each page on screen until the next one starts, so captions don't flicker during short pauses.
  for (let i = 0; i < pages.length - 1; i++) {
    const gap = pages[i + 1].start - pages[i].end;
    if (gap > 0 && gap < 1) pages[i].end = pages[i + 1].start;
  }
  return pages;
}

export function toSrt(pages: CaptionPage[], offset: number) {
  return pages
    .map(
      (p, i) =>
        `${i + 1}\n${srtTime(Math.max(0, p.start - offset))} --> ${srtTime(Math.max(0, p.end - offset))}\n${p.words
          .map((w) => w.word)
          .join(" ")}\n`
    )
    .join("\n");
}
