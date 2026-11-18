import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { TripsView } from "@/components/trips/trips-view";

export default function TripsPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <TripsView />
    </Suspense>
  );
}

