import { planProposalKey, type PlanProposal } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDecideItem } from "@/api/review";
import { scheduleSignalsQuery } from "@/api/schedules";
import { localAsOf } from "@/as-of";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ItemActions } from "@/components/ui/item";
import { useEditors } from "@/editors/editor-api";
import { useAccountLabels, useBookCurrency, useCategoryNames, useMerchantNames } from "@/editors/lookups";
import { formatMoney } from "@/money";
import { scheduleLabel } from "@/schedules/format";

/**
 * The schedules that the app detected. "Add" and a click on the row open the bill or income editor, filled with the
 * suggestion. The person checks the values, then saves. The screen starts this read before the list renders.
 */
export function DetectedList() {
  const asOf = localAsOf();
  const { data: signals } = useSuspenseQuery(scheduleSignalsQuery(asOf));
  const currency = useBookCurrency();
  const merchantName = useMerchantNames();
  const categoryName = useCategoryNames();
  const accountLabel = useAccountLabels();
  const { openEditor } = useEditors();
  const decide = useDecideItem();
  if (signals.proposals.length === 0) {
    return null;
  }

  /** A proposal for one amount has no name: the person names it in the form. */
  function nameOf(item: PlanProposal) {
    if (item.merchantId) {
      return merchantName.get(item.merchantId);
    }
    if (item.transferAccountId) {
      return accountLabel.get(item.transferAccountId);
    }
    return item.categoryId ? categoryName.get(item.categoryId) : undefined;
  }

  return (
    <ListCard label="Detected" title="Detected">
      {signals.proposals.map((item) => {
        const name = nameOf(item);
        const itemKey = planProposalKey(item);
        const add = () => void openEditor(item.expectedAmount > 0 ? "income" : "commitment", { id: null, seed: { ...item, name: name ?? "" } });
        return (
          <ListRow
            key={itemKey}
            label={name ?? "No merchant"}
            onOpen={add}
            menu={
              <RowMenu label={`Actions for ${name ?? "this suggestion"}`}>
                <DropdownMenuItem className="min-h-11" disabled={decide.isPending} onSelect={() => decide.mutate({ asOf, itemKey, decision: "not_recurring" })}>
                  Not recurring
                </DropdownMenuItem>
              </RowMenu>
            }
          >
            <div className={listName}>
              <span className="block truncate">{name ?? "No merchant"}</span>
              <small>
                {formatMoney(currency, Math.abs(item.expectedAmount))} · {scheduleLabel(item)}
              </small>
            </div>
            <ItemActions className="relative z-10">
              <Button type="button" variant="secondary" onClick={add}>
                Add
              </Button>
            </ItemActions>
          </ListRow>
        );
      })}
    </ListCard>
  );
}
