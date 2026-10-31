import Link from "next/link";
import type { Metadata } from "next";
import { StatusScreen } from "@/components/status-screen";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <StatusScreen
      code="404"
      title="This page isn't here"
      body="The link may be old, or the project was made in another browser. Projects are saved only in the browser that created them."
    >
      <Link href="/" className="btn btn-primary">
        Go home
      </Link>
      <Link href="/studio/demo" className="btn btn-secondary">
        Open the demo
      </Link>
    </StatusScreen>
  );
}
