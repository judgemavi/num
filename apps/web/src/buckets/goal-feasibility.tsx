import { Temporal } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { feasibilityQuery } from "@/api/feasibility";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { ListRow, listAmt, listName } from "@/components/list-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEditors } from "@/editors/editor-api";

function longDate(iso: string) {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

/** The check that the goals and the sinking funds fit in the income of the month. It reads the feasibility of this month. */
export function GoalFeasibility() {
  const { openEditor } = useEditors();
  const item = useSuspenseQuery(feasibilityQuery(localAsOf())).data.feasibility;
  if (!item || (item.shortfall === 0 && item.buckets.length === 0)) {
    return null;
  }
  return (
    <Card>
      <CardHeader className="px-5 pt-5">
        <CardTitle className="text-base font-bold">Goal feasibility</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-0 pb-5">
        <p className="px-5">
          Income is <Amount value={item.income} /> a month. Bills take <Amount value={item.commitments} />. Spending refills take <Amount value={item.refills} />. <Amount value={item.surplus} /> is left for goals and sinking funds.
        </p>
        {item.shortfall > 0 ? (
          <p className="px-5 font-semibold text-attn">
            Goals and sinking funds need <Amount value={item.need} className="text-attn" /> a month. That is <Amount value={item.shortfall} className="text-attn" /> short. Cut <Amount value={item.shortfall} className="text-attn" /> from other buckets each month.
          </p>
        ) : (
          <p className="px-5">These amounts fit in your monthly income.</p>
        )}
        {item.buckets.map((bucket) => (
          <ListRow key={bucket.bucketId} size="simple" label={bucket.name} onOpen={() => void openEditor("bucket", { id: bucket.bucketId })}>
            <span className={listName}>
              {bucket.name}
              {bucket.laterDate ? <small>A date of {longDate(bucket.laterDate)} fits.</small> : null}
            </span>
            <span className={listAmt}>
              <Amount value={bucket.monthly} />
              <small>a month</small>
            </span>
          </ListRow>
        ))}
      </CardContent>
    </Card>
  );
}
