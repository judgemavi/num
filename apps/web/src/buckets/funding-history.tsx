import { fundingRunListSchema, fundingRunSchema, type FundingRun } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { bucketError, formatDate } from "@/buckets/format";
import { useEditors } from "@/editors/editor-api";
import { apiRequest } from "@/request";
import { Amount } from "@/components/amount";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type FundingHistoryProps = {
  currency: string;
  onDone: () => void;
};

export function FundingHistory({ currency, onDone }: FundingHistoryProps) {
  const { confirm } = useEditors();
  const [error, setError] = useState<string | null>(null);
  const runs = useQuery({
    queryKey: ["funding-runs"],
    queryFn: async () => {
      const result = await apiRequest("/api/funding/runs", fundingRunListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items;
    },
  });

  async function undo(run: FundingRun) {
    const ok = await confirm({
      title: "Undo this paycheck funding?",
      description: "The money returns to Unassigned. The funding record stays.",
      confirmLabel: "Undo",
    });
    if (!ok) {
      return;
    }
    const result = await apiRequest(`/api/funding/runs/${run.id}/undo`, fundingRunSchema, { method: "POST" });
    if (!result.ok) {
      setError(bucketError(result.code));
      return;
    }
    setError(null);
    await runs.refetch();
    onDone();
  }

  if (runs.isPending) {
    return <p className="text-muted-foreground">Loading funding history.</p>;
  }
  if (runs.isError || !runs.data) {
    return (
      <div className="grid gap-3">
        <p>The funding history did not load.</p>
        <Button type="button" onClick={() => void runs.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <>
      {error ? (
        <p role="alert" className="text-sm text-attn">
          {error}
        </p>
      ) : null}
      <ListCard label="Funding history">
        {runs.data.length === 0 ? (
          <p className="px-5 py-5 text-muted-foreground">No paycheck has been funded.</p>
        ) : (
          runs.data.map((run) => (
            <ListRow key={run.id} simple>
              <div className={listName}>
                {run.payee || "Paycheck"}
                <small>
                  {formatDate(run.date)}
                  {run.undoneAt ? " · Undone" : ""}
                </small>
              </div>
              <div className={listAmt}>
                <Amount currency={currency} minor={run.total} />
              </div>
              {run.undoneAt ? null : (
                <RowMenu label={`Actions for ${run.payee || "paycheck"} funding`}>
                  <DropdownMenuItem className="min-h-11" onSelect={() => void undo(run)}>
                    Undo
                  </DropdownMenuItem>
                </RowMenu>
              )}
            </ListRow>
          ))
        )}
      </ListCard>
    </>
  );
}
