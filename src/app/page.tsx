import Link from "next/link";
import { Features, HomeOptions, RecentProjects } from "@/components/home-options";
import { LinkedInIcon } from "@/components/icons";
import { TopBar } from "@/components/top-bar";
import { AUTHOR } from "@/lib/site";

export default function Home() {
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
        <div className="rise mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-hairline bg-white/[0.04] px-3 py-1 text-xs text-fg-2">
            <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px] shadow-accent" />
            Podcast & video repurposing
          </p>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-[-0.03em] sm:text-6xl">
            <span className="text-gradient">One long episode.</span>
            <br />
            <span className="text-fg">A week of shorts.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-fg-2 sm:text-base">
            Upload a podcast or video. Recut transcribes it, finds the moments worth sharing, and writes a
            caption for Instagram Reels, LinkedIn, X and YouTube Shorts.
          </p>
        </div>

        <div className="mt-12 sm:mt-14">
          <HomeOptions />
        </div>
        <RecentProjects />
        <Features />
      </main>
      <footer className="border-t border-hairline py-6 text-center text-xs text-fg-3">
        Demo audio: &ldquo;Houston We Have a Podcast&rdquo;, courtesy of NASA. Not affiliated with or endorsed by NASA.
        <span className="mt-2 block">
          <Link href="/privacy" className="hover:text-accent">
            Privacy Policy
          </Link>
          {" · "}
          <Link href="/terms" className="hover:text-accent">
            Terms of Service
          </Link>
          {" · "}
          <a href="https://github.com/Ultranmus/recut" className="hover:text-accent">
            GitHub
          </a>
        </span>
        <span className="mt-2 block">
          Built by{" "}
          <a href={AUTHOR.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-fg-2 hover:text-accent">
            {AUTHOR.name}
            <LinkedInIcon />
          </a>
        </span>
      </footer>
    </>
  );
}
