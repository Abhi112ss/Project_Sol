import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { DispatchView } from "@/components/dispatch/dispatch-view";

export default function DispatchPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <DispatchView />
    </Suspense>
  );
}

