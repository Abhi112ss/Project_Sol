import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { OverviewView } from "@/components/overview/overview-view";

export default function OverviewPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <OverviewView />
    </Suspense>
  );
}

