import Link from "next/link";
import { Logo } from "./top-bar";

/** Full-page message for the not-found, error and offline states, in the app's glass style. */
export function StatusScreen({
  code,
  title,
  body,
  tone = "neutral",
  children,
}: {
  code: string;
  title: string;
  body: React.ReactNode;
  tone?: "neutral" | "danger";
  children?: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="glass rise w-full max-w-md rounded-2xl p-7 text-center sm:p-9">
        <Link href="/" className="mx-auto inline-flex items-center gap-2.5 transition-opacity hover:opacity-85">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Recut</span>
        </Link>
        <p className={`mt-7 font-mono text-xs uppercase tracking-[0.18em] ${tone === "danger" ? "text-danger" : "text-fg-3"}`}>{code}</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-3 text-sm leading-relaxed text-fg-2">{body}</div>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">{children}</div>
      </div>
    </main>
  );
}
