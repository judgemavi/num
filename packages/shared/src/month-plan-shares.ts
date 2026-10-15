import { Temporal } from "temporal-polyfill";
import { floorToStep } from "./currency";

export function surplusShares(
  surplus: number,
  buckets: readonly { bucketId: string; monthly: number; dueDate: string | null }[],
  step: number,
) {
  const blocked = buckets.filter((bucket) => bucket.dueDate !== null && surplus - (buckets.reduce((sum, item) => sum + item.monthly, 0) - bucket.monthly) <= 0);
  const shares = new Map<string, number>();
  if (surplus <= 0 || blocked.length === 0) {
    return shares;
  }
  const total = blocked.reduce((sum, bucket) => sum + bucket.monthly, 0);
  let left = surplus;
  blocked.forEach((bucket, index) => {
    const share = index === blocked.length - 1 ? left : floorToStep((surplus * bucket.monthly) / total, step);
    shares.set(bucket.bucketId, share);
    left -= share;
  });
  return shares;
}

/** The first day of the month that is `months` months after `month` (YYYY-MM). */
export function firstOfMonthAfter(month: string, months: number) {
  return Temporal.PlainDate.from(`${month}-01`).add({ months }).toString();
}
