import {
  accountListSchema,
  categoryListSchema,
  currencyUpdateSchema,
  fundingPositionSchema,
  inboxSchema,
  merchantListSchema,
  planListSchema,
  tagListSchema,
  transactionSchema,
  type InboxItem,
  type Plan,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Upload } from "lucide-react";
import { useState } from "react";
import { ImportDialog } from "@/accounts/import-dialog";
import { localAsOf } from "@/as-of";
import { loadBuckets } from "@/buckets/query";
import { dismissItem, restoreItem, skipOccurrence } from "@/inbox/actions";
import { importAge, inboxError, inboxKicker } from "@/inbox/format";
import { InboxItemRow } from "@/inbox/inbox-item";
import { loadAllPages } from "@/settings/load-all-pages";
import { apiRequest } from "@/request";
import { PaydayIllustration } from "@/components/illustrations";
import { ListCard } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { SidePanel } from "@/components/side-panel";
import { SummaryStrip } from "@/components/summary-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FundPaycheck } from "@/buckets/fund-paycheck";
import { TransactionDialog } from "@/transactions/transaction-dialog";

type ReasonAsk =
  | { mode: "dismiss"; itemKey: string }
  | { mode: "skip"; planId: string; dueDate: string };

export function InboxScreen() {
  const asOf = localAsOf();
  const queryClient = useQueryClient();
  const [showDismissed, setShowDismissed] = useState(false);
  const [hand, setHand] = useState<Extract<InboxItem, { kind: "import_unreadable" }> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [paycheckId, setPaycheckId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [ask, setAsk] = useState<ReasonAsk | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
  const tags = useQuery({
    queryKey: ["tags", "inbox"],
    enabled: hand !== null || editId !== null,
    queryFn: () => loadAllPages("/api/tags", tagListSchema, { archived: false, sort: "name", dir: "asc" }),
  });
  const buckets = useQuery({
    queryKey: ["buckets", "inbox"],
    queryFn: () => loadBuckets({ archived: false, sort: "name", dir: "asc" }),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["buckets"] });
    void queryClient.invalidateQueries({ queryKey: ["plans"] });
  }

  async function submitReason() {
    if (!ask || reason.trim().length === 0) {
      return;
    }
    setPending(true);
    const result =
      ask.mode === "dismiss"
        ? await dismissItem(asOf, ask.itemKey, reason.trim())
        : await skipOccurrence(ask.planId, ask.dueDate, reason.trim());
    setPending(false);
    if (!result.ok) {
      setActionError(inboxError(result.code));
      return;
    }
    setAsk(null);
    setReason("");
    setActionError(null);
    refresh();
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
          <Button type="button" variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload strokeWidth={1.8} aria-hidden="true" />
            Import a statement
          </Button>
        }
      />
      <SummaryStrip
        tint="inbox"
        label="Needs you"
        amount={
          <p className="font-display text-[60px] leading-[0.9] font-extrabold [font-stretch:72%] max-md:text-5xl">
            {caughtUp ? "All caught up" : count}
          </p>
        }
        hint={caughtUp ? "Nothing needs a decision." : undefined}
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
              accountList={accounts.data?.items ?? []}
              plans={planRows}
              merchants={merchantNames}
              merchantList={merchants.data?.items ?? []}
              categories={categoryRows}
              buckets={bucketRows}
              onSkip={(planId, dueDate) => {
                setReason("");
                setAsk({ mode: "skip", planId, dueDate });
              }}
              onDismiss={(itemKey) => {
                setReason("");
                setAsk({ mode: "dismiss", itemKey });
              }}
              onAddByHand={(item) => setHand(item)}
              onOpenTransaction={(transactionId) => setEditId(transactionId)}
              onFundPaycheck={(incomeTransactionId) => setPaycheckId(incomeTransactionId)}
              unassigned={position.data?.unassigned ?? 0}
              onRestore={(itemKey) => {
                void restoreItem(itemKey).then((result) => {
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
      <Dialog open={paycheckId !== null} onOpenChange={(open) => { if (!open) setPaycheckId(null); }}>
        <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] overflow-y-auto">
          {paycheckId ? (
            <FundPaycheck
              currency={bookCurrency}
              asOf={asOf}
              incomeTransactionId={paycheckId}
              onClose={() => setPaycheckId(null)}
              onSaved={() => {
                setPaycheckId(null);
                refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      {editId && tags.isSuccess ? (
        <TransactionDialog
          draft={editId}
          currency={bookCurrency}
          accounts={accounts.data?.items ?? []}
          categories={categoryRows}
          tags={tags.data.items}
          merchants={merchants.data?.items ?? []}
          onClose={() => setEditId(null)}
          onSaved={() => {
            setEditId(null);
            refresh();
          }}
          onDelete={(transaction) => {
            void apiRequest(`/api/transactions/${transaction.id}`, transactionSchema, { method: "DELETE" }).then((result) => {
              if (!result.ok) {
                setActionError(inboxError(result.code));
                return;
              }
              setEditId(null);
              refresh();
            });
          }}
        />
      ) : null}
      {hand && tags.isSuccess ? (
        <TransactionDialog
          draft="new"
          currency={bookCurrency}
          accounts={accounts.data?.items ?? []}
          categories={categoryRows}
          tags={tags.data.items}
          merchants={merchants.data?.items ?? []}
          rawLine={hand.raw}
          initialAccountId={hand.accountId}
          onClose={() => setHand(null)}
          onSaved={() => {
            const itemKey = hand.itemKey;
            setHand(null);
            void dismissItem(asOf, itemKey, "added_manually").then((result) => {
              if (!result.ok) {
                setActionError(inboxError(result.code));
              }
              refresh();
            });
          }}
          onDelete={() => setHand(null)}
        />
      ) : null}
      <ImportDialog
        open={importOpen}
        account={null}
        onOpenChange={setImportOpen}
        onImported={() => {
          refresh();
          void queryClient.invalidateQueries({ queryKey: ["accounts"] });
        }}
      />
      <Dialog open={ask !== null} onOpenChange={(open) => { if (!open) setAsk(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ask?.mode === "skip" ? "Skip this occurrence" : "Not now"}</DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="inbox-reason">Reason</FieldLabel>
            <Input id="inbox-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAsk(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending || reason.trim().length === 0} onClick={() => void submitReason()}>
              {ask?.mode === "skip" ? "Skip" : "Dismiss"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
