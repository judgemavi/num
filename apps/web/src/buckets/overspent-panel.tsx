import type { Bucket, OverspentBucket } from "@num/shared";
import { Amount } from "@/components/amount";
import { SidePanel } from "@/components/side-panel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type OverspentPanelProps = {
  currency: string;
  items: OverspentBucket[];
  pool: Bucket[];
  coverFrom: Record<string, string>;
  onCoverFrom: (id: string, bucketId: string) => void;
  onCover: (id: string) => void;
};

export function OverspentPanel({ currency, items, pool, coverFrom, onCoverFrom, onCover }: OverspentPanelProps) {
  return (
    <SidePanel title="Overspent" text="Move money from another bucket to cover it.">
      {items.length === 0 ? <p className="text-sm text-muted-foreground">No bucket is overspent.</p> : null}
      {items.map((item) => {
        const need = -item.balance;
        const options = pool.filter((bucket) => bucket.id !== item.id && bucket.balance >= need);
        return (
          <div key={item.id} className="grid gap-2 border-t pt-3 first:border-t-0 first:pt-0">
            <p className="font-semibold">
              {item.name}
              <span className="mt-0.5 block text-sm font-normal text-attn">
                Over by <Amount currency={currency} minor={need} />
              </span>
            </p>
            {options.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other bucket can cover this.</p>
            ) : (
              <div className="grid gap-2">
                <Select value={coverFrom[item.id]} onValueChange={(value) => onCoverFrom(item.id, value)}>
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
                <Button type="button" disabled={!coverFrom[item.id]} onClick={() => onCover(item.id)}>
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
