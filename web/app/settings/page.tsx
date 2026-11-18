import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { SettingsView } from "@/components/settings/settings-view";

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <SettingsView />
    </Suspense>
  );
}

