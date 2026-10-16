import type { Bucket } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useArchiveBucket } from "@/api/buckets";
import { scheduleSignalsQuery } from "@/api/schedules";
import { localAsOf } from "@/as-of";
import { BucketGlyph } from "@/buckets/icons";
import { Amount } from "@/components/amount";
import { ArchiveMenuItem } from "@/components/archive-menu-item";
import { IconTile } from "@/components/icon-tile";
import { ListRow, ListTitle, listAmt, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useEditors } from "@/editors/editor-api";
import { scheduleLabel } from "@/schedules/format";

/** One income of the Buckets list. An income holds no money, thus its row has no balance and no bar. */
export function IncomeRow({ bucket }: { bucket: Bucket }) {
  const { openEditor } = useEditors();
  const archive = useArchiveBucket();
  const { data: signals } = useSuspenseQuery(scheduleSignalsQuery(localAsOf()));
  const schedule = bucket.schedule;
  if (!schedule) {
    return null;
  }
  const changed = signals.changed.some((item) => item.bucketId === bucket.id);

  return (
    <ListRow
      label={bucket.name}
      onOpen={() => void openEditor("income", { id: bucket.id })}
      menu={
        <RowMenu label={`Actions for ${bucket.name}`}>
          {bucket.archivedAt ? null : (
            <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("skipNext", { bucketId: bucket.id })}>
              Skip next
            </DropdownMenuItem>
          )}
          <ArchiveMenuItem
            archived={bucket.archivedAt !== null}
            noun="income" name={bucket.name}
            onConfirm={(restore) => archive.mutate({ id: bucket.id, restore })}
          />
        </RowMenu>
      }
    >
      <IconTile hue={bucket.color}>
        <BucketGlyph name={bucket.icon} />
      </IconTile>
      <div className={listName}>
        <ListTitle
          name={bucket.name}
          badges={changed ? <Badge variant="attention">Amount changed</Badge> : null}
          amount={<Amount value={schedule.expectedAmount} />}
        />
        <small>{scheduleLabel(schedule)}</small>
      </div>
      <div className={listAmt}>
        <Amount value={schedule.expectedAmount} />
      </div>
    </ListRow>
  );
}
