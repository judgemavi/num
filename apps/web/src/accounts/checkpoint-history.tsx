import { checkpointListSchema, checkpointSchema, type Checkpoint } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Amount } from "@/components/amount";
import { ListCard, ListRow } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/request";
import { formatDate } from "@/transactions/format";

type CheckpointHistoryProps = {
  accountId: string;
  currency: string;
  owed: boolean;
};

export function CheckpointHistory({ accountId, currency, owed }: CheckpointHistoryProps) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Checkpoint | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkpoints = useQuery({
    queryKey: ["checkpoints", accountId],
    queryFn: async () => {
      const result = await apiRequest(`/api/accounts/${accountId}/checkpoints`, checkpointListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items;
    },
  });

  async function unlock() {
    if (!pending) {
      return;
    }
    const result = await apiRequest(
      `/api/accounts/${accountId}/checkpoints/${pending.id}/unlock`,
      checkpointSchema,
      { method: "POST" },
    );
    if (!result.ok) {
      setError(result.code === "checkpoint_unlocked" ? "This checkpoint is already unlocked." : "The checkpoint did not unlock. Try again.");
      return;
    }
    setError(null);
    setPending(null);
    await queryClient.invalidateQueries({ queryKey: ["checkpoints", accountId] });
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    await queryClient.invalidateQueries({ queryKey: ["reconcile", accountId] });
    await queryClient.invalidateQueries({ queryKey: ["account", accountId] });
  }

  return (
    <>
      <ListCard label="Checkpoints" title="Checkpoints">
        {checkpoints.isPending ? <p className="px-5 py-5 text-muted-foreground">Loading checkpoints.</p> : null}
        {checkpoints.isError ? <p className="px-5 py-5">The checkpoints did not load.</p> : null}
        {checkpoints.data && checkpoints.data.length === 0 ? (
          <p className="px-5 py-5 text-muted-foreground">No checkpoints yet.</p>
        ) : null}
        {checkpoints.data?.map((item) => (
          <ListRow key={item.id} simple>
            <div className="list-name min-w-0 flex-1 font-semibold [&_small]:block [&_small]:text-[13px] [&_small]:font-normal [&_small]:text-muted-foreground">
              {formatDate(item.date)}
              <small>Statement balance</small>
            </div>
            {item.unlockedAt ? <Badge variant="neutral">Unlocked</Badge> : null}
            <div className="ml-auto text-right">
              <Amount currency={currency} minor={item.statementBalance} owed={owed} />
            </div>
            {item.unlockedAt ? null : (
              <RowMenu label={`Actions for the checkpoint on ${formatDate(item.date)}`}>
                <DropdownMenuItem className="min-h-11" onSelect={() => setPending(item)}>
                  Unlock
                </DropdownMenuItem>
              </RowMenu>
            )}
          </ListRow>
        ))}
      </ListCard>
      {error ? (
        <p role="alert" className="text-sm text-attn">
          {error}
        </p>
      ) : null}
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock this checkpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? `Transactions that only the ${formatDate(pending.date)} checkpoint covers return to cleared. You can edit them again.`
                : "Transactions from this checkpoint return to cleared."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void unlock()}>Unlock checkpoint</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
