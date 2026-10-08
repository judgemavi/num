import type { ReactNode } from "react";

export function Reveal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="reveal">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
