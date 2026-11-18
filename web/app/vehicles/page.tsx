import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { VehiclesView } from "@/components/vehicles/vehicles-view";

export default function VehiclesPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <VehiclesView />
    </Suspense>
  );
}

