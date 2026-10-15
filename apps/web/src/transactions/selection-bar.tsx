import type { TransactionListItem } from "@num/shared";
import { useApproveSelected } from "@/api/review";
import { ActionBar } from "@/components/action-bar";
import { Button } from "@/components/ui/button";
import { useEditors } from "@/editors/editor-api";
import { useSelection } from "@/transactions/selection-state";
import { useOnReview, useTransactionPage } from "@/transactions/use-transaction-list";

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
  return suggestion !== null;
}

/** "Approve · N" for the selected rows. Only the Needs review page has it. */
function ApproveSelected({ rows, onApproved }: { rows: TransactionListItem[]; onApproved: () => void }) {
  const approve = useApproveSelected();
  const approvable = rows.filter(canApprove).length;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
      disabled={approvable === 0 || approve.isPending}
      onClick={() => approve.mutate(rows.map((row) => row.id), { onSuccess: onApproved })}
    >
      {`Approve · ${approvable}`}
    </Button>
  );
}

/**
 * "N selected", "Edit…" and "Clear" while one or more rows of the page are selected. The Needs review page also has
 * "Approve · N" (decision 0051).
 */
export function SelectionBar() {
  const selection = useSelection();
  const review = useOnReview();
  const { page } = useTransactionPage();
  const { openEditor } = useEditors();
  const rows = selection ? page.items.filter((row) => selection.ids.has(row.id)) : [];
  if (!selection || rows.length === 0) {
    return null;
  }
  const ids = rows.map((row) => row.id);

  return (
    <ActionBar label="Selected transactions">
      <span className="text-sm font-semibold whitespace-nowrap">{`${rows.length} selected`}</span>
      {review ? <ApproveSelected rows={rows} onApproved={selection.clear} /> : null}
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
