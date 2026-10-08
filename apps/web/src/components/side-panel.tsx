import type { ReactNode } from "react";

type SidePanelProps = {
  title: string;
  text?: string;
  children?: ReactNode;
  action?: ReactNode;
};

export function SidePanel({ title, text, children, action }: SidePanelProps) {
  return (
    <section className="card panel">
      <h2>{title}</h2>
      {text ? <p>{text}</p> : null}
      {children}
      {action}
    </section>
  );
}
