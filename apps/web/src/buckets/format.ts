import { Temporal, parseAmount, type Bucket, type BucketColor, type BucketIcon, type ErrorCode } from "@num/shared";
import { errorCode } from "@/api/client";
import { decimalsError, formatMoney } from "@/money";

const colors: Record<BucketColor, string> = {
  sky: "Blue",
  mint: "Green",
  lilac: "Purple",
  butter: "Yellow",
  pink: "Pink",
  teal: "Teal",
};

const icons: Record<BucketIcon, string> = {
  "shopping-cart": "Groceries",
  utensils: "Dining",
  fuel: "Fuel",
  smile: "Fun",
  package: "Household",
  shirt: "Clothing",
  "paw-print": "Pets",
  heart: "Health",
  shield: "Protection",
  gift: "Gifts",
  wrench: "Repairs",
  house: "Home",
  plane: "Travel",
  car: "Car",
  baby: "Children",
  briefcase: "Work",
  "piggy-bank": "Savings",
  wallet: "Cash",
  coffee: "Coffee",
  bus: "Transit",
};

export function colorLabel(color: BucketColor): string {
  return colors[color];
}

export function iconLabel(icon: BucketIcon): string {
  return icons[icon];
}

export function formatDate(iso: string): string {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function bucketDetail(bucket: Bucket, currency: string, essentialMonthly: number): string {
  if (bucket.kind === "emergency") {
    const months = bucket.months ?? 0;
    return `${months} ${months === 1 ? "month" : "months"} of essential spending · ${formatMoney(currency, essentialMonthly)} a month`;
  }
  if (bucket.kind === "spending") {
    return `${formatMoney(currency, bucket.refillTo ?? 0)} a month`;
  }
  if (bucket.kind === "sinking") {
    const due = bucket.dueDate ? `Due ${formatDate(bucket.dueDate)}` : "No due date";
    return bucket.repeat === "yearly" ? `${due} · every year` : due;
  }
  if (bucket.targetDate) {
    return `By ${formatDate(bucket.targetDate)}`;
  }
  return `${formatMoney(currency, bucket.fixedAmount ?? 0)} each month`;
}

export function barLabel(bucket: Bucket, currency: string, target: number): string {
  if (bucket.balance < 0) {
    return `Over by ${formatMoney(currency, -bucket.balance)}`;
  }
  const percent = target <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((bucket.balance * 100) / target)));
  return `${percent} percent`;
}

/** The target of a bucket that stores it. The target of the emergency bucket is calculated (`useBucketFigures`). */
export function bucketTarget(bucket: Bucket): number {
  if (bucket.kind === "spending") {
    return bucket.refillTo ?? 0;
  }
  if (bucket.kind === "sinking") {
    return bucket.amount ?? 0;
  }
  return bucket.target ?? 0;
}

export function bucketError(code: ErrorCode | undefined): string {
  if (code === "amount_too_precise") {
    return "An amount has more decimal places than the currency has.";
  }
  if (code === "category_in_bucket") {
    return "That category is already in a bucket. Remove it there first.";
  }
  if (code === "category_not_expense") {
    return "Only an expense category can be in a bucket.";
  }
  if (code === "category_archived") {
    return "That category is archived.";
  }
  if (code === "category_not_found" || code === "bucket_not_found") {
    return "That record was not found. Refresh the page.";
  }
  if (code === "bucket_archived") {
    return "That bucket is archived.";
  }
  if (code === "bucket_not_archived") {
    return "That bucket is not archived.";
  }
  if (code === "bucket_same") {
    return "Choose two different buckets.";
  }
  if (code === "bucket_not_overspent") {
    return "This bucket is no longer overspent.";
  }
  if (code === "bucket_short") {
    return "That bucket does not have enough to cover this.";
  }
  if (code === "bucket_balance") {
    return "The balance must be zero before you archive this bucket.";
  }
  if (code === "event_cover") {
    return "A cover from Unassigned cannot be undone.";
  }
  if (code === "event_month_funding") {
    return "This event is part of the funding of a month. Undo the month in the funding history.";
  }
  if (code === "bucket_emergency_exists") {
    return "The book has one emergency fund already.";
  }
  if (code === "funding_month_not_found") {
    return "That month has no funding to undo.";
  }
  if (code === "funding_month_held") {
    return "The funding of that month is already undone.";
  }
  if (code === "funding_month_not_held") {
    return "That month was not undone.";
  }
  if (code === "fund_over_unassigned") {
    return "That is more than Unassigned.";
  }
  if (code === "release_over_balance") {
    return "That is more than this bucket holds.";
  }
  if (code === "bucket_fields_invalid" || code === "invalid_body") {
    return "Check the bucket fields.";
  }
  return "That did not work. Try again.";
}

/** The message for a write that failed. `noAnswer` is the message when the API gave no error code. */
export function requestError(error: unknown, noAnswer: string): string {
  const code = errorCode(error);
  return code ? bucketError(code) : noAnswer;
}

/** The amount of money to move, in milliunits. The text of the error when the text is not an amount greater than zero. */
export function moveAmount(currency: string, text: string): { milli: number } | { error: string } {
  let milli = 0;
  try {
    milli = parseAmount(currency, text.trim());
  } catch {
    return { error: decimalsError(currency, text) ?? "Enter the amount as a number." };
  }
  return milli < 1 ? { error: "Enter an amount greater than zero." } : { milli };
}
