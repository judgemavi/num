import type { InsightGroupRow, InsightRow } from "@num/shared";
import type { ReactNode } from "react";
import { Amount } from "@/components/amount";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";
import { useBookCurrency } from "@/editors/lookups";
import { rowKey, type SliceColor } from "@/insights/spend-arcs";
import { formatMoney } from "@/money";

type CategorySpendListProps = {
  title: string;
  groups: InsightGroupRow[];
  colors: Map<string, SliceColor>;
  groupName: (row: InsightRow) => string;
  categoryName: (row: InsightRow) => string;
  onOpenGroup: (row: InsightGroupRow) => void;
  onOpenCategory: (row: InsightRow) => void;
  actions: ReactNode;
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

/** Groups with their categories under them. */
export function CategorySpendList({ title, groups, colors, groupName, categoryName, onOpenGroup, onOpenCategory, actions }: CategorySpendListProps) {
  const currency = useBookCurrency();
  return (
    <ListCard label={title} title={title} actions={actions}>
      {groups.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No spending in this period.</p> : null}
      {groups.map((group) => (
        <div key={rowKey(group)}>
          <ListRow simple onOpen={() => onOpenGroup(group)}>
            <Dot color={colors.get(rowKey(group))} />
            <span className={listName}>{groupName(group)}</span>
            <span className={listAmt}>
              <Amount value={group.amount} />
              {group.kind === "uncategorized" ? <small>In {formatMoney(currency, group.inflow ?? 0)}</small> : null}
            </span>
          </ListRow>
          {group.categories.map((category) => (
            <ListRow key={rowKey(category)} simple onOpen={() => onOpenCategory(category)}>
              <span className="w-5 shrink-0" aria-hidden="true" />
              <Dot color={colors.get(rowKey(category))} />
              <span className={listName}>{categoryName(category)}</span>
              <span className={listAmt}>
                <Amount value={category.amount} />
              </span>
            </ListRow>
          ))}
        </div>
      ))}
    </ListCard>
  );
}
