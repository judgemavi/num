import { z } from "zod";
import { isoDateSchema } from "./date";
import { dayDistance } from "./recurring-calc";

export const transferHintQuerySchema = z.object({
  accountId: z.uuid(),
  date: isoDateSchema,
  amount: z.coerce.number().int(),
});

export const transferHintSchema = z.object({
  accountId: z.uuid().nullable(),
});

export type OppositeRow = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  lineCount: number;
  reconciled: boolean;
};

/** The other account of one opposite unlinked transaction within ±3 days. */
export function oppositeTransferAccount(rows: OppositeRow[], input: { accountId: string; date: string; amount: number }): string | null {
  const wanted = -input.amount;
  const open = rows.filter(
    (row) => row.accountId !== input.accountId && row.amount === wanted && row.lineCount === 1 && !row.reconciled && dayDistance(row.date, input.date) <= 3,
  );
  open.sort((left, right) => {
    const distance = dayDistance(left.date, input.date) - dayDistance(right.date, input.date);
    if (distance !== 0) {
      return distance;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  return open[0]?.accountId ?? null;
}
