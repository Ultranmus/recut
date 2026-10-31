import { Suspense } from "react";
import type { Metadata } from "next";
import { Studio, StudioSkeleton } from "@/components/studio/studio";

// Uploaded projects live in the visitor's browser, so only the demo is worth indexing.
export async function generateMetadata({ params }: PageProps<"/studio/[id]">): Promise<Metadata> {
  const { id } = await params;
  return id === "demo"
    ? { title: "Demo: Apollo 11 to Now", alternates: { canonical: "/studio/demo" } }
    : { title: "Studio", robots: { index: false, follow: false } };
}

export default function StudioPage({ params }: PageProps<"/studio/[id]">) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <StudioLoader params={params} />
    </Suspense>
  );
}

async function StudioLoader({ params }: { params: PageProps<"/studio/[id]">["params"] }) {
  const { id } = await params;
  return <Studio id={id} />;
}
