import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums",
  {
    variants: {
      tone: {
        neutral: "border-border bg-secondary text-foreground",
        cobalt: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
        emerald: "border-[#99F6E4] bg-[#F0FDFA] text-[#0F766E]",
        amber: "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
        crimson: "border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C]",
        slate: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

const DOT_COLORS = {
  neutral: "bg-[#64748B]",
  cobalt: "bg-[#2563EB]",
  emerald: "bg-[#0D9488]",
  amber: "bg-[#D97706]",
  crimson: "bg-[#E11D48]",
  slate: "bg-[#94A3B8]",
} as const;

export interface StatusBadgeProps extends VariantProps<typeof badgeVariants> {
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({
  children,
  tone = "neutral",
  dot = false,
  className,
}: StatusBadgeProps) {
  const safeTone = tone ?? "neutral";
  return (
    <span className={cn(badgeVariants({ tone: safeTone }), className)}>
      {dot && (
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full shrink-0", DOT_COLORS[safeTone])}
        />
      )}
      {children}
    </span>
  );
}

export function statusToneFor(status: string): NonNullable<StatusBadgeProps["tone"]> {
  switch (status) {
    case "COMPLETED":
    case "APPROVED":
    case "AVAILABLE":
    case "ON_TIME":
    case "BOARDED":
    case "ACTIVE":
    case "RESOLVED":
    case "VERIFIED":
    case "RECONCILED":
    case "LOW":
      return "emerald";
    case "IN_PROGRESS":
    case "ASSIGNED":
    case "DRIVER_ACCEPTED":
    case "DISPATCHED":
    case "PUBLISHED":
    case "ON_TRIP":
    case "LOGIN":
    case "ISSUED":
    case "ALLOCATED":
      return "cobalt";
    case "PENDING_APPROVAL":
    case "HOLD":
    case "MAINTENANCE":
    case "DRAFT":
    case "LOGOUT":
    case "MODERATE":
    case "READY_TO_DISPATCH":
    case "NEEDS_ALLOCATION":
      return "amber";
    case "REJECTED":
    case "SUSPENDED":
    case "ABORTED":
    case "NO_SHOW":
    case "CRITICAL":
    case "OPEN":
    case "HIGH":
    case "DISPUTED":
    case "NEEDS_ATTENTION":
    case "CONFLICT":
      return "crimson";
    default:
      return "slate";
  }
}

