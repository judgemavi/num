import type { InsightGroupRow } from "@num/shared";
import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";
import { Amount } from "@/components/amount";
import { ListCard, ListEmpty, ListRow, listName } from "@/components/list-card";
import { useBookCurrency } from "@/editors/lookups";
import type { SliceColor } from "@/home/spending/spend-arcs";
import { formatMoney } from "@/money";

/** One row of the spending list: a group or a category. `inflow` is the money in of the uncategorized lines. */
export type SpendListRow = {
  key: string;
  name: string;
  amount: number;
  inflow: number | null;
  increase: InsightGroupRow["categories"][number]["increase"];
  color: SliceColor | undefined;
  current: boolean;
  onOpen: () => void;
};

function Dot({ color }: { color: SliceColor | undefined }) {
  return (
    <i
      aria-hidden="true"
      className="block size-2.5 shrink-0 rounded-full bg-sunken"
      style={color ? { backgroundColor: color.value } : undefined}
    />
  );
}

/** A dense list of groups or categories, each with the dot of its slice and its amount. */
export function CategorySpendList({ title, rows, actions }: { title: string; rows: SpendListRow[]; actions: ReactNode }) {
  const currency = useBookCurrency();
  return (
    <ListCard label={title} title={title} actions={actions}>
      {rows.length === 0 ? <ListEmpty>No spending in this period.</ListEmpty> : null}
      {rows.map((row) => (
        <ListRow key={row.key} size="dense" current={row.current} label={row.name} onOpen={row.onOpen}>
          <Dot color={row.color} />
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`${listName} basis-auto truncate`}>
              {row.name}
              {row.inflow === null ? null : <span className="text-[13px] font-normal text-muted-foreground"> · In {formatMoney(currency, row.inflow)}</span>}
            </span>
            {row.increase ? (
              <Badge variant="butter">
                <TrendingUp aria-hidden="true" />
                Up {formatMoney(currency, row.increase.delta)} from {formatMoney(currency, row.increase.median)}
              </Badge>
            ) : null}
          </span>
          <Amount value={row.amount} className="shrink-0 text-right" />
        </ListRow>
      ))}
    </ListCard>
  );
}
