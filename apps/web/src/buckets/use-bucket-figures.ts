import type { Bucket } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { emergencyFundQuery } from "@/api/buckets";
import { fundingOwedQuery } from "@/api/funding";
import { localAsOf } from "@/as-of";
import { barLabel, bucketDetail, bucketTarget } from "@/buckets/format";
import { useBookCurrency } from "@/editors/lookups";
import { formatMoney } from "@/money";

/**
 * The figures of a bucket row: the target, the detail line and the label of the bar. The target of the emergency
 * bucket comes from the calculation of the API. The detail
 * line also shows what the bucket still owes for this month.
 */
export function useBucketFigures(bucket: Bucket) {
  const currency = useBookCurrency();
  const asOf = localAsOf();
  const { data: fund } = useSuspenseQuery(emergencyFundQuery(asOf));
  const { data: owed } = useSuspenseQuery(fundingOwedQuery(asOf));
  const still = owed.items.find((item) => item.bucketId === bucket.id)?.owed ?? 0;
  const base = bucketDetail(bucket, currency, fund?.monthly ?? 0);
  const target = bucket.kind === "emergency" ? (fund?.target ?? 0) : bucketTarget(bucket);
  return {
    target,
    detail: still > 0 ? `${base} · Still owed ${formatMoney(currency, still)} this month` : base,
    label: barLabel(bucket, currency, target),
  };
}
