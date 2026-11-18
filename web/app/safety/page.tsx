import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { SafetyWorkbenchView } from "@/components/safety/safety-workbench-view";

export default function SafetyPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <SafetyWorkbenchView />
    </Suspense>
  );
}

