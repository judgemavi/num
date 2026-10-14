import type { OverspentBucket } from "@num/shared";
import { usePrefetchQuery, useSuspenseQuery } from "@tanstack/react-query";
import { overspentQuery, useCoverBucket } from "@/api/buckets";
import { fundingPositionQuery } from "@/api/funding";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { SidePanel } from "@/components/side-panel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveBuckets } from "@/editors/lookups";
import { useAppForm } from "@/forms/form-hook";

/**
 * The overspent buckets, and the control that covers each one with money from a second bucket.
 * The panel reads the overspent buckets. Each row keeps its choice and does the write.
 */
export function OverspentPanel() {
  // Each row reads Unassigned. That read starts here, together with the read of the overspent buckets.
  usePrefetchQuery(fundingPositionQuery(localAsOf()));
  const { data: items } = useSuspenseQuery(overspentQuery());
  return (
    <SidePanel title="Overspent" text="Cover it from another bucket or from Unassigned.">
      {items.length === 0 ? <p className="text-sm text-muted-foreground">No bucket is overspent.</p> : null}
      {items.map((item) => (
        <CoverRow key={item.id} item={item} />
      ))}
    </SidePanel>
  );
}

/** The choice of the select that takes the money from Unassigned. A bucket choice is a bucket id. */
const unassigned = "unassigned";

/** One overspent bucket. The row does its own write. A cover that fails shows an error toast. */
function CoverRow({ item }: { item: OverspentBucket }) {
  const cover = useCoverBucket();
  const asOf = localAsOf();
  const { data: position } = useSuspenseQuery(fundingPositionQuery(asOf));
  const need = -item.balance;
  const fromUnassigned = position.unassigned >= need;
  const options = useActiveBuckets().items.filter((bucket) => bucket.id !== item.id && bucket.balance >= need);
  const form = useAppForm({
    defaultValues: { fromBucketId: "" },
    onSubmit: ({ value }) =>
      cover.mutate({ id: item.id, asOf, body: { fromBucketId: value.fromBucketId === unassigned ? null : value.fromBucketId, date: asOf } }),
  });
  return (
    <div className="grid gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <p className="font-semibold">
        {item.name}
        <span className="mt-0.5 block text-sm font-normal text-attn">
          Over by <Amount value={need} />
        </span>
      </p>
      {options.length === 0 && !fromUnassigned ? (
        <p className="text-sm text-muted-foreground">No other bucket and not enough Unassigned money can cover this.</p>
      ) : (
        <form.Field name="fromBucketId">
          {(field) => (
            <div className="grid gap-2">
              <Select value={field.state.value || undefined} onValueChange={field.handleChange}>
                <SelectTrigger aria-label={`Cover ${item.name} from`} className="w-full">
                  <SelectValue placeholder="Cover from" />
                </SelectTrigger>
                <SelectContent>
                  {fromUnassigned ? <SelectItem value={unassigned}>Unassigned</SelectItem> : null}
                  {options.map((bucket) => (
                    <SelectItem key={bucket.id} value={bucket.id}>
                      {bucket.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" disabled={!field.state.value} onClick={() => void form.handleSubmit()}>
                Cover
              </Button>
            </div>
          )}
        </form.Field>
      )}
    </div>
  );
}
