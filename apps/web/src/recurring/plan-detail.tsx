import {
  occurrenceLinkSchema,
  occurrenceListSchema,
  transactionListSchema,
  type Occurrence,
  type Plan,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatDate, planError } from "@/recurring/format";
import { OptionCombobox } from "@/transactions/option-combobox";
import { apiRequest } from "@/request";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  const queryClient = useQueryClient();
  const [skipDue, setSkipDue] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [linkDue, setLinkDue] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const occurrences = useQuery({
    queryKey: ["occurrences", plan.id, asOf],
    queryFn: async () => {
      const result = await apiRequest(`/api/recurring/${plan.id}/occurrences?asOf=${asOf}`, occurrenceListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  const candidates = useQuery({
    queryKey: ["plan-transactions", plan.accountId, linkDue],
    enabled: linkDue !== null,
    queryFn: async () => {
      const params = new URLSearchParams({ accountId: plan.accountId, pageSize: "200" });
      const result = await apiRequest(`/api/transactions?${params.toString()}`, transactionListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items;
    },
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["occurrences", plan.id] });
    await queryClient.invalidateQueries({ queryKey: ["recurring-signals"] });
    await queryClient.invalidateQueries({ queryKey: ["recurring-sync"] });
  }

  async function post(path: string, body?: unknown) {
    const result = await apiRequest(`/api/recurring/${plan.id}/occurrences/${path}`, occurrenceLinkSchema, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!result.ok) {
      setError(planError(result.code));
      return;
    }
    setError(null);
    setSkipDue(null);
    setLinkDue(null);
    setReason("");
    setTransactionId(null);
    await refresh();
  }

  const items = occurrences.data?.items ?? [];
  const past = items.filter((item) => item.dueDate < asOf).slice(-8);
  const upcoming = items.filter((item) => item.dueDate >= asOf).slice(0, 8);

  function rows(list: Occurrence[]) {
    if (list.length === 0) {
      return <p className="px-5 py-4 text-sm text-muted-foreground">None.</p>;
    }
    return list.map((item) => {
      const note = statusText(item);
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
              <DropdownMenuItem className="min-h-11" onSelect={() => void post(`${item.dueDate}/unlink`)}>
                Remove link
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="min-h-11" onSelect={() => setLinkDue(item.dueDate)}>
                Link a transaction
              </DropdownMenuItem>
            )}
            {item.status === "skipped" ? (
              <DropdownMenuItem className="min-h-11" onSelect={() => void post(`${item.dueDate}/restore`)}>
                Restore this occurrence
              </DropdownMenuItem>
            ) : item.transactionId ? null : (
              <DropdownMenuItem
                className="min-h-11"
                onSelect={() => {
                  setReason("");
                  setSkipDue(item.dueDate);
                }}
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
            Edit plan
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
      <Dialog open={skipDue !== null} onOpenChange={(open) => !open && setSkipDue(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip this occurrence</DialogTitle>
            <DialogDescription>Tell why this one will not happen. You can restore it later.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="skip-reason">Reason</FieldLabel>
            <Input id="skip-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          {reason.trim().length === 0 ? <FieldError>Enter a reason.</FieldError> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSkipDue(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={reason.trim().length === 0} onClick={() => skipDue && void post(`${skipDue}/skip`, { reason: reason.trim() })}>
              Skip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={linkDue !== null} onOpenChange={(open) => !open && setLinkDue(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link a transaction</DialogTitle>
            <DialogDescription>Choose a transaction on this account.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="link-transaction">Transaction</FieldLabel>
            <OptionCombobox
              id="link-transaction"
              value={transactionId}
              options={(candidates.data ?? []).map((item) => ({
                id: item.id,
                label: `${formatDate(item.date)} · ${item.payeeRaw}`,
              }))}
              placeholder="Choose a transaction"
              onChange={setTransactionId}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinkDue(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!transactionId}
              onClick={() => linkDue && transactionId && void post(`${linkDue}/link`, { transactionId })}
            >
              Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
