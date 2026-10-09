import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ListCardProps = {
  label: string;
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function ListCard({ label, title, actions, children }: ListCardProps) {
  return (
    <Card aria-label={label} className="gap-0 py-0">
      {title || actions ? (
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
          {title ? <CardTitle className="text-base font-bold">{title}</CardTitle> : <span />}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className="px-0">{children}</CardContent>
    </Card>
  );
}

export function ListGroup({ label, aside }: { label: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-b px-5 pt-3.5 pb-2 text-xs font-bold tracking-wider uppercase first:border-t-0">
      <span>{label}</span>
      {aside ? <span className="text-sm font-semibold tracking-normal normal-case">{aside}</span> : null}
    </div>
  );
}

export function ListRow({
  simple = false,
  current = false,
  onOpen,
  children,
}: {
  simple?: boolean;
  current?: boolean;
  onOpen?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      aria-current={current ? "true" : undefined}
      className={`flex items-center gap-3.5 border-t px-5 py-2 first:border-t-0 hover:bg-row-hover hover:[&_.list-name]:text-primary max-md:flex-wrap ${simple ? "min-h-12" : "min-h-[60px]"} ${onOpen ? "cursor-pointer" : ""} ${current ? "bg-primary-soft" : ""}`}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (event) => {
              if (event.target !== event.currentTarget) {
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

export const listName =
  "list-name min-w-0 flex-1 font-semibold [&_small]:block [&_small]:text-[13px] [&_small]:font-normal [&_small]:text-muted-foreground";
export const listAmt =
  "ml-auto text-right text-base max-md:ml-0 max-md:basis-full [&_small]:block [&_small]:text-[13px] [&_small]:font-normal [&_small]:text-muted-foreground";
