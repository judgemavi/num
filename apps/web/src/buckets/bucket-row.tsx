import type { Bucket } from "@num/shared";
import { useArchiveBucket } from "@/api/buckets";
import { useBucketFigures } from "@/buckets/use-bucket-figures";
import { BucketGlyph } from "@/buckets/icons";
import { BucketBar } from "@/buckets/bucket-bar";
import { PauseMenuItem } from "@/buckets/pause-menu-item";
import { Amount } from "@/components/amount";
import { ArchiveMenuItem } from "@/components/archive-menu-item";
import { IconTile } from "@/components/icon-tile";
import { ListRow, listAmt, listMid, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useEditors } from "@/editors/editor-api";

/** One bucket of the list. The row opens the editors of the bucket and archives or restores the bucket. */
export function BucketRow({ bucket }: { bucket: Bucket }) {
  const { openEditor } = useEditors();
  const archive = useArchiveBucket();
  const { target, detail, label } = useBucketFigures(bucket);
  const over = bucket.balance < 0;

  return (
    <>
      <ListRow onOpen={() => void openEditor("bucket", { id: bucket.id })}>
        <IconTile hue={bucket.color}>
          <BucketGlyph name={bucket.icon} />
        </IconTile>
        <div className={listName}>
          {bucket.name}
          {bucket.pausedAt ? <Badge variant="neutral">Paused</Badge> : null}
          <small>{detail}</small>
        </div>
        <div className={listMid}>
          <BucketBar hue={bucket.color} balance={bucket.balance} target={target} label={label} />
        </div>
        <div className={`${listAmt} ${over ? "text-attn" : ""}`}>
          {over ? (
            <>
              Over by <Amount value={-bucket.balance} />
            </>
          ) : bucket.kind === "spending" ? (
            <>
              <Amount value={bucket.balance} /> left
              <small>of <Amount value={target} /></small>
            </>
          ) : (
            <>
              <Amount value={bucket.balance} />
              <small>of <Amount value={target} /></small>
            </>
          )}
        </div>
        <RowMenu label={`Actions for ${bucket.name}`}>
          {bucket.archivedAt ? null : (
            <>
              <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("assignMoney", { bucketId: bucket.id, kind: "fund" })}>
                Fund from Unassigned
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("assignMoney", { bucketId: bucket.id, kind: "release" })}>
                Release to Unassigned
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("moveMoney", { fromId: bucket.id })}>
                Move money
              </DropdownMenuItem>
              <PauseMenuItem bucket={bucket} />
            </>
          )}
          <ArchiveMenuItem
            archived={bucket.archivedAt !== null}
            question={(restore) => ({
              title: restore ? "Restore this bucket?" : "Archive this bucket?",
              description: restore
                ? "The bucket returns to the active list. Its categories are not put back."
                : "The balance must be zero. Categories leave this bucket. You can restore the bucket later.",
              confirmLabel: restore ? "Restore" : "Archive",
            })}
            onConfirm={(restore) => archive.mutate({ id: bucket.id, restore })}
          />
        </RowMenu>
      </ListRow>
    </>
  );
}
