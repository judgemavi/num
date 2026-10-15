import { billFillsOn, type Bucket } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { billNeedsQuery, useArchiveBucket } from "@/api/buckets";
import { scheduleSignalsQuery } from "@/api/schedules";
import { localAsOf } from "@/as-of";
import { BucketBar } from "@/buckets/bucket-bar";
import { barLabel } from "@/buckets/format";
import { BucketGlyph } from "@/buckets/icons";
import { PauseMenuItem } from "@/buckets/pause-menu-item";
import { Amount } from "@/components/amount";
import { ArchiveMenuItem } from "@/components/archive-menu-item";
import { IconTile } from "@/components/icon-tile";
import { ListRow, listAmt, listMid, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useEditors } from "@/editors/editor-api";
import { useBookCurrency } from "@/editors/lookups";
import { formatDate } from "@/transactions/format";

/**
 * One bill (a commitment) of the Buckets list: the next due date, and how much of the next payment the balance holds.
 * When the payment is due in the next 30 days and the balance is less, Unassigned covers the gap in fill order. The row
 * shows the part that Unassigned does not cover ("short"), else the date when the fill gives the covered part.
 */
export function BillRow({ bucket }: { bucket: Bucket }) {
  const { openEditor } = useEditors();
  const archive = useArchiveBucket();
  const currency = useBookCurrency();
  const asOf = localAsOf();
  const { data: needs } = useSuspenseQuery(billNeedsQuery(asOf));
  const { data: signals } = useSuspenseQuery(scheduleSignalsQuery(asOf));
  const need = needs.find((item) => item.bucketId === bucket.id);
  const amount = need?.amount ?? 0;
  const changed = signals.changed.some((item) => item.bucketId === bucket.id);
  const over = bucket.balance < 0;

  return (
    <ListRow onOpen={() => void openEditor("commitment", { id: bucket.id })}>
      <IconTile hue={bucket.color}>
        <BucketGlyph name={bucket.icon} />
      </IconTile>
      <div className={listName}>
        {bucket.name}
        {bucket.pausedAt ? <Badge variant="neutral">Paused</Badge> : null}
        {changed ? <Badge variant="attention">Amount changed</Badge> : null}
        <small>{need ? `Due ${formatDate(need.dueDate)}` : "No next payment"}</small>
      </div>
      <div className={listMid}>
        <BucketBar hue={bucket.color} balance={bucket.balance} target={amount} label={barLabel(bucket, currency, amount)} />
      </div>
      <div className={`${listAmt} ${over ? "text-attn" : ""}`}>
        {over ? (
          <>
            Over by <Amount value={-bucket.balance} />
          </>
        ) : (
          <Amount value={bucket.balance} />
        )}
        <small>
          of <Amount value={amount} />
        </small>
        {need && need.short > 0 ? (
          <small className="text-attn">
            <Amount value={need.short} /> short
          </small>
        ) : need && need.covered > 0 ? (
          <small>Fills {formatDate(billFillsOn(need.dueDate, asOf))}</small>
        ) : null}
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
            <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("skipNext", { bucketId: bucket.id })}>
              Skip next
            </DropdownMenuItem>
            <PauseMenuItem bucket={bucket} />
          </>
        )}
        <ArchiveMenuItem
          archived={bucket.archivedAt !== null}
          question={(restore) => ({
            title: restore ? "Restore this bill?" : "Archive this bill?",
            description: restore
              ? `Restore ${bucket.name}. It returns to the active list.`
              : `Archive ${bucket.name}. The balance must be zero. It leaves the active list. You can restore it later.`,
            confirmLabel: restore ? "Restore" : "Archive",
          })}
          onConfirm={(restore) => archive.mutate({ id: bucket.id, restore })}
        />
      </RowMenu>
    </ListRow>
  );
}
