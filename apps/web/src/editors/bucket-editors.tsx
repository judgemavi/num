import { usePrefetchQuery, useSuspenseQuery } from "@tanstack/react-query";
import { hasSchedule } from "@num/shared";
import { bucketOptionsQuery, bucketQuery } from "@/api/buckets";
import { AssignMoney } from "@/buckets/assign-money";
import { BucketForm } from "@/buckets/bucket-form";
import type { EditorInput } from "@/editors/editor-types";
import { ScheduleForm } from "@/schedules/schedule-form";

export function BucketEditor({ id }: EditorInput["bucket"]) {
  // The form reads this list. The read starts here, thus it does not wait for the read of the bucket.
  usePrefetchQuery(bucketOptionsQuery());
  if (id === null) {
    return <BucketForm draft="new" />;
  }
  return <SavedBucket id={id} />;
}

function SavedBucket({ id }: { id: string }) {
  const { data: bucket } = useSuspenseQuery(bucketQuery(id));
  // A link with the id of a commitment or an income opens the form of that kind.
  return hasSchedule(bucket.kind) ? <ScheduleForm kind={bucket.kind} draft={bucket} /> : <BucketForm draft={bucket} />;
}

export function AssignEditor({ bucketId, kind }: EditorInput["assignMoney"]) {
  const { data: bucket } = useSuspenseQuery(bucketQuery(bucketId));
  return <AssignMoney bucket={bucket} kind={kind} />;
}
