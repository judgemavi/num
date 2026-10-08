import { bucketEventListSchema, bucketEventSchema, type Bucket, type BucketEvent } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { bucketError, formatDate } from "@/buckets/format";
import { useEditors } from "@/editors/editor-api";
import { apiRequest } from "@/request";
import { Amount } from "@/components/amount";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type ActivityListProps = {
  currency: string;
  buckets: Bucket[];
  onDone: () => void;
};

const kindLabel = {
  fund: "Fund",
  move: "Move",
  release: "Release",
} as const;

export function ActivityList({ currency, buckets, onDone }: ActivityListProps) {
  const { confirm } = useEditors();
  const [error, setError] = useState<string | null>(null);
  const events = useQuery({
    queryKey: ["bucket-events"],
    queryFn: async () => {
      const result = await apiRequest("/api/buckets/events", bucketEventListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items;
    },
  });

  async function undo(event: BucketEvent) {
    const ok = await confirm({
      title: `Undo this ${kindLabel[event.kind].toLowerCase()}?`,
      description: "The money goes back. The event stays in the record.",
      confirmLabel: "Undo",
    });
    if (!ok) {
      return;
    }
    const result = await apiRequest(`/api/buckets/${event.bucketId}/events/${event.id}/undo`, bucketEventSchema, {
      method: "POST",
    });
    if (!result.ok) {
      setError(bucketError(result.code));
      return;
    }
    setError(null);
    await events.refetch();
    onDone();
  }

  if (events.isPending) {
    return <p className="text-muted-foreground">Loading activity.</p>;
  }
  if (events.isError || !events.data) {
    return (
      <div className="grid gap-3">
        <p>The activity did not load.</p>
        <Button type="button" onClick={() => void events.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const names = new Map(buckets.map((bucket) => [bucket.id, bucket.name]));

  return (
    <>
      {error ? (
        <p role="alert" className="text-sm text-attn">
          {error}
        </p>
      ) : null}
      <ListCard label="Activity">
        {events.data.length === 0 ? (
          <p className="px-5 py-5 text-muted-foreground">No activity yet.</p>
        ) : (
          events.data.map((event) => {
            const from = names.get(event.bucketId) ?? "Bucket";
            const to = event.otherBucketId ? (names.get(event.otherBucketId) ?? "Bucket") : null;
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
                  <Amount currency={currency} minor={event.amount} />
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
