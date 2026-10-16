import { matchDateWindowDays } from "./matching";
import { z } from "zod";
import { isoDateSchema } from "./date";
import { queryNumber } from "./list";
import { dayDistance } from "./date";

export const transferHintQuerySchema = z.object({
  accountId: z.uuid(),
  date: isoDateSchema,
  amount: queryNumber(),
});

export const transferHintSchema = z.object({
  accountId: z.uuid().nullable(),
});

type OppositeRow = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  lineCount: number;
};

/** The other account of one opposite unlinked transaction within ±3 days. */
export function oppositeTransferAccount(rows: OppositeRow[], input: { accountId: string; date: string; amount: number }): string | null {
  const wanted = -input.amount;
  const open = rows.filter(
    (row) => row.accountId !== input.accountId && row.amount === wanted && row.lineCount === 1 && dayDistance(row.date, input.date) <= matchDateWindowDays,
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
