import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { EmployeesView } from "@/components/employees/employees-view";

export default function EmployeesPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <EmployeesView />
    </Suspense>
  );
}

