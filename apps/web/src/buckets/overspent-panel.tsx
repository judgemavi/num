import type { OverspentBucket } from "@num/shared";
import { useOverspent } from "@/buckets/use-overspent";
import { useCoverBucket } from "@/api/buckets";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { SidePanel } from "@/components/side-panel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveBuckets } from "@/editors/lookups";
import { useAppForm } from "@/forms/form-hook";

/**
 * The buckets that stay below zero after the fill, and the control that covers each one with money from a second
 * bucket. The fill covers a negative bucket from Unassigned, thus the panel shows only what Unassigned could not
 * cover.
 */
export function OverspentPanel() {
  const items = useOverspent();
  if (items.length === 0) {
    return null;
  }
  return (
    <SidePanel title="Overspent" text="Unassigned could not cover these buckets. Move money from another bucket, or release money from a bucket to Unassigned.">
      {items.map((item) => (
        <CoverRow key={item.id} item={item} />
      ))}
    </SidePanel>
  );
}

/** One overspent bucket. The row does its own write. A cover that fails shows an error toast. */
function CoverRow({ item }: { item: OverspentBucket }) {
  const cover = useCoverBucket();
  const need = -item.balance;
  const options = useActiveBuckets().items.filter((bucket) => bucket.id !== item.id && bucket.balance >= need);
  const form = useAppForm({
    defaultValues: { fromBucketId: "" },
    onSubmit: ({ value }) => cover.mutate({ id: item.id, body: { fromBucketId: value.fromBucketId, date: localAsOf() } }),
  });
  return (
    <div className="grid gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <p className="font-semibold">
        {item.name}
        <span className="mt-0.5 block text-sm font-normal text-attn">
          Over by <Amount value={need} />
        </span>
      </p>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">No other bucket has enough to cover this.</p>
      ) : (
        <form.Field name="fromBucketId">
          {(field) => (
            <div className="grid gap-2">
              <Select value={field.state.value || undefined} onValueChange={field.handleChange}>
                <SelectTrigger aria-label={`Cover ${item.name} from`} className="w-full">
                  <SelectValue placeholder="Cover from" />
                </SelectTrigger>
                <SelectContent>
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
