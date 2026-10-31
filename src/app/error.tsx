"use client";

import Link from "next/link";
import { useEffect } from "react";
import { StatusScreen } from "@/components/status-screen";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <StatusScreen
      code="Something broke"
      tone="danger"
      title="Recut hit an unexpected error"
      body={
        <>
          Your projects, brand rules and calendar are saved in this browser, so nothing is lost. Try again, or go back
          home.
          {digest ? <span className="mt-3 block font-mono text-xs text-fg-3">Reference: {digest}</span> : null}
        </>
      }
    >
      <button className="btn btn-primary" onClick={() => retry()}>
        Try again
      </button>
      <Link href="/" className="btn btn-secondary">
        Go home
      </Link>
    </StatusScreen>
  );
}
