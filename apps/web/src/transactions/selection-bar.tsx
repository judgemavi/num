import type { TransactionListItem } from "@num/shared";
import { useApproveSelected } from "@/api/review";
import { ActionBar } from "@/components/action-bar";
import { Button } from "@/components/ui/button";
import { useEditors } from "@/editors/editor-api";
import { useSelection } from "@/transactions/selection-state";
import { useTransactionPage } from "@/transactions/use-transaction-list";

/**
 * True when Approve applies something to the row: its automatic label, or a suggestion that the row can take. A row
 * with a question or with no suggestion is skipped (decision 0051).
 */
function canApprove(row: TransactionListItem) {
  const review = row.review;
  if (!review || review.question !== "categorize") {
    return false;
  }
  if (review.level === "sure") {
    return true;
  }
  const suggestion = review.suggestion;
  return suggestion !== null && !(suggestion.transferAccountId !== null && row.reconciled);
}

/** "N selected", "Approve · N", "Edit…" and "Clear" while one or more rows of the page are selected (decision 0051). */
export function SelectionBar() {
  const selection = useSelection();
  const { page } = useTransactionPage();
  const approve = useApproveSelected();
  const { openEditor } = useEditors();
  const rows = selection ? page.items.filter((row) => selection.ids.has(row.id)) : [];
  if (!selection || rows.length === 0) {
    return null;
  }
  const ids = rows.map((row) => row.id);
  const approvable = rows.filter(canApprove).length;

  return (
    <ActionBar label="Selected transactions">
      <span className="text-sm font-semibold whitespace-nowrap">{`${rows.length} selected`}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
        disabled={approvable === 0 || approve.isPending}
        onClick={() => approve.mutate(ids, { onSuccess: () => selection.clear() })}
      >
        {`Approve · ${approvable}`}
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={() =>
          void openEditor("bulkEdit", { ids }).then((saved) => {
            if (saved) {
              selection.clear();
            }
          })
        }
      >
        Edit…
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
        onClick={selection.clear}
      >
        Clear
      </Button>
    </ActionBar>
  );
}
