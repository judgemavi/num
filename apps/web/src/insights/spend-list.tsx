import type { InsightRow } from "@num/shared";
import type { ReactNode } from "react";
import { Amount } from "@/components/amount";
import { useBookCurrency } from "@/editors/lookups";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";
import { rowKey, type SliceColor } from "@/insights/slice-colors";
import { formatMoney } from "@/money";

type SpendListProps = {
  title: string;
  rows: InsightRow[];
  label: (row: InsightRow) => string;
  onOpen: (row: InsightRow) => void;
  colors?: Map<string, SliceColor>;
  actions?: ReactNode;
};

export function SpendList({ title, rows, label, onOpen, colors, actions }: SpendListProps) {
  const currency = useBookCurrency();
  return (
    <ListCard label={title} title={title} actions={actions}>
      {rows.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No spending in this period.</p> : null}
      {rows.map((row) => {
        const color = colors?.get(rowKey(row));
        return (
          <ListRow key={rowKey(row)} simple onOpen={() => onOpen(row)}>
            {colors ? (
              <i
                aria-hidden="true"
                className={`block size-2.5 shrink-0 rounded-full ${color ? color.dot : "bg-sunken"}`}
                style={color ? { opacity: color.opacity } : undefined}
              />
            ) : null}
            <span className={listName}>{label(row)}</span>
            <span className={listAmt}>
              <Amount minor={row.amount} />
              {row.kind === "uncategorized" ? <small>In {formatMoney(currency, row.inflow ?? 0)}</small> : null}
            </span>
          </ListRow>
        );
      })}
    </ListCard>
  );
}
