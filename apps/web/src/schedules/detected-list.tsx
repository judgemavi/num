import { planProposalKey, type PlanProposal } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useAddDetectedSchedule, scheduleSignalsQuery } from "@/api/schedules";
import { useDecideItem } from "@/api/review";
import { localAsOf } from "@/as-of";
import { useAccountLabels, useActiveBuckets, useBookCurrency, useCategoryNames, useMerchantNames } from "@/editors/lookups";
import { useEditors } from "@/editors/editor-api";
import { Amount } from "@/components/amount";
import { scheduleLabel } from "@/schedules/format";
import { scheduleBody, scheduleValues } from "@/schedules/schedule-values";
import { formatDate } from "@/transactions/format";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { Button } from "@/components/ui/button";

/** The schedules that the app detected. The screen reads the same signals, thus this read does not start a request. */
export function DetectedList() {
  const asOf = localAsOf();
  const { data: signals } = useSuspenseQuery(scheduleSignalsQuery(asOf));
  const currency = useBookCurrency();
  const { nextColor } = useActiveBuckets();
  const merchantName = useMerchantNames();
  const categoryName = useCategoryNames();
  const accountLabel = useAccountLabels();
  const { openEditor } = useEditors();
  const create = useAddDetectedSchedule();
  const decide = useDecideItem();
  const pending = create.isPending || decide.isPending;
  if (signals.proposals.length === 0) {
    return null;
  }

  /** With a name, one click adds the schedule. A proposal for one amount has no name: the person names it in the form (decision 0054). */
  function add(kind: "commitment" | "income", item: PlanProposal, name: string | undefined) {
    if (!name) {
      void openEditor(kind, { id: null, seed: { ...item, name: "" } });
      return;
    }
    const { body } = scheduleBody(currency, kind, scheduleValues(kind, { ...item, name }, nextColor), null);
    if (body) {
      create.mutate({ asOf, body });
    } else {
      void openEditor(kind, { id: null, seed: { ...item, name } });
    }
  }

  return (
    <ListCard label="Detected" title="Detected">
      {signals.proposals.map((item) => {
        const name = item.merchantId
          ? merchantName.get(item.merchantId)
          : item.transferAccountId
            ? accountLabel.get(item.transferAccountId)
            : item.categoryId
              ? categoryName.get(item.categoryId)
              : undefined;
        const itemKey = planProposalKey(item);
        return (
          <ListRow key={itemKey}>
            <div className={listName}>
              {name ?? "No merchant"}
              <small>
                {scheduleLabel(item)} from {formatDate(item.startDate)}
              </small>
            </div>
            <Amount value={item.expectedAmount} />
            {item.expectedAmount > 0 ? (
              <Button type="button" disabled={pending} onClick={() => add("income", item, name)}>
                Add as income
              </Button>
            ) : (
              <Button type="button" disabled={pending} onClick={() => add("commitment", item, name)}>
                Add as commitment
              </Button>
            )}
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
