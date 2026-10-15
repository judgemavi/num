import type { InsightRow, TransactionFilter } from "@num/shared";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategoryNames, useGroupNames, useTagNames } from "@/editors/lookups";
import { CategorySpendList } from "@/insights/category-spend-list";
import { monthTitle } from "@/insights/format";
import { spendArcs, type Arc } from "@/insights/spend-arcs";
import { SpendDonut } from "@/insights/spend-donut";
import { SpendList } from "@/insights/spend-list";
import { useInsightsReport } from "@/insights/use-report";

function idOrNone(row: InsightRow) {
  return row.kind === "none" ? "none" : (row.id ?? undefined);
}

export function InsightsBreakdown() {
  const navigate = useNavigate();
  const { data, search, patchSearch } = useInsightsReport();
  const groupNames = useGroupNames();
  const categoryNames = useCategoryNames();
  const tagNames = useTagNames();
  const category = search.category ?? null;
  const { arcs, colors } = spendArcs(data.groups);
  const categoryGroup = category ? data.groups.find((group) => group.categories.some((row) => row.id === category)) : undefined;
  const selectedGroup = categoryGroup ?? data.groups.find((group) => idOrNone(group) === search.group);
  const selectedKey = selectedGroup ? `${selectedGroup.kind}-${selectedGroup.id ?? ""}` : null;

  const groupName = (row: InsightRow) =>
    row.kind === "uncategorized" ? "Uncategorized" : row.kind === "none" ? "No group" : (groupNames.get(row.id ?? "") ?? "Unknown");
  const categoryName = (row: InsightRow) => categoryNames.get(row.id ?? "") ?? "Unknown";
  const parentName = (arc: Arc) => groupName(data.groups.find((group) => `${group.kind}-${group.id ?? ""}` === arc.groupKey) ?? arc.row);

  const shown = selectedGroup
    ? [{ ...selectedGroup, categories: category ? selectedGroup.categories.filter((row) => row.id === category) : selectedGroup.categories }]
    : data.groups;

  /** Open the transactions of the period of the report that match the filter. */
  function openTransactions(filter: Partial<TransactionFilter>) {
    void navigate({ to: "/transactions", search: { ...filter, from: data.range.from, to: data.range.to } });
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

  return (
    <>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <CategorySpendList
          groups={shown}
          colors={colors}
          groupName={groupName}
          categoryName={categoryName}
          onOpenGroup={(row) => (row.kind === "uncategorized" ? openTransactions({ uncategorized: true }) : openTransactions({ groupId: idOrNone(row) }))}
          onOpenCategory={(row) => openTransactions({ categoryId: row.id ?? undefined })}
          actions={
            selectedGroup ? (
              <Button type="button" variant="ghost" onClick={() => patchSearch({ group: undefined, category: undefined })}>
                Show all
              </Button>
            ) : null
          }
        />
        <Card className="lg:order-last">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-base font-bold">Spending by group and category</CardTitle>
            <p className="text-sm text-muted-foreground">Inner ring: groups. Outer ring: categories. Select a slice to focus on it.</p>
          </CardHeader>
          <CardContent className="grid gap-3 px-5 pb-5">
            <SpendDonut
              arcs={arcs}
              nameOf={(arc) => ({ name: arc.ring === "group" ? groupName(arc.row) : categoryName(arc.row), group: parentName(arc) })}
              centerLabel="Spending"
              isLit={isLit}
              isPressed={isPressed}
              canSelect={(arc) => arc.row.kind !== "uncategorized"}
              onSelect={selectArc}
            />
            {search.month ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold">{monthTitle(search.month)}</span>
                <Button type="button" variant="ghost" onClick={() => patchSearch({ month: undefined })}>
                  Show the whole period
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <SpendList title="Spending by tag" rows={data.tags} label={(row) => tagNames.get(row.id ?? "") ?? "Unknown"} onOpen={(row) => openTransactions({ tagId: idOrNone(row) })} />
      </div>
    </>
  );
}
