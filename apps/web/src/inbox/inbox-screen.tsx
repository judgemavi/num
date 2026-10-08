import {
  accountListSchema,
  categoryListSchema,
  currencyUpdateSchema,
  forecastSchema,
  fundingPositionSchema,
  inboxSchema,
  merchantListSchema,
  planListSchema,
  type Plan,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Upload } from "lucide-react";
import { useState } from "react";
import { localAsOf } from "@/as-of";
import { useEditors } from "@/editors/editor-api";
import { loadBuckets } from "@/buckets/query";
import { dismissItem, restoreItem } from "@/inbox/actions";
import { importAge, inboxError, inboxKicker, paydayHint } from "@/inbox/format";
import { InboxItemRow } from "@/inbox/inbox-item";
import { loadAllPages } from "@/settings/load-all-pages";
import { apiRequest } from "@/request";
import { PaydayIllustration } from "@/components/illustrations";
import { ListCard } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { SidePanel } from "@/components/side-panel";
import { Amount } from "@/components/amount";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
export function InboxScreen() {
  const asOf = localAsOf();
  const queryClient = useQueryClient();
  const { openEditor } = useEditors();
  const [showDismissed, setShowDismissed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const inbox = useQuery({
    queryKey: ["inbox", asOf, showDismissed],
    queryFn: async () => {
      const result = await apiRequest(`/api/inbox?asOf=${asOf}${showDismissed ? "&dismissed=true" : ""}`, inboxSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
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
  const accounts = useQuery({
    queryKey: ["accounts", "inbox"],
    queryFn: () => loadAllPages("/api/accounts", accountListSchema, { archived: false, sort: "name", dir: "asc" }),
  });
  const categories = useQuery({
    queryKey: ["categories", "inbox"],
    queryFn: () => loadAllPages("/api/categories", categoryListSchema, { archived: false, sort: "name", dir: "asc" }),
  });
  const merchants = useQuery({
    queryKey: ["merchants", "inbox"],
    queryFn: () => loadAllPages("/api/merchants", merchantListSchema, { archived: false, sort: "name", dir: "asc" }),
  });
  const plans = useQuery({
    queryKey: ["plans", "inbox"],
    queryFn: () => loadAllPages("/api/recurring", planListSchema, { archived: false, sort: "name", dir: "asc" }),
  });
  const position = useQuery({
    queryKey: ["funding-position", asOf],
    queryFn: async () => {
      const result = await apiRequest(`/api/funding/position?asOf=${asOf}`, fundingPositionSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  const buckets = useQuery({
    queryKey: ["buckets", "inbox"],
    queryFn: () => loadBuckets({ archived: false, sort: "name", dir: "asc" }),
  });
  const forecast = useQuery({
    queryKey: ["forecast", asOf],
    queryFn: async () => {
      const result = await apiRequest(`/api/forecast?asOf=${asOf}`, forecastSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["buckets"] });
    void queryClient.invalidateQueries({ queryKey: ["plans"] });
  }

  const bookCurrency = currency.data ?? "USD";
  const accountNames = new Map((accounts.data?.items ?? []).map((account) => [account.id, account.name]));
  const merchantNames = new Map((merchants.data?.items ?? []).map((merchant) => [merchant.id, merchant.name]));
  const planRows = new Map<string, Plan>((plans.data?.items ?? []).map((plan) => [plan.id, plan]));
  const categoryRows = categories.data?.items ?? [];
  const bucketRows = buckets.data?.items ?? [];
  const count = inbox.data?.count ?? 0;
  const dismissedCount = inbox.data?.dismissedCount ?? 0;
  const reasons = new Map((inbox.data?.dismissalReasons ?? []).map((row) => [row.itemKey, row.reason]));
  const cashKinds = new Set(["chequing", "savings", "cash"]);
  const primary = [...(accounts.data?.items ?? [])]
    .filter((account) => cashKinds.has(account.kind) && account.archivedAt === null)
    .sort((left, right) => right.balance - left.balance || left.name.localeCompare(right.name))[0];
  const bills = position.data?.billsReserved ?? 0;
  const spendingBuckets = bucketRows
    .filter((bucket) => bucket.kind === "spending" && bucket.archivedAt === null)
    .sort((left, right) => left.name.localeCompare(right.name));
  const caughtUp = inbox.data !== undefined && !showDismissed && count === 0;
  const dismissedEmpty = showDismissed && inbox.data !== undefined && inbox.data.items.length === 0;
  const imports = [...(inbox.data?.imports ?? [])].sort((left, right) => {
    const leftName = accountNames.get(left.accountId) ?? "";
    const rightName = accountNames.get(right.accountId) ?? "";
    return leftName.localeCompare(rightName);
  });

  return (
    <>
      <PageHeader
        kicker={inboxKicker(asOf)}
        title="Inbox"
        actions={
          <Button type="button" variant="secondary" onClick={() => void openEditor("import", { accountId: null })}>
            <Upload strokeWidth={1.8} aria-hidden="true" />
            Import a statement
          </Button>
        }
      />
      <SummaryStrip
        tint="inbox"
        label="Safe to spend until payday"
        amount={
          forecast.data ? (
            <Amount currency={bookCurrency} minor={forecast.data.safeToSpend} hero />
          ) : (
            <p className="font-display text-[60px] leading-[0.9] font-extrabold [font-stretch:72%] max-md:text-5xl">…</p>
          )
        }
        hint={
          forecast.data
            ? paydayHint(bookCurrency, asOf, forecast.data.nextIncomeDate, forecast.data.safeToSpend)
            : forecast.isError
              ? "The forecast did not load."
              : "Loading the forecast."
        }
        facts={
          forecast.data ? (
            <>
              {primary ? (
                <Fact label={`In ${primary.name}`}>
                  <Amount currency={bookCurrency} minor={primary.balance} />
                </Fact>
              ) : null}
              <Fact label="Bills before payday">
                <Amount currency={bookCurrency} minor={bills === 0 ? 0 : -bills} />
              </Fact>
              {spendingBuckets.map((bucket) => (
                <Fact key={bucket.id} label={bucket.name}>
                  <Amount currency={bookCurrency} minor={bucket.balance} />
                </Fact>
              ))}
            </>
          ) : undefined
        }
        illustration={<PaydayIllustration />}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <ListCard label="Needs you">
          <div className="flex items-center gap-2 border-b px-5 py-3.5">
            <h2 className="text-base font-bold">{showDismissed ? "Dismissed" : "Needs you"}</h2>
            {!showDismissed && count > 0 ? <Badge variant="count">{count}</Badge> : null}
            <Button type="button" variant="ghost" className="ml-auto" onClick={() => setShowDismissed((value) => !value)}>
              {showDismissed ? "Needs you" : `Dismissed${dismissedCount > 0 ? ` (${dismissedCount})` : ""}`}
            </Button>
          </div>
          {inbox.isPending ? <p className="px-5 py-6 text-muted-foreground">Loading the inbox.</p> : null}
          {inbox.isError ? (
            <div className="grid gap-3 px-5 py-6">
              <p>The inbox did not load.</p>
              <Button type="button" onClick={() => void inbox.refetch()}>
                Try again
              </Button>
            </div>
          ) : null}
          {notice ? <p className="px-5 py-3 text-sm" role="status">{notice}</p> : null}
          {actionError ? <p className="px-5 py-3 text-sm text-attn">{actionError}</p> : null}
          {caughtUp ? <p className="px-5 py-6 text-muted-foreground">All caught up.</p> : null}
          {dismissedEmpty ? <p className="px-5 py-6 text-muted-foreground">No dismissed items.</p> : null}
          {inbox.data?.items.map((item) => (
            <InboxItemRow
              key={item.itemKey}
              item={item}
              currency={bookCurrency}
              asOf={asOf}
              accounts={accountNames}
              plans={planRows}
              merchants={merchantNames}
              categories={categoryRows}
              buckets={bucketRows}
              onSkip={(planId, dueDate) => {
                void openEditor("inboxReason", { mode: "skip", planId, dueDate, asOf }).then((id) => {
                  if (id) {
                    refresh();
                  }
                });
              }}
              onDismiss={(itemKeys) => {
                void openEditor("inboxReason", { mode: "dismiss", itemKeys, asOf }).then((id) => {
                  if (id) {
                    refresh();
                  }
                });
              }}
              onAddByHand={(item) => {
                void openEditor("transaction", { id: null, rawLine: item.raw, initialAccountId: item.accountId }).then((id) => {
                  if (!id) {
                    return;
                  }
                  void dismissItem(asOf, [item.itemKey], "added_manually").then((result) => {
                    if (!result.ok) {
                      setActionError(inboxError(result.code));
                    }
                    refresh();
                  });
                });
              }}
              onOpenGroup={(transactionIds) => {
                void openEditor("transaction", { id: null, groupIds: transactionIds }).then(() => refresh());
              }}
              onReviewQueue={(transactionIds) => {
                void openEditor("transaction", { id: transactionIds[0] ?? null, queueIds: transactionIds }).then(() => refresh());
              }}
              onFundPaycheck={(incomeTransactionId) => {
                void openEditor("fundPaycheck", { incomeTransactionId }).then(() => refresh());
              }}
              unassigned={position.data?.unassigned ?? 0}
              onRestore={(itemKeys) => {
                void restoreItem(itemKeys).then((result) => {
                  if (!result.ok) {
                    setActionError(inboxError(result.code));
                    return;
                  }
                  setActionError(null);
                  refresh();
                });
              }}
              dismissedReason={showDismissed ? reasons.get(item.itemKey) : undefined}
              onDone={() => {
                setActionError(null);
                refresh();
              }}
              onNotice={setNotice}
              onError={(code) => setActionError(inboxError(code))}
            />
          ))}
        </ListCard>
        <SidePanel title="Last imports">
          {imports.length === 0 ? <p className="text-sm text-muted-foreground">No accounts yet.</p> : null}
          <ul>
            {imports.map((row) => {
              const age = importAge(asOf, row.lastImportAt, inbox.data?.staleImportDays ?? 10);
              return (
                <li key={row.accountId} className="flex min-h-12 items-center justify-between gap-3 border-t py-2 text-sm first:border-t-0">
                  <span className="font-semibold">{accountNames.get(row.accountId) ?? "Account"}</span>
                  <span className={`inline-flex items-center gap-1 ${age.stale ? "font-semibold text-attn" : "text-muted-foreground"}`}>
                    {age.stale ? <AlertTriangle className="size-4" aria-hidden="true" /> : null}
                    {age.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </SidePanel>
      </div>
    </>
  );
}
