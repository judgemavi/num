import type { InsightGroupRow, InsightRow } from "@num/shared";
import type { ReactNode } from "react";
import { Amount } from "@/components/amount";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";
import { rowKey, type SliceColor } from "@/insights/spend-arcs";

type CategorySpendListProps = {
  group: InsightGroupRow;
  colors: Map<string, SliceColor>;
  groupName: string;
  categoryName: (row: InsightRow) => string;
  onOpenGroup: () => void;
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

/** The selected group with its categories. */
export function CategorySpendList({ group, colors, groupName, categoryName, onOpenGroup, onOpenCategory, actions }: CategorySpendListProps) {
  return (
    <ListCard label={groupName} title={groupName} actions={actions}>
      <ListRow simple onOpen={onOpenGroup}>
        <Dot color={colors.get(rowKey(group))} />
        <span className={listName}>All of {groupName}</span>
        <span className={listAmt}>
          <Amount value={group.amount} />
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
    </ListCard>
  );
}
