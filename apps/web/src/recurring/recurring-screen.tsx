import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Repeat } from "lucide-react";
import { useState } from "react";
import { PlanFilters } from "@/recurring/filters";
import { usePlanSearch } from "@/recurring/use-plan-search";
import { kindLabel, scheduleLabel } from "@/recurring/format";
import { PlanDetail } from "@/recurring/plan-detail";
import { useEditors } from "@/editors/editor-api";
import { ReviewList } from "@/recurring/review-list";
import { localAsOf } from "@/as-of";
import { planListQuery, recurringSignalsQuery, recurringSyncQuery, useArchivePlan } from "@/api/recurring";
import { Amount } from "@/components/amount";
import { ArchiveMenuItem } from "@/components/archive-menu-item";
import { Boundary } from "@/components/boundary";
import { IconTile } from "@/components/icon-tile";
import { PaydayIllustration } from "@/components/illustrations";
import { ListCard, ListGroup, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const hues = { income: "mint", bill: "lilac", transfer: "butter" } as const;

export function RecurringScreen() {
  return (
    <Boundary loading="Loading recurring." failed="Recurring did not load.">
      <RecurringPage />
    </Boundary>
  );
}

function RecurringPage() {
  const { shown } = usePlanSearch();
  const { openEditor } = useEditors();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const asOf = localAsOf();
  // The sync links the transactions that match an occurrence. The plans and the signals are read after the sync.
  useSuspenseQuery(recurringSyncQuery(asOf));
  // The list on the screen stays while the list for a new filter loads.
  const [{ data: plans }, { data: signals }] = useSuspenseQueries({ queries: [planListQuery(shown), recurringSignalsQuery(asOf)] });
  const archive = useArchivePlan();

  const rows = plans.items;
  const selected = rows.find((plan) => plan.id === selectedId) ?? rows[0] ?? null;
  const grouped = (["income", "bill", "transfer"] as const)
    .map((kind) => ({ kind, items: rows.filter((plan) => plan.kind === kind) }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <PageHeader
        kicker={rows.length === 1 ? "1 recurring" : `${plans.total} recurring`}
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
        amount={<span className="font-display text-5xl leading-none font-extrabold tabular-nums">{plans.total}</span>}
        hint="Payments and deposits you expect on a schedule."
        facts={
          <>
            <Fact label="Income">{rows.filter((plan) => plan.kind === "income").length}</Fact>
            <Fact label="Bills">{rows.filter((plan) => plan.kind === "bill").length}</Fact>
            <Fact label="Detected">{signals.proposals.length}</Fact>
          </>
        }
        illustration={<PaydayIllustration />}
      />
      <PlanFilters />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="grid gap-5">
          <ReviewList />
          <ListCard label="Recurring">
            {grouped.length === 0 ? (
              <p className="px-5 py-5 text-muted-foreground">{shown.q || shown.kind || shown.accountId || shown.archived ? "No matches." : "No recurring items yet."}</p>
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
                      <Amount value={plan.expectedAmount} />
                      <RowMenu label={`Actions for ${plan.name}`}>
                        <ArchiveMenuItem
                          archived={plan.archivedAt !== null}
                          question={(restore) => ({
                            title: restore ? "Restore this?" : "Archive this?",
                            description: restore
                              ? `Restore ${plan.name}. It returns to the active list.`
                              : `Archive ${plan.name}. It leaves the active list.`,
                            confirmLabel: restore ? "Restore" : "Archive",
                          })}
                          onConfirm={(restore) => archive.mutate({ id: plan.id, restore })}
                        />
                        <DropdownMenuItem
                          className="min-h-11"
                          onSelect={() => {
                            setSelectedId(plan.id);
                            void openEditor("skipNext", { planId: plan.id });
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
          <PlanDetail plan={selected} />
        ) : (
          <p className="text-sm text-muted-foreground">Add a recurring payment or recurring income to see its dates.</p>
        )}
      </div>
    </>
  );
}
