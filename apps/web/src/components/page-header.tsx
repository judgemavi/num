import type { ReactNode } from "react";

type PageHeaderProps = {
  kicker: string;
  title: string;
  actions?: ReactNode;
};

export function PageHeader({ kicker, title, actions }: PageHeaderProps) {
  return (
    <div className="page-head">
      <div>
        <p className="sub">{kicker}</p>
        <h1 className="title display">{title}</h1>
      </div>
      {actions ? <div className="head-acts">{actions}</div> : null}
    </div>
  );
}
