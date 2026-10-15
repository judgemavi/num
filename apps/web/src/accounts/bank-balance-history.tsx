import { accountClass, type BankBalance } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { accountQuery } from "@/api/accounts";
import { bankBalanceListQuery, useDeleteBankBalance } from "@/api/bank-balances";
import { BankStatusActions, BankStatusText } from "@/accounts/bank-status";
import { useEditors } from "@/editors/editor-api";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { ListCard, ListRow } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatDate } from "@/transactions/format";

export function BankBalanceHistory({ accountId }: { accountId: string }) {
  const { openEditor } = useEditors();
  return (
    <ListCard
      label="Bank balance"
      title="Bank balance"
      actions={
        <Button type="button" variant="outline" onClick={() => void openEditor("bankBalance", { accountId, id: null })}>
          Add
        </Button>
      }
    >
      <Boundary look="rows" loading="Loading bank balances." failed="The bank balances did not load.">
        <BankBalanceRows accountId={accountId} />
      </Boundary>
    </ListCard>
  );
}

function BankBalanceRows({ accountId }: { accountId: string }) {
  const { openEditor, confirm } = useEditors();
  const remove = useDeleteBankBalance();
  // The route starts the two reads together.
  const { data: account } = useSuspenseQuery(accountQuery(accountId));
  const { data: list } = useSuspenseQuery(bankBalanceListQuery(accountId));
  const owed = accountClass(account.kind) === "liability";

  async function confirmDelete(item: BankBalance) {
    const ok = await confirm({
      title: "Delete this bank balance?",
      description: `Delete the bank balance of ${formatDate(item.date)}. Your transactions stay as they are.`,
      confirmLabel: "Delete",
    });
    if (ok) {
      remove.mutate({ accountId, id: item.id });
    }
  }

  if (list.items.length === 0) {
    return <p className="px-5 py-5 text-muted-foreground">No bank balance yet. Add the balance that your bank shows on a date.</p>;
  }
  return (
    <>
      {list.status ? (
        <div className="px-5 py-3 text-sm [&_small]:text-sm">
          <BankStatusText kind={account.kind} status={list.status} />
        </div>
      ) : null}
      {list.status ? <BankStatusActions status={list.status} /> : null}
      {list.items.map((item) => (
        <ListRow key={item.id} simple>
          <div className="list-name min-w-0 flex-1 font-semibold [&_small]:block [&_small]:text-[13px] [&_small]:font-normal [&_small]:text-muted-foreground">
            {formatDate(item.date)}
            <small>{item.importBatchId ? "From an import" : "Added by you"}</small>
          </div>
          <div className="ml-auto text-right">
            <Amount value={item.balance} owed={owed} />
          </div>
          <RowMenu label={`Actions for the bank balance on ${formatDate(item.date)}`}>
            <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("bankBalance", { accountId, id: item.id })}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onSelect={() => void confirmDelete(item)}>
              Delete
            </DropdownMenuItem>
          </RowMenu>
        </ListRow>
      ))}
    </>
  );
}
