import type { UpcomingList } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { upcomingQuery, useRestoreOccurrence, useUnlinkOccurrence } from "@/api/schedules";
import { localAsOf } from "@/as-of";
import { useEditors } from "@/editors/editor-api";
import { useActiveSchedules } from "@/editors/lookups";
import { formatDate } from "@/transactions/format";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";

type UpcomingItem = UpcomingList["items"][number];

function statusText(item: UpcomingItem) {
  if (item.status === "linked") {
    return "Linked";
  }
  if (item.status === "skipped") {
    return item.reason ? `Skipped: ${item.reason}` : "Skipped";
  }
  if (item.status === "changed") {
    return "Amount changed";
  }
  return null;
}

/** The occurrences of all active schedules in the next 30 days (decision 0055). */
export function UpcomingOccurrences() {
  return (
    <Boundary loading="Loading upcoming." failed="Upcoming did not load.">
      <UpcomingRows />
    </Boundary>
  );
}

function UpcomingRows() {
  const asOf = localAsOf();
  const { data: upcoming } = useSuspenseQuery(upcomingQuery(asOf));
  const schedules = useActiveSchedules();
  const { openEditor } = useEditors();
  const unlink = useUnlinkOccurrence();
  const restore = useRestoreOccurrence();

  return (
    <ListCard label="Upcoming" title="Next 30 days">
      {upcoming.items.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">Nothing in the next 30 days.</p> : null}
      {upcoming.items.map((item) => {
        const schedule = schedules.find((row) => row.id === item.bucketId);
        const name = schedule?.name ?? "";
        const note = statusText(item);
        return (
          <ListRow
            key={`${item.bucketId}|${item.dueDate}`}
            onOpen={schedule ? () => void openEditor(schedule.kind, { id: item.bucketId }) : undefined}
          >
            <div className={listName}>
              {name}
              <small>
                {formatDate(item.dueDate)}
                {note ? ` · ${note}` : null}
              </small>
            </div>
            <Amount value={item.actualAmount ?? item.forecastAmount} />
            <RowMenu label={`Actions for ${name} on ${formatDate(item.dueDate)}`}>
              {item.transactionId ? (
                <DropdownMenuItem className="min-h-11" onSelect={() => unlink.mutate({ bucketId: item.bucketId, dueDate: item.dueDate })}>
                  Remove link
                </DropdownMenuItem>
              ) : item.status === "skipped" ? (
                <DropdownMenuItem className="min-h-11" onSelect={() => restore.mutate({ bucketId: item.bucketId, dueDate: item.dueDate })}>
                  Restore
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem
                    className="min-h-11"
                    onSelect={() => void openEditor("linkOccurrence", { bucketId: item.bucketId, accountId: item.accountId, dueDate: item.dueDate })}
                  >
                    Link a transaction
                  </DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("skipOccurrence", { bucketId: item.bucketId, dueDate: item.dueDate })}>
                    Skip
                  </DropdownMenuItem>
                </>
              )}
            </RowMenu>
          </ListRow>
        );
      })}
    </ListCard>
  );
}
