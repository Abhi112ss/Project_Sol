import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ApprovalsView } from "@/components/approvals/approvals-view";

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <ApprovalsView />
    </Suspense>
  );
}

