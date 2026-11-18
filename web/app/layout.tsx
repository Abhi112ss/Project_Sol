import type { Metadata } from "next";
import { Figtree, Fira_Code } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-figtree",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fira-code",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SolTransit · Bridge Dispatch Control Panel",
  description:
    "Enterprise employee transportation operations, approvals, manual route dispatch, and fleet registry for Hyderabad corridors.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("h-full", figtree.variable, firaCode.variable)}>
      <body className="min-h-dvh bg-background text-foreground font-sans flex flex-col">
        {/* THESIS: Light daylight nautical bridge telemetry workbench pairing hairline-ruled operational manifests with slide-over dispatch inspection. OWN-WORLD: SolTransit Harbor Pilot (#F7F9FC paper, #FFFFFF manifest cards, #0F2544 Prussian navy ink, #2563EB Harbor Cobalt, Figtree + Fira Code tabular-nums). STORY: Dispatchers audit approval readiness, balance 4-seat cab capacity, publish ordered stop routes, and resolve delays cleanly. FIRST VIEWPORT: Persistent 224px bridge sidebar, sticky 52px context header with Dev Role switcher, compact 8-card KPI grid (4 per row), upcoming Hyderabad shifts, and live trip manifest. FORM: Dense single-line ledger rows, 440px slide-over drawers, no kickers above headings, 1px #D9E2EC borders. FINISH: Zero transition-all, strict cubic-bezier(0.23, 1, 0.32, 1), active:scale-[0.97], reduced-motion support. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
