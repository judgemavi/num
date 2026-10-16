import { accountClass, type Valuation } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { accountQuery } from "@/api/accounts";
import { valuationListQuery, useDeleteValuation } from "@/api/valuations";
import { useEditors } from "@/editors/editor-api";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { ListCard, ListEmpty, ListRow, ListTitle, listAmt, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatDate } from "@/date-format";

export function ValuationHistory({ accountId }: { accountId: string }) {
  const { openEditor } = useEditors();
  return (
    <ListCard
      label="Valuations"
      title="Valuations"
      actions={
        <Button type="button" variant="outline" onClick={() => void openEditor("valuation", { accountId, id: null })}>
          Add
        </Button>
      }
    >
      <Boundary look="rows" loading="Loading valuations." failed="The valuations did not load.">
        <ValuationRows accountId={accountId} />
      </Boundary>
    </ListCard>
  );
}

function ValuationRows({ accountId }: { accountId: string }) {
  const { openEditor, confirm } = useEditors();
  const remove = useDeleteValuation();
  // The loader starts valuations after it knows the account kind.
  const { data: account } = useSuspenseQuery(accountQuery(accountId));
  const { data: list } = useSuspenseQuery(valuationListQuery(accountId));
  const owed = accountClass(account.kind) === "liability";

  async function confirmDelete(item: Valuation) {
    const ok = await confirm({
      title: "Delete this valuation?",
      description: `Delete the valuation of ${formatDate(item.date)}. The account balance will use its other valuations and transactions.`,
      confirmLabel: "Delete",
    });
    if (ok) {
      remove.mutate({ accountId, id: item.id });
    }
  }

  if (list.items.length === 0) {
    return <ListEmpty>No valuations yet.</ListEmpty>;
  }
  return (
    <>
      {list.items.map((item) => (
        <ListRow
          key={item.id}
          size="simple"
          label={`Change the valuation on ${formatDate(item.date)}`}
          onOpen={() => void openEditor("valuation", { accountId, id: item.id })}
          menu={
            <RowMenu label={`Actions for the valuation on ${formatDate(item.date)}`}>
              <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("valuation", { accountId, id: item.id })}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => void confirmDelete(item)}>
                Delete
              </DropdownMenuItem>
            </RowMenu>
          }
        >
          <div className={listName}>
            <ListTitle name={formatDate(item.date)} amount={<Amount value={item.balance} owed={owed} />} />
            {item.note ? <small>{item.note}</small> : null}
          </div>
          <div className={listAmt}>
            <Amount value={item.balance} owed={owed} />
          </div>
        </ListRow>
      ))}
    </>
  );
}
