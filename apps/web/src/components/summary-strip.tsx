import type { ReactNode } from "react";

type SummaryStripProps = {
  tint: "inbox" | "accounts" | "buckets" | "plan";
  label: string;
  amount: ReactNode;
  hint?: ReactNode;
  facts?: ReactNode;
  extra?: ReactNode;
  illustration: ReactNode;
};

export function SummaryStrip({ tint, label, amount, hint, facts, extra, illustration }: SummaryStripProps) {
  return (
    <section className={`card stat tint-${tint}`} aria-label={label}>
      <div>
        <p className="lbl">{label}</p>
        {amount}
        {hint ? <p className="hint">{hint}</p> : null}
      </div>
      <div>
        {facts ? <div className="facts">{facts}</div> : null}
        {extra}
      </div>
      {illustration}
    </section>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <span>{label}</span>
      {children}
    </div>
  );
}
