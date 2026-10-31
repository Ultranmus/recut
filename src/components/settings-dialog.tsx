"use client";

import { useEffect, useRef, useState } from "react";
import { maskKey, setGroqKey, useGroqKey } from "@/lib/settings";
import { useServerKey } from "@/lib/use-server-key";
import { IconCheck, IconClose, IconEye, IconEyeOff, IconKey, IconLock } from "./icons";

const LOCAL_KEYS = ["recut:demo-clips:v2", "recut:brand-memory", "recut:learnings", "recut:calendar"];

/** Reset the demo, or wipe everything this browser stores. Two-step confirm instead of a blocking dialog. */
function DataControls() {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  function resetDemo() {
    try {
      localStorage.removeItem("recut:demo-clips:v2");
    } catch {}
    setDone("Demo episode reset to its original clips and captions.");
    if (location.pathname === "/studio/demo") location.reload();
  }

  async function wipe() {
    try {
      LOCAL_KEYS.forEach((k) => localStorage.removeItem(k));
    } catch {}
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("recut");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
    setConfirming(false);
    setDone("All projects, rules, learnings and calendar posts were removed from this browser.");
    // A full reload (not router.push) so no in-memory project or store state survives the wipe.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    setTimeout(() => location.assign("/"), 900);
  }

  return (
    <section className="space-y-2.5 border-t border-hairline pt-4">
      <p className="text-sm font-medium">Your data</p>
      <p className="text-xs leading-relaxed text-fg-3">
        Projects, Brand Memory, learnings and the calendar are stored only in this browser.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-secondary h-8 text-xs" onClick={resetDemo}>
          Reset demo episode
        </button>
        {confirming ? (
          <>
            <button className="btn h-8 bg-danger text-xs text-white hover:bg-danger/90" onClick={wipe}>
              Yes, delete everything
            </button>
            <button className="btn btn-ghost h-8 text-xs" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn btn-ghost h-8 text-xs text-danger" onClick={() => setConfirming(true)}>
            Clear all my data
          </button>
        )}
      </div>
      {done ? <p className="text-xs text-success">{done}</p> : null}
    </section>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const userKey = useGroqKey();
  const serverKey = useServerKey();
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // A page kept alive in the background comes back with the dialog open but not modal; reopen it.
    if (open && d.open && !d.matches(":modal")) d.removeAttribute("open");
    if (open && !d.open) {
      d.showModal();
      setDraft("");
      setStatus(null);
    }
    if (!open && d.open) d.close();
  }, [open]);

  async function save() {
    const key = draft.trim();
    if (!key) return;
    setChecking(true);
    setStatus(null);
    try {
      // Verify directly with Groq from the browser; the key never touches our server.
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) throw new Error("Groq rejected this key.");
      if (!res.ok) throw new Error(`Couldn't verify the key (${res.status}).`);
      setGroqKey(key);
      setDraft("");
      setStatus({ kind: "ok", text: "Key verified and saved in this browser." });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "Couldn't verify the key." });
    } finally {
      setChecking(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(92vw,30rem)] rounded-2xl bg-transparent p-0 text-fg backdrop:bg-black/55 backdrop:backdrop-blur-sm"
    >
      <div className="window rise rounded-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-b from-[#2b95ff] to-[#5e5ce6] text-white">
              <IconKey size={15} />
            </span>
            <h2 className="text-[15px] font-semibold">Settings</h2>
          </div>
          <button className="btn btn-ghost h-8 w-8 p-0" onClick={onClose} aria-label="Close settings">
            <IconClose size={16} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <section className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="groq-key" className="text-sm font-medium">
                Groq API key
              </label>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent hover:underline"
              >
                Get a free key ↗
              </a>
            </div>

            {userKey ? (
              <div className="flex items-center justify-between rounded-xl border border-hairline bg-black/25 px-3.5 py-2.5">
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="size-2 rounded-full bg-success shadow-[0_0_10px] shadow-success/60" />
                  <span className="font-mono text-[13px] text-fg-2">{maskKey(userKey)}</span>
                </div>
                <button className="btn btn-ghost h-7 px-2.5 text-xs text-danger" onClick={() => setGroqKey(null)}>
                  Remove
                </button>
              </div>
            ) : null}

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="groq-key"
                  className="field pr-10 font-mono"
                  type={reveal ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={userKey ? "Replace with a new key" : "gsk_…"}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  className="absolute inset-y-0 right-0 grid w-10 place-items-center text-fg-3 hover:text-fg"
                  aria-label={reveal ? "Hide key" : "Show key"}
                >
                  {reveal ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </button>
              </div>
              <button className="btn btn-primary h-10" disabled={!draft.trim() || checking} onClick={save}>
                {checking ? "Checking…" : "Save"}
              </button>
            </div>

            {status ? (
              <p className={`flex items-center gap-1.5 text-xs ${status.kind === "ok" ? "text-success" : "text-danger"}`}>
                {status.kind === "ok" ? <IconCheck size={13} /> : null}
                {status.text}
              </p>
            ) : null}
          </section>

          <div className="flex gap-3 rounded-xl border border-hairline bg-white/[0.03] p-3.5 text-xs leading-relaxed text-fg-2">
            <IconLock size={16} className="mt-0.5 shrink-0 text-fg-3" />
            <p>
              Your key is stored only in this browser&apos;s local storage. Uploads that use it go straight from your
              browser to <span className="text-fg">api.groq.com</span>. It is never sent to or stored on our server.
            </p>
          </div>

          <div className="flex items-center justify-between border-t border-hairline pt-4 text-xs">
            <span className="text-fg-3">Active key for uploads</span>
            <span className="font-medium text-fg-2">
              {userKey ? "Your key" : serverKey ? "Server key (.env)" : serverKey === false ? "None, add one above" : "…"}
            </span>
          </div>

          <DataControls />
        </div>
      </div>
    </dialog>
  );
}
