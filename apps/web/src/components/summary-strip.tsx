import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const tints = {
  home: "bg-tint-home",
  accounts: "bg-tint-accounts",
  buckets: "bg-tint-buckets",
} as const;

type SummaryStripProps = {
  tint?: keyof typeof tints;
  label: string;
  amount: ReactNode;
  /** A line under the amount, before the hint. */
  below?: ReactNode;
  hint?: ReactNode;
  facts?: ReactNode;
  illustration?: ReactNode;
};

/**
 * The summary strip of a screen (`docs/design.md` §5). On a phone the illustration is small, in the top right corner next
 * to the hero amount.
 */
export function SummaryStrip({ tint, label, amount, below, hint, facts, illustration }: SummaryStripProps) {
  return (
    <Card aria-label={label} className={`relative ${tint ? `border-transparent ${tints[tint]}` : ""}`}>
      <CardContent className={`grid items-center gap-6 p-5 md:gap-8 md:px-6 ${illustration ? "md:grid-cols-[auto_minmax(0,1fr)_auto]" : "md:grid-cols-[auto_minmax(0,1fr)]"}`}>
        <div className={illustration ? "max-md:pr-24" : undefined}>
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-semibold text-muted-foreground">{label}</CardTitle>
          </CardHeader>
          {amount}
          {below}
          {hint ? <p className="mt-2.5 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        {facts ? (
          <div className="flex flex-wrap gap-y-3">{facts}</div>
        ) : (
          <span className="max-md:hidden" />
        )}
        {illustration ? <div className="max-md:absolute max-md:top-4 max-md:right-4">{illustration}</div> : null}
      </CardContent>
    </Card>
  );
}

/** A fact of the strip: a label and its amount. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 border-l border-foreground/12 px-6">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
