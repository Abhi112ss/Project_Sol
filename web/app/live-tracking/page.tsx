import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { LiveTrackingView } from "@/components/live-tracking/live-tracking-view";

export default function LiveTrackingPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <LiveTrackingView />
    </Suspense>
  );
}

