import type { BucketEvent } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { bucketEventsQuery, useUndoBucketEvent } from "@/api/buckets";
import { errorCode } from "@/api/client";
import { bucketError, formatDate } from "@/buckets/format";
import { useBucketBoard } from "@/buckets/use-board";
import { useEditors } from "@/editors/editor-api";
import { useBucketNames } from "@/editors/lookups";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

const kindLabel = {
  fund: "Fund",
  move: "Move",
  release: "Release",
} as const;

export function ActivityList() {
  return (
    <Boundary loading="Loading activity." failed="The activity did not load.">
      <Activity />
    </Boundary>
  );
}

function Activity() {
  const { confirm } = useEditors();
  // The active buckets and the buckets of the list on the screen have a name here. The archived list adds the archived buckets.
  const activeNames = useBucketNames();
  const shown = useBucketBoard().board.items;
  const nameOf = (id: string) => activeNames.get(id) ?? shown.find((bucket) => bucket.id === id)?.name ?? "Bucket";
  const { data: events } = useSuspenseQuery(bucketEventsQuery());
  const undoEvent = useUndoBucketEvent();

  async function undo(event: BucketEvent) {
    const ok = await confirm({
      title: `Undo this ${kindLabel[event.kind].toLowerCase()}?`,
      description: "The money goes back. The event stays in the record.",
      confirmLabel: "Undo",
    });
    if (ok) {
      undoEvent.mutate({ bucketId: event.bucketId, eventId: event.id });
    }
  }

  return (
    <>
      {undoEvent.error ? (
        <p role="alert" className="text-sm text-attn">
          {bucketError(errorCode(undoEvent.error))}
        </p>
      ) : null}
      <ListCard label="Activity">
        {events.length === 0 ? (
          <p className="px-5 py-5 text-muted-foreground">No activity yet.</p>
        ) : (
          events.map((event) => {
            const from = nameOf(event.bucketId);
            const to = event.otherBucketId ? nameOf(event.otherBucketId) : null;
            const detail =
              event.kind === "move" && to ? `${from} to ${to} · ${formatDate(event.date)}` : `${from} · ${formatDate(event.date)}`;
            return (
              <ListRow key={event.id} simple>
                <div className={listName}>
                  {kindLabel[event.kind]}
                  <small>
                    {detail}
                    {event.fundingRunId ? " · Undo is with the paycheck" : ""}
                  </small>
                </div>
                <div className={listAmt}>
                  <Amount value={event.amount} />
                </div>
                {event.fundingRunId ? null : (
                  <RowMenu label={`Actions for ${kindLabel[event.kind]}`}>
                    <DropdownMenuItem className="min-h-11" onSelect={() => void undo(event)}>
                      Undo
                    </DropdownMenuItem>
                  </RowMenu>
                )}
              </ListRow>
            );
          })
        )}
      </ListCard>
    </>
  );
}
