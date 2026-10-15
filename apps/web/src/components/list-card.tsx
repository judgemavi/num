import type { ReactElement, ReactNode } from "react";
import { cn } from "cn";
import { Slot } from "radix-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions } from "@/components/ui/item";

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

/**
 * The header row of a group. A hairline is above it (not above the first group of the card) and one is under it. The
 * first row of the group has no hairline of its own. The header has the same height with and without a total.
 */
export function ListGroup({ label, aside }: { label: string; aside?: ReactNode }) {
  return (
    <div className="list-group flex min-h-11 items-center justify-between gap-3 border-t border-b px-5 py-2 text-xs font-bold tracking-wider uppercase [:first-child>&:first-child]:border-t-0">
      <span>{label}</span>
      {aside ? <span className="text-sm font-semibold tracking-normal normal-case">{aside}</span> : null}
    </div>
  );
}

/** The one empty state of a list: one quiet line. */
export function ListEmpty({ children }: { children: ReactNode }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{children}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

// A simple row is 48px high. A dense row is 36px high, with a lighter hairline. On a touch screen it is 44px high.
const rowSize = {
  default: "min-h-[60px] py-2",
  simple: "min-h-12 py-0.5",
  dense: "min-h-9 py-1 border-border/50 pointer-coarse:min-h-11",
} as const;

// The target of the row covers the whole row. The other controls of the row are above it (`ItemActions`).
// The menu of a row is in the top-right corner of the row. It has no column: a row with a menu has more space at the
// top, and the content of the row uses the full width. The hit area stays above the content of the row: 28px with a
// mouse, 44px on a touch screen (that row has more space at the top).
const rowTarget = "absolute inset-0 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset";

/**
 * A row that opens has a target: `onOpen` (it opens an editor or does an action) or `link` (a `Link` with no children
 * that goes to a page). `label` is the accessible name of the target.
 */
type RowTarget = { label: string; onOpen?: () => void; link?: ReactElement } | { label?: undefined; onOpen?: undefined; link?: undefined };

/**
 * A row of a ListCard (`docs/design.md` §6), built on the shadcn `Item`. The target of a row that opens is a button or
 * a link that covers the row. The row is a size container: the columns follow the width of the row, not of the screen.
 */
export function ListRow({
  size = "default",
  current = false,
  label,
  onOpen,
  link,
  menu,
  children,
}: RowTarget & {
  size?: keyof typeof rowSize;
  current?: boolean;
  /** The `RowMenu` of the row. */
  menu?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Item
      aria-current={current ? "true" : undefined}
      className={cn(
        "@container relative flex-wrap gap-3.5 rounded-none border-0 border-t border-border px-5 text-[15px] first:border-t-0 hover:bg-row-hover hover:[&_.list-name]:text-primary [.list-group+&]:border-t-0",
        rowSize[size],
        menu ? "pt-9 pointer-fine:pt-6" : null,
        current && "bg-primary-soft",
      )}
    >
      {onOpen ? <button type="button" aria-label={label} className={rowTarget} onClick={onOpen} /> : null}
      {link ? (
        <Slot.Root aria-label={label} className={rowTarget}>
          {link}
        </Slot.Root>
      ) : null}
      {children}
      {menu ? (
        <ItemActions className="absolute -top-2 right-1.5 z-10 pointer-fine:-top-1 pointer-fine:right-3.5 *:pointer-fine:size-7">{menu}</ItemActions>
      ) : null}
    </Item>
  );
}

// Secondary lines (`<small>`) are 13px, normal weight and muted. The muted colour has a low priority, thus a line with
// its own colour class (example: `text-attn`) keeps that colour.
const smallLines = "[&_small]:block [&_small]:text-[13px] [&_small]:font-normal [:where(&)_small]:text-muted-foreground";

export const listName = `list-name min-w-0 flex-1 font-semibold ${smallLines}`;

// The columns after the name have fixed widths. Thus the columns of all rows in a card line up, also when the amounts
// and their secondary lines have different lengths. In a narrow row (less than 42rem) the middle column takes a full
// line below the name. The amount column does not show: `ListTitle` puts the amount at the end of line 1.
export const listMid = "w-40 shrink-0 @max-2xl:order-1 @max-2xl:basis-full";
export const listAmt = `w-40 shrink-0 text-right text-base @max-2xl:hidden ${smallLines}`;

/**
 * Line 1 of a row with an amount column: the name (it truncates) and its badges. In a narrow row the amount goes at
 * the end of this line, at the right edge of the row. The secondary lines of the amount go on line 2 of the name.
 */
export function ListTitle({ name, badges, amount, attention = false }: { name: ReactNode; badges?: ReactNode; amount: ReactNode; attention?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{name}</span>
      {badges}
      <span className={cn("ml-auto hidden shrink-0 pl-2 whitespace-nowrap @max-2xl:inline", attention && "text-attn")}>{amount}</span>
    </span>
  );
}
