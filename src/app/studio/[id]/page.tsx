import { Suspense } from "react";
import { Studio, StudioSkeleton } from "@/components/studio/studio";

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
