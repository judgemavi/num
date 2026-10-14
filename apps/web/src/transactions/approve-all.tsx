import { useIsMutating } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApproveLevel, type ApproveLevel } from "@/api/review";
import { useTransactionListFetching } from "@/api/transactions";
import { localAsOf } from "@/as-of";
import { Button } from "@/components/ui/button";
import { useEditors } from "@/editors/editor-api";
import { levelLabel } from "@/transactions/format";
import { filterBody } from "@/transactions/query";
import { useTransactionPage } from "@/transactions/use-transaction-list";

const levels: ApproveLevel[] = ["sure", "likely"];

/**
 * "Approve all Sure · N" and "Approve all Likely · N" in the header of Needs review (decision 0047). The counts are for
 * the rows that match the filters, on every page.
 */
export function ApproveAll() {
  const { confirm } = useEditors();
  const { shown, page } = useTransactionPage();
  const approveLevel = useApproveLevel();
  const listLoading = useTransactionListFetching();
  const writing = useIsMutating() > 0;
  // The counts are old from the write until the list has the new rows.
  const busy = writing || approveLevel.isPending || (approveLevel.isSuccess && listLoading);
  const counts = page.reviewCounts;
  if (counts === null) {
    return null;
  }

  async function approve(level: ApproveLevel, count: number) {
    const name = levelLabel(level);
    const ok = await confirm({
      title: `Approve all ${count} ${name}?`,
      description: `This confirms ${count} ${count === 1 ? "transaction" : "transactions"} on every page that match your filters. Each one counts as your answer.`,
      confirmLabel: `Approve all ${count} ${name}`,
    });
    if (!ok) {
      return;
    }
    approveLevel.mutate(
      { asOf: localAsOf(), filter: filterBody(shown), level, count },
      {
        onSuccess: (result) => {
          if (!result.changed) {
            return;
          }
          if (result.left > 0) {
            void approve(level, result.left);
          } else {
            toast.info(`Nothing is left to approve in ${name}.`);
          }
        },
      },
    );
  }

  return levels.map((level) => (
    <Button key={level} type="button" variant="secondary" disabled={busy || counts[level] === 0} onClick={() => void approve(level, counts[level])}>
      {`Approve all ${levelLabel(level)} · ${counts[level]}`}
    </Button>
  ));
}
