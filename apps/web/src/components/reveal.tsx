import type { ReactNode } from "react";

export function Reveal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-[14px] border border-border bg-background p-3.5">
      <h3 className="text-sm font-bold">{title}</h3>
      {children}
    </section>
  );
}
