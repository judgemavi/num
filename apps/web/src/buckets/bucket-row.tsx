import type { Bucket } from "@num/shared";
import { barLabel, bucketDetail, bucketTarget } from "@/buckets/format";
import { BucketGlyph } from "@/buckets/icons";
import { BucketBar } from "@/buckets/bucket-bar";
import { Amount } from "@/components/amount";
import { type Hue } from "@/components/hue";
import { IconTile } from "@/components/icon-tile";
import { ListRow, listAmt, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function BucketRow({
  bucket,
  currency,
  onOpen,
  onMove,
  onFund,
  onRelease,
  onArchive,
}: {
  bucket: Bucket;
  currency: string;
  onOpen: () => void;
  onMove: () => void;
  onFund: () => void;
  onRelease: () => void;
  onArchive: () => void;
}) {
  const over = bucket.balance < 0;
  const target = bucketTarget(bucket);
  return (
    <ListRow onOpen={onOpen}>
      <IconTile hue={bucket.color as Hue}>
        <BucketGlyph name={bucket.icon} />
      </IconTile>
      <div className={listName}>
        {bucket.name}
        {bucket.essential ? <Badge variant="neutral">Essential</Badge> : null}
        <small>{bucketDetail(bucket, currency)}</small>
      </div>
      <div className="w-36 shrink-0 max-md:basis-full">
        <BucketBar hue={bucket.color as Hue} balance={bucket.balance} target={target} label={barLabel(bucket, currency)} />
      </div>
      <div className={`${listAmt} ${over ? "text-attn" : ""}`}>
        {over ? (
          <>
            Over by <Amount currency={currency} minor={-bucket.balance} />
          </>
        ) : bucket.kind === "spending" ? (
          <>
            <Amount currency={currency} minor={bucket.balance} /> left
            <small>of <Amount currency={currency} minor={target} /></small>
          </>
        ) : (
          <>
            <Amount currency={currency} minor={bucket.balance} />
            <small>of <Amount currency={currency} minor={target} /></small>
          </>
        )}
      </div>
      <RowMenu label={`Actions for ${bucket.name}`}>
        {bucket.archivedAt ? null : (
          <>
            <DropdownMenuItem className="min-h-11" onSelect={onFund}>
              Fund from Unassigned
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onSelect={onRelease}>
              Release to Unassigned
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onSelect={onMove}>
              Move money
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem className="min-h-11" onSelect={onArchive}>
          {bucket.archivedAt ? "Restore" : "Archive"}
        </DropdownMenuItem>
      </RowMenu>
    </ListRow>
  );
}
