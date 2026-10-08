import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const tints = {
  inbox: "bg-tint-inbox",
  accounts: "bg-tint-accounts",
  buckets: "bg-tint-buckets",
  plan: "bg-tint-plan",
} as const;

type SummaryStripProps = {
  tint?: keyof typeof tints;
  label: string;
  amount: ReactNode;
  hint?: ReactNode;
  facts?: ReactNode;
  extra?: ReactNode;
  illustration?: ReactNode;
};

export function SummaryStrip({ tint, label, amount, hint, facts, extra, illustration }: SummaryStripProps) {
  return (
    <Card aria-label={label} className={tint ? `border-transparent ${tints[tint]}` : undefined}>
      <CardContent className={`grid items-center gap-6 p-5 md:gap-8 md:px-6 ${illustration ? "md:grid-cols-[auto_minmax(0,1fr)_auto]" : "md:grid-cols-[auto_minmax(0,1fr)]"}`}>
        <div>
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-semibold text-muted-foreground">{label}</CardTitle>
          </CardHeader>
          {amount}
          {hint ? <p className="mt-2.5 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="max-md:col-span-1">
          {facts ? <div className="flex flex-wrap gap-y-3">{facts}</div> : null}
          {extra}
        </div>
        {illustration}
      </CardContent>
    </Card>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 border-l border-foreground/12 px-6">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
