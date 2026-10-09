import { checkpointListSchema, checkpointSchema, type Checkpoint } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useEditors } from "@/editors/editor-api";
import { Amount } from "@/components/amount";
import { ListCard, ListRow } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
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
  const { confirm } = useEditors();
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

  async function unlock(item: Checkpoint) {
    const ok = await confirm({
      title: "Unlock this checkpoint?",
      description: `Transactions that only the ${formatDate(item.date)} checkpoint covers return to cleared. You can edit them again.`,
      confirmLabel: "Unlock checkpoint",
    });
    if (!ok) {
      return;
    }
    const result = await apiRequest(
      `/api/accounts/${accountId}/checkpoints/${item.id}/unlock`,
      checkpointSchema,
      { method: "POST" },
    );
    if (!result.ok) {
      setError(result.code === "checkpoint_unlocked" ? "This checkpoint is already unlocked." : "The checkpoint did not unlock. Try again.");
      return;
    }
    setError(null);
    await queryClient.invalidateQueries({ queryKey: ["checkpoints", accountId] });
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    await queryClient.invalidateQueries({ queryKey: ["needs-review"] });
    await queryClient.invalidateQueries({ queryKey: ["hygiene"] });
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
                <DropdownMenuItem className="min-h-11" onSelect={() => void unlock(item)}>
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
    </>
  );
}
