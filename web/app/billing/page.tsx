import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { BillingView } from "@/components/billing/billing-view";

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <BillingView />
    </Suspense>
  );
}
