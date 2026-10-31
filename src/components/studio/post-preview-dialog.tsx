"use client";

import { useEffect, useRef, useState } from "react";
import { duration } from "@/lib/format";
import { PLATFORMS, type Clip, type PlatformId } from "@/lib/types";
import { IconCheck, IconClose, IconCopy, IconPlay, IconWave } from "../icons";

type Media = { cover?: string; show?: string };

/** Where each platform's "post" button goes. X and LinkedIn take the caption pre-filled. */
const DESTINATIONS: Record<PlatformId, { label: string; url: (text: string) => string; prefilled: boolean }> = {
  x: { label: "Post on X", url: (t) => `https://x.com/intent/post?text=${encodeURIComponent(t)}`, prefilled: true },
  linkedin: {
    label: "Post on LinkedIn",
    url: (t) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(t)}`,
    prefilled: true,
  },
  reels: { label: "Copy & open Instagram", url: () => "https://www.instagram.com/", prefilled: false },
  shorts: { label: "Copy & open YouTube Studio", url: () => "https://studio.youtube.com/", prefilled: false },
};

/**
 * How a clip's post will look on each platform (feed layout, where the caption gets cut off, the
 * media), plus one click to post it there.
 */
export function PostPreviewDialog({
  platform,
  clip,
  media,
  onClose,
}: {
  platform: PlatformId;
  clip: Clip;
  media: Media;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState<PlatformId>(platform);
  const [copied, setCopied] = useState(false);
  const p = PLATFORMS.find((x) => x.id === active)!;
  const text = clip.captions[active] ?? "";
  const dest = DESTINATIONS[active];
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  useEffect(() => {
    const d = ref.current;
    if (d?.open && !d.matches(":modal")) d.removeAttribute("open");
    if (d && !d.open) d.showModal();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      return true;
    } catch {
      return false;
    }
  }

  async function post() {
    if (!dest.prefilled) await copy();
    window.open(dest.url(text), "_blank", "noopener,noreferrer");
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto max-h-[94dvh] w-[min(94vw,30rem)] overflow-hidden rounded-2xl bg-transparent p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      aria-label={`${p.name} preview`}
    >
      <div className="window rise flex max-h-[94dvh] flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="segmented min-w-0 flex-1" role="tablist" aria-label="Platform">
            {PLATFORMS.map((x) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={active === x.id}
                data-active={active === x.id}
                onClick={() => setActive(x.id)}
                className="flex flex-1 items-center justify-center gap-1.5 px-2"
              >
                <span className="size-1.5 rounded-full" style={{ background: x.color }} />
                {x.short}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost h-8 w-8 shrink-0 p-0" onClick={onClose} aria-label="Close preview">
            <IconClose size={16} />
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-black/30 px-4 py-5">
          {active === "reels" || active === "shorts" ? (
            <VerticalPost platform={active} text={text} clip={clip} media={media} visible={p.visible} />
          ) : active === "linkedin" ? (
            <LinkedInPost text={text} clip={clip} media={media} visible={p.visible} />
          ) : (
            <XPost text={text} clip={clip} media={media} />
          )}
        </div>

        <div className="space-y-2.5 border-t border-hairline px-4 py-3.5">
          <p className="text-[11px] leading-relaxed text-fg-3">
            {dest.prefilled
              ? `Opens ${p.name} with this caption filled in. `
              : `${p.name} can't be filled in from the web, so the caption is copied for you to paste. `}
            Attach the clip from <span className="text-fg-2">9:16 Social → Export video</span>.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary h-9 flex-1 text-xs" onClick={copy}>
              {copied ? <IconCheck size={14} className="text-success" /> : <IconCopy size={14} />}
              {copied ? "Copied" : "Copy caption"}
            </button>
            {canShare ? (
              <button className="btn btn-secondary h-9 flex-1 text-xs" onClick={() => navigator.share({ text }).catch(() => {})}>
                Share…
              </button>
            ) : null}
            <button className="btn btn-primary h-9 flex-[1.4] text-xs" onClick={post} disabled={!text}>
              {dest.label} ↗
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/** Caption cut where the platform's feed shows "…more". */
function Folded({ text, visible, more, className = "" }: { text: string; visible: number; more: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const cut = !open && text.length > visible;
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {cut ? text.slice(0, visible).trimEnd() : text}
      {cut ? (
        <button className="ml-1 font-medium text-current opacity-60 hover:opacity-90" onClick={() => setOpen(true)}>
          …{more}
        </button>
      ) : null}
    </p>
  );
}

function Thumb({ media, clip, className = "", children }: { media: Media; clip: Clip; className?: string; children?: React.ReactNode }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-accent via-accent-2 to-accent-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {media.cover ? <img src={media.cover} alt="" className="absolute inset-0 size-full object-cover" /> : null}
      {!media.cover ? <IconWave size={40} className="absolute inset-0 m-auto text-white/70" /> : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
      <p className="absolute inset-x-4 top-4 text-center text-[15px] font-extrabold leading-tight text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.6)]">
        {clip.hook}
      </p>
      {children}
    </div>
  );
}

const Avatar = ({ size = 36 }: { size?: number }) => (
  <span
    className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2b95ff] to-[#bf5af2] text-[11px] font-bold text-white"
    style={{ width: size, height: size }}
  >
    YB
  </span>
);

function VerticalPost({ platform, text, clip, media, visible }: { platform: "reels" | "shorts"; text: string; clip: Clip; media: Media; visible: number }) {
  const icon = (d: string, label: string) => (
    <span className="flex flex-col items-center gap-1 text-[10px] font-semibold text-white">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
      {label}
    </span>
  );
  return (
    <div className="mx-auto w-[min(100%,17rem)] overflow-hidden rounded-[28px] border-4 border-[#1c1c1e] bg-black shadow-2xl">
      <Thumb media={media} clip={clip} className="aspect-[9/16]">
        <div className="absolute bottom-24 right-2.5 flex flex-col gap-4">
          {icon("M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z", "12K")}
          {icon("M20 12a8 8 0 0 1-11.7 7.1L4 20l1-4.1A8 8 0 1 1 20 12z", "214")}
          {icon("M4 12l16-8-6 16-2-7-8-1z", "Share")}
        </div>
        <div className="absolute inset-x-3 bottom-4 pr-12 text-white">
          <p className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold">
            <Avatar size={24} /> yourbrand
            <span className="rounded-md border border-white/60 px-1.5 py-px text-[10px]">{platform === "reels" ? "Follow" : "Subscribe"}</span>
          </p>
          <Folded text={text} visible={platform === "shorts" ? 60 : Math.min(visible, 90)} more="more" className="text-[12px] leading-snug" />
          <p className="mt-1.5 text-[10px] text-white/70">♫ Original audio · {media.show ?? "yourbrand"}</p>
        </div>
        <span className="absolute left-3 top-14 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {platform === "reels" ? "Reels" : "Shorts"}
        </span>
      </Thumb>
    </div>
  );
}

function LinkedInPost({ text, clip, media, visible }: { text: string; clip: Clip; media: Media; visible: number }) {
  return (
    <div className="mx-auto max-w-[26rem] overflow-hidden rounded-xl bg-white text-[#191919] shadow-2xl">
      <div className="flex items-start gap-2.5 px-3.5 pt-3">
        <Avatar size={40} />
        <div className="min-w-0 leading-tight">
          <p className="text-[13px] font-semibold">Your Name</p>
          <p className="text-[11px] text-[#666]">Creator · Podcast host</p>
          <p className="text-[11px] text-[#666]">1h · 🌐</p>
        </div>
      </div>
      <Folded text={text} visible={visible} more="see more" className="px-3.5 py-2.5 text-[13px] leading-[1.45]" />
      <Thumb media={media} clip={clip} className="aspect-[4/5]">
        <span className="absolute inset-0 m-auto grid size-14 place-items-center rounded-full bg-black/50 text-white">
          <IconPlay size={24} className="translate-x-0.5" />
        </span>
        <span className="absolute bottom-3 left-3 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {duration(clip.end - clip.start)}
        </span>
      </Thumb>
      <div className="flex justify-around border-t border-[#e8e8e8] px-2 py-2 text-[12px] font-semibold text-[#666]">
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>🔁 Repost</span>
        <span>➤ Send</span>
      </div>
    </div>
  );
}

function XPost({ text, clip, media }: { text: string; clip: Clip; media: Media }) {
  return (
    <div className="mx-auto max-w-[26rem] rounded-2xl border border-white/15 bg-black px-4 py-3.5 text-[#e7e9ea] shadow-2xl">
      <div className="flex gap-3">
        <Avatar size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px]">
            <span className="font-bold">Your Name</span> <span className="text-[#71767b]">@yourbrand · 1m</span>
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[14px] leading-[1.4]">{text}</p>
          <Thumb media={media} clip={clip} className="mt-3 aspect-video rounded-2xl border border-white/15">
            <span className="absolute inset-0 m-auto grid size-12 place-items-center rounded-full bg-[#1d9bf0] text-white">
              <IconPlay size={20} className="translate-x-0.5" />
            </span>
            <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              {duration(clip.end - clip.start)}
            </span>
          </Thumb>
          <div className="mt-3 flex justify-between pr-6 text-[12px] text-[#71767b]">
            <span>💬 24</span>
            <span>🔁 81</span>
            <span>♡ 1.2K</span>
            <span>📊 18K</span>
          </div>
        </div>
      </div>
    </div>
  );
}
