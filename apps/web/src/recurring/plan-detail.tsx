import type { Occurrence, Plan } from "@num/shared";
import { useSuspenseQueries } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import { occurrencesQuery, useRestoreOccurrence, useUnlinkOccurrence } from "@/api/recurring";
import { inboxDecisionsQuery, useUndoDecision } from "@/api/review";
import { localAsOf } from "@/as-of";
import { useEditors } from "@/editors/editor-api";
import { decisionText } from "@/review/format";
import { formatDate } from "@/recurring/format";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ListCard, ListGroup, ListRow, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { SidePanel } from "@/components/side-panel";

type PlanDetailProps = {
  plan: Plan;
};

function statusText(item: Occurrence) {
  if (item.status === "linked") {
    return "Linked";
  }
  if (item.status === "skipped") {
    return item.reason ? `Skipped: ${item.reason}` : "Skipped";
  }
  if (item.status === "missed") {
    return "Missed";
  }
  if (item.status === "changed") {
    return "Amount changed";
  }
  return null;
}

export function PlanDetail(props: PlanDetailProps) {
  return (
    <Boundary loading="Loading occurrences." failed="The occurrences did not load.">
      <PlanOccurrences {...props} />
    </Boundary>
  );
}

function PlanOccurrences({ plan: chosen }: PlanDetailProps) {
  const { openEditor } = useEditors();
  const asOf = localAsOf();
  // The plan on the screen stays while the occurrences of a new plan load.
  const plan = useDeferredValue(chosen);
  const [{ data: decisions }, { data: occurrences }] = useSuspenseQueries({ queries: [inboxDecisionsQuery(), occurrencesQuery(plan.id, asOf)] });
  const unlink = useUnlinkOccurrence();
  const restore = useRestoreOccurrence();
  const undoDecision = useUndoDecision();
  const items = occurrences.items;
  const past = items.filter((item) => item.dueDate < asOf).slice(-8);
  const upcoming = items.filter((item) => item.dueDate >= asOf).slice(0, 8);

  function rows(list: Occurrence[]) {
    if (list.length === 0) {
      return <p className="px-5 py-4 text-sm text-muted-foreground">None.</p>;
    }
    return list.map((item) => {
      const keptKey = `recurring_changed:${plan.id}:${item.dueDate}`;
      const kept = decisions.some((row) => row.itemKey === keptKey && row.decision === "keep_plan_amount");
      const note = kept ? decisionText("keep_plan_amount") : statusText(item);
      return (
        <ListRow key={item.dueDate} simple>
          <div className={listName}>
            {formatDate(item.dueDate)}
            {item.nominalDate !== item.dueDate ? <small>From {formatDate(item.nominalDate)}</small> : null}
            {note ? <small>{note}</small> : null}
          </div>
          <div className="text-right">
            <Amount value={item.actualAmount ?? occurrences.forecastAmount} />
          </div>
          <RowMenu label={`Actions for ${formatDate(item.dueDate)}`}>
            {item.transactionId ? (
              <DropdownMenuItem
                className="min-h-11"
                onSelect={() => {
                  unlink.mutate({ planId: plan.id, dueDate: item.dueDate });
                }}
              >
                Remove link
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="min-h-11"
                onSelect={() => void openEditor("linkOccurrence", { planId: plan.id, accountId: plan.accountId, dueDate: item.dueDate })}
              >
                Link a transaction
              </DropdownMenuItem>
            )}
            {kept ? (
              <DropdownMenuItem
                className="min-h-11"
                onSelect={() => {
                  undoDecision.mutate(keptKey);
                }}
              >
                Undo
              </DropdownMenuItem>
            ) : null}
            {item.status === "skipped" ? (
              <DropdownMenuItem
                className="min-h-11"
                onSelect={() => {
                  restore.mutate({ planId: plan.id, dueDate: item.dueDate });
                }}
              >
                Restore this occurrence
              </DropdownMenuItem>
            ) : item.transactionId ? null : (
              <DropdownMenuItem
                className="min-h-11"
                onSelect={() => void openEditor("skipOccurrence", { planId: plan.id, dueDate: item.dueDate })}
              >
                Skip
              </DropdownMenuItem>
            )}
          </RowMenu>
        </ListRow>
      );
    });
  }

  return (
    <div className="grid gap-5">
      <SidePanel
        title={plan.name}
        text={plan.amountMode === "variable" ? "The amount changes each time. The forecast uses recent actuals." : "The amount stays the same."}
        action={
          <Button type="button" variant="secondary" onClick={() => void openEditor("plan", { id: plan.id })}>
            Edit recurring
          </Button>
        }
      >
        <div className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Forecast</span>
          <Amount value={occurrences.forecastAmount} />
          {plan.amountMode === "variable" ? (
            <span className="text-muted-foreground">
              Safe amount <Amount value={occurrences.safeAmount} />
            </span>
          ) : null}
        </div>
      </SidePanel>
      <ListCard label="Occurrences">
        <ListGroup label="Upcoming" />
        {rows(upcoming)}
        <ListGroup label="Past" />
        {rows(past)}
      </ListCard>
    </div>
  );
}
