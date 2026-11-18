import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { TripDetailView } from "@/components/trips/trip-detail-view";

export default function TripDetailPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <TripDetailView />
    </Suspense>
  );
}

