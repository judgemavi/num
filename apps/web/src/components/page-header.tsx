import type { ReactNode } from "react";

type PageHeaderProps = {
  /** The line above the title. A screen can give a component that loads the line by itself. */
  kicker: ReactNode;
  title: string;
  actions?: ReactNode;
  /** Links to the views of the page, under the title. */
  tabs?: ReactNode;
};

export function PageHeader({ kicker, title, actions, tabs }: PageHeaderProps) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 min-h-5 text-sm font-medium text-muted-foreground">{kicker}</p>
          <h1 className="font-display text-4xl leading-none font-extrabold uppercase [font-stretch:72%] max-md:text-[36px]">{title}</h1>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {tabs}
    </div>
  );
}
