import type { Occurrence, Plan } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { errorCode } from "@/api/client";
import { occurrencesQuery, useRestoreOccurrence, useUnlinkOccurrence } from "@/api/recurring";
import { inboxDecisionsQuery, useUndoDecision } from "@/api/review";
import { useEditors } from "@/editors/editor-api";
import { decisionText, inboxError } from "@/review/format";
import { formatDate, planError } from "@/recurring/format";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ListCard, ListGroup, ListRow, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { SidePanel } from "@/components/side-panel";

type PlanDetailProps = {
  plan: Plan;
  currency: string;
  asOf: string;
  onEdit: () => void;
};

function statusText(item: Occurrence): string | null {
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

export function PlanDetail({ plan, currency, asOf, onEdit }: PlanDetailProps) {
  const { openEditor } = useEditors();
  const decisions = useQuery(inboxDecisionsQuery());
  const occurrences = useQuery(occurrencesQuery(plan.id, asOf));
  const unlink = useUnlinkOccurrence();
  const restore = useRestoreOccurrence();
  const undoDecision = useUndoDecision();
  const planFailure = unlink.error ?? restore.error;
  const error = planFailure ? planError(errorCode(planFailure)) : undoDecision.error ? inboxError(errorCode(undoDecision.error)) : null;

  /** Remove the error of each request. A new action starts with no old message. */
  function clearErrors() {
    unlink.reset();
    restore.reset();
    undoDecision.reset();
  }

  const items = occurrences.data?.items ?? [];
  const past = items.filter((item) => item.dueDate < asOf).slice(-8);
  const upcoming = items.filter((item) => item.dueDate >= asOf).slice(0, 8);

  function rows(list: Occurrence[]) {
    if (list.length === 0) {
      return <p className="px-5 py-4 text-sm text-muted-foreground">None.</p>;
    }
    return list.map((item) => {
      const keptKey = `recurring_changed:${plan.id}:${item.dueDate}`;
      const kept = decisions.data?.some((row) => row.itemKey === keptKey && row.decision === "keep_plan_amount") ?? false;
      const note = kept ? decisionText("keep_plan_amount") : statusText(item);
      return (
        <ListRow key={item.dueDate} simple>
          <div className={listName}>
            {formatDate(item.dueDate)}
            {item.nominalDate !== item.dueDate ? <small>From {formatDate(item.nominalDate)}</small> : null}
            {note ? <small>{note}</small> : null}
          </div>
          <div className="text-right">
            <Amount currency={currency} minor={item.actualAmount ?? occurrences.data?.forecastAmount ?? plan.expectedAmount} />
          </div>
          <RowMenu label={`Actions for ${formatDate(item.dueDate)}`}>
            {item.transactionId ? (
              <DropdownMenuItem
                className="min-h-11"
                onSelect={() => {
                  clearErrors();
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
                  clearErrors();
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
                  clearErrors();
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
          <Button type="button" variant="secondary" onClick={onEdit}>
            Edit recurring
          </Button>
        }
      >
        {occurrences.data ? (
          <div className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Forecast</span>
            <Amount currency={currency} minor={occurrences.data.forecastAmount} />
            {plan.amountMode === "variable" ? (
              <span className="text-muted-foreground">
                Safe amount <Amount currency={currency} minor={occurrences.data.safeAmount} />
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading occurrences.</p>
        )}
      </SidePanel>
      {error ? (
        <p role="alert" className="text-sm text-attn">
          {error}
        </p>
      ) : null}
      <ListCard label="Occurrences">
        <ListGroup label="Upcoming" />
        {rows(upcoming)}
        <ListGroup label="Past" />
        {rows(past)}
      </ListCard>
    </div>
  );
}
