import type { Bucket } from "@num/shared";
import { usePauseBucket } from "@/api/buckets";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** "Pause" or "Resume" in the row menu of a bucket. A paused bucket keeps its balance and the fill does not fund it. */
export function PauseMenuItem({ bucket }: { bucket: Bucket }) {
  const pause = usePauseBucket();
  const paused = bucket.pausedAt !== null;
  return (
    <DropdownMenuItem className="min-h-11" onSelect={() => pause.mutate({ id: bucket.id, resume: paused })}>
      {paused ? "Resume" : "Pause"}
    </DropdownMenuItem>
  );
}
