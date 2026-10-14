import { planProposalKey, type PlanCreate, type PlanProposal } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { recurringSignalsQuery, useSavePlan } from "@/api/recurring";
import { useDecideItem } from "@/api/review";
import { localAsOf } from "@/as-of";
import { useMerchantNames } from "@/editors/lookups";
import { repeatLabel } from "@/review/format";
import { formatDate } from "@/transactions/format";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { Button } from "@/components/ui/button";

function proposedPlan(item: PlanProposal, name: string): PlanCreate {
  return {
    name,
    kind: item.expectedAmount < 0 ? "bill" : "income",
    accountId: item.accountId,
    expectedAmount: item.expectedAmount,
    tolerance: item.tolerance,
    amountMode: item.amountMode,
    categoryId: null,
    transferAccountId: null,
    merchantId: item.merchantId,
    startDate: item.startDate,
    freq: item.freq,
    interval: item.interval,
    monthDay: item.monthDay,
    businessDayShift: "none",
    endDate: null,
    active: true,
    fundsBuckets: false,
  };
}

/** The plans that the app detected. The screen reads the same signals, thus this read does not start a request. */
export function ReviewList() {
  const asOf = localAsOf();
  const { data: signals } = useSuspenseQuery(recurringSignalsQuery(asOf));
  const merchantName = useMerchantNames();
  const create = useSavePlan();
  const decide = useDecideItem();
  const pending = create.isPending || decide.isPending;
  const error = create.isError ? "The plan was not created." : decide.isError ? "That answer did not save." : null;
  if (signals.proposals.length === 0) {
    return null;
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
                decide.reset();
                create.mutate({ id: null, body: proposedPlan(item, name) });
              }}
            >
              {item.expectedAmount >= 0 ? "Add recurring income" : "Add a recurring payment"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                create.reset();
                decide.mutate({ asOf, itemKey, decision: "not_recurring" });
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
