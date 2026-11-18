import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { DriversView } from "@/components/drivers/drivers-view";

export default function DriversPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <DriversView />
    </Suspense>
  );
}

