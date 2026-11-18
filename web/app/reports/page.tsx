import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ReportsView } from "@/components/reports/reports-view";

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <ReportsView />
    </Suspense>
  );
}
