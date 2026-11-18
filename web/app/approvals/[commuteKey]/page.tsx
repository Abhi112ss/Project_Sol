import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CommuteDetailView } from "@/components/approvals/commute-detail-view";

export default function CommuteDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <PageSkeleton />
        </div>
      }
    >
      <CommuteDetailView />
    </Suspense>
  );
}
