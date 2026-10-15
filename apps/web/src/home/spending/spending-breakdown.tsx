import { defaultInsightListMode, insightListModes, type InsightGroupRow, type InsightRow, type TransactionFilter } from "@num/shared";
import { useNavigate } from "@tanstack/react-router";
import { choiceIn } from "@/components/choice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCategoryNames, useGroupNames } from "@/editors/lookups";
import { CategorySpendList } from "@/home/spending/category-spend-list";
import { monthTitle } from "@/home/spending/format";
import { rowKey, spendArcs, type Arc } from "@/home/spending/spend-arcs";
import { SpendDonut } from "@/home/spending/spend-donut";
import { useSpendingReport, useSpendingSearch } from "@/home/spending/use-spending";

function idOrNone(row: InsightRow) {
  return row.kind === "none" ? "none" : (row.id ?? undefined);
}

/** The arcs, the selected group and the actions of the spending donut. The donut card and the list call this hook. */
function useSpendSelection() {
  const navigate = useNavigate();
  const { data, search, patchSearch } = useSpendingReport();
  const groupNames = useGroupNames();
  const categoryNames = useCategoryNames();
  const category = search.category ?? null;
  const { arcs, colors } = spendArcs(data.groups);
  const categoryGroup = category ? data.groups.find((group) => group.categories.some((row) => row.id === category)) : undefined;
  const selectedGroup = categoryGroup ?? (search.group ? data.groups.find((group) => idOrNone(group) === search.group) : undefined);
  const selectedKey = selectedGroup ? `${selectedGroup.kind}-${selectedGroup.id ?? ""}` : null;

  const groupName = (row: InsightRow) =>
    row.kind === "uncategorized" ? "Uncategorized" : row.kind === "none" ? "No group" : (groupNames.get(row.id ?? "") ?? "Unknown");
  const categoryName = (row: InsightRow) => categoryNames.get(row.id ?? "") ?? "Unknown";
  const parentName = (arc: Arc) => groupName(data.groups.find((group) => `${group.kind}-${group.id ?? ""}` === arc.groupKey) ?? arc.row);

  /** Open the transactions of the period and the tag of the report that match the filter. */
  function openTransactions(filter: Partial<TransactionFilter>) {
    void navigate({ to: "/transactions", search: { ...filter, tagId: data.tagId ?? undefined, from: data.range.from, to: data.range.to } });
  }

  function selectArc(arc: Arc) {
    if (arc.ring === "category") {
      patchSearch({ category: arc.row.id === category ? undefined : (arc.row.id ?? undefined) });
    } else if (search.group === idOrNone(arc.row) && !category) {
      patchSearch({ group: undefined, category: undefined });
    } else {
      patchSearch({ group: idOrNone(arc.row), category: undefined });
    }
  }

  function isLit(arc: Arc) {
    if (selectedKey === null) {
      return true;
    }
    if (category) {
      return arc.row.id === category || (arc.ring === "group" && arc.key === selectedKey);
    }
    return arc.groupKey === selectedKey;
  }

  function isPressed(arc: Arc) {
    return arc.ring === "category" ? arc.row.id === category : !category && search.group === idOrNone(arc.row);
  }

  return { data, search, patchSearch, arcs, colors, category, selectedGroup, groupName, categoryName, parentName, openTransactions, selectArc, isLit, isPressed };
}

export function SpendDonutCard() {
  const { arcs, groupName, categoryName, parentName, selectArc, isLit, isPressed } = useSpendSelection();
  return (
    <Card>
      <CardHeader className="px-5 pt-5">
        <CardTitle className="text-base font-bold">Spending by group and category</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center px-5 pb-5">
        <SpendDonut
          arcs={arcs}
          nameOf={(arc) => ({ name: arc.ring === "group" ? groupName(arc.row) : categoryName(arc.row), group: parentName(arc) })}
          centerLabel="Spending"
          isLit={isLit}
          isPressed={isPressed}
          canSelect={(arc) => arc.row.kind !== "uncategorized"}
          onSelect={selectArc}
        />
      </CardContent>
    </Card>
  );
}

/** Groups or categories when no slice is selected. The choice is in the URL. */
function ListModeToggle() {
  const { search, patchSearch } = useSpendingSearch();
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      aria-label="Show"
      value={search.by ?? defaultInsightListMode}
      onValueChange={(value) => {
        const next = choiceIn(insightListModes, value);
        if (next) {
          patchSearch({ by: next === defaultInsightListMode ? undefined : next });
        }
      }}
    >
      <ToggleGroupItem value="groups">Groups</ToggleGroupItem>
      <ToggleGroupItem value="categories">Categories</ToggleGroupItem>
    </ToggleGroup>
  );
}

/**
 * The list under the timeline and the donut. It is always open. With no slice selected, it shows one row for each
 * group, or all categories, largest first. With a group or a category selected, it shows the categories of that group
 * and highlights the selected category. A month bar limits it to that month.
 */
export function SelectedSpendList() {
  const { data, search, colors, category, selectedGroup, groupName, categoryName, openTransactions } = useSpendSelection();
  // A category of the selected group has the colour of its slice. In the flat list it has the colour of its group.
  const categoryRow = (row: InsightRow, colorOf: InsightRow) => ({
    key: rowKey(row),
    name: categoryName(row),
    amount: row.amount,
    inflow: null,
    color: colors.get(rowKey(colorOf)),
    current: category !== null && row.id === category,
    onOpen: () => openTransactions({ categoryId: row.id ?? undefined }),
  });
  const groupRow = (row: InsightGroupRow) => ({
    key: rowKey(row),
    name: groupName(row),
    amount: row.amount,
    inflow: row.kind === "uncategorized" ? (row.inflow ?? 0) : null,
    color: colors.get(rowKey(row)),
    current: false,
    onOpen: () => openTransactions(row.kind === "uncategorized" ? { uncategorized: true } : { groupId: idOrNone(row) }),
  });
  const byCategory = (search.by ?? defaultInsightListMode) === "categories";
  // Uncategorized has no categories. It stays in the flat list as one row, thus the list shows all spending.
  const rows = selectedGroup
    ? selectedGroup.categories.map((row) => categoryRow(row, row))
    : byCategory
      ? data.groups
          .flatMap((group) => (group.kind === "uncategorized" ? [groupRow(group)] : group.categories.map((row) => categoryRow(row, group))))
          .sort((a, b) => b.amount - a.amount)
      : data.groups.map(groupRow);
  const title = [search.month ? monthTitle(search.month) : null, selectedGroup ? groupName(selectedGroup) : null].filter(Boolean).join(": ") || "Groups and categories";
  return (
    <CategorySpendList
      title={title}
      rows={rows}
      actions={selectedGroup ? null : <ListModeToggle />}
    />
  );
}
