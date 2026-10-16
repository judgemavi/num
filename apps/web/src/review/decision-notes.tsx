import { useSuspenseQuery } from "@tanstack/react-query";
import { inboxDecisionsQuery, useUndoDecision } from "@/api/review";
import { Button } from "@/components/ui/button";
import { decisionText } from "@/review/format";

/** The answers that the person gave in Needs review for a transaction. Each answer has an Undo button. */
export function DecisionNotes({ transactionId, merchantId }: { transactionId?: string; merchantId?: string }) {
  const undo = useUndoDecision();
  const { data: decisions } = useSuspenseQuery({
    ...inboxDecisionsQuery(),
    select: (rows) =>
      rows.filter(
        (row) =>
          (merchantId !== undefined && row.decision === "not_recurring" && row.itemKey.includes(`:${merchantId}:`)) ||
          (transactionId !== undefined && row.decision === "not_transfer" && row.itemKey.split(":").includes(transactionId)) ||
          (transactionId !== undefined && row.decision === "keep_uncategorized" && row.itemKey === `uncategorized:${transactionId}`) ||
          (transactionId !== undefined && row.decision === "not_linked" && row.itemKey === `refund_link:${transactionId}`),
      ),
  });
  return (
    <>
      {decisions.map((row) => (
        <p key={row.itemKey} className="flex flex-wrap items-center gap-2 text-sm">
          <span>{decisionText(row.decision)}</span>
          <Button type="button" variant="outline" onClick={() => undo.mutate(row.itemKey)}>
            Undo
          </Button>
        </p>
      ))}
    </>
  );
}
