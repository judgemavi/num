import type { ErrorCode, OverspentBucket } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { overspentQuery, useCoverBucket } from "@/api/buckets";
import { errorCode } from "@/api/client";
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
 * `errorText` gives the message of the screen for a write that failed.
 */
export function OverspentPanel({ errorText }: { errorText: (code: ErrorCode | undefined) => string }) {
  const { data: items } = useSuspenseQuery(overspentQuery());
  return (
    <SidePanel title="Overspent" text="Move money from another bucket to cover it.">
      {items.length === 0 ? <p className="text-sm text-muted-foreground">No bucket is overspent.</p> : null}
      {items.map((item) => (
        <CoverRow key={item.id} item={item} errorText={errorText} />
      ))}
    </SidePanel>
  );
}

/** One overspent bucket. The row does its own write, thus the message for a cover that failed shows under the row. */
function CoverRow({ item, errorText }: { item: OverspentBucket; errorText: (code: ErrorCode | undefined) => string }) {
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
        <p className="text-sm text-muted-foreground">No other bucket can cover this.</p>
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
      {cover.error ? (
        <p role="alert" className="text-sm text-attn">
          {errorText(errorCode(cover.error))}
        </p>
      ) : null}
    </div>
  );
}
