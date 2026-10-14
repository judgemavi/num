import { planProposalKey, type PlanCreate, type PlanProposal } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { recurringSignalsQuery, useAddDetectedPlan } from "@/api/recurring";
import { useDecideItem } from "@/api/review";
import { localAsOf } from "@/as-of";
import { useCategoryNames, useMerchantNames } from "@/editors/lookups";
import { useEditors } from "@/editors/editor-api";
import { Amount } from "@/components/amount";
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
    categoryId: item.categoryId,
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
  const categoryName = useCategoryNames();
  const { openEditor } = useEditors();
  const create = useAddDetectedPlan();
  const decide = useDecideItem();
  const pending = create.isPending || decide.isPending;
  if (signals.proposals.length === 0) {
    return null;
  }

  return (
    <ListCard label="Detected" title="Detected">
      {signals.proposals.map((item) => {
        // A proposal for one amount has no name: the person names it in the form (decision 0054).
        const name = item.merchantId ? merchantName.get(item.merchantId) : item.categoryId ? categoryName.get(item.categoryId) : undefined;
        const itemKey = planProposalKey(item);
        const kind = item.expectedAmount < 0 ? "bill" : "income";
        return (
          <ListRow key={itemKey}>
            <div className={listName}>
              {name ?? <Amount value={item.expectedAmount} />}
              <small>
                {repeatLabel(item.freq, item.interval)} from {formatDate(item.startDate)}
              </small>
            </div>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                if (name) {
                  create.mutate(proposedPlan(item, name));
                } else {
                  void openEditor("plan", { id: null, seed: { ...item, name: "", kind } });
                }
              }}
            >
              {item.expectedAmount >= 0 ? "Add recurring income" : "Add a recurring payment"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
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
