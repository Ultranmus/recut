import type { Metadata } from "next";
import Link from "next/link";
import { IconEye, IconPlay, IconFilm, IconScissors, IconSparkle, IconText, IconUpload, IconWave } from "@/components/icons";
import { TopBar } from "@/components/top-bar";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Everything Recut does: AI clip finding, platform captions, voice briefs with Wispr Flow, brand memory, a content calendar with AI auto-scheduling, and Google Calendar sync.",
  alternates: { canonical: "/features" },
};

type Feature = {
  id: string;
  icon: React.ReactNode;
  title: string;
  summary: string;
  points: string[];
  say?: string[];
};

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);
const CalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
const BrainIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 5a3 3 0 0 0-5.8-1A3 3 0 0 0 3 7a3 3 0 0 0 .5 5.5A3 3 0 0 0 6 18a3 3 0 0 0 6 .5V5zM12 5a3 3 0 0 1 5.8-1A3 3 0 0 1 21 7a3 3 0 0 1-.5 5.5A3 3 0 0 1 18 18a3 3 0 0 1-6 .5" />
  </svg>
);
const ChartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);
const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const FEATURES: Feature[] = [
  {
    id: "upload",
    icon: <IconUpload size={18} />,
    title: "Upload and transcribe",
    summary: "Drop in a podcast or video, up to 1 GB. Recut extracts the audio in your browser and transcribes it with Groq Whisper.",
    points: [
      "MP3, M4A, WAV, MP4, MOV and WebM",
      "A timestamp on every word, so clips and captions line up exactly",
      "Long episodes are split at natural pauses and processed in parallel",
      "Or try the ready-made NASA demo episode, no key needed",
    ],
  },
  {
    id: "clips",
    icon: <IconSparkle size={18} />,
    title: "AI clip finder",
    summary: "Recut picks the 5 to 8 moments most worth posting and tells you exactly why each one works.",
    points: [
      "Every clip has a score, start and end time, a hook line and a reason",
      "Your past results re-rank clips, so what worked before rises to the top",
      "A full-episode timeline shows where every clip sits",
    ],
  },
  {
    id: "trim",
    icon: <IconScissors size={18} />,
    title: "Preview and trim",
    summary: "Clips play straight from your original file, so nothing is cut until you're ready.",
    points: [
      "A waveform scrubber you can click or drag to seek",
      "Drag the trim handles; they snap to word edges so a clip never ends mid-word",
      "Click a handle, then use ← → to move it one word at a time",
      "Make your own clip from any line in the transcript",
    ],
    say: ["Trim it so it ends 5 seconds earlier", "Make a clip from 5:00 to 5:40", "Change the hook to Meet NASA's Gateway"],
  },
  {
    id: "captions",
    icon: <IconText size={18} />,
    title: "A caption for every platform",
    summary: "Each clip gets its own caption for Instagram Reels, LinkedIn, X and YouTube Shorts, written for that platform's length and tone.",
    points: [
      "Reels: hook-first, casual, a few hashtags. LinkedIn: insight, takeaway and a question",
      "X: one punchy idea under 280 characters. Shorts: a searchable title",
      "Shows where each feed cuts the caption with “…more”, plus a live character count",
      "Edit any caption directly; Recut learns from your edits",
    ],
    say: ["Write it for LinkedIn and X, keep it curious", "Rewrite the Reels caption, more playful"],
  },
  {
    id: "preview",
    icon: <IconEye size={18} />,
    title: "Preview and post",
    summary: "See exactly how the post will look in the Reels, LinkedIn, X or Shorts feed, then post it in one click.",
    points: [
      "X and LinkedIn open with your caption already filled in",
      "Instagram and YouTube copy the caption and open the upload page",
      "On phones, share straight to any app with the system share sheet",
    ],
    say: ["Show me how the LinkedIn post looks"],
  },
  {
    id: "video",
    icon: <IconFilm size={18} />,
    title: "9:16 video export",
    summary: "Export a vertical 1080×1920 video with animated, word-by-word captions, rendered right in your browser.",
    points: [
      "Caption styles: Pop, Box and Minimal, in five accent colours",
      "Size, position (top, middle, bottom), all caps and a background box",
      "Show or hide the hook line; download subtitles as an SRT file",
    ],
    say: ["Make the captions big, at the top, with a background box", "Export the video"],
  },
  {
    id: "voice",
    icon: <MicIcon />,
    title: "Talk to your studio",
    summary:
      "Brief Recut like you'd brief a video editor, by voice with Wispr Flow or the built-in recorder. It understands how people actually talk.",
    points: [
      "Ignores filler words (um, uh, like, you know)",
      "Applies self-corrections: “LinkedIn, no wait, X” means X",
      "Sets aside tangents (“anyway my coffee machine broke”) and shows what it set aside",
      "Shows what it understood, then does it, with live status for every step",
      "Anything you can do with a click, you can ask for",
    ],
    say: [
      "Open the Gateway clip",
      "Post the Gateway clip on Tuesday at 9am",
      "Actually move it to Wednesday 6pm",
      "Accept all the suggestions",
      "Show me the transcript",
    ],
  },
  {
    id: "brand",
    icon: <BrainIcon />,
    title: "Brand memory",
    summary: "Lasting rules that every caption follows, learned from what you say and the edits you make.",
    points: [
      "Say a rule once (“never use emojis”) and it applies everywhere",
      "Edit a caption and Recut works out the reusable rule behind it",
      "Rule changes are proposed as before/after rewrites you accept or keep",
      "Simple rules like emojis and hashtags are also enforced in code",
    ],
    say: ["From now on, never use emojis", "Always say NASA's Gateway, not just Gateway", "Forget the hashtag rule"],
  },
  {
    id: "calendar",
    icon: <CalendarIcon />,
    title: "Content calendar",
    summary: "A weekly calendar for every post, across all your episodes.",
    points: [
      "Schedule from a clip, from the calendar, or by voice",
      "Pick the day, time (12-hour, past times blocked) and platforms",
      "Drag a post to another day; remove it with one click",
      "Export the week as an .ics file for any calendar app",
    ],
    say: ["Remove the Gateway post", "Schedule the Cold War clip on Friday at 6pm"],
  },
  {
    id: "auto-schedule",
    icon: <IconSparkle size={18} />,
    title: "Auto-schedule with AI",
    summary: "Pick your clips and Recut plans the week: which day, what time and which platforms for each one.",
    points: [
      "Best clips first, at times that suit each platform (LinkedIn mornings, Reels evenings)",
      "Choose 1, 2 or 3 posts a day; clashes with existing posts are avoided",
      "Every slot comes with a reason, and you review the plan before it's added",
    ],
    say: ["Auto-schedule my top four clips, two a day"],
  },
  {
    id: "google-calendar",
    icon: <CalendarIcon />,
    title: "Google Calendar sync",
    summary: "Connect once and every scheduled post appears in your Google Calendar, with the captions to publish and a reminder.",
    points: [
      "New posts, moves and removals sync automatically",
      "Recut only touches the events it creates; nothing else in your calendar",
      "Sign-in happens in your browser; the access token never reaches our server",
      "Prefer not to connect? Add single posts with one click, or export .ics",
    ],
  },
  {
    id: "results",
    icon: <ChartIcon />,
    title: "Learns from your results",
    summary: "Tell Recut how a post did, and it learns what works for your audience.",
    points: [
      "Log a result by voice or with “How did it do?” on any calendar post",
      "Each result becomes a learning in Brand memory",
      "Learnings re-rank this episode's clips right away, and shape the clips picked from future uploads",
    ],
    say: ["The Gateway clip got forty thousand views on Reels", "The Cold War one totally flopped"],
  },
  {
    id: "privacy",
    icon: <ShieldIcon />,
    title: "Private by default",
    summary: "No accounts and no database. Your projects stay in your own browser.",
    points: [
      "Projects, rules, calendar and learnings are saved only in this browser",
      "Use the shared AI key, or add your own free Groq key in Settings",
      "Installable as an app, and works offline for episodes you've opened",
      "Clear everything at any time from Settings",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
        <div className="rise mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-hairline bg-white/[0.04] px-3 py-1 text-xs text-fg-2">
            <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px] shadow-accent" />
            Everything Recut does
          </p>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
            <span className="text-gradient">From one long episode</span>
            <br />
            to a week of posts
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-fg-2">
            Find the clips, write the captions, plan the calendar and learn from results. Click through, or just say what you want.
          </p>
        </div>

        <nav aria-label="Features" className="mt-10 flex flex-wrap justify-center gap-1.5">
          {FEATURES.map((f) => (
            <a
              key={f.id}
              href={`#${f.id}`}
              className="rounded-full border border-hairline bg-white/[0.03] px-3 py-1.5 text-xs text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
            >
              {f.title}
            </a>
          ))}
        </nav>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {FEATURES.map((f) => (
            <section key={f.id} id={f.id} className="glass scroll-mt-20 rounded-2xl p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2b95ff]/25 to-[#bf5af2]/25 text-fg ring-1 ring-white/10">
                  {f.icon}
                </span>
                <h2 className="text-[17px] font-semibold tracking-tight">{f.title}</h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-fg-2">{f.summary}</p>
              <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-fg-2">
                {f.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-accent" />
                    {p}
                  </li>
                ))}
              </ul>
              {f.say ? (
                <div className="mt-4 border-t border-hairline pt-3.5">
                  <p className="label mb-2 flex items-center gap-1.5">
                    <MicIcon /> Try saying
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {f.say.map((s) => (
                      <span key={s} className="rounded-lg bg-accent/10 px-2.5 py-1 text-[12px] text-fg ring-1 ring-accent/20">
                        “{s}”
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ))}
        </div>

        <section className="glass mt-12 rounded-2xl p-6 text-center sm:p-8">
          <h2 className="font-display text-2xl font-semibold tracking-tight">See it for yourself</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg-2">Open the demo episode, no key needed, or watch the two-minute walkthrough.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/studio/demo" className="btn btn-primary">
              <IconWave size={15} /> Try the demo episode
            </Link>
            <a href="/demo/recut-demo.mp4" className="btn btn-secondary">
              <IconPlay size={15} /> Watch the walkthrough
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
