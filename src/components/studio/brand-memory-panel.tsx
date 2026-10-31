"use client";

import { useState } from "react";
import { addRules, removeLearning, removeRule } from "@/lib/brand-memory";
import type { BrandRule, Learning } from "@/lib/brand-rules";
import { diffWords } from "@/lib/diff";
import { PLATFORMS } from "@/lib/types";
import { IconClose } from "../icons";
import { outcomeBadge } from "./calendar-view";

const SOURCE: Record<BrandRule["source"], { label: string; cls: string }> = {
  voice: { label: "Voice", cls: "bg-accent/15 text-accent" },
  edit: { label: "From edit", cls: "bg-accent-3/15 text-accent-3" },
  manual: { label: "Typed", cls: "bg-white/8 text-fg-2" },
};

export function BrandMemoryPanel({
  rules,
  learnings,
  checking,
  reranking,
  onRulesAdded,
  onRecheck,
  onRerank,
}: {
  rules: BrandRule[];
  learnings: Learning[];
  checking: boolean;
  reranking: boolean;
  onRulesAdded: (added: BrandRule[]) => void;
  onRecheck: () => void;
  onRerank: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  function add() {
    const text = draft.trim();
    if (!text) return;
    const added = addRules([{ text: /[.!?]$/.test(text) ? text : `${text}.`, source: "manual", scope: "all" }]);
    setDraft("");
    if (added.length) onRulesAdded(added);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Brand Memory</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">
          Rules from your voice briefs and caption edits. Every new caption follows them, in every project.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          className="field h-9"
          placeholder="Add a rule, e.g. “No emojis”"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          aria-label="New brand rule"
        />
        <button className="btn btn-secondary h-9" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>

      {rules.length ? (
        <ul className="space-y-2">
          {rules.map((r) => {
            const src = SOURCE[r.source];
            const scope = r.scope === "all" ? null : PLATFORMS.find((p) => p.id === r.scope);
            return (
              <li key={r.id} className="group rise rounded-xl border border-hairline bg-white/[0.03] p-3">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-[13px] leading-snug">{r.text}</p>
                  <button
                    className="btn btn-ghost -mr-1 -mt-1 h-6 w-6 p-0 opacity-60 group-hover:opacity-100"
                    onClick={() => removeRule(r.id)}
                    aria-label={`Delete rule: ${r.text}`}
                  >
                    <IconClose size={12} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className={`rounded px-1.5 py-0.5 font-medium ${src.cls}`}>{src.label}</span>
                  <span className="rounded bg-white/6 px-1.5 py-0.5 text-fg-2">{scope ? scope.short : "All platforms"}</span>
                  {r.example ? (
                    <button className="ml-auto text-fg-3 hover:text-fg" onClick={() => setOpen(open === r.id ? null : r.id)}>
                      {open === r.id ? "Hide edit" : "See the edit"}
                    </button>
                  ) : null}
                </div>
                {open === r.id && r.example ? (
                  <p className="mt-2 rounded-lg bg-black/30 p-2 text-[11px] leading-relaxed">
                    {diffWords(r.example.before, r.example.after).map((d, i) => (
                      <span
                        key={i}
                        className={
                          d.type === "removed"
                            ? "bg-danger/15 text-danger line-through decoration-danger/60"
                            : d.type === "added"
                              ? "bg-success/15 text-success"
                              : "text-fg-3"
                        }
                      >
                        {d.text}
                      </span>
                    ))}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-white/12 p-5 text-center text-xs leading-relaxed text-fg-3">
          No rules yet. Say something like “from now on, no emojis” in Talk to your studio, or edit a caption the way you like
          it and the studio will learn from it.
        </div>
      )}

      {rules.length ? (
        <button className="btn btn-secondary w-full text-xs" onClick={onRecheck} disabled={checking}>
          {checking ? "Checking captions…" : "Check this clip's captions against all rules"}
        </button>
      ) : null}

      <div className="border-t border-hairline pt-4">
        <h3 className="text-sm font-semibold">Performance learnings</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">
          How your posted clips did. Used to re-rank clips here and to score clips in every new upload.
        </p>
      </div>

      {learnings.length ? (
        <ul className="space-y-2">
          {[...learnings].reverse().map((l) => {
            const badge = outcomeBadge(l);
            const platform = PLATFORMS.find((p) => p.id === l.platform);
            return (
              <li key={l.id} className="group rise rounded-xl border border-hairline bg-white/[0.03] p-3">
                <div className="flex items-start gap-2">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.text}</span>
                  <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{l.clipTitle}</p>
                  <button
                    className="btn btn-ghost -mr-1 -mt-1 h-6 w-6 p-0 opacity-60 group-hover:opacity-100"
                    onClick={() => removeLearning(l.id)}
                    aria-label={`Delete learning for ${l.clipTitle}`}
                  >
                    <IconClose size={12} />
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-fg-3">
                  {l.metric || l.outcome}
                  {platform ? ` · ${platform.short}` : ""}
                </p>
                {l.lesson ? <p className="mt-1.5 text-xs leading-relaxed text-fg-2">→ {l.lesson}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-white/12 p-5 text-center text-xs leading-relaxed text-fg-3">
          No results yet. Tell the studio “the Gateway clip got 40,000 views” or “the robots one flopped”, or use “How did it
          do?” on a calendar post.
        </div>
      )}

      {learnings.length ? (
        <button className="btn btn-secondary w-full text-xs" onClick={onRerank} disabled={reranking}>
          {reranking ? "Re-ranking…" : "Re-rank this episode's clips with learnings"}
        </button>
      ) : null}
    </div>
  );
}
