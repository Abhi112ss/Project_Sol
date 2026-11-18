import { AlertCircle, Inbox } from "lucide-react";
import { Button } from "./button";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
        <Inbox className="size-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function QueryErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-sm text-[#9F1239]"
    >
      <div className="flex items-center gap-2.5">
        <AlertCircle className="size-4 shrink-0 text-[#E11D48]" aria-hidden="true" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

