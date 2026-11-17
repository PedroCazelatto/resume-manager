import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

/** The status colours: green for good, amber for needs attention, red for bad, grey for neutral (F35). */
export type Tone = "green" | "amber" | "red" | "neutral";

const TONE_STYLE: Record<Tone, string> = {
  green: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  red: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  neutral: "bg-muted text-muted-foreground",
};

/** A status shown as a small coloured badge. */
export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <Badge variant="secondary" className={TONE_STYLE[tone]}>
      {children}
    </Badge>
  );
}
