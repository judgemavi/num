import type { Bucket } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useArchiveBucket } from "@/api/buckets";
import { scheduleSignalsQuery } from "@/api/schedules";
import { localAsOf } from "@/as-of";
import { BucketGlyph } from "@/buckets/icons";
import { Amount } from "@/components/amount";
import { ArchiveMenuItem } from "@/components/archive-menu-item";
import { IconTile } from "@/components/icon-tile";
import { ListRow, listAmt, listName } from "@/components/list-card";
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
    <ListRow label={bucket.name} onOpen={() => void openEditor("income", { id: bucket.id })}>
      <IconTile hue={bucket.color}>
        <BucketGlyph name={bucket.icon} />
      </IconTile>
      <div className={listName}>
        {bucket.name}
        {changed ? <Badge variant="attention">Amount changed</Badge> : null}
        <small>{scheduleLabel(schedule)}</small>
      </div>
      <div className={listAmt}>
        <Amount value={schedule.expectedAmount} />
      </div>
      <RowMenu label={`Actions for ${bucket.name}`}>
        {bucket.archivedAt ? null : (
          <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("skipNext", { bucketId: bucket.id })}>
            Skip next
          </DropdownMenuItem>
        )}
        <ArchiveMenuItem
          archived={bucket.archivedAt !== null}
          question={(restore) => ({
            title: restore ? "Restore this income?" : "Archive this income?",
            description: restore
              ? `Restore ${bucket.name}. It returns to the active list.`
              : `Archive ${bucket.name}. It leaves the active list. You can restore it later.`,
            confirmLabel: restore ? "Restore" : "Archive",
          })}
          onConfirm={(restore) => archive.mutate({ id: bucket.id, restore })}
        />
      </RowMenu>
    </ListRow>
  );
}
