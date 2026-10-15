import type { Bucket } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useArchiveBucket } from "@/api/buckets";
import { fundingOwedQuery } from "@/api/funding";
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
import { useBookCurrency } from "@/editors/lookups";
import { formatMoney } from "@/money";
import { scheduleLabel } from "@/schedules/format";

/**
 * One commitment or income of the Buckets list. An income holds no money, thus its row has no balance and no bar.
 * A commitment shows what it still owes for this month.
 */
export function ScheduleRow({ bucket }: { bucket: Bucket }) {
  const { openEditor } = useEditors();
  const archive = useArchiveBucket();
  const currency = useBookCurrency();
  const asOf = localAsOf();
  const { data: signals } = useSuspenseQuery(scheduleSignalsQuery(asOf));
  const { data: owed } = useSuspenseQuery(fundingOwedQuery(asOf));
  const schedule = bucket.schedule;
  if (!schedule || (bucket.kind !== "commitment" && bucket.kind !== "income")) {
    return null;
  }
  const kind = bucket.kind;
  const changed = signals.changed.some((item) => item.bucketId === bucket.id);
  const still = owed.items.find((item) => item.bucketId === bucket.id)?.owed ?? 0;
  const detail = still > 0 ? `${scheduleLabel(schedule)} · ${owed.held ? "Funding undone this month" : `Still owed ${formatMoney(currency, still)} this month`}` : scheduleLabel(schedule);

  return (
    <ListRow onOpen={() => void openEditor(kind, { id: bucket.id })}>
      <IconTile hue={bucket.color}>
        <BucketGlyph name={bucket.icon} />
      </IconTile>
      <div className={listName}>
        {bucket.name}
        {bucket.essential ? <Badge variant="neutral">Essential</Badge> : null}
        {schedule.payday ? <Badge variant="neutral">Payday</Badge> : null}
        {changed ? <Badge variant="attention">Amount changed</Badge> : null}
        <small>{detail}</small>
      </div>
      <div className={`${listAmt} ${kind === "commitment" && bucket.balance < 0 ? "text-attn" : ""}`}>
        <Amount value={schedule.expectedAmount} />
        {kind === "commitment" ? (
          <small>
            {bucket.balance < 0 ? "Over by " : "Saved "}
            <Amount value={Math.abs(bucket.balance)} />
          </small>
        ) : null}
      </div>
      <RowMenu label={`Actions for ${bucket.name}`}>
        {bucket.archivedAt ? null : (
          <>
            {kind === "commitment" ? (
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
              </>
            ) : null}
            <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("skipNext", { bucketId: bucket.id })}>
              Skip next
            </DropdownMenuItem>
          </>
        )}
        <ArchiveMenuItem
          archived={bucket.archivedAt !== null}
          question={(restore) => ({
            title: restore ? `Restore this ${kind}?` : `Archive this ${kind}?`,
            description: restore
              ? `Restore ${bucket.name}. It returns to the active list.`
              : `Archive ${bucket.name}. ${kind === "commitment" ? "The balance must be zero. " : ""}It leaves the active list. You can restore it later.`,
            confirmLabel: restore ? "Restore" : "Archive",
          })}
          onConfirm={(restore) => archive.mutate({ id: bucket.id, restore })}
        />
      </RowMenu>
    </ListRow>
  );
}
