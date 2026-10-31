import type { PlatformId } from "./types";

/** A durable style rule from the creator's Brand Memory. Isomorphic: used in prompts on client and server. */
export type BrandRule = {
  id: string;
  text: string;
  source: "voice" | "edit" | "manual";
  /** "all" or one platform the rule applies to. */
  scope: "all" | PlatformId;
  createdAt: number;
  /** For rules learned from an edit: the edit that taught it. */
  example?: { platform: PlatformId; before: string; after: string };
};

export function rulesFor(rules: BrandRule[], platform: PlatformId) {
  return rules.filter((r) => r.scope === "all" || r.scope === platform);
}

export function rulesPrompt(rules: BrandRule[]) {
  if (!rules.length) return "";
  return rules.map((r) => `- ${r.text}${r.scope === "all" ? "" : ` (only for ${r.scope})`}`).join("\n");
}

const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*️?\s?/gu;
const BAN = String.raw`\b(no|never|without|don'?t (use|add|include)|avoid|omit|remove|skip|drop|exclude|zero)\b[^.]*`;
const NO_EMOJI = new RegExp(`${BAN}\\bemojis?\\b`, "i");
const NO_HASHTAG = new RegExp(`${BAN}\\bhashtags?\\b`, "i");

/**
 * Mechanical safety net for rules that can be checked exactly, applied after the model writes.
 * The model handles everything else; this guarantees the obvious ones are never broken.
 */
export function enforceRules(text: string, rules: BrandRule[], platform: PlatformId) {
  let out = text;
  for (const r of rulesFor(rules, platform)) {
    if (NO_EMOJI.test(r.text)) out = out.replace(EMOJI, "");
    if (NO_HASHTAG.test(r.text) && !(platform === "shorts" && /#shorts/i.test(r.text))) {
      out = out.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, (m, pre) => (platform === "shorts" && /#shorts/i.test(m) ? m : pre));
    }
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Performance feedback the creator reported for a posted clip, kept as a learning for ranking. */
export type Learning = {
  id: string;
  projectId: string;
  clipId: string;
  clipTitle: string;
  hook: string;
  why: string;
  platform: PlatformId | "";
  views: number | null;
  outcome: "hit" | "average" | "flop";
  /** How the creator described the result, normalized, e.g. "40K views". */
  metric: string;
  /** The generalizable takeaway, e.g. "Concrete hardware explainers with a question hook do well on X." */
  lesson: string;
  createdAt: number;
};

export function learningsPrompt(learnings: Learning[]) {
  return learnings
    .slice(-20)
    .map(
      (l) =>
        `- ${l.outcome.toUpperCase()} (${l.metric || l.outcome}${l.platform ? ` on ${l.platform}` : ""}): "${l.clipTitle}", hook "${l.hook}". Lesson: ${l.lesson}`
    )
    .join("\n");
}

const PLATFORM_HABIT = /\b(hashtags?|characters?|length|long|short(er)?|words?|lines?|line breaks?|paragraphs?|calls? to action|cta|follow|save|title)\b/i;
const EVERYWHERE = /\b(all|every|any) (platforms?|captions?|posts?)\b|\beverywhere\b/i;

/**
 * Scope for a rule learned from an edit on one platform: habits that differ between platforms
 * (hashtags, length, CTAs, line breaks) stay on that platform unless the rule says otherwise.
 */
export function scopeForLearnedRule(text: string, platform: PlatformId, suggested: "all" | PlatformId): "all" | PlatformId {
  if (EVERYWHERE.test(text)) return "all";
  if (PLATFORM_HABIT.test(text)) return platform;
  return suggested;
}

const STOP = new Set(["The", "This", "That", "And", "But", "For", "With", "What", "Why", "How", "When", "Here", "Our", "Your", "You"]);

/**
 * Deterministic checks the model must pass before a caption is shown. Returns human-readable
 * issues the fix-up pass is asked to resolve.
 */
export function lintCaption(text: string, rules: BrandRule[], platform: PlatformId, limit: number): string[] {
  const issues: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    const names = (sentence.match(/\b[A-Z][A-Za-z0-9]+(?:['’]s)?\b/g) ?? [])
      .map((n) => n.replace(/['’]s$/, ""))
      .filter((n) => n.length >= 3 && !STOP.has(n));
    const seen = new Set<string>();
    for (const n of names) {
      if (seen.has(n)) {
        issues.push(`"${n}" appears twice in one sentence ("${sentence.trim().slice(0, 80)}"); rephrase so it reads naturally.`);
        break;
      }
      seen.add(n);
    }
    const art = sentence.match(/\b([Tt]he|[Aa]n?)\s+(?:[a-z]+\s+)?([A-Z][\w-]*['’]s)\b/);
    if (art) issues.push(`Ungrammatical "${art[0]}"; a possessive name can't follow "${art[1]}".`);
  }
  for (const r of rulesFor(rules, platform)) {
    if (NO_EMOJI.test(r.text) && new RegExp(EMOJI.source, "u").test(text)) issues.push(`Breaks rule "${r.text}".`);
  }
  issues.push(...namingIssues(text, rulesFor(rules, platform)));
  if (text.length > limit) issues.push(`Too long: ${text.length} characters, limit is ${limit}.`);
  return issues;
}

const NAMING =
  /\b(?:say|use|write|call (?:it|them)|refer to (?:it|them|this) as)\s+["“'‘]?(.+?)["”'’]?(?:,?\s+(?:not|instead of|rather than)\s+(?:just\s+)?["“'‘]?(.+?)["”'’]?)?\.?$/i;
const fold = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'");
const hasWord = (text: string, word: string) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const countWord = (text: string, word: string) => (text.match(new RegExp(`\\b${escape(word)}\\b`, "gi")) ?? []).length;
const countPhrase = (text: string, phrase: string) => text.split(phrase).length - 1;

/** Checks naming rules like "Always say NASA's Gateway" or "Say 'folks', not 'guys'". */
function namingIssues(text: string, rules: BrandRule[]) {
  const issues: string[] = [];
  const t = fold(text);
  for (const r of rules) {
    const m = r.text.trim().match(NAMING);
    if (!m) continue;
    const required = fold(m[1].trim());
    const banned = m[2] ? fold(m[2].trim()) : "";
    const key = required.split(/\s+/).pop()!.replace(/'s$/, "");
    // Every mention of the thing the rule names must use the required phrase (hashtags aside).
    const plain = t.replace(/#\S+/g, "");
    const mentions = key.length >= 3 ? countWord(plain, key) : 0;
    if (mentions > countPhrase(plain, required)) {
      issues.push(`Every mention of "${key}" must read "${m[1].trim()}" (rule: "${r.text}").`);
    }
    if (banned && !required.includes(banned) && hasWord(t, banned)) {
      issues.push(`Says "${m[2].trim()}", which the rule "${r.text}" forbids.`);
    }
  }
  return issues;
}
