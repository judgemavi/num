import { planProposalKey, type Merchant, type RecurringSignals } from "@num/shared";
import { useState } from "react";
import { localAsOf } from "@/as-of";
import { createProposedPlan, decideItem } from "@/review/actions";
import { repeatLabel } from "@/review/format";
import { formatDate } from "@/transactions/format";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

type DetectedListProps = {
  signals: RecurringSignals;
  merchants: Merchant[];
  onDone: () => void;
};

export function ReviewList({ signals, merchants, onDone }: DetectedListProps) {
  const asOf = localAsOf();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const merchantName = new Map(merchants.map((merchant) => [merchant.id, merchant.name]));
  if (signals.proposals.length === 0) {
    return null;
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["recurring-signals"] });
    onDone();
  }

  return (
    <ListCard label="Detected" title="Detected">
      {error ? <p className="px-5 py-2 text-sm text-attn">{error}</p> : null}
      {signals.proposals.map((item) => {
        const name = merchantName.get(item.merchantId) ?? "Merchant";
        const itemKey = planProposalKey(item);
        return (
          <ListRow key={itemKey}>
            <div className={listName}>
              {name}
              <small>
                {repeatLabel(item.freq, item.interval)} from {formatDate(item.startDate)}
              </small>
            </div>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setPending(true);
                void createProposedPlan(item, name).then(async (result) => {
                  setPending(false);
                  if (!result.ok) {
                    setError("The plan was not created.");
                    return;
                  }
                  setError(null);
                  await refresh();
                });
              }}
            >
              {item.expectedAmount >= 0 ? "Add recurring income" : "Add a recurring payment"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setPending(true);
                void decideItem(asOf, itemKey, "not_recurring").then(async (result) => {
                  setPending(false);
                  if (!result.ok) {
                    setError("That answer did not save.");
                    return;
                  }
                  setError(null);
                  await refresh();
                });
              }}
            >
              Not recurring
            </Button>
          </ListRow>
        );
      })}
    </ListCard>
  );
}
