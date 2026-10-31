"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useGroqKey } from "@/lib/settings";
import { useServerKey } from "@/lib/use-server-key";
import { IconSettings } from "./icons";
import { SettingsDialog } from "./settings-dialog";

export function Logo() {
  return (
    <span className="relative grid size-7 place-items-center overflow-hidden rounded-[9px] bg-gradient-to-br from-[#2b95ff] via-[#5e5ce6] to-[#bf5af2] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_-4px_rgba(94,92,230,0.7)]">
      <svg viewBox="0 0 24 24" className="size-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <path d="M5 9v6M9 6v12M13 9.5v5M17 7.5v9" />
        <path d="M19.5 12h.01" strokeWidth={3} />
      </svg>
    </span>
  );
}

const OPEN_SETTINGS = "recut:open-settings";

/** Lets any component open the settings sheet without prop drilling. */
export function openSettings() {
  window.dispatchEvent(new Event(OPEN_SETTINGS));
}

export function TopBar({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_SETTINGS, show);
    return () => window.removeEventListener(OPEN_SETTINGS, show);
  }, []);
  const userKey = useGroqKey();
  const serverKey = useServerKey();
  const keyLabel = userKey ? "Your key" : serverKey ? "Server key" : serverKey === false ? "No key" : null;

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-[rgba(14,14,17,0.72)] backdrop-blur-2xl backdrop-saturate-150">
      <div className="mx-auto flex h-13 max-w-[1600px] items-center gap-2 px-3 sm:gap-4 sm:px-5">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg pr-1 transition-opacity hover:opacity-85">
          <Logo />
          <span className={`text-[15px] font-semibold tracking-tight ${children ? "max-sm:hidden" : ""}`}>Recut</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center">{children}</div>
        {keyLabel ? (
          <button
            onClick={() => setOpen(true)}
            className="hidden items-center gap-2 rounded-full border border-hairline bg-white/[0.04] px-3 py-1 text-xs text-fg-2 transition-colors hover:bg-white/[0.08] md:flex"
          >
            <span className={`size-1.5 rounded-full ${userKey || serverKey ? "bg-success" : "bg-warning"}`} />
            {keyLabel}
          </button>
        ) : null}
        <button className="btn btn-ghost h-8 w-8 p-0" onClick={() => setOpen(true)} aria-label="Settings">
          <IconSettings size={17} />
        </button>
      </div>
      <SettingsDialog open={open} onClose={() => setOpen(false)} />
    </header>
  );
}
