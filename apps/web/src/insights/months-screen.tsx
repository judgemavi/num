import {
  accountListSchema,
  bucketListSchema,
  categoryListSchema,
  currencyUpdateSchema,
  merchantListSchema,
  monthDetailSchema,
  monthListSchema,
  planListSchema,
  type MonthDetail,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { accountLabels } from "@/accounts/label";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { PaycheckSplitIllustration } from "@/components/illustrations";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { SidePanel } from "@/components/side-panel";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEditors } from "@/editors/editor-api";
import { blockerText, monthError, monthTitle, rateText, statusLabel, statusVariant } from "@/insights/format";
import { MonthStoryView } from "@/insights/month-story";
import { apiRequest } from "@/request";
import { loadAllPages } from "@/settings/load-all-pages";
import { useState } from "react";

const insightsRoute = getRouteApi("/insights_/months");

function namesFrom<T extends { id: string; name: string }>(items: T[] | undefined): Map<string, string> {
  return new Map((items ?? []).map((item) => [item.id, item.name]));
}

export function MonthsScreen() {
  const asOf = localAsOf();
  const search = insightsRoute.useSearch();
  const navigate = insightsRoute.useNavigate();
  const queryClient = useQueryClient();
  const { confirm } = useEditors();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const currency = useQuery({
    queryKey: ["book-currency"],
    queryFn: async () => {
      const result = await apiRequest("/api/settings/currency", currencyUpdateSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.currency;
    },
  });
  const months = useQuery({
    queryKey: ["months", asOf],
    queryFn: async () => {
      const result = await apiRequest(`/api/months?asOf=${asOf}`, monthListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  const selected = months.data?.items.some((item) => item.month === search.month) ? search.month : months.data?.items[0]?.month;
  const detail = useQuery({
    queryKey: ["months", asOf, selected],
    enabled: selected !== undefined,
    queryFn: async () => {
      const result = await apiRequest(`/api/months/${selected}?asOf=${asOf}`, monthDetailSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  const accounts = useQuery({
    queryKey: ["accounts", "months"],
    queryFn: () => loadAllPages("/api/accounts", accountListSchema, { sort: "name", dir: "asc" }),
  });
  const categories = useQuery({
    queryKey: ["categories", "months"],
    queryFn: () => loadAllPages("/api/categories", categoryListSchema, { sort: "name", dir: "asc" }),
  });
  const merchants = useQuery({
    queryKey: ["merchants", "months"],
    queryFn: () => loadAllPages("/api/merchants", merchantListSchema, { sort: "name", dir: "asc" }),
  });
  const plans = useQuery({
    queryKey: ["plans", "months"],
    queryFn: () => loadAllPages("/api/recurring", planListSchema, { sort: "name", dir: "asc" }),
  });
  const buckets = useQuery({
    queryKey: ["buckets", "months"],
    queryFn: () => loadAllPages("/api/buckets", bucketListSchema, { sort: "name", dir: "asc" }),
  });

  const bookCurrency = currency.data ?? "USD";
  const accountNames = accountLabels(accounts.data?.items ?? []);
  const story = detail.data;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["months"] });
    await queryClient.invalidateQueries({ queryKey: ["hygiene"] });
  }

  async function closeMonth(month: MonthDetail) {
    const ok = await confirm({
      title: `Close ${monthTitle(month.month)}?`,
      description: "This marks the month as reviewed. The story stays calculated from current data. You can open the month again later.",
      confirmLabel: "Close",
    });
    if (!ok) {
      return;
    }
    setSaving(true);
    const result = await apiRequest(`/api/months/${month.month}/close?asOf=${asOf}`, monthDetailSchema, { method: "POST" });
    setSaving(false);
    if (!result.ok) {
      setError(monthError(result.code));
      return;
    }
    setError(null);
    await refresh();
  }

  async function reopen(month: string) {
    const ok = await confirm({
      title: `Open ${monthTitle(month)} again?`,
      description: "This removes the reviewed mark. The month story stays calculated from current data.",
      confirmLabel: "Open",
    });
    if (!ok) {
      return;
    }
    setSaving(true);
    const result = await apiRequest(`/api/months/${month}/reopen?asOf=${asOf}`, monthDetailSchema, { method: "POST" });
    setSaving(false);
    if (!result.ok) {
      setError(monthError(result.code));
      return;
    }
    setError(null);
    await refresh();
  }

  return (
    <>
      <PageHeader
        kicker="Insights"
        title="Months"
        actions={
          <Button type="button" variant="secondary" asChild>
            <Link to="/insights">Spending</Link>
          </Button>
        }
      />
      {story ? (
        <SummaryStrip
          tint="plan"
          label="Saved"
          amount={<Amount currency={bookCurrency} minor={story.story.savings} hero />}
          hint={monthTitle(story.month)}
          facts={
            <>
              <Fact label="Income">
                <Amount currency={bookCurrency} minor={story.story.income} />
              </Fact>
              <Fact label="Spending">
                <Amount currency={bookCurrency} minor={story.story.spending} />
              </Fact>
              <Fact label="Savings rate">{rateText(story.story.savingsRateMilliPct)}</Fact>
            </>
          }
          illustration={<PaycheckSplitIllustration />}
        />
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <ListCard label="Months" title="Months">
          {months.isPending ? <p className="px-5 py-4 text-sm text-muted-foreground">Loading months.</p> : null}
          {months.isError ? <p className="px-5 py-4 text-sm">The months did not load.</p> : null}
          {(months.data?.items ?? []).map((item) => (
            <ListRow
              key={item.month}
              current={item.month === selected}
              onOpen={() => {
                if (item.month !== selected) {
                  setError(null);
                }
                void navigate({ search: (prev) => ({ ...prev, month: item.month }) });
              }}
            >
              <span className={listName}>{monthTitle(item.month)}</span>
              <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
            </ListRow>
          ))}
        </ListCard>
        <SidePanel
          title={story ? monthTitle(story.month) : "Month"}
          text={
            story?.status === "ready"
              ? "You can close this month."
              : story?.status === "closed"
                ? "This month is closed."
                : "This month is still open."
          }
          action={
            story?.status === "ready" ? (
              <Button type="button" disabled={saving} onClick={() => void closeMonth(story)}>
                Close
              </Button>
            ) : story?.status === "closed" ? (
              <Button type="button" variant="secondary" onClick={() => void reopen(story.month)}>
                Reopen
              </Button>
            ) : null
          }
        >
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {detail.isError ? <p className="text-sm">The month story did not load.</p> : null}
          {story?.status !== "closed"
            ? story?.blockers.map((blocker) => (
                <p key={`${blocker.code}-${blocker.accountId ?? "inbox"}`} className="text-sm">
                  {blockerText(blocker.code, blocker.accountId ? (accountNames.get(blocker.accountId) ?? null) : null)}
                </p>
              ))
            : null}
        </SidePanel>
      </div>
      {story ? (
        <MonthStoryView
          currency={bookCurrency}
          story={story.story}
          names={{
            category: namesFrom(categories.data?.items),
            merchant: namesFrom(merchants.data?.items),
            plan: namesFrom(plans.data?.items),
            bucket: namesFrom(buckets.data?.items),
          }}
        />
      ) : null}
    </>
  );
}
