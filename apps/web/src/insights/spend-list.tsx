import type { InsightRow } from "@num/shared";
import { Amount } from "@/components/amount";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";

type SpendListProps = {
  title: string;
  rows: InsightRow[];
  label: (row: InsightRow) => string;
  onOpen: (row: InsightRow) => void;
};

export function SpendList({ title, rows, label, onOpen }: SpendListProps) {
  return (
    <ListCard label={title} title={title}>
      {rows.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No spending in this period.</p> : null}
      {rows.map((row) => (
        <ListRow key={`${row.kind}-${row.id ?? ""}`} simple onOpen={() => onOpen(row)}>
          <span className={listName}>{label(row)}</span>
          <span className={listAmt}>
            <Amount value={row.amount} />
          </span>
        </ListRow>
      ))}
    </ListCard>
  );
}
