import type { CheckpointCreate, Clearance } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

export function checkpointListQuery(accountId: string) {
  return queryOptions({
    queryKey: ["checkpoints", accountId],
    queryFn: async () => (await unwrap(api.accounts[":id"].checkpoints.$get({ param: { id: accountId } }))).items,
  });
}

/** The closing date and the closing balance of the last imported statement. */
export function closingHintQuery(accountId: string) {
  return queryOptions({
    queryKey: ["closing", accountId],
    queryFn: () => unwrap(api.accounts[":id"].closing.$get({ param: { id: accountId } })),
  });
}

/** Compare a statement balance with the book. This does not save a checkpoint. */
export function useCompareCheckpoint() {
  return useMutation({
    mutationFn: ({ accountId, body }: { accountId: string; body: CheckpointCreate }) =>
      unwrap(api.accounts[":id"].checkpoints.compare.$post({ param: { id: accountId }, json: body })),
  });
}

export function useCreateCheckpoint() {
  return useMutation({
    mutationFn: ({ accountId, body }: { accountId: string; body: CheckpointCreate }) =>
      unwrap(api.accounts[":id"].checkpoints.$post({ param: { id: accountId }, json: body })),
  });
}

export function useUnlockCheckpoint() {
  return useMutation({
    mutationFn: ({ accountId, checkpointId }: { accountId: string; checkpointId: string }) =>
      unwrap(api.accounts[":id"].checkpoints[":checkpointId"].unlock.$post({ param: { id: accountId, checkpointId } })),
  });
}

/** Mark transactions of an account as cleared or open. */
export function useMarkClearance() {
  return useMutation({
    mutationFn: ({ accountId, body }: { accountId: string; body: Clearance }) =>
      unwrap(api.accounts[":id"].clearance.$post({ param: { id: accountId }, json: body })),
  });
}
