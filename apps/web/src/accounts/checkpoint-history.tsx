import { accountClass, type Checkpoint } from "@num/shared";
import { useSuspenseQueries } from "@tanstack/react-query";
import { accountQuery } from "@/api/accounts";
import { checkpointListQuery, useUnlockCheckpoint } from "@/api/checkpoints";
import { useEditors } from "@/editors/editor-api";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { ListCard, ListRow } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatDate } from "@/transactions/format";

export function CheckpointHistory({ accountId }: { accountId: string }) {
  const { confirm } = useEditors();
  const unlockCheckpoint = useUnlockCheckpoint();

  async function unlock(item: Checkpoint) {
    const ok = await confirm({
      title: "Unlock this checkpoint?",
      description: `Transactions that only the ${formatDate(item.date)} checkpoint covers are not locked after this. You can edit them again.`,
      confirmLabel: "Unlock checkpoint",
    });
    if (ok) {
      unlockCheckpoint.mutate({ accountId, checkpointId: item.id });
    }
  }

  return (
    <>
      <ListCard label="Checkpoints" title="Checkpoints">
        <Boundary look="rows" loading="Loading checkpoints." failed="The checkpoints did not load.">
          <CheckpointRows accountId={accountId} onUnlock={(item) => void unlock(item)} />
        </Boundary>
      </ListCard>
    </>
  );
}

function CheckpointRows({ accountId, onUnlock }: { accountId: string; onUnlock: (item: Checkpoint) => void }) {
  // The route starts the two reads together.
  const [{ data: account }, { data: { items: checkpoints } }] = useSuspenseQueries({
    queries: [accountQuery(accountId), checkpointListQuery(accountId)],
  });
  const owed = accountClass(account.kind) === "liability";
  if (checkpoints.length === 0) {
    return <p className="px-5 py-5 text-muted-foreground">No checkpoints yet.</p>;
  }
  return checkpoints.map((item) => (
    <ListRow key={item.id} simple>
      <div className="list-name min-w-0 flex-1 font-semibold [&_small]:block [&_small]:text-[13px] [&_small]:font-normal [&_small]:text-muted-foreground">
        {formatDate(item.date)}
        <small>Statement balance</small>
      </div>
      {item.unlockedAt ? <Badge variant="neutral">Unlocked</Badge> : null}
      <div className="ml-auto text-right">
        <Amount value={item.statementBalance} owed={owed} />
      </div>
      {item.unlockedAt ? null : (
        <RowMenu label={`Actions for the checkpoint on ${formatDate(item.date)}`}>
          <DropdownMenuItem className="min-h-11" onSelect={() => onUnlock(item)}>
            Unlock
          </DropdownMenuItem>
        </RowMenu>
      )}
    </ListRow>
  ));
}
