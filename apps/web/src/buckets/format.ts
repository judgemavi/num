import { Temporal, type Bucket, type BucketColor, type BucketIcon, type ErrorCode } from "@num/shared";
import { formatMoney } from "@/money";

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

export function today(): string {
  return Temporal.Now.plainDateISO().toString();
}

export function bucketDetail(bucket: Bucket, currency: string): string {
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
  return `${formatMoney(currency, bucket.fixedAmount ?? 0)} each paycheck`;
}

export function barLabel(bucket: Bucket, currency: string): string {
  if (bucket.balance < 0) {
    return `Over by ${formatMoney(currency, -bucket.balance)}`;
  }
  const target = bucketTarget(bucket);
  const percent = target <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((bucket.balance * 100) / target)));
  return `${percent} percent`;
}

export function bucketTarget(bucket: Bucket): number {
  if (bucket.kind === "spending") {
    return bucket.refillTo ?? 0;
  }
  if (bucket.kind === "sinking") {
    return bucket.amount ?? 0;
  }
  return bucket.target ?? 0;
}

export function bucketError(code: ErrorCode): string {
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
  if (code === "bucket_fields_invalid" || code === "invalid_body") {
    return "Check the bucket fields.";
  }
  return "That did not work. Try again.";
}
