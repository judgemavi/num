import type { PlanListQuery } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Plus, Repeat } from "lucide-react";
import { useCallback, useState } from "react";
import { PlanFilters } from "@/recurring/filters";
import { kindLabel, localAsOf, planError, scheduleLabel } from "@/recurring/format";
import { PlanDetail } from "@/recurring/plan-detail";
import { useEditors } from "@/editors/editor-api";
import { useBookCurrency } from "@/editors/lookups";
import { ReviewList } from "@/recurring/review-list";
import { activeAccountsQuery } from "@/api/accounts";
import { errorCode } from "@/api/client";
import { merchantListQuery } from "@/api/merchants";
import { planListQuery, recurringSignalsQuery, recurringSyncQuery, useArchivePlan } from "@/api/recurring";
import { Amount } from "@/components/amount";
import { IconTile } from "@/components/icon-tile";
import { PaydayIllustration } from "@/components/illustrations";
import { ListCard, ListGroup, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const recurringRoute = getRouteApi("/recurring");
const asOf = localAsOf();

const hues = { income: "mint", bill: "lilac", transfer: "butter" } as const;

export function RecurringScreen() {
  const search = recurringRoute.useSearch();
  const navigate = recurringRoute.useNavigate();
  const { openEditor, confirm } = useEditors();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const changeFilters = useCallback(
    (patch: Partial<PlanListQuery>) => {
      void navigate({ search: { ...search, ...patch, page: 1 } });
    },
    [navigate, search],
  );

  const currency = useBookCurrency();
  const sync = useQuery(recurringSyncQuery(asOf));
  const plans = useQuery(planListQuery(search, sync.isSuccess));
  const signals = useQuery(recurringSignalsQuery(asOf, sync.isSuccess));
  const accounts = useQuery(activeAccountsQuery());
  const merchants = useQuery(merchantListQuery({ archived: false }));
  const archive = useArchivePlan();

  function tryAgain() {
    void currency.refetch();
    void accounts.refetch();
    void sync.refetch();
    if (sync.isSuccess) {
      void plans.refetch();
    }
  }

  const rows = plans.data?.items ?? [];
  const selected = rows.find((plan) => plan.id === selectedId) ?? rows[0] ?? null;
  const bookCurrency = currency.data;
  const grouped = (["income", "bill", "transfer"] as const)
    .map((kind) => ({ kind, items: rows.filter((plan) => plan.kind === kind) }))
    .filter((group) => group.items.length > 0);

  if (currency.isPending || plans.isPending || accounts.isPending || sync.isPending) {
    return <p className="text-muted-foreground">Loading recurring.</p>;
  }
  if (currency.isError || plans.isError || !bookCurrency || accounts.isError) {
    return (
      <div className="grid content-start gap-5">
        <p>Recurring did not load.</p>
        <Button type="button" onClick={tryAgain}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        kicker={rows.length === 1 ? "1 recurring" : `${plans.data?.total ?? 0} recurring`}
        title="Recurring"
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button">
                <Plus aria-hidden="true" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("plan", { id: null, kind: "bill" })}>
                Add a recurring payment
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("plan", { id: null, kind: "income" })}>
                Add recurring income
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("plan", { id: null, kind: "transfer" })}>
                Add a recurring transfer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <SummaryStrip
        tint="plan"
        label="Recurring"
        amount={<span className="font-display text-5xl leading-none font-extrabold tabular-nums">{plans.data?.total ?? 0}</span>}
        hint="Payments and deposits you expect on a schedule."
        facts={
          <>
            <Fact label="Income">{rows.filter((plan) => plan.kind === "income").length}</Fact>
            <Fact label="Bills">{rows.filter((plan) => plan.kind === "bill").length}</Fact>
            <Fact label="Detected">{signals.data?.proposals.length ?? 0}</Fact>
          </>
        }
        illustration={<PaydayIllustration />}
      />
      <PlanFilters search={search} accounts={accounts.data?.items ?? []} onChange={changeFilters} />
      {archive.error ? (
        <p role="alert" className="text-sm text-attn">
          {planError(errorCode(archive.error))}
        </p>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="grid gap-5">
          {signals.data ? (
            <ReviewList signals={signals.data} merchants={merchants.data?.items ?? []} />
          ) : null}
          <ListCard label="Recurring">
            {grouped.length === 0 ? (
              <p className="px-5 py-5 text-muted-foreground">{search.q || search.kind || search.accountId || search.archived ? "No matches." : "No recurring items yet."}</p>
            ) : (
              grouped.map((group) => (
                <div key={group.kind}>
                  <ListGroup label={kindLabel(group.kind)} />
                  {group.items.map((plan) => (
                    <ListRow
                      key={plan.id}
                      onOpen={() => {
                        setSelectedId(plan.id);
                        void openEditor("plan", { id: plan.id });
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
                        <DropdownMenuItem
                          className="min-h-11"
                          onSelect={() => {
                            const restore = plan.archivedAt !== null;
                            void confirm({
                              title: restore ? "Restore this?" : "Archive this?",
                              description: restore
                                ? `Restore ${plan.name}. It returns to the active list.`
                                : `Archive ${plan.name}. It leaves the active list.`,
                              confirmLabel: restore ? "Restore" : "Archive",
                            }).then((ok) => {
                              if (ok) {
                                archive.mutate({ id: plan.id, restore });
                              }
                            });
                          }}
                        >
                          {plan.archivedAt ? "Restore" : "Archive"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="min-h-11"
                          onSelect={() => {
                            setSelectedId(plan.id);
                            void openEditor("skipNext", { planId: plan.id, asOf });
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
          <PlanDetail plan={selected} currency={bookCurrency} asOf={asOf} onEdit={() => void openEditor("plan", { id: selected.id })} />
        ) : (
          <p className="text-sm text-muted-foreground">Add a recurring payment or recurring income to see its dates.</p>
        )}
      </div>
    </>
  );
}
