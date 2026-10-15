import type { ReactNode } from "react";
import { Amount } from "@/components/amount";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { useBookCurrency } from "@/editors/lookups";
import type { SliceColor } from "@/home/spending/spend-arcs";
import { formatMoney } from "@/money";

/** One row of the spending list: a group or a category. `inflow` is the money in of the uncategorized lines. */
export type SpendListRow = {
  key: string;
  name: string;
  amount: number;
  inflow: number | null;
  color: SliceColor | undefined;
  current: boolean;
  onOpen: () => void;
};

function Dot({ color }: { color: SliceColor | undefined }) {
  return (
    <i
      aria-hidden="true"
      className={`block size-2.5 shrink-0 rounded-full ${color ? color.dot : "bg-sunken"}`}
      style={color ? { opacity: color.opacity } : undefined}
    />
  );
}

/** A dense list of groups or categories, each with the dot of its slice and its amount. */
export function CategorySpendList({ title, rows, actions }: { title: string; rows: SpendListRow[]; actions: ReactNode }) {
  const currency = useBookCurrency();
  return (
    <ListCard label={title} title={title} actions={actions}>
      {rows.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No spending in this period.</p> : null}
      {rows.map((row) => (
        <ListRow key={row.key} size="dense" current={row.current} onOpen={row.onOpen}>
          <Dot color={row.color} />
          <span className={listName}>
            {row.name}
            {row.inflow === null ? null : <span className="text-[13px] font-normal text-muted-foreground"> · In {formatMoney(currency, row.inflow)}</span>}
          </span>
          <Amount value={row.amount} className="shrink-0 text-right" />
        </ListRow>
      ))}
    </ListCard>
  );
}
