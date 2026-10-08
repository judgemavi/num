import {
  accountListSchema,
  autoLinkResultSchema,
  categoryListSchema,
  currencyUpdateSchema,
  merchantListSchema,
  planListSchema,
  planSchema,
  recurringSignalsSchema,
  type Plan,
  type PlanListQuery,
  type PlanProposal,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Plus, Repeat } from "lucide-react";
import { useCallback, useState } from "react";
import { PlanFilterBar } from "@/recurring/filter-bar";
import { kindLabel, localAsOf, planError, scheduleLabel } from "@/recurring/format";
import { PlanDetail } from "@/recurring/plan-detail";
import { PlanForm, type PlanDraft, type PlanSeed } from "@/recurring/plan-form";
import { planPath } from "@/recurring/query";
import { ReviewList } from "@/recurring/review-list";
import { SkipNext } from "@/recurring/skip-next";
import { loadAllPages } from "@/settings/load-all-pages";
import { apiRequest } from "@/request";
import { Amount } from "@/components/amount";
import { IconTile } from "@/components/icon-tile";
import { PaydayIllustration } from "@/components/illustrations";
import { ListCard, ListGroup, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const recurringRoute = getRouteApi("/recurring");
const asOf = localAsOf();

const hues = { income: "mint", bill: "lilac", transfer: "butter" } as const;

export function RecurringScreen() {
  const queryClient = useQueryClient();
  const search = recurringRoute.useSearch();
  const navigate = recurringRoute.useNavigate();
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Plan | null>(null);
  const [skipPlan, setSkipPlan] = useState<Plan | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const changeFilters = useCallback(
    (patch: Partial<PlanListQuery>) => {
      void navigate({ search: { ...search, ...patch, page: 1 } });
    },
    [navigate, search],
  );

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

  const sync = useQuery({
    queryKey: ["recurring-sync", asOf],
    queryFn: async () => {
      const result = await apiRequest(`/api/recurring/auto-link?asOf=${asOf}`, autoLinkResultSchema, { method: "POST" });
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  const plans = useQuery({
    queryKey: ["plans", search],
    enabled: sync.isSuccess,
    queryFn: async () => {
      const result = await apiRequest(planPath(search), planListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  const signals = useQuery({
    queryKey: ["recurring-signals", asOf],
    enabled: sync.isSuccess,
    queryFn: async () => {
      const result = await apiRequest(`/api/recurring/signals?asOf=${asOf}`, recurringSignalsSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  const accounts = useQuery({
    queryKey: ["accounts", "recurring"],
    queryFn: () => loadAllPages("/api/accounts", accountListSchema, false),
  });
  const categories = useQuery({
    queryKey: ["categories", "recurring"],
    queryFn: () => loadAllPages("/api/categories", categoryListSchema, false),
  });
  const merchants = useQuery({
    queryKey: ["merchants", "recurring"],
    queryFn: () => loadAllPages("/api/merchants", merchantListSchema, false),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["plans"] });
    await queryClient.invalidateQueries({ queryKey: ["recurring-signals"] });
    await queryClient.invalidateQueries({ queryKey: ["recurring-sync"] });
    await queryClient.invalidateQueries({ queryKey: ["occurrences"] });
  }

  async function confirmPending() {
    if (!pending) {
      return;
    }
    const path = pending.archivedAt ? "restore" : "archive";
    const result = await apiRequest(`/api/recurring/${pending.id}/${path}`, planSchema, { method: "POST" });
    if (!result.ok) {
      setActionError(planError(result.code));
      return;
    }
    setActionError(null);
    setPending(null);
    await refresh();
  }

  const rows = plans.data?.items ?? [];
  const selected = rows.find((plan) => plan.id === selectedId) ?? rows[0] ?? null;
  const bookCurrency = currency.data;
  const grouped = (["income", "bill", "transfer"] as const)
    .map((kind) => ({ kind, items: rows.filter((plan) => plan.kind === kind) }))
    .filter((group) => group.items.length > 0);

  if (currency.isPending || plans.isPending || accounts.isPending || sync.isPending) {
    return <p className="text-muted-foreground">Loading plans.</p>;
  }
  if (currency.isError || plans.isError || !bookCurrency || accounts.isError) {
    return (
      <div className="grid content-start gap-5">
        <p>The plans did not load.</p>
        <Button type="button" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );
  }

  function openProposal(proposal: PlanProposal, name: string) {
    const seed: PlanSeed = {
      ...proposal,
      name,
      kind: proposal.expectedAmount >= 0 ? "income" : "bill",
    };
    setDraft(seed);
  }

  return (
    <>
      <PageHeader
        kicker={rows.length === 1 ? "1 plan" : `${plans.data?.total ?? 0} plans`}
        title="Recurring"
        actions={
          <Button type="button" onClick={() => setDraft("new")}>
            <Plus aria-hidden="true" />
            New plan
          </Button>
        }
      />
      <SummaryStrip
        tint="plan"
        label="Plans"
        amount={<span className="font-display text-5xl leading-none font-extrabold tabular-nums">{plans.data?.total ?? 0}</span>}
        hint="Payments and deposits you expect on a schedule."
        facts={
          <>
            <Fact label="Income">{rows.filter((plan) => plan.kind === "income").length}</Fact>
            <Fact label="Bills">{rows.filter((plan) => plan.kind === "bill").length}</Fact>
            <Fact label="Missed">{signals.data?.missed.length ?? 0}</Fact>
          </>
        }
        illustration={<PaydayIllustration />}
      />
      <PlanFilterBar search={search} accounts={accounts.data?.items ?? []} onChange={changeFilters} />
      {actionError ? (
        <p role="alert" className="text-sm text-attn">
          {actionError}
        </p>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="grid gap-5">
          {signals.data ? (
            <ReviewList
              signals={signals.data}
              plans={rows}
              accounts={accounts.data?.items ?? []}
              merchants={merchants.data?.items ?? []}
              currency={bookCurrency}
              onOpenPlan={(plan) => setSelectedId(plan.id)}
              onUseProposal={openProposal}
            />
          ) : null}
          <ListCard label="Plans">
            {grouped.length === 0 ? (
              <p className="px-5 py-5 text-muted-foreground">{search.q || search.kind || search.accountId || search.archived ? "No plans match." : "No plans yet."}</p>
            ) : (
              grouped.map((group) => (
                <div key={group.kind}>
                  <ListGroup label={kindLabel(group.kind)} />
                  {group.items.map((plan) => (
                    <ListRow
                      key={plan.id}
                      onOpen={() => {
                        setSelectedId(plan.id);
                        setDraft(plan);
                      }}
                    >
                      <IconTile hue={hues[plan.kind]}>
                        <Repeat strokeWidth={1.8} />
                      </IconTile>
                      <div className={listName}>
                        {plan.name}
                        <small>{scheduleLabel(plan)}</small>
                      </div>
                      {!plan.active ? <Badge variant="neutral">Paused</Badge> : null}
                      {plan.archivedAt ? <Badge variant="neutral">Archived</Badge> : null}
                      <Amount currency={bookCurrency} minor={plan.expectedAmount} />
                      <RowMenu label={`Actions for ${plan.name}`}>
                        <DropdownMenuItem className="min-h-11" onSelect={() => setPending(plan)}>
                          {plan.archivedAt ? "Restore" : "Archive"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="min-h-11"
                          onSelect={() => {
                            setSelectedId(plan.id);
                            setSkipPlan(plan);
                            setReason("");
                          }}
                        >
                          Skip next
                        </DropdownMenuItem>
                      </RowMenu>
                    </ListRow>
                  ))}
                </div>
              ))
            )}
          </ListCard>
        </div>
        {selected ? (
          <PlanDetail plan={selected} currency={bookCurrency} asOf={asOf} onEdit={() => setDraft(selected)} />
        ) : (
          <p className="text-sm text-muted-foreground">Add a plan to see its occurrences.</p>
        )}
      </div>
      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] overflow-y-auto">
          {draft && categories.data && merchants.data ? (
            <PlanForm
              key={draft === "new" ? "new" : "id" in draft ? draft.id : draft.merchantId}
              currency={bookCurrency}
              draft={draft}
              accounts={accounts.data?.items ?? []}
              categories={categories.data.items}
              merchants={merchants.data.items}
              onClose={() => setDraft(null)}
              onSaved={() => {
                setDraft(null);
                void refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.archivedAt ? "Restore this plan?" : "Archive this plan?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.archivedAt
                ? `Restore ${pending.name}. It returns to the active list.`
                : `Archive ${pending?.name ?? "this plan"}. It leaves the active list.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmPending()}>
              {pending?.archivedAt ? "Restore plan" : "Archive plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={skipPlan !== null} onOpenChange={(open) => !open && setSkipPlan(null)}>
        <DialogContent>
          <SkipNext
            plan={skipPlan}
            reason={reason}
            asOf={asOf}
            onReason={setReason}
            onClose={() => setSkipPlan(null)}
            onDone={() => {
              setSkipPlan(null);
              void refresh();
            }}
            onError={setActionError}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
