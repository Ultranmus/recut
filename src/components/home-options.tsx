"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { demoProject, deleteProject, listProjects } from "@/lib/projects";
import { duration } from "@/lib/format";
import { PLATFORMS, type Project } from "@/lib/types";
import { IconFilm, IconPlay, IconSparkle, IconTrash, IconWave } from "./icons";
import { openSettings } from "./top-bar";
import { UploadCard } from "./upload-card";

export function HomeOptions() {
  const demo = demoProject;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Link
        href="/studio/demo"
        className="group glass rise relative flex flex-col overflow-hidden rounded-3xl p-6 outline-none transition-all duration-300 ease-[var(--ease-mac)] hover:-translate-y-0.5 hover:border-hairline-strong focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent/20 blur-3xl transition-opacity duration-500 group-hover:opacity-80"
        />
        <div className="flex items-center justify-between">
          <span className="label">Option 1</span>
          <span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-[11px] text-success">
            No key needed
          </span>
        </div>

        <div className="mt-5 flex gap-5">
          <div className="relative size-28 shrink-0 overflow-hidden rounded-2xl shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/10 transition-transform duration-500 ease-[var(--ease-mac)] group-hover:scale-[1.03] sm:size-32">
            <Image src={demo.cover!} alt="" fill sizes="128px" className="object-cover" priority />
          </div>
          <div className="min-w-0 pt-1">
            <p className="text-xs font-medium text-accent">{demo.source?.show}</p>
            <h3 className="mt-1 text-xl font-semibold leading-tight tracking-tight">{demo.name}</h3>
            <p className="mt-1.5 text-xs text-fg-3">{demo.source?.episode}</p>
            <p className="mt-3 line-clamp-2 text-sm text-fg-2">
              NASA Administrator Jim Bridenstine on 50 years since Apollo 11 and the plan to go back to the Moon.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          {[
            { k: duration(demo.transcript.duration), v: "episode" },
            { k: String(demo.analysis.clips.length), v: "clips found" },
            { k: String(demo.analysis.clips.length * PLATFORMS.length), v: "captions" },
          ].map((s) => (
            <div key={s.v} className="rounded-xl border border-hairline bg-white/[0.03] py-2.5">
              <p className="text-[15px] font-semibold tabular-nums">{s.k}</p>
              <p className="text-[11px] text-fg-3">{s.v}</p>
            </div>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between pt-6">
          <span className="text-xs text-fg-3">Pre-transcribed with Groq Whisper</span>
          <span className="btn btn-primary">
            <IconPlay size={13} /> Try the demo episode
          </span>
        </div>
      </Link>

      <div className="rise [animation-delay:80ms]">
        <UploadCard onNeedKey={openSettings} />
      </div>
    </div>
  );
}

export function RecentProjects() {
  const [items, setItems] = useState<Project[]>([]);
  useEffect(() => {
    listProjects().then(setItems);
  }, []);
  if (!items.length) return null;

  return (
    <section className="rise mt-14 [animation-delay:160ms]">
      <h2 className="label mb-3">Recent projects</h2>
      <ul className="glass divide-y divide-hairline overflow-hidden rounded-2xl">
        {items.map((p) => (
          <li key={p.id} className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-hover">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/6 text-fg-2">
              {p.kind === "video" ? <IconFilm size={17} /> : <IconWave size={17} />}
            </span>
            <Link href={`/studio/${p.id}`} className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="text-xs text-fg-3">
                {duration(p.transcript.duration)} · {p.analysis.clips.length} clips ·{" "}
                {new Date(p.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
            </Link>
            <button
              className="btn btn-ghost h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Delete ${p.name}`}
              onClick={async () => {
                await deleteProject(p.id);
                setItems((xs) => xs.filter((x) => x.id !== p.id));
              }}
            >
              <IconTrash size={15} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Features() {
  const items = [
    { icon: IconWave, title: "Word-level transcript", body: "Groq Whisper with timestamps on every word." },
    { icon: IconSparkle, title: "AI clip finder", body: "Ranks self-contained moments with strong hooks." },
    { icon: IconFilm, title: "Vertical export", body: "9:16 video with animated captions, rendered locally." },
  ];
  return (
    <div className="mt-14 grid gap-3 sm:grid-cols-3">
      {items.map(({ icon: I, title, body }) => (
        <div key={title} className="flex gap-3 rounded-2xl border border-hairline bg-white/[0.02] p-4">
          <I size={18} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-0.5 text-xs text-fg-3">{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
