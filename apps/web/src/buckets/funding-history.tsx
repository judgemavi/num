import { Temporal } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { fundingMonthsQuery, useFundAgain, useUndoMonthFunding } from "@/api/funding";
import { useEditors } from "@/editors/editor-api";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function FundingHistory() {
  return (
    <Boundary loading="Loading funding history." failed="The funding history did not load.">
      <FundingMonths />
    </Boundary>
  );
}

function monthName(month: string): string {
  return Temporal.PlainDate.from(`${month}-01`).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function FundingMonths() {
  const { confirm } = useEditors();
  const { data: months } = useSuspenseQuery(fundingMonthsQuery());
  const undoMonth = useUndoMonthFunding();
  const fundAgain = useFundAgain();

  async function undo(month: string) {
    const ok = await confirm({
      title: `Undo the funding of ${monthName(month)}?`,
      description: "The money returns to Unassigned. The month is not funded again unless you choose Fund again.",
      confirmLabel: "Undo",
    });
    if (ok) {
      undoMonth.mutate(month);
    }
  }

  return (
    <ListCard label="Funding history">
      {months.length === 0 ? (
        <p className="px-5 py-5 text-muted-foreground">Nothing has been funded yet. Buckets fill from Unassigned each month.</p>
      ) : (
        months.map((item) => (
          <ListRow key={item.month} simple>
            <div className={listName}>
              {monthName(item.month)}
              {item.held ? <small>Undone</small> : null}
            </div>
            <div className={listAmt}>
              <Amount value={item.total} />
            </div>
            {item.held && item.month === localAsOf().slice(0, 7) ? (
              <Button type="button" variant="secondary" onClick={() => fundAgain.mutate(item.month)}>
                Fund again
              </Button>
            ) : item.held ? null : (
              <RowMenu label={`Actions for the funding of ${monthName(item.month)}`}>
                <DropdownMenuItem className="min-h-11" onSelect={() => void undo(item.month)}>
                  Undo
                </DropdownMenuItem>
              </RowMenu>
            )}
          </ListRow>
        ))
      )}
    </ListCard>
  );
}
