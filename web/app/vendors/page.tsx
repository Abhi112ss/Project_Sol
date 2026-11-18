import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { VendorsView } from "@/components/vendors/vendors-view";

export default function VendorsPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <VendorsView />
    </Suspense>
  );
}

