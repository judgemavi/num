import type { TransactionListQuery } from "@num/shared";
import { errorCode } from "@/api/client";
import { useApproveLevel, type ApproveLevel } from "@/api/review";
import { useTransactionListFetching } from "@/api/transactions";
import { localAsOf } from "@/as-of";
import { useEditors } from "@/editors/editor-api";
import { inboxError } from "@/review/format";
import { levelLabel } from "@/transactions/format";
import { filterBody } from "@/transactions/query";

/** "Approve all" for one level of the Transactions table: the confirmation, the write and its message. */
export function useApproveAll(search: TransactionListQuery) {
  const { confirm } = useEditors();
  const approveLevel = useApproveLevel();
  const listLoading = useTransactionListFetching();

  function message() {
    if (approveLevel.error) {
      return inboxError(errorCode(approveLevel.error));
    }
    if (approveLevel.data?.changed && approveLevel.data.left === 0) {
      return `Nothing is left to approve in ${levelLabel(approveLevel.data.level)}.`;
    }
    return null;
  }

  async function approve(level: ApproveLevel, count: number) {
    if (count === 0) {
      return;
    }
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
      { asOf: localAsOf(), filter: filterBody(search), level, count },
      {
        onSuccess: (result) => {
          if (result.changed && result.left > 0) {
            void approve(level, result.left);
          }
        },
      },
    );
  }

  return {
    approve,
    /** The counts in the table are old from the write until the list has the new rows. */
    busy: approveLevel.isPending || (approveLevel.isSuccess && listLoading),
    message: message(),
  };
}
