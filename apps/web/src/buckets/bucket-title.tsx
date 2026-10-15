import type { ReactNode } from "react";

/**
 * The first line of a bucket row: the name (it truncates) and its badges. In a narrow row (less than 42rem) the
 * amount column does not show, and `amount` goes at the end of this line.
 */
export function BucketTitle({ name, badges, amount, over }: { name: string; badges?: ReactNode; amount: ReactNode; over: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{name}</span>
      {badges}
      <span className={`ml-auto hidden shrink-0 pl-2 whitespace-nowrap @max-2xl:inline ${over ? "text-attn" : ""}`}>{amount}</span>
    </span>
  );
}
