import type { ReactNode } from "react";

type ListCardProps = {
  label: string;
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function ListCard({ label, title, actions, children }: ListCardProps) {
  return (
    <section className="card" aria-label={label}>
      {title ? (
        <div className="card-h">
          <h2>{title}</h2>
          {actions ? <div className="head-acts">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ListGroup({ label, aside }: { label: string; aside?: ReactNode }) {
  return (
    <div className="list-group">
      <span>{label}</span>
      {aside ? <span className="list-group-aside">{aside}</span> : null}
    </div>
  );
}

export function ListRow({ simple = false, children }: { simple?: boolean; children: ReactNode }) {
  return <div className={simple ? "list-row simple" : "list-row"}>{children}</div>;
}
