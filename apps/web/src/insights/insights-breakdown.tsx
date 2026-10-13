import type { InsightRow, Insights, InsightsSearch } from "@num/shared";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategories, useGroups, useMerchants, useTags } from "@/editors/lookups";
import { monthTitle } from "@/insights/format";
import { sliceColors } from "@/insights/slice-colors";
import { SpendDonut } from "@/insights/spend-donut";
import { SpendList } from "@/insights/spend-list";

type BreakdownProps = {
  currency: string;
  data: Insights;
  search: InsightsSearch;
  patchSearch: (patch: Partial<InsightsSearch>) => void;
};

type TransactionFilter = {
  categoryId?: string;
  groupId?: string;
  merchantId?: string;
  tagId?: string;
  uncategorized?: boolean;
};

function nameOf(names: Map<string, string>, row: InsightRow, none: string): string {
  if (row.kind === "uncategorized") {
    return "Uncategorized";
  }
  if (row.kind === "none") {
    return none;
  }
  return names.get(row.id ?? "") ?? "Unknown";
}

function idOrNone(row: InsightRow): string | undefined {
  return row.kind === "none" ? "none" : (row.id ?? undefined);
}

export function InsightsBreakdown({ currency, data, search, patchSearch }: BreakdownProps) {
  const navigate = useNavigate();
  const groupNames = new Map((useGroups().data ?? []).map((item) => [item.id, item.name]));
  const categoryNames = new Map((useCategories().data ?? []).map((item) => [item.id, item.name]));
  const merchantNames = new Map((useMerchants().data ?? []).map((item) => [item.id, item.name]));
  const tagNames = new Map((useTags().data ?? []).map((item) => [item.id, item.name]));
  const group = search.group ?? null;
  const category = search.category ?? null;
  const groupLevel = group === null;
  const groupTitle = group === "none" ? "No group" : (groupNames.get(group ?? "") ?? "Group");
  const donutLabel = (row: InsightRow) => (groupLevel ? nameOf(groupNames, row, "No group") : nameOf(categoryNames, row, "No category"));
  const colors = sliceColors(data.donut);
  const categoryTitle = category ? (categoryNames.get(category) ?? "Category") : null;

  function openTransactions(filter: TransactionFilter) {
    void navigate({
      to: "/transactions",
      search: {
        page: 1,
        pageSize: 50,
        uncategorized: filter.uncategorized ?? false,
        automatic: false,
        needsReview: false,
        from: data.range.from,
        to: data.range.to,
        categoryId: filter.categoryId,
        groupId: filter.groupId,
        merchantId: filter.merchantId,
        tagId: filter.tagId,
      },
    });
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
          currency={currency}
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
              currency={currency}
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
          currency={currency}
          title="Spending by merchant"
          rows={data.merchants}
          label={(row) => nameOf(merchantNames, row, "No merchant")}
          onOpen={(row) => openTransactions({ merchantId: idOrNone(row) })}
        />
        <SpendList
          currency={currency}
          title="Spending by tag"
          rows={data.tags}
          label={(row) => nameOf(tagNames, row, "No tag")}
          onOpen={(row) => openTransactions({ tagId: idOrNone(row) })}
        />
      </div>
    </>
  );
}
