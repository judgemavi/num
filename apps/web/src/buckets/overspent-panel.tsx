import type { ErrorCode } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { overspentQuery, useCoverBucket } from "@/api/buckets";
import { errorCode } from "@/api/client";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { SidePanel } from "@/components/side-panel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveBuckets } from "@/editors/lookups";

/**
 * The overspent buckets, and the control that covers each one with money from a second bucket.
 * The panel reads the overspent buckets and the buckets that can cover them. It keeps the chosen buckets and does the write.
 * `errorText` gives the message of the screen for a write that failed.
 */
export function OverspentPanel({ errorText }: { errorText: (code: ErrorCode | undefined) => string }) {
  const { data: items } = useSuspenseQuery(overspentQuery());
  const pool = useActiveBuckets().items;
  const [coverFrom, setCoverFrom] = useState<Record<string, string>>({});
  const cover = useCoverBucket();
  return (
    <SidePanel title="Overspent" text="Move money from another bucket to cover it.">
      {cover.error ? (
        <p role="alert" className="text-sm text-attn">
          {errorText(errorCode(cover.error))}
        </p>
      ) : null}
      {items.length === 0 ? <p className="text-sm text-muted-foreground">No bucket is overspent.</p> : null}
      {items.map((item) => {
        const need = -item.balance;
        const options = pool.filter((bucket) => bucket.id !== item.id && bucket.balance >= need);
        const fromBucketId = coverFrom[item.id];
        return (
          <div key={item.id} className="grid gap-2 border-t pt-3 first:border-t-0 first:pt-0">
            <p className="font-semibold">
              {item.name}
              <span className="mt-0.5 block text-sm font-normal text-attn">
                Over by <Amount minor={need} />
              </span>
            </p>
            {options.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other bucket can cover this.</p>
            ) : (
              <div className="grid gap-2">
                <Select value={fromBucketId} onValueChange={(value) => setCoverFrom((current) => ({ ...current, [item.id]: value }))}>
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
                <Button
                  type="button"
                  disabled={!fromBucketId}
                  onClick={() => {
                    if (fromBucketId) {
                      cover.mutate({ id: item.id, body: { fromBucketId, date: localAsOf() } });
                    }
                  }}
                >
                  Cover
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </SidePanel>
  );
}
