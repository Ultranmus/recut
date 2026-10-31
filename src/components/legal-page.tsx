import Link from "next/link";
import { AUTHOR } from "@/lib/site";
import { LinkedInIcon } from "./icons";
import { TopBar } from "./top-bar";

/** Shared layout for the Privacy Policy and Terms: a readable single column in the app's style. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-12 sm:px-6">
        <p className="label">Recut</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-fg-3">Last updated {updated}</p>
        <div className="legal mt-8 space-y-4 text-[15px] leading-relaxed text-fg-2">{children}</div>
        <p className="mt-12 border-t border-hairline pt-6 text-sm text-fg-3">
          <Link href="/privacy" className="hover:text-accent">
            Privacy Policy
          </Link>
          {" · "}
          <Link href="/terms" className="hover:text-accent">
            Terms of Service
          </Link>
          {" · "}
          <Link href="/" className="hover:text-accent">
            Back to Recut
          </Link>
          <span className="mt-2 block">
            Built by{" "}
            <a href={AUTHOR.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg-2 hover:text-accent">
              {AUTHOR.name} <LinkedInIcon />
            </a>
          </span>
        </p>
      </main>
    </>
  );
}
