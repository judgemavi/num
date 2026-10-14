import type { InsightRow, TransactionFilter } from "@num/shared";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategoryNames, useGroupNames, useMerchantNames, useTagNames } from "@/editors/lookups";
import { monthTitle } from "@/insights/format";
import { sliceColors } from "@/insights/slice-colors";
import { SpendDonut } from "@/insights/spend-donut";
import { SpendList } from "@/insights/spend-list";
import { useInsightsReport } from "@/insights/use-report";

function nameOf(names: Map<string, string>, row: InsightRow, none: string) {
  if (row.kind === "uncategorized") {
    return "Uncategorized";
  }
  if (row.kind === "none") {
    return none;
  }
  return names.get(row.id ?? "") ?? "Unknown";
}

function idOrNone(row: InsightRow) {
  return row.kind === "none" ? "none" : (row.id ?? undefined);
}

export function InsightsBreakdown() {
  const navigate = useNavigate();
  const { data, search, patchSearch } = useInsightsReport();
  const groupNames = useGroupNames();
  const categoryNames = useCategoryNames();
  const merchantNames = useMerchantNames();
  const tagNames = useTagNames();
  const group = search.group ?? null;
  const category = search.category ?? null;
  const groupLevel = group === null;
  const groupTitle = group === "none" ? "No group" : (groupNames.get(group ?? "") ?? "Group");
  const donutLabel = (row: InsightRow) => (groupLevel ? nameOf(groupNames, row, "No group") : nameOf(categoryNames, row, "No category"));
  const colors = sliceColors(data.donut);
  const categoryTitle = category ? (categoryNames.get(category) ?? "Category") : null;

  /** Open the transactions of the period of the report that match the filter. */
  function openTransactions(filter: Partial<TransactionFilter>) {
    void navigate({ to: "/transactions", search: { ...filter, from: data.range.from, to: data.range.to } });
  }

  function openDonutRow(row: InsightRow) {
    if (row.kind === "uncategorized") {
      openTransactions({ uncategorized: true });
    } else if (groupLevel) {
      openTransactions({ groupId: idOrNone(row) });
    } else {
      openTransactions({ categoryId: row.id ?? undefined });
    }
  }

  function selectSlice(row: InsightRow) {
    if (groupLevel) {
      patchSearch({ group: idOrNone(row), category: undefined });
      return;
    }
    patchSearch({ category: row.id === category ? undefined : (row.id ?? undefined) });
  }

  const listActions = (
    <>
      {category ? (
        <Button type="button" variant="ghost" onClick={() => patchSearch({ category: undefined })}>
          Show all categories
        </Button>
      ) : null}
      {groupLevel ? null : (
        <Button type="button" variant="secondary" onClick={() => patchSearch({ group: undefined, category: undefined })}>
          Back
        </Button>
      )}
    </>
  );

  return (
    <>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <SpendList
          title={categoryTitle ?? (groupLevel ? "Spending by group" : groupTitle)}
          rows={data.rows}
          label={donutLabel}
          colors={colors}
          onOpen={openDonutRow}
          actions={listActions}
        />
        <Card className="lg:order-last">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-base font-bold">{groupLevel ? "Spending by group" : groupTitle}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {groupLevel ? "Select a group to see its categories." : "Select a category to see it on the timeline."}
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 px-5 pb-5">
            <SpendDonut
                  rows={data.donut}
              colors={colors}
              label={donutLabel}
              centerLabel={groupLevel ? "Spending" : groupTitle}
              selectedKey={category ? `item-${category}` : null}
              canSelect={(row) => row.kind !== "uncategorized"}
              onSelect={selectSlice}
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
        <SpendList
          title="Spending by merchant"
          rows={data.merchants}
          label={(row) => nameOf(merchantNames, row, "No merchant")}
          onOpen={(row) => openTransactions({ merchantId: idOrNone(row) })}
        />
        <SpendList
          title="Spending by tag"
          rows={data.tags}
          label={(row) => nameOf(tagNames, row, "No tag")}
          onOpen={(row) => openTransactions({ tagId: idOrNone(row) })}
        />
      </div>
    </>
  );
}
